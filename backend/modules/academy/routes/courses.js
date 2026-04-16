import { Router } from 'express';
import { db } from '../../../config/firebase.js';
import { verifyToken, requirePermission } from '../../../middleware/auth.js';
import asyncHandler from '../../../utils/asyncHandler.js';

const router = Router();

/**
 * GET /api/academy/courses
 * Tüm kursları listele
 */
router.get('/', verifyToken, asyncHandler(async (req, res) => {
    const snapshot = await db.collection('academy_courses')
        .orderBy('createdAt', 'desc')
        .get();

    const courses = [];
    for (const doc of snapshot.docs) {
        const course = { id: doc.id, ...doc.data() };

        // Ders sayısını al
        const lessonsSnap = await db.collection('academy_courses').doc(doc.id)
            .collection('lessons').get();
        course.lessonCount = lessonsSnap.size;

        courses.push(course);
    }

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

    // Dersler
    const lessonsSnap = await db.collection('academy_courses').doc(id)
        .collection('lessons')
        .orderBy('orderIndex', 'asc')
        .get();
    course.lessons = lessonsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    res.json({ course });
}));

/**
 * POST /api/academy/courses
 * Yeni kurs oluştur (admin only)
 */
router.post('/', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { title, description, thumbnailUrl } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Kurs başlığı gerekli' });

    const courseData = {
        title: title.trim(),
        description: description?.trim() || '',
        thumbnailUrl: thumbnailUrl || '',
        isPublished: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    const ref = await db.collection('academy_courses').add(courseData);
    res.status(201).json({ course: { id: ref.id, ...courseData } });
}));

/**
 * PUT /api/academy/courses/:id
 * Kurs güncelle
 */
router.put('/:id', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, description, thumbnailUrl, isPublished } = req.body;

    const docRef = db.collection('academy_courses').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Kurs bulunamadı' });

    const updateData = { updatedAt: new Date().toISOString() };
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (thumbnailUrl !== undefined) updateData.thumbnailUrl = thumbnailUrl;
    if (isPublished !== undefined) updateData.isPublished = isPublished;

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

    // Dersleri sil
    const lessonsSnap = await docRef.collection('lessons').get();
    const batch = db.batch();
    lessonsSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(docRef);
    await batch.commit();

    res.json({ success: true });
}));

export default router;
