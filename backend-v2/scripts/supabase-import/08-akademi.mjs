// Akademi — kurslar (7) + dersler (86) + ilerleme (4).
// Alan adları İngilizce KALIR (API sözleşmesi); kolonlar snake_case, camelCase'e
// dönüşüm backend-v2 veri katmanında tek yardımcıda yapılır.
//
// academy_progress/{uid} üst dokümanındaki byCourse/totalCompleted/lastActivity/
// statsMigrated sayaçları TAŞINMAZ — ilerleme_ozeti view'ı yerini alıyor.
import { db, upsert, rapor, uyari, metin, sayi, zaman, dizi, dogrudanMi } from './ortak.mjs';

export default async function calistir() {
    const kursSnap = await db.collection('academy_courses').get();

    const kurslar = kursSnap.docs.map((doc) => {
        const v = doc.data();
        return {
            id: doc.id,
            title: metin(v.title ?? null),
            description: metin(v.description ?? null),
            thumbnail_url: metin(v.thumbnailUrl ?? null),
            is_published: v.isPublished === true,
            order_index: sayi(v.orderIndex),
            // Alan Firestore'da HİÇ yoksa null kalır ([] değil): eski API o kursu
            // targetRoles/targetSubeler anahtarı OLMADAN döndürüyordu (parite).
            target_roles: v.targetRoles === undefined ? null : dizi(v.targetRoles).map(String),
            target_subeler: v.targetSubeler === undefined ? null : dizi(v.targetSubeler).map(String),
            olusturma: zaman(v.createdAt),
            guncelleme: zaman(v.updatedAt),
        };
    });
    await upsert('kurslar', kurslar, 'id');

    const dersler = [];
    for (const kurs of kursSnap.docs) {
        const dersSnap = await kurs.ref.collection('lessons').get();
        for (const doc of dersSnap.docs) {
            const v = doc.data();
            dersler.push({
                id: doc.id,
                kurs_id: kurs.id,
                title: metin(v.title ?? null),
                description: metin(v.description ?? null),
                lesson_type: metin(v.lessonType ?? null),
                video_url: metin(v.videoUrl ?? null),
                pdf_url: metin(v.pdfUrl ?? null),
                order_index: sayi(v.orderIndex),
                passing_score: sayi(v.passingScore),
                questions: v.questions ?? null,
                olusturma: zaman(v.createdAt),
            });
        }
    }
    await upsert('dersler', dersler, 'id');

    // İlerleme: academy_progress/{uid}/completedLessons/{lessonId}
    const dersIds = new Set(dersler.map((d) => d.id));
    const kursIds = new Set(kurslar.map((k) => k.id));
    const ilerleme = [];
    const kopuk = [];
    for (const kullanici of (await db.collection('academy_progress').get()).docs) {
        for (const doc of (await kullanici.ref.collection('completedLessons').get()).docs) {
            const v = doc.data();
            if (!dersIds.has(doc.id) || !kursIds.has(v.courseId)) {
                kopuk.push(`${kullanici.id}/${doc.id}`);
                continue;
            }
            ilerleme.push({
                uid: kullanici.id,
                ders_id: doc.id,
                kurs_id: v.courseId,
                score: sayi(v.score),
                completed_at: zaman(v.completedAt) ?? new Date().toISOString(),
            });
        }
    }
    await upsert('ilerleme', ilerleme, 'uid,ders_id');

    if (kopuk.length) uyari(`ilerleme: silinmiş ders/kursa işaret eden ${kopuk.length} kayıt atlandı → ${kopuk.join(', ')}`);

    rapor('akademi', {
        'yazılan kurs': kurslar.length,
        'yazılan ders': dersler.length,
        'yazılan ilerleme': ilerleme.length,
        'atlanan kopuk ilerleme': kopuk.length,
    });
    return { kurslar: kurslar.length, dersler: dersler.length, ilerleme: ilerleme.length };
}

if (dogrudanMi(import.meta.url)) await calistir();
