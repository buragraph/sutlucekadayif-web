import { Router } from 'express';
import multer from 'multer';
import { db } from '../../config/firebase.js';
import admin from 'firebase-admin';
import { verifyToken, requirePermission } from '../../middleware/auth.js';
import { uploadFile, deleteFile, urlToKey } from '../../config/r2.js';
import { upsertButce, getAllSubeler, getDonemVeri, getSettings, getDataVersion, bumpDataVersion } from './db.js';
import { invalidateReportCache } from './services/report-data.js';
import { invalidateCache } from '../../middleware/cache.js';
import { campaignBasedImport } from './services/meta-api.js';

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

// ── Helper: Get or create butce doc ──
async function getButceDoc() {
  const snap = await BUTCE_DOC_REF.get();
  if (!snap.exists) return { kampanyalar: {} };
  return snap.data();
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

      const doc = await getButceDoc();
      const kampanyalar = doc.kampanyalar || {};

      // Yanitlar map oluştur — tüm şubeler "bekliyor"
      const subeler = await getAllSubeler();
      const yanitlar = {};
      for (const sube of subeler) {
        yanitlar[sube.kod] = {
          durum: 'bekliyor',
          secilen_bakiye: null,
          kdv_dahil_tutar: null,
          notlar: null,
          dekont_url: null,
          gonderim_tarihi: null,
        };
      }

      const kampanyaId = `${donem_baslangic}_${donem_bitis}`;
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

      // Max 6 kampanya kontrolü — en eskisini sil
      const entries = Object.entries(kampanyalar);
      if (entries.length >= MAX_KAMPANYA) {
        // En eskisini bul
        entries.sort((a, b) => new Date(a[1].createdAt) - new Date(b[1].createdAt));
        const [eskiId, eskiKampanya] = entries[0];

        // R2 dekontlarını sil
        await deleteDekontlar(eskiKampanya);

        // Firestore'dan kaldır
        delete kampanyalar[eskiId];
      }

      kampanyalar[kampanyaId] = yeniKampanya;

      await BUTCE_DOC_REF.set({ kampanyalar }, { merge: true });

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

      // createdAt'e göre desc sırala
      const sorted = Object.entries(kampanyalar)
        .sort((a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt))
        .map(([id, data]) => ({ id, ...data }));

      res.json({ kampanyalar: sorted });
    } catch (err) {
      console.error('[Budget] Kampanya listeleme hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /butce-kampanya/:id — Tek kampanya detayı
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

      res.json({ id, ...kampanya });
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

      for (const [subeKod, yanit] of Object.entries(yanitlar)) {
        if (yanit.durum === 'gonderildi') {
          // Bütçeyi dönem dokümanına yaz
          const donemVeri = await getDonemVeri(subeKod, kampanya.donem_baslangic, kampanya.donem_bitis) || {};
          await upsertButce(
            subeKod,
            kampanya.donem_baslangic,
            kampanya.donem_bitis,
            yanit.secilen_bakiye,
            donemVeri.devredilen_miktar || 0,
            donemVeri.merkez_destegi || 0,
            { skipBump: true } // versiyon döngü sonunda bir kez artırılır
          );
          onaylananSubeler.push(subeKod);

          // Yanıt durumunu güncelle
          updates[`kampanyalar.${id}.yanitlar.${subeKod}.durum`] = 'onaylandi';
        }
      }

      // Kampanya durumunu tamamlandı yap
      updates[`kampanyalar.${id}.durum`] = 'tamamlandi';

      await BUTCE_DOC_REF.update(updates);

      // Meta'dan verileri otomatik çek (Arka planda)
      const { donem_baslangic, donem_bitis } = kampanya;
      getSettings().then(async (settings) => {
        if (settings?.metaApiToken) {
          for (const subeKod of onaylananSubeler) {
            try {
              await campaignBasedImport(settings.metaApiToken, donem_baslangic, donem_bitis, subeKod);
              console.log(`[Budget] ${subeKod} için Meta verisi otomatik çekildi.`);
              // Not: campaignBasedImport içinde recalcSubeAggregates zaten çağrılıyor
            } catch (e) {
              console.error(`[Budget] ${subeKod} Meta otomatik çekim hatası:`, e.message);
            }
          }
          invalidateReportCache();
          invalidateCache('/reports');
        }
      }).catch(err => console.error('[Budget] Otomatik Meta çekim genel hatası:', err));

      // Not: upsertButce donem_ozetleri'ni kendisi günceller; tam recalc gerekmez
      if (onaylananSubeler.length > 0) await bumpDataVersion();
      invalidateReportCache();
      invalidateCache('/reports');
      butceDurumCache.clear();

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
      const { bakiye } = req.body || {};
      const doc = await getButceDoc();
      const kampanya = doc.kampanyalar?.[id];

      if (!kampanya) {
        return res.status(404).json({ error: 'Kampanya bulunamadı.' });
      }

      const yanit = kampanya.yanitlar?.[subeKod];
      if (!yanit) {
        return res.status(404).json({ error: 'Bu şube için yanıt bulunamadı.' });
      }
      
      const adminBakiye = bakiye !== undefined && bakiye !== null ? Number(bakiye) : null;
      
      if (adminBakiye === null && yanit.durum !== 'gonderildi') {
        return res.status(400).json({ error: 'Bu yanıt henüz gönderilmemiş veya zaten onaylanmış.' });
      }

      const finalBakiye = adminBakiye !== null ? adminBakiye : Number(yanit.secilen_bakiye || 0);

      // Bütçeyi dönem dokümanına yaz (mevcut devredilen ve merkez desteğini koru)
      const donemVeri = await getDonemVeri(subeKod, kampanya.donem_baslangic, kampanya.donem_bitis) || {};
      await upsertButce(
          subeKod, 
          kampanya.donem_baslangic, 
          kampanya.donem_bitis, 
          finalBakiye, 
          donemVeri.devredilen_miktar || 0,
          donemVeri.merkez_destegi || 0
      );

      // Yanıt durumunu güncelle
      await BUTCE_DOC_REF.update({
        [`kampanyalar.${id}.yanitlar.${subeKod}.durum`]: 'onaylandi',
        ...(adminBakiye !== null && { [`kampanyalar.${id}.yanitlar.${subeKod}.secilen_bakiye`]: finalBakiye })
      });

      // Meta'dan verileri otomatik çek (Arka planda)
      const { donem_baslangic, donem_bitis } = kampanya;
      getSettings().then(async (settings) => {
        if (settings?.metaApiToken) {
          try {
            await campaignBasedImport(settings.metaApiToken, donem_baslangic, donem_bitis, subeKod);
            console.log(`[Budget] ${subeKod} için Meta verisi otomatik çekildi.`);
            // Not: campaignBasedImport içinde recalcSubeAggregates zaten çağrılıyor
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


// GET /butce-durum — Tüm şubelerin bütçe durumunu döner
// Cache, Firestore'daki veri versiyonuyla doğrulanır (multi-instance güvenli, HIT = 1 read)
const butceDurumCache = new Map();

router.get(
  '/butce-durum',
  verifyToken,
  requirePermission('budget.view'),
  async (req, res) => {
    try {
      const { since, until } = req.query;
      if (!since || !until) {
        return res.status(400).json({ error: 'since ve until parametreleri zorunludur.' });
      }

      // Kapsam: admin tüm şubeleri, sube_sahibi yalnızca kendi şubesini görür
      const isAdmin = req.user.role === 'admin';
      const scope = isAdmin ? 'all' : (req.user.subeSlug || 'none');

      // Cache kontrol — veri versiyonu + kapsam eşleşiyorsa servis et
      const version = await getDataVersion();
      const cacheKey = `${since}_${until}#${scope}`;
      const cached = butceDurumCache.get(cacheKey);
      if (cached && cached.v === version) {
        return res.json(cached.data);
      }

      // Optimizasyon: getAllSubeler() zaten donem_ozetleri içeriyor
      // Her şube için ayrı getDonemVeri() çağırmak yerine donem_ozetleri'nden oku (0 ek read!)
      let subeler = await getAllSubeler();
      if (!isAdmin) {
        subeler = subeler.filter(s => s.kod === req.user.subeSlug);
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

        // Kullanım oranı ve durum hesapla
        let kullanimOrani = 0;
        let durum = null;
        if (planlananButce > 0) {
          kullanimOrani = toplamButce > 0 ? Math.round((harcama / toplamButce) * 1000) / 10 : 0;
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

      const bekleyenler = Object.entries(kampanyalar)
        .filter(([, k]) => {
          return k.durum === 'aktif' && k.yanitlar?.[subeSlug]?.durum === 'bekliyor';
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
          yanit: data.yanitlar[subeSlug],
        }));

      res.json({ kampanyalar: bekleyenler });
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
      if (!kampanya.yanitlar?.[subeKod]) {
        return res.status(403).json({ error: 'Bu kampanyada şubeniz için yanıt kaydı bulunamadı.' });
      }

      // Dekont upload
      let dekontUrl = null;
      if (req.file) {
        const ext = req.file.originalname.split('.').pop().toLowerCase();
        const key = `dekontlar/${kampanyaId}/${subeKod}.${ext}`;
        dekontUrl = await uploadFile(req.file.buffer, key, req.file.mimetype);
      }

      const yanitData = {
        durum: 'gonderildi',
        secilen_bakiye: numBakiye,
        kdv_dahil_tutar: numKdvTutar,
        notlar: notlar || null,
        dekont_url: dekontUrl,
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
