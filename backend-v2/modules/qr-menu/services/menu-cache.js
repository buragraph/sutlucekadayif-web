import { supabase } from '../../../config/supabase.js';
import { uploadFile, deleteFile } from '../../../config/r2.js';
import { veriYaDaHata, tumSatirlar } from '../../../utils/veri.js';
import { buildMenuData, paylasilanVeriOku } from './menu-builder.js';

// ─── Menü JSON yazımı duraklatma ───
// Katalogda toplu düzenleme yapılırken her kayıtta 88 menü JSON'ı yeniden
// pişiyor. Duraklatıldığında yazım atlanır; işi bitince tek seferde tam
// yenileme yapılır.
//
// DİKKAT: duraklatma sırasında R2'deki JSON'lar ESKİ kalır, yani müşteri QR
// menüsünde eski veriyi görür. Public API (/api/menu/:slug) canlı okuduğu için
// güncel, ama menü sayfası önce R2'ye bakıyor.
const DURUM_ANAHTARI = 'menu_cache';
let durumCache = { v: null, t: 0 };
const DURUM_TTL = 30_000;

// ─── R2 öneki ───
// Paralel yayın boyunca (G10) v2, CANLI `menu/` dosyalarını EZMEMELİ: eski
// backend hâlâ müşteriye onları servis ediyor. `MENU_R2_PREFIX=menu-v2` ile v2
// kendi kopyasını yazar; geçiş gecesinde (G11) değer `menu` yapılır.
const R2_PREFIX = process.env.MENU_R2_PREFIX || 'menu';

export async function menuYazimiDuraklatildiMi() {
    if (durumCache.v !== null && Date.now() - durumCache.t < DURUM_TTL) return durumCache.v;
    try {
        const { data, error } = await supabase
            .from('ayarlar').select('deger').eq('anahtar', DURUM_ANAHTARI).maybeSingle();
        if (error) throw new Error(error.message);
        durumCache = { v: !!data?.deger?.duraklatildi, t: Date.now() };
    } catch (err) {
        // Bayrak okunamazsa yazmaya DEVAM et — duraklatma sessizce kalıcı olmasın
        console.error('[MenuCache] Duraklatma bayrağı okunamadı:', err.message);
        durumCache = { v: false, t: Date.now() };
    }
    return durumCache.v;
}

/** Bayrağın tam hâlini döndürür (uç yanıtı için). */
export async function menuYazimiDurumu() {
    const { data } = await supabase
        .from('ayarlar').select('deger').eq('anahtar', DURUM_ANAHTARI).maybeSingle();
    const d = data?.deger || {};
    return { duraklatildi: !!d.duraklatildi, not: d.not || '', zaman: d.zaman || null };
}

/** Bayrağı değiştirir; mikro-cache anında düşürülür. */
export async function menuYazimiDuraklat(duraklatildi, not = '') {
    const deger = { duraklatildi: !!duraklatildi, not, zaman: new Date().toISOString() };
    veriYaDaHata(
        await supabase.from('ayarlar').upsert(
            { anahtar: DURUM_ANAHTARI, deger, guncelleme: new Date().toISOString() },
            { onConflict: 'anahtar' }
        ),
        'duraklatma bayrağı yazılamadı'
    );
    durumCache = { v: !!duraklatildi, t: Date.now() };
}

/**
 * Şube silindiğinde R2'deki menü JSON'ını da kaldırır.
 */
export async function deleteMenuJson(subeSlug, prefix = R2_PREFIX) {
    try {
        await deleteFile(`${prefix}/${subeSlug}.json`);
        console.log(`[MenuCache] 🗑 ${subeSlug}.json silindi`);
    } catch (err) {
        console.error(`[MenuCache] ❌ ${subeSlug} JSON silinemedi:`, err.message);
    }
}

/**
 * Belirli bir şubenin menü JSON'ını oluşturup R2'ye yazar.
 * @param {string} subeSlug - Şube slug'ı (ör: "amasya")
 * @param {object|null} paylasilan - toplu üretimde ortak okunan veri
 * @param {string} prefix - R2 öneki; parite testinde 'menu-v2' kullanılır
 */
export async function regenerateMenuJson(subeSlug, paylasilan = null, prefix = R2_PREFIX) {
    if (await menuYazimiDuraklatildiMi()) {
        console.log(`[MenuCache] ⏸ yazım duraklatıldı, atlandı: ${subeSlug}`);
        return;
    }
    try {
        // Menü projeksiyonu public endpoint ile TEK kaynaktan gelir
        // (bkz. services/menu-builder.js) — güvenli alan filtresi de orada.
        const menuData = await buildMenuData(subeSlug, paylasilan);

        if (!menuData) {
            console.warn(`[MenuCache] Şube bulunamadı: ${subeSlug}`);
            return;
        }

        const jsonBuffer = Buffer.from(JSON.stringify(menuData));
        const url = await uploadFile(jsonBuffer, `${prefix}/${subeSlug}.json`, 'application/json');
        console.log(`[MenuCache] ✅ ${subeSlug}.json güncellendi (${jsonBuffer.length} byte)`);
        return url;
    } catch (err) {
        console.error(`[MenuCache] ❌ ${subeSlug} JSON oluşturma hatası:`, err.message);
    }
}

/**
 * Belirtilen şubelerin menü JSON'larını yeniler.
 * @param {string[]|null} hedefSlugs - null ise TÜM şubeler
 */
export async function regenerateMenuJsons(hedefSlugs = null, prefix = R2_PREFIX) {
    // Duraklatma kontrolü EN BAŞTA: aksi halde pahalı okumalar boşuna yapılır.
    if (await menuYazimiDuraklatildiMi()) {
        console.log(`[MenuCache] ⏸ yazım duraklatıldı, ${hedefSlugs === null ? 'tüm şubeler' : hedefSlugs.length + ' şube'} atlandı`);
        return;
    }

    const hedef = hedefSlugs === null ? null : [...new Set(hedefSlugs.filter(Boolean))];
    if (hedef !== null && hedef.length === 0) return;

    // PAYLASIM_ESIGI YOK: Firestore'da "filtreli mi paylaşımlı mı" hesabı okuma
    // maliyeti içindi. Postgres'te ortak veriyi bir kez okumak her durumda ucuz.
    const paylasilan = await paylasilanVeriOku();
    const liste = hedef ?? paylasilan.tumSluglar;

    console.log(`[MenuCache] ${liste.length} şube için JSON yenileniyor...`);
    // Aynı anda çok sayıda R2 yazımı açmamak için 10'luk gruplar
    for (let i = 0; i < liste.length; i += 10) {
        await Promise.all(liste.slice(i, i + 10).map((slug) => regenerateMenuJson(slug, paylasilan, prefix)));
    }
    console.log(`[MenuCache] ✅ ${liste.length} şubenin JSON'ı güncellendi`);
}

/** TÜM şubelerin menü JSON'larını yeniler (kategori değişikliği gibi). */
export async function regenerateAllMenuJsons(prefix = R2_PREFIX) {
    return regenerateMenuJsons(null, prefix);
}

/**
 * Bir ürünün ETKİLEDİĞİ şubelerin JSON'larını yeniler.
 *
 * Etkilenen şube listesi artık üründen değil `urun_sube`'den sorgulanır:
 * ürünün menüde olduğu şubeler tek satırda gelir, dizi taşımaya gerek yok.
 *
 * @param {{id: string, tur: string, sube_kod?: string}} urun
 * @param {string[]} ekSubeler - Ek hedefler: düzenlemede menüden ÇIKARILAN
 *   şubeler; onların menüsünden de düşmesi gerektiği için yenilenmeliler.
 */
export async function regenerateAffectedMenuJsons(urun, ekSubeler = []) {
    if (urun.tur === 'sube_ozel' && urun.sube_kod) {
        await regenerateMenuJson(urun.sube_kod);
        return;
    }
    const satirlar = veriYaDaHata(
        await supabase.from('urun_sube').select('sube_kod').eq('urun_id', urun.id).eq('menude', true),
        'etkilenen şubeler okunamadı'
    );
    await regenerateMenuJsons([...satirlar.map((s) => s.sube_kod), ...ekSubeler]);
}

/** Birden çok ürünün etkilediği şubeleri TEK seferde yeniler (dedupe). */
export async function regenerateForAffected(urunler) {
    const slugs = new Set();
    const ortakIdler = [];
    for (const u of urunler) {
        if (u.tur === 'sube_ozel') { if (u.sube_kod) slugs.add(u.sube_kod); continue; }
        ortakIdler.push(u.id);
    }
    if (ortakIdler.length > 0) {
        const satirlar = await tumSatirlar(
            () => supabase.from('urun_sube').select('sube_kod, urun_id')
                .in('urun_id', ortakIdler).eq('menude', true),
            { sirala: ['urun_id', 'sube_kod'], baglam: 'etkilenen şubeler' }
        );
        satirlar.forEach((s) => slugs.add(s.sube_kod));
    }
    if (slugs.size > 0) await regenerateMenuJsons([...slugs]).catch(console.error);
}
