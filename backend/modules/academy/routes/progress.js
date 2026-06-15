import { Router } from 'express';
import { db, auth } from '../../../config/firebase.js';
import { verifyToken } from '../../../middleware/auth.js';
import asyncHandler from '../../../utils/asyncHandler.js';

const router = Router();

// Admin istatistikleri için kısa ömürlü cache (kullanıcı sayısı arttıkça pahalı sorgu)
let statsCache = null; // { ts, data }
const STATS_TTL = 60 * 1000;
function invalidateStatsCache() { statsCache = null; }

// Helper: İlgili kullanıcının tamamlanan derslerini okuyup parent doc'a (academy_progress) yazar
async function syncUserProgressStats(userId) {
    const lessonsSnap = await db.collection('academy_progress')
        .doc(userId)
        .collection('completedLessons')
        .get();

    const byCourse = {};
    let lastActivity = null;

    lessonsSnap.docs.forEach(doc => {
        const { courseId, completedAt } = doc.data();
        if (!byCourse[courseId]) byCourse[courseId] = { count: 0, lastActivity: null };
        byCourse[courseId].count++;
        if (!byCourse[courseId].lastActivity || completedAt > byCourse[courseId].lastActivity) {
            byCourse[courseId].lastActivity = completedAt;
        }
        if (!lastActivity || completedAt > lastActivity) {
            lastActivity = completedAt;
        }
    });

    await db.collection('academy_progress').doc(userId).set({
        totalCompleted: lessonsSnap.size,
        lastActivity,
        byCourse,
        statsMigrated: true
    }, { merge: true });

    return { totalCompleted: lessonsSnap.size, lastActivity, byCourse, statsMigrated: true };
}

// ─── Static routes FIRST (before :courseId param) ───

/**
 * GET /api/academy/progress/all/summary
 * Kullanıcının tüm kurslardaki ilerleme özeti (dashboard için)
 */
router.get('/all/summary', verifyToken, asyncHandler(async (req, res) => {
    const userId = req.user.uid;

    const docSnap = await db.collection('academy_progress').doc(userId).get();
    let data = docSnap.exists ? docSnap.data() : {};

    if (!data.statsMigrated) {
        data = await syncUserProgressStats(userId);
    }

    const byCourseCount = {};
    if (data.byCourse) {
        for (const [cId, info] of Object.entries(data.byCourse)) {
            byCourseCount[cId] = info.count;
        }
    }

    res.json({ byCourse: byCourseCount });
}));

/**
 * GET /api/academy/progress/admin/stats
 * Admin: Tüm kullanıcıların ilerleme istatistikleri
 */
router.get('/admin/stats', verifyToken, asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Yetkisiz' });
    }

    // Kısa ömürlü cache — sık yenilemede pahalı sorguyu tekrarlama
    if (statsCache && Date.now() - statsCache.ts < STATS_TTL) {
        return res.json(statsCache.data);
    }

    // Şube eşleştirmelerini al
    const subeSnap = await db.collection('kullanici_sube').get();
    const subeMap = {};
    subeSnap.forEach(doc => { subeMap[doc.id] = doc.data(); });

    const progressRef = db.collection('academy_progress');
    const userDocRefs = await progressRef.listDocuments();

    // Firebase Auth'dan kullanıcıları batch (100'erli) olarak al (Hız Optimizasyonu)
    const userIds = userDocRefs.map(ref => ref.id);
    const authUsersMap = {};
    for (let i = 0; i < userIds.length; i += 100) {
        const chunk = userIds.slice(i, i + 100);
        try {
            const authResult = await auth.getUsers(chunk.map(uid => ({ uid })));
            authResult.users.forEach(u => {
                authUsersMap[u.uid] = {
                    displayName: u.displayName || null,
                    email: u.email || null,
                };
            });
        } catch (e) {
            console.error('Auth fetch error', e);
        }
    }

    const stats = [];
    for (const userDocRef of userDocRefs) {
        const userId = userDocRef.id;
        const userDocSnap = await userDocRef.get();
        let data = userDocSnap.exists ? userDocSnap.data() : {};

        // Lazy Migration: Eğer istatistikler henüz ana belgeye yazılmadıysa, hesapla ve yaz
        if (!data.statsMigrated) {
            data = await syncUserProgressStats(userId);
        }

        const userInfo = authUsersMap[userId] || { displayName: null, email: null };
        const subeData = subeMap[userId] || {};

        stats.push({
            userId,
            displayName: userInfo.displayName,
            email: userInfo.email,
            subeSlug: subeData.sube_slug || null,
            role: subeData.role || null,
            totalCompleted: data.totalCompleted || 0,
            lastActivity: data.lastActivity || null,
            byCourse: data.byCourse || {},
        });
    }

    // Son aktiviteye göre sırala
    stats.sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || ''));

    statsCache = { ts: Date.now(), data: { stats } };
    res.json({ stats });
}));

/**
 * POST /api/academy/progress/quiz/:courseId/:lessonId/submit
 * Kullanıcının sınav cevaplarını değerlendirir ve geçerse kaydeder
 */
router.post('/quiz/:courseId/:lessonId/submit', verifyToken, asyncHandler(async (req, res) => {
    const { courseId, lessonId } = req.params;
    const { answers } = req.body; // { 'q1': 'A', 'q2': 'C' }
    const userId = req.user.uid;

    if (!answers || typeof answers !== 'object') {
        return res.status(400).json({ error: 'Cevaplar geçerli bir formatta gönderilmelidir.' });
    }

    // Dersi getir
    const lessonSnap = await db.collection('academy_courses').doc(courseId).collection('lessons').doc(lessonId).get();
    if (!lessonSnap.exists) return res.status(404).json({ error: 'Sınav bulunamadı' });
    const lessonData = lessonSnap.data();

    if (lessonData.lessonType !== 'quiz') {
        return res.status(400).json({ error: 'Bu içerik bir sınav değil.' });
    }

    const { passingScore = 70, questions = [] } = lessonData;
    
    if (questions.length === 0) {
        return res.status(400).json({ error: 'Bu sınavda hiç soru yok.' });
    }

    // Not hesaplama
    let correctCount = 0;
    questions.forEach(q => {
        if (answers[q.id] === q.correctOptionId) {
            correctCount++;
        }
    });

    const score = Math.round((correctCount / questions.length) * 100);
    const passed = score >= passingScore;

    if (passed) {
        // Geçtiyse, progress'e kaydet
        const completedLessonsRef = db.collection('academy_progress').doc(userId).collection('completedLessons').doc(lessonId);
        const alreadyCompletedSnap = await completedLessonsRef.get();

        if (!alreadyCompletedSnap.exists) {
            await completedLessonsRef.set({
                courseId,
                score,
                completedAt: new Date().toISOString()
            });

            // Sync user stats
            await syncUserProgressStats(userId);
            invalidateStatsCache();
        } else {
            // İsterseniz daha yüksek skor alındığında güncelleyebilirsiniz (şimdilik sadece ilk geçişte kaydediyoruz veya skor yüksekse güncelleyelim)
            const oldScore = alreadyCompletedSnap.data().score || 0;
            if (score > oldScore) {
                await completedLessonsRef.update({
                    score,
                    completedAt: new Date().toISOString()
                });
            }
        }
    }

    res.json({ passed, score, correctCount, totalQuestions: questions.length, passingScore });
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

    // Quiz dersleri yalnızca sınavı geçerek (/quiz/.../submit) tamamlanabilir —
    // bu genel endpoint ile quiz'i atlayıp tamamlandı işaretlemeyi engelle
    const lessonSnap = await db.collection('academy_courses').doc(courseId)
        .collection('lessons').doc(lessonId).get();
    if (lessonSnap.exists && lessonSnap.data().lessonType === 'quiz') {
        return res.status(400).json({ error: 'Sınavlar yalnızca sınavı geçerek tamamlanır.' });
    }

    const ref = db.collection('academy_progress')
        .doc(userId).collection('completedLessons').doc(lessonId);

    // Zaten tamamlıysa gereksiz yeniden senkronizasyon yapma (idempotent)
    const existing = await ref.get();
    if (existing.exists) return res.json({ success: true });

    await ref.set({ courseId, completedAt: new Date().toISOString() });
    await syncUserProgressStats(userId);
    invalidateStatsCache();

    res.json({ success: true });
}));

/**
 * DELETE /api/academy/progress/:courseId/:lessonId
 * Tamamlanma işaretini kaldır
 */
router.delete('/:courseId/:lessonId', verifyToken, asyncHandler(async (req, res) => {
    const { courseId, lessonId } = req.params;
    const userId = req.user.uid;

    const ref = db.collection('academy_progress')
        .doc(userId).collection('completedLessons').doc(lessonId);

    // Zaten yoksa gereksiz yeniden senkronizasyon yapma (idempotent)
    const existing = await ref.get();
    if (!existing.exists) return res.json({ success: true });

    await ref.delete();
    await syncUserProgressStats(userId);
    invalidateStatsCache();

    res.json({ success: true });
}));

export default router;
