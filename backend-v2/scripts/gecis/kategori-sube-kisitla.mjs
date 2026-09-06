/**
 * "Merkez bu ürünü yalnızca şu şubelere açtı" kuralını gerçekten uygular.
 *
 * DURUM: Kahvaltılık / Börek Çeşitleri / Diğer kategorileri merkezin birkaç
 * şubeye özel açtığı kalemler. Ama bu bir KURAL olarak yazılmamış: ürünler
 * sadece "kimse menüsüne eklemediği için" görünmüyordu. Şube sahibi
 * "Ürün Ekle" katalog penceresini açsa hepsini görüp kendi menüsüne
 * ekleyebilirdi (katalog yalnızca `gizli` olanları eler — bkz. products.js
 * `/katalog` → urunGizliMi). 10 üründen yalnız 1'inde (Kaşar Salamlı Soğuk
 * Sandviç) bu koruma vardı; muhtemelen elle işaretlenmiş, gerisi unutulmuş.
 *
 * BU BETİK: ürünün açık olduğu şubeler DIŞINDAKİ her şubede `gizli = true`
 * satırı açar. `menude` alanına dokunmaz; gizli satır zaten menüde olmayan bir
 * ürünü etkilemediği için hiçbir şubenin menü JSON'ı değişmez.
 *
 * GERİ ALINABİLİR: `gizli` bayrağını false'a çekmek yeterli, veri silinmiyor.
 *
 * Kullanım: node scripts/gecis/kategori-sube-kisitla.mjs [--uygula]
 */
import 'dotenv/config';
import { supabase } from '../../config/supabase.js';

const UYGULA = process.argv.includes('--uygula');
const KATEGORILER = ['Kahvaltılık', 'Börek Çeşitleri', 'Diğer'];

const { data: kategoriler } = await supabase.from('kategoriler').select('id, ad');
const hedefKat = kategoriler.filter((k) => KATEGORILER.includes(k.ad));
if (hedefKat.length !== KATEGORILER.length) {
    throw new Error(`kategori bulunamadı: ${KATEGORILER.filter((a) => !hedefKat.some((k) => k.ad === a))}`);
}
const katAd = new Map(hedefKat.map((k) => [k.id, k.ad]));

const { data: urunler } = await supabase.from('urunler')
    .select('id, ad, kategori_id').is('silinme', null).in('kategori_id', hedefKat.map((k) => k.id));

const { data: subeler } = await supabase.from('subeler').select('kod');
const tumSubeler = subeler.map((s) => s.kod);

const { data: satirlar } = await supabase.from('urun_sube')
    .select('urun_id, sube_kod, menude, gizli').in('urun_id', urunler.map((u) => u.id));

const plan = [];
console.log('— Plan —');
for (const u of urunler.sort((a, b) => katAd.get(a.kategori_id).localeCompare(katAd.get(b.kategori_id), 'tr'))) {
    const kendi = satirlar.filter((s) => s.urun_id === u.id);
    const acik = kendi.filter((s) => s.menude && !s.gizli).map((s) => s.sube_kod);
    const zatenGizli = new Set(kendi.filter((s) => s.gizli).map((s) => s.sube_kod));
    const hedef = tumSubeler.filter((k) => !acik.includes(k) && !zatenGizli.has(k));
    plan.push(...hedef.map((sube_kod) => ({ urun_id: u.id, sube_kod })));
    console.log(`  [${katAd.get(u.kategori_id)}] ${u.ad.trim()}`);
    console.log(`      açık kalacak: ${acik.join(', ') || '(hiçbiri)'}  |  gizlenecek: ${hedef.length}${zatenGizli.size ? ` (${zatenGizli.size} zaten gizli)` : ''}`);
}
console.log(`\ntoplam yazılacak satır: ${plan.length}`);

// Güvenlik: menüde olan bir satırı gizlemek menüyü değiştirir — olmamalı.
const menudeOlanlar = plan.filter((p) => satirlar.some((s) => s.urun_id === p.urun_id && s.sube_kod === p.sube_kod && s.menude));
if (menudeOlanlar.length) {
    console.error(`\nDUR: ${menudeOlanlar.length} satır menüde görünüyor, gizlenirse menü değişir. İncele.`);
    process.exit(1);
}

if (!UYGULA) { console.log('\n(kuru çalıştırma — hiçbir şey yazılmadı; --uygula ekle)'); process.exit(0); }

for (let i = 0; i < plan.length; i += 500) {
    const { error } = await supabase.from('urun_sube').upsert(
        plan.slice(i, i + 500).map((p) => ({ ...p, gizli: true, menude: false })),
        { onConflict: 'urun_id,sube_kod' }
    );
    if (error) throw new Error(`yazılamadı: ${error.message}`);
}
console.log(`\n✓ ${plan.length} satır gizlendi (menüler etkilenmedi)`);
