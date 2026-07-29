import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '../../components/layout/app-sidebar';
import { AppHeader } from '../../components/layout/app-header';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import OnboardingWizard from './OnboardingWizard';

export default function Layout() {
    // İlk giriş onboarding'i — yalnızca gerçek şube sahipleri için (admin simülasyonu hariç)
    const { realRole } = useAuth();
    const [onboarding, setOnboarding] = useState(false); // false=gerekmiyor/bilinmiyor, {prefill}=göster

    useEffect(() => {
        if (realRole !== 'sube_sahibi') { setOnboarding(false); return; }
        let aktif = true;
        api.get('/onboarding/status')
            .then(({ data }) => { if (aktif) setOnboarding(data.gerekli ? { prefill: data.prefill || {} } : false); })
            .catch(() => { if (aktif) setOnboarding(false); });
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
            {onboarding && (
                <OnboardingWizard
                    prefill={onboarding.prefill}
                    onComplete={() => setOnboarding(false)}
                />
            )}
        </TooltipProvider>
    );
}
