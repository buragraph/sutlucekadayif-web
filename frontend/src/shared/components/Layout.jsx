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
import { tanitimGoruldu } from '../utils/tanitim';

export default function Layout() {
    // İlk giriş akışı — yalnızca gerçek şube sahipleri için (admin simülasyonu hariç)
    const { realRole, user } = useAuth();
    const [parolaGerekli, setParolaGerekli] = useState(false);
    // ZORUNLU ONBOARDING FORMU ŞİMDİLİK KAPALI. Şube sahibi paneli ilk kez
    // görüyor; ondan ad/telefon/adres istemeden önce neyin nerede olduğunu
    // göstermek gerekiyordu. Form geri açılacaksa OnboardingWizard duruyor:
    // `data.gerekli` durumunu tekrar okuyup aşağıda tanıtımın yerine koymak
    // yeterli (bkz. git geçmişi, bu satır).
    const [tanitimKapandi, setTanitimKapandi] = useState(false);

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
            })
            .catch(() => {
                if (!aktif) return;
                setParolaGerekli(false);
            });
        return () => { aktif = false; };
    }, [realRole]);

    // Tanıtım sunucuya sorulmuyor; "bu tarayıcıda gösterildi mi" bilgisi
    // localStorage'da. Durum yerine TÜRETİLİYOR: efekt içinde setState çağırmak
    // gereksiz ikinci bir render turu demek.
    const tanitim = !tanitimKapandi && realRole === 'sube_sahibi' && !tanitimGoruldu(user?.uid);

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
                <HosGeldinTuru uid={user?.uid} onKapat={() => setTanitimKapandi(true)} />
            )}
        </TooltipProvider>
    );
}
