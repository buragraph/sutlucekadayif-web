import { Router } from 'express';
import { db } from '../config/firebase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import admin from 'firebase-admin';
import { regenerateAllMenuJsons } from '../modules/qr-menu/services/menu-cache.js';

const router = Router();

/**
 * GET /api/categories
 * Tüm kategorileri listele (sıralı)
 */
router.get(
    '/',
    verifyToken,
    requirePermission('categories.view'),
    asyncHandler(async (req, res) => {
        const snap = await db.collection('kategoriler').orderBy('sira', 'asc').get();
        const kategoriler = [];
        snap.forEach((d) => kategoriler.push({ id: d.id, ...d.data(), urunSayisi: d.data().urunSayisi || 0 }));
        res.json({ kategoriler });
    })
);

/**
 * POST /api/categories/sync-counts
 * Tek seferlik: kategori ürün sayılarını senkronize et
 */
router.post(
    '/sync-counts',
    verifyToken,
    requirePermission('categories.edit'),
    asyncHandler(async (req, res) => {
        const urunSnap = await db.collection('ortak_urunler').get();
        const counts = {};
        urunSnap.forEach((d) => {
            const data = d.data();
            if (!data.deletedAt && data.kategori) {
                counts[data.kategori] = (counts[data.kategori] || 0) + 1;
            }
        });
        const katSnap = await db.collection('kategoriler').get();
        const batch = db.batch();
        katSnap.forEach((d) => {
            batch.update(d.ref, { urunSayisi: counts[d.id] || 0 });
        });
        await batch.commit();
        res.json({ success: true, counts });
    })
);

/**
 * POST /api/categories
 * Yeni kategori oluştur
 * Body: { ad, sira? }
 */
router.post(
    '/',
    verifyToken,
    requirePermission('categories.create'),
    asyncHandler(async (req, res) => {
        const { ad, sira, tur, renk, kilitli, gorsel } = req.body;

        if (!ad || !ad.trim()) {
            return res.status(400).json({ error: 'Kategori adı zorunludur' });
        }

        // Sıra belirtilmemişse en sona ekle
        let siraDeger = sira;
        if (siraDeger === undefined || siraDeger === null) {
            const snap = await db.collection('kategoriler').orderBy('sira', 'desc').limit(1).get();
            siraDeger = snap.empty ? 1 : (snap.docs[0].data().sira || 0) + 1;
        }

        const docData = {
            ad: ad.trim(),
            sira: siraDeger,
            tur: tur === 'sube_ozel' ? 'sube_ozel' : 'ortak',
        };
        if (renk) docData.renk = renk;
        if (kilitli !== undefined) docData.kilitli = Boolean(kilitli);
        if (gorsel !== undefined) docData.gorsel = gorsel;

        const docRef = await db.collection('kategoriler').add(docData);

        res.status(201).json({
            id: docRef.id,
            ad: ad.trim(),
            sira: siraDeger,
        });

        // Kategori eklendi — tüm şubelerin JSON'ını yenile
        regenerateAllMenuJsons().catch(console.error);
    })
);

/**
 * PUT /api/categories/:id
 * Kategori güncelle
 * Body: { ad?, sira? }
 */
router.put(
    '/:id',
    verifyToken,
    requirePermission('categories.edit'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { ad, sira, tur, renk, kilitli, gorsel } = req.body;

        const docRef = db.collection('kategoriler').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Kategori bulunamadı' });
        }

        const updateData = {};
        if (ad !== undefined) updateData.ad = ad.trim();
        if (sira !== undefined) updateData.sira = sira;
        if (tur !== undefined) updateData.tur = tur === 'sube_ozel' ? 'sube_ozel' : 'ortak';
        if (renk !== undefined) updateData.renk = renk;
        if (kilitli !== undefined) updateData.kilitli = Boolean(kilitli);
        if (gorsel !== undefined) updateData.gorsel = gorsel;

        await docRef.update(updateData);
        res.json({ success: true });

        // Kategori güncellendi — tüm şubelerin JSON'ını yenile
        regenerateAllMenuJsons().catch(console.error);
    })
);

/**
 * DELETE /api/categories/:id
 * Kategori sil
 */
router.delete(
    '/:id',
    verifyToken,
    requirePermission('categories.delete'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { yeniKategori } = req.query;

        const docRef = db.collection('kategoriler').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Kategori bulunamadı' });
        }

        // Kategoriye ait ürün var mı kontrol et
        const urunSnap = await db.collection('ortak_urunler').where('kategori', '==', id).get();
        
        if (!urunSnap.empty && !yeniKategori) {
            return res.status(409).json({
                error: 'Bu kategoriye ait ürünler var.',
                urunSayisi: urunSnap.size,
                requiresReplacement: true,
            });
        }

        // Ürünleri yeni kategoriye taşı
        if (!urunSnap.empty && yeniKategori) {
            const batch = db.batch();
            urunSnap.docs.forEach((urunDoc) => {
                batch.update(urunDoc.ref, { kategori: yeniKategori });
            });
            // Yeni kategorinin sayacını artır
            batch.update(db.collection('kategoriler').doc(yeniKategori), {
                urunSayisi: admin.firestore.FieldValue.increment(urunSnap.size)
            });
            await batch.commit();
        }

        await docRef.delete();
        res.json({ success: true, tasinanUrun: urunSnap.size });

        // Kategori silindi — tüm şubelerin JSON'ını yenile
        regenerateAllMenuJsons().catch(console.error);
    })
);

export default router;
