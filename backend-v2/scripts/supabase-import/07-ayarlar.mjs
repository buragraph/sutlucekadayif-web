// ayarlar — anahtar/jsonb sözlüğü.
// Taşınanlar: ayarlar/menu_cache (menü yazımı duraklatma bayrağı),
//             reports/settings (metaApiToken, googleClientId/Secret/RedirectUri),
//             reports/google_token (OAuth token'ı).
// TAŞINMAYANLAR: ayarlar/qr_menu_version + reports/meta (veri versiyonu sayaçları —
//   versionedCacheMiddleware ile birlikte ölüyor), reports/adsets_cache (çekim cache'i).
import { db, upsert, rapor, dogrudanMi } from './ortak.mjs';

const KAYNAKLAR = [
    ['menu_cache', 'ayarlar', 'menu_cache'],
    ['settings', 'reports', 'settings'],
    ['google_token', 'reports', 'google_token'],
];

export default async function calistir() {
    const satirlar = [];
    const eksik = [];
    const simdi = new Date().toISOString();

    for (const [anahtar, koleksiyon, dokumanId] of KAYNAKLAR) {
        const doc = await db.collection(koleksiyon).doc(dokumanId).get();
        if (!doc.exists) { eksik.push(`${koleksiyon}/${dokumanId}`); continue; }
        satirlar.push({ anahtar, deger: doc.data(), guncelleme: simdi });
    }

    await upsert('ayarlar', satirlar, 'anahtar');

    rapor('ayarlar', {
        'yazılan satır': satirlar.length,
        'taşınan anahtarlar': satirlar.map((s) => s.anahtar).join(', '),
        'kaynakta bulunamayan': eksik.length ? eksik.join(', ') : 0,
    });
    return { yazilan: satirlar.length };
}

if (dogrudanMi(import.meta.url)) await calistir();
