import { Router } from 'express';
import { db } from '../../../config/firebase.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { cacheMiddleware } from '../../../middleware/cache.js';

const router = Router();

/**
 * GET /api/menu/subeler
 * Tüm şubeleri listele (dropdown'lar için)
 */
router.get(
    '/subeler',
    asyncHandler(async (req, res) => {
        const snap = await db.collection('subeler').get();
        const subeler = [];
        snap.forEach((d) => subeler.push({ slug: d.id, ...d.data() }));
        res.json({ subeler });
    })
);

/**
 * GET /api/menu/:subeSlug
 * Public endpoint — müşteriler için şube menüsü
 * Auth gerektirmez, QR kod ile açılır
 */
router.get(
    '/:subeSlug',
    cacheMiddleware(60),
    asyncHandler(async (req, res) => {
        const { subeSlug } = req.params;

        // Paralel sorgular — hız optimizasyonu
        const [subeDoc, katSnap, ozelSnap, ortakSnap] = await Promise.all([
            db.collection('subeler').doc(subeSlug).get(),
            db.collection('kategoriler').orderBy('sira', 'asc').get(),
            db.collection('urunler').where('tur', '==', 'sube_ozel').where('sube_slug', '==', subeSlug).get(),
            db.collection('urunler').where('tur', '==', 'ortak').get(),
        ]);

        if (!subeDoc.exists) {
            return res.status(404).json({ error: 'Şube bulunamadı' });
        }
        const sube = { id: subeDoc.id, ...subeDoc.data() };

        const kategoriler = [];
        katSnap.forEach((d) => kategoriler.push({ id: d.id, ...d.data() }));

        const tumUrunler = [];

        ozelSnap.forEach((d) => {
            const data = d.data();
            if (data.deletedAt) return;
            const mevcutDegil = data.mevcut_degil || [];
            if (!mevcutDegil.includes(subeSlug)) {
                tumUrunler.push({ id: d.id, ...data });
            }
        });

        // Ortak ürünleri filtrele: mevcut_degil'de bu şube varsa gösterme
        ortakSnap.forEach((d) => {
            const data = d.data();
            if (data.deletedAt) return;
            const mevcutDegil = data.mevcut_degil || [];
            if (!mevcutDegil.includes(subeSlug)) {
                tumUrunler.push({ id: d.id, ...data });
            }
        });

        // Kategoriye göre grupla
        const urunlerByKategori = {};
        tumUrunler.forEach((urun) => {
            const kat = urun.kategori || 'diger';
            if (!urunlerByKategori[kat]) urunlerByKategori[kat] = [];
            urunlerByKategori[kat].push(urun);
        });

        res.json({
            sube,
            kategoriler,
            urunlerByKategori,
        });
    })
);

/**
 * POST /api/menu/regenerate-cache
 * Tüm şubelerin menü JSON'larını yeniden oluştur
 */
router.post(
    '/regenerate-cache',
    asyncHandler(async (req, res) => {
        const { regenerateAllMenuJsons } = await import('../services/menu-cache.js');
        await regenerateAllMenuJsons();
        res.json({ success: true, message: 'Tüm menü JSON cache\'leri yenilendi' });
    })
);

export default router;
