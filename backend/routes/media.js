import { Router } from 'express';
import { db } from '../config/firebase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import admin from 'firebase-admin';
import { deleteFile, urlToKey } from '../config/r2.js';

const router = Router();

/**
 * GET /api/media
 * Tüm medya dosyalarını listele (opsiyonel klasör filtresi)
 * Query: ?klasor=xxx
 */
router.get(
    '/',
    verifyToken,
    requirePermission('categories.view'),
    asyncHandler(async (req, res) => {
        let query = db.collection('medya').orderBy('createdAt', 'desc');

        // Klasör filtresi Firestore'da — gereksiz read tasarrufu
        const klasor = req.query.klasor;
        if (klasor) query = query.where('klasor', '==', klasor);

        const snap = await query.get();
        const medyalar = [];
        snap.forEach((d) => medyalar.push({ id: d.id, ...d.data() }));

        res.json({ medyalar });
    })
);

/**
 * GET /api/media/klasorler
 * Tüm klasörleri listele
 */
router.get(
    '/klasorler',
    verifyToken,
    requirePermission('categories.view'),
    asyncHandler(async (req, res) => {
        const snap = await db.collection('medya_klasorler').orderBy('ad').get();
        const klasorler = [];
        snap.forEach((d) => klasorler.push({ id: d.id, ...d.data() }));
        res.json({ klasorler });
    })
);

/**
 * POST /api/media/klasorler
 * Yeni klasör oluştur
 * Body: { ad }
 */
router.post(
    '/klasorler',
    verifyToken,
    requirePermission('categories.create'),
    asyncHandler(async (req, res) => {
        const { ad } = req.body;

        if (!ad || !ad.trim()) {
            return res.status(400).json({ error: 'Klasör adı zorunludur' });
        }

        // Aynı isimde klasör var mı?
        const existing = await db.collection('medya_klasorler')
            .where('ad', '==', ad.trim())
            .get();
        if (!existing.empty) {
            return res.status(400).json({ error: 'Bu isimde bir klasör zaten var' });
        }

        const docData = {
            ad: ad.trim(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const docRef = await db.collection('medya_klasorler').add(docData);
        res.status(201).json({ id: docRef.id, ...docData });
    })
);

/**
 * DELETE /api/media/klasorler/:id
 * Klasörü sil (içindeki görselleri "Genel"e taşır)
 */
router.delete(
    '/klasorler/:id',
    verifyToken,
    requirePermission('categories.delete'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;

        const docRef = db.collection('medya_klasorler').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Klasör bulunamadı' });
        }

        const klasorAd = doc.data().ad;

        // Bu klasördeki görsellerin klasörünü sil (Genel'e taşı)
        const medyaSnap = await db.collection('medya')
            .where('klasor', '==', klasorAd)
            .get();

        const batch = db.batch();
        medyaSnap.forEach((d) => {
            batch.update(d.ref, { klasor: '' });
        });
        batch.delete(docRef);
        await batch.commit();

        res.json({ success: true });
    })
);

/**
 * POST /api/media
 * Yeni medya kaydı oluştur (upload sonrası)
 * Body: { ad, url, klasor? }
 */
router.post(
    '/',
    verifyToken,
    requirePermission('categories.create'),
    asyncHandler(async (req, res) => {
        const { ad, url, klasor, boyut } = req.body;

        if (!ad || !ad.trim()) {
            return res.status(400).json({ error: 'Görsel adı zorunludur' });
        }
        if (!url || !url.trim()) {
            return res.status(400).json({ error: 'Görsel URL zorunludur' });
        }

        const docData = {
            ad: ad.trim(),
            url: url.trim(),
            klasor: (klasor || '').trim(),
            boyut: boyut || 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const docRef = await db.collection('medya').add(docData);

        res.status(201).json({
            id: docRef.id,
            ...docData,
            createdAt: new Date().toISOString(),
        });
    })
);

/**
 * PUT /api/media/:id
 * Medya adını veya klasörünü güncelle
 * Body: { ad?, klasor? }
 */
router.put(
    '/:id',
    verifyToken,
    requirePermission('categories.edit'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { ad, klasor } = req.body;

        const docRef = db.collection('medya').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Medya bulunamadı' });
        }

        const updateData = {};
        if (ad !== undefined) updateData.ad = ad.trim();
        if (klasor !== undefined) updateData.klasor = klasor.trim();

        await docRef.update(updateData);
        res.json({ success: true });
    })
);

/**
 * DELETE /api/media/:id
 * Medya kaydı sil
 */
router.delete(
    '/:id',
    verifyToken,
    requirePermission('categories.delete'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;

        const docRef = db.collection('medya').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Medya bulunamadı' });
        }

        // R2'den dosyayı sil
        const { url } = doc.data();
        if (url) {
            const key = urlToKey(url);
            if (key) {
                try { await deleteFile(key); } catch (err) { console.error('R2 silme hatası:', err.message); }
            }
        }

        await docRef.delete();
        res.json({ success: true });
    })
);

export default router;
