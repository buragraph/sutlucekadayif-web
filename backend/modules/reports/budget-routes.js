import { Router } from 'express';
import multer from 'multer';
import { db } from '../../config/firebase.js';
import admin from 'firebase-admin';
import { verifyToken, requirePermission } from '../../middleware/auth.js';
import { uploadFile, deleteFile, urlToKey } from '../../config/r2.js';
import { upsertButce, getAllSubeler, getSubeByKod, getDonemVeri, getDonemVeriMap, getSettings, getDataVersion, bumpDataVersion } from './db.js';
import { invalidateReportCache } from './services/report-data.js';
import { invalidateCache } from '../../middleware/cache.js';
import { campaignBasedImport } from './services/meta-api.js';
import { getKonumListe } from '../../shared/konum-store.js';
import { bugunStr } from './services/date-utils.js';

const router = Router();

const MAX_KAMPANYA = 6;
const BUTCE_DOC_REF = db.collection('reports').doc('butce');

// Dekont upload — memoryStorage, max 5MB, pdf/jpg/jpeg/png
const dekontUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Sadece PDF, JPG, JPEG ve PNG dosyaları kabul edilir.'));
  },
});

// Boş "bekliyor" yanıt kaydı — tek kaynak; kopyalar arasında alan drift'i olmasın
const bosYanit = () => ({
  durum: 'bekliyor',
  secilen_bakiye: null,
  kdv_dahil_tutar: null,
  notlar: null,
  dekont_url: null,
  gonderim_tarihi: null,
});

// ── Helper: Get or create butce doc ──
export async function getButceDoc() {
  const snap = await BUTCE_DOC_REF.get();
  if (!snap.exists) return { kampanyalar: {} };
  return snap.data();
}

/**
 * Güncel dönemde (en son kampanya) bütçesi ONAYLANMIŞ şube kodları (Set).
 * Sidebar'da onaylı şubeleri üstte gruplamak için kullanılır.
 */
export async function getOnayliSubeKodlari() {
  const doc = await getButceDoc();
  const kampanyalar = Object.values(doc.kampanyalar || {});
  if (kampanyalar.length === 0) return [];
  // En güncel dönem (donem_baslangic'e göre)
  const latest = kampanyalar.sort((a, b) => (b.donem_baslangic || '').localeCompare(a.donem_baslangic || ''))[0];
  return Object.entries(latest.yanitlar || {})
    .filter(([, y]) => y?.durum === 'onaylandi')
    .map(([kod]) => kod);
}

// ── Helper: Delete R2 dekontlar for a campaign ──
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

      // İki okuma bağımsız — paralel çek (1 RTT tasarrufu)
      const [doc, subeler] = await Promise.all([getButceDoc(), getAllSubeler()]);
      const kampanyalar = doc.kampanyalar || {};

      // Aynı döneme ait kampanya varsa ezme — yanıtlar sıfırlanır, veri kaybolur
      const kampanyaId = `${donem_baslangic}_${donem_bitis}`;
      if (kampanyalar[kampanyaId]) {
        return res.status(400).json({ error: 'Bu döneme ait bir kampanya zaten var. Önce onu silin veya düzenleyin.' });
      }

      // Yanitlar map oluştur — tüm şubeler "bekliyor"
      const yanitlar = {};
      for (const sube of subeler) {
        yanitlar[sube.kod] = bosYanit();
      }

      const yeniKampanya = {
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
        createdAt: new Date().toISOString(),
      };

      // Önce yeni kampanyayı yaz — sil-sonra-yaz sırasında yazma başarısız olursa
      // eski kampanya geri dönüşsüz kaybolurdu; bu sırada en kötü durumda doküman
      // geçici olarak tavan+1 kampanya taşır. Yalnızca yeni anahtar yazılır — tüm
      // map'i yazmak, okuma ile yazma arasındaki eşzamanlı şube yanıtlarını ezer.
      await BUTCE_DOC_REF.set({ kampanyalar: { [kampanyaId]: yeniKampanya } }, { merge: true });

      // Max 6 kampanya kontrolü — en eskisini sil.
      // FieldValue.delete() şart: merge'li set anahtar SİLEMEZ, kampanya dokümanda kalır.
      if (Object.keys(kampanyalar).length >= MAX_KAMPANYA) {
        const entries = Object.entries(kampanyalar)
          .sort((a, b) => new Date(a[1].createdAt) - new Date(b[1].createdAt));
        const [eskiId, eskiKampanya] = entries[0];

        await BUTCE_DOC_REF.update({ [`kampanyalar.${eskiId}`]: admin.firestore.FieldValue.delete() });
        // R2 dekont temizliği doküman yazımını bloklamasın, hatası oluşturmayı düşürmesin
        deleteDekontlar(eskiKampanya).catch((e) => console.error('[Budget] Eski kampanya dekont temizliği:', e.message));
      }

      res.json({ success: true, kampanyaId, kampanya: yeniKampanya });
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
      const doc = await getButceDoc();
      const kampanyalar = doc.kampanyalar || {};

      // Silinmiş şubeleri yanıt listesinden süz (sayaçlar güncel kalsın).
      // Konum dokümanı güncel şube kodlarını tutar (1 read, bellek cache'li).
      const konumListe = await getKonumListe();
      const gecerli = konumListe ? new Set(konumListe.map((k) => k.slug)) : null;
      const suz = (yanitlar) => {
        if (!gecerli) return yanitlar || {};
        const f = {};
        for (const [kod, y] of Object.entries(yanitlar || {})) if (gecerli.has(kod)) f[kod] = y;
        return f;
      };

      // createdAt'e göre desc sırala
      const sorted = Object.entries(kampanyalar)
        .sort((a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt))
        .map(([id, data]) => ({ id, ...data, yanitlar: suz(data.yanitlar) }));

      res.json({ kampanyalar: sorted });
    } catch (err) {
      console.error('[Budget] Kampanya listeleme hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Kampanya başına "önceki dönem kalanı" haritası için versiyonlu bellek cache'i
const oncekiKalanCache = new Map();

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

      // Şube başına önceki dönem kalanı (otomatik: planlanan + devir + merkez − harcama).
      // Her şubenin donem_ozetleri'nde, kampanya döneminden ÖNCEKİ en güncel dönem alınır.
      // Versiyonlu cache → veri değişmedikçe N read tekrar yapılmaz.
      const version = await getDataVersion();
      const cacheKey = `${id}#v${version}`;
      let cached = oncekiKalanCache.get(cacheKey);
      if (!cached) {
        const onceki_kalanlar = {};
        const sube_adlari = {}; // subeKod → gerçek şube adı (slug yerine isim göstermek için)
        const devredilenler = {}; // bu kampanya dönemine İŞLENMİŞ devreden miktar (tik/Düzenle ile)
        const subeler = await getAllSubeler();
        for (const sube of subeler) {
          sube_adlari[sube.kod] = sube.ad || sube.kod;
          // Bu kampanya döneminin gerçek devreden miktarı (uygulanmadıysa 0/yok)
          const buDonem = (sube.donem_ozetleri || []).find((d) => d.baslangic === kampanya.donem_baslangic && d.bitis === kampanya.donem_bitis);
          if (buDonem && buDonem.devredilen_miktar) devredilenler[sube.kod] = buDonem.devredilen_miktar;
          const oncekiler = (sube.donem_ozetleri || []).filter((d) => d.baslangic < kampanya.donem_baslangic);
          if (oncekiler.length === 0) continue;
          const prev = oncekiler.reduce((a, b) => (a.baslangic > b.baslangic ? a : b));
          const toplam = (prev.planlanan_butce || 0) + (prev.devredilen_miktar || 0) + (prev.merkez_destegi || 0);
          onceki_kalanlar[sube.kod] = Math.round((toplam - (prev.harcama || 0)) * 100) / 100;
        }
        cached = { onceki_kalanlar, sube_adlari, devredilenler };
        oncekiKalanCache.set(cacheKey, cached);
      }

      // Silinmiş şubeleri yanıt listesinden çıkar (sube_adlari güncel şubeleri içerir)
      const gecerliKodlar = new Set(Object.keys(cached.sube_adlari));
      const gecerliYanitlar = {};
      for (const [kod, y] of Object.entries(kampanya.yanitlar || {})) {
        if (gecerliKodlar.has(kod)) gecerliYanitlar[kod] = y;
      }

      // Önceki dönem bütçe toplamasına KATILANLAR (gonderildi/onaylandi) — bu dönemden
      // önceki en güncel kampanyadan. Doküman zaten yüklü → ek read yok.
      const onceki_katilim = {};
      const oncekiKampanya = Object.values(doc.kampanyalar || {})
        .filter((k) => (k.donem_baslangic || '') < (kampanya.donem_baslangic || ''))
        .sort((a, b) => (b.donem_baslangic || '').localeCompare(a.donem_baslangic || ''))[0];
      if (oncekiKampanya) {
        for (const [kod, y] of Object.entries(oncekiKampanya.yanitlar || {})) {
          if (y?.durum === 'gonderildi' || y?.durum === 'onaylandi') onceki_katilim[kod] = true;
        }
      }

      res.json({ id, ...kampanya, yanitlar: gecerliYanitlar, onceki_kalanlar: cached.onceki_kalanlar, sube_adlari: cached.sube_adlari, devredilenler: cached.devredilenler, onceki_katilim });
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

      const doc = await getButceDoc();
      if (!doc.kampanyalar?.[id]) {
        return res.status(404).json({ error: 'Kampanya bulunamadı.' });
      }

      const updates = {};
      if (baslik !== undefined) updates[`kampanyalar.${id}.baslik`] = baslik;
      if (son_tarih !== undefined) updates[`kampanyalar.${id}.son_tarih`] = son_tarih;
      if (bakiye_secenekleri !== undefined) updates[`kampanyalar.${id}.bakiye_secenekleri`] = bakiye_secenekleri;
      if (iban !== undefined) updates[`kampanyalar.${id}.iban`] = iban;
      if (alici_adi !== undefined) updates[`kampanyalar.${id}.alici_adi`] = alici_adi;
      if (odeme_notu !== undefined) updates[`kampanyalar.${id}.odeme_notu`] = odeme_notu;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'Güncellenecek alan bulunamadı.' });
      }

      await BUTCE_DOC_REF.update(updates);

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
      const doc = await getButceDoc();
      const kampanya = doc.kampanyalar?.[id];

      if (!kampanya) {
        return res.status(404).json({ error: 'Kampanya bulunamadı.' });
      }

      // R2 dekontlarını sil
      await deleteDekontlar(kampanya);

      await BUTCE_DOC_REF.update({ [`kampanyalar.${id}`]: admin.firestore.FieldValue.delete() });

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
      const doc = await getButceDoc();
      const kampanya = doc.kampanyalar?.[id];

      if (!kampanya) {
        return res.status(404).json({ error: 'Kampanya bulunamadı.' });
      }

      const yanitlar = kampanya.yanitlar || {};
      const updates = {};
      const onaylananSubeler = [];

      // Gönderilmiş yanıtların dönem verilerini tek toplu okumayla al (döngüde tekil get yok)
      const gonderilenler = Object.entries(yanitlar).filter(([, y]) => y.durum === 'gonderildi');
      const donemVeriler = await getDonemVeriMap(
        gonderilenler.map(([kod]) => kod),
        kampanya.donem_baslangic,
        kampanya.donem_bitis
      );

      try {
        // Bütçeler paralel yazılır — her upsertButce yalnızca kendi şubesinin iki
        // dokümanına dokunan ayrı bir transaction (skipBump ortak versiyon dokümanı
        // çakışmasını da önler); sıralı await N×RTT bekletiyordu
        const yazimlar = await Promise.allSettled(gonderilenler.map(([subeKod, yanit]) => {
          const donemVeri = donemVeriler[subeKod] || {};
          return upsertButce(
            subeKod,
            kampanya.donem_baslangic,
            kampanya.donem_bitis,
            yanit.secilen_bakiye,
            donemVeri.devredilen_miktar || 0,
            donemVeri.merkez_destegi || 0,
            { skipBump: true } // versiyon toplu yazım sonunda bir kez artırılır
          );
        }));

        const yazimHatalari = [];
        yazimlar.forEach((sonuc, i) => {
          const subeKod = gonderilenler[i][0];
          if (sonuc.status === 'fulfilled') {
            onaylananSubeler.push(subeKod);
            updates[`kampanyalar.${id}.yanitlar.${subeKod}.durum`] = 'onaylandi';
          } else {
            yazimHatalari.push(`${subeKod}: ${sonuc.reason?.message || 'yazılamadı'}`);
          }
        });
        if (yazimHatalari.length > 0) {
          throw new Error(`Bazı şubeler onaylanamadı — ${yazimHatalari.join(' · ')}`);
        }

        // Kampanya durumunu tamamlandı yap — yalnızca tüm liste işlenince
        updates[`kampanyalar.${id}.durum`] = 'tamamlandi';
      } finally {
        // Kısmi hatada da: yazılmış şubelerin yanıt durumu Firestore'a işlensin ve
        // versiyon ilerlesin — yoksa dönem dokümanına yazılan bütçelerle ekran ayrışır
        // (bayat cache + 'gonderildi' görünen onaylılar → çift onay riski)
        if (Object.keys(updates).length > 0) await BUTCE_DOC_REF.update(updates);
        if (onaylananSubeler.length > 0) {
          // Not: upsertButce donem_ozetleri'ni kendisi günceller; tam recalc gerekmez
          await bumpDataVersion();
          invalidateReportCache();
          invalidateCache('/reports');
          butceDurumCache.clear();
        }
      }

      // Meta'dan verileri otomatik çek (Arka planda)
      const { donem_baslangic, donem_bitis } = kampanya;
      getSettings().then(async (settings) => {
        if (settings?.metaApiToken) {
          for (const subeKod of onaylananSubeler) {
            try {
              await campaignBasedImport(settings.metaApiToken, donem_baslangic, donem_bitis, subeKod);
              console.log(`[Budget] ${subeKod} için Meta verisi otomatik çekildi.`);
              // Not: campaignBasedImport aggregate'leri delta ile günceller
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
      const doc = await getButceDoc();
      const kampanya = doc.kampanyalar?.[id];

      if (!kampanya) {
        return res.status(404).json({ error: 'Kampanya bulunamadı.' });
      }

      // Yanıt kaydı olmayabilir (kampanyadan SONRA eklenen şube). Admin bir bakiye
      // girerek doğrudan onaylayabilir; reddetme — aşağıdaki update girdiyi oluşturur.
      const yanit = kampanya.yanitlar?.[subeKod] || null;

      const adminBakiye = bakiye !== undefined && bakiye !== null ? Number(bakiye) : null;
      // Merkez desteği: değer verilmişse onu yaz, yoksa mevcut dönem değerini koru
      const adminMerkez = merkez !== undefined && merkez !== null && merkez !== '' ? Number(merkez) : null;
      // KDV dahil tutar: admin elle girdiyse yanıta yaz (yoksa istemci bakiyeden hesaplar)
      const adminKdv = kdv !== undefined && kdv !== null && kdv !== '' ? Number(kdv) : null;

      // Bakiye girilmemişse: yalnızca "gönderildi" ya da zaten "onaylandi" (güncelleme) ise devam
      if (adminBakiye === null && yanit?.durum !== 'gonderildi' && yanit?.durum !== 'onaylandi') {
        return res.status(400).json({ error: 'Onaylamak için bir bakiye girin (bu şube henüz bildirim göndermemiş).' });
      }

      const finalBakiye = adminBakiye !== null ? adminBakiye : Number(yanit?.secilen_bakiye || 0);

      // Bütçeyi dönem dokümanına yaz (devredilen korunur; merkez verildiyse güncellenir)
      const donemVeri = await getDonemVeri(subeKod, kampanya.donem_baslangic, kampanya.donem_bitis) || {};
      // Dönem dokümanı henüz yoksa yanıttaki merkez desteğine düş — 0'a sıfırlanmasın
      const finalMerkez = adminMerkez !== null ? adminMerkez : (donemVeri.merkez_destegi ?? yanit?.merkez_destegi ?? 0);
      await upsertButce(
          subeKod,
          kampanya.donem_baslangic,
          kampanya.donem_bitis,
          finalBakiye,
          donemVeri.devredilen_miktar || 0,
          finalMerkez
      );

      // Yanıt durumunu güncelle (merkez desteğini de yansıt — tabloda görünsün)
      await BUTCE_DOC_REF.update({
        [`kampanyalar.${id}.yanitlar.${subeKod}.durum`]: 'onaylandi',
        [`kampanyalar.${id}.yanitlar.${subeKod}.merkez_destegi`]: finalMerkez,
        ...(adminBakiye !== null && { [`kampanyalar.${id}.yanitlar.${subeKod}.secilen_bakiye`]: finalBakiye }),
        ...(adminKdv !== null && { [`kampanyalar.${id}.yanitlar.${subeKod}.kdv_dahil_tutar`]: adminKdv })
      });

      // Meta'dan verileri otomatik çek (Arka planda)
      const { donem_baslangic, donem_bitis } = kampanya;
      getSettings().then(async (settings) => {
        if (settings?.metaApiToken) {
          try {
            await campaignBasedImport(settings.metaApiToken, donem_baslangic, donem_bitis, subeKod);
            console.log(`[Budget] ${subeKod} için Meta verisi otomatik çekildi.`);
            // Not: campaignBasedImport aggregate'leri delta ile günceller
            invalidateReportCache();
            invalidateCache('/reports');
          } catch (e) {
            console.error(`[Budget] ${subeKod} Meta otomatik çekim hatası:`, e.message);
          }
        }
      }).catch(err => console.error('[Budget] Otomatik Meta çekim genel hatası:', err));

      // Not: upsertButce donem_ozetleri'ni kendisi günceller; tam recalc gerekmez
      invalidateReportCache();
      invalidateCache('/reports');
      butceDurumCache.clear();

      res.json({ success: true });
    } catch (err) {
      console.error('[Budget] Tekil onaylama hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /butce-kampanya/:id/devret/:subeKod — Önceki dönem kalanını bu dönemin devreden miktarına işle
router.post(
  '/butce-kampanya/:id/devret/:subeKod',
  verifyToken,
  requirePermission('budget.manage'),
  async (req, res) => {
    try {
      const { id, subeKod } = req.params;
      const doc = await getButceDoc();
      const kampanya = doc.kampanyalar?.[id];
      if (!kampanya) return res.status(404).json({ error: 'Kampanya bulunamadı.' });

      const sube = await getSubeByKod(subeKod);
      if (!sube) return res.status(404).json({ error: 'Şube bulunamadı.' });

      // Önceki dönem kalanı (kampanya döneminden ÖNCEKİ en güncel dönem)
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
      await bumpDataVersion();
      invalidateReportCache();
      invalidateCache('/reports');
      butceDurumCache.clear();

      res.json({ success: true, devredilen: kalan });
    } catch (err) {
      console.error('[Budget] Devret hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);


// POST /butce-kampanya/:id/sube/:subeKod — Kampanyaya sonradan şube ekle
// (kampanya oluşturulduktan sonra sisteme eklenen şubeler için; son tarih geçse de çalışır)
router.post(
  '/butce-kampanya/:id/sube/:subeKod',
  verifyToken,
  requirePermission('budget.manage'),
  async (req, res) => {
    try {
      const { id, subeKod } = req.params;
      // İki okuma bağımsız — paralel çek
      const [doc, sube] = await Promise.all([getButceDoc(), getSubeByKod(subeKod)]);
      const kampanya = doc.kampanyalar?.[id];
      if (!kampanya) return res.status(404).json({ error: 'Kampanya bulunamadı.' });
      if (!sube) return res.status(404).json({ error: 'Şube bulunamadı.' });

      if (kampanya.yanitlar?.[subeKod]) {
        return res.status(400).json({ error: 'Bu şube zaten kampanyada.' });
      }

      await BUTCE_DOC_REF.update({
        [`kampanyalar.${id}.yanitlar.${subeKod}`]: bosYanit(),
      });

      res.json({ success: true });
    } catch (err) {
      console.error('[Budget] Kampanyaya şube ekleme hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);


// GET /butce-durum — Tüm şubelerin bütçe durumunu döner
// Cache, Firestore'daki veri versiyonuyla doğrulanır (multi-instance güvenli, HIT = 1 read)
const butceDurumCache = new Map();

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

      // Kapsam: admin tüm şubeleri (veya subeKod ile tek şubeyi), sube_sahibi
      // yalnızca kendi şubesini görür
      const isAdmin = req.user.role === 'admin';
      if (subeKod && !isAdmin && subeKod !== req.user.subeSlug) {
        return res.status(403).json({ error: 'Bu şubeye erişim yetkiniz yok' });
      }
      const hedefKod = subeKod || (!isAdmin ? req.user.subeSlug : null);
      const scope = hedefKod || 'all';

      // Cache kontrol — veri versiyonu + kapsam eşleşiyorsa servis et
      const version = await getDataVersion();
      const cacheKey = `${since}_${until}#${scope}`;
      const cached = butceDurumCache.get(cacheKey);
      if (cached && cached.v === version) {
        return res.json(cached.data);
      }

      // Optimizasyon: şube dokümanı zaten donem_ozetleri içeriyor — dönem
      // dokümanlarına hiç gidilmez. Tek şube modunda 1 read yeterli.
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
        // donem_ozetleri array'inden eşleşen dönemi bul (0 read!)
        const donemOzet = (sube.donem_ozetleri || []).find(
          d => d.baslangic === since && d.bitis === until
        );

        const planlananButce = donemOzet?.planlanan_butce || 0;
        const devredilen = donemOzet?.devredilen_miktar || 0;
        const merkezDestegi = donemOzet?.merkez_destegi || 0;
        const toplamButce = planlananButce + devredilen + merkezDestegi;
        const harcama = donemOzet?.harcama || 0;
        const kalan = toplamButce - harcama;

        // Kullanım oranı ve durum hesapla — toplam bütçe (yalnızca merkez desteği olsa da) varsa
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
          // Dönem bilgisi — UI'daki günlük bütçe hesabı ve yenile butonu için
          baslangic: since,
          bitis: until,
          donem: `${since} - ${until}`,
          updatedAt: donemOzet?.updatedAt || null,
        });
      }

      const responseData = {
        subeler: sonuc,
        ozet: {
          toplamPlanlanan,
          toplamHarcama,
          toplamKalan,
          asimSayisi,
          uyariSayisi,
        },
      };

      // Cache'e yaz (versiyon damgalı)
      butceDurumCache.set(cacheKey, { v: version, data: responseData });

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

      // Bugünün tarihi (YYYY-MM-DD, Europe/Istanbul) — son_tarih'i geçmiş kampanyalar gösterilmez
      const bugun = bugunStr();

      const bekleyenler = Object.entries(kampanyalar)
        .filter(([, k]) => {
          // Toplama süresi geçtiyse (son_tarih < bugün) şube sahibine gösterme
          if (k.son_tarih && k.son_tarih < bugun) return false;
          if (k.durum !== 'aktif') return false;
          // Yanıt kaydı yoksa (kampanyadan sonra eklenen şube) da "bekliyor" say
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

      // Katıldığı kampanyalar — dönem sonuna (donem_bitis) kadar özet olarak görünür
      const katildiklarim = Object.entries(kampanyalar)
        .filter(([, k]) => {
          const y = k.yanitlar?.[subeSlug];
          if (!y || (y.durum !== 'gonderildi' && y.durum !== 'onaylandi')) return false;
          if (k.donem_bitis && k.donem_bitis < bugun) return false; // dönem bittiyse gösterme
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
  dekontUpload.single('dekont'),
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

      const numBakiye = Number(secilen_bakiye);
      const numKdvTutar = Number(kdv_dahil_tutar);

      if (isNaN(numBakiye) || isNaN(numKdvTutar)) {
        return res.status(400).json({ error: 'Seçilen bakiye ve KDV dahil tutar geçerli bir sayı olmalıdır.' });
      }

      const doc = await getButceDoc();
      const kampanya = doc.kampanyalar?.[kampanyaId];

      if (!kampanya) {
        return res.status(404).json({ error: 'Kampanya bulunamadı.' });
      }
      if (kampanya.durum !== 'aktif') {
        return res.status(400).json({ error: 'Bu kampanya artık aktif değil.' });
      }
      // Son tarih kontrolü (Europe/Istanbul günü) — liste gizlese de doğrudan API çağrısı bu kapıdan dönmeli
      const bugun = bugunStr();
      if (kampanya.son_tarih && kampanya.son_tarih < bugun) {
        return res.status(400).json({ error: 'Bu kampanyanın son gönderim tarihi geçti.' });
      }
      // Onaylanmış yanıt şube tarafından ezilemez — dönem dokümanına yazılmış bütçeyle
      // tutarsızlık doğar; değişiklik admin tekil onay/güncelleme üzerinden yapılır
      const mevcutYanit = kampanya.yanitlar?.[subeKod];
      if (mevcutYanit?.durum === 'onaylandi') {
        return res.status(400).json({ error: 'Bu kampanya için bildiriminiz onaylanmış. Değişiklik için yönetime başvurun.' });
      }
      // Not: yanıt kaydı yoksa (kampanya oluşturulduktan SONRA eklenen şube) reddetme;
      // aşağıdaki yazma dot-path ile girdiyi kendisi oluşturur.

      // Dekont upload
      let dekontUrl = null;
      if (req.file) {
        const ext = req.file.originalname.split('.').pop().toLowerCase();
        const key = `dekontlar/${kampanyaId}/${subeKod}.${ext}`;
        dekontUrl = await uploadFile(req.file.buffer, key, req.file.mimetype);
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
        // Yeni dekont yüklenmediyse mevcut dekont korunur — tam-obje yazımı
        // önceki dekont_url'i null ile ezip kaydı dekontsuz bırakıyordu
        dekont_url: dekontUrl || mevcutYanit?.dekont_url || null,
        gonderim_tarihi: new Date().toISOString(),
      };

      await BUTCE_DOC_REF.update({
        [`kampanyalar.${kampanyaId}.yanitlar.${subeKod}`]: yanitData,
      });

      res.json({ success: true, yanit: yanitData });
    } catch (err) {
      console.error('[Budget] Yanıt gönderme hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

export default router;
