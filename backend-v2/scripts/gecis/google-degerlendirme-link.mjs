/**
 * Şubelerin Google değerlendirme adresini Google'dan çekip `subeler` tablosuna yazar.
 *
 * NEDEN: QR menüdeki "Bizi Değerlendirin" butonu koda gömülü tek bir adrese
 * gidiyordu ve o adres ölüydü (Google ana sayfasına düşüyordu). Doğru adres
 * konum başına ayrı: `locations.metadata.newReviewUri`.
 *
 * EŞLEŞME KAYNAĞI: `eslesmeler` (tur='google') — raporlar için zaten kurulmuş
 * şube ↔ Google konumu eşleştirmesi. Burada yeni eşleştirme YAPILMAZ, var olan
 * kullanılır; eksik eşleşmeler panelin Google eşleştirme ekranından girilir.
 *
 * Linki olmayan şubede kolon boş bırakılır — menü butonu o şubede hiç çıkmaz.
 *
 * Kullanım: node scripts/gecis/google-degerlendirme-link.mjs [--uygula]
 */
import 'dotenv/config';
import { supabase } from '../../config/supabase.js';
import { listAccounts as listLocations } from '../../modules/reports/services/google-business.js';

const UYGULA = process.argv.includes('--uygula');

const konumlar = await listLocations();
const { data: esles, error } = await supabase.from('eslesmeler')
    .select('anahtar, deger').eq('tur', 'google');
if (error) throw new Error(`eşleşmeler okunamadı: ${error.message}`);

const linkKonum = new Map(konumlar.filter((k) => k.reviewUri).map((k) => [k.name, k.reviewUri]));
const { data: subeler } = await supabase.from('subeler').select('kod, google_degerlendirme_link');
const mevcut = new Map(subeler.map((s) => [s.kod, s.google_degerlendirme_link || null]));

const plan = [];
const linksiz = [];
for (const s of subeler) {
    const eslesme = esles.find((e) => e.deger === s.kod);
    const link = eslesme ? (linkKonum.get(eslesme.anahtar) || null) : null;
    if (!link) { linksiz.push(s.kod); continue; }
    if (mevcut.get(s.kod) !== link) plan.push({ kod: s.kod, link });
}

console.log(`Google konumu: ${konumlar.length} (linki olan ${linkKonum.size}) | eşleşme: ${esles.length}`);
console.log(`şube: ${subeler.length} | link yazılacak/güncellenecek: ${plan.length} | linksiz kalacak: ${linksiz.length}`);
if (linksiz.length) console.log('  linksiz:', linksiz.join(', '));

if (!UYGULA) { console.log('\n(kuru çalıştırma — hiçbir şey yazılmadı; --uygula ekle)'); process.exit(0); }
if (!plan.length) { console.log('\nYapacak bir şey yok.'); process.exit(0); }

for (const p of plan) {
    const { error: e } = await supabase.from('subeler')
        .update({ google_degerlendirme_link: p.link }).eq('kod', p.kod);
    if (e) throw new Error(`${p.kod}: ${e.message}`);
}
console.log(`\n✓ ${plan.length} şubeye değerlendirme adresi yazıldı`);

// Menü JSON'ı şube nesnesinde bu adresi taşıyor — etkilenenleri yenile.
const { depoAyarla } = await import('../../config/r2.js');
const { depoS3 } = await import('../../config/depo-s3.js');
const { regenerateMenuJsons } = await import('../../modules/qr-menu/services/menu-cache.js');
depoAyarla(depoS3);
await regenerateMenuJsons(plan.map((p) => p.kod));
console.log('✓ menü JSON\'ları yenilendi');
