import { Router } from 'express';
import { db } from '../config/firebase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import admin from 'firebase-admin';
import { deleteFile, urlToKey, isKeyAllowed } from '../config/r2.js';

const router = Router();

const PAGE_SIZE = 60;
const SYSTEM_FOLDERS = ['Ürünler', 'Kategoriler'];

// İsim araması için Türkçe-duyarlı küçük harf
const adLower = (ad) => (ad || '').toLocaleLowerCase('tr');

// Kelime-bazlı prefix token'ları — her kelimenin baştan prefixleri.
// "Fıstıklı Kadayıf" → ["f","fı",...,"k","ka","kad",...,"kadayıf"]
// Böylece HER kelimenin başından arama yapılabilir (sadece ismin başı değil).
function searchTokens(ad) {
    const kelimeler = adLower(ad).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const set = new Set();
    for (const k of kelimeler) {
        const maxLen = Math.min(k.length, 20); // aşırı uzun kelimeleri sınırla (dizi/maliyet)
        for (let i = 1; i <= maxLen; i++) set.add(k.slice(0, i));
    }
    return [...set];
}

// createdAt (Timestamp veya ISO) → cursor için ISO string
function toIso(v) {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (typeof v.toDate === 'function') return v.toDate().toISOString();
    return null;
}

/**
 * GET /api/media
 * Sayfalı medya listesi (cursor tabanlı — yüzlerce görselde maliyet kontrolü).
 * Query: ?klasor=ad (belirli klasör) | ?genel=1 (klasörsüz) | (ikisi yoksa tümü)
 *        &cursor=<ISO createdAt> &limit=N
 */
router.get(
    '/',
    verifyToken,
    requirePermission('media.view'),
    asyncHandler(async (req, res) => {
        const { klasor, genel, cursor, q } = req.query;
        const limit = Math.min(Number(req.query.limit) || PAGE_SIZE, 200);

        // ── İsme göre arama (kelime-bazlı prefix token, array-contains) ──
        // 'arama' dizisinde her kelimenin prefixleri var → Firestore YALNIZCA
        // eşleşen dokümanları okur (sonuç kadar read). "kad" → ismin HERHANGİ
        // bir kelimesi "kad" ile başlayan kayıtlar ("Fıstıklı Kadayıf" dahil).
        if (q && q.trim()) {
            const ql = (adLower(q.trim()).split(/[^\p{L}\p{N}]+/u).filter(Boolean)[0]) || '';
            if (!ql) return res.json({ medyalar: [], nextCursor: null });
            const snap = await db.collection('medya')
                .where('arama', 'array-contains', ql)
                .limit(60)
                .get();
            const medyalar = snap.docs.map((d) => {
                const data = d.data();
                return { id: d.id, ...data, createdAt: toIso(data.createdAt) };
            });
            return res.json({ medyalar, nextCursor: null });
        }

        let query = db.collection('medya');
        if (genel === '1') query = query.where('klasor', '==', '');
        else if (klasor) query = query.where('klasor', '==', klasor);

        query = query.orderBy('createdAt', 'desc');
        if (cursor) query = query.startAfter(new Date(cursor));
        query = query.limit(limit);

        const snap = await query.get();
        const medyalar = snap.docs.map((d) => {
            const data = d.data();
            return { id: d.id, ...data, createdAt: toIso(data.createdAt) };
        });

        // Tam sayfa döndüyse muhtemelen devamı var → son öğenin createdAt'i cursor
        const nextCursor = medyalar.length === limit ? medyalar[medyalar.length - 1].createdAt : null;

        res.json({ medyalar, nextCursor });
    })
);

/**
 * GET /api/media/klasorler
 * Klasörler + her birinin medya sayısı (count() aggregation — doküman okumadan).
 * Sidebar sayaçları artık tüm medyayı yüklemeden gelir.
 */
router.get(
    '/klasorler',
    verifyToken,
    requirePermission('media.view'),
    asyncHandler(async (req, res) => {
        const snap = await db.collection('medya_klasorler').orderBy('ad').get();
        const klasorAdlari = snap.docs.map((d) => d.data().ad);

        const countOf = (ad) =>
            db.collection('medya').where('klasor', '==', ad).count().get().then((s) => s.data().count);

        const [genel, total, sysCounts, userCounts] = await Promise.all([
            countOf(''),
            db.collection('medya').count().get().then((s) => s.data().count),
            Promise.all(SYSTEM_FOLDERS.map(countOf)),
            Promise.all(klasorAdlari.map(countOf)),
        ]);

        const klasorler = snap.docs.map((d, i) => ({ id: d.id, ...d.data(), count: userCounts[i] }));
        const system = {};
        SYSTEM_FOLDERS.forEach((name, i) => { system[name] = sysCounts[i]; });

        res.json({ klasorler, counts: { genel, total, system } });
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
    requirePermission('media.manage'),
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
    requirePermission('media.manage'),
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
 * PUT /api/media/bulk-move
 * Birden çok medyayı tek batch ile klasöre taşı.
 * NOT: /:id'den ÖNCE tanımlı olmalı (aksi halde "bulk-move" bir id sanılır).
 * Body: { ids: string[], klasor: string }
 */
router.put(
    '/bulk-move',
    verifyToken,
    requirePermission('media.manage'),
    asyncHandler(async (req, res) => {
        const { ids, klasor } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Taşınacak medya seçilmedi' });
        }
        const hedef = (klasor || '').trim();
        for (let i = 0; i < ids.length; i += 450) {
            const batch = db.batch();
            ids.slice(i, i + 450).forEach((id) => batch.update(db.collection('medya').doc(id), { klasor: hedef }));
            await batch.commit();
        }
        res.json({ success: true, taşınan: ids.length });
    })
);

/**
 * POST /api/media/bulk-delete
 * Birden çok medyayı sil (R2 dosyaları + Firestore kayıtları).
 * Body: { ids: string[] }
 */
router.post(
    '/bulk-delete',
    verifyToken,
    requirePermission('media.manage'),
    asyncHandler(async (req, res) => {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Silinecek medya seçilmedi' });
        }

        // Önce R2 dosyalarını sil (paralel, best-effort)
        // Pozitif allow-list: dekontlar/ ve tanımsız önekler asla silinmez —
        // aksi halde `url` alanı doğrulanmadan yazıldığı için (bkz. POST /api/media)
        // keyfi bir "medya" kaydı üzerinden dekont/menu dosyaları toplu silinebilirdi.
        const docs = await Promise.all(ids.map((id) => db.collection('medya').doc(id).get()));
        await Promise.all(docs.map(async (d) => {
            if (!d.exists) return;
            const key = urlToKey(d.data().url);
            if (key && isKeyAllowed(key, { forDelete: true })) {
                try { await deleteFile(key); } catch (e) { console.error('[Media] R2 silme hatası:', e.message); }
            }
        }));

        // Sonra Firestore kayıtlarını batch ile sil
        for (let i = 0; i < ids.length; i += 450) {
            const batch = db.batch();
            ids.slice(i, i + 450).forEach((id) => batch.delete(db.collection('medya').doc(id)));
            await batch.commit();
        }
        res.json({ success: true, silinen: ids.length });
    })
);

/**
 * POST /api/media/backfill-search
 * Mevcut medya kayıtlarına 'arama' token'larını ekler — tek seferlik.
 * 'arama' alanı olmayan kayıtları tarar ve doldurur.
 */
router.post(
    '/backfill-search',
    verifyToken,
    requirePermission('media.manage'),
    asyncHandler(async (req, res) => {
        const snap = await db.collection('medya').get();
        const eksik = snap.docs.filter((d) => d.data().arama === undefined);
        for (let i = 0; i < eksik.length; i += 450) {
            const batch = db.batch();
            eksik.slice(i, i + 450).forEach((d) => batch.update(d.ref, { arama: searchTokens(d.data().ad) }));
            await batch.commit();
        }
        res.json({ success: true, guncellenen: eksik.length, toplam: snap.size });
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
    requirePermission('media.manage'),
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
            arama: searchTokens(ad.trim()), // kelime-bazlı prefix arama token'ları
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
    requirePermission('media.manage'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { ad, klasor } = req.body;

        const docRef = db.collection('medya').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Medya bulunamadı' });
        }

        const updateData = {};
        if (ad !== undefined) { updateData.ad = ad.trim(); updateData.arama = searchTokens(ad.trim()); }
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
    requirePermission('media.manage'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;

        const docRef = db.collection('medya').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Medya bulunamadı' });
        }

        // R2'den dosyayı sil — pozitif allow-list (dekontlar/ ve tanımsız
        // önekler asla silinmez, bkz. bulk-delete'teki gerekçe).
        const { url } = doc.data();
        if (url) {
            const key = urlToKey(url);
            if (key && isKeyAllowed(key, { forDelete: true })) {
                try { await deleteFile(key); } catch (err) { console.error('R2 silme hatası:', err.message); }
            }
        }

        await docRef.delete();
        res.json({ success: true });
    })
);

export default router;
