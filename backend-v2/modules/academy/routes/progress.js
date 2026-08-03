import { Router } from '../../../shared/router.js';
import { supabase } from '../../../config/supabase.js';
import { verifyToken } from '../../../middleware/auth.js';
import { hesapAlanlari, kullanicilariGetir } from '../../../shared/kullanici-dizini.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { veriYaDaHata, isoZ, tumSatirlar } from '../../../utils/veri.js';
import { kursYanit } from '../donusum.js';
import { courseVisibleToUser } from '../utils.js';

const router = Router();

// Admin istatistikleri için kısa ömürlü cache (kullanıcı sayısı arttıkça pahalı sorgu)
let statsCache = null; // { ts, data }
const STATS_TTL = 60 * 1000;
export function invalidateStatsCache() { statsCache = null; }

// syncUserProgressStats TAŞINMADI: academy_progress/{uid} dokümanındaki
// totalCompleted/lastActivity/byCourse/statsMigrated sayaçları Firestore'da
// aggregate yapılamadığı için elle tutuluyordu. Postgres'te group by ucuz —
// sayaçlar artık `ilerleme` tablosundan anlık türetiliyor, "lazy migration"
// ve ders/kurs silme sonrası yeniden hesap adımları da öldü.

/**
 * Hedef kitle filtresi — text[] kolonlarında SQL tarafı eleme.
 * Boş dizi / null = "herkes" (eski kurslar alan olmadan çalışmaya devam eder).
 * Kuralın TEK KAYNAĞI utils.js'teki courseVisibleToUser; bu yalnızca gereksiz
 * satırları taşımamak için, çağıran taraf yine o fonksiyonu uygular.
 */
export function hedefKitleFiltresi(sorgu, user) {
    const guvenli = (v) => String(v ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
    const rol = guvenli(user.role);
    const sube = guvenli(user.subeSlug);
    let s = sorgu.eq('is_published', true);
    if (rol) s = s.or(`target_roles.is.null,target_roles.eq.{},target_roles.cs.{${rol}}`);
    if (sube) s = s.or(`target_subeler.is.null,target_subeler.eq.{},target_subeler.cs.{${sube}}`);
    else s = s.or('target_subeler.is.null,target_subeler.eq.{}');
    return s;
}

/** Kullanıcının ilerleme satırları → { byCourse, totalCompleted, lastActivity } */
function ozetle(satirlar) {
    const byCourse = {};
    let lastActivity = null;
    for (const s of satirlar) {
        const kurs = s.kurs_id;
        if (!byCourse[kurs]) byCourse[kurs] = { count: 0, lastActivity: null };
        byCourse[kurs].count++;
        const t = isoZ(s.completed_at);
        if (!byCourse[kurs].lastActivity || t > byCourse[kurs].lastActivity) byCourse[kurs].lastActivity = t;
        if (!lastActivity || t > lastActivity) lastActivity = t;
    }
    return { byCourse, totalCompleted: satirlar.length, lastActivity };
}

// ─── Static routes FIRST (before :courseId param) ───

/**
 * GET /api/academy/progress/all/summary
 * Kullanıcının tüm kurslardaki ilerleme özeti (dashboard için)
 */
router.get('/all/summary', verifyToken, asyncHandler(async (req, res) => {
    const satirlar = veriYaDaHata(
        await supabase.from('ilerleme').select('kurs_id, completed_at').eq('uid', req.user.uid).range(0, 9999),
        'ilerleme okunamadı'
    );
    const { byCourse } = ozetle(satirlar);
    const byCourseCount = {};
    for (const [cId, info] of Object.entries(byCourse)) byCourseCount[cId] = info.count;
    res.json({ byCourse: byCourseCount });
}));

/**
 * GET /api/academy/progress/admin/stats
 * Admin: Tüm kullanıcıların ilerleme istatistikleri. Hiç başlamamış kullanıcılar
 * da 0 ilerlemeyle listelenir. Şube adları da (slug → ad) yanıtla döner.
 */
router.get('/admin/stats', verifyToken, asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Yetkisiz' });
    }

    // Kısa ömürlü cache — ?fresh=1 (Yenile butonu) atlar, sonuç yine cache'e yazılır.
    if (req.query.fresh !== '1' && statsCache && Date.now() - statsCache.ts < STATS_TTL) {
        return res.json(statsCache.data);
    }

    const [kullanicilar, subeler, ilerlemeler] = await Promise.all([
        supabase.from('kullanici_sube').select('uid, role, sube_slug').range(0, 9999)
            .then((r) => veriYaDaHata(r, 'kullanıcılar okunamadı')),
        // Şube adları doğrudan şube satırlarından (konum-store öldü)
        supabase.from('subeler').select('kod, ad').range(0, 9999)
            .then((r) => veriYaDaHata(r, 'şubeler okunamadı')),
        tumSatirlar(() => supabase.from('ilerleme').select('uid, kurs_id, completed_at'),
            { sirala: ['uid', 'ders_id'], baglam: 'ilerleme' }),
    ]);

    const subeMap = Object.fromEntries(kullanicilar.map((k) => [k.uid, k]));
    const subeAdlari = Object.fromEntries(subeler.map((s) => [s.kod, s.ad]));

    const ilerlemeByUid = new Map();
    for (const s of ilerlemeler) {
        if (!ilerlemeByUid.has(s.uid)) ilerlemeByUid.set(s.uid, []);
        ilerlemeByUid.get(s.uid).push(s);
    }

    // İlerlemesi olanlar + eğitim hedef kitlesindeki (admin olmayan) tüm kullanıcılar
    const userIds = [...new Set([
        ...ilerlemeByUid.keys(),
        ...kullanicilar.filter((k) => k.role !== 'admin').map((k) => k.uid),
    ])];

    // Auth hesaplarından ad/e-posta (tek listeleme + filtre; bilinmeyen uid sessizce atlanır)
    const authUsersMap = {};
    try {
        for (const [uid, u] of await kullanicilariGetir(userIds)) {
            const hesap = hesapAlanlari(u);
            authUsersMap[uid] = { displayName: hesap.displayName, email: hesap.email };
        }
    } catch (e) {
        console.error('Auth fetch error', e);
    }

    const stats = userIds.map((userId) => {
        const { byCourse, totalCompleted, lastActivity } = ozetle(ilerlemeByUid.get(userId) || []);
        const userInfo = authUsersMap[userId] || { displayName: null, email: null };
        const subeData = subeMap[userId] || {};
        return {
            userId,
            displayName: userInfo.displayName,
            email: userInfo.email,
            subeSlug: subeData.sube_slug || null,
            role: subeData.role || null,
            totalCompleted,
            lastActivity,
            byCourse,
        };
    });

    // Son aktiviteye göre sırala (hiç başlamayanlar en sonda)
    stats.sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || ''));

    statsCache = { ts: Date.now(), data: { stats, subeAdlari } };
    res.json({ stats, subeAdlari });
}));

/**
 * GET /api/academy/progress/admin/stats/:userId/detail
 * Admin: Bir kullanıcının ders bazlı tamamlama kayıtları (sınav skorlarıyla).
 */
router.get('/admin/stats/:userId/detail', verifyToken, asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Yetkisiz' });
    }
    const { userId } = req.params;

    // Kurs/ders başlıkları tek sorguda JOIN ile gelir (eskiden kurs başına ayrı
    // ders koleksiyonu okunuyordu)
    const satirlar = veriYaDaHata(
        await supabase.from('ilerleme')
            .select('ders_id, kurs_id, score, completed_at, dersler(title, lesson_type), kurslar(title)')
            .eq('uid', userId).range(0, 9999),
        'ilerleme okunamadı'
    );
    if (satirlar.length === 0) return res.json({ detay: [] });

    const detay = satirlar.map((i) => ({
        courseId: i.kurs_id || null,
        courseTitle: i.kurslar?.title || 'Silinmiş kurs',
        lessonId: i.ders_id,
        lessonTitle: i.dersler?.title || 'Silinmiş ders',
        lessonType: i.dersler?.lesson_type || null,
        score: i.score === null || i.score === undefined ? null : Number(i.score),
        completedAt: isoZ(i.completed_at) || null,
    }));
    detay.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));

    res.json({ detay });
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

    // Dersi + kursu tek round-trip'te getir (görünürlük kontrolü için ikisi de gerekli)
    const [{ data: dersSatiri }, { data: kursSatiri }] = await Promise.all([
        supabase.from('dersler').select('*').eq('id', lessonId).eq('kurs_id', courseId).maybeSingle(),
        supabase.from('kurslar').select('*').eq('id', courseId).maybeSingle(),
    ]);

    if (!dersSatiri) return res.status(404).json({ error: 'Sınav bulunamadı' });

    if (dersSatiri.lesson_type !== 'quiz') {
        return res.status(400).json({ error: 'Bu içerik bir sınav değil.' });
    }

    // Kurs yayında değilse veya kullanıcının hedef kitlesi dışındaysa sınav
    // gönderimi kabul edilmesin
    if (req.user.role !== 'admin') {
        const course = kursSatiri ? kursYanit(kursSatiri) : null;
        if (!course || !course.isPublished || !courseVisibleToUser(course, req.user)) {
            return res.status(403).json({ error: 'Bu kursa erişim yetkiniz yok' });
        }
    }

    let passingScore = dersSatiri.passing_score === null ? null : Number(dersSatiri.passing_score);
    const questions = dersSatiri.questions || [];
    // Savunmacı varsayılan: passingScore tanımsız/geçersiz/0 ise herkesi
    // otomatik geçirmesin — create/update >=1 zorluyor ama eski kayıtlara karşı.
    if (typeof passingScore !== 'number' || passingScore < 1) passingScore = 70;

    if (questions.length === 0) {
        return res.status(400).json({ error: 'Bu sınavda hiç soru yok.' });
    }

    // Not hesaplama
    let correctCount = 0;
    questions.forEach((q) => {
        if (answers[q.id] === q.correctOptionId) correctCount++;
    });

    const score = Math.round((correctCount / questions.length) * 100);
    const passed = score >= passingScore;

    if (passed) {
        const { data: mevcut } = await supabase.from('ilerleme')
            .select('score').eq('uid', userId).eq('ders_id', lessonId).maybeSingle();

        // İlk geçişte kaydet; sonraki denemelerde yalnızca skor yükselirse güncelle
        if (!mevcut || score > (Number(mevcut.score) || 0)) {
            veriYaDaHata(
                await supabase.from('ilerleme').upsert(
                    { uid: userId, ders_id: lessonId, kurs_id: courseId, score, completed_at: new Date().toISOString() },
                    { onConflict: 'uid,ders_id' }
                ),
                'sınav sonucu kaydedilemedi'
            );
            invalidateStatsCache();
        }
    }

    res.json({ passed, score, correctCount, totalQuestions: questions.length, passingScore });
}));

/**
 * GET /api/academy/progress/:courseId
 * Kullanıcının bir kurstaki ders ilerleme durumu
 */
router.get('/:courseId', verifyToken, asyncHandler(async (req, res) => {
    const { courseId } = req.params;

    const satirlar = veriYaDaHata(
        await supabase.from('ilerleme').select('ders_id, kurs_id, score, completed_at')
            .eq('uid', req.user.uid).eq('kurs_id', courseId).range(0, 9999),
        'ilerleme okunamadı'
    );

    const completed = {};
    for (const s of satirlar) {
        completed[s.ders_id] = {
            courseId: s.kurs_id,
            completedAt: isoZ(s.completed_at),
            ...(s.score === null || s.score === undefined ? {} : { score: Number(s.score) }),
        };
    }

    res.json({ completed });
}));

/**
 * POST /api/academy/progress/:courseId/:lessonId
 * Dersi tamamlandı olarak işaretle
 */
router.post('/:courseId/:lessonId', verifyToken, asyncHandler(async (req, res) => {
    const { courseId, lessonId } = req.params;
    const userId = req.user.uid;

    // (1) ders GERÇEKTEN var mı (uydurma lessonId ile sahte tamamlama engellensin),
    // (2) kurs yayında + kullanıcının hedef kitlesinde mi
    const [{ data: dersSatiri }, { data: kursSatiri }] = await Promise.all([
        supabase.from('dersler').select('id, lesson_type').eq('id', lessonId).eq('kurs_id', courseId).maybeSingle(),
        supabase.from('kurslar').select('*').eq('id', courseId).maybeSingle(),
    ]);

    if (!dersSatiri) return res.status(404).json({ error: 'Ders bulunamadı' });

    // Quiz dersleri yalnızca sınavı geçerek (/quiz/.../submit) tamamlanabilir
    if (dersSatiri.lesson_type === 'quiz') {
        return res.status(400).json({ error: 'Sınavlar yalnızca sınavı geçerek tamamlanır.' });
    }

    if (req.user.role !== 'admin') {
        const course = kursSatiri ? kursYanit(kursSatiri) : null;
        if (!course || !course.isPublished || !courseVisibleToUser(course, req.user)) {
            return res.status(403).json({ error: 'Bu kursa erişim yetkiniz yok' });
        }
    }

    // Zaten tamamlıysa dokunma (idempotent — completed_at korunur)
    const { data: mevcut } = await supabase.from('ilerleme')
        .select('uid').eq('uid', userId).eq('ders_id', lessonId).maybeSingle();
    if (mevcut) return res.json({ success: true });

    veriYaDaHata(
        await supabase.from('ilerleme').insert({
            uid: userId, ders_id: lessonId, kurs_id: courseId, completed_at: new Date().toISOString(),
        }),
        'tamamlama kaydedilemedi'
    );
    invalidateStatsCache();

    res.json({ success: true });
}));

/**
 * DELETE /api/academy/progress/:courseId/:lessonId
 * Tamamlanma işaretini kaldır
 */
router.delete('/:courseId/:lessonId', verifyToken, asyncHandler(async (req, res) => {
    const { lessonId } = req.params;
    const userId = req.user.uid;

    const { data: mevcut } = await supabase.from('ilerleme')
        .select('uid').eq('uid', userId).eq('ders_id', lessonId).maybeSingle();
    if (!mevcut) return res.json({ success: true });

    veriYaDaHata(
        await supabase.from('ilerleme').delete().eq('uid', userId).eq('ders_id', lessonId),
        'tamamlama kaldırılamadı'
    );
    invalidateStatsCache();

    res.json({ success: true });
}));

export default router;
