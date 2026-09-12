import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    UtensilsCrossed, Megaphone, GraduationCap, MessageSquare, Users, Sparkles,
    ArrowRight, ArrowLeft, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '../../services/api';

/**
 * Şube sahibine ilk girişte paneli GEZDİREREK anlatan tanıtım.
 *
 * NEDEN PENCERE DEĞİL TUR: eskiden altı adımlık bir modal vardı; ekranı
 * kapatıyor ve anlattığı sayfayı göstermiyordu. "Ürünler'de tükeneni
 * kapatırsınız" cümlesini okuyan kişi Ürünler'i ilk kez tanıtım bittikten
 * sonra görüyordu. Şimdi her adımda uygulama O SAYFAYA GİDİYOR, açıklama
 * kartı köşede duruyor — kişi anlatılan yerin kendisine bakıyor.
 *
 * ENGELLEMİYOR: kart sayfanın üstünde küçük bir panel; arkadaki ekran
 * tıklanabilir durumda. İsteyen turu bırakıp kurcalayabilir, "Atla" ile
 * kapatabilir. Zorunlu tutmak ilk girişte ikinci bir duvar olurdu; parola
 * kapısı zaten önünde duruyor.
 *
 * MENÜ ÖĞESİ İŞARETLENİYOR: adımın yolu kenar çubuğunda görünürse o bağlantı
 * halkaya alınıyor — "bu ekran menüde şurada" bilgisini cümle kurmadan verir.
 * Telefonda kenar çubuğu çekmecede gizli; orada işaret düşer, tur yine çalışır.
 *
 * BİR KEZ GÖSTERİLİR — ÖLÇÜT SUNUCUDA: tur bitince (ya da atlanınca)
 * `kullanici_sube.onboarded` işaretleniyor (POST /api/onboarding/tanitim-bitti).
 * Böylece admin Kullanıcılar ekranından turu sıfırlayınca tur GERİ GELİYOR ve
 * aynı kişi telefonundan girdiğinde tur baştan çıkmıyor. Eskiden bu not
 * tarayıcıda (localStorage) duruyordu; ikisi de yanlış çalışıyordu.
 */
const ADIMLAR = [
    {
        Ikon: Sparkles,
        yol: '/admin',
        baslik: 'Sütlüce Kadayıf Yönetim Paneline hoş geldiniz',
        metin: 'Şubenizin menüsünü, reklamını, eğitimlerinizi ve müşteri geri '
             + 'bildirimlerinizi tek yerden yönetiyorsunuz. Sizi kısaca gezdirelim — '
             + 'her adımda ilgili ekrana geçeceğiz.',
    },
    {
        Ikon: Sparkles,
        yol: '/admin',
        baslik: 'Genel Bakış',
        metin: 'Açılış ekranı. Dönem sayılarınız, merkezin duyuruları, bekleyen '
             + 'şikayetler ve bölgenizin bilgisi burada. QR menünüzü de buradan '
             + 'tek tıkla açabilirsiniz.',
    },
    {
        Ikon: UtensilsCrossed,
        yol: '/admin/qr-menu',
        baslik: 'Ürünler',
        metin: 'Merkez kataloğundan şubenizde sattıklarınızı seçersiniz. Tükenen '
             + 'ürünü kapatınca QR menüden anında kalkar, stok gelince geri açarsınız. '
             + 'Fiyatı serbest bırakılan ürünlerde kendi fiyatınızı girersiniz.',
    },
    {
        Ikon: Megaphone,
        yol: '/admin/reklam',
        baslik: 'Reklam',
        metin: 'Dönemsel reklam harcamanız, eriştiğiniz kişi sayısı ve Google '
             + 'performansınız burada. Merkez bütçe kampanyası açtığında katılımınızı '
             + 'bu ekrandan bildirir, dekontunuzu yüklersiniz.',
    },
    {
        Ikon: GraduationCap,
        yol: '/admin/akademi',
        baslik: 'Akademi',
        metin: 'Ürün hazırlama, servis ve hijyen eğitimleri. Dersleri izler, '
             + 'sonunda sınava girersiniz. Sınav hakkı tek seferdir; merkez '
             + 'gerekirse yeniler.',
    },
    {
        Ikon: MessageSquare,
        yol: '/admin/geri-bildirim',
        baslik: 'Şikayet ve Geri Bildirim',
        metin: 'QR menüden şubenize gelen müşteri şikayetlerini görür, durumunu '
             + 'günceller ve yaptığınız görüşmeyi kaydedersiniz. Aynı ekranda '
             + '“Şube Şikayetleri” sekmesinden merkeze kendi talebinizi iletirsiniz.',
    },
    {
        Ikon: Users,
        yol: '/admin/kullanicilar',
        baslik: 'Çalışanlar',
        metin: 'Şubenizde çalışanlar için hesap açabilirsiniz. Çalışan hesabı '
             + 'menüyü ve eğitimleri görür; şube ayarlarına ve faturaya erişemez.',
    },
    {
        Ikon: Sparkles,
        yol: '/admin',
        baslik: 'Hazırsınız',
        metin: 'Tur bitti, başlangıç ekranına döndük. Takıldığınız yerde merkezle '
             + 'Şikayet ve Geri Bildirim ekranından iletişime geçebilirsiniz.',
    },
];

// Menüdeki bağlantıyı bulup halkaya alan sınıf. Kenar çubuğu görünür değilse
// (telefon) eşleşme olmaz; tur yine ilerler.
const ISARET = ['ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background', 'rounded-md'];

export default function HosGeldinTuru({ onKapat }) {
    const [adim, setAdim] = useState(0);
    const navigate = useNavigate();
    const konum = useLocation();
    const { Ikon, baslik, metin, yol } = ADIMLAR[adim];
    const son = adim === ADIMLAR.length - 1;

    // Adım değişince o sayfaya geç. Zaten oradaysak gezinme yapma: aynı yola
    // navigate etmek bazı sayfalarda veriyi yeniden çektiriyor.
    useEffect(() => {
        if (konum.pathname !== yol) navigate(yol);
        // konum bağımlılığı YOK: kullanıcı tur sırasında kendi başına başka bir
        // sayfaya giderse onu geri sürüklemek istemiyoruz.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [adim, yol]);

    // Menü öğesini işaretle. Sayfa geçişi sonrası çubuk yeniden çizildiği için
    // bir kare bekleniyor.
    useEffect(() => {
        let hedef = null;
        const zamanlayici = setTimeout(() => {
            hedef = document.querySelector(`[data-slot="sidebar"] a[href="${yol}"]`)
                || document.querySelector(`a[href="${yol}"]`);
            if (hedef) hedef.classList.add(...ISARET);
        }, 120);
        return () => {
            clearTimeout(zamanlayici);
            if (hedef) hedef.classList.remove(...ISARET);
        };
    }, [adim, yol]);

    function bitir() {
        // Kart ÖNCE kapanır, istek arkada gider: kapatma tıklaması ağı beklemesin.
        // İstek düşerse tur bir sonraki AÇILIŞTA tekrar çıkar — aynı oturumda
        // değil (bkz. Layout'taki `tanitimKapandi`). Sessiz tekrar, sessizce
        // kaybolmaktan iyi: kişi turu görmemişse görmesi gerekiyor.
        api.post('/onboarding/tanitim-bitti').catch(() => {});
        onKapat();
    }

    // İLK ADIM ODAK İSTİYOR, GERİSİ İSTEMİYOR.
    //
    // Karşılama ekranı bir duyuru: kişi paneli ilk kez görüyor, "burada ne var"
    // cümlesini okumadan gezinmenin anlamı yok — perde iniyor, arka plan
    // bulanıklaşıyor, kart ortada duruyor.
    //
    // Sonraki adımlar TAM TERSİ: anlatılan ekranın kendisine bakılacak. Orada
    // perde olsaydı tur, gezdirdiği sayfayı kendi eliyle kapatırdı; kart köşeye
    // çekiliyor ve arkadaki panel tıklanabilir kalıyor.
    const karsilama = adim === 0;

    const govde = (
        <>
            <div className={karsilama ? 'flex flex-col items-center gap-4 text-center' : 'flex items-start gap-3'}>
                <span className={`flex shrink-0 items-center justify-center rounded-2xl bg-[#0f6b3a]/10 text-[#0f6b3a] dark:bg-[#0f6b3a]/20 dark:text-emerald-400 ${
                    karsilama ? 'size-14' : 'size-9 rounded-xl'
                }`}>
                    <Ikon className={karsilama ? 'size-7' : 'size-5'} />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className={karsilama
                        ? 'text-xl font-semibold leading-tight tracking-tight text-foreground'
                        : 'text-sm font-semibold leading-snug text-foreground'}>
                        {baslik}
                    </h2>
                </div>
                {!karsilama && (
                    <Button variant="ghost" size="icon" className="-mr-1 -mt-1 size-7 shrink-0"
                            onClick={bitir} aria-label="Tanıtımı kapat">
                        <X className="size-4" />
                    </Button>
                )}
            </div>

            <p className={`text-sm leading-relaxed text-muted-foreground ${karsilama ? 'mt-3 text-center' : 'mt-2'}`}>
                {metin}
            </p>

            <div className={`flex items-center gap-1.5 ${karsilama ? 'mt-5 justify-center' : 'mt-3'}`}>
                {ADIMLAR.map((_, i) => (
                    <span
                        key={i}
                        className={`h-1.5 rounded-full transition-all ${
                            i === adim ? 'w-5 bg-foreground' : 'w-1.5 bg-muted-foreground/30'
                        }`}
                    />
                ))}
                {!karsilama && (
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {adim + 1} / {ADIMLAR.length}
                    </span>
                )}
            </div>

            <div className={`flex items-center gap-2 ${karsilama ? 'mt-6' : 'mt-3'}`}>
                {adim > 0 ? (
                    <Button variant="outline" size="sm" className="h-10 flex-1 sm:h-8 sm:flex-none"
                            onClick={() => setAdim((a) => a - 1)}>
                        <ArrowLeft className="size-4" /> Geri
                    </Button>
                ) : (
                    <Button variant="ghost" size={karsilama ? 'default' : 'sm'}
                            className={karsilama ? 'h-11 flex-1' : 'h-10 flex-1 sm:h-8 sm:flex-none'}
                            onClick={bitir}>
                        Şimdi değil
                    </Button>
                )}

                <Button size={karsilama ? 'default' : 'sm'}
                        className={karsilama ? 'h-11 flex-1' : 'h-10 flex-1 sm:h-8'}
                        onClick={() => (son ? bitir() : setAdim((a) => a + 1))}>
                    {son ? 'Panele başla' : karsilama ? 'Turu başlat' : 'İleri'}
                    {!son && <ArrowRight className="size-4" />}
                </Button>
            </div>
        </>
    );

    if (karsilama) {
        return (
            /* Perde: `backdrop-blur` arkadaki paneli bulanıklaştırıyor, karartma
               tek başına yetmiyordu — dolu bir pano arkadan okunmaya devam
               ediyor ve göz kartta durmuyordu. Perdeye tıklamak kapatmıyor:
               kişi "Şimdi değil" diyene kadar karar verilmiş sayılmaz. */
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
                <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl sm:p-8">
                    {govde}
                </div>
            </div>
        );
    }

    return (
        /* Telefonda alta yapışık tam genişlik, masaüstünde sağ altta panel.
           `pointer-events-none` sarmalayıcıda: kartın dışındaki ekran
           tıklanabilir kalıyor. */
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-end p-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:p-0">
            <div className="pointer-events-auto w-full max-w-md rounded-2xl border bg-card p-4 shadow-2xl sm:w-96">
                {govde}
            </div>
        </div>
    );
}
