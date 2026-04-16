import { Router } from 'express';
import { db } from '../../../config/firebase.js';
import { verifyToken, requirePermission } from '../../../middleware/auth.js';
import asyncHandler from '../../../utils/asyncHandler.js';

const router = Router();

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

    const lessons = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ lessons });
}));

/**
 * POST /api/academy/lessons/:courseId
 * Yeni ders ekle
 */
router.post('/:courseId', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const { title, description, lessonType, videoUrl, pdfUrl } = req.body;

    if (!title?.trim()) return res.status(400).json({ error: 'Ders başlığı gerekli' });
    if (!['video', 'pdf'].includes(lessonType)) return res.status(400).json({ error: 'Geçerli ders tipi: video veya pdf' });

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
        orderIndex,
        createdAt: new Date().toISOString(),
    };

    const ref = await db.collection('academy_courses').doc(courseId)
        .collection('lessons').add(lessonData);

    res.status(201).json({ lesson: { id: ref.id, ...lessonData } });
}));

/**
 * PUT /api/academy/lessons/:courseId/:lessonId
 * Ders güncelle
 */
router.put('/:courseId/:lessonId', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { courseId, lessonId } = req.params;
    const { title, description, lessonType, videoUrl, pdfUrl, orderIndex } = req.body;

    const docRef = db.collection('academy_courses').doc(courseId)
        .collection('lessons').doc(lessonId);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Ders bulunamadı' });

    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (lessonType !== undefined) updateData.lessonType = lessonType;
    if (videoUrl !== undefined) updateData.videoUrl = videoUrl;
    if (pdfUrl !== undefined) updateData.pdfUrl = pdfUrl;
    if (orderIndex !== undefined) updateData.orderIndex = orderIndex;

    await docRef.update(updateData);
    res.json({ lesson: { id: lessonId, ...doc.data(), ...updateData } });
}));

/**
 * PUT /api/academy/lessons/:courseId/reorder
 * Ders sıralamasını güncelle
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
 * DELETE /api/academy/lessons/:courseId/:lessonId
 * Ders sil
 */
router.delete('/:courseId/:lessonId', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { courseId, lessonId } = req.params;

    const docRef = db.collection('academy_courses').doc(courseId)
        .collection('lessons').doc(lessonId);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Ders bulunamadı' });

    await docRef.delete();
    res.json({ success: true });
}));

export default router;
