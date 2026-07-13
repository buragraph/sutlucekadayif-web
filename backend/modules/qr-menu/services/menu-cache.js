import { db } from '../../../config/firebase.js';
import { uploadFile } from '../../../config/r2.js';

/**
 * Belirli bir şubenin menü JSON'ını oluşturup R2'ye yazar
 * @param {string} subeSlug - Şube slug'ı (ör: "amasya")
 */
export async function regenerateMenuJson(subeSlug) {
    try {
        // Aynı logic: menu.js GET /:subeSlug endpoint'i ile birebir
        const [subeDoc, katSnap, ortakSnap, ozelSnap] = await Promise.all([
            db.collection('subeler').doc(subeSlug).get(),
            db.collection('kategoriler').orderBy('sira', 'asc').get(),
            db.collection('ortak_urunler').get(),                                    // Ortak ürünler (ana collection)
            db.collection('subeler').doc(subeSlug).collection('urunler').get(), // Şubeye özel (subcollection)
        ]);

        if (!subeDoc.exists) {
            console.warn(`[MenuCache] Şube bulunamadı: ${subeSlug}`);
            return;
        }

        // Yalnızca menüde gösterilen GÜVENLİ alanlar yazılır — bu JSON R2'de
        // auth'suz proxy üzerinden servis edildiği için VKN, fatura_adresi,
        // yetkili_adi, telefon gibi PII buraya ASLA yazılmaz. Public
        // `/api/menu/:subeSlug` endpoint'iyle (menu.js) AYNI projeksiyon.
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

        const tumUrunler = [];

        // Ortak ürünleri filtrele: mevcut_degil'de bu şube varsa gösterme
        ortakSnap.forEach((d) => {
            const data = d.data();
            if (data.deletedAt) return;
            const mevcutDegil = data.mevcut_degil || [];
            if (!mevcutDegil.includes(subeSlug)) {
                tumUrunler.push({ id: d.id, ...data });
            }
        });

        // Şubeye özel ürünler
        ozelSnap.forEach((d) => {
            const data = d.data();
            if (data.deletedAt) return;
            tumUrunler.push({ id: d.id, ...data });
        });

        // Kategoriye göre grupla
        const urunlerByKategori = {};
        tumUrunler.forEach((urun) => {
            const kat = urun.kategori || 'diger';
            if (!urunlerByKategori[kat]) urunlerByKategori[kat] = [];
            urunlerByKategori[kat].push(urun);
        });

        const menuData = { sube, kategoriler, urunlerByKategori };
        const jsonBuffer = Buffer.from(JSON.stringify(menuData));

        // R2'ye yaz: menu/amasya.json
        const url = await uploadFile(jsonBuffer, `menu/${subeSlug}.json`, 'application/json');
        console.log(`[MenuCache] ✅ ${subeSlug}.json güncellendi (${jsonBuffer.length} byte)`);
        return url;
    } catch (err) {
        console.error(`[MenuCache] ❌ ${subeSlug} JSON oluşturma hatası:`, err.message);
    }
}

/**
 * TÜM şubelerin menü JSON'larını yeniler
 * Kategori değişikliğinde çağrılır (tüm şubeleri etkiler)
 */
export async function regenerateAllMenuJsons() {
    const snap = await db.collection('subeler').get();
    const slugs = [];
    snap.forEach((d) => slugs.push(d.id));

    console.log(`[MenuCache] ${slugs.length} şube için JSON yenileniyor...`);
    await Promise.all(slugs.map(slug => regenerateMenuJson(slug)));
    console.log(`[MenuCache] ✅ Tüm şubelerin JSON'ları güncellendi`);
}

/**
 * Bir ürünün etkilediği şubelerin JSON'larını yeniler
 * - Ortak ürün → tüm şubeleri etkiler
 * - Şubeye özel ürün → sadece o şubeyi etkiler
 * @param {object} urunData - Ürün verisi { tur, sube_slug }
 */
export async function regenerateAffectedMenuJsons(urunData) {
    if (urunData.tur === 'sube_ozel' && urunData.sube_slug) {
        // Sadece ilgili şubeyi yenile
        await regenerateMenuJson(urunData.sube_slug);
    } else {
        // Ortak ürün — tüm şubeleri yenile
        await regenerateAllMenuJsons();
    }
}
