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
 * Paylaşımlı okumaya geçiş eşiği (şube sayısı).
 *
 * İki okuma stratejisi var:
 *   • FİLTRELİ : her şube yalnızca kendi ürünlerini okur
 *                (array-contains) → şube başına ~katalog/şube kadar okuma.
 *   • PAYLAŞIMLI: kategoriler + tüm katalog + şube dokümanları + eski şube
 *                ürünleri BİR KEZ okunur → sabit maliyet, şube başına ~0.
 *
 * Az şubede filtreli, çok şubede paylaşımlı ucuz. Ölçülen değerlerle (88 şube,
 * 733 ürün, şube başına ~43 ürün): paylaşımlı 836 okuma, filtreli 14 + 45×şube.
 * İkisi 18,3 şubede eşitleniyor → 19 ve üstünde paylaşımlı ucuz.
 * Katalog/şube oranı ciddi değişirse bu sayı gözden geçirilmeli.
 */
const PAYLASIM_ESIGI = 19;

/**
 * Belirtilen şubelerin menü JSON'larını yeniler; okuma stratejisini şube
 * sayısına göre kendisi seçer.
 * @param {string[]|null} hedefSlugs - null ise TÜM şubeler
 */
export async function regenerateMenuJsons(hedefSlugs = null) {
    if (hedefSlugs !== null) {
        const hedef = [...new Set(hedefSlugs.filter(Boolean))];
        if (hedef.length === 0) return;

        if (hedef.length < PAYLASIM_ESIGI) {
            // Kategoriler yine tek sefer okunur; katalog şube başına filtreli.
            const katSnap = await db.collection('kategoriler').orderBy('sira', 'asc').get();
            console.log(`[MenuCache] ${hedef.length} şube için JSON yenileniyor (filtreli okuma)...`);
            await Promise.all(hedef.map((slug) => regenerateMenuJson(slug, { katSnap })));
            console.log(`[MenuCache] ✅ ${hedef.length} şubenin JSON'ı güncellendi`);
            return;
        }
        return paylasimliYenile(hedef);
    }
    return paylasimliYenile(null);
}

/** Ortak veriyi bir kez okuyup tüm hedef şubelere dağıtan yol. */
async function paylasimliYenile(hedefSlugs) {
    const [katSnap, ortakSnap, subeSnap, ozelSnap] = await Promise.all([
        db.collection('kategoriler').orderBy('sira', 'asc').get(),
        db.collection('ortak_urunler').get(),
        // `select()` DEĞİL: alanlar da lazım. Aksi halde buildMenuData her şube
        // dokümanını bir daha okuyordu (88 gereksiz okuma).
        db.collection('subeler').get(),
        // Şubeye özel eski ürünlerin TAMAMI tek sorguda. Önceden şube başına
        // ayrı sorgu atılıyordu ve hepsi boş dönüyordu — Firestore boş sorguya
        // da 1 okuma faturaladığı için 88 okuma boşa gidiyordu.
        db.collectionGroup('urunler').get(),
    ]);

    const subeDoclari = new Map(subeSnap.docs.map((d) => [d.id, d]));
    const ozelByShube = new Map();
    ozelSnap.docs.forEach((d) => {
        const slug = d.ref.parent.parent?.id;
        if (!slug) return;
        if (!ozelByShube.has(slug)) ozelByShube.set(slug, []);
        ozelByShube.get(slug).push(d);
    });

    const hedef = hedefSlugs ?? subeSnap.docs.map((d) => d.id);
    const paylasilan = { katSnap, ortakSnap, subeDoclari, ozelByShube };

    console.log(`[MenuCache] ${hedef.length} şube için JSON yenileniyor (paylaşımlı okuma)...`);
    await Promise.all(hedef.map((slug) => regenerateMenuJson(slug, paylasilan)));
    console.log(`[MenuCache] ✅ ${hedef.length} şubenin JSON'ı güncellendi`);
}

/** TÜM şubelerin menü JSON'larını yeniler (kategori değişikliği gibi). */
export async function regenerateAllMenuJsons() {
    return regenerateMenuJsons(null);
}

/**
 * Bir ürünün ETKİLEDİĞİ şubelerin JSON'larını yeniler.
 *
 * Ortak üründe eskiden TÜM şubeler yenileniyordu; oysa ürün yalnızca
 * `menude_subeler` listesindeki şubelerin menüsünde. 5 şubelik bir ürün için
 * 88 menü pişirmenin anlamı yok.
 *
 * @param {object} urunData   - Ürün verisi { tur, sube_slug?, menude_subeler? }
 * @param {string[]} ekSubeler - Ek hedefler: düzenlemede listeden ÇIKARILAN
 *   şubeler. Onların menüsünden de düşmesi gerektiği için yenilenmeliler.
 */
export async function regenerateAffectedMenuJsons(urunData, ekSubeler = []) {
    if (urunData.tur === 'sube_ozel' && urunData.sube_slug) {
        await regenerateMenuJson(urunData.sube_slug);
        return;
    }
    await regenerateMenuJsons([...(urunData.menude_subeler || []), ...ekSubeler]);
}
