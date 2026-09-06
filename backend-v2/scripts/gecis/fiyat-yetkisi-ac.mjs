/**
 * Merkez fiyat listesinde OLMAYAN ürünlerde şubeye kendi fiyatını girme yetkisi verir.
 *
 * KURAL: Merkezin Google Sheets listesindeki 69 kalem sabit fiyatlıdır (bkz.
 * merkez fiyat listesi kararı) — şube dokunamaz. Katalogdaki diğer 378 ürün
 * şubenin kendi kararı: `urun_sube.fiyat_serbest` açılır, panelde fiyatın
 * yanındaki kalem ikonu görünür ve girilen fiyat `fiyat_override`a yazılır
 * (merkez fiyatı DEĞİŞMEZ — bkz. products.js fiyatDuzenlenebilirMi).
 *
 * ÇAY: Merkez listesinde tek "Çay" var (40 ₺); biz Bardak/Fincan diye ayırdık.
 * İKİSİ DE merkez fiyatlı (kullanıcı kararı) — Bardak 40 ₺, Fincan 45 ₺.
 * Fincan'da 56 şubenin kendi fiyatı vardı (50-80 ₺), hepsi temizlenip merkez
 * fiyatına dönüyor.
 *
 * MERKEZ FİYATLI ÜRÜNDEKİ ESKİ OVERRIDE'LAR TEMİZLENİR: yetki kapalıyken
 * girilmiş, merkez fiyatını sessizce eziyorlardı.
 *
 * Kullanım: node scripts/gecis/fiyat-yetkisi-ac.mjs <merkez-liste.sql> [--uygula]
 */
import 'dotenv/config';
import fs from 'node:fs';
import { supabase } from '../../config/supabase.js';

const [dosya, ...bayraklar] = process.argv.slice(2);
const UYGULA = bayraklar.includes('--uygula');
if (!dosya) { console.error('Kullanım: node fiyat-yetkisi-ac.mjs <merkez-liste.sql> [--uygula]'); process.exit(1); }

const n = (s) => String(s ?? '').normalize('NFC').replace(/\p{C}/gu, '')
    .replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ').trim();

const merkezAdlar = [...fs.readFileSync(dosya, 'utf8').matchAll(/\('([^']+)',([\d.]+)\)/g)].map((m) => m[1]);
// "Çay" bizde iki kaleme ayrıldı; ikisi de merkez fiyatlı sayılır.
const merkezAnahtar = new Set(merkezAdlar.flatMap((a) => (a === 'Çay'
    ? [n('Çay (Bardak)'), n('Çay (Fincan)')]
    : [n(a)])));

const { data: urunler } = await supabase.from('urunler').select('id, ad, fiyat').is('silinme', null).range(0, 9999);
const merkezliId = new Set(urunler.filter((u) => merkezAnahtar.has(n(u.ad))).map((u) => u.id));

const satirlar = [];
for (let bas = 0; ; bas += 1000) {
    const { data, error } = await supabase.from('urun_sube')
        .select('urun_id, sube_kod, menude, gizli, fiyat_serbest, fiyat_override').range(bas, bas + 999);
    if (error) throw new Error(error.message);
    satirlar.push(...data);
    if (data.length < 1000) break;
}
const aktif = satirlar.filter((r) => r.menude && !r.gizli);

const yetkiVer = aktif.filter((r) => !merkezliId.has(r.urun_id) && !r.fiyat_serbest);
const yetkiAl = aktif.filter((r) => merkezliId.has(r.urun_id) && r.fiyat_serbest);
const overrideTemizle = aktif.filter((r) => merkezliId.has(r.urun_id) && r.fiyat_override !== null);

const adOf = new Map(urunler.map((u) => [u.id, u.ad]));
console.log(`katalog ${urunler.length} ürün → merkez fiyatlı ${merkezliId.size} | şubeye açık ${urunler.length - merkezliId.size}`);
console.log(`menüde aktif satır: ${aktif.length}`);
console.log(`  + fiyat yetkisi verilecek : ${yetkiVer.length}`);
console.log(`  - fiyat yetkisi alınacak  : ${yetkiAl.length}`);
console.log(`  - temizlenecek override   : ${overrideTemizle.length} (merkez fiyatlı üründe)`);
if (overrideTemizle.length) {
    const say = new Map();
    for (const r of overrideTemizle) say.set(adOf.get(r.urun_id), (say.get(adOf.get(r.urun_id)) || 0) + 1);
    [...say.entries()].sort((a, b) => b[1] - a[1]).forEach(([a, c]) => console.log(`      ${String(c).padStart(3)} şube  ${a}`));
}

if (!UYGULA) { console.log('\n(kuru çalıştırma — hiçbir şey yazılmadı; --uygula ekle)'); process.exit(0); }

const yaz = async (satir, yama) => {
    for (let i = 0; i < satir.length; i += 200) {
        for (const r of satir.slice(i, i + 200)) {
            const { error } = await supabase.from('urun_sube').update(yama)
                .eq('urun_id', r.urun_id).eq('sube_kod', r.sube_kod);
            if (error) throw new Error(`${r.urun_id}/${r.sube_kod}: ${error.message}`);
        }
    }
};
await yaz(yetkiVer, { fiyat_serbest: true });
console.log(`  ✓ ${yetkiVer.length} satırda fiyat yetkisi açıldı`);
if (yetkiAl.length) { await yaz(yetkiAl, { fiyat_serbest: false }); console.log(`  ✓ ${yetkiAl.length} satırda yetki kaldırıldı`); }
if (overrideTemizle.length) {
    await yaz(overrideTemizle, { fiyat_override: null });
    console.log(`  ✓ ${overrideTemizle.length} override temizlendi`);
    const { depoAyarla } = await import('../../config/r2.js');
    const { depoS3 } = await import('../../config/depo-s3.js');
    const { regenerateMenuJsons } = await import('../../modules/qr-menu/services/menu-cache.js');
    depoAyarla(depoS3);
    await regenerateMenuJsons([...new Set(overrideTemizle.map((r) => r.sube_kod))]);
    console.log('  ✓ etkilenen şubelerin menüsü yenilendi');
}
console.log('\nBitti.');
