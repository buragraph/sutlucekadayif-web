/**
 * Ağustos katalog birleştirmesinin iki yan etkisini onarır.
 *
 * ARKA PLAN: Birleştirmelerde ürünler `silinme` ile kapatıldı ama şubelerin o
 * ürünlere bağlı `urun_sube` satırları yerinde kaldı. Menü sorgusu silinmiş
 * ürünü eliyor (menu-builder.js `is('urunler.silinme', null)`), dolayısıyla o
 * kalemler menüden SESSİZCE düştü — panelde açık görünüp müşteriye çıkmıyorlar.
 *
 * İki kalemde bu gerçek kayba dönüşmüştü (karşılığı olan diğerlerinde ürün yeni
 * adıyla zaten açıktı):
 *
 *   1. "Vişneli Ekmek Kadayıfı Kaymaklı" — 88 şubede açık, 12 Ağustos'ta
 *      silinmiş, katalogda YERİNE GEÇEN kayıt yok. Kaymaksız "Vişneli Ekmek
 *      Kadayıfı" ayrı bir ürün. Çözüm: ürünü geri aç (silinme = null); şube
 *      satırları zaten duruyor, menüye kendiliğinden döner.
 *
 *   2. "Cevizli Soğuk Baklava" — canlı kayıt (doğru kategoride, Soğuk Baklava)
 *      88 şubeye BAĞLI ama hepsinde `mevcut_degil = true`. Nedeni: WP menü
 *      karşılaştırması kategori bazlı yapılıyordu, WP'de bu ürün "Soğuk Kadayıf"
 *      altındaydı ve silinmiş ikizle eşleşti; canlı kayıt "şubede yok" sanıldı.
 *      Çözüm: ölü ikizin açık olduğu şubelerde bayrağı kaldır.
 *
 * Ardından silinmiş ürünlere bağlı TÜM artık satırlar temizlenir. Silmeden önce
 * tamamı TSV'ye yazılır: bu satırlar "hangi şube neyi satıyordu" bilgisini
 * taşıyor ve bir kısmı (ör. Coca Cola Zero) hâlâ karara bağlanmadı.
 *
 * Kullanım: node scripts/gecis/katalog-olu-kayit-onarim.mjs <cikti-dizini> [--uygula]
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { supabase } from '../../config/supabase.js';
import { depoAyarla } from '../../config/r2.js';
import { depoS3 } from '../../config/depo-s3.js';
import { regenerateMenuJsons } from '../../modules/qr-menu/services/menu-cache.js';

depoAyarla(depoS3);

const [dizin, ...bayraklar] = process.argv.slice(2);
const UYGULA = bayraklar.includes('--uygula');
if (!dizin) { console.error('Kullanım: node katalog-olu-kayit-onarim.mjs <cikti-dizini> [--uygula]'); process.exit(1); }

const VISNELI_OLU = '6KwIgpto7cP6YsH5clkt';   // Vişneli Ekmek Kadayıfı Kaymaklı (silinmiş)
const CEVIZLI_OLU = 'lNLiLtBzALpbwqEf08BU';   // Cevizli Soğuk Baklava (silinmiş ikiz)
const CEVIZLI_CANLI = 'muoDSEmbYvbDAhrLv0G4'; // Cevizli Soğuk Baklava (canlı, Soğuk Baklava)

/** PostgREST 1000 satır sınırını aşarak tüm sayfaları okur. */
async function tumSatirlar(sorguKur) {
    const hepsi = [];
    for (let bas = 0; ; bas += 1000) {
        const { data, error } = await sorguKur().range(bas, bas + 999);
        if (error) throw new Error(error.message);
        hepsi.push(...data);
        if (data.length < 1000) break;
    }
    return hepsi;
}

// ── Durum tespiti ─────────────────────────────────────────────────────────
const { data: visneli } = await supabase.from('urunler').select('id, ad, silinme').eq('id', VISNELI_OLU).single();
const cevizliSubeler = (await tumSatirlar(() => supabase.from('urun_sube')
    .select('sube_kod').eq('urun_id', CEVIZLI_OLU).eq('menude', true)
    .eq('gizli', false).eq('mevcut_degil', false))).map((r) => r.sube_kod);

const oluUrunler = new Set((await tumSatirlar(() => supabase.from('urunler')
    .select('id').not('silinme', 'is', null))).map((r) => r.id));
const tumUrunSube = await tumSatirlar(() => supabase.from('urun_sube')
    .select('urun_id, sube_kod, menude, gizli, mevcut_degil, fiyat_override'));
const oluSatirlar = tumUrunSube.filter((r) => oluUrunler.has(r.urun_id));

console.log('— Plan —');
console.log(visneli.silinme
    ? `  + "${visneli.ad}" katalogda geri açılacak (${oluSatirlar.filter((r) => r.urun_id === VISNELI_OLU).length} şube kaydı zaten duruyor)`
    : `  ✓ "${visneli.ad}" zaten açık`);
console.log(`  + "Cevizli Soğuk Baklava" canlı kaydında ${cevizliSubeler.length} şubede mevcut_degil kaldırılacak`);
console.log(`  - silinmiş ürüne bağlı ${oluSatirlar.length} artık satır temizlenecek (${new Set(oluSatirlar.map((r) => r.urun_id)).size} ürün)`);
console.log(`    → Vişneli geri açılınca temizlikten düşecek: ${oluSatirlar.filter((r) => r.urun_id === VISNELI_OLU).length}`);

if (!UYGULA) { console.log('\n(kuru çalıştırma — hiçbir şey yazılmadı; --uygula ekle)'); process.exit(0); }

// ── 1. Vişneli: ürünü geri aç ─────────────────────────────────────────────
if (visneli.silinme) {
    const { error } = await supabase.from('urunler').update({ silinme: null }).eq('id', VISNELI_OLU);
    if (error) throw new Error(`ürün geri açılamadı: ${error.message}`);
    oluUrunler.delete(VISNELI_OLU);
    console.log(`  ✓ "${visneli.ad}" katalogda geri açıldı`);
}

// ── 2. Cevizli Soğuk Baklava: canlı kayıtta bayrağı kaldır ────────────────
if (cevizliSubeler.length) {
    for (let i = 0; i < cevizliSubeler.length; i += 200) {
        const { error } = await supabase.from('urun_sube')
            .update({ menude: true, mevcut_degil: false })
            .eq('urun_id', CEVIZLI_CANLI).in('sube_kod', cevizliSubeler.slice(i, i + 200));
        if (error) throw new Error(`Cevizli Soğuk Baklava açılamadı: ${error.message}`);
    }
    console.log(`  ✓ Cevizli Soğuk Baklava ${cevizliSubeler.length} şubede menüye döndü`);
}

// ── 3. Artık satırlar: önce yedek, sonra sil ──────────────────────────────
const kalanOlu = oluSatirlar.filter((r) => oluUrunler.has(r.urun_id));
const { data: adlar } = await supabase.from('urunler').select('id, ad').in('id', [...new Set(kalanOlu.map((r) => r.urun_id))]);
const adHarita = new Map((adlar ?? []).map((u) => [u.id, u.ad]));

const yedek = path.join(dizin, 'olu-urun-sube-yedegi.tsv');
fs.writeFileSync(yedek,
    'sube_kod\turun_id\turun_ad\tmenude\tgizli\tmevcut_degil\tfiyat_override\n' +
    kalanOlu.map((r) => [r.sube_kod, r.urun_id, adHarita.get(r.urun_id) ?? '', r.menude, r.gizli, r.mevcut_degil, r.fiyat_override ?? ''].join('\t')).join('\n') + '\n');
console.log(`  ✓ ${kalanOlu.length} satır yedeklendi: ${yedek}`);

const oluIdler = [...new Set(kalanOlu.map((r) => r.urun_id))];
let silinen = 0;
for (let i = 0; i < oluIdler.length; i += 100) {
    const { error, count } = await supabase.from('urun_sube')
        .delete({ count: 'exact' }).in('urun_id', oluIdler.slice(i, i + 100));
    if (error) throw new Error(`artık satırlar silinemedi: ${error.message}`);
    silinen += count ?? 0;
}
console.log(`  ✓ ${silinen} artık satır silindi`);

// ── 4. Etkilenen şubelerin menüsünü yenile ────────────────────────────────
const etkilenen = [...new Set([
    ...oluSatirlar.filter((r) => r.urun_id === VISNELI_OLU).map((r) => r.sube_kod),
    ...cevizliSubeler,
])];
console.log(`  menü yenileniyor: ${etkilenen.length} şube…`);
await regenerateMenuJsons(etkilenen);
console.log('\nBitti.');
