/**
 * Birleştirmede kopan ürün görsellerini canlı kayda geri bağlar.
 *
 * NE OLDU: 12 Ağustos içecek birleştirmesinde aynı adı taşıyan iki kayıttan biri
 * `silinme` ile kapatıldı. Hayatta bırakılan kopya çoğu zaman GÖRSELSİZ olandı;
 * görsel, silinen ikizin üzerinde kaldı. Dosyalar R2'de duruyor (yükleme Temmuz
 * 2026'da elle yapılmış) ama hiçbir yerde görünmüyorlar.
 *
 * BU BETİK ürün oluşturmaz/silmez, yalnızca `urunler.gorsel` alanını kopyalar.
 * Kaynak: aynı ada sahip, silinmiş, görseli olan kayıt (birden fazlaysa EN SON
 * silinmiş olan). Hedefin görseli zaten doluysa DOKUNULMAZ.
 *
 * R2 KONTROLÜ: URL'nin işaret ettiği nesne gerçekten var mı diye bakılır —
 * yoksa ölü bir adres yazmış oluruz. Bulunamayanlar atlanır ve raporlanır.
 *
 * Kullanım: node scripts/gecis/gorsel-geri-bagla.mjs [--uygula]
 */
import 'dotenv/config';
import { supabase } from '../../config/supabase.js';
import { depoAyarla, listFiles } from '../../config/r2.js';
import { depoS3 } from '../../config/depo-s3.js';

depoAyarla(depoS3);
const UYGULA = process.argv.includes('--uygula');

// Ürün adları veritabanına NFD girmiş olabiliyor (bkz. akademi tarafındaki aynı
// sorun); düz eşitlik tutmaz, normalize edilmiş ad üzerinden eşleştiriyoruz.
const ad = (s) => String(s ?? '').normalize('NFC').replace(/\p{C}/gu, '')
    .replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr')
    .replace(/\s+/g, ' ').trim();
const anahtar = (u) => String(u ?? '').replace(/^.*r2\.dev\//, '').trim();

const { data: urunler, error } = await supabase.from('urunler')
    .select('id, ad, gorsel, silinme, kategori_id').range(0, 9999);
if (error) throw new Error(`ürünler okunamadı: ${error.message}`);

const mevcutDosya = new Set((await listFiles('urunler/')).map((f) => f.key));

const canliGorselsiz = urunler.filter((u) => !u.silinme && !String(u.gorsel ?? '').trim());
const oluGorselli = urunler.filter((u) => u.silinme && String(u.gorsel ?? '').trim());

const kaynakHarita = new Map();          // normalize ad → en son silinmiş görselli kayıt
for (const o of oluGorselli) {
    const k = ad(o.ad);
    const mevcut = kaynakHarita.get(k);
    if (!mevcut || new Date(o.silinme) > new Date(mevcut.silinme)) kaynakHarita.set(k, o);
}

const plan = []; const dosyaYok = [];
for (const c of canliGorselsiz) {
    const kaynak = kaynakHarita.get(ad(c.ad));
    if (!kaynak) continue;
    if (!mevcutDosya.has(anahtar(kaynak.gorsel))) { dosyaYok.push({ c, kaynak }); continue; }
    plan.push({ id: c.id, ad: c.ad, gorsel: kaynak.gorsel, kaynakId: kaynak.id });
}

const toplamCanli = urunler.filter((u) => !u.silinme).length;
const gorselliOnce = toplamCanli - canliGorselsiz.length;

console.log(`canlı ürün: ${toplamCanli} | görselli: ${gorselliOnce} (%${Math.round(100 * gorselliOnce / toplamCanli)})`);
console.log(`görselsiz: ${canliGorselsiz.length} | geri bağlanacak: ${plan.length} | farklı dosya: ${new Set(plan.map((p) => p.gorsel)).size}`);
console.log(`sonrası: ${gorselliOnce + plan.length} (%${Math.round(100 * (gorselliOnce + plan.length) / toplamCanli)})`);
if (dosyaYok.length) {
    console.log(`\nR2'de dosyası bulunamadı, atlanacak (${dosyaYok.length}):`);
    dosyaYok.forEach(({ c }) => console.log(`  ${c.ad}`));
}

console.log(`\n— eşleşmeler (${plan.length}) —`);
plan.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
    .forEach((p) => console.log(`  ${p.ad.slice(0, 44).padEnd(44)} ← ${p.gorsel.split('/').pop()}`));

if (!UYGULA) { console.log('\n(kuru çalıştırma — hiçbir şey yazılmadı; --uygula ekle)'); process.exit(0); }

for (const p of plan) {
    const { error: e } = await supabase.from('urunler').update({ gorsel: p.gorsel }).eq('id', p.id);
    if (e) throw new Error(`${p.ad}: ${e.message}`);
}
console.log(`\n✓ ${plan.length} ürüne görseli geri bağlandı`);

// Menüde görünen ürünler değişti: etkilenen şubelerin JSON'u yenilenmeli.
const { regenerateForAffected } = await import('../../modules/qr-menu/services/menu-cache.js');
await regenerateForAffected(plan.map((p) => ({ id: p.id })));
console.log('✓ etkilenen şubelerin menü JSON\'ları yenilendi');
