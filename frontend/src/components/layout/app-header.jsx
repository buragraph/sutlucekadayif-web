import { useLocation } from 'react-router-dom';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ThemeSwitcher } from './theme-switcher';
import { SearchDialog } from './search-dialog';

const BREADCRUMB_MAP = {
    '/admin': [{ label: 'Genel Bakış' }],
    '/admin/qr-menu': [{ label: 'QR Menü' }, { label: 'Ürünler' }],
    '/admin/qr-menu/kategoriler': [{ label: 'QR Menü' }, { label: 'Kategoriler' }],
    '/admin/kullanicilar': [{ label: 'Yönetim' }, { label: 'Kullanıcılar' }],
    '/admin/subeler': [{ label: 'Yönetim' }, { label: 'Şubeler' }],
    '/admin/raporlar': [{ label: 'Ana Menü' }, { label: 'Raporlar' }],
    '/admin/medya': [{ label: 'Ana Menü' }, { label: 'Medya' }],
    '/admin/akademi': [{ label: 'Ana Menü' }, { label: 'Akademi' }],
};

export function AppHeader() {
    const location = useLocation();
    const crumbs = BREADCRUMB_MAP[location.pathname] || [{ label: 'Genel Bakış' }];

    return (
        <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 sticky top-0 z-50 overflow-hidden rounded-t-[inherit] bg-background/50 backdrop-blur-md">
            <div className="flex w-full items-center justify-between px-4 lg:px-6">
                <div className="flex items-center gap-1 lg:gap-2">
                    <SidebarTrigger className="-ml-1" />
                    <div className="mx-2 h-4 w-px bg-border" />
                    <SearchDialog />
                </div>
                <div className="flex items-center gap-2">
                    <ThemeSwitcher />
                </div>
            </div>
        </header>
    );
}
