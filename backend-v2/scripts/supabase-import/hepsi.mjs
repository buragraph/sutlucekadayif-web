// Tüm import'ları bağımlılık sırasına göre çalıştırır (hepsi upsert — tekrar güvenli).
// Sıra FK zincirinden geliyor: subeler → kategoriler → urunler/urun_sube → donemler …
//
// Kullanım: cd backend-v2 && node scripts/supabase-import/hepsi.mjs
import { dogrudanMi } from './ortak.mjs';

const ADIMLAR = [
    ['subeler', () => import('./01-subeler.mjs')],
    ['kategoriler', () => import('./02-kategoriler.mjs')],
    ['urunler + urun_sube', () => import('./03-urunler.mjs')],
    ['donemler', () => import('./04-donemler.mjs')],
    ['kampanyalar', () => import('./05-kampanyalar.mjs')],
    ['eslesmeler', () => import('./06-eslesmeler.mjs')],
    ['ayarlar', () => import('./07-ayarlar.mjs')],
    ['akademi', () => import('./08-akademi.mjs')],
    ['kullanici_sube', () => import('./09-kullanici-sube.mjs')],
    ['medya', () => import('./10-medya.mjs')],
    ['formlar + notlar', () => import('./11-formlar.mjs')],
];

export default async function hepsiniCalistir() {
    const baslangic = Date.now();
    const sonuclar = {};

    for (const [ad, yukle] of ADIMLAR) {
        const modul = await yukle();
        sonuclar[ad] = await modul.default();
    }

    console.log(`\nToplam süre: ${((Date.now() - baslangic) / 1000).toFixed(1)} sn`);
    console.log('Sonraki adım: node scripts/supabase-import/dogrula.mjs');
    return sonuclar;
}

if (dogrudanMi(import.meta.url)) {
    await hepsiniCalistir();
    process.exit(0);
}
