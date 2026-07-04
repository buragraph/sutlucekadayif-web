import { useNavigate } from 'react-router-dom';
import { EllipsisVertical, LogOut, CircleUser, Shield, ShieldCheck, ShieldAlert } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '@/components/ui/badge';

function getInitials(name) {
    return name
        .split(/[\s\-_]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join('');
}

const ROLE_LABELS = {
    admin: 'Yönetici',
    sube_sahibi: 'Şube Sahibi',
    calisan: 'Çalışan',
};

export function NavUser() {
    const { user, subeSlug, role, realRole, simulatedRole, setSimulatedRole, logout } = useAuth();
    const { isMobile } = useSidebar();
    const navigate = useNavigate();

    const profileName = role === 'admin' ? 'Admin' : (subeSlug || 'Şube');
    const profileEmail = user?.email || '';
    const initials = getInitials(profileName);
    const isSimulating = realRole === 'admin' && simulatedRole;

    const handleLogout = async () => {
        await logout();
        navigate('/giris');
    };

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                            <Avatar className="h-8 w-8 rounded-lg">
                                <AvatarFallback className={`rounded-lg text-xs ${isSimulating ? 'bg-amber-500 text-white' : 'bg-primary text-primary-foreground'}`}>
                                    {initials || '?'}
                                </AvatarFallback>
                            </Avatar>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-medium">{profileName}</span>
                                <span className="truncate text-muted-foreground text-xs flex items-center gap-1">
                                    {ROLE_LABELS[role] || role}
                                    {isSimulating && <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-amber-400 text-amber-600">Simülasyon</Badge>}
                                </span>
                            </div>
                            <EllipsisVertical className="ml-auto size-4" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                        side={isMobile ? 'bottom' : 'right'}
                        align="end"
                        sideOffset={4}
                    >
                        <DropdownMenuLabel className="p-0 font-normal">
                            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                <Avatar className="h-8 w-8 rounded-lg">
                                    <AvatarFallback className={`rounded-lg text-xs ${isSimulating ? 'bg-amber-500 text-white' : 'bg-primary text-primary-foreground'}`}>
                                        {initials || '?'}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-medium">{profileName}</span>
                                    <span className="truncate text-muted-foreground text-xs">
                                        {ROLE_LABELS[role] || role}
                                    </span>
                                </div>
                            </div>
                        </DropdownMenuLabel>

                        {/* Rol Değiştirme — Sadece Admin */}
                        {realRole === 'admin' && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2">
                                    Rol Simülasyonu
                                </DropdownMenuLabel>
                                <DropdownMenuGroup>
                                    <DropdownMenuItem
                                        onClick={() => setSimulatedRole(null)}
                                        className={!simulatedRole ? 'bg-primary/10 text-primary font-medium' : ''}
                                    >
                                        <ShieldCheck className="mr-2 h-4 w-4" />
                                        Yönetici
                                        {!simulatedRole && <span className="ml-auto text-[10px] text-primary">●</span>}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setSimulatedRole('sube_sahibi')}
                                        className={simulatedRole === 'sube_sahibi' ? 'bg-amber-50 text-amber-700 font-medium' : ''}
                                    >
                                        <Shield className="mr-2 h-4 w-4" />
                                        Şube Sahibi
                                        {simulatedRole === 'sube_sahibi' && <span className="ml-auto text-[10px] text-amber-500">●</span>}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setSimulatedRole('calisan')}
                                        className={simulatedRole === 'calisan' ? 'bg-amber-50 text-amber-700 font-medium' : ''}
                                    >
                                        <ShieldAlert className="mr-2 h-4 w-4" />
                                        Çalışan
                                        {simulatedRole === 'calisan' && <span className="ml-auto text-[10px] text-amber-500">●</span>}
                                    </DropdownMenuItem>
                                </DropdownMenuGroup>
                            </>
                        )}

                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => navigate('/admin/profil')}>
                            <CircleUser className="mr-2 h-4 w-4" />
                            Profil
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                            <LogOut className="mr-2 h-4 w-4" />
                            Çıkış Yap
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
