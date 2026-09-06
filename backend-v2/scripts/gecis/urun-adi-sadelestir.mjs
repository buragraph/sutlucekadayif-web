/**
 * Adının içine varyant listesi sıkıştırılmış ürünleri sadeleştirir.
 *
 * SORUN: Sistemde varyant/seçenek kavramı yok, bu yüzden merkez aromaları/
 * çeşitleri ürünün ADINA yazmış — en uzunu 196 karakter. Panelde katalog
 * penceresini ve tabloyu taşırıyordu (UI tarafı ayrıca düzeltildi), müşteri
 * menüsünde de kartın adı okunmaz hâldeydi.
 *
 * ÇÖZÜM: ad kısa hâline iniyor, liste `aciklama`ya taşınıyor; gramaj varsa
 * addan çıkıp `miktar`/`birim` kolonlarına geçiyor.
 *   - `aciklama` menü kartında ve ürün detayında gösteriliyor, üstelik menü
 *     ARAMASINA dahil (MenuPage: ad || aciklama) — müşteri "Lotus" arayınca
 *     ürünü yine buluyor.
 *   - `miktar`/`birim` fiyatın yanında ayrı gösteriliyor ve kırpılmıyor,
 *     yani "80 gr" bilgisi addan çıkınca kaybolmuyor.
 *
 * Liste, mevcut açıklamanın ÖNÜNE ekleniyor: kart açıklaması 2 satıra
 * kırpılıyor (.pm-card__desc line-clamp: 2) ve bu liste eskiden hep görünen
 * adın içindeydi. Arkaya konsaydı görünürlüğü düşerdi.
 *
 * DİKKAT — iki "Aromalı Latte" kaydı birbirinin KOPYASI DEĞİL: biri Sıcak
 * İçecekler (150 ₺, 8 aroma), öteki Soğuk İçecekler (170 ₺, 17 aroma) ve
 * ikisi de malatya menüsünde açık. Adları artık aynı ama farklı kategorilerde
 * durdukları için müşteride karışmıyorlar. "Mükerrer" sanıp silme.
 *
 * Yazılmış açıklamaya DOKUNMAZ, listeyi önüne ekler. Tekrar çalıştırılabilir:
 * hedef hâle gelmiş kayıtları atlar. Kuru çalışır; yazmak için --uygula.
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
        id: 'lNXzXDA1ZzxAgowSD9Yi',      // Soğuk İçecekler, 170 ₺
        ad: 'Aromalı Latte',
        baslik: 'Aromalar',
        // Klavye hataları düzeltildi: Hıbıscus→Hibiscus, Pumkın→Pumpkin,
        // Curaçoa→Curaçao, Chaı→Chai, Italyan→İtalyan.
        ogeler: ['Lotus', 'Hibiscus', 'Tuzlu Karamel', 'Marshmallow', 'Pumpkin Spice',
            'Blue Curaçao', 'Vişne', 'Çikolata', 'Beyaz Çikolata', 'Çilek', 'Muz',
            'Karamel', 'Vanilya', 'Frambuaz', 'Hindistan Cevizi', 'İtalyan Karamel', 'Chai Tea'],
    },
    {
        id: 'LY81EFsuqIdfCcSU5OUH',      // Sıcak İçecekler, 150 ₺
        ad: 'Aromalı Latte',
        baslik: 'Aromalar',
        ogeler: ['Çikolata', 'Beyaz Çikolata', 'Çilek', 'Muz', 'Karamel', 'Vanilya',
            'Frambuaz', 'Hindistan Cevizi'],
    },
    {
        id: 'QtZNMi74i9A68mu7YuSN',      // Diğer, 120 ₺
        ad: 'Aromalı Türk Kahvesi',
        baslik: 'Aromalar',
        ogeler: ['Portakal', 'Karadut', 'Fıstık', 'Fındık', 'Dibek', 'Safran'],
    },
    {
        id: 'rBZWgLlcgpuBBcvDnsNf',      // Dondurmalar, 70 ₺
        ad: 'Kase Dondurma',
        miktar: 80, birim: 'gr',
        baslik: 'Çeşitler',
        ogeler: ['Sade', 'Çilekli', 'Portakallı', 'İtalyan Karamelli', 'Karamelli', 'Kakaolu'],
    },
    {
        id: 'vlpTWH2dhy1JG8EWqmaU',      // Dondurmalar, 85 ₺
        ad: 'Beyaz Kase Dondurma',
        miktar: 80, birim: 'gr',
        baslik: 'Çeşitler',
        ogeler: ['Kakao', 'Kavun', 'Portakal', 'Çilek', 'Limon'],
    },
];

const etkilenenSubeler = new Set();

for (const h of HEDEFLER) {
    const { data: u, error } = await supabase.from('urunler').select('*').eq('id', h.id).single();
    if (error) throw error;

    const liste = `${h.baslik}: ${h.ogeler.join(', ')}`;
    const mevcut = (u.aciklama || '').trim();
    // Zaten eklenmişse dokunma (betik tekrar çalıştırılabilir olsun).
    // Yazılmış tanıtım metni varsa araya nokta gir, iki cümle birbirine
    // yapışmasın.
    const yeniAciklama = mevcut.includes(liste) ? mevcut : (mevcut ? `${liste}. ${mevcut}` : liste);

    const yama = {};
    if (u.ad !== h.ad) yama.ad = h.ad;
    if (u.aciklama !== yeniAciklama) yama.aciklama = yeniAciklama;
    if (h.miktar != null && u.miktar !== h.miktar) yama.miktar = h.miktar;
    if (h.birim && u.birim !== h.birim) yama.birim = h.birim;

    if (!Object.keys(yama).length) { console.log(`\n${h.id}  — zaten sadeleşmiş, atlandı`); continue; }

    console.log(`\n${h.id}  (${u.fiyat} ₺)`);
    console.log(`  ad       : ${u.ad}`);
    console.log(`         → : ${h.ad}${h.miktar ? `   [miktar ${h.miktar} ${h.birim}]` : ''}`);
    if (yama.aciklama) console.log(`  aciklama → : ${yeniAciklama}`);

    if (UYGULA) {
        const { error: e } = await supabase.from('urunler').update(yama).eq('id', h.id);
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
    console.log('menü JSON:', JSON.stringify(await regenerateMenuJsons([...etkilenenSubeler])));
}
console.log(UYGULA ? '\nYAZILDI' : '\nKURU ÇALIŞMA — uygulamak için --uygula');
