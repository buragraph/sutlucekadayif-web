/**
 * Firestore Seed Script — Test Verisi
 * Kullanım: node scripts/seed.js
 */
import '../config/firebase.js';
import { db } from '../config/firebase.js';

const USER_UID = 'ExyQBKEAqVUrhoKMDTw3ujwHuzk2';

async function seed() {
    console.log('🌱 Seed başlatılıyor...\n');

    // 1) Kullanıcı-Şube eşleştirmesi
    console.log('👤 Kullanıcı-şube eşleştirmesi...');
    await db.collection('kullanici_sube').doc(USER_UID).set({
        sube_slug: 'ankara',
        role: 'admin',
    });
    console.log('   ✅ admin → ankara\n');

    // 2) Şubeler
    console.log('🏪 Şubeler oluşturuluyor...');
    const subeler = [
        { slug: 'ankara', ad: 'Ankara Şubesi', adres: 'Kızılay, Ankara', aktif: true },
        { slug: 'istanbul', ad: 'İstanbul Şubesi', adres: 'Kadıköy, İstanbul', aktif: true },
        { slug: 'izmir', ad: 'İzmir Şubesi', adres: 'Alsancak, İzmir', aktif: true },
    ];
    for (const sube of subeler) {
        await db.collection('subeler').doc(sube.slug).set(sube);
        console.log(`   ✅ ${sube.ad}`);
    }
    console.log('');

    // 3) Kategoriler
    console.log('📂 Kategoriler oluşturuluyor...');
    const kategoriler = [
        { id: 'tatlilar', ad: 'Tatlılar', sira: 1 },
        { id: 'icecekler', ad: 'İçecekler', sira: 2 },
        { id: 'kahvaltilik', ad: 'Kahvaltılık', sira: 3 },
    ];
    for (const kat of kategoriler) {
        await db.collection('kategoriler').doc(kat.id).set({
            ad: kat.ad,
            sira: kat.sira,
        });
        console.log(`   ✅ ${kat.ad}`);
    }
    console.log('');

    // 4) Ürünler (ortak)
    console.log('🍮 Ürünler oluşturuluyor...');
    const urunler = [
        {
            ad: 'Soğuk Kadayıf',
            fiyat: 180,
            kategori: 'tatlilar',
            tur: 'ortak',
            aciklama: 'Sütlüce\'nin meşhur soğuk kadayıfı, tel kadayıf üzerinde kaymak ile servis edilir.',
            etiket: ['Popüler', 'Tavsiye'],
            mevcut_degil: [],
        },
        {
            ad: 'Künefe',
            fiyat: 220,
            kategori: 'tatlilar',
            tur: 'ortak',
            aciklama: 'Hatay usulü peynirli künefe, antep fıstığı ile servis edilir.',
            etiket: ['Yeni'],
            mevcut_degil: [],
        },
        {
            ad: 'Sütlaç',
            fiyat: 120,
            kategori: 'tatlilar',
            tur: 'ortak',
            aciklama: 'Fırında kızartılmış geleneksel sütlaç.',
            etiket: [],
            mevcut_degil: [],
        },
        {
            ad: 'Kazandibi',
            fiyat: 130,
            kategori: 'tatlilar',
            tur: 'ortak',
            aciklama: 'Altı karamelize edilmiş muhallebi tatlısı.',
            etiket: [],
            mevcut_degil: [],
        },
        {
            ad: 'Türk Kahvesi',
            fiyat: 70,
            kategori: 'icecekler',
            tur: 'ortak',
            aciklama: 'Geleneksel Türk kahvesi, lokum ile servis edilir.',
            etiket: [],
            mevcut_degil: [],
        },
        {
            ad: 'Çay',
            fiyat: 30,
            kategori: 'icecekler',
            tur: 'ortak',
            aciklama: 'Demlik çay, ince belli bardakta.',
            etiket: [],
            mevcut_degil: [],
        },
        {
            ad: 'Limonata',
            fiyat: 60,
            kategori: 'icecekler',
            tur: 'ortak',
            aciklama: 'Taze sıkılmış ev yapımı limonata.',
            etiket: ['Serinletici'],
            mevcut_degil: [],
        },
        {
            ad: 'Kaymak + Bal',
            fiyat: 150,
            kategori: 'kahvaltilik',
            tur: 'ortak',
            aciklama: 'Taze kaymak, süzme bal ve taze ekmek ile.',
            etiket: [],
            mevcut_degil: [],
        },
        {
            ad: 'Serpme Kahvaltı',
            fiyat: 350,
            kategori: 'kahvaltilik',
            tur: 'ortak',
            aciklama: 'Zengin serpme kahvaltı tabağı, 2 kişilik.',
            etiket: ['Popüler'],
            mevcut_degil: ['izmir'],
        },
    ];

    for (const urun of urunler) {
        await db.collection('urunler').add(urun);
        console.log(`   ✅ ${urun.ad} — ${urun.fiyat} ₺`);
    }
    console.log('');

    console.log('🎉 Seed tamamlandı! Tüm veriler Firestore\'a yazıldı.');
    process.exit(0);
}

seed().catch((err) => {
    console.error('❌ Seed hatası:', err);
    process.exit(1);
});
