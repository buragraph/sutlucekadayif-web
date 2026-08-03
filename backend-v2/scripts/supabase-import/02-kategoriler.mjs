// kategoriler — 14 kayıt.
// `urunSayisi` TAŞINMAZ: denormalize sayaçtı, artık urunler üzerinden sayılır.
import { db, upsert, rapor, metin, sayi, dogrudanMi } from './ortak.mjs';

export default async function calistir() {
    const snap = await db.collection('kategoriler').get();

    const satirlar = snap.docs.map((doc) => {
        const v = doc.data();
        return {
            id: doc.id,
            ad: metin(v.ad ?? ''),
            sira: sayi(v.sira) ?? 0,
            tur: metin(v.tur ?? 'ortak'),
            renk: metin(v.renk ?? null),
            // Alan HİÇ yoksa null: eski API o kategoriyi bu anahtar OLMADAN
            // döndürüyordu (gorsel 3/14, kilitli 2/14 dokümanda var).
            gorsel: v.gorsel === undefined ? null : metin(v.gorsel),
            kilitli: v.kilitli === undefined ? null : v.kilitli === true,
        };
    });

    await upsert('kategoriler', satirlar, 'id');

    rapor('kategoriler', {
        'firestore dokümanı': snap.size,
        'yazılan satır': satirlar.length,
        'tür dağılımı': [...satirlar.reduce((m, s) => m.set(s.tur, (m.get(s.tur) || 0) + 1), new Map())]
            .map(([k, v]) => `${k}:${v}`).join(', '),
    });
    return { yazilan: satirlar.length };
}

if (dogrudanMi(import.meta.url)) await calistir();
