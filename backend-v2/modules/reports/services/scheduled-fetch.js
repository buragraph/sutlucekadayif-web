import { supabase } from '../../../config/supabase.js';
import { getSettings, upsertGoogleToplanlar } from '../db.js';
import { campaignBasedImport } from './meta-api.js';
import { loadGoogleMappings, fetchLocationMetrics, isGoogleConnected } from './google-business.js';
import { bugunStr, gunFarki, tarihObj } from './date-utils.js';

// Dönem bitişinden sonra kaç gün boyunca (gecikmeli harcama için) çekim tekrarlansın.
// Meta, kapanan pencerenin harcamasını birkaç gün sonra yukarı revize edebildiği için
// (geç atıflar) pencereyi geniş tutuyoruz; her gün tekrar çekilir, son çekim nihai olur.
const GRACE_DAYS = 7;

/**
 * Tek bir dönem için tüm şubelerin Meta + Google verisini çeker.
 */
async function donemCek(since, until) {
  const sonuc = { since, until, meta: false, google: 0, hata: [] };
  const settings = await getSettings().catch(() => ({}));

  // ── Meta (kampanya eşleştirmeli — tek çağrı tüm şubeleri kapsar) ──
  if (settings?.metaApiToken) {
    try {
      await campaignBasedImport(settings.metaApiToken, since, until);
      sonuc.meta = true;
    } catch (e) { sonuc.hata.push('meta: ' + e.message); }
  } else {
    sonuc.hata.push('meta: token yok');
  }

  // ── Google (her eşleşmiş konum için ayrı) ──
  try {
    if (await isGoogleConnected()) {
      const mappings = await loadGoogleMappings();
      // Şube varlık kontrolü tek sorguda
      const kodlar = [...new Set(Object.values(mappings || {}).filter((k) => k && k !== '__atla__'))];
      const { data: subeSatirlari } = kodlar.length
        ? await supabase.from('subeler').select('kod').in('kod', kodlar)
        : { data: [] };
      const mevcutKodlar = new Set((subeSatirlari || []).map((s) => s.kod));
      for (const [locationName, subeKod] of Object.entries(mappings || {})) {
        if (!subeKod || subeKod === '__atla__' || !mevcutKodlar.has(subeKod)) continue;
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
 * Bütçe kampanyalarından SON GRACE_DAYS içinde BİTEN dönemleri bulur ve çeker.
 * Dönem içinde (henüz bitmemiş) hiçbir şey çekmez.
 */
export async function runScheduledFetch() {
  const bugun = bugunStr();
  const { data: kampanyalar } = await supabase
    .from('kampanyalar').select('donem_baslangic, donem_bitis').range(0, 999);

  // Benzersiz dönemler (bitişi 1..GRACE_DAYS gün önce olanlar)
  const donemler = new Map();
  for (const k of kampanyalar || []) {
    if (!k.donem_baslangic || !k.donem_bitis) continue;
    const fark = gunFarki(k.donem_bitis, bugun); // bugün − bitiş (gün)
    if (fark >= 1 && fark <= GRACE_DAYS) {
      donemler.set(`${k.donem_baslangic}_${k.donem_bitis}`, { since: k.donem_baslangic, until: k.donem_bitis });
    }
  }

  const sonuclar = [];
  for (const d of donemler.values()) {
    console.log(`[Scheduled] Dönem çekiliyor: ${d.since} → ${d.until}`);
    sonuclar.push(await donemCek(d.since, d.until));
  }

  // Kalıcı konfigürasyon eksikleri (token tanımsız, Google bağlı değil) her gün
  // alarm üretmesin diye "gerçek hata" sayılmaz.
  const KONFIG_HATALARI = new Set(['meta: token yok', 'google: bağlı değil']);
  const tumHatalar = sonuclar.flatMap((s) => (s.hata || []).map((h) => `${s.since}→${s.until} ${h}`));
  const gercekHatalar = sonuclar.flatMap((s) => (s.hata || [])).filter((h) => !KONFIG_HATALARI.has(h));
  const hicVeriYok = donemler.size > 0 && sonuclar.every((s) => !s.meta && s.google === 0);
  const kritikHata = hicVeriYok && gercekHatalar.length > 0
    ? `hiçbir veri çekilemedi (${donemler.size} dönem): ${gercekHatalar.join(' | ')}`
    : null;

  return { tarih: bugun, donemSayisi: donemler.size, sonuclar, tumHatalar, kritikHata };
}
