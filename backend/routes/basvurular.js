import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../config/firebase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

/**
 * Franchise başvuruları — pazarlama sitesinden (sutlucekadayif.com) gelir.
 *
 * - POST /            : HERKESE AÇIK. Site formu buraya gönderir (auth yok).
 * - GET  /            : admin — başvuru listesi
 * - PATCH /:id        : admin — durum / dahili not güncelle
 * - DELETE /:id       : admin — başvuru sil
 *
 * Firestore: `franchise_basvurulari` koleksiyonu. Şirket geneli veri olduğundan
 * şube sahipleri erişemez (bkz. permissions: basvurular.view/manage → admin).
 */

const KOLEKSIYON = 'franchise_basvurulari';

// Başvuru yaşam döngüsü durumları — PATCH yalnızca bu değerleri kabul eder
const DURUMLAR = ['yeni', 'inceleniyor', 'gorusuldu', 'olumlu', 'olumsuz'];

// Metin alanları için üst sınırlar (kötüye kullanım / şişkin doküman engeli)
const LIMITLER = { ad: 80, soyad: 80, email: 120, telefon: 30, il: 40, ilce: 60, mesaj: 2000 };

const temizle = (v, max) => String(v ?? '').trim().slice(0, max);
const gecerliEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Herkese açık POST için ayrı, sıkı limit (genel limiter'a ek). Aynı IP saatte
// en fazla 8 başvuru gönderebilir — spam / form bombardımanı engeli.
const basvuruLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 saat
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla başvuru gönderdiniz. Lütfen daha sonra tekrar deneyin.' },
    validate: { xForwardedForHeader: false, trustProxy: false },
});

/**
 * POST /api/basvurular
 * Pazarlama sitesindeki franchise formundan gelen başvuruyu kaydeder.
 * Auth GEREKMEZ (herkese açık). Honeypot + doğrulama + rate limit ile korunur.
 */
router.post(
    '/',
    basvuruLimiter,
    asyncHandler(async (req, res) => {
        // Honeypot: gizli `website` alanı doluysa bot — kaydetmeden başarı taklidi et
        if (temizle(req.body.website, 200)) {
            return res.json({ success: true });
        }

        const veri = {
            ad: temizle(req.body.ad, LIMITLER.ad),
            soyad: temizle(req.body.soyad, LIMITLER.soyad),
            email: temizle(req.body.email, LIMITLER.email),
            telefon: temizle(req.body.telefon, LIMITLER.telefon),
            il: temizle(req.body.il, LIMITLER.il),
            ilce: temizle(req.body.ilce, LIMITLER.ilce),
            mesaj: temizle(req.body.mesaj, LIMITLER.mesaj),
        };

        // Zorunlu alanlar
        const eksik = [];
        for (const k of ['ad', 'soyad', 'email', 'telefon', 'il']) {
            if (!veri[k]) eksik.push(k);
        }
        if (eksik.length > 0) {
            return res.status(400).json({ error: 'Lütfen zorunlu alanları doldurun.', eksik });
        }
        if (!gecerliEmail(veri.email)) {
            return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });
        }

        await db.collection(KOLEKSIYON).add({
            ...veri,
            durum: 'yeni',
            not: '',
            olusturmaZamani: new Date().toISOString(),
        });

        res.json({ success: true });
    })
);

/**
 * GET /api/basvurular
 * Başvuru listesi (en yeni önce). Opsiyonel ?durum= filtresi.
 */
router.get(
    '/',
    verifyToken,
    requirePermission('basvurular.view'),
    asyncHandler(async (req, res) => {
        let query = db.collection(KOLEKSIYON);
        const { durum } = req.query;
        if (durum && DURUMLAR.includes(durum)) {
            query = query.where('durum', '==', durum);
        }
        // ISO string alanı olduğundan sözlüksel sıralama = kronolojik sıralama
        const snap = await query.orderBy('olusturmaZamani', 'desc').get();
        const basvurular = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Özet sayaç (durum rozetleri için) — tek sorgudan türetilir, ek okuma yok
        const sayac = DURUMLAR.reduce((acc, d) => ({ ...acc, [d]: 0 }), {});
        for (const b of basvurular) {
            if (b.durum in sayac) sayac[b.durum] += 1;
        }

        res.json({ basvurular, sayac, toplam: basvurular.length });
    })
);

/**
 * PATCH /api/basvurular/:id
 * Durum ve/veya dahili not günceller (yalnızca bu iki alan yazılabilir).
 */
router.patch(
    '/:id',
    verifyToken,
    requirePermission('basvurular.manage'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const ref = db.collection(KOLEKSIYON).doc(id);
        const doc = await ref.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Başvuru bulunamadı.' });
        }

        const guncelleme = {};
        if (req.body.durum !== undefined) {
            if (!DURUMLAR.includes(req.body.durum)) {
                return res.status(400).json({ error: 'Geçersiz durum.' });
            }
            guncelleme.durum = req.body.durum;
        }
        if (req.body.not !== undefined) {
            guncelleme.not = temizle(req.body.not, LIMITLER.mesaj);
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
 * DELETE /api/basvurular/:id
 * Başvuruyu kalıcı olarak siler.
 */
router.delete(
    '/:id',
    verifyToken,
    requirePermission('basvurular.manage'),
    asyncHandler(async (req, res) => {
        await db.collection(KOLEKSIYON).doc(req.params.id).delete();
        res.json({ success: true });
    })
);

export default router;
