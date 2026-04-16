import { Router } from 'express';
import { db } from '../../../config/firebase.js';
import { verifyToken, requirePermission } from '../../../middleware/auth.js';
import admin from 'firebase-admin';
import asyncHandler from '../../../utils/asyncHandler.js';

const router = Router();

/**
 * GET /api/products
 * Admin: tüm ürünler | Şube sahibi: ortak + kendi şubesi
 */
router.get(
    '/',
    verifyToken,
    requirePermission('products.view'),
    asyncHandler(async (req, res) => {
        let urunler = [];

        if (req.user.role === 'admin') {
            // Admin tüm ürünleri görür
            const snap = await db.collection('urunler').get();
            snap.forEach((d) => {
                const data = d.data();
                if (!data.deletedAt) urunler.push({ id: d.id, ...data });
            });
        } else {
            // Şube sahibi: ortak ürünler + kendi şubesinin ürünleri
            const [ortakSnap, subeSnap] = await Promise.all([
                db.collection('urunler').where('tur', '==', 'ortak').get(),
                db.collection('urunler').where('sube_slug', '==', req.user.subeSlug).get(),
            ]);
            ortakSnap.forEach((d) => { const data = d.data(); if (!data.deletedAt) urunler.push({ id: d.id, ...data }); });
            subeSnap.forEach((d) => { const data = d.data(); if (!data.deletedAt) urunler.push({ id: d.id, ...data }); });
        }

        res.json({ urunler });
    })
);

/**
 * POST /api/products
 * Yeni ürün oluştur — kategori türüne göre ortak veya şubeye özel
 * Body: { ad, fiyat, kategori, aciklama?, etiket?, sube_slug? }
 */
router.post(
    '/',
    verifyToken,
    requirePermission('products.create'),
    asyncHandler(async (req, res) => {
        const { ad, fiyat, kategori, aciklama, etiket, sube_slug, gorsel, miktar, birim } = req.body;

        if (!ad || !ad.trim()) {
            return res.status(400).json({ error: 'Ürün adı zorunludur' });
        }
        if (fiyat === undefined || fiyat === null) {
            return res.status(400).json({ error: 'Fiyat zorunludur' });
        }
        if (!kategori) {
            return res.status(400).json({ error: 'Kategori zorunludur' });
        }

        // Kategori türünü kontrol et
        const katDoc = await db.collection('kategoriler').doc(kategori).get();
        const katTur = katDoc.exists ? (katDoc.data().tur || 'ortak') : 'ortak';

        const productData = {
            ad: ad.trim(),
            fiyat: Number(fiyat),
            kategori,
            aciklama: aciklama?.trim() || '',
            etiket: etiket || [],
            gorsel: gorsel || '',
            miktar: miktar ? Number(miktar) : null,
            birim: birim || '',
            createdAt: new Date().toISOString(),
        };

        if (katTur === 'sube_ozel') {
            // Şubeye özel ürün
            const slug = sube_slug || req.user.subeSlug;
            if (!slug) {
                return res.status(400).json({ error: 'Şubeye özel ürün için şube bilgisi gerekli' });
            }
            productData.tur = 'sube_ozel';
            productData.sube_slug = slug;
        } else {
            productData.tur = 'ortak';
            productData.mevcut_degil = [];
        }

        const docRef = await db.collection('urunler').add(productData);

        // Kategori ürün sayısını artır
        await db.collection('kategoriler').doc(kategori).update({
            urunSayisi: admin.firestore.FieldValue.increment(1)
        });

        res.status(201).json({
            id: docRef.id,
            ...productData,
        });
    })
);

/**
 * PUT /api/products/:id
 * Ürün güncelle
 * Body: { ad?, fiyat?, kategori?, aciklama?, etiket? }
 */
router.put(
    '/:id',
    verifyToken,
    requirePermission('products.edit'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { ad, fiyat, kategori, aciklama, etiket, sube_slug, gorsel, miktar, birim } = req.body;

        const docRef = db.collection('urunler').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }

        const updateData = {};
        if (ad !== undefined) updateData.ad = ad.trim();
        if (fiyat !== undefined) updateData.fiyat = Number(fiyat);
        if (kategori !== undefined) updateData.kategori = kategori;
        if (aciklama !== undefined) updateData.aciklama = aciklama.trim();
        if (etiket !== undefined) updateData.etiket = etiket;
        if (sube_slug !== undefined) updateData.sube_slug = sube_slug;
        if (gorsel !== undefined) updateData.gorsel = gorsel;
        if (miktar !== undefined) updateData.miktar = miktar ? Number(miktar) : null;
        if (birim !== undefined) updateData.birim = birim;

        if (Object.keys(updateData).length === 0) {
            return res.json({ success: true });
        }

        // Kategori değiştiğinde tür kontrolü + sayaç güncelle
        if (kategori !== undefined && kategori !== doc.data().kategori) {
            const oldKategori = doc.data().kategori;
            const katDoc = await db.collection('kategoriler').doc(kategori).get();
            const katTur = katDoc.exists ? (katDoc.data().tur || 'ortak') : 'ortak';
            if (katTur === 'ortak') {
                updateData.tur = 'ortak';
                updateData.sube_slug = admin.firestore.FieldValue.delete();
                updateData.mevcut_degil = [];
            } else if (katTur === 'sube_ozel') {
                updateData.tur = 'sube_ozel';
                if (sube_slug) {
                    updateData.sube_slug = sube_slug;
                } else if (!doc.data().sube_slug) {
                    updateData.sube_slug = req.user.subeSlug || '';
                }
            }
            // Eski kategoriden azalt, yeni kategoriye ekle
            if (oldKategori) {
                await db.collection('kategoriler').doc(oldKategori).update({
                    urunSayisi: admin.firestore.FieldValue.increment(-1)
                });
            }
            await db.collection('kategoriler').doc(kategori).update({
                urunSayisi: admin.firestore.FieldValue.increment(1)
            });
        }
        // Kategori değişmediyse tür kontrolü gereksiz — Firestore read tasarrufu

        await docRef.update(updateData);
        // Güncel veriyi dön
        const updated = await docRef.get();
        res.json({ success: true, urun: { id, ...updated.data() } });
    })
);

/**
 * DELETE /api/products/:id
 * Soft delete — çöp kutusuna taşı
 */
router.delete(
    '/:id',
    verifyToken,
    requirePermission('products.delete'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;

        const docRef = db.collection('urunler').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }

        await docRef.update({ deletedAt: new Date().toISOString() });

        // Kategori ürün sayısını azalt
        const kategori = doc.data().kategori;
        if (kategori) {
            await db.collection('kategoriler').doc(kategori).update({
                urunSayisi: admin.firestore.FieldValue.increment(-1)
            });
        }

        res.json({ success: true });
    })
);

/**
 * GET /api/products/trash
 * Çöp kutusundaki ürünleri listele
 */
router.get(
    '/trash',
    verifyToken,
    requirePermission('products.view'),
    asyncHandler(async (req, res) => {
        const snap = await db.collection('urunler').get();
        const urunler = [];
        snap.forEach((d) => {
            const data = d.data();
            if (data.deletedAt) urunler.push({ id: d.id, ...data });
        });
        res.json({ urunler });
    })
);

/**
 * PUT /api/products/:id/restore
 * Ürünü çöp kutusundan geri al
 */
router.put(
    '/:id/restore',
    verifyToken,
    requirePermission('products.edit'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const docRef = db.collection('urunler').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ error: 'Ürün bulunamadı' });
        await docRef.update({ deletedAt: admin.firestore.FieldValue.delete() });

        // Kategori ürün sayısını artır
        const kategori = doc.data().kategori;
        if (kategori) {
            await db.collection('kategoriler').doc(kategori).update({
                urunSayisi: admin.firestore.FieldValue.increment(1)
            });
        }

        res.json({ success: true });
    })
);

/**
 * DELETE /api/products/:id/permanent
 * Kalıcı silme
 */
router.delete(
    '/:id/permanent',
    verifyToken,
    requirePermission('products.delete'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const docRef = db.collection('urunler').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ error: 'Ürün bulunamadı' });
        await docRef.delete();
        res.json({ success: true });
    })
);

/**
 * PUT /api/products/:id/availability
 * Ürün müsaitlik toggle
 * Body: { subeSlug: string, mevcut: boolean }
 */
router.put(
    '/:id/availability',
    verifyToken,
    requirePermission('products.toggleAvailability'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { subeSlug, mevcut } = req.body;

        if (req.user.role !== 'admin' && req.user.subeSlug !== subeSlug) {
            return res.status(403).json({ error: 'Sadece kendi şubenizin müsaitliğini değiştirebilirsiniz' });
        }

        const urunRef = db.collection('urunler').doc(id);

        if (mevcut) {
            await urunRef.update({
                mevcut_degil: admin.firestore.FieldValue.arrayRemove(subeSlug),
            });
        } else {
            await urunRef.update({
                mevcut_degil: admin.firestore.FieldValue.arrayUnion(subeSlug),
            });
        }

        res.json({ success: true, mevcut });
    })
);

export default router;
