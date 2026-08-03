import { Router } from '../../../shared/router.js';
import { supabase } from '../../../config/supabase.js';
import { verifyToken, requirePermission } from '../../../middleware/auth.js';
import { deleteFile, urlToKey, isKeyAllowed } from '../../../config/r2.js';
import { stripQuizAnswers, courseVisibleToUser } from '../utils.js';
import { kursYanit, kursSatiri, dersYanit } from '../donusum.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { yeniId, veriYaDaHata, tumSatirlar } from '../../../utils/veri.js';
import { invalidateStatsCache, hedefKitleFiltresi } from './progress.js';

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

/** Kurs başına ders sayısı — eskiden kurs başına bir count() sorgusuydu. */
async function dersSayilari() {
    const satirlar = await tumSatirlar(() => supabase.from('dersler').select('kurs_id'),
        { sirala: 'id', baglam: 'dersler' });
    const sayac = {};
    for (const d of satirlar) sayac[d.kurs_id] = (sayac[d.kurs_id] || 0) + 1;
    return sayac;
}

/**
 * GET /api/academy/courses
 * Kursları listele. Admin tümünü görür; diğer roller yalnızca yayında olan ve
 * hedef kitlesine (rol/şube) girdikleri kursları görür.
 */
router.get('/', verifyToken, asyncHandler(async (req, res) => {
    // Hedefleme SQL'de (text[] sorguları); courseVisibleToUser yine de uygulanır —
    // kural tek kaynak orada yaşıyor, sorgu yalnızca gereksiz satır taşımayı önlüyor.
    let sorgu = supabase.from('kurslar').select('*');
    if (req.user.role !== 'admin') sorgu = hedefKitleFiltresi(sorgu, req.user);

    const [satirlar, sayac] = await Promise.all([
        sorgu.range(0, 9999).then((r) => veriYaDaHata(r, 'kurslar okunamadı')),
        dersSayilari(),
    ]);

    let courses = satirlar.map((s) => kursYanit(s, { lessonCount: sayac[s.id] || 0 }));
    if (req.user.role !== 'admin') {
        courses = courses.filter((c) => c.isPublished && courseVisibleToUser(c, req.user));
    }

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
 * PUT /api/academy/courses/reorder
 * Kurs sıralamasını güncelle. NOT: /:id route'undan ÖNCE tanımlı olmalı.
 */
router.put('/reorder', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { order } = req.body; // [{ id, orderIndex }]
    if (!Array.isArray(order) || order.length === 0) return res.status(400).json({ error: 'Sıralama verisi gerekli' });
    const gecerli = order.every((o) => o && typeof o.id === 'string' && Number.isFinite(o.orderIndex));
    if (!gecerli) return res.status(400).json({ error: 'Geçersiz sıralama verisi' });

    // Silinmiş bir kurs (bayat liste) diğerlerinin sıralanmasını engellemesin:
    // eşleşmeyen id'de update sessizce 0 satır etkiler.
    const sonuclar = await Promise.allSettled(
        order.map(({ id, orderIndex }) =>
            supabase.from('kurslar').update({ order_index: orderIndex }).eq('id', id)
                .then((r) => { if (r.error) throw new Error(r.error.message); }))
    );
    if (sonuclar.some((s) => s.status === 'rejected')) {
        return res.status(500).json({ error: 'Sıralama güncellenemedi' });
    }

    res.json({ success: true });
}));

/**
 * GET /api/academy/courses/:id
 * Kurs detayları + dersler
 */
router.get('/:id', verifyToken, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { data: satir } = await supabase.from('kurslar').select('*').eq('id', id).maybeSingle();
    if (!satir) return res.status(404).json({ error: 'Kurs bulunamadı' });

    const course = kursYanit(satir);

    // Yayında olmayan veya hedef kitlesi dışındaki kursa doğrudan URL ile erişim yok
    if (req.user.role !== 'admin' && (!course.isPublished || !courseVisibleToUser(course, req.user))) {
        return res.status(404).json({ error: 'Kurs bulunamadı' });
    }

    const dersSatirlari = veriYaDaHata(
        await supabase.from('dersler').select('*').eq('kurs_id', id)
            .order('order_index', { ascending: true }).range(0, 9999),
        'dersler okunamadı'
    );
    const isAdmin = req.user.role === 'admin';
    course.lessons = dersSatirlari.map((d) => stripQuizAnswers(dersYanit(d), isAdmin));

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
    const sonKurs = veriYaDaHata(
        await supabase.from('kurslar').select('order_index')
            .order('order_index', { ascending: false, nullsFirst: false }).limit(1),
        'kurs sırası okunamadı'
    );
    const orderIndex = sonKurs.length === 0 ? 0 : (Number(sonKurs[0].order_index) || 0) + 1;

    const simdi = new Date().toISOString();
    const courseData = {
        title: title.trim(),
        description: description?.trim() || '',
        thumbnailUrl: thumbnailUrl || '',
        isPublished: false,
        targetRoles: sanitizeTargetRoles(targetRoles),
        targetSubeler: sanitizeTargetSubeler(targetSubeler),
        orderIndex,
        createdAt: simdi,
        updatedAt: simdi,
    };

    const id = yeniId();
    veriYaDaHata(
        await supabase.from('kurslar').insert({ id, ...kursSatiri(courseData) }),
        'kurs eklenemedi'
    );
    res.status(201).json({ course: { id, ...courseData } });
}));

/**
 * PUT /api/academy/courses/:id
 * Kurs güncelle
 */
router.put('/:id', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, description, thumbnailUrl, isPublished, targetRoles, targetSubeler } = req.body;

    const { data: mevcut } = await supabase.from('kurslar').select('*').eq('id', id).maybeSingle();
    if (!mevcut) return res.status(404).json({ error: 'Kurs bulunamadı' });

    const updateData = { updatedAt: new Date().toISOString() };
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (thumbnailUrl !== undefined) updateData.thumbnailUrl = thumbnailUrl;
    if (isPublished !== undefined) updateData.isPublished = isPublished;
    if (targetRoles !== undefined) updateData.targetRoles = sanitizeTargetRoles(targetRoles);
    if (targetSubeler !== undefined) updateData.targetSubeler = sanitizeTargetSubeler(targetSubeler);

    veriYaDaHata(
        await supabase.from('kurslar').update(kursSatiri(updateData)).eq('id', id),
        'kurs güncellenemedi'
    );
    res.json({ course: { ...kursYanit(mevcut), ...updateData } });
}));

/**
 * DELETE /api/academy/courses/:id
 * Kurs sil (dersleri ve ilerleme kayıtlarıyla birlikte)
 */
router.delete('/:id', verifyToken, requirePermission('academy.manage'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { data: mevcut } = await supabase.from('kurslar').select('id').eq('id', id).maybeSingle();
    if (!mevcut) return res.status(404).json({ error: 'Kurs bulunamadı' });

    // Derslerin R2 dosyalarını (video/pdf) best-effort sil
    const dersler = veriYaDaHata(
        await supabase.from('dersler').select('video_url, pdf_url').eq('kurs_id', id).range(0, 9999),
        'dersler okunamadı'
    );
    await Promise.all(dersler.map(async (d) => {
        const url = d.video_url || d.pdf_url;
        if (!url) return;
        try {
            // Savunma-derinliği: cascade silmede de allow-list dışı/dekontlar/ key'i asla silme.
            const key = urlToKey(url);
            if (key && isKeyAllowed(key, { forDelete: true })) await deleteFile(key);
        } catch (e) { console.error('[Academy] R2 dosya silinemedi:', e.message); }
    }));

    // Dersler ve ilerleme kayıtları FK'da `on delete cascade` — Firestore'daki
    // "alt koleksiyon + collectionGroup ile yetim temizliği" adımı yapısal olarak yok.
    veriYaDaHata(await supabase.from('kurslar').delete().eq('id', id), 'kurs silinemedi');
    invalidateStatsCache();

    res.json({ success: true });
}));

export default router;
