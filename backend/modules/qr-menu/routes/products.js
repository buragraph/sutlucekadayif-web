import { Router } from 'express';
import { db } from '../../../config/firebase.js';
import { verifyToken, requirePermission } from '../../../middleware/auth.js';
import admin from 'firebase-admin';
import asyncHandler from '../../../utils/asyncHandler.js';
import { regenerateAffectedMenuJsons, regenerateAllMenuJsons, regenerateMenuJson } from '../services/menu-cache.js';

const router = Router();

/**
 * Helper: Ürün dokümanını bul — önce urunler, sonra subeler/{slug}/urunler
 * @returns {{ docRef, doc, source: 'ortak'|'sube_ozel', subeSlug?: string }}
 */
async function findProduct(id, subeSlug) {
    // subeSlug varsa önce subcollection'da ara
    if (subeSlug) {
        const subeRef = db.collection('subeler').doc(subeSlug).collection('urunler').doc(id);
        const subeDoc = await subeRef.get();
        if (subeDoc.exists) return { docRef: subeRef, doc: subeDoc, source: 'sube_ozel', subeSlug };
    }
    // Ana collection'da ara
    const mainRef = db.collection('urunler').doc(id);
    const mainDoc = await mainRef.get();
    if (mainDoc.exists) return { docRef: mainRef, doc: mainDoc, source: 'ortak' };
    
    // subeSlug yoksa tüm şubelerde ara (fallback)
    if (!subeSlug) {
        const subeSnap = await db.collection('subeler').get();
        for (const subeDoc of subeSnap.docs) {
            const ref = subeDoc.ref.collection('urunler').doc(id);
            const d = await ref.get();
            if (d.exists) return { docRef: ref, doc: d, source: 'sube_ozel', subeSlug: subeDoc.id };
        }
    }
    return null;
}

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

        // Ortak ürünler (ana collection)
        const ortakSnap = await db.collection('urunler').get();
        ortakSnap.forEach((d) => {
            const data = d.data();
            if (!data.deletedAt) urunler.push({ id: d.id, tur: 'ortak', ...data });
        });

        if (req.user.role === 'admin') {
            // Admin: tüm şubelerin özel ürünlerini de getir
            const subeSnap = await db.collection('subeler').get();
            for (const subeDoc of subeSnap.docs) {
                const urunSnap = await subeDoc.ref.collection('urunler').get();
                urunSnap.forEach((d) => {
                    const data = d.data();
                    if (!data.deletedAt) urunler.push({ id: d.id, tur: 'sube_ozel', sube_slug: subeDoc.id, ...data });
                });
            }
        } else if (req.user.subeSlug) {
            // Şube sahibi: sadece kendi şubesinin özel ürünleri
            const subeUrunSnap = await db.collection('subeler').doc(req.user.subeSlug).collection('urunler').get();
            subeUrunSnap.forEach((d) => {
                const data = d.data();
                if (!data.deletedAt) urunler.push({ id: d.id, tur: 'sube_ozel', sube_slug: req.user.subeSlug, ...data });
            });
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

        let docRef;

        if (katTur === 'sube_ozel') {
            // Şubeye özel → subeler/{slug}/urunler subcollection'a yaz
            const slug = sube_slug || req.user.subeSlug;
            if (!slug) {
                return res.status(400).json({ error: 'Şubeye özel ürün için şube bilgisi gerekli' });
            }
            productData.tur = 'sube_ozel';
            productData.sube_slug = slug;
            docRef = await db.collection('subeler').doc(slug).collection('urunler').add(productData);
        } else {
            // Ortak → ana urunler collection'a yaz
            productData.tur = 'ortak';
            productData.mevcut_degil = [];
            docRef = await db.collection('urunler').add(productData);
        }

        // Kategori ürün sayısını artır
        await db.collection('kategoriler').doc(kategori).update({
            urunSayisi: admin.firestore.FieldValue.increment(1)
        });

        res.status(201).json({
            id: docRef.id,
            ...productData,
        });

        // Arka planda menü JSON'ını yenile
        regenerateAffectedMenuJsons(productData).catch(console.error);
    })
);

/**
 * PUT /api/products/:id
 * Ürün güncelle
 * Body: { ad?, fiyat?, kategori?, aciklama?, etiket?, sube_slug? }
 */
router.put(
    '/:id',
    verifyToken,
    requirePermission('products.edit'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { ad, fiyat, kategori, aciklama, etiket, sube_slug, gorsel, miktar, birim } = req.body;

        const found = await findProduct(id, sube_slug || req.body._subeSlug);
        if (!found) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }
        const { docRef, doc } = found;

        const updateData = {};
        if (ad !== undefined) updateData.ad = ad.trim();
        if (fiyat !== undefined) updateData.fiyat = Number(fiyat);
        if (kategori !== undefined) updateData.kategori = kategori;
        if (aciklama !== undefined) updateData.aciklama = aciklama.trim();
        if (etiket !== undefined) updateData.etiket = etiket;
        if (gorsel !== undefined) updateData.gorsel = gorsel;
        if (miktar !== undefined) updateData.miktar = miktar ? Number(miktar) : null;
        if (birim !== undefined) updateData.birim = birim;

        if (Object.keys(updateData).length === 0) {
            return res.json({ success: true });
        }

        // Kategori değiştiğinde sayaç güncelle
        if (kategori !== undefined && kategori !== doc.data().kategori) {
            const oldKategori = doc.data().kategori;
            if (oldKategori) {
                await db.collection('kategoriler').doc(oldKategori).update({
                    urunSayisi: admin.firestore.FieldValue.increment(-1)
                });
            }
            await db.collection('kategoriler').doc(kategori).update({
                urunSayisi: admin.firestore.FieldValue.increment(1)
            });
        }

        await docRef.update(updateData);
        const updated = await docRef.get();
        const updatedData = { ...updated.data(), tur: found.source, sube_slug: found.subeSlug };
        res.json({ success: true, urun: { id, ...updatedData } });

        // Arka planda menü JSON'ını yenile
        regenerateAffectedMenuJsons(updatedData).catch(console.error);
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
        const { subeSlug } = req.query;

        const found = await findProduct(id, subeSlug);
        if (!found) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }

        await found.docRef.update({ deletedAt: new Date().toISOString() });

        // Kategori ürün sayısını azalt
        const urunData = { ...found.doc.data(), tur: found.source, sube_slug: found.subeSlug };
        const kategori = urunData.kategori;
        if (kategori) {
            await db.collection('kategoriler').doc(kategori).update({
                urunSayisi: admin.firestore.FieldValue.increment(-1)
            });
        }

        res.json({ success: true });

        // Arka planda menü JSON'ını yenile
        regenerateAffectedMenuJsons(urunData).catch(console.error);
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
        const urunler = [];

        // Ana collection'dan silinen ürünler
        const mainSnap = await db.collection('urunler').get();
        mainSnap.forEach((d) => {
            const data = d.data();
            if (data.deletedAt) urunler.push({ id: d.id, tur: 'ortak', ...data });
        });

        // Şube subcollection'lardan silinen ürünler
        const subeSnap = await db.collection('subeler').get();
        for (const subeDoc of subeSnap.docs) {
            const urunSnap = await subeDoc.ref.collection('urunler').get();
            urunSnap.forEach((d) => {
                const data = d.data();
                if (data.deletedAt) urunler.push({ id: d.id, tur: 'sube_ozel', sube_slug: subeDoc.id, ...data });
            });
        }

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
        const { subeSlug } = req.query;

        const found = await findProduct(id, subeSlug);
        if (!found) return res.status(404).json({ error: 'Ürün bulunamadı' });

        await found.docRef.update({ deletedAt: admin.firestore.FieldValue.delete() });

        // Kategori ürün sayısını artır
        const kategori = found.doc.data().kategori;
        if (kategori) {
            await db.collection('kategoriler').doc(kategori).update({
                urunSayisi: admin.firestore.FieldValue.increment(1)
            });
        }

        res.json({ success: true });

        // Arka planda menü JSON'ını yenile
        const urunData = { ...found.doc.data(), tur: found.source, sube_slug: found.subeSlug };
        regenerateAffectedMenuJsons(urunData).catch(console.error);
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
        const { subeSlug } = req.query;

        const found = await findProduct(id, subeSlug);
        if (!found) return res.status(404).json({ error: 'Ürün bulunamadı' });

        const urunData = { ...found.doc.data(), tur: found.source, sube_slug: found.subeSlug };
        await found.docRef.delete();
        res.json({ success: true });

        regenerateAffectedMenuJsons(urunData).catch(console.error);
    })
);

/**
 * PUT /api/products/:id/availability
 * Ürün müsaitlik toggle (sadece ortak ürünlerde)
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

        // Availability toggle sadece ortak ürünlerde çalışır
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

        // Sadece bu şubenin JSON'ını yenile
        regenerateMenuJson(subeSlug).catch(console.error);
    })
);

export default router;
