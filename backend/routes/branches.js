import { Router } from 'express';
import { db } from '../config/firebase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
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
        const subeler = [];
        snap.forEach((d) => subeler.push({ slug: d.id, ...d.data() }));
        res.json({ subeler });
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
        const { slug, ad, adres, telefon } = req.body;

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
        });

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
        const { ad, adres, telefon } = req.body;

        const docRef = db.collection('subeler').doc(slug);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Şube bulunamadı' });
        }

        const updateData = {};
        if (ad !== undefined) updateData.ad = ad.trim();
        if (adres !== undefined) updateData.adres = adres.trim();
        if (telefon !== undefined) updateData.telefon = telefon.trim();

        await docRef.update(updateData);
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
        res.json({ success: true });
    })
);

export default router;
