import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../config/firebase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

/**
 * Şikayet & geri bildirim — QR menüsündeki "İletişim" formundan gelir.
 *
 * - POST /      : HERKESE AÇIK. Müşteri QR menüsünden gönderir (auth yok).
 * - GET  /      : admin tümünü, şube sahibi YALNIZCA kendi şubesini görür
 * - PATCH /:id  : durum / dahili not (şube sahibi yalnızca kendi şubesinde)
 * - DELETE /:id : yalnızca admin — şube kendi hakkındaki kaydı silemesin
 *
 * Firestore: `geri_bildirimler`. Şube bilgisi müşteriden DEĞİL, QR menüsünün
 * bulunduğu şube slug'ından gelir (menü zaten şube bazlı), böylece yanlış şube
 * seçilemez.
 */

const KOLEKSIYON = 'geri_bildirimler';

// WordPress formundaki kategorilerle birebir
const KATEGORILER = ['urun_kalitesi', 'servis', 'temizlik', 'fiyat', 'diger'];
const DURUMLAR = ['yeni', 'inceleniyor', 'cozuldu', 'kapatildi'];

const LIMITLER = { ad: 80, soyad: 80, email: 120, telefon: 30, mesaj: 3000, olayTarihi: 30 };

const temizle = (v, max) => String(v ?? '').trim().slice(0, max);
const gecerliEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Herkese açık POST için sıkı limit — aynı IP saatte en fazla 10 bildirim
const bildirimLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla gönderim yaptınız. Lütfen daha sonra tekrar deneyin.' },
    validate: { xForwardedForHeader: false, trustProxy: false },
});

/**
 * POST /api/geribildirim
 * QR menüsündeki şikayet/geri bildirim formundan gelen kaydı oluşturur.
 */
router.post(
    '/',
    bildirimLimiter,
    asyncHandler(async (req, res) => {
        // Honeypot — dolu ise bot; kaydetmeden başarı taklidi et
        if (temizle(req.body.website, 200)) {
            return res.json({ success: true });
        }

        const subeSlug = temizle(req.body.subeSlug, 60);
        const kategori = temizle(req.body.kategori, 40);
        const veri = {
            ad: temizle(req.body.ad, LIMITLER.ad),
            soyad: temizle(req.body.soyad, LIMITLER.soyad),
            email: temizle(req.body.email, LIMITLER.email),
            telefon: temizle(req.body.telefon, LIMITLER.telefon),
            mesaj: temizle(req.body.mesaj, LIMITLER.mesaj),
            olayTarihi: temizle(req.body.olayTarihi, LIMITLER.olayTarihi),
        };

        const eksik = [];
        if (!subeSlug) eksik.push('subeSlug');
        for (const k of ['ad', 'soyad', 'email', 'telefon', 'mesaj']) {
            if (!veri[k]) eksik.push(k);
        }
        if (eksik.length > 0) {
            return res.status(400).json({ error: 'Lütfen zorunlu alanları doldurun.', eksik });
        }
        if (!KATEGORILER.includes(kategori)) {
            return res.status(400).json({ error: 'Lütfen bir konu seçin.' });
        }
        if (!gecerliEmail(veri.email)) {
            return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });
        }
        // KVKK aydınlatma onayı zorunlu — onaysız kişisel veri işlenmez
        if (req.body.kvkkOnay !== true) {
            return res.status(400).json({ error: 'Devam etmek için aydınlatma metnini onaylamanız gerekir.' });
        }

        // Şube gerçekten var mı — uydurma slug ile kayıt açılmasın
        const subeDoc = await db.collection('subeler').doc(subeSlug).get();
        if (!subeDoc.exists) {
            return res.status(404).json({ error: 'Şube bulunamadı.' });
        }

        await db.collection(KOLEKSIYON).add({
            ...veri,
            subeSlug,
            subeAd: subeDoc.data().ad || subeSlug,
            kategori,
            kvkkOnay: true,
            durum: 'yeni',
            not: '',
            olusturmaZamani: new Date().toISOString(),
        });

        res.json({ success: true });
    })
);

/**
 * GET /api/geribildirim
 * Admin tümünü görür; şube sahibi YALNIZCA kendi şubesini (sorgu parametresine
 * güvenilmez — kapsam token'daki subeSlug'dan zorlanır).
 */
router.get(
    '/',
    verifyToken,
    requirePermission('geribildirim.view'),
    asyncHandler(async (req, res) => {
        let query = db.collection(KOLEKSIYON);

        // Şube sahibi yalnızca kendi şubesi — kapsam sorgu parametresinden değil
        // token'daki subeSlug'dan gelir. Bu filtre `geri_bildirimler` üzerinde
        // (subeSlug ASC, olusturmaZamani DESC) bileşik indeksi gerektirir;
        // firestore.indexes.json'da tanımlı.
        if (req.user.role !== 'admin') {
            if (!req.user.subeSlug) {
                return res.status(403).json({ error: 'Şubenize ait bir kayıt bulunamadı.' });
            }
            query = query.where('subeSlug', '==', req.user.subeSlug);
        }

        // Durum filtresi bilinçli olarak sunucuda yok — ekran tüm kayıtları çekip
        // tarayıcıda filtreliyor; sunucu filtresi ek indeks isterdi, okuma
        // tasarrufu sağlamazdı.
        const snap = await query.orderBy('olusturmaZamani', 'desc').get();
        const bildirimler = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Sayaçlar tek sorgudan türetilir — ek okuma yok
        const sayac = DURUMLAR.reduce((acc, d) => ({ ...acc, [d]: 0 }), {});
        for (const b of bildirimler) {
            if (b.durum in sayac) sayac[b.durum] += 1;
        }

        res.json({ bildirimler, sayac, toplam: bildirimler.length });
    })
);

/**
 * PATCH /api/geribildirim/:id
 * Durum ve/veya dahili not. Şube sahibi yalnızca kendi şubesinin kaydına dokunabilir.
 */
router.patch(
    '/:id',
    verifyToken,
    requirePermission('geribildirim.manage'),
    asyncHandler(async (req, res) => {
        const ref = db.collection(KOLEKSIYON).doc(req.params.id);
        const doc = await ref.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Kayıt bulunamadı.' });
        }
        // Şube sahibi başka şubenin kaydını güncelleyemez
        if (req.user.role !== 'admin' && doc.data().subeSlug !== req.user.subeSlug) {
            return res.status(403).json({ error: 'Bu kayıt sizin şubenize ait değil.' });
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
 * DELETE /api/geribildirim/:id
 * YALNIZCA admin — şube sahibi kendi hakkındaki şikayeti silememeli
 * (kayıt bütünlüğü). Bu yüzden ayrı bir izin anahtarı kullanılır.
 */
router.delete(
    '/:id',
    verifyToken,
    requirePermission('geribildirim.delete'),
    asyncHandler(async (req, res) => {
        await db.collection(KOLEKSIYON).doc(req.params.id).delete();
        res.json({ success: true });
    })
);

export default router;
