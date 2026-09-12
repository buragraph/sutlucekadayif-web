import { supabase } from '../../config/supabase.js';
import { tumSatirlar } from '../../utils/veri.js';

/**
 * Quiz derslerinde doğru cevap (correctOptionId) yalnızca sunucu tarafı
 * puanlamada kullanılır; istemciye sızmamalı. Admin (içerik yöneticisi)
 * düzenleme için tam veriyi alır, diğer roller için cevaplar ayıklanır.
 */
export function stripQuizAnswers(lesson, isAdmin) {
    if (isAdmin || !lesson || lesson.lessonType !== 'quiz' || !Array.isArray(lesson.questions)) {
        return lesson;
    }
    return {
        ...lesson,
        questions: lesson.questions.map(({ correctOptionId, ...q }) => q),
    };
}

/**
 * Kurs hedef kitle kontrolü. targetRoles / targetSubeler boş dizi veya
 * tanımsız ise "herkes/tüm şubeler" demektir (eski kurslar alan olmadan
 * çalışmaya devam eder). Admin her kursu görür — çağıran tarafta atlanır.
 */
export function courseVisibleToUser(course, user) {
    const roles = course.targetRoles;
    if (Array.isArray(roles) && roles.length > 0 && !roles.includes(user.role)) return false;
    const subeler = course.targetSubeler;
    if (Array.isArray(subeler) && subeler.length > 0 && !subeler.includes(user.subeSlug)) return false;
    return true;
}

/**
 * Kurs başına ders sayısı — `{ kursId: adet }`.
 *
 * Tek sorgu: kurs başına `count()` atmak kurs sayısı kadar alt-istek demekti
 * ve Workers'ın 50 istek bütçesini kursları çoğaltan her adımda riske atıyordu.
 * Hem kurs listesi hem şube ilerleme özeti aynı sayacı kullanıyor.
 */
export async function dersSayilari() {
    const satirlar = await tumSatirlar(() => supabase.from('dersler').select('kurs_id'),
        { sirala: 'id', baglam: 'dersler' });
    const sayac = {};
    for (const d of satirlar) sayac[d.kurs_id] = (sayac[d.kurs_id] || 0) + 1;
    return sayac;
}
