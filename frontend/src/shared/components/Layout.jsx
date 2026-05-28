import { Outlet } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '../../components/layout/app-sidebar';
import { AppHeader } from '../../components/layout/app-header';

export default function Layout() {
    return (
        <TooltipProvider>
            <SidebarProvider
                style={{
                    '--sidebar-width': '17rem',
                }}
            >
                <AppSidebar variant="inset" />
                <SidebarInset className="peer-data-[variant=inset]:border">
                    <AppHeader />
                    <div className="h-full px-4 md:px-6 pt-3 md:pt-4 pb-4 md:pb-6 flex flex-col min-h-0">
                        <Outlet />
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </TooltipProvider>
    );
}
