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

// ── Doğrulama yardımcıları (Bulgu #4, #15, #18, #20, #21) ──

// Gerçekçi kampanya bütçelerinin çok üzerinde bir üst sınır — yanlışlıkla/kötü
// niyetle girilen astronomik tutarları ("999999999" vb.) reddetmek için.
const TAVAN_TUTAR = 10_000_000;

// Kayan nokta karşılaştırmasında tolerans (ör. "1000" vs 1000.0000000001)
const BAKIYE_EPSILON = 0.01;

// Sonlu, verilen aralıkta bir sayı mı? (string/NaN/negatif/aşırı büyük tutarları eler)
function isGecerliTutar(deger, { min = 0.01, max = TAVAN_TUTAR } = {}) {
  const n = Number(deger);
  return Number.isFinite(n) && n >= min && n <= max;
}

// Seçilen bakiye, kampanyanın sunduğu menü seçeneklerinden biri mi? (Bulgu #4)
function bakiyeMenudeVarMi(deger, bakiyeSecenekleri) {
  const n = Number(deger);
  if (!Number.isFinite(n)) return false;
  return Array.isArray(bakiyeSecenekleri) && bakiyeSecenekleri.some(
    (o) => Math.abs(Number(o?.bakiye) - n) < BAKIYE_EPSILON
  );
}

// Katı YYYY-MM-DD biçimi + takvimde gerçekten var olan bir tarih mi? (Bulgu #21)
const TARIH_REGEX = /^\d{4}-\d{2}-\d{2}$/;
function isGecerliTarih(str) {
  if (typeof str !== 'string' || !TARIH_REGEX.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

// Dekont dosyasının depolanan Content-Type'ı UZANTIDAN türetilir — istemcinin
// gönderdiği (sahtelenebilir) mimetype'a asla güvenilmez (Bulgu #9-yazma).
const DEKONT_CONTENT_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

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
      // Tarih formatı/aralık doğrulama (Bulgu #21) — bozuk formatlı tarih dönem
      // gizli-yazma ve gönderim-kapısı sözlüksel karşılaştırmasını sessizce bozardı
      if (!isGecerliTarih(donem_baslangic) || !isGecerliTarih(donem_bitis) || !isGecerliTarih(son_tarih)) {
        return res.status(400).json({ error: 'Tarih alanları geçerli bir YYYY-MM-DD tarihi olmalıdır.' });
      }
      if (donem_baslangic > donem_bitis) {
        return res.status(400).json({ error: 'Dönem başlangıcı, bitiş tarihinden sonra olamaz.' });
      }

      // Şube listesi kampanya dokümanından bağımsız — transaction dışında çekilebilir
      const subeler = await getAllSubeler();
      const kampanyaId = `${donem_baslangic}_${donem_bitis}`;

      // Bulgu #10 TOCTOU düzeltmesi: "aynı dönem var mı" kontrolü + yeni kampanya
      // yazımı + tavan aşımında en eskiyi silme tek transaction'da yapılır — iki
      // eşzamanlı oluşturma isteği artık aynı bayat sayıyı okuyup tavanı aşamaz
      // veya yanlış "en eski" kampanyayı silemez (Firestore transaction'ı çakışan
      // yazımda otomatik retry eder).
      let yeniKampanya;
      let eskiKampanya = null;
      try {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(BUTCE_DOC_REF);
          const kampanyalar = snap.exists ? (snap.data().kampanyalar || {}) : {};

          // Aynı döneme ait kampanya varsa ezme — yanıtlar sıfırlanır, veri kaybolur
          if (kampanyalar[kampanyaId]) {
            const e = new Error('Bu döneme ait bir kampanya zaten var. Önce onu silin veya düzenleyin.');
            e.status = 400;
            throw e;
          }

          // Yanitlar map oluştur — tüm şubeler "bekliyor"
          const yanitlar = {};
          for (const sube of subeler) {
            yanitlar[sube.kod] = bosYanit();
          }

          yeniKampanya = {
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

          const updates = { [`kampanyalar.${kampanyaId}`]: yeniKampanya };

          // Max 6 kampanya kontrolü — aynı transaction'da okunan güncel sayıya göre;
          // en eskisini sil. FieldValue.delete() şart: dot-path update anahtarı siler.
          if (Object.keys(kampanyalar).length >= MAX_KAMPANYA) {
            const entries = Object.entries(kampanyalar)
              .sort((a, b) => new Date(a[1].createdAt) - new Date(b[1].createdAt));
            const [eskiId, eski] = entries[0];
            updates[`kampanyalar.${eskiId}`] = admin.firestore.FieldValue.delete();
            eskiKampanya = eski;
          }

          if (snap.exists) tx.update(BUTCE_DOC_REF, updates);
          else tx.set(BUTCE_DOC_REF, { kampanyalar: { [kampanyaId]: yeniKampanya } });
        });
      } catch (e) {
        if (e.status) return res.status(e.status).json({ error: e.message });
        throw e;
      }

      // R2 dekont temizliği doküman yazımını bloklamasın, hatası oluşturmayı düşürmesin
      if (eskiKampanya) {
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

      // Tarih formatı doğrulama (Bulgu #21) — gönderilmişse geçerli YYYY-MM-DD olmalı
      if (son_tarih !== undefined && !isGecerliTarih(son_tarih)) {
        return res.status(400).json({ error: 'Son tarih geçerli bir YYYY-MM-DD tarihi olmalıdır.' });
      }

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

      // Gönderilmiş yanıtlar arasından, tutarı hâlâ menü seçeneklerinden biri ve
      // sonlu/pozitif/tavan altında olanlar onaya alınır (Bulgu #4 savunma
      // derinliği — submit-zamanı kontrolünden geçmemiş eski/bozuk veri onaya girmesin).
      const gonderilenler = Object.entries(yanitlar).filter(([, y]) => y.durum === 'gonderildi');
      const yazimHatalari = [];
      const uygunSubeKodlari = [];
      for (const [subeKod, yanit] of gonderilenler) {
        if (bakiyeMenudeVarMi(yanit.secilen_bakiye, kampanya.bakiye_secenekleri) && isGecerliTutar(yanit.secilen_bakiye)) {
          uygunSubeKodlari.push(subeKod);
        } else {
          yazimHatalari.push(`${subeKod}: geçersiz bakiye tutarı`);
        }
      }

      // Gönderilmiş yanıtların dönem verilerini tek toplu okumayla al (döngüde tekil get yok)
      const donemVeriler = await getDonemVeriMap(
        uygunSubeKodlari,
        kampanya.donem_baslangic,
        kampanya.donem_bitis
      );

      try {
        // Bulgu #18 TOCTOU düzeltmesi: her şube için "durum hâlâ gonderildi mi" +
        // "güncel secilen_bakiye" tek transaction'da okunup durum ONAYLANDI'ya
        // çevrilir — okuma ile dönem yazımı arasında şube yeniden gönderim yapsa
        // bile eski/tutarsız değer donmaz; sonraki gönderim mevcut 'onaylandi'
        // guard'ına (bkz. /butce-gonder) çarpar ve reddedilir.
        const yazimlar = await Promise.allSettled(uygunSubeKodlari.map(async (subeKod) => {
          const guncelBakiye = await db.runTransaction(async (tx) => {
            const snap = await tx.get(BUTCE_DOC_REF);
            const guncelYanit = snap.data()?.kampanyalar?.[id]?.yanitlar?.[subeKod];
            if (!guncelYanit || guncelYanit.durum !== 'gonderildi') {
              return null; // eşzamanlı işlemle durum değişmiş — atla
            }
            tx.update(BUTCE_DOC_REF, { [`kampanyalar.${id}.yanitlar.${subeKod}.durum`]: 'onaylandi' });
            return guncelYanit.secilen_bakiye;
          });

          if (guncelBakiye === null) {
            throw new Error('durum eşzamanlı işlemle değişti');
          }

          const donemVeri = donemVeriler[subeKod] || {};
          try {
            await upsertButce(
              subeKod,
              kampanya.donem_baslangic,
              kampanya.donem_bitis,
              guncelBakiye,
              donemVeri.devredilen_miktar || 0,
              donemVeri.merkez_destegi || 0,
              { skipBump: true } // versiyon toplu yazım sonunda bir kez artırılır
            );
          } catch (yazimErr) {
            // Dönem yazımı başarısız oldu — durumu geri al ki "onaylandı" görünüp
            // bütçesi aslında yazılmamış bir şube kalmasın; şube yeniden gönderebilir
            // veya admin tekrar dener.
            await BUTCE_DOC_REF.update({ [`kampanyalar.${id}.yanitlar.${subeKod}.durum`]: 'gonderildi' }).catch(() => {});
            throw yazimErr;
          }
          return subeKod;
        }));

        yazimlar.forEach((sonuc, i) => {
          const subeKod = uygunSubeKodlari[i];
          if (sonuc.status === 'fulfilled') {
            onaylananSubeler.push(subeKod);
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
        // Kısmi hatada da: durum flip'i her şube için kendi transaction'ında zaten
        // işlendi (yukarıda); burada yalnızca kampanya seviyesi durum güncellenir ve
        // versiyon ilerletilir — yoksa dönem dokümanına yazılan bütçelerle ekran ayrışır
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

      // Admin-taraflı tutar doğrulama (Bulgu #4/#15) — string/NaN/negatif/aşırı
      // büyük tutar dönem bütçesine yazılmasın
      if (adminBakiye !== null && !isGecerliTutar(adminBakiye)) {
        return res.status(400).json({ error: 'Geçerli bir bakiye tutarı girin.' });
      }
      if (adminMerkez !== null && !isGecerliTutar(adminMerkez, { min: 0 })) {
        return res.status(400).json({ error: 'Geçerli bir merkez desteği tutarı girin.' });
      }
      if (adminKdv !== null && !isGecerliTutar(adminKdv)) {
        return res.status(400).json({ error: 'Geçerli bir KDV dahil tutar girin.' });
      }

      // Bakiye girilmemişse: yalnızca "gönderildi" ya da zaten "onaylandi" (güncelleme) ise devam
      if (adminBakiye === null && yanit?.durum !== 'gonderildi' && yanit?.durum !== 'onaylandi') {
        return res.status(400).json({ error: 'Onaylamak için bir bakiye girin (bu şube henüz bildirim göndermemiş).' });
      }

      const finalBakiye = adminBakiye !== null ? adminBakiye : Number(yanit?.secilen_bakiye || 0);
      // Eski/bozuk veri (bu doğrulamadan önce yazılmış) onaya girmesin
      if (!isGecerliTutar(finalBakiye)) {
        return res.status(400).json({ error: 'Onaylanacak bakiye tutarı geçersiz — admin bir bakiye girerek düzeltin.' });
      }

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
      // Bulgu #5: subeSlug claim'i boş/eksik bir non-admin, hedefKod hesaplaması
      // sonunda null kalırsa aşağıdaki else dalı getAllSubeler() ile TÜM şubelerin
      // bütçesini dönerdi — yalnızca admin kapsamsız (tüm şube) sorguya erişebilir.
      if (!isAdmin && !hedefKod) {
        return res.status(403).json({ error: 'Bu bilgiye erişim yetkiniz yok' });
      }
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

      // Bulgu #4: seçilen bakiye kampanyanın sunduğu menü seçeneklerinden biri
      // olmalı (kayan nokta toleransıyla) — menü dışı/uydurma bir tutar yazılamaz.
      if (!bakiyeMenudeVarMi(secilen_bakiye, kampanya.bakiye_secenekleri)) {
        return res.status(400).json({ error: 'Seçilen bakiye bu kampanyanın sunduğu seçeneklerden biri değil.' });
      }

      const numBakiye = Number(secilen_bakiye);
      const numKdvTutar = Number(kdv_dahil_tutar);

      // Sonlu + pozitif + makul üst sınır kontrolü (Bulgu #4, #20) — multipart'tan
      // string geldiği için yalnızca isNaN yetmez; işaret/aralık da doğrulanmalı
      if (!isGecerliTutar(numBakiye) || !isGecerliTutar(numKdvTutar)) {
        return res.status(400).json({ error: 'Seçilen bakiye ve KDV dahil tutar geçerli, pozitif bir sayı olmalıdır.' });
      }

      // Dekont upload
      let dekontUrl = null;
      if (req.file) {
        const ext = req.file.originalname.split('.').pop().toLowerCase();
        const key = `dekontlar/${kampanyaId}/${subeKod}.${ext}`;
        // Bulgu #9-yazma: depolanan Content-Type saldırgan-kontrollü
        // req.file.mimetype'tan DEĞİL, sunucu tarafında uzantıdan türetilir —
        // aksi halde sahte Content-Type ile dekontu açan admin'e stored XSS mümkün olur.
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
