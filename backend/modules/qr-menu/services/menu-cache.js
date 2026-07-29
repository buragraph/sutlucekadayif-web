import { db } from '../../../config/firebase.js';
import { uploadFile, deleteFile } from '../../../config/r2.js';
import { buildMenuData } from './menu-builder.js';

/**
 * Şube silindiğinde R2'deki menü JSON'ını da kaldırır.
 * Bırakılırsa /menu/{slug} adresi silinmiş şubenin menüsünü servis etmeye
 * devam eder (public endpoint önce R2'ye bakıyor).
 */
export async function deleteMenuJson(subeSlug) {
    try {
        await deleteFile(`menu/${subeSlug}.json`);
        console.log(`[MenuCache] 🗑 ${subeSlug}.json silindi`);
    } catch (err) {
        console.error(`[MenuCache] ❌ ${subeSlug} JSON silinemedi:`, err.message);
    }
}

/**
 * Belirli bir şubenin menü JSON'ını oluşturup R2'ye yazar
 * @param {string} subeSlug - Şube slug'ı (ör: "amasya")
 */
export async function regenerateMenuJson(subeSlug, paylasilan = null) {
    try {
        // Menü projeksiyonu public endpoint ile TEK kaynaktan gelir
        // (bkz. services/menu-builder.js) — güvenli alan filtresi de orada.
        const menuData = await buildMenuData(subeSlug, paylasilan);

        if (!menuData) {
            console.warn(`[MenuCache] Şube bulunamadı: ${subeSlug}`);
            return;
        }

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
    // Kategoriler ve ortak katalog HER şube için aynı — bir kez okunup
    // paylaşılır. Önceden şube başına yeniden okunuyordu: 92 × 733 ürün ≈ 67 bin
    // gereksiz okuma ve ~27 sn. Şube dokümanı ve şubeye özel ürünler doğal
    // olarak şubeye ait, onlar paralelde okunmaya devam ediyor.
    const [subeSnap, katSnap, ortakSnap] = await Promise.all([
        db.collection('subeler').select().get(),
        db.collection('kategoriler').orderBy('sira', 'asc').get(),
        db.collection('ortak_urunler').get(),
    ]);
    const slugs = subeSnap.docs.map((d) => d.id);
    const paylasilan = { katSnap, ortakSnap };

    console.log(`[MenuCache] ${slugs.length} şube için JSON yenileniyor...`);
    await Promise.all(slugs.map(slug => regenerateMenuJson(slug, paylasilan)));
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
