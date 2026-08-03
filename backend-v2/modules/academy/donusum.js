/**
 * Akademi veri katmanı ↔ API sözleşmesi çevirisi — TEK KAYNAK.
 *
 * API alan adları İngilizce ve camelCase KALIR (`title`, `orderIndex`,
 * `thumbnailUrl`...); Postgres kolonları snake_case. Bu dosya iki tarafı
 * çevirir, rota gövdelerinde tek bir `foo_bar` geçmez.
 *
 * NULL DAVRANIŞI (parite): Firestore'da alan YOKSA yanıtta da yoktu.
 *  - Kurslarda `orderIndex/targetRoles/targetSubeler` bazı eski kayıtlarda hiç
 *    yazılmamış → null kolonlar yanıttan KIRPILIR.
 *  - Derslerde `passingScore/questions` video/pdf derslerinde AÇIKÇA null
 *    yazılıyordu → onlar KORUNUR.
 */

import { isoZ } from '../../utils/veri.js';

const kirpNull = (nesne) => {
    const cikti = {};
    for (const [k, v] of Object.entries(nesne)) if (v !== null && v !== undefined) cikti[k] = v;
    return cikti;
};

/** kurslar satırı → API kursu */
export function kursYanit(satir, ek = {}) {
    return kirpNull({
        id: satir.id,
        title: satir.title,
        description: satir.description,
        thumbnailUrl: satir.thumbnail_url,
        isPublished: satir.is_published,
        orderIndex: satir.order_index,
        targetRoles: satir.target_roles,
        targetSubeler: satir.target_subeler,
        createdAt: isoZ(satir.olusturma),
        updatedAt: isoZ(satir.guncelleme),
        ...ek,
    });
}

/** API kursu (kısmi olabilir) → kurslar kolonları */
export function kursSatiri(veri) {
    const esleme = {
        title: 'title',
        description: 'description',
        thumbnailUrl: 'thumbnail_url',
        isPublished: 'is_published',
        orderIndex: 'order_index',
        targetRoles: 'target_roles',
        targetSubeler: 'target_subeler',
        createdAt: 'olusturma',
        updatedAt: 'guncelleme',
    };
    const satir = {};
    for (const [alan, kolon] of Object.entries(esleme)) {
        if (veri[alan] !== undefined) satir[kolon] = veri[alan];
    }
    return satir;
}

/** dersler satırı → API dersi (null'lar korunur) */
export function dersYanit(satir) {
    return {
        id: satir.id,
        title: satir.title,
        description: satir.description,
        lessonType: satir.lesson_type,
        videoUrl: satir.video_url,
        pdfUrl: satir.pdf_url,
        passingScore: satir.passing_score === null ? null : Number(satir.passing_score),
        questions: satir.questions,
        orderIndex: satir.order_index,
        createdAt: isoZ(satir.olusturma),
    };
}

/** API dersi (kısmi olabilir) → dersler kolonları */
export function dersSatiri(veri) {
    const esleme = {
        title: 'title',
        description: 'description',
        lessonType: 'lesson_type',
        videoUrl: 'video_url',
        pdfUrl: 'pdf_url',
        passingScore: 'passing_score',
        questions: 'questions',
        orderIndex: 'order_index',
        createdAt: 'olusturma',
    };
    const satir = {};
    for (const [alan, kolon] of Object.entries(esleme)) {
        if (veri[alan] !== undefined) satir[kolon] = veri[alan];
    }
    return satir;
}
