import { Router } from 'express';
import { db, auth } from '../../../config/firebase.js';
import { verifyToken } from '../../../middleware/auth.js';
import asyncHandler from '../../../utils/asyncHandler.js';

const router = Router();

// ─── Static routes FIRST (before :courseId param) ───

/**
 * GET /api/academy/progress/all/summary
 * Kullanıcının tüm kurslardaki ilerleme özeti (dashboard için)
 */
router.get('/all/summary', verifyToken, asyncHandler(async (req, res) => {
    const userId = req.user.uid;

    const snapshot = await db.collection('academy_progress')
        .doc(userId)
        .collection('completedLessons')
        .get();

    const byCourse = {};
    snapshot.docs.forEach(doc => {
        const { courseId } = doc.data();
        if (!byCourse[courseId]) byCourse[courseId] = 0;
        byCourse[courseId]++;
    });

    res.json({ byCourse });
}));

/**
 * GET /api/academy/progress/admin/stats
 * Admin: Tüm kullanıcıların ilerleme istatistikleri
 */
router.get('/admin/stats', verifyToken, asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Yetkisiz' });
    }

    // Şube eşleştirmelerini al
    const subeSnap = await db.collection('kullanici_sube').get();
    const subeMap = {};
    subeSnap.forEach(doc => { subeMap[doc.id] = doc.data(); });

    const progressRef = db.collection('academy_progress');
    const usersSnapshot = await progressRef.listDocuments();

    const stats = [];
    for (const userDoc of usersSnapshot) {
        const userId = userDoc.id;
        const lessonsSnap = await userDoc.collection('completedLessons').get();

        // Kullanıcı bilgilerini Firebase Auth'dan al
        let userInfo = { displayName: null, email: null };
        try {
            const authUser = await auth.getUser(userId);
            userInfo = {
                displayName: authUser.displayName || null,
                email: authUser.email || null,
            };
        } catch (e) {
            // Kullanıcı silinmiş olabilir
        }

        // Şube bilgisi
        const subeData = subeMap[userId] || {};

        const byCourse = {};
        let lastActivity = null;
        lessonsSnap.docs.forEach(doc => {
            const { courseId, completedAt } = doc.data();
            if (!byCourse[courseId]) byCourse[courseId] = { count: 0, lastActivity: null };
            byCourse[courseId].count++;
            if (!byCourse[courseId].lastActivity || completedAt > byCourse[courseId].lastActivity) {
                byCourse[courseId].lastActivity = completedAt;
            }
            if (!lastActivity || completedAt > lastActivity) lastActivity = completedAt;
        });

        stats.push({
            userId,
            displayName: userInfo.displayName,
            email: userInfo.email,
            subeSlug: subeData.sube_slug || null,
            role: subeData.role || null,
            totalCompleted: lessonsSnap.size,
            lastActivity,
            byCourse,
        });
    }

    // Son aktiviteye göre sırala
    stats.sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || ''));

    res.json({ stats });
}));

// ─── Parameterized routes ───

/**
 * GET /api/academy/progress/:courseId
 * Kullanıcının bir kurstaki ders ilerleme durumu
 */
router.get('/:courseId', verifyToken, asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const userId = req.user.uid;

    const snapshot = await db.collection('academy_progress')
        .doc(userId)
        .collection('completedLessons')
        .where('courseId', '==', courseId)
        .get();

    const completed = {};
    snapshot.docs.forEach(doc => {
        completed[doc.id] = doc.data();
    });

    res.json({ completed });
}));

/**
 * POST /api/academy/progress/:courseId/:lessonId
 * Dersi tamamlandı olarak işaretle
 */
router.post('/:courseId/:lessonId', verifyToken, asyncHandler(async (req, res) => {
    const { courseId, lessonId } = req.params;
    const userId = req.user.uid;

    await db.collection('academy_progress')
        .doc(userId)
        .collection('completedLessons')
        .doc(lessonId)
        .set({
            courseId,
            completedAt: new Date().toISOString(),
        });

    res.json({ success: true });
}));

/**
 * DELETE /api/academy/progress/:courseId/:lessonId
 * Tamamlanma işaretini kaldır
 */
router.delete('/:courseId/:lessonId', verifyToken, asyncHandler(async (req, res) => {
    const { courseId, lessonId } = req.params;
    const userId = req.user.uid;

    await db.collection('academy_progress')
        .doc(userId)
        .collection('completedLessons')
        .doc(lessonId)
        .delete();

    res.json({ success: true });
}));

export default router;
