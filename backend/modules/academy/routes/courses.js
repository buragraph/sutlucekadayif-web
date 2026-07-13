import { Router } from 'express';
import { db } from '../../../config/firebase.js';
import { verifyToken, requirePermission } from '../../../middleware/auth.js';
import { deleteFile, urlToKey, isKeyAllowed } from '../../../config/r2.js';
import { stripQuizAnswers, courseVisibleToUser } from '../utils.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { syncUserProgressStats, invalidateStatsCache } from './progress.js';

const router = Router();

const ALLOWED_TARGET_ROLES = ['sube_sahibi', 'calisan'];

// Hedef kitle alanlarını temizler: yalnızca bilinen roller / string şube slug'ları.
// Boş dizi = herkes / tüm şubeler.
function sanitizeTargetRoles(v) {
    if (!Array.isArray(v)) return [];
    return v.filter((r) => ALLOWED_TARGET_ROLES.includes(r));
}
function sanitizeTargetSubeler(v) {
    if (!Array.isArray(v)) return [];
    return [...new Set(v.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()))];
}

/**
 * GET /api/academy/courses
 * Kursları listele. Admin tümünü görür; diğer roller yalnızca yayında olan ve
 * hedef kitlesine (rol/şube) girdikleri kursları görür.
 */
router.get('/', verifyToken, asyncHandler(async (req, res) => {
    const snapshot = await db.collection('academy_courses').get();

    // Görünürlük filtresi ders sayımlarından ÖNCE — gösterilmeyecek kursa count sorgusu harcama
    let docs = snapshot.docs;
    if (req.user.role !== 'admin') {
        docs = docs.filter((d) => {
            const c = d.data();
            return c.isPublished && courseVisibleToUser(c, req.user);
        });
    }

    // Ders sayılarını count() aggregation ile al — ders dokümanlarını okumadan,
    // tümü paralel (N+1 tam okuma yerine N hafif sayım, eşzamanlı)
    const courses = await Promise.all(docs.map(async (doc) => {
        const countSnap = await doc.ref.collection('lessons').count().get();
        return { id: doc.id, ...doc.data(), lessonCount: countSnap.data().count };
    }));

    // Admin'in belirlediği sıra (orderIndex); alanı olmayan eski kurslar en sonda,
    // kendi aralarında yeniden-eskiye
    courses.sort((a, b) => {
        const ao = Number.isFinite(a.orderIndex) ? a.orderIndex : Infinity;
        const bo = Number.isFinite(b.orderIndex) ? b.orderIndex : Infinity;
        if (ao !== bo) return ao - bo;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    res.json({ courses });
}));

/**
 * GET /api/academy/courses/:id
 * Kurs detayları + dersler
 */
router.get('/:id', verifyToken, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const doc = await db.collection('academy_courses').doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Kurs bulunamadı' });

    const course = { id: doc.id, ...doc.data() };

    // Yayında olmayan veya hedef kitlesi dışındaki kursa doğrudan URL ile erişim yok
    if (req.user.role !== 'admin' && (!course.isPublished || !courseVisibleToUser(course, req.user))) {
        return res.status(404).json({ error: 'Kurs bulunamadı' });
    }

    // Dersler
    const lessonsSnap = await db.collection('academy_courses').doc(id)
        .collection('lessons')
        .orderBy('orderIndex', 'asc')
        .get();
    const isAdmin = req.user.role === 'admin';
    course.lessons = lessonsSnap.docs.map(d => stripQuizAnswers({ id: d.id, ...d.data() }, isAdmin));

    res.json({ course });
}));

/**
 * POST /api/academy/courses
 * Yeni kurs oluştur (admin only)
 */
router.post('/', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { title, description, thumbnailUrl, targetRoles, targetSubeler } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Kurs başlığı gerekli' });

    // Yeni kurs listenin sonuna eklenir — count() değil max(orderIndex)+1:
    // kurs silinince indekslerde delik kalır, count mevcut bir indeksle çakışabilir
    const sonKurs = await db.collection('academy_courses')
        .orderBy('orderIndex', 'desc').limit(1).get();
    const orderIndex = sonKurs.empty ? 0 : (Number(sonKurs.docs[0].data().orderIndex) || 0) + 1;

    const courseData = {
        title: title.trim(),
        description: description?.trim() || '',
        thumbnailUrl: thumbnailUrl || '',
        isPublished: false,
        targetRoles: sanitizeTargetRoles(targetRoles),
        targetSubeler: sanitizeTargetSubeler(targetSubeler),
        orderIndex,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    const ref = await db.collection('academy_courses').add(courseData);
    res.status(201).json({ course: { id: ref.id, ...courseData } });
}));

/**
 * PUT /api/academy/courses/reorder
 * Kurs sıralamasını güncelle. NOT: /:id route'undan ÖNCE tanımlı olmalı.
 */
router.put('/reorder', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { order } = req.body; // [{ id, orderIndex }]
    if (!Array.isArray(order) || order.length === 0) return res.status(400).json({ error: 'Sıralama verisi gerekli' });
    const gecerli = order.every((o) => o && typeof o.id === 'string' && Number.isFinite(o.orderIndex));
    if (!gecerli) return res.status(400).json({ error: 'Geçersiz sıralama verisi' });

    // Batch yerine tekil güncellemeler: bayat listeden gelen silinmiş bir kurs
    // (NOT_FOUND) diğer kursların sıralanmasını engellemesin
    const sonuclar = await Promise.allSettled(
        order.map(({ id, orderIndex }) =>
            db.collection('academy_courses').doc(id).update({ orderIndex }))
    );
    const gercekHata = sonuclar.some((s) => s.status === 'rejected' && s.reason?.code !== 5); // 5 = NOT_FOUND
    if (gercekHata) return res.status(500).json({ error: 'Sıralama güncellenemedi' });

    res.json({ success: true });
}));

/**
 * PUT /api/academy/courses/:id
 * Kurs güncelle
 */
router.put('/:id', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, description, thumbnailUrl, isPublished, targetRoles, targetSubeler } = req.body;

    const docRef = db.collection('academy_courses').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Kurs bulunamadı' });

    const updateData = { updatedAt: new Date().toISOString() };
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (thumbnailUrl !== undefined) updateData.thumbnailUrl = thumbnailUrl;
    if (isPublished !== undefined) updateData.isPublished = isPublished;
    if (targetRoles !== undefined) updateData.targetRoles = sanitizeTargetRoles(targetRoles);
    if (targetSubeler !== undefined) updateData.targetSubeler = sanitizeTargetSubeler(targetSubeler);

    await docRef.update(updateData);
    res.json({ course: { id, ...doc.data(), ...updateData } });
}));

/**
 * DELETE /api/academy/courses/:id
 * Kurs sil (alt koleksiyonlarıyla birlikte)
 */
router.delete('/:id', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const docRef = db.collection('academy_courses').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Kurs bulunamadı' });

    // Derslerin R2 dosyalarını (video/pdf) best-effort sil
    const lessonsSnap = await docRef.collection('lessons').get();
    await Promise.all(lessonsSnap.docs.map(async (d) => {
        const url = d.data().videoUrl || d.data().pdfUrl;
        if (!url) return;
        try {
            // Ders create/update'te doğrulanmış olsa da savunma-derinliği: cascade
            // silmede de allow-list dışı/dekontlar/ key'i asla silme.
            const key = urlToKey(url);
            if (key && isKeyAllowed(key, { forDelete: true })) await deleteFile(key);
        } catch (e) { console.error('[Academy] R2 dosya silinemedi:', e.message); }
    }));

    // Dersleri + kursu sil
    const batch = db.batch();
    lessonsSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(docRef);
    await batch.commit();

    // Bu kursa ait kullanıcı ilerleme kayıtlarını temizle (yetim veri kalmasın).
    // collectionGroup indexi yoksa best-effort: hata kursun silinmesini engellemez.
    try {
        const progressSnap = await db.collectionGroup('completedLessons')
            .where('courseId', '==', id).get();
        for (let i = 0; i < progressSnap.docs.length; i += 450) {
            const chunk = progressSnap.docs.slice(i, i + 450);
            const pBatch = db.batch();
            chunk.forEach(d => pBatch.delete(d.ref));
            await pBatch.commit();
        }
        // Etkilenen kullanıcıların özet istatistiklerini tazele
        const uids = [...new Set(progressSnap.docs.map(d => d.ref.parent.parent.id))];
        await Promise.all(uids.map(uid => syncUserProgressStats(uid)));
        invalidateStatsCache();
    } catch (e) {
        console.error('[Academy] İlerleme temizliği atlandı (collectionGroup index gerekebilir):', e.message);
    }

    res.json({ success: true });
}));

export default router;
