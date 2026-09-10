import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '../../components/layout/app-sidebar';
import { AppHeader } from '../../components/layout/app-header';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import OnboardingWizard from './OnboardingWizard';
import ParolaDegistirKapisi from './ParolaDegistirKapisi';

export default function Layout() {
    // İlk giriş onboarding'i — yalnızca gerçek şube sahipleri için (admin simülasyonu hariç)
    const { realRole } = useAuth();
    const [onboarding, setOnboarding] = useState(false); // false=gerekmiyor/bilinmiyor, {prefill}=göster
    const [parolaGerekli, setParolaGerekli] = useState(false);

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
                setOnboarding(data.gerekli ? { prefill: data.prefill || {} } : false);
            })
            .catch(() => {
                if (!aktif) return;
                setParolaGerekli(false);
                setOnboarding(false);
            });
        return () => { aktif = false; };
    }, [realRole]);

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
            {/* SIRA ÖNEMLİ: parola kapısı onboarding'in ÖNÜNDE. Onboarding şube
                bilgisi topluyor; geçici parolayla girmiş biri o bilgiyi
                yazabilmemeli. */}
            {parolaGerekli ? (
                <ParolaDegistirKapisi onTamam={() => setParolaGerekli(false)} />
            ) : onboarding && (
                <OnboardingWizard
                    prefill={onboarding.prefill}
                    onComplete={() => setOnboarding(false)}
                />
            )}
        </TooltipProvider>
    );
}
