// Görsel optimizasyonu — tarayıcıda (Faz 3 / C1)
//
// Sunucudaki `sharp` yerel bir modüldü ve Cloudflare Workers'ta çalışmıyor.
// Aynı dönüşüm burada canvas ile yapılıyor; PARAMETRELER SUNUCUDAKİYLE AYNI:
//   .resize(800, null, { withoutEnlargement: true })  →  en fazla 800px genişlik,
//                                                        küçük görsel BÜYÜTÜLMEZ
//   .webp({ quality: 80 })                            →  toBlob('image/webp', 0.8)
//
// Yükleme ucu artık WebP bekliyor; bu yüzden her yükleme bu fonksiyondan geçmeli.

const EN_FAZLA_GENISLIK = 800;
// Kart boyu: müşteri menüsünde ızgara hücresi mobilde ~180 CSS px, 2x ekranda
// ~360 fiziksel piksel. 400px hem yeter hem 800'ün dörtte biri ağırlıkta
// (ölçüm: 41 kB → 12 kB). Kart bunu, detay penceresi büyüğü kullanır.
const KART_GENISLIK = 400;
const KALITE = 0.8;

async function webpeCevir(bitmap, enFazlaGenislik, ad) {
    // withoutEnlargement: yalnızca büyükse küçült
    const olcek = Math.min(1, enFazlaGenislik / bitmap.width);
    const genislik = Math.round(bitmap.width * olcek);
    const yukseklik = Math.round(bitmap.height * olcek);

    const tuval = document.createElement('canvas');
    tuval.width = genislik;
    tuval.height = yukseklik;
    const ctx = tuval.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, genislik, yukseklik);

    const blob = await new Promise((coz, red) => {
        tuval.toBlob((b) => (b ? coz(b) : red(new Error('Görsel dönüştürülemedi'))), 'image/webp', KALITE);
    });
    return new File([blob], ad, { type: 'image/webp' });
}

/**
 * @param {File} dosya — kullanıcının seçtiği görsel
 * @returns {Promise<File>} WebP'e çevrilmiş, en fazla 800px genişlikte dosya
 */
export async function gorseliWebpYap(dosya) {
    const bitmap = await createImageBitmap(dosya);
    try {
        return await webpeCevir(bitmap, EN_FAZLA_GENISLIK, adiWebpYap(dosya));
    } finally {
        bitmap.close?.();
    }
}

const adiWebpYap = (dosya) => dosya.name.replace(/\.[^.]+$/, '') + '.webp';

/**
 * Ürün görselinin İKİ boyu — kart için küçük, detay penceresi için büyük.
 *
 * NEDEN İKİ DOSYA: tek 800px görseli ızgarada 24 kez indirmek mobilde hem
 * yavaş hem pahalı (her görsel Worker üzerinden proxy'leniyor, bkz.
 * imageProxy). Kaynak bitmap bir kez çözülür, iki kez ölçeklenir.
 *
 * @returns {Promise<{ buyuk: File, kucuk: File }>}
 */
export async function urunGorseliBoyla(dosya) {
    const bitmap = await createImageBitmap(dosya);
    try {
        const ad = adiWebpYap(dosya);
        return {
            buyuk: await webpeCevir(bitmap, EN_FAZLA_GENISLIK, ad),
            kucuk: await webpeCevir(bitmap, KART_GENISLIK, ad),
        };
    } finally {
        bitmap.close?.();
    }
}
