import { Router } from '../../../shared/router.js';
import { supabase } from '../../../config/supabase.js';
import { verifyToken, requirePermission } from '../../../middleware/auth.js';
import { deleteFile, urlToKey, isKeyAllowed, PUBLIC_URL } from '../../../config/r2.js';
import { stripQuizAnswers, courseVisibleToUser } from '../utils.js';
import { kursYanit, dersYanit, dersSatiri } from '../donusum.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { yeniId, veriYaDaHata } from '../../../utils/veri.js';
import { invalidateStatsCache } from './progress.js';

const router = Router();

// Dersin R2 dosyasını (video/pdf) best-effort siler
async function deleteLessonFile(satir) {
    const url = satir?.video_url || satir?.pdf_url;
    if (!url) return;
    try {
        // Allow-list dışı/dekontlar/ key'i asla silme (bkz. config/r2.js isKeyAllowed)
        const key = urlToKey(url);
        if (key && isKeyAllowed(key, { forDelete: true })) await deleteFile(key);
    } catch (e) {
        console.error('[Academy] R2 dosya silinemedi:', e.message);
    }
}

/**
 * Ders `videoUrl`/`pdfUrl` alanı yazılırken doğrulama. R2 `PUBLIC_URL` önekiyle
 * başlayan bir URL ise key `academy/` allow-list prefix'inde olmalı. Harici
 * URL'ler (ör. YouTube linki) R2'de olmadığından bu kontrolden muaf.
 */
function isValidLessonMediaUrl(url) {
    if (!url) return true;
    if (PUBLIC_URL && url.startsWith(`${PUBLIC_URL}/`)) {
        const key = urlToKey(url);
        return !!key && isKeyAllowed(key);
    }
    return true;
}

/** Kurs görünürlük kuralı derslerde de geçerli. */
async function kursGorunurMu(courseId, user) {
    if (user.role === 'admin') return true;
    const { data } = await supabase.from('kurslar').select('*').eq('id', courseId).maybeSingle();
    if (!data) return false;
    const course = kursYanit(data);
    return !!course.isPublished && courseVisibleToUser(course, user);
}

/**
 * GET /api/academy/lessons/:courseId
 * Kursun derslerini listele
 */
router.get('/:courseId', verifyToken, asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const isAdmin = req.user.role === 'admin';

    // Yayında olmayan veya hedef kitle dışındaki kursun ders içerikleri courseId
    // bilinse bile sızmasın
    if (!await kursGorunurMu(courseId, req.user)) {
        return res.status(404).json({ error: 'Kurs bulunamadı' });
    }

    const satirlar = veriYaDaHata(
        await supabase.from('dersler').select('*').eq('kurs_id', courseId)
            .order('order_index', { ascending: true }).range(0, 9999),
        'dersler okunamadı'
    );
    const lessons = satirlar.map((d) => stripQuizAnswers(dersYanit(d), isAdmin));
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
        // passingScore >= 1 zorunlu: 0 herkesi otomatik geçirir
        if (typeof passingScore !== 'number' || passingScore < 1 || passingScore > 100) return res.status(400).json({ error: 'Geçerli bir geçme notu (1-100) gerekli' });
        if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ error: 'Sınav için en az bir soru gerekli' });
    }
    if (lessonType === 'video' && videoUrl && !isValidLessonMediaUrl(videoUrl)) {
        return res.status(400).json({ error: 'Geçersiz video dosyası URL\'i' });
    }
    if (lessonType === 'pdf' && pdfUrl && !isValidLessonMediaUrl(pdfUrl)) {
        return res.status(400).json({ error: 'Geçersiz PDF dosyası URL\'i' });
    }

    // Sıralama için mevcut ders sayısı
    const { count } = await supabase.from('dersler')
        .select('*', { count: 'exact', head: true }).eq('kurs_id', courseId);
    const orderIndex = count || 0;

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

    const id = yeniId();
    veriYaDaHata(
        await supabase.from('dersler').insert({ id, kurs_id: courseId, ...dersSatiri(lessonData) }),
        'ders eklenemedi'
    );

    res.status(201).json({ lesson: { id, ...lessonData } });
}));

/**
 * PUT /api/academy/lessons/:courseId/reorder
 * NOT: /:courseId/:lessonId'den ÖNCE tanımlanmalı — aksi halde "reorder" bir
 * lessonId sanılır.
 */
router.put('/:courseId/reorder', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const { order } = req.body; // [{ id, orderIndex }]

    if (!Array.isArray(order)) return res.status(400).json({ error: 'Sıralama verisi gerekli' });

    for (const { id, orderIndex } of order) {
        veriYaDaHata(
            await supabase.from('dersler').update({ order_index: orderIndex })
                .eq('id', id).eq('kurs_id', courseId),
            'ders sırası yazılamadı'
        );
    }

    res.json({ success: true });
}));

/**
 * PUT /api/academy/lessons/:courseId/:lessonId
 * Ders güncelle
 */
router.put('/:courseId/:lessonId', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { courseId, lessonId } = req.params;
    const { title, description, lessonType, videoUrl, pdfUrl, passingScore, questions, orderIndex } = req.body;

    const { data: mevcut } = await supabase.from('dersler').select('*')
        .eq('id', lessonId).eq('kurs_id', courseId).maybeSingle();
    if (!mevcut) return res.status(404).json({ error: 'Ders bulunamadı' });
    const eski = dersYanit(mevcut);

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
    if (videoUrl !== undefined && lessonType !== 'quiz' && lessonType !== 'pdf') {
        if (videoUrl && !isValidLessonMediaUrl(videoUrl)) return res.status(400).json({ error: 'Geçersiz video dosyası URL\'i' });
        updateData.videoUrl = videoUrl;
    }
    if (pdfUrl !== undefined && lessonType !== 'quiz' && lessonType !== 'video') {
        if (pdfUrl && !isValidLessonMediaUrl(pdfUrl)) return res.status(400).json({ error: 'Geçersiz PDF dosyası URL\'i' });
        updateData.pdfUrl = pdfUrl;
    }
    if (orderIndex !== undefined) updateData.orderIndex = orderIndex;

    // Quiz güncelleniyorsa (tip gelmediyse eski tipe bak) doğrulamalar
    const finalLessonType = lessonType !== undefined ? lessonType : eski.lessonType;
    if (finalLessonType === 'quiz') {
        const finalPassing = passingScore !== undefined ? passingScore : eski.passingScore;
        const finalQuestions = questions !== undefined ? questions : eski.questions;

        if (typeof finalPassing !== 'number' || finalPassing < 1 || finalPassing > 100) return res.status(400).json({ error: 'Geçerli bir geçme notu (1-100) gerekli' });
        if (!Array.isArray(finalQuestions) || finalQuestions.length === 0) return res.status(400).json({ error: 'Sınav için en az bir soru gerekli' });

        if (passingScore !== undefined) updateData.passingScore = passingScore;
        if (questions !== undefined) updateData.questions = questions;
    }

    if (Object.keys(updateData).length > 0) {
        veriYaDaHata(
            await supabase.from('dersler').update(dersSatiri(updateData)).eq('id', lessonId),
            'ders güncellenemedi'
        );
    }
    res.json({ lesson: { ...eski, ...updateData } });
}));

/**
 * DELETE /api/academy/lessons/:courseId/:lessonId
 * Ders sil
 */
router.delete('/:courseId/:lessonId', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { courseId, lessonId } = req.params;

    const { data: mevcut } = await supabase.from('dersler').select('*')
        .eq('id', lessonId).eq('kurs_id', courseId).maybeSingle();
    if (!mevcut) return res.status(404).json({ error: 'Ders bulunamadı' });

    await deleteLessonFile(mevcut);                        // R2'deki video/pdf
    // İlerleme kayıtları FK cascade ile gider — yetim kayıt (yüzde > %100) sorunu
    // yapısal olarak yok; collectionGroup taraması gerekmiyor.
    veriYaDaHata(await supabase.from('dersler').delete().eq('id', lessonId), 'ders silinemedi');
    invalidateStatsCache();

    res.json({ success: true });
}));

export default router;
