import { supabase } from '../../../config/supabase.js';

/**
 * Yeni şubenin menüsünü çekirdek katalogla kurar ve ürünleri SATIŞTA açar.
 *
 * NEDEN GEREKLİ: menü bir OPT-IN listesi (`urun_sube.menude`) — katalog merkezde
 * durur, şube sattıklarını tek tek işaretler. Yeni şube bu yüzden bomboş menüyle
 * açılıyordu ve birinin oturup ~95 ürünü elle eklemesi gerekiyordu.
 *
 * SEÇİM VERİTABANINDA: hangi ürünlerin "çekirdek" sayıldığı `sube_menusunu_kur`
 * fonksiyonunda (bkz. migration 0036) — şubelerin en az yarısında satılan ortak
 * ürünler. Katalogdaki 508 ortak ürünün 411'i yalnızca 1-9 şubede; hepsini
 * eklemek yeni şubeyi satmadığı 400 küsur kalemle QR menüde yayına çıkarırdı.
 * İşin SQL'de olmasının ikinci sebebi alt-istek bütçesi: 11 binden fazla üyelik
 * satırını Workers'a çekip orada saymak sayfa başına bir istek demekti.
 *
 * ÇAĞIRAN AKIŞI DURDURMAZ: şube oluşturma bunun yüzünden başarısız olmamalı —
 * menüsü boş bir şube, hiç açılmamış bir şubeden iyidir. Hata loglanır; merkez
 * ürünleri elle de ekleyebilir.
 *
 * @param {string} subeKod
 * @returns {Promise<number>} menüye eklenen ürün sayısı (hata olursa 0)
 */
export async function menuyuCekirdekKatalogdanKur(subeKod) {
    if (!subeKod) return 0;
    try {
        const { data, error } = await supabase.rpc('sube_menusunu_kur', { p_sube_kod: subeKod });
        if (error) throw new Error(error.message);
        const adet = Number(data) || 0;
        console.log(`[Menu] ${subeKod}: çekirdek katalogdan ${adet} ürün menüye eklendi`);
        return adet;
    } catch (err) {
        console.error(`[Menu] ${subeKod} menüsü kurulamadı:`, err.message);
        return 0;
    }
}
