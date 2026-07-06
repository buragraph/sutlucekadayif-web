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
