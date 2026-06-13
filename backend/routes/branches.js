import { Router } from 'express';
import { db } from '../config/firebase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

/**
 * GET /api/branches
 * Tüm şubeleri listele
 */
router.get(
    '/',
    verifyToken,
    requirePermission('branches.view'),
    asyncHandler(async (req, res) => {
        const snap = await db.collection('subeler').get();
        const promises = snap.docs.map(async (d) => {
            const countSnap = await d.ref.collection('urunler').count().get();
            return { id: d.id, slug: d.id, urunSayisi: countSnap.data().count, ...d.data() };
        });
        const subeler = await Promise.all(promises);

        const ortakCountSnap = await db.collection('ortak_urunler').count().get();
        const ortakUrunSayisi = ortakCountSnap.data().count;

        res.json({ subeler, ortakUrunSayisi });
    })
);

/**
 * GET /api/branches/konumlar
 * Harita için hafif şube konum listesi — sadece ad + il + ilçe.
 * Ürün sayım sorguları (N ek read) yapılmaz; 5 dk cache'lenir.
 */
router.get(
    '/konumlar',
    verifyToken,
    requirePermission('branches.view'),
    cacheMiddleware(300),
    asyncHandler(async (req, res) => {
        const snap = await db.collection('subeler').get();
        const konumlar = snap.docs.map((d) => {
            const data = d.data();
            return { slug: d.id, ad: data.ad || d.id, il: data.il || null, ilce: data.ilce || null };
        });
        res.json({ konumlar });
    })
);

/**
 * POST /api/branches
 * Yeni şube oluştur
 * Body: { slug, ad, adres?, telefon? }
 */
router.post(
    '/',
    verifyToken,
    requirePermission('branches.create'),
    asyncHandler(async (req, res) => {
        const { slug, ad, adres, telefon, yetkili_adi, fatura_adresi, vkn, sirket_tipi, il, ilce } = req.body;

        if (!slug || !slug.trim()) {
            return res.status(400).json({ error: 'Şube slug zorunludur (URL kısmı, örn: ankara)' });
        }
        if (!ad || !ad.trim()) {
            return res.status(400).json({ error: 'Şube adı zorunludur' });
        }

        // Slug benzersiz olmalı
        const existing = await db.collection('subeler').doc(slug.trim().toLowerCase()).get();
        if (existing.exists) {
            return res.status(400).json({ error: 'Bu slug zaten kullanılıyor' });
        }

        const slugVal = slug.trim().toLowerCase();
        await db.collection('subeler').doc(slugVal).set({
            ad: ad.trim(),
            adres: adres?.trim() || '',
            telefon: telefon?.trim() || '',
            yetkili_adi: yetkili_adi?.trim() || '',
            fatura_adresi: fatura_adresi?.trim() || '',
            vkn: vkn?.trim() || '',
            sirket_tipi: sirket_tipi?.trim() || '',
            il: il?.trim() || '',
            ilce: ilce?.trim() || '',
        });

        invalidateCache('/branches/konumlar');
        res.status(201).json({ slug: slugVal, ad: ad.trim() });
    })
);

/**
 * PUT /api/branches/:slug
 * Şube güncelle
 * Body: { ad?, adres?, telefon? }
 */
router.put(
    '/:slug',
    verifyToken,
    requirePermission('branches.edit'),
    asyncHandler(async (req, res) => {
        const { slug } = req.params;
        const { ad, adres, telefon, yetkili_adi, fatura_adresi, vkn, sirket_tipi, il, ilce } = req.body;

        const docRef = db.collection('subeler').doc(slug);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Şube bulunamadı' });
        }

        const updateData = {};
        if (ad !== undefined) updateData.ad = ad.trim();
        if (adres !== undefined) updateData.adres = adres.trim();
        if (telefon !== undefined) updateData.telefon = telefon.trim();
        if (yetkili_adi !== undefined) updateData.yetkili_adi = yetkili_adi.trim();
        if (fatura_adresi !== undefined) updateData.fatura_adresi = fatura_adresi.trim();
        if (vkn !== undefined) updateData.vkn = vkn.trim();
        if (sirket_tipi !== undefined) updateData.sirket_tipi = sirket_tipi.trim();
        if (il !== undefined) updateData.il = il.trim();
        if (ilce !== undefined) updateData.ilce = ilce.trim();

        await docRef.update(updateData);
        invalidateCache('/branches/konumlar');
        res.json({ success: true });
    })
);

/**
 * DELETE /api/branches/:slug
 * Şube sil
 */
router.delete(
    '/:slug',
    verifyToken,
    requirePermission('branches.delete'),
    asyncHandler(async (req, res) => {
        const { slug } = req.params;

        const docRef = db.collection('subeler').doc(slug);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Şube bulunamadı' });
        }

        // Şubeye atanmış kullanıcı var mı kontrol et
        const userSnap = await db.collection('kullanici_sube').where('subeSlug', '==', slug).limit(1).get();
        if (!userSnap.empty) {
            return res.status(400).json({ error: 'Bu şubeye atanmış kullanıcılar var. Önce kullanıcıları başka şubeye taşıyın.' });
        }

        await docRef.delete();
        invalidateCache('/branches/konumlar');
        res.json({ success: true });
    })
);

export default router;
