// kullanici_sube — 5 kayıt (doküman id'si = Firebase Auth uid).
// Faz 1'de kimlik hâlâ Firebase Auth'ta; bu tablo rol/şube eşlemesini tutar.
import { db, upsert, rapor, uyari, metin, zaman, bosNull, subeKodlari, dogrudanMi } from './ortak.mjs';

export default async function calistir() {
    const [snap, subeler] = await Promise.all([db.collection('kullanici_sube').get(), subeKodlari()]);

    const kopukSube = [];
    const satirlar = snap.docs.map((doc) => {
        const v = doc.data();
        // '' → null: admin kullanıcılarında şube boş string olarak yazılmış
        let subeSlug = bosNull(v.sube_slug);
        if (subeSlug && !subeler.has(subeSlug)) {
            kopukSube.push(`${doc.id} → ${subeSlug}`);
            subeSlug = null;                 // FK'yı patlatmadan taşı, raporla
        }
        return {
            uid: doc.id,
            role: metin(v.role ?? null),
            sube_slug: subeSlug,
            telefon: metin(v.telefon ?? null),
            onboarded: v.onboarded === true,
            onboarded_at: zaman(v.onboardedAt),
        };
    });

    await upsert('kullanici_sube', satirlar, 'uid');

    if (kopukSube.length) uyari(`kullanici_sube: subeler'de olmayan şube slug'ı null yapıldı → ${kopukSube.join(', ')}`);

    rapor('kullanici_sube', {
        'firestore dokümanı': snap.size,
        'yazılan satır': satirlar.length,
        'rol dağılımı': [...satirlar.reduce((m, s) => m.set(s.role, (m.get(s.role) || 0) + 1), new Map())]
            .map(([k, v]) => `${k}:${v}`).join(', '),
        'kopuk şube referansı': kopukSube.length,
    });
    return { yazilan: satirlar.length };
}

if (dogrudanMi(import.meta.url)) await calistir();
