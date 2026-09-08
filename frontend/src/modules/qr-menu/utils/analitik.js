/**
 * QR menü ölçümü — Google Analytics 4.
 *
 * KAPSAM YALNIZCA MÜŞTERİ MENÜSÜ: gtag betiği index.html'e değil, MenuPage
 * bağlanınca buradan yükleniyor. Panel (admin/şube ekranları) aynı SPA içinde
 * ama ölçüme girmiyor — personelin panel gezintisi "menü görüntülenme"
 * sayısını şişirirdi ve çalışan izlemeye dönüşürdü.
 *
 * ÇEREZSİZ ÖLÇÜM: consent mode `analytics_storage: 'denied'` ile başlıyor.
 * GA4 bu modda çerez yazmaz, olayları çerezsiz sayar. Bunun iki sonucu var:
 *   + KVKK açısından açık rıza/çerez bandı gerektiren bir işleme yok.
 *   − "Kullanıcı" sayısı modellenir; güvenilen sayı OTURUM/OLAY adedi olur.
 * Menüde ölçmek istediğimiz zaten "kaç kez açıldı", "kaç kişi" değil.
 *
 * ÖLÇÜM KİMLİĞİ ORTAM DEĞİŞKENİNDE (`VITE_GA_OLCUM_ID`). Tanımlı değilse
 * hiçbir betik yüklenmez, hiçbir istek gitmez — lokal geliştirme ve önizleme
 * sayıları bozmasın.
 */
const OLCUM_ID = import.meta.env.VITE_GA_OLCUM_ID;

let yuklendi = false;

// eslint-disable-next-line prefer-rest-params
function gtag() {
    window.dataLayer = window.dataLayer || [];
    // GA `arguments` nesnesinin KENDİSİNİ bekliyor; dizi push edilirse
    // parametreleri okuyamıyor. Bu yüzden rest parametresi kullanılmıyor.
    window.dataLayer.push(arguments);
}

/** gtag.js'i bir kez yükler. Kimlik yoksa sessizce hiçbir şey yapmaz. */
function betigiYukle() {
    if (yuklendi || !OLCUM_ID) return;
    yuklendi = true;

    // Sayfa ölçüm kimliğini görebilsin diye betikten ÖNCE kuyruğa yazılıyor.
    gtag('consent', 'default', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
    });
    gtag('js', new Date());
    // send_page_view kapalı: sayfa görüntülemesini şube bilgisiyle birlikte
    // biz gönderiyoruz, yoksa şubesiz bir page_view daha düşerdi.
    gtag('config', OLCUM_ID, { send_page_view: false });

    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${OLCUM_ID}`;
    document.head.appendChild(s);
}

/**
 * Menü açıldı olayı.
 *
 * `sube_slug` ve `sube_ad` olay parametresi olarak gidiyor; GA4'te bunları
 * özel boyut (custom dimension) olarak tanımlayınca rapor şube kırılımı
 * verir — Data API'den şube başına sayı çekmenin de yolu bu.
 *
 * @param {{ slug: string, ad?: string }} sube
 */
export function menuGoruntulendi(sube) {
    if (!OLCUM_ID || !sube?.slug) return;
    betigiYukle();
    gtag('event', 'menu_goruntulendi', {
        sube_slug: sube.slug,
        sube_ad: sube.ad || sube.slug,
        page_title: `${sube.ad || sube.slug} — QR Menü`,
        page_location: window.location.href,
    });
}

/** Ölçüm açık mı — arayüzde "analitik bağlı" göstermek isteyen yerler için. */
export const analitikAcik = !!OLCUM_ID;
