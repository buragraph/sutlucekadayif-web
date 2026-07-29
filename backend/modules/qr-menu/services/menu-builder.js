import { db } from '../../../config/firebase.js';

/**
 * Menü verisi üretimi — TEK KAYNAK.
 *
 * Hem public `GET /api/menu/:subeSlug` (routes/menu.js) hem de R2 JSON cache
 * üretimi (services/menu-cache.js) bu fonksiyonu kullanır. Daha önce aynı mantık
 * iki dosyada kopyalanmıştı; biri güncellenip diğeri unutulduğunda R2'den gelen
 * menü ile API fallback'inden gelen menü birbirinden ayrışıyordu (müşteri hangi
 * yoldan geldiğine göre farklı menü görüyordu). Menü şeması değişecekse
 * YALNIZCA burası değiştirilir.
 *
 * GÜVENLİK: Dönen veri auth'suz servis edilir (public endpoint + R2'deki JSON).
 * Şube dokümanından yalnızca aşağıdaki güvenli alanlar alınır; VKN,
 * fatura_adresi, yetkili_adi, telefon gibi PII ve donem_ozetleri / toplam_*
 * gibi reklam-performans alanları BURAYA ASLA EKLENMEZ.
 *
 * @param {string} subeSlug — Şube slug'ı (ör: "amasya")
 * @returns {Promise<{sube: object, kategoriler: object[], urunlerByKategori: object}|null>}
 *          Şube yoksa null döner (çağıran taraf 404 / uyarı olarak ele alır).
 */
export async function buildMenuData(subeSlug) {
    // Paralel sorgular — hız optimizasyonu
    const [subeDoc, katSnap, ortakSnap, ozelSnap] = await Promise.all([
        db.collection('subeler').doc(subeSlug).get(),
        db.collection('kategoriler').orderBy('sira', 'asc').get(),
        db.collection('ortak_urunler').get(),                                // Ortak ürünler (ana collection)
        db.collection('subeler').doc(subeSlug).collection('urunler').get(),  // Şubeye özel (subcollection)
    ]);

    if (!subeDoc.exists) return null;

    const sd = subeDoc.data();
    const sube = {
        id: subeDoc.id,
        slug: subeDoc.id,
        ad: sd.ad || subeDoc.id,
        il: sd.il || null,
        ilce: sd.ilce || null,
    };

    const kategoriler = [];
    katSnap.forEach((d) => kategoriler.push({ id: d.id, ...d.data() }));

    // PUBLIC projeksiyon — müşteri menüsünde gösterilen alanlar SADECE bunlar.
    // Şube bazlı yönetim alanları (fiyat_override, fiyat_serbest, gizli_subeler,
    // mevcut_degil) dışarı SIZDIRILMAZ: bu JSON R2'de auth'suz servis ediliyor,
    // yani 97 şubenin fiyatı ve merkezin gizleme listesi herkese açık olurdu.
    const musteriAlanlari = (urun, fiyat) => ({
        id: urun.id,
        ad: urun.ad,
        fiyat,
        aciklama: urun.aciklama || '',
        etiket: urun.etiket || [],
        gorsel: urun.gorsel || '',
        miktar: urun.miktar ?? null,
        birim: urun.birim || '',
        kategori: urun.kategori || 'diger',
    });

    const tumUrunler = [];

    // Ortak ürünler — üç ayrı şube bazlı kural sırayla uygulanır:
    //  1) gizli_subeler : MERKEZ gizlemiş. Şube bu ürünü panelde de göremez.
    //  2) mevcut_degil  : ŞUBE kendi kapatmış (stok yok vb). Panelde görünür,
    //                     müşteri menüsünde görünmez; şube geri açabilir.
    //  3) fiyat_override: Şubeye özel fiyat verilmişse merkez fiyatının yerine geçer.
    ortakSnap.forEach((d) => {
        const data = d.data();
        if (data.deletedAt) return;
        if ((data.gizli_subeler || []).includes(subeSlug)) return;
        if ((data.mevcut_degil || []).includes(subeSlug)) return;

        const override = data.fiyat_override?.[subeSlug];
        const fiyat = typeof override === 'number' ? override : data.fiyat;
        tumUrunler.push(musteriAlanlari({ id: d.id, ...data }, fiyat));
    });

    // Şubeye özel ürünler (geçmişten kalan kayıtlar — şubeler artık ürün EKLEYEMEZ,
    // merkez tek bir şubeye ürün vermek isterse ortak ürünü diğerlerinden gizler)
    ozelSnap.forEach((d) => {
        const data = d.data();
        if (data.deletedAt) return;
        tumUrunler.push(musteriAlanlari({ id: d.id, ...data }, data.fiyat));
    });

    // Kategoriye göre grupla
    const urunlerByKategori = {};
    tumUrunler.forEach((urun) => {
        const kat = urun.kategori || 'diger';
        if (!urunlerByKategori[kat]) urunlerByKategori[kat] = [];
        urunlerByKategori[kat].push(urun);
    });

    return { sube, kategoriler, urunlerByKategori };
}
