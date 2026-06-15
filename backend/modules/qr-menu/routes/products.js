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
    const mainRef = db.collection('ortak_urunler').doc(id);
    const mainDoc = await mainRef.get();
    if (mainDoc.exists) return { docRef: mainRef, doc: mainDoc, source: 'ortak' };
    
    // subeSlug yoksa tüm şubelerde ara (fallback) — paralel
    if (!subeSlug) {
        const subeSnap = await db.collection('subeler').get();
        const results = await Promise.all(subeSnap.docs.map(async (subeDoc) => {
            const ref = subeDoc.ref.collection('urunler').doc(id);
            const d = await ref.get();
            return d.exists ? { docRef: ref, doc: d, source: 'sube_ozel', subeSlug: subeDoc.id } : null;
        }));
        const hit = results.find(Boolean);
        if (hit) return hit;
    }
    return null;
}

/**
 * Şube sahibi yalnızca KENDİ şubesinin özel ürününü değiştirebilir.
 * Ortak ürünler ve diğer şubelerin ürünleri yalnızca admin tarafından.
 */
function canMutateProduct(req, source, subeSlug) {
    if (req.user.role === 'admin') return true;
    return source === 'sube_ozel' && subeSlug === req.user.subeSlug;
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
        const ortakSnap = await db.collection('ortak_urunler').get();
        ortakSnap.forEach((d) => {
            const data = d.data();
            if (!data.deletedAt) urunler.push({ id: d.id, tur: 'ortak', ...data });
        });

        if (req.user.role === 'admin') {
            const requestedSube = req.query.sube || 'all';

            if (requestedSube === 'all') {
                // Admin: tüm şubelerin özel ürünlerini paralel getir
                const subeSnap = await db.collection('subeler').get();
                const promises = subeSnap.docs.map(subeDoc => subeDoc.ref.collection('urunler').get());
                const snaps = await Promise.all(promises);
                
                snaps.forEach((urunSnap, i) => {
                    const subeId = subeSnap.docs[i].id;
                    urunSnap.forEach((d) => {
                        const data = d.data();
                        if (!data.deletedAt) urunler.push({ id: d.id, tur: 'sube_ozel', sube_slug: subeId, ...data });
                    });
                });
            } else if (requestedSube !== 'ortak') {
                // Sadece seçili şubenin özel ürünlerini getir
                const subeUrunSnap = await db.collection('subeler').doc(requestedSube).collection('urunler').get();
                subeUrunSnap.forEach((d) => {
                    const data = d.data();
                    if (!data.deletedAt) urunler.push({ id: d.id, tur: 'sube_ozel', sube_slug: requestedSube, ...data });
                });
            }
            // requestedSube === 'ortak' ise hiçbir ekstra ürün ekleme (zaten ortak_urunler eklendi)
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

        // Şube sahibi: yalnızca kendi şubesine özel ürün ekleyebilir.
        // Ortak (tüm şubeleri etkileyen) ürün oluşturmak admin'e özeldir.
        if (req.user.role !== 'admin') {
            if (katTur !== 'sube_ozel') {
                return res.status(403).json({ error: 'Ortak ürün ekleme yetkiniz yok' });
            }
            if (sube_slug && sube_slug !== req.user.subeSlug) {
                return res.status(403).json({ error: 'Yalnızca kendi şubenize ürün ekleyebilirsiniz' });
            }
        }

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
            docRef = await db.collection('ortak_urunler').add(productData);
        }

        // Kategori ürün sayısını artır
        await db.collection('kategoriler').doc(kategori).update({
            urunSayisi: admin.firestore.FieldValue.increment(1)
        });

        // Menü JSON cache'ini güvenilir şekilde yenile (yanıttan önce — serverless'te
        // yanıt sonrası iş kesilebilir). Hata yutulur, yazma işlemi başarılı sayılır.
        await regenerateAffectedMenuJsons(productData).catch(console.error);

        res.status(201).json({
            id: docRef.id,
            ...productData,
        });
    })
);

// Toplu işlem sonrası etkilenen menü JSON'larını tek seferde yeniler (dedupe)
async function regenerateForAffected(affected) {
    const hasOrtak = affected.some((a) => a.tur !== 'sube_ozel');
    if (hasOrtak) { await regenerateAllMenuJsons().catch(console.error); return; }
    const slugs = [...new Set(affected.map((a) => a.sube_slug).filter(Boolean))];
    await Promise.all(slugs.map((s) => regenerateMenuJson(s).catch(console.error)));
}

/**
 * PUT /api/products/bulk-price
 * Seçili ürünlerin fiyatını toplu güncelle.
 * NOT: /:id'den ÖNCE tanımlı olmalı.
 * Body: { items: [{id, sube_slug}], mode: 'set'|'inc_pct'|'dec_pct'|'inc_amt'|'dec_amt', value }
 */
router.put(
    '/bulk-price',
    verifyToken,
    requirePermission('products.edit'),
    asyncHandler(async (req, res) => {
        const { items, mode, value } = req.body;
        if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Ürün seçilmedi' });
        const v = Number(value);
        if (!['set', 'inc_pct', 'dec_pct', 'inc_amt', 'dec_amt'].includes(mode) || !Number.isFinite(v)) {
            return res.status(400).json({ error: 'Geçersiz fiyat işlemi' });
        }

        const affected = [];
        let updated = 0;
        for (const it of items) {
            const lookupSlug = req.user.role === 'admin' ? it.sube_slug : req.user.subeSlug;
            const found = await findProduct(it.id, lookupSlug);
            if (!found || !canMutateProduct(req, found.source, found.subeSlug)) continue;

            const cur = Number(found.doc.data().fiyat) || 0;
            let np = cur;
            if (mode === 'set') np = v;
            else if (mode === 'inc_pct') np = cur * (1 + v / 100);
            else if (mode === 'dec_pct') np = cur * (1 - v / 100);
            else if (mode === 'inc_amt') np = cur + v;
            else if (mode === 'dec_amt') np = cur - v;
            np = Math.max(0, Math.round(np * 100) / 100);

            await found.docRef.update({ fiyat: np });
            affected.push({ tur: found.source, sube_slug: found.subeSlug });
            updated++;
        }

        await regenerateForAffected(affected);
        res.json({ success: true, updated });
    })
);

/**
 * POST /api/products/bulk
 * Birden çok ürünü tek seferde oluştur.
 * Body: { products: [{ ad, fiyat, kategori, sube_slug?, aciklama?, etiket?, miktar?, birim?, gorsel? }] }
 */
router.post(
    '/bulk',
    verifyToken,
    requirePermission('products.create'),
    asyncHandler(async (req, res) => {
        const { products } = req.body;
        if (!Array.isArray(products) || products.length === 0) return res.status(400).json({ error: 'Ürün listesi boş' });

        const katSnap = await db.collection('kategoriler').get();
        const katMap = {};
        katSnap.forEach((d) => { katMap[d.id] = d.data(); });

        const affected = [];
        const katInc = {};
        let created = 0;
        for (const p of products) {
            if (!p.ad || !p.ad.trim() || p.fiyat === undefined || p.fiyat === null || p.fiyat === '' || !p.kategori) continue;
            const katTur = katMap[p.kategori]?.tur || 'ortak';
            if (req.user.role !== 'admin' && katTur !== 'sube_ozel') continue; // şube sahibi ortak ürün ekleyemez

            const data = {
                ad: p.ad.trim(),
                fiyat: Number(p.fiyat),
                kategori: p.kategori,
                aciklama: (p.aciklama || '').trim(),
                etiket: p.etiket || [],
                gorsel: p.gorsel || '',
                miktar: p.miktar ? Number(p.miktar) : null,
                birim: p.birim || '',
                createdAt: new Date().toISOString(),
            };

            if (katTur === 'sube_ozel') {
                const slug = req.user.role === 'admin' ? (p.sube_slug || req.user.subeSlug) : req.user.subeSlug;
                if (!slug) continue;
                data.tur = 'sube_ozel'; data.sube_slug = slug;
                await db.collection('subeler').doc(slug).collection('urunler').add(data);
            } else {
                data.tur = 'ortak'; data.mevcut_degil = [];
                await db.collection('ortak_urunler').add(data);
            }
            katInc[p.kategori] = (katInc[p.kategori] || 0) + 1;
            affected.push({ tur: data.tur, sube_slug: data.sube_slug });
            created++;
        }

        await Promise.all(Object.entries(katInc).map(([k, n]) =>
            db.collection('kategoriler').doc(k).update({ urunSayisi: admin.firestore.FieldValue.increment(n) }).catch(() => {})));
        await regenerateForAffected(affected);
        res.status(201).json({ success: true, created });
    })
);

/**
 * POST /api/products/bulk-delete
 * Seçili ürünleri toplu çöp kutusuna taşı (soft delete).
 * Body: { items: [{id, sube_slug}] }
 */
router.post(
    '/bulk-delete',
    verifyToken,
    requirePermission('products.delete'),
    asyncHandler(async (req, res) => {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Ürün seçilmedi' });

        const affected = [];
        const katDec = {};
        let deleted = 0;
        for (const it of items) {
            const lookupSlug = req.user.role === 'admin' ? it.sube_slug : req.user.subeSlug;
            const found = await findProduct(it.id, lookupSlug);
            if (!found || !canMutateProduct(req, found.source, found.subeSlug)) continue;

            await found.docRef.update({ deletedAt: new Date().toISOString() });
            const kat = found.doc.data().kategori;
            if (kat) katDec[kat] = (katDec[kat] || 0) + 1;
            affected.push({ tur: found.source, sube_slug: found.subeSlug });
            deleted++;
        }

        await Promise.all(Object.entries(katDec).map(([k, n]) =>
            db.collection('kategoriler').doc(k).update({ urunSayisi: admin.firestore.FieldValue.increment(-n) }).catch(() => {})));
        await regenerateForAffected(affected);
        res.json({ success: true, deleted });
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

        // Şube sahibi yalnızca kendi şubesinde arar (başka şubeyi hedefleyemez)
        const lookupSlug = req.user.role === 'admin' ? (sube_slug || req.body._subeSlug) : req.user.subeSlug;
        const found = await findProduct(id, lookupSlug);
        if (!found) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }
        if (!canMutateProduct(req, found.source, found.subeSlug)) {
            return res.status(403).json({ error: 'Bu ürünü değiştirme yetkiniz yok' });
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

        await regenerateAffectedMenuJsons(updatedData).catch(console.error);
        res.json({ success: true, urun: { id, ...updatedData } });
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

        const lookupSlug = req.user.role === 'admin' ? subeSlug : req.user.subeSlug;
        const found = await findProduct(id, lookupSlug);
        if (!found) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }
        if (!canMutateProduct(req, found.source, found.subeSlug)) {
            return res.status(403).json({ error: 'Bu ürünü silme yetkiniz yok' });
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

        await regenerateAffectedMenuJsons(urunData).catch(console.error);
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
        const urunler = [];

        // Ana collection'dan silinen ürünler
        const mainSnap = await db.collection('ortak_urunler').get();
        mainSnap.forEach((d) => {
            const data = d.data();
            if (data.deletedAt) urunler.push({ id: d.id, tur: 'ortak', ...data });
        });

        // Şube subcollection'lardan silinen ürünler.
        // Admin: tüm şubeler (paralel) | Şube sahibi: yalnızca kendi şubesi.
        let hedefSubeIds;
        if (req.user.role === 'admin') {
            const subeSnap = await db.collection('subeler').get();
            hedefSubeIds = subeSnap.docs.map(d => d.id);
        } else {
            hedefSubeIds = req.user.subeSlug ? [req.user.subeSlug] : [];
        }
        const subeUrunSnaps = await Promise.all(
            hedefSubeIds.map(slug => db.collection('subeler').doc(slug).collection('urunler').get())
        );
        subeUrunSnaps.forEach((urunSnap, i) => {
            urunSnap.forEach((d) => {
                const data = d.data();
                if (data.deletedAt) urunler.push({ id: d.id, tur: 'sube_ozel', sube_slug: hedefSubeIds[i], ...data });
            });
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
        const { subeSlug } = req.query;

        const lookupSlug = req.user.role === 'admin' ? subeSlug : req.user.subeSlug;
        const found = await findProduct(id, lookupSlug);
        if (!found) return res.status(404).json({ error: 'Ürün bulunamadı' });
        if (!canMutateProduct(req, found.source, found.subeSlug)) {
            return res.status(403).json({ error: 'Bu ürünü geri alma yetkiniz yok' });
        }

        await found.docRef.update({ deletedAt: admin.firestore.FieldValue.delete() });

        // Kategori ürün sayısını artır
        const kategori = found.doc.data().kategori;
        if (kategori) {
            await db.collection('kategoriler').doc(kategori).update({
                urunSayisi: admin.firestore.FieldValue.increment(1)
            });
        }

        const urunData = { ...found.doc.data(), tur: found.source, sube_slug: found.subeSlug };
        await regenerateAffectedMenuJsons(urunData).catch(console.error);
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
        const { subeSlug } = req.query;

        const lookupSlug = req.user.role === 'admin' ? subeSlug : req.user.subeSlug;
        const found = await findProduct(id, lookupSlug);
        if (!found) return res.status(404).json({ error: 'Ürün bulunamadı' });
        if (!canMutateProduct(req, found.source, found.subeSlug)) {
            return res.status(403).json({ error: 'Bu ürünü silme yetkiniz yok' });
        }

        const urunData = { ...found.doc.data(), tur: found.source, sube_slug: found.subeSlug };
        await found.docRef.delete();

        await regenerateAffectedMenuJsons(urunData).catch(console.error);
        res.json({ success: true });
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
        const urunRef = db.collection('ortak_urunler').doc(id);

        if (mevcut) {
            await urunRef.update({
                mevcut_degil: admin.firestore.FieldValue.arrayRemove(subeSlug),
            });
        } else {
            await urunRef.update({
                mevcut_degil: admin.firestore.FieldValue.arrayUnion(subeSlug),
            });
        }

        // Sadece bu şubenin JSON'ını yenile (güvenilir — yanıttan önce)
        await regenerateMenuJson(subeSlug).catch(console.error);
        res.json({ success: true, mevcut });
    })
);

export default router;
