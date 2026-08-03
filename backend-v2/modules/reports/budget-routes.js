import { Router } from '../../shared/router.js';
import { dosyaAl } from '../../shared/dosya.js';
import { supabase } from '../../config/supabase.js';
import { verifyToken, requirePermission } from '../../middleware/auth.js';
import { uploadFile, deleteFile, urlToKey } from '../../config/r2.js';
import { upsertButce, getAllSubeler, getSubeByKod, getDonemVeri, getDonemVeriMap, getSettings } from './db.js';
import { invalidateReportCache } from './services/report-data.js';
import { invalidateCache } from '../../middleware/cache.js';
import { campaignBasedImport } from './services/meta-api.js';
import { veriYaDaHata, isoZ } from '../../utils/veri.js';
import { bugunStr } from './services/date-utils.js';

const router = Router();

const MAX_KAMPANYA = 6;

// ── Doğrulama yardımcıları (eski dosyayla birebir) ──

const TAVAN_TUTAR = 10_000_000;
const BAKIYE_EPSILON = 0.01;

function isGecerliTutar(deger, { min = 0, max = TAVAN_TUTAR } = {}) {
  const n = Number(deger);
  return Number.isFinite(n) && n >= min && n <= max;
}

// Seçilen bakiye, kampanyanın sunduğu menü seçeneklerinden biri mi?
function bakiyeMenudeVarMi(deger, bakiyeSecenekleri) {
  const n = Number(deger);
  if (!Number.isFinite(n)) return false;
  return Array.isArray(bakiyeSecenekleri) && bakiyeSecenekleri.some(
    (o) => Math.abs(Number(o?.bakiye) - n) < BAKIYE_EPSILON
  );
}

const TARIH_REGEX = /^\d{4}-\d{2}-\d{2}$/;
function isGecerliTarih(str) {
  if (typeof str !== 'string' || !TARIH_REGEX.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

// Dekont dosyasının depolanan Content-Type'ı UZANTIDAN türetilir — istemcinin
// gönderdiği (sahtelenebilir) mimetype'a asla güvenilmez.
const DEKONT_CONTENT_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

const DEKONT_AL = dosyaAl('dekont', {
  uzantilar: ['.pdf', '.jpg', '.jpeg', '.png'],
  enBoy: 5 * 1024 * 1024,
  hataMesaji: 'Sadece PDF, JPG, JPEG ve PNG dosyaları kabul edilir.',
});

// Boş "bekliyor" yanıt kaydı — tek kaynak
const bosYanit = () => ({
  durum: 'bekliyor',
  secilen_bakiye: null,
  kdv_dahil_tutar: null,
  notlar: null,
  dekont_url: null,
  gonderim_tarihi: null,
});

// ── Satır ↔ eski kampanya nesnesi ──
// Firestore'da tek `reports/butce` dokümanının `kampanyalar` haritasıydı; artık
// her kampanya bir satır. API şekli korunuyor.

function kampanyaNesnesi(satir) {
  return {
    baslik: satir.baslik,
    donem_baslangic: satir.donem_baslangic,
    donem_bitis: satir.donem_bitis,
    son_tarih: satir.son_tarih,
    durum: satir.durum,
    bakiye_secenekleri: satir.bakiye_secenekleri || [],
    iban: satir.iban || '',
    alici_adi: satir.alici_adi || '',
    odeme_notu: satir.odeme_notu || '',
    yanitlar: satir.yanitlar || {},
    createdAt: isoZ(satir.olusturma),
  };
}

/** Tüm kampanyalar — eski `getButceDoc()` şekliyle ({ kampanyalar: {id: {...}} }). */
export async function getButceDoc() {
  const satirlar = veriYaDaHata(
    await supabase.from('kampanyalar').select('*').range(0, 999), 'kampanyalar okunamadı'
  );
  const kampanyalar = {};
  for (const s of satirlar) kampanyalar[s.id] = kampanyaNesnesi(s);
  return { kampanyalar };
}

async function getKampanya(id) {
  const { data } = await supabase.from('kampanyalar').select('*').eq('id', id).maybeSingle();
  return data ? kampanyaNesnesi(data) : null;
}

/** Yanıt haritasına atomik yama (jsonb — bkz. 0005_kampanya_yanit.sql). */
async function yanitYaz(kampanyaId, subeKod, yama, beklenenDurum = null) {
  const { data, error } = await supabase.rpc('kampanya_yanit_yaz', {
    p_id: kampanyaId, p_sube: subeKod, p_yama: yama, p_beklenen_durum: beklenenDurum,
  });
  if (error) throw new Error(error.message);
  return data; // null = guard tutmadı / kampanya yok
}

/** Güncel dönemde bütçesi ONAYLANMIŞ şube kodları (sidebar gruplaması). */
export async function getOnayliSubeKodlari() {
  const satirlar = veriYaDaHata(
    await supabase.from('kampanyalar').select('yanitlar, donem_baslangic')
      .order('donem_baslangic', { ascending: false }).limit(1),
    'kampanyalar okunamadı'
  );
  if (satirlar.length === 0) return [];
  return Object.entries(satirlar[0].yanitlar || {})
    .filter(([, y]) => y?.durum === 'onaylandi')
    .map(([kod]) => kod);
}

// ── Helper: kampanyanın R2 dekontlarını sil ──
async function deleteDekontlar(kampanya) {
  if (!kampanya?.yanitlar) return;
  const promises = [];
  for (const yanit of Object.values(kampanya.yanitlar)) {
    if (yanit.dekont_url) {
      const key = urlToKey(yanit.dekont_url);
      if (key) promises.push(deleteFile(key).catch(() => {}));
    }
  }
  await Promise.all(promises);
}

// ══════════════════════════════════════════════════
// ── ADMIN ENDPOINTS ──
// ══════════════════════════════════════════════════

// POST /butce-kampanya — Yeni kampanya oluştur
router.post(
  '/butce-kampanya',
  verifyToken,
  requirePermission('budget.manage'),
  async (req, res) => {
    try {
      const { baslik, donem_baslangic, donem_bitis, son_tarih, bakiye_secenekleri, iban, alici_adi, odeme_notu } = req.body;

      if (!baslik || !donem_baslangic || !donem_bitis || !son_tarih || !bakiye_secenekleri) {
        return res.status(400).json({ error: 'Zorunlu alanlar eksik.' });
      }
      if (!isGecerliTarih(donem_baslangic) || !isGecerliTarih(donem_bitis) || !isGecerliTarih(son_tarih)) {
        return res.status(400).json({ error: 'Tarih alanları geçerli bir YYYY-MM-DD tarihi olmalıdır.' });
      }
      if (donem_baslangic > donem_bitis) {
        return res.status(400).json({ error: 'Dönem başlangıcı, bitiş tarihinden sonra olamaz.' });
      }

      const subeler = await getAllSubeler();
      const kampanyaId = `${donem_baslangic}_${donem_bitis}`;

      // Yanitlar haritası — tüm şubeler "bekliyor"
      const yanitlar = {};
      for (const sube of subeler) yanitlar[sube.kod] = bosYanit();

      const olusturma = new Date().toISOString();
      const satir = {
        id: kampanyaId,
        baslik,
        donem_baslangic,
        donem_bitis,
        son_tarih,
        durum: 'aktif',
        bakiye_secenekleri,
        iban: iban || '',
        alici_adi: alici_adi || '',
        odeme_notu: odeme_notu || '',
        yanitlar,
        olusturma,
      };

      // "Aynı döneme ait kampanya var mı" kontrolü artık YAPISAL: id birincil
      // anahtar, ikinci insert 23505 ile döner (Firestore'daki TOCTOU penceresi yok).
      const { error } = await supabase.from('kampanyalar').insert(satir);
      if (error) {
        if (error.code === '23505') {
          return res.status(400).json({ error: 'Bu döneme ait bir kampanya zaten var. Önce onu silin veya düzenleyin.' });
        }
        throw new Error(error.message);
      }

      // Tavan aşımı: en eski kampanyayı sil
      const { data: hepsi } = await supabase.from('kampanyalar').select('id, yanitlar, olusturma')
        .order('olusturma', { ascending: true });
      if ((hepsi || []).length > MAX_KAMPANYA) {
        const fazla = hepsi.slice(0, hepsi.length - MAX_KAMPANYA);
        for (const eski of fazla) {
          // R2 temizliği doküman yazımını bloklamasın
          deleteDekontlar({ yanitlar: eski.yanitlar }).catch((e) => console.error('[Budget] Eski kampanya dekont temizliği:', e.message));
          await supabase.from('kampanyalar').delete().eq('id', eski.id);
        }
      }

      res.json({ success: true, kampanyaId, kampanya: kampanyaNesnesi(satir) });
    } catch (err) {
      console.error('[Budget] Kampanya oluşturma hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /butce-kampanya — Tüm kampanyaları listele
router.get(
  '/butce-kampanya',
  verifyToken,
  requirePermission('budget.manage'),
  async (req, res) => {
    try {
      const [doc, subeSatirlari] = await Promise.all([
        getButceDoc(),
        supabase.from('subeler').select('kod').range(0, 9999)
          .then((r) => veriYaDaHata(r, 'şubeler okunamadı')),
      ]);
      const gecerli = new Set(subeSatirlari.map((s) => s.kod));
      const suz = (yanitlar) => {
        const f = {};
        for (const [kod, y] of Object.entries(yanitlar || {})) if (gecerli.has(kod)) f[kod] = y;
        return f;
      };

      const sorted = Object.entries(doc.kampanyalar)
        .sort((a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt))
        .map(([id, data]) => ({ id, ...data, yanitlar: suz(data.yanitlar) }));

      res.json({ kampanyalar: sorted });
    } catch (err) {
      console.error('[Budget] Kampanya listeleme hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Kampanya başına "önceki dönem kalanı" haritası — kısa ömürlü bellek cache'i
// (eskiden veri versiyonuyla damgalanıyordu; v2'de düz TTL)
const oncekiKalanCache = new Map();
const ONCEKI_KALAN_TTL = 60 * 1000;

// GET /butce-kampanya/:id — Tek kampanya detayı (+ şube başına önceki dönem kalanı)
router.get(
  '/butce-kampanya/:id',
  verifyToken,
  requirePermission('budget.manage'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const doc = await getButceDoc();
      const kampanya = doc.kampanyalar?.[id];

      if (!kampanya) {
        return res.status(404).json({ error: 'Kampanya bulunamadı.' });
      }

      // Şube başına önceki dönem kalanı (planlanan + devir + merkez − harcama).
      const simdi = Date.now();
      let cached = oncekiKalanCache.get(id);
      if (!cached || simdi - cached.t > ONCEKI_KALAN_TTL) {
        const onceki_kalanlar = {};
        const sube_adlari = {};
        const devredilenler = {};
        const subeler = await getAllSubeler();
        for (const sube of subeler) {
          sube_adlari[sube.kod] = sube.ad || sube.kod;
          const buDonem = (sube.donem_ozetleri || []).find((d) => d.baslangic === kampanya.donem_baslangic && d.bitis === kampanya.donem_bitis);
          if (buDonem && buDonem.devredilen_miktar) devredilenler[sube.kod] = buDonem.devredilen_miktar;
          const oncekiler = (sube.donem_ozetleri || []).filter((d) => d.baslangic < kampanya.donem_baslangic);
          if (oncekiler.length === 0) continue;
          const prev = oncekiler.reduce((a, b) => (a.baslangic > b.baslangic ? a : b));
          const toplam = (prev.planlanan_butce || 0) + (prev.devredilen_miktar || 0) + (prev.merkez_destegi || 0);
          onceki_kalanlar[sube.kod] = Math.round((toplam - (prev.harcama || 0)) * 100) / 100;
        }
        cached = { t: simdi, onceki_kalanlar, sube_adlari, devredilenler };
        oncekiKalanCache.set(id, cached);
      }

      // Silinmiş şubeleri yanıt listesinden çıkar
      const gecerliKodlar = new Set(Object.keys(cached.sube_adlari));
      const gecerliYanitlar = {};
      for (const [kod, y] of Object.entries(kampanya.yanitlar || {})) {
        if (gecerliKodlar.has(kod)) gecerliYanitlar[kod] = y;
      }

      // Önceki dönem bütçe toplamasına KATILANLAR (gonderildi/onaylandi)
      const onceki_katilim = {};
      const oncekiKampanya = Object.values(doc.kampanyalar || {})
        .filter((k) => (k.donem_baslangic || '') < (kampanya.donem_baslangic || ''))
        .sort((a, b) => (b.donem_baslangic || '').localeCompare(a.donem_baslangic || ''))[0];
      if (oncekiKampanya) {
        for (const [kod, y] of Object.entries(oncekiKampanya.yanitlar || {})) {
          if (y?.durum === 'gonderildi' || y?.durum === 'onaylandi') onceki_katilim[kod] = true;
        }
      }

      res.json({
        id, ...kampanya, yanitlar: gecerliYanitlar,
        onceki_kalanlar: cached.onceki_kalanlar, sube_adlari: cached.sube_adlari,
        devredilenler: cached.devredilenler, onceki_katilim,
      });
    } catch (err) {
      console.error('[Budget] Kampanya detay hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// PUT /butce-kampanya/:id — Kampanya güncelle
router.put(
  '/butce-kampanya/:id',
  verifyToken,
  requirePermission('budget.manage'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { baslik, son_tarih, bakiye_secenekleri, iban, alici_adi, odeme_notu } = req.body;

      if (son_tarih !== undefined && !isGecerliTarih(son_tarih)) {
        return res.status(400).json({ error: 'Son tarih geçerli bir YYYY-MM-DD tarihi olmalıdır.' });
      }

      const kampanya = await getKampanya(id);
      if (!kampanya) {
        return res.status(404).json({ error: 'Kampanya bulunamadı.' });
      }

      const updates = {};
      if (baslik !== undefined) updates.baslik = baslik;
      if (son_tarih !== undefined) updates.son_tarih = son_tarih;
      if (bakiye_secenekleri !== undefined) updates.bakiye_secenekleri = bakiye_secenekleri;
      if (iban !== undefined) updates.iban = iban;
      if (alici_adi !== undefined) updates.alici_adi = alici_adi;
      if (odeme_notu !== undefined) updates.odeme_notu = odeme_notu;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'Güncellenecek alan bulunamadı.' });
      }

      veriYaDaHata(await supabase.from('kampanyalar').update(updates).eq('id', id), 'kampanya güncellenemedi');
      res.json({ success: true });
    } catch (err) {
      console.error('[Budget] Kampanya güncelleme hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// DELETE /butce-kampanya/:id — Kampanya sil
router.delete(
  '/butce-kampanya/:id',
  verifyToken,
  requirePermission('budget.manage'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const kampanya = await getKampanya(id);
      if (!kampanya) {
        return res.status(404).json({ error: 'Kampanya bulunamadı.' });
      }

      await deleteDekontlar(kampanya);
      veriYaDaHata(await supabase.from('kampanyalar').delete().eq('id', id), 'kampanya silinemedi');

      res.json({ success: true });
    } catch (err) {
      console.error('[Budget] Kampanya silme hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /butce-kampanya/:id/onayla — Tüm "gonderildi" yanıtları onayla
router.post(
  '/butce-kampanya/:id/onayla',
  verifyToken,
  requirePermission('budget.manage'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const kampanya = await getKampanya(id);
      if (!kampanya) {
        return res.status(404).json({ error: 'Kampanya bulunamadı.' });
      }

      const yanitlar = kampanya.yanitlar || {};
      const onaylananSubeler = [];
      const yazimHatalari = [];

      // Gönderilmiş yanıtlar arasından tutarı hâlâ menü seçeneklerinden biri ve
      // sonlu/pozitif/tavan altında olanlar onaya alınır (savunma derinliği).
      const gonderilenler = Object.entries(yanitlar).filter(([, y]) => y.durum === 'gonderildi');
      const uygunSubeKodlari = [];
      for (const [subeKod, yanit] of gonderilenler) {
        if (bakiyeMenudeVarMi(yanit.secilen_bakiye, kampanya.bakiye_secenekleri) && isGecerliTutar(yanit.secilen_bakiye)) {
          uygunSubeKodlari.push(subeKod);
        } else {
          yazimHatalari.push(`${subeKod}: geçersiz bakiye tutarı`);
        }
      }

      // Dönem verilerini tek toplu okumayla al
      const donemVeriler = await getDonemVeriMap(uygunSubeKodlari, kampanya.donem_baslangic, kampanya.donem_bitis);

      try {
        const yazimlar = await Promise.allSettled(uygunSubeKodlari.map(async (subeKod) => {
          // Durum flip'i ATOMİK ve guard'lı: yalnızca hâlâ 'gonderildi' ise geçer
          // (bkz. 0005_kampanya_yanit.sql). Eşzamanlı yeniden gönderimde eski
          // değer donmaz.
          const guncelYanit = await yanitYaz(id, subeKod, { durum: 'onaylandi' }, 'gonderildi');
          if (!guncelYanit) throw new Error('durum eşzamanlı işlemle değişti');

          const donemVeri = donemVeriler[subeKod] || {};
          try {
            await upsertButce(
              subeKod,
              kampanya.donem_baslangic,
              kampanya.donem_bitis,
              guncelYanit.secilen_bakiye,
              donemVeri.devredilen_miktar || 0,
              donemVeri.merkez_destegi || 0
            );
          } catch (yazimErr) {
            // Dönem yazımı başarısız — durumu geri al ki "onaylandı" görünüp
            // bütçesi yazılmamış şube kalmasın
            await yanitYaz(id, subeKod, { durum: 'gonderildi' }).catch(() => {});
            throw yazimErr;
          }
          return subeKod;
        }));

        yazimlar.forEach((sonuc, i) => {
          const subeKod = uygunSubeKodlari[i];
          if (sonuc.status === 'fulfilled') onaylananSubeler.push(subeKod);
          else yazimHatalari.push(`${subeKod}: ${sonuc.reason?.message || 'yazılamadı'}`);
        });
        if (yazimHatalari.length > 0) {
          throw new Error(`Bazı şubeler onaylanamadı — ${yazimHatalari.join(' · ')}`);
        }

        veriYaDaHata(
          await supabase.from('kampanyalar').update({ durum: 'tamamlandi' }).eq('id', id),
          'kampanya durumu yazılamadı'
        );
      } finally {
        if (onaylananSubeler.length > 0) {
          invalidateReportCache();
          invalidateCache('/reports');
          butceDurumCache.clear();
          oncekiKalanCache.clear();
        }
      }

      // Meta'dan verileri otomatik çek (arka planda)
      const { donem_baslangic, donem_bitis } = kampanya;
      getSettings().then(async (settings) => {
        if (settings?.metaApiToken) {
          for (const subeKod of onaylananSubeler) {
            try {
              await campaignBasedImport(settings.metaApiToken, donem_baslangic, donem_bitis, subeKod);
              console.log(`[Budget] ${subeKod} için Meta verisi otomatik çekildi.`);
            } catch (e) {
              console.error(`[Budget] ${subeKod} Meta otomatik çekim hatası:`, e.message);
            }
          }
          invalidateReportCache();
          invalidateCache('/reports');
        }
      }).catch(err => console.error('[Budget] Otomatik Meta çekim genel hatası:', err));

      res.json({ success: true, onaylanan: onaylananSubeler.length });
    } catch (err) {
      console.error('[Budget] Toplu onaylama hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /butce-kampanya/:id/onayla/:subeKod — Tekil şube onayı
router.post(
  '/butce-kampanya/:id/onayla/:subeKod',
  verifyToken,
  requirePermission('budget.manage'),
  async (req, res) => {
    try {
      const { id, subeKod } = req.params;
      const { bakiye, merkez, kdv } = req.body || {};
      const kampanya = await getKampanya(id);
      if (!kampanya) {
        return res.status(404).json({ error: 'Kampanya bulunamadı.' });
      }

      // Yanıt kaydı olmayabilir (kampanyadan SONRA eklenen şube).
      const yanit = kampanya.yanitlar?.[subeKod] || null;

      const adminBakiye = bakiye !== undefined && bakiye !== null ? Number(bakiye) : null;
      const adminMerkez = merkez !== undefined && merkez !== null && merkez !== '' ? Number(merkez) : null;
      const adminKdv = kdv !== undefined && kdv !== null && kdv !== '' ? Number(kdv) : null;

      if (adminBakiye !== null && !isGecerliTutar(adminBakiye)) {
        return res.status(400).json({ error: 'Geçerli bir bakiye tutarı girin.' });
      }
      if (adminMerkez !== null && !isGecerliTutar(adminMerkez, { min: 0 })) {
        return res.status(400).json({ error: 'Geçerli bir merkez desteği tutarı girin.' });
      }
      if (adminKdv !== null && !isGecerliTutar(adminKdv)) {
        return res.status(400).json({ error: 'Geçerli bir KDV dahil tutar girin.' });
      }

      if (adminBakiye === null && yanit?.durum !== 'gonderildi' && yanit?.durum !== 'onaylandi') {
        return res.status(400).json({ error: 'Onaylamak için bir bakiye girin (bu şube henüz bildirim göndermemiş).' });
      }

      const finalBakiye = adminBakiye !== null ? adminBakiye : Number(yanit?.secilen_bakiye || 0);
      if (!isGecerliTutar(finalBakiye)) {
        return res.status(400).json({ error: 'Onaylanacak bakiye tutarı geçersiz — admin bir bakiye girerek düzeltin.' });
      }

      // Bütçeyi dönem satırına yaz (devredilen korunur; merkez verildiyse güncellenir)
      const donemVeri = await getDonemVeri(subeKod, kampanya.donem_baslangic, kampanya.donem_bitis) || {};
      const finalMerkez = adminMerkez !== null ? adminMerkez : (donemVeri.merkez_destegi ?? yanit?.merkez_destegi ?? 0);
      await upsertButce(
        subeKod,
        kampanya.donem_baslangic,
        kampanya.donem_bitis,
        finalBakiye,
        donemVeri.devredilen_miktar || 0,
        finalMerkez
      );

      // Yanıt durumunu güncelle (merkez desteğini de yansıt)
      await yanitYaz(id, subeKod, {
        durum: 'onaylandi',
        merkez_destegi: finalMerkez,
        ...(adminBakiye !== null && { secilen_bakiye: finalBakiye }),
        ...(adminKdv !== null && { kdv_dahil_tutar: adminKdv }),
      });

      // Meta'dan verileri otomatik çek (arka planda)
      const { donem_baslangic, donem_bitis } = kampanya;
      getSettings().then(async (settings) => {
        if (settings?.metaApiToken) {
          try {
            await campaignBasedImport(settings.metaApiToken, donem_baslangic, donem_bitis, subeKod);
            console.log(`[Budget] ${subeKod} için Meta verisi otomatik çekildi.`);
            invalidateReportCache();
            invalidateCache('/reports');
          } catch (e) {
            console.error(`[Budget] ${subeKod} Meta otomatik çekim hatası:`, e.message);
          }
        }
      }).catch(err => console.error('[Budget] Otomatik Meta çekim genel hatası:', err));

      invalidateReportCache();
      invalidateCache('/reports');
      butceDurumCache.clear();
      oncekiKalanCache.clear();

      res.json({ success: true });
    } catch (err) {
      console.error('[Budget] Tekil onaylama hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /butce-kampanya/:id/devret/:subeKod — Önceki dönem kalanını bu döneme işle
router.post(
  '/butce-kampanya/:id/devret/:subeKod',
  verifyToken,
  requirePermission('budget.manage'),
  async (req, res) => {
    try {
      const { id, subeKod } = req.params;
      const kampanya = await getKampanya(id);
      if (!kampanya) return res.status(404).json({ error: 'Kampanya bulunamadı.' });

      const sube = await getSubeByKod(subeKod);
      if (!sube) return res.status(404).json({ error: 'Şube bulunamadı.' });

      const oncekiler = (sube.donem_ozetleri || []).filter((d) => d.baslangic < kampanya.donem_baslangic);
      if (oncekiler.length === 0) return res.status(400).json({ error: 'Önceki döneme ait veri bulunamadı.' });
      const prev = oncekiler.reduce((a, b) => (a.baslangic > b.baslangic ? a : b));
      const kalan = Math.round(((prev.planlanan_butce || 0) + (prev.devredilen_miktar || 0) + (prev.merkez_destegi || 0) - (prev.harcama || 0)) * 100) / 100;

      // Bu dönemin DEVREDEN miktarını bu değere işle (planlanan + merkez korunur)
      const donemVeri = await getDonemVeri(subeKod, kampanya.donem_baslangic, kampanya.donem_bitis) || {};
      await upsertButce(
        subeKod,
        kampanya.donem_baslangic,
        kampanya.donem_bitis,
        donemVeri.planlanan_butce || 0,
        kalan,
        donemVeri.merkez_destegi || 0
      );
      invalidateReportCache();
      invalidateCache('/reports');
      butceDurumCache.clear();
      oncekiKalanCache.clear();

      res.json({ success: true, devredilen: kalan });
    } catch (err) {
      console.error('[Budget] Devret hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /butce-kampanya/:id/sube/:subeKod — Kampanyaya sonradan şube ekle
router.post(
  '/butce-kampanya/:id/sube/:subeKod',
  verifyToken,
  requirePermission('budget.manage'),
  async (req, res) => {
    try {
      const { id, subeKod } = req.params;
      const [kampanya, sube] = await Promise.all([getKampanya(id), getSubeByKod(subeKod)]);
      if (!kampanya) return res.status(404).json({ error: 'Kampanya bulunamadı.' });
      if (!sube) return res.status(404).json({ error: 'Şube bulunamadı.' });

      if (kampanya.yanitlar?.[subeKod]) {
        return res.status(400).json({ error: 'Bu şube zaten kampanyada.' });
      }

      await yanitYaz(id, subeKod, bosYanit());
      res.json({ success: true });
    } catch (err) {
      console.error('[Budget] Kampanyaya şube ekleme hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /butce-durum — Tüm şubelerin bütçe durumu
// Eskiden veri versiyonuyla damgalı cache'ti; v2'de düz 60 sn TTL.
const butceDurumCache = new Map();
const BUTCE_DURUM_TTL = 60 * 1000;

router.get(
  '/butce-durum',
  verifyToken,
  requirePermission('budget.view'),
  async (req, res) => {
    try {
      const { since, until, subeKod } = req.query;
      if (!since || !until) {
        return res.status(400).json({ error: 'since ve until parametreleri zorunludur.' });
      }

      const isAdmin = req.user.role === 'admin';
      if (subeKod && !isAdmin && subeKod !== req.user.subeSlug) {
        return res.status(403).json({ error: 'Bu şubeye erişim yetkiniz yok' });
      }
      const hedefKod = subeKod || (!isAdmin ? req.user.subeSlug : null);
      // subeSlug claim'i boş bir non-admin, kapsamsız (tüm şube) sorguya düşmemeli
      if (!isAdmin && !hedefKod) {
        return res.status(403).json({ error: 'Bu bilgiye erişim yetkiniz yok' });
      }
      const scope = hedefKod || 'all';

      const cacheKey = `${since}_${until}#${scope}`;
      const cached = butceDurumCache.get(cacheKey);
      if (cached && Date.now() - cached.t < BUTCE_DURUM_TTL) {
        return res.json(cached.data);
      }

      let subeler;
      if (hedefKod) {
        const sube = await getSubeByKod(hedefKod);
        subeler = sube ? [sube] : [];
      } else {
        subeler = await getAllSubeler();
      }
      const sonuc = [];
      let toplamPlanlanan = 0;
      let toplamHarcama = 0;
      let toplamKalan = 0;
      let asimSayisi = 0;
      let uyariSayisi = 0;

      for (const sube of subeler) {
        const donemOzet = (sube.donem_ozetleri || []).find(
          d => d.baslangic === since && d.bitis === until
        );

        const planlananButce = donemOzet?.planlanan_butce || 0;
        const devredilen = donemOzet?.devredilen_miktar || 0;
        const merkezDestegi = donemOzet?.merkez_destegi || 0;
        const toplamButce = planlananButce + devredilen + merkezDestegi;
        const harcama = donemOzet?.harcama || 0;
        const kalan = toplamButce - harcama;

        let kullanimOrani = 0;
        let durum = null;
        if (toplamButce > 0) {
          kullanimOrani = Math.round((harcama / toplamButce) * 1000) / 10;
          if (kullanimOrani >= 100) {
            durum = 'asim';
            asimSayisi++;
          } else if (kullanimOrani >= 80) {
            durum = 'uyari';
            uyariSayisi++;
          } else {
            durum = 'normal';
          }
          toplamPlanlanan += toplamButce;
          toplamHarcama += harcama;
          toplamKalan += kalan;
        }

        sonuc.push({
          kod: sube.kod,
          ad: sube.ad,
          planlananButce,
          devredilen,
          merkezDestegi,
          toplamButce,
          harcama,
          kalan,
          kullanimOrani,
          durum,
          baslangic: since,
          bitis: until,
          donem: `${since} - ${until}`,
          updatedAt: donemOzet?.updatedAt || null,
        });
      }

      const responseData = {
        subeler: sonuc,
        ozet: { toplamPlanlanan, toplamHarcama, toplamKalan, asimSayisi, uyariSayisi },
      };

      butceDurumCache.set(cacheKey, { t: Date.now(), data: responseData });
      res.json(responseData);
    } catch (err) {
      console.error('[Budget] Bütçe durum hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ══════════════════════════════════════════════════
// ── ŞUBE SAHİBİ ENDPOINTS ──
// ══════════════════════════════════════════════════

// GET /butce-bekleyen — Şube sahibinin bekleyen kampanyaları
router.get(
  '/butce-bekleyen',
  verifyToken,
  requirePermission('budget.submit'),
  async (req, res) => {
    try {
      const subeSlug = req.user.subeSlug;
      if (!subeSlug) {
        return res.status(400).json({ error: 'Kullanıcıya bağlı şube bulunamadı.' });
      }

      const doc = await getButceDoc();
      const kampanyalar = doc.kampanyalar || {};
      const bugun = bugunStr();

      const bekleyenler = Object.entries(kampanyalar)
        .filter(([, k]) => {
          // Toplama süresi geçtiyse (son_tarih < bugün) şube sahibine gösterme
          if (k.son_tarih && k.son_tarih < bugun) return false;
          if (k.durum !== 'aktif') return false;
          const y = k.yanitlar?.[subeSlug];
          return !y || y.durum === 'bekliyor';
        })
        .sort((a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt))
        .map(([id, data]) => ({
          id,
          baslik: data.baslik,
          donem_baslangic: data.donem_baslangic,
          donem_bitis: data.donem_bitis,
          son_tarih: data.son_tarih,
          bakiye_secenekleri: data.bakiye_secenekleri,
          iban: data.iban,
          odeme_notu: data.odeme_notu,
          yanit: data.yanitlar?.[subeSlug] || bosYanit(),
        }));

      // Katıldığı kampanyalar — dönem sonuna kadar özet olarak görünür
      const katildiklarim = Object.entries(kampanyalar)
        .filter(([, k]) => {
          const y = k.yanitlar?.[subeSlug];
          if (!y || (y.durum !== 'gonderildi' && y.durum !== 'onaylandi')) return false;
          if (k.donem_bitis && k.donem_bitis < bugun) return false;
          return true;
        })
        .sort((a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt))
        .map(([id, k]) => {
          const y = k.yanitlar[subeSlug];
          return {
            id,
            baslik: k.baslik,
            donem_baslangic: k.donem_baslangic,
            donem_bitis: k.donem_bitis,
            secilen_bakiye: y.secilen_bakiye,
            kdv_dahil_tutar: y.kdv_dahil_tutar,
            durum: y.durum,
            gonderim_tarihi: y.gonderim_tarihi,
          };
        });

      res.json({ kampanyalar: bekleyenler, katildiklarim });
    } catch (err) {
      console.error('[Budget] Bekleyen kampanyalar hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /butce-gonder/:kampanyaId — Şube sahibi yanıt gönder
router.post(
  '/butce-gonder/:kampanyaId',
  verifyToken,
  requirePermission('budget.submit'),
  DEKONT_AL,
  async (req, res) => {
    try {
      const { kampanyaId } = req.params;
      const subeKod = req.user.subeSlug;

      if (!subeKod) {
        return res.status(400).json({ error: 'Kullanıcıya bağlı şube bulunamadı.' });
      }

      const { secilen_bakiye, kdv_dahil_tutar, notlar } = req.body;

      if (!secilen_bakiye || !kdv_dahil_tutar) {
        return res.status(400).json({ error: 'Seçilen bakiye ve KDV dahil tutar zorunludur.' });
      }

      const kampanya = await getKampanya(kampanyaId);
      if (!kampanya) {
        return res.status(404).json({ error: 'Kampanya bulunamadı.' });
      }
      if (kampanya.durum !== 'aktif') {
        return res.status(400).json({ error: 'Bu kampanya artık aktif değil.' });
      }
      // Son tarih kontrolü (Europe/Istanbul günü)
      const bugun = bugunStr();
      if (kampanya.son_tarih && kampanya.son_tarih < bugun) {
        return res.status(400).json({ error: 'Bu kampanyanın son gönderim tarihi geçti.' });
      }
      // Onaylanmış yanıt şube tarafından ezilemez — dönem satırına yazılmış bütçeyle
      // tutarsızlık doğar; değişiklik admin tekil onay/güncelleme üzerinden yapılır
      const mevcutYanit = kampanya.yanitlar?.[subeKod];
      if (mevcutYanit?.durum === 'onaylandi') {
        return res.status(400).json({ error: 'Bu kampanya için bildiriminiz onaylanmış. Değişiklik için yönetime başvurun.' });
      }

      // Seçilen bakiye kampanyanın sunduğu menü seçeneklerinden biri olmalı
      if (!bakiyeMenudeVarMi(secilen_bakiye, kampanya.bakiye_secenekleri)) {
        return res.status(400).json({ error: 'Seçilen bakiye bu kampanyanın sunduğu seçeneklerden biri değil.' });
      }

      const numBakiye = Number(secilen_bakiye);
      const numKdvTutar = Number(kdv_dahil_tutar);

      if (!isGecerliTutar(numBakiye) || !isGecerliTutar(numKdvTutar)) {
        return res.status(400).json({ error: 'Seçilen bakiye ve KDV dahil tutar geçerli, pozitif bir sayı olmalıdır.' });
      }

      // Dekont upload
      let dekontUrl = null;
      if (req.file) {
        const ext = req.file.originalname.split('.').pop().toLowerCase();
        const key = `dekontlar/${kampanyaId}/${subeKod}.${ext}`;
        // Depolanan Content-Type saldırgan-kontrollü mimetype'tan DEĞİL, uzantıdan türetilir
        const contentType = DEKONT_CONTENT_TYPES[ext] || 'application/octet-stream';
        dekontUrl = await uploadFile(req.file.buffer, key, contentType);
        // Yeniden gönderimde uzantı değiştiyse eski dekont R2'de öksüz kalmasın
        if (mevcutYanit?.dekont_url) {
          const eskiKey = urlToKey(mevcutYanit.dekont_url);
          if (eskiKey && eskiKey !== key) await deleteFile(eskiKey).catch(() => {});
        }
      }

      const yanitData = {
        durum: 'gonderildi',
        secilen_bakiye: numBakiye,
        kdv_dahil_tutar: numKdvTutar,
        notlar: notlar || null,
        // Yeni dekont yüklenmediyse mevcut dekont korunur
        dekont_url: dekontUrl || mevcutYanit?.dekont_url || null,
        gonderim_tarihi: new Date().toISOString(),
      };

      await yanitYaz(kampanyaId, subeKod, yanitData);

      res.json({ success: true, yanit: yanitData });
    } catch (err) {
      console.error('[Budget] Yanıt gönderme hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

export default router;
