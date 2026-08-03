/**
 * Menü JSON yazımını duraklatır / sürdürür.
 *
 * Katalogda toplu düzenleme yapılırken (ürün birleştirme, fiyat/şube ayarı) her
 * kayıtta 88 menü JSON'ı yeniden pişiyor: işlem başına ~740 okuma + 88 R2 yazımı.
 * Duraklatılınca yazım atlanır, iş bitince tek seferde tam yenileme yapılır.
 *
 * Kullanım:
 *   node scripts/menu-yazimi.js durum
 *   node scripts/menu-yazimi.js duraklat "katalog düzenlemesi"
 *   node scripts/menu-yazimi.js surdur
 *
 * DİKKAT: duraklatma sırasında R2'deki JSON'lar eski kalır, yani müşteri QR
 * menüsünde eski veriyi görür.
 *
 * `surdur` tam yenilemeyi ancak R2 anahtarları .env'de varsa yapabilir. Anahtar
 * yoksa yalnızca bayrak kaldırılır; tam yenilemeyi prod backend'e bırakmak için
 * panelden bir kategori kaydetmek yeterli (PUT /categories/:id tüm şubeleri
 * yeniler).
 */
import { db } from '../config/firebase.js';

const REF = db.collection('ayarlar').doc('menu_cache');
const [komut, ...kalan] = process.argv.slice(2);

const yazdirDurum = (d) => {
    console.log(`  duraklatıldı : ${d.duraklatildi ? 'EVET' : 'hayır'}`);
    if (d.not) console.log(`  not          : ${d.not}`);
    if (d.zaman) console.log(`  zaman        : ${d.zaman}`);
};

const mevcut = (await REF.get()).data() || {};

if (!komut || komut === 'durum') {
    console.log('Menü JSON yazımı:');
    yazdirDurum(mevcut);
    process.exit(0);
}

if (komut !== 'duraklat' && komut !== 'surdur') {
    console.error(`Bilinmeyen komut: ${komut}\nKullanım: durum | duraklat [not] | surdur`);
    process.exit(1);
}

const duraklat = komut === 'duraklat';
await REF.set(
    { duraklatildi: duraklat, not: kalan.join(' '), zaman: new Date().toISOString() },
    { merge: true }
);
console.log(duraklat ? '⏸ Menü yazımı duraklatıldı.' : '▶ Duraklatma kaldırıldı.');
yazdirDurum((await REF.get()).data());

if (duraklat) process.exit(0);

// Sürdürme: biriken değişiklikleri tek seferde yaz — R2 anahtarı şart.
const eksik = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']
    .filter((k) => !process.env[k]);

if (eksik.length) {
    console.log(`\n⚠ R2 anahtarları yok (.env eksik: ${eksik.join(', ')}) — tam yenileme atlandı.`);
    console.log('  Menüleri yazdırmak için panelden bir kategoriyi kaydet:');
    console.log('  PUT /categories/:id tüm şube menülerini yeniden üretir.');
    process.exit(0);
}

const { regenerateAllMenuJsons } = await import('../modules/qr-menu/services/menu-cache.js');
console.log('\n88 şubenin menü JSON\'ı yeniden üretiliyor...');
const t0 = Date.now();
await regenerateAllMenuJsons();
console.log(`✅ Bitti (${((Date.now() - t0) / 1000).toFixed(1)} sn)`);
process.exit(0);
