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
const KALITE = 0.8;

/**
 * @param {File} dosya — kullanıcının seçtiği görsel
 * @returns {Promise<File>} WebP'e çevrilmiş, en fazla 800px genişlikte dosya
 */
export async function gorseliWebpYap(dosya) {
    const bitmap = await createImageBitmap(dosya);
    try {
        // withoutEnlargement: yalnızca büyükse küçült
        const olcek = Math.min(1, EN_FAZLA_GENISLIK / bitmap.width);
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

        const ad = dosya.name.replace(/\.[^.]+$/, '') + '.webp';
        return new File([blob], ad, { type: 'image/webp' });
    } finally {
        bitmap.close?.();
    }
}
