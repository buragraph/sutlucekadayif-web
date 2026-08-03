// medya — 287 kayıt. DİKKAT: createdAt burada Firestore Timestamp (ISO string DEĞİL),
// zaman() yardımcısı toDate() ile çevirir.
import { db, upsert, rapor, metin, sayi, zaman, dizi, dogrudanMi } from './ortak.mjs';

export default async function calistir() {
    const snap = await db.collection('medya').get();

    const satirlar = snap.docs.map((doc) => {
        const v = doc.data();
        return {
            id: doc.id,
            url: metin(v.url ?? ''),
            klasor: metin(v.klasor ?? null),
            ad: metin(v.ad ?? null),
            boyut: sayi(v.boyut),
            arama: dizi(v.arama).map(String),
            olusturma: zaman(v.createdAt),
        };
    });

    await upsert('medya', satirlar, 'id');

    rapor('medya', {
        'firestore dokümanı': snap.size,
        'yazılan satır': satirlar.length,
        'boyutu olmayan kayıt': satirlar.filter((s) => s.boyut == null).length,
        'klasör sayısı': new Set(satirlar.map((s) => s.klasor)).size,
    });
    return { yazilan: satirlar.length };
}

if (dogrudanMi(import.meta.url)) await calistir();
