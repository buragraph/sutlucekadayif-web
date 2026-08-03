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
 * PUT /api/categories/sira
 * Kategori sırasını topluca günceller. Body: { idler: [katId, ...] }
 * Dizideki konum sırayı belirler (ilk = 1). Menü kategorileri `sira` alanına
 * göre listeliyor (bkz. services/menu-builder.js).
 *
 * Toplu olmasının sebebi maliyet: PUT /:id her çağrıda 92 şubenin menü JSON'ını
 * yeniden üretiyor. Sürükle-bırakta 14 kategoriyi tek tek kaydetmek ~1300 menü
 * üretimi demekti. Burada tek batch yazma + TEK yenileme var.
 *
 * NOT: '/:id' rotasından ÖNCE tanımlı olmalı, yoksa "sira" bir kategori kimliği
 * sanılır.
 */
router.put(
    '/sira',
    verifyToken,
    requirePermission('categories.edit'),
    asyncHandler(async (req, res) => {
        const { idler } = req.body;
        if (!Array.isArray(idler) || idler.length === 0) {
            return res.status(400).json({ error: 'Sıralama listesi boş' });
        }
        const temiz = [...new Set(idler.map((x) => String(x).trim()).filter(Boolean))];
        if (temiz.length > 400) return res.status(400).json({ error: 'Tek seferde en fazla 400 kategori' });

        // Var olmayan kimlik gelirse update() patlar; tek toplu okumayla süzülür.
        const refs = temiz.map((id) => db.collection('kategoriler').doc(id));
        const dokumanlar = await db.getAll(...refs);

        const batch = db.batch();
        let sira = 0;
        dokumanlar.forEach((d) => { if (d.exists) batch.update(d.ref, { sira: ++sira }); });
        if (sira === 0) return res.status(404).json({ error: 'Kategori bulunamadı' });
        await batch.commit();

        await regenerateAllMenuJsons().catch(console.error);
        res.json({ success: true, guncellenen: sira });
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

        // Kategori eklendi — tüm şubelerin JSON'ını güvenilir şekilde yenile
        await regenerateAllMenuJsons().catch(console.error);

        res.status(201).json({
            id: docRef.id,
            ad: ad.trim(),
            sira: siraDeger,
        });
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

        // Kategori güncellendi — tüm şubelerin JSON'ını güvenilir şekilde yenile
        await regenerateAllMenuJsons().catch(console.error);
        res.json({ success: true });
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

        // Kategoriye ait ürünleri topla: ortak (ana koleksiyon) + şubeye özel
        // (subcollection 'urunler' — collectionGroup ile). collectionGroup için
        // index gerekebilir; yoksa best-effort olarak ortak ürünlerle devam edilir.
        const productRefs = [];
        const ortakSnap = await db.collection('ortak_urunler').where('kategori', '==', id).get();
        ortakSnap.docs.forEach((d) => productRefs.push(d.ref));
        try {
            const subeSnap = await db.collectionGroup('urunler').where('kategori', '==', id).get();
            subeSnap.docs.forEach((d) => productRefs.push(d.ref));
        } catch (e) {
            console.error('[Categories] sube_ozel ürün taraması atlandı (collectionGroup index gerekebilir):', e.message);
        }

        if (productRefs.length > 0 && !yeniKategori) {
            return res.status(409).json({
                error: 'Bu kategoriye ait ürünler var.',
                urunSayisi: productRefs.length,
                requiresReplacement: true,
            });
        }

        // Ürünleri yeni kategoriye taşı (500'lük batch sınırına göre parçala)
        if (productRefs.length > 0 && yeniKategori) {
            for (let i = 0; i < productRefs.length; i += 450) {
                const batch = db.batch();
                productRefs.slice(i, i + 450).forEach((ref) => batch.update(ref, { kategori: yeniKategori }));
                await batch.commit();
            }
            await db.collection('kategoriler').doc(yeniKategori).update({
                urunSayisi: admin.firestore.FieldValue.increment(productRefs.length)
            });
        }

        await docRef.delete();

        // Kategori silindi — tüm şubelerin JSON'ını güvenilir şekilde yenile
        await regenerateAllMenuJsons().catch(console.error);
        res.json({ success: true, tasinanUrun: productRefs.length });
    })
);

export default router;
