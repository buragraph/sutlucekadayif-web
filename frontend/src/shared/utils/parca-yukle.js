// Dinamik import + yeni yayın = ölü parça sorunu
//
// Vite kodu hash'li parçalara bölüyor (`pdf-yazdir-DRbPW8lE.js`). Yeni sürüm
// deploy edildiğinde eski hash'li dosyalar sunucudan kalkar; ama KULLANICININ
// AÇIK SEKMESİ hâlâ eski `index.js`'i çalıştırıyordur ve butona basınca artık
// var olmayan parçayı istemeye çalışır:
//
//     Failed to fetch dynamically imported module: .../pdf-yazdir-DRbPW8lE.js
//
// Tek doğru çare sayfayı bir kez yenilemek. Bu sarmalayıcı hatayı tanıyıp
// yenilemeyi kendisi yapar; döngüye girmemek için oturumda bir kez dener.

import { toast } from 'sonner';

const BAYRAK = 'parca-yenileme';

const OLU_PARCA = /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/**
 * Dinamik import'u güvenli çalıştırır.
 * @param {() => Promise<any>} yukleyici — ör. () => import('../utils/pdf-yazdir')
 * @param {string} [ad] — hata mesajında görünecek ad
 */
export async function parcaYukle(yukleyici, ad = 'Modül') {
    try {
        const modul = await yukleyici();
        sessionStorage.removeItem(BAYRAK);
        return modul;
    } catch (hata) {
        if (!OLU_PARCA.test(String(hata?.message))) throw hata;

        if (sessionStorage.getItem(BAYRAK)) {
            // Yenileme zaten denendi; ikinci kez yenilemek sonsuz döngü olur.
            throw new Error(`${ad} yüklenemedi. Sayfayı yenileyip tekrar deneyin.`);
        }
        sessionStorage.setItem(BAYRAK, '1');
        toast.info('Yeni sürüm yayınlandı — sayfa yenileniyor…');
        setTimeout(() => window.location.reload(), 900);
        // Yenileme başlayana kadar çağıranı beklet ki üstüne hata toast'ı düşmesin
        await new Promise(() => {});
    }
}
