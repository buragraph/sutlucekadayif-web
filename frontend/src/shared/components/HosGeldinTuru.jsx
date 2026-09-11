import { useState } from 'react';
import {
    UtensilsCrossed, Megaphone, GraduationCap, MessageSquare, Inbox, Sparkles, ArrowRight, ArrowLeft,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { tanitimGorulduYaz } from '../utils/tanitim';

/**
 * Şube sahibine ilk girişte panelin ne işe yaradığını anlatan tanıtım.
 *
 * NEDEN ONBOARDING FORMUNUN YERİNE: eskiden ilk girişte zorunlu bir form vardı
 * (ad, telefon, il/ilçe/adres) ve kişi doldurmadan panele giremiyordu. Form
 * şimdilik kaldırıldı — şube sahibi paneli ilk kez görüyor, ondan veri istemeden
 * önce neyin nerede olduğunu göstermek gerekiyor. Form geri açılacaksa
 * OnboardingWizard duruyor, Layout'ta tek satır (bkz. oradaki not).
 *
 * ZORUNLU DEĞİL: kapatılabilir ve atlanabilir. Zorunlu tutmak ilk girişte ikinci
 * bir duvar olurdu; parola kapısı zaten önünde duruyor.
 *
 * BİR KEZ GÖSTERİLİR: "görüldü" notu localStorage'da (bkz. utils/tanitim.js).
 */
const ADIMLAR = [
    {
        Ikon: Sparkles,
        baslik: 'Sütlüce Kadayıf Yönetim Paneline hoş geldiniz',
        metin: 'Şubenizin menüsünü, reklam bütçenizi, eğitimlerinizi ve müşteri '
             + 'geri bildirimlerinizi tek yerden yönetiyorsunuz. Kısaca neyin nerede '
             + 'olduğunu gösterelim — birkaç adım sürer.',
    },
    {
        Ikon: UtensilsCrossed,
        baslik: 'Ürünler',
        metin: 'Merkez kataloğundaki ürünlerden şubenizde sattıklarınızı seçersiniz. '
             + 'Tükenen bir ürünü “mevcut değil” yaparak QR menüden anında kaldırır, '
             + 'stok gelince geri açarsınız. Fiyatı serbest bırakılan ürünlerde kendi '
             + 'fiyatınızı girebilirsiniz.',
    },
    {
        Ikon: Megaphone,
        baslik: 'Reklam ve Bütçe',
        metin: 'Şubenizin dönemsel reklam harcaması, erişimi ve Google performansı '
             + 'Reklam bölümünde. Merkez bir bütçe kampanyası açtığında katılımınızı '
             + 'buradan bildirir, dekontunuzu yüklersiniz.',
    },
    {
        Ikon: GraduationCap,
        baslik: 'Akademi',
        metin: 'Ürün hazırlama, servis ve hijyen eğitimleri burada. Dersleri izler, '
             + 'sonunda sınava girersiniz. Sınav hakkı tek seferdir; merkez gerekirse '
             + 'yeniler.',
    },
    {
        Ikon: MessageSquare,
        baslik: 'Şikayet ve Geri Bildirim',
        metin: 'QR menüden şubenize gelen müşteri şikayetlerini görür, durumunu '
             + 'günceller ve yaptığınız görüşmeyi kaydedersiniz. Aynı ekranda '
             + '“Şube Şikayetleri” sekmesinden merkeze kendi şikayet ve talebinizi '
             + 'iletebilirsiniz.',
    },
    {
        Ikon: Inbox,
        baslik: 'Duyurular ve Çalışanlar',
        metin: 'Merkezin duyuruları Duyurular bölümüne düşer. Şubenizde çalışanlar '
             + 'için hesap açmak isterseniz Çalışanlar bölümünden ekleyebilirsiniz.',
    },
];

export default function HosGeldinTuru({ uid, onKapat }) {
    const [adim, setAdim] = useState(0);
    const son = adim === ADIMLAR.length - 1;
    const { Ikon, baslik, metin } = ADIMLAR[adim];

    function bitir() {
        tanitimGorulduYaz(uid);
        onKapat();
    }

    return (
        <Dialog open onOpenChange={(a) => !a && bitir()}>
            <DialogContent className="sm:max-w-lg">
                <div className="flex flex-col items-center gap-4 px-2 pt-2 text-center">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-[#0f6b3a]/10 text-[#0f6b3a] dark:bg-[#0f6b3a]/20 dark:text-emerald-400">
                        <Ikon className="size-7" />
                    </div>

                    {/* DialogTitle yerine düz başlık: radix başlığı görsel olarak
                        üstte sabit bir şerit gibi duruyordu, tanıtım kartı ortalı. */}
                    <h2 className="text-xl font-semibold leading-tight tracking-tight">{baslik}</h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">{metin}</p>

                    <div className="mt-1 flex items-center gap-1.5">
                        {ADIMLAR.map((_, i) => (
                            <span
                                key={i}
                                className={`h-1.5 rounded-full transition-all ${
                                    i === adim ? 'w-5 bg-foreground' : 'w-1.5 bg-muted-foreground/30'
                                }`}
                            />
                        ))}
                    </div>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                    {adim > 0 ? (
                        <Button variant="ghost" size="sm" onClick={() => setAdim((a) => a - 1)}>
                            <ArrowLeft className="size-4" /> Geri
                        </Button>
                    ) : (
                        <Button variant="ghost" size="sm" onClick={bitir}>Atla</Button>
                    )}

                    <span className="text-xs tabular-nums text-muted-foreground">
                        {adim + 1} / {ADIMLAR.length}
                    </span>

                    <Button size="sm" onClick={() => (son ? bitir() : setAdim((a) => a + 1))}>
                        {son ? 'Panele başla' : 'İleri'}
                        {!son && <ArrowRight className="size-4" />}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
