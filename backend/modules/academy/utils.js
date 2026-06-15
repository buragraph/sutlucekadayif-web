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
