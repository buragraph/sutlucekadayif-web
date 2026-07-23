import { db } from '../../../config/firebase.js';
import { uploadFile } from '../../../config/r2.js';
import { buildMenuData } from './menu-builder.js';

/**
 * Belirli bir şubenin menü JSON'ını oluşturup R2'ye yazar
 * @param {string} subeSlug - Şube slug'ı (ör: "amasya")
 */
export async function regenerateMenuJson(subeSlug) {
    try {
        // Menü projeksiyonu public endpoint ile TEK kaynaktan gelir
        // (bkz. services/menu-builder.js) — güvenli alan filtresi de orada.
        const menuData = await buildMenuData(subeSlug);

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
