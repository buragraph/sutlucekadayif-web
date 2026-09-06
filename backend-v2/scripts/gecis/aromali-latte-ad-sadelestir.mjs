/**
 * "Aromalı Latte" kayıtlarının adını sadeleştirir; aroma listesi açıklamaya iner.
 *
 * SORUN: Sistemde varyant/seçenek kavramı yok, bu yüzden 17 aroma ürünün ADININ
 * içine parantezle sıkıştırılmış — 196 karakterlik bir ad. Panelde katalog
 * penceresini ve tabloyu taşırıyordu (UI tarafı ayrıca düzeltildi), müşteri
 * menüsünde de kartın adı okunmaz hâldeydi.
 *
 * ÇÖZÜM: ad = "Aromalı Latte", aromalar `aciklama` alanına. Açıklama hem menü
 * kartında hem ürün detayında gösteriliyor ve menü ARAMASINA dahil
 * (MenuPage.jsx: ad || aciklama) — yani müşteri "Lotus" arayınca yine buluyor.
 *
 * DİKKAT: Bu İKİ ürün birbirinin kopyası DEĞİL. Biri Sıcak İçecekler (150 ₺,
 * 8 aroma), öteki Soğuk İçecekler (170 ₺, 17 aroma); ikisi de malatya
 * menüsünde açık. Adları aynı olacak ama farklı kategorilerde durdukları için
 * müşteride karışmıyorlar. Birini silmek gerçek bir ürünü menüden kaldırırdı.
 *
 * Aroma listesindeki bariz klavye hataları da düzeltildi (Hıbıscus→Hibiscus,
 * Pumkın→Pumpkin, Curaçoa→Curaçao, Chaı→Chai, Italyan→İtalyan).
 *
 * Kuru çalışır; yazmak için --uygula.
 */
import 'dotenv/config';
import { supabase } from '../../config/supabase.js';
import { depoS3 } from '../../config/depo-s3.js';
import { depoAyarla } from '../../config/r2.js';
import { regenerateMenuJsons } from '../../modules/qr-menu/services/menu-cache.js';
depoAyarla(depoS3);

const UYGULA = process.argv.includes('--uygula');

const HEDEFLER = [
    {
        id: 'lNXzXDA1ZzxAgowSD9Yi',          // Soğuk İçecekler, 170 ₺
        ad: 'Aromalı Latte',
        aromalar: [
            'Lotus', 'Hibiscus', 'Tuzlu Karamel', 'Marshmallow', 'Pumpkin Spice',
            'Blue Curaçao', 'Vişne', 'Çikolata', 'Beyaz Çikolata', 'Çilek', 'Muz',
            'Karamel', 'Vanilya', 'Frambuaz', 'Hindistan Cevizi', 'İtalyan Karamel',
            'Chai Tea',
        ],
    },
    {
        id: 'LY81EFsuqIdfCcSU5OUH',          // Sıcak İçecekler, 150 ₺
        ad: 'Aromalı Latte',
        aromalar: [
            'Çikolata', 'Beyaz Çikolata', 'Çilek', 'Muz', 'Karamel', 'Vanilya',
            'Frambuaz', 'Hindistan Cevizi',
        ],
    },
];

const etkilenenSubeler = new Set();

for (const h of HEDEFLER) {
    const { data: u, error } = await supabase.from('urunler').select('*').eq('id', h.id).single();
    if (error) throw error;

    const yeniAciklama = `Aromalar: ${h.aromalar.join(', ')}`;
    // Açıklama zaten doluysa ÜZERİNE YAZMA — merkez oraya başka bir şey
    // yazmış olabilir; o durumda adı da değiştirmeyip uyarıp geç.
    if (u.aciklama?.trim() && u.aciklama.trim() !== yeniAciklama) {
        console.log(`ATLANDI (açıklama dolu): ${h.id} → ${JSON.stringify(u.aciklama)}`);
        continue;
    }

    console.log(`\n${h.id}  (${u.fiyat} ₺)`);
    console.log(`  ad       : ${u.ad.slice(0, 70)}…`);
    console.log(`         → : ${h.ad}`);
    console.log(`  aciklama → : ${yeniAciklama}`);

    if (UYGULA) {
        const { error: e } = await supabase.from('urunler')
            .update({ ad: h.ad, aciklama: yeniAciklama }).eq('id', h.id);
        if (e) throw e;
    }

    const { data: satirlar } = await supabase.from('urun_sube')
        .select('sube_kod').eq('urun_id', h.id).eq('menude', true);
    satirlar.forEach((s) => etkilenenSubeler.add(s.sube_kod));
}

console.log(`\nEtkilenen şube: ${[...etkilenenSubeler].join(', ') || '(yok)'}`);
if (UYGULA && etkilenenSubeler.size) {
    // Betik veritabanına doğrudan yazdığı için rota katmanındaki otomatik
    // yenileme devreye girmez; menü JSON'u elle tazelenmeli.
    const sonuc = await regenerateMenuJsons([...etkilenenSubeler]);
    console.log('menü JSON yenilendi:', JSON.stringify(sonuc));
}
console.log(UYGULA ? '\nYAZILDI' : '\nKURU ÇALIŞMA — uygulamak için --uygula');
