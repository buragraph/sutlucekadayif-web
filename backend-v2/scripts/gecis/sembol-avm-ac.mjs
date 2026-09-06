/**
 * "Sembol AVM" şubesini WordPress QR menüsünden alıp sisteme açar.
 *
 * NEDEN BETİK: Bu şube WP'de var, bizde hiç yoktu — WordPress kapanınca basılı
 * QR'ı boşa düşecekti. Ürün listesi WP'nin `menu_urunleri` CPT'sinden çekilip
 * scratchpad'e yazıldı; betik o dosyayı okur, WP'ye bağlanmaz.
 *
 * ŞUBE KODU `sembyol-avm`: basılı QR bu slug'ı taşıyor (WP sayfa adresi
 * qr.sutlucekadayif.com/sembyol-avm/), menü route'u kökte /{kod} olduğu için
 * kod birebir aynı olmak ZORUNDA. WP'deki yazım "Sembyol"; görünen ad
 * "Sembol AVM" yapıldı, kod dokunulmadı.
 *
 * Ürünler katalogda ARANIR, yenisi AÇILMAZ: fiyat merkez listesinden gelir
 * (bkz. merkez fiyat kararı), şubeye özel fiyat yazılmaz. Katalogda karşılığı
 * bulunamayan kalem raporlanır ve atlanır — sessizce yeni ürün üretmek
 * mükerrer katalog demek.
 *
 * Kullanım: node scripts/gecis/sembol-avm-ac.mjs <urun-listesi.txt> [--uygula]
 *   Satır biçimi: kategori|ürün adı|fiyat
 */
import 'dotenv/config';
import fs from 'node:fs';
import { supabase } from '../../config/supabase.js';

const [dosya, ...bayraklar] = process.argv.slice(2);
const UYGULA = bayraklar.includes('--uygula');
if (!dosya) { console.error('Kullanım: node sembol-avm-ac.mjs <liste.txt> [--uygula]'); process.exit(1); }

const KOD = 'sembyol-avm';
const AD = 'Sembol AVM';

// Akademi tarafındaki gibi: başlıklar NFD olabiliyor, kontrol karakteri de
// görülüyor. Karşılaştırma hep normalize edilmiş hâl üzerinden.
const n = (s) => String(s ?? '').normalize('NFC')
    .replace(/\p{C}/gu, '')
    .replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr')
    .replace(/[’']/g, '').replace(/[–—]/g, '-')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// WP'deki ad ↔ katalogdaki ad. Hepsi fiyatla ve şube yaygınlığıyla teyit edildi;
// "Fıstıklı Sarma → Bıçak Sarma" eşlemesi bu projede daha önce verilmiş karar.
const TAKMA_AD = {
    'Cevizli Özel Baklava': 'Cevizli Antep Özel Baklava',
    'Fıstıklı Özel Baklava': 'Fıstıklı Antep Özel Baklava',
    'Midye Şerbetli Baklava': 'Midye',
    'Şöbiyet Şerbetli Baklava': 'Şöbiyet',
    'Fıstıklı Sarma Şerbetli Kadayıf': 'Fıstıklı Bıçak Sarma Şerbetli Kadayıf',
    // WP adları eski; katalog Ağustos'taki içecek temizliğinde merkez yazımına geçti.
    'Coca Cola': 'Cola',
    'Limonata (Ev Yapımı)': 'Limonata',
    'Soda (Sade)': 'Soda Ve Çeşitleri',
    'Fıstıkzade Baklava': 'Fıstıkzade',
};

const satirlar = fs.readFileSync(dosya, 'utf8').trim().split('\n').filter(Boolean)
    .map((s) => { const [kategori, ad, fiyat] = s.split('|'); return { kategori, ad, fiyat: Number(fiyat) }; });

// `silinme` DOLU olanlar katalogdan kalkmış kayıtlar — daha önceki birleştirmelerin
// artığı. Menü sorgusu da onları eliyor (menu-builder.js `is('urunler.silinme', null)`),
// yani buraya alınırsa ürün şubeye bağlanır ama menüde HİÇ görünmez.
const { data: urunler, error: uHata } = await supabase.from('urunler')
    .select('id, ad, fiyat, kategori_id').is('silinme', null).range(0, 9999);
if (uHata) throw new Error(`ürünler okunamadı: ${uHata.message}`);
const { data: kategoriler } = await supabase.from('kategoriler').select('id, ad');
const katAd = new Map(kategoriler.map((k) => [k.id, k.ad]));

const adIndeks = new Map();
for (const u of urunler) {
    const k = n(u.ad);
    if (!adIndeks.has(k)) adIndeks.set(k, []);
    adIndeks.get(k).push(u);
}

// Mükerrer adlarda hangi kopyanın seçileceğine karar vermek için yaygınlık.
// PostgREST tek istekte en fazla 1000 satır döner; urun_sube bunun çok üstünde,
// sayfalamadan okunursa yaygınlık sayıları sessizce sıfıra düşer.
const sayim = new Map();
for (let bas = 0; ; bas += 1000) {
    const { data, error } = await supabase.from('urun_sube')
        .select('urun_id').eq('menude', true).range(bas, bas + 999);
    if (error) throw new Error(`urun_sube okunamadı: ${error.message}`);
    for (const r of data) sayim.set(r.urun_id, (sayim.get(r.urun_id) ?? 0) + 1);
    if (data.length < 1000) break;
}

const eslesen = []; const eslesmeyen = []; const belirsiz = [];
for (const s of satirlar) {
    const aday = adIndeks.get(n(TAKMA_AD[s.ad] ?? s.ad)) || [];
    if (aday.length === 1) eslesen.push({ ...s, urun: aday[0] });
    else if (aday.length === 0) eslesmeyen.push(s);
    else {
        // Katalogda aynı adla iki kayıt var (mükerrer katalog sorunu, bu işin
        // dışında). Şubeye, hâlihazırda daha çok şubede açık olan kopya verilir —
        // yeni şube çoğunluğun kullandığı kayda bağlanmalı.
        const sirali = [...aday].sort((a, b) => (sayim.get(b.id) ?? 0) - (sayim.get(a.id) ?? 0));
        eslesen.push({ ...s, urun: sirali[0], mukerrer: sirali });
        belirsiz.push({ ...s, aday: sirali });
    }
}

const { data: mevcutSube } = await supabase.from('subeler').select('kod').eq('kod', KOD).maybeSingle();

console.log('— Plan —');
console.log(mevcutSube ? `  ✓ şube zaten var (${KOD})` : `  + şube: ${KOD} "${AD}"`);
console.log(`  WP listesi: ${satirlar.length} | eşleşen: ${eslesen.length} | eşleşmeyen: ${eslesmeyen.length} (atlanır)`);
if (eslesmeyen.length) { console.log('  EŞLEŞMEYEN (atlanacak):'); eslesmeyen.forEach((s) => console.log(`    ${s.kategori} / ${s.ad} (${s.fiyat} ₺)`)); }
if (belirsiz.length) {
    console.log(`  KATALOGDA MÜKERRER ${belirsiz.length} (yaygın olan seçildi):`);
    belirsiz.forEach((s) => console.log(`    ${s.ad} → ${s.aday.map((a) => `${a.id}(${sayim.get(a.id) ?? 0} şube)`).join('  vs  ')}`));
}

// Fiyat farkları — merkez fiyatı esas, sadece bilgi amaçlı raporlanır.
const fark = eslesen.filter((e) => Number(e.urun.fiyat) !== e.fiyat);
if (fark.length) {
    console.log(`  fiyat farkı (merkez fiyatı korunur) ${fark.length}:`);
    fark.forEach((e) => console.log(`    ${e.ad}: WP ${e.fiyat} ₺ → bizde ${Math.round(e.urun.fiyat)} ₺`));
}

if (!UYGULA) { console.log('\n(kuru çalıştırma — hiçbir şey yazılmadı; --uygula ekle)'); process.exit(0); }

if (!mevcutSube) {
    const { error } = await supabase.from('subeler').insert({ kod: KOD, ad: AD });
    if (error) throw new Error(`şube açılamadı: ${error.message}`);
    console.log(`  ✓ şube açıldı: ${KOD}`);
}

// Önceki denemede silinmiş ürünlere bağlanmış satırlar kalmış olabilir; menüde
// hiç görünmedikleri için sessiz çöp olurlar. Bu şubenin kayıtlarını sıfırla.
const canliIdler = new Set(urunler.map((u) => u.id));
const { data: varolan } = await supabase.from('urun_sube').select('urun_id').eq('sube_kod', KOD);
const olu = (varolan ?? []).map((r) => r.urun_id).filter((id) => !canliIdler.has(id));
if (olu.length) {
    const { error } = await supabase.from('urun_sube').delete().eq('sube_kod', KOD).in('urun_id', olu);
    if (error) throw new Error(`ölü satırlar silinemedi: ${error.message}`);
    console.log(`  ✓ silinmiş ürüne bağlı ${olu.length} satır temizlendi`);
}

const { error: usHata } = await supabase.from('urun_sube').upsert(
    eslesen.map((e) => ({ urun_id: e.urun.id, sube_kod: KOD, menude: true })),
    { onConflict: 'urun_id,sube_kod' }
);
if (usHata) throw new Error(`ürün-şube yazılamadı: ${usHata.message}`);
console.log(`  ✓ ${eslesen.length} ürün menüye açıldı`);

const { regenerateMenuJson } = await import('../../modules/qr-menu/services/menu-cache.js');
const { depoAyarla } = await import('../../config/r2.js');
const { depoS3 } = await import('../../config/depo-s3.js');
depoAyarla(depoS3);
await regenerateMenuJson(KOD);
console.log(`  ✓ menu/${KOD}.json yenilendi`);
console.log('\nBitti.');
