import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../config/firebase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

/**
 * İş başvuruları — QR menüsünün altındaki "İş Başvurusu Yap" formundan gelir.
 *
 * - POST /      : HERKESE AÇIK (auth yok)
 * - GET  /      : admin tümünü, şube sahibi YALNIZCA kendi şubesini görür
 * - PATCH /:id  : durum / dahili not (şube sahibi yalnızca kendi şubesinde)
 * - DELETE /:id : yalnızca admin
 *
 * Firestore: `is_basvurulari`. Şube, müşteriden DEĞİL QR menüsünün bulunduğu
 * slug'dan gelir — başvuru doğrudan ilgili şubeye ve merkeze düşer.
 */

const KOLEKSIYON = 'is_basvurulari';

// WordPress formundaki seçeneklerle birebir
const CALISMA_TIPLERI = ['tam_zamanli', 'yari_zamanli', 'donemsel'];
const BECERILER = [
    'kasa', 'pos', 'servis', 'tezgahtarlik',
    'paketleme', 'hijyen', 'ekip', 'yogun_tempo',
];
const EVET_HAYIR = ['evet', 'hayir'];
const DURUMLAR = ['yeni', 'degerlendiriliyor', 'gorusme', 'olumlu', 'olumsuz'];

const LIMITLER = {
    ad: 80, soyad: 80, email: 120, telefon: 30, tarih: 30,
    musaitlik: 500, detay: 1000, referans: 500, not: 3000,
};

const temizle = (v, max) => String(v ?? '').trim().slice(0, max);
const gecerliEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Herkese açık POST için sıkı limit — aynı IP saatte en fazla 5 başvuru
const basvuruLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla başvuru gönderdiniz. Lütfen daha sonra tekrar deneyin.' },
    validate: { xForwardedForHeader: false, trustProxy: false },
});

/**
 * POST /api/isbasvuru
 */
router.post(
    '/',
    basvuruLimiter,
    asyncHandler(async (req, res) => {
        if (temizle(req.body.website, 200)) {
            return res.json({ success: true }); // honeypot — bot
        }

        const subeSlug = temizle(req.body.subeSlug, 60);
        const calismaTipi = temizle(req.body.calismaTipi, 30);
        const gidaDeneyimi = temizle(req.body.gidaDeneyimi, 10);
        const halenCalisiyor = temizle(req.body.halenCalisiyor, 10);
        // Yalnızca tanımlı beceri anahtarlarını al — uydurma değer sızmasın
        const beceriler = Array.isArray(req.body.beceriler)
            ? [...new Set(req.body.beceriler.filter((b) => BECERILER.includes(b)))]
            : [];

        const veri = {
            ad: temizle(req.body.ad, LIMITLER.ad),
            soyad: temizle(req.body.soyad, LIMITLER.soyad),
            dogumTarihi: temizle(req.body.dogumTarihi, LIMITLER.tarih),
            telefon: temizle(req.body.telefon, LIMITLER.telefon),
            email: temizle(req.body.email, LIMITLER.email),
            musaitlik: temizle(req.body.musaitlik, LIMITLER.musaitlik),
            gidaDeneyimiDetay: temizle(req.body.gidaDeneyimiDetay, LIMITLER.detay),
            markaDeneyimi: temizle(req.body.markaDeneyimi, LIMITLER.detay),
            baslangicTarihi: temizle(req.body.baslangicTarihi, LIMITLER.tarih),
            referans: temizle(req.body.referans, LIMITLER.referans),
        };

        const eksik = [];
        if (!subeSlug) eksik.push('subeSlug');
        for (const k of ['ad', 'soyad', 'dogumTarihi', 'telefon', 'email', 'musaitlik']) {
            if (!veri[k]) eksik.push(k);
        }
        if (eksik.length > 0) {
            return res.status(400).json({ error: 'Lütfen zorunlu alanları doldurun.', eksik });
        }
        if (!gecerliEmail(veri.email)) {
            return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });
        }
        if (!CALISMA_TIPLERI.includes(calismaTipi)) {
            return res.status(400).json({ error: 'Lütfen çalışma tipini seçin.' });
        }
        if (beceriler.length === 0) {
            return res.status(400).json({ error: 'Lütfen en az bir beceri seçin.' });
        }
        if (!EVET_HAYIR.includes(gidaDeneyimi) || !EVET_HAYIR.includes(halenCalisiyor)) {
            return res.status(400).json({ error: 'Lütfen evet/hayır sorularını yanıtlayın.' });
        }
        if (req.body.kvkkOnay !== true) {
            return res.status(400).json({ error: 'Devam etmek için aydınlatma metnini onaylamanız gerekir.' });
        }

        const subeDoc = await db.collection('subeler').doc(subeSlug).get();
        if (!subeDoc.exists) {
            return res.status(404).json({ error: 'Şube bulunamadı.' });
        }

        await db.collection(KOLEKSIYON).add({
            ...veri,
            subeSlug,
            subeAd: subeDoc.data().ad || subeSlug,
            calismaTipi,
            beceriler,
            gidaDeneyimi,
            halenCalisiyor,
            kvkkOnay: true,
            durum: 'yeni',
            not: '',
            olusturmaZamani: new Date().toISOString(),
        });

        res.json({ success: true });
    })
);

/**
 * GET /api/isbasvuru
 * Admin tümünü; şube sahibi YALNIZCA kendi şubesini (kapsam token'dan zorlanır).
 */
router.get(
    '/',
    verifyToken,
    requirePermission('isbasvuru.view'),
    asyncHandler(async (req, res) => {
        let query = db.collection(KOLEKSIYON);

        if (req.user.role !== 'admin') {
            if (!req.user.subeSlug) {
                return res.status(403).json({ error: 'Şubenize ait bir kayıt bulunamadı.' });
            }
            query = query.where('subeSlug', '==', req.user.subeSlug);
        } else if (req.query.sube) {
            query = query.where('subeSlug', '==', String(req.query.sube));
        }

        const { durum } = req.query;
        if (durum && DURUMLAR.includes(durum)) {
            query = query.where('durum', '==', durum);
        }

        const snap = await query.orderBy('olusturmaZamani', 'desc').get();
        const basvurular = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const sayac = DURUMLAR.reduce((acc, d) => ({ ...acc, [d]: 0 }), {});
        for (const b of basvurular) {
            if (b.durum in sayac) sayac[b.durum] += 1;
        }

        res.json({ basvurular, sayac, toplam: basvurular.length });
    })
);

/**
 * PATCH /api/isbasvuru/:id
 */
router.patch(
    '/:id',
    verifyToken,
    requirePermission('isbasvuru.manage'),
    asyncHandler(async (req, res) => {
        const ref = db.collection(KOLEKSIYON).doc(req.params.id);
        const doc = await ref.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Başvuru bulunamadı.' });
        }
        if (req.user.role !== 'admin' && doc.data().subeSlug !== req.user.subeSlug) {
            return res.status(403).json({ error: 'Bu başvuru sizin şubenize ait değil.' });
        }

        const guncelleme = {};
        if (req.body.durum !== undefined) {
            if (!DURUMLAR.includes(req.body.durum)) {
                return res.status(400).json({ error: 'Geçersiz durum.' });
            }
            guncelleme.durum = req.body.durum;
        }
        if (req.body.not !== undefined) {
            guncelleme.not = temizle(req.body.not, LIMITLER.not);
        }
        if (Object.keys(guncelleme).length === 0) {
            return res.status(400).json({ error: 'Güncellenecek alan yok.' });
        }
        guncelleme.guncellemeZamani = new Date().toISOString();

        await ref.update(guncelleme);
        res.json({ success: true });
    })
);

/**
 * DELETE /api/isbasvuru/:id — yalnızca admin
 */
router.delete(
    '/:id',
    verifyToken,
    requirePermission('isbasvuru.delete'),
    asyncHandler(async (req, res) => {
        await db.collection(KOLEKSIYON).doc(req.params.id).delete();
        res.json({ success: true });
    })
);

export default router;
