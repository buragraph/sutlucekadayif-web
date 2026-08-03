// eslesmeler — dört eşleme dokümanı (adset/campaign/google/meta) tek tabloda.
// Değerler tür olarak karışık: adset/campaign → { sube, name }, google/meta → düz
// şube slug'ı (string). jsonb kolonu ikisini de olduğu gibi taşır.
import { db, upsert, rapor, dogrudanMi } from './ortak.mjs';

const KAYNAKLAR = [
    ['adset', 'adset_mappings'],
    ['campaign', 'campaign_mappings'],
    ['google', 'google_mappings'],
    ['meta', 'meta_mappings'],
];

export default async function calistir() {
    const satirlar = [];
    const sayimlar = {};
    let bosDeger = 0;

    for (const [tur, dokumanId] of KAYNAKLAR) {
        const doc = await db.collection('reports').doc(dokumanId).get();
        const veri = doc.exists ? doc.data() : {};
        const girdiler = Object.entries(veri);
        sayimlar[dokumanId] = girdiler.length;
        for (const [anahtar, deger] of girdiler) {
            // deger kolonu NOT NULL — boş değerli eşleme zaten anlamsız, atla.
            if (deger === null || deger === undefined) { bosDeger++; continue; }
            satirlar.push({ tur, anahtar, deger });
        }
    }

    await upsert('eslesmeler', satirlar, 'tur,anahtar');

    rapor('eslesmeler', {
        ...sayimlar,
        'yazılan satır (toplam)': satirlar.length,
        'atlanan boş değer': bosDeger,
    });
    return { yazilan: satirlar.length };
}

if (dogrudanMi(import.meta.url)) await calistir();
