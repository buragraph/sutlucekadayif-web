import { Link } from 'react-router-dom';

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useAuth } from '../../context/AuthContext';
import { getNavGroups } from '../../config/nav-items';
import { NavMain } from './nav-main';
import { NavUser } from './nav-user';

export function AppSidebar(props) {
    const { can, role } = useAuth();
    const navGroups = getNavGroups(can, role);

    return (
        <Sidebar variant="inset" collapsible="icon" {...props}>
            <SidebarHeader className="overflow-hidden !p-0">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <Link
                            to="/admin"
                            className="flex items-center gap-3 rounded-md p-1 hover:bg-sidebar-accent"
                        >
                            <img
                                src="/Varlik-1.png"
                                alt="Sütlüce Kadayıf Logo"
                                className="h-12 w-auto shrink-0 object-contain"
                            />
                            <div className="flex items-stretch gap-3 shrink-0 transition-opacity duration-200 ease-linear group-data-[collapsible=icon]:opacity-0">
                                <div className="w-px self-stretch bg-border" />
                                <div className="flex flex-col items-start justify-center leading-tight whitespace-nowrap">
                                    <span className="text-[10px] text-muted-foreground font-semibold capitalize tracking-wider">Merkezi Yönetim</span>
                                    <span className="text-[10px] text-muted-foreground font-semibold capitalize tracking-wider">Sistemi</span>
                                </div>
                            </div>
                        </Link>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={navGroups} />
            </SidebarContent>
            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
