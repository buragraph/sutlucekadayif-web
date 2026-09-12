import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '../../components/layout/app-sidebar';
import { AppHeader } from '../../components/layout/app-header';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import ParolaDegistirKapisi from './ParolaDegistirKapisi';
import HosGeldinTuru from './HosGeldinTuru';

export default function Layout() {
    // İlk giriş akışı — yalnızca gerçek şube sahipleri için (admin simülasyonu hariç)
    const { realRole } = useAuth();
    const [parolaGerekli, setParolaGerekli] = useState(false);
    const [onboarded, setOnboarded] = useState(null);
    // ZORUNLU ONBOARDING FORMU ŞİMDİLİK KAPALI. Şube sahibi paneli ilk kez
    // görüyor; ondan ad/telefon/adres istemeden önce neyin nerede olduğunu
    // göstermek gerekiyordu. Form geri açılacaksa OnboardingWizard duruyor:
    // `data.gerekli` durumunu tekrar okuyup aşağıda tanıtımın yerine koymak
    // yeterli (bkz. git geçmişi, bu satır).
    const [tanitimKapandi, setTanitimKapandi] = useState(false);
    // `onboarded` SUNUCUDAN: turun gösterilip gösterilmeyeceğinin asıl ölçütü.
    // null = henüz bilinmiyor (istek dönmeden tur açılmasın, sonra kapanmasın).

    // DURUM HER ROL İÇİN ÇEKİLİYOR. Eskiden yalnızca şube sahibi sorgulanıyordu
    // çünkü tek konu onboarding'di; zorunlu parola değişimi ise role bakmıyor.
    // Uç, onboarding'e tabi olmayan roller için güvenli varsayılan döndürüyor.
    useEffect(() => {
        if (!realRole) return;
        let aktif = true;
        api.get('/onboarding/status')
            .then(({ data }) => {
                if (!aktif) return;
                setParolaGerekli(data.parolaDegistirGerekli === true);
                setOnboarded(data.onboarded !== false);
            })
            .catch(() => {
                if (!aktif) return;
                setParolaGerekli(false);
                // Durum okunamadıysa tur AÇILMAZ: bilinmeyen bir durumda
                // kullanıcıyı tura sokmak, her açılışta tekrar etme riski taşır.
                setOnboarded(true);
            });
        return () => { aktif = false; };
    }, [realRole]);

    // TEK ÖLÇÜT SUNUCUDAKİ `onboarded`. Eskiden "görüldü" notu localStorage'da
    // tutuluyordu; o not admin "turu sıfırla" dediğinde de yerinde kaldığı için
    // tur geri GELMİYORDU — yani sıfırlama düğmesi hiçbir işe yaramıyordu. Aynı
    // kişi telefondan girdiğinde ise tur baştan çıkıyordu. Bayrak tek yerde.
    // Oturum içinde tekrar açılmasını `tanitimKapandi` engelliyor; Layout
    // gezinmelerde yeniden kurulmuyor. Durum yerine TÜRETİLİYOR: efekt içinde
    // setState çağırmak gereksiz ikinci bir render turu demek.
    const tanitim = !tanitimKapandi && realRole === 'sube_sahibi' && onboarded === false;

    return (
        <TooltipProvider>
            <SidebarProvider
                style={{
                    '--sidebar-width': '17rem',
                }}
            >
                <AppSidebar variant="inset" />
                {/* min-w-0: SidebarInset bir flex öğesi ve varsayılan `min-width:auto`
                    yüzünden içeriğinin asgari genişliğinden dar olamıyor. Geniş bir
                    içerik (ör. kategori rayı 14 sekmeye çıkınca 1493px) tüm sayfayı
                    kenar çubuğu genişliği kadar sağa taşırıyordu. overflow-x-hidden
                    ikinci emniyet. Tasarım referansında da bu ikisi birlikte duruyor
                    (next-shadcn-admin-dashboard/src/app/(main)/dashboard/layout.tsx). */}
                <SidebarInset className="peer-data-[variant=inset]:border min-w-0 overflow-x-hidden">
                    <AppHeader />
                    <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-[1536px] flex-col overflow-x-hidden p-4 md:p-6">
                        <Outlet />
                    </div>
                </SidebarInset>
            </SidebarProvider>
            {/* SIRA ÖNEMLİ: parola kapısı tanıtımın ÖNÜNDE. Geçici parolayla
                girmiş biri önce kendi parolasını belirlesin, panel turu sonra. */}
            {parolaGerekli ? (
                <ParolaDegistirKapisi onTamam={() => setParolaGerekli(false)} />
            ) : tanitim && (
                <HosGeldinTuru onKapat={() => setTanitimKapandi(true)} />
            )}
        </TooltipProvider>
    );
}
