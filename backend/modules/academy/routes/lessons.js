import { Router } from 'express';
import { db } from '../../../config/firebase.js';
import { verifyToken, requirePermission } from '../../../middleware/auth.js';
import { deleteFile, urlToKey } from '../../../config/r2.js';
import { stripQuizAnswers } from '../utils.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { syncUserProgressStats, invalidateStatsCache } from './progress.js';

const router = Router();

/**
 * Silinen dersin kullanıcı ilerleme kayıtlarını temizler ve etkilenen
 * kullanıcıların özet istatistiklerini yeniden hesaplar. Yetim kayıt kalırsa
 * kullanıcı yüzdesi %100'ü aşar. Best-effort: hata ders silmeyi engellemez.
 */
async function cleanupLessonProgress(courseId, lessonId) {
    try {
        const snap = await db.collectionGroup('completedLessons')
            .where('courseId', '==', courseId).get();
        const hedefler = snap.docs.filter(d => d.id === lessonId);
        if (hedefler.length === 0) return;

        const batch = db.batch();
        hedefler.forEach(d => batch.delete(d.ref));
        await batch.commit();

        // Etkilenen kullanıcıların özetini tazele (yol: academy_progress/{uid}/completedLessons/{id})
        const uids = [...new Set(hedefler.map(d => d.ref.parent.parent.id))];
        await Promise.all(uids.map(uid => syncUserProgressStats(uid)));
        invalidateStatsCache();
    } catch (e) {
        console.error('[Academy] Ders ilerleme temizliği atlandı:', e.message);
    }
}

// Dersin R2 dosyasını (video/pdf) best-effort siler
async function deleteLessonFile(data) {
    const url = data?.videoUrl || data?.pdfUrl;
    if (!url) return;
    try {
        const key = urlToKey(url);
        if (key) await deleteFile(key);
    } catch (e) {
        console.error('[Academy] R2 dosya silinemedi:', e.message);
    }
}

/**
 * GET /api/academy/lessons/:courseId
 * Kursun derslerini listele
 */
router.get('/:courseId', verifyToken, asyncHandler(async (req, res) => {
    const { courseId } = req.params;

    const snapshot = await db.collection('academy_courses').doc(courseId)
        .collection('lessons')
        .orderBy('orderIndex', 'asc')
        .get();

    const isAdmin = req.user.role === 'admin';
    const lessons = snapshot.docs.map(d => stripQuizAnswers({ id: d.id, ...d.data() }, isAdmin));
    res.json({ lessons });
}));

/**
 * POST /api/academy/lessons/:courseId
 * Yeni ders ekle
 */
router.post('/:courseId', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const { title, description, lessonType, videoUrl, pdfUrl, passingScore, questions } = req.body;

    if (!title?.trim()) return res.status(400).json({ error: 'Ders başlığı gerekli' });
    if (!['video', 'pdf', 'quiz'].includes(lessonType)) return res.status(400).json({ error: 'Geçerli ders tipi: video, pdf veya quiz' });
    if (lessonType === 'quiz') {
        if (typeof passingScore !== 'number' || passingScore < 0 || passingScore > 100) return res.status(400).json({ error: 'Geçerli bir geçme notu (0-100) gerekli' });
        if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ error: 'Sınav için en az bir soru gerekli' });
    }

    // Sıralama için mevcut ders sayısı
    const existing = await db.collection('academy_courses').doc(courseId)
        .collection('lessons').get();
    const orderIndex = existing.size;

    const lessonData = {
        title: title.trim(),
        description: description?.trim() || '',
        lessonType,
        videoUrl: lessonType === 'video' ? (videoUrl || '') : '',
        pdfUrl: lessonType === 'pdf' ? (pdfUrl || '') : '',
        passingScore: lessonType === 'quiz' ? passingScore : null,
        questions: lessonType === 'quiz' ? questions : null,
        orderIndex,
        createdAt: new Date().toISOString(),
    };

    const ref = await db.collection('academy_courses').doc(courseId)
        .collection('lessons').add(lessonData);

    res.status(201).json({ lesson: { id: ref.id, ...lessonData } });
}));

/**
 * PUT /api/academy/lessons/:courseId/reorder
 * Ders sıralamasını güncelle.
 * NOT: Bu route, /:courseId/:lessonId'den ÖNCE tanımlanmalı — aksi halde
 * "reorder" bir lessonId sanılır ve istek yanlış handler'a düşer.
 */
router.put('/:courseId/reorder', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const { order } = req.body; // [{ id, orderIndex }]

    if (!Array.isArray(order)) return res.status(400).json({ error: 'Sıralama verisi gerekli' });

    const batch = db.batch();
    order.forEach(({ id, orderIndex }) => {
        const ref = db.collection('academy_courses').doc(courseId)
            .collection('lessons').doc(id);
        batch.update(ref, { orderIndex });
    });
    await batch.commit();

    res.json({ success: true });
}));

/**
 * PUT /api/academy/lessons/:courseId/:lessonId
 * Ders güncelle
 */
router.put('/:courseId/:lessonId', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { courseId, lessonId } = req.params;
    const { title, description, lessonType, videoUrl, pdfUrl, passingScore, questions, orderIndex } = req.body;

    const docRef = db.collection('academy_courses').doc(courseId)
        .collection('lessons').doc(lessonId);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Ders bulunamadı' });

    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (lessonType !== undefined) {
        updateData.lessonType = lessonType;
        if (lessonType === 'quiz') {
            if (passingScore !== undefined) updateData.passingScore = passingScore;
            if (questions !== undefined) updateData.questions = questions;
            updateData.videoUrl = '';
            updateData.pdfUrl = '';
        } else if (lessonType === 'video') {
            updateData.passingScore = null;
            updateData.questions = null;
            updateData.pdfUrl = '';
        } else if (lessonType === 'pdf') {
            updateData.passingScore = null;
            updateData.questions = null;
            updateData.videoUrl = '';
        }
    }
    if (videoUrl !== undefined && lessonType !== 'quiz' && lessonType !== 'pdf') updateData.videoUrl = videoUrl;
    if (pdfUrl !== undefined && lessonType !== 'quiz' && lessonType !== 'video') updateData.pdfUrl = pdfUrl;
    if (orderIndex !== undefined) updateData.orderIndex = orderIndex;

    // Eğer quiz güncelleniyorsa validasyonlar (eğer title vs gelmediyse diye eski tipini kontrol et)
    const finalLessonType = lessonType !== undefined ? lessonType : doc.data().lessonType;
    if (finalLessonType === 'quiz') {
        const finalPassing = passingScore !== undefined ? passingScore : doc.data().passingScore;
        const finalQuestions = questions !== undefined ? questions : doc.data().questions;
        
        if (typeof finalPassing !== 'number' || finalPassing < 0 || finalPassing > 100) return res.status(400).json({ error: 'Geçerli bir geçme notu (0-100) gerekli' });
        if (!Array.isArray(finalQuestions) || finalQuestions.length === 0) return res.status(400).json({ error: 'Sınav için en az bir soru gerekli' });
        
        if (passingScore !== undefined) updateData.passingScore = passingScore;
        if (questions !== undefined) updateData.questions = questions;
    }

    await docRef.update(updateData);
    res.json({ lesson: { id: lessonId, ...doc.data(), ...updateData } });
}));

/**
 * DELETE /api/academy/lessons/:courseId/:lessonId
 * Ders sil
 */
router.delete('/:courseId/:lessonId', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { courseId, lessonId } = req.params;

    const docRef = db.collection('academy_courses').doc(courseId)
        .collection('lessons').doc(lessonId);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Ders bulunamadı' });

    await deleteLessonFile(doc.data()); // R2'deki video/pdf'i de sil
    await docRef.delete();
    await cleanupLessonProgress(courseId, lessonId); // yetim ilerleme kaydı bırakma
    res.json({ success: true });
}));

export default router;
