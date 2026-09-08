import { supabase } from '../../../config/supabase.js';
import { veriYaDaHata } from '../../../utils/veri.js';
import { getSettings, upsertGoogleToplanlar, saveSonCekim } from '../db.js';
import { campaignBasedImport } from './meta-api.js';
import { loadGoogleMappings, fetchLocationMetrics, isGoogleConnected } from './google-business.js';
import { bugunStr, gunFarki, tarihObj } from './date-utils.js';

// Dönem bitişinden sonra kaç gün boyunca (gecikmeli harcama için) çekim tekrarlansın.
// Meta, kapanan pencerenin harcamasını birkaç gün sonra yukarı revize edebildiği için
// (geç atıflar) pencereyi geniş tutuyoruz; her gün tekrar çekilir, son çekim nihai olur.
const GRACE_DAYS = 7;

// ── ALT-İSTEK BÜTÇESİ (ücretsiz plan: 50 / Worker çağrısı) ──────────────────
//
// Gece çekimi 90 şubeyi TEK çağrıda işleyemiyordu: şube başına ~4 alt-istek
// (Meta yazımı + tekil erişim sorgusu + Google metriği + Google yazımı) artı
// ~10 sabit maliyet. Ölçüldü: iş 14 şube yazıp "Too many subrequests" ile
// ölüyor, üstelik Meta bütçeyi bitirdiği için Google bloğu HİÇ çalışmıyordu.
// Hata da yakalanıp "kritik" sayılmadığı için sessizce yarım kalıyordu.
//
// Çözüm menü yenilemesindeki desenin aynısı: 04:00 turu işi KUYRUĞA yazar,
// ayrı bir cron turu (5 dakikada bir) kuyruğu dilim dilim eritir. Dilim boyu bütçeden
// türetilir: (50 − ~10 sabit) / 4 ≈ 10 → güvenlik payıyla 8.
const KUYRUK_ANAHTARI = 'cekim_kuyrugu';
const CRON_DILIM = Number(process.env.CEKIM_CRON_DILIM || 8);

/**
 * Kuyruk kaydı: { isler, ozet }.
 *
 * ÖZET NEDEN BURADA: turun sonucu ekranda görünmeli ama kuyruk zaten her
 * turda okunup yazılıyor — sayaçları aynı kayda iliştirmek EK ALT-İSTEK
 * GEREKTİRMİYOR. Ayrı bir kayıt tutulsaydı her tur +2 istek olurdu ve tur
 * bütçesi (~42/50) buna elverişli değil.
 */
async function kuyrukOku() {
  const { data } = await supabase
    .from('ayarlar').select('deger').eq('anahtar', KUYRUK_ANAHTARI).maybeSingle();
  const i = data?.deger?.isler;
  return { isler: Array.isArray(i) ? i : [], ozet: data?.deger?.ozet || null };
}

async function kuyrukYaz(isler, ozet = null) {
  veriYaDaHata(
    await supabase.from('ayarlar').upsert(
      {
        anahtar: KUYRUK_ANAHTARI,
        deger: { isler, ozet, zaman: new Date().toISOString() },
        guncelleme: new Date().toISOString(),
      },
      { onConflict: 'anahtar' }
    ),
    'çekim kuyruğu yazılamadı'
  );
}

// Ekranda gösterilecek hata listesi sınırlı: 90 şube birden patlarsa kayıt
// şişer, kullanıcı da ilk birkaçından fazlasını okumaz.
const HATA_SINIRI = 20;

/**
 * Bir dilimdeki şubelerin Meta + Google verisini çeker.
 * @param {{since: string, until: string, kodlar: string[]}} is
 */
async function dilimCek(is) {
  const { since, until, kodlar } = is;
  const sonuc = { since, until, sube: kodlar.length, meta: 0, google: 0, hata: [] };
  const settings = await getSettings().catch(() => ({}));

  // ── Meta ── dilimdeki şubelerin kampanya/adset'leriyle filtreli tek çağrı
  if (settings?.metaApiToken) {
    try {
      const r = await campaignBasedImport(settings.metaApiToken, since, until, kodlar);
      sonuc.meta = r?.subeSayisi || 0;
    } catch (e) { sonuc.hata.push('meta: ' + e.message); }
  } else {
    sonuc.hata.push('meta: token yok');
  }

  // ── Google ── yalnızca dilimdeki şubelerin eşleşmiş konumları
  try {
    if (await isGoogleConnected()) {
      const mappings = await loadGoogleMappings();
      const kodSet = new Set(kodlar);
      for (const [locationName, subeKod] of Object.entries(mappings || {})) {
        if (!subeKod || subeKod === '__atla__' || !kodSet.has(subeKod)) continue;
        try {
          const m = await fetchLocationMetrics(locationName, tarihObj(since), tarihObj(until));
          await upsertGoogleToplanlar(subeKod, since, until, {
            google_arama: (m.arama_mobil || 0) + (m.arama_masaustu || 0),
            google_harita: (m.harita_mobil || 0) + (m.harita_masaustu || 0),
            google_telefon: m.telefon || 0,
            google_yol_tarifi: m.yol_tarifi || 0,
            google_web_tiklama: m.web_tiklama || 0,
            google_menu_tiklama: m.menu_tiklama || 0,
          });
          sonuc.google++;
        } catch (e) { sonuc.hata.push(`google ${subeKod}: ${e.message}`); }
      }
    } else {
      sonuc.hata.push('google: bağlı değil');
    }
  } catch (e) { sonuc.hata.push('google: ' + e.message); }

  return sonuc;
}

/**
 * Kuyruktan BİR dilim işler. Beş dakikalık cron turu çağırır.
 * Dilim başarısız olsa da kuyruktan DÜŞER: aynı dilimde takılıp kuyruğu
 * sonsuza kadar tıkamasın; dönem GRACE_DAYS boyunca her gece yeniden
 * kuyruklandığı için kaçan şube ertesi gece tekrar denenir.
 */
export async function cekimKuyrugunuIsle() {
  const { isler: kuyruk, ozet: oncekiOzet } = await kuyrukOku();
  if (kuyruk.length === 0) return { islenen: 0, kalan: 0 };

  const is = kuyruk[0];
  const dilim = { since: is.since, until: is.until, kodlar: is.kodlar.slice(0, CRON_DILIM) };
  const kalanKodlar = is.kodlar.slice(CRON_DILIM);
  const yeniKuyruk = kalanKodlar.length
    ? [{ ...is, kodlar: kalanKodlar }, ...kuyruk.slice(1)]
    : kuyruk.slice(1);

  // KUYRUK ÇEKİMDEN ÖNCE İLERLETİLİR. Sonra yazılsaydı ve dilim alt-istek
  // bütçesini tüketip ölseydi kuyruk yazımı da başarısız olur, aynı dilim
  // sonsuza kadar tekrar denenir ve kuyruk hiç ilerlemezdi. Bu sırayla en
  // kötü ihtimalle bir dilim o gece atlanır; dönem GRACE_DAYS boyunca her
  // gece yeniden kuyruklandığı için ertesi gece tekrar denenir.
  const kalan = yeniKuyruk.reduce((t, x) => t + x.kodlar.length, 0);
  // Özet dilimden ÖNCE yazılıyor (kuyrukla aynı yazımda): dilim bütçeyi
  // tüketip ölürse bile "şu ana kadar ne oldu" kaydı duruyor.
  const ozet = {
    ...(oncekiOzet || { baslangic: new Date().toISOString(), hedef: 0, islenen: 0, meta: 0, google: 0, hatalar: [] }),
    kalan,
  };
  await kuyrukYaz(yeniKuyruk, ozet);

  const sonuc = await dilimCek(dilim);

  ozet.islenen += dilim.kodlar.length;
  ozet.meta += sonuc.meta || 0;
  ozet.google += sonuc.google || 0;
  ozet.hatalar = [...ozet.hatalar, ...sonuc.hata].slice(0, HATA_SINIRI);
  ozet.kalan = kalan;
  ozet.bitis = new Date().toISOString();

  console.log(`[Cekim] dilim: ${dilim.kodlar.join(',')} | meta=${sonuc.meta} google=${sonuc.google} kalan=${kalan}`);
  if (sonuc.hata.length) console.log('[Cekim] hata:', sonuc.hata.join(' | '));

  if (kalan === 0) {
    // Tur bitti: özet kalıcı kayda geçiyor (ekran burayı okuyor). Yalnızca
    // SON turda bir ek yazım — ara turların bütçesine dokunmuyor.
    await saveSonCekim({ ...ozet, durum: 'bitti' }).catch((e) => console.error('[Cekim] özet yazılamadı:', e.message));
    await kuyrukYaz(yeniKuyruk, null);
  } else {
    await kuyrukYaz(yeniKuyruk, ozet);
  }

  return { islenen: dilim.kodlar.length, kalan, sonuc };
}

/**
 * '0 4 * * *' turu: SON GRACE_DAYS içinde BİTEN dönemleri bulur ve o dönemler
 * için çekilecek şubeleri kuyruğa yazar. Kendisi veri ÇEKMEZ — 90 şubelik iş
 * tek çağrının alt-istek bütçesine sığmıyor (bkz. yukarıdaki not).
 *
 * Kuyruğa yalnızca o dönemde veri ÜRETEBİLECEK şubeler girer:
 * Meta ya da Google eşlemesi olan VE dönem başlangıcında henüz açık olanlar.
 */
export async function runScheduledFetch() {
  const bugun = bugunStr();
  const { data: kampanyalar } = await supabase
    .from('kampanyalar').select('donem_baslangic, donem_bitis').range(0, 999);

  const donemler = new Map();
  for (const k of kampanyalar || []) {
    if (!k.donem_baslangic || !k.donem_bitis) continue;
    const fark = gunFarki(k.donem_bitis, bugun); // bugün − bitiş (gün)
    if (fark >= 1 && fark <= GRACE_DAYS) {
      donemler.set(`${k.donem_baslangic}_${k.donem_bitis}`, { since: k.donem_baslangic, until: k.donem_bitis });
    }
  }
  if (donemler.size === 0) {
    return { tarih: bugun, donemSayisi: 0, kuyruklanan: 0, kritikHata: null };
  }

  // Eşlemesi olan şube kodları (Meta kampanya/adset + Google konum)
  const [{ data: subeSatirlari }, settings, googleMap] = await Promise.all([
    supabase.from('subeler').select('kod, kapanma_tarihi').range(0, 9999),
    getSettings().catch(() => ({})),
    loadGoogleMappings().catch(() => ({})),
  ]);
  const { getCampaignMappings, getAdsetMappings } = await import('../db.js');
  const [camp, adset] = await Promise.all([
    getCampaignMappings().catch(() => ({})),
    getAdsetMappings().catch(() => ({})),
  ]);
  const kod = (v) => (typeof v === 'object' ? v?.sube : v);
  const eslesen = new Set([
    ...Object.values(camp || {}).map(kod),
    ...Object.values(adset || {}).map(kod),
    ...Object.values(googleMap || {}),
  ].filter((k) => k && k !== '__atla__'));

  const isler = [];
  for (const d of donemler.values()) {
    // Kapanan şube: dönem BAŞLANGICI kapanıştan sonraysa kuyruğa hiç girmez
    // (aynı kural meta-api.js içinde de var — bkz. `kapaliDonem`).
    const kodlar = (subeSatirlari || [])
      .filter((s) => eslesen.has(s.kod))
      .filter((s) => !s.kapanma_tarihi || d.since <= s.kapanma_tarihi)
      .map((s) => s.kod);
    if (kodlar.length) isler.push({ since: d.since, until: d.until, kodlar });
  }

  const kuyruklanan = isler.reduce((t, x) => t + x.kodlar.length, 0);
  await kuyrukYaz(isler, {
    baslangic: new Date().toISOString(),
    hedef: kuyruklanan,
    donemler: [...donemler.values()].map((d) => `${d.since}_${d.until}`),
    islenen: 0, meta: 0, google: 0, hatalar: [], kalan: kuyruklanan,
  });
  console.log(`[Cekim] ${donemler.size} dönem, ${kuyruklanan} şube kuyruğa alındı (dilim ${CRON_DILIM}).`);

  // Token/bağlantı gibi kalıcı konfigürasyon eksikleri her gece alarm üretmesin.
  const kritikHata = !settings?.metaApiToken && Object.keys(googleMap || {}).length === 0
    ? 'ne Meta token\'ı ne Google eşlemesi var — çekim yapılamaz'
    : null;
  return { tarih: bugun, donemSayisi: donemler.size, kuyruklanan, dilim: CRON_DILIM, kritikHata };
}
