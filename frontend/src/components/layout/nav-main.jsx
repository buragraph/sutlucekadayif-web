import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight, PlusCircle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    useSidebar,
} from '@/components/ui/sidebar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '../../context/AuthContext';

function NavItemExpanded({ item, isActive, isSubmenuOpen }) {
    return (
        <Collapsible
            asChild
            defaultOpen={isSubmenuOpen(item.subItems)}
            className="group/collapsible"
        >
            <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                    {item.subItems ? (
                        <SidebarMenuButton
                            isActive={isActive(item.url, item.subItems)}
                            tooltip={item.title}
                        >
                            {item.icon && <item.icon />}
                            <span>{item.title}</span>
                            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                    ) : (
                        <SidebarMenuButton
                            asChild
                            isActive={isActive(item.url)}
                            tooltip={item.title}
                        >
                            <NavLink to={item.url} end={item.end}>
                                {item.icon && <item.icon />}
                                <span>{item.title}</span>
                            </NavLink>
                        </SidebarMenuButton>
                    )}
                </CollapsibleTrigger>
                {item.subItems && (
                    <CollapsibleContent>
                        <SidebarMenuSub>
                            {item.subItems.map((subItem) => (
                                <SidebarMenuSubItem key={subItem.title}>
                                    <SidebarMenuSubButton
                                        isActive={isActive(subItem.url)}
                                        asChild
                                    >
                                        <NavLink to={subItem.url} end={subItem.end}>
                                            {subItem.icon && <subItem.icon />}
                                            <span>{subItem.title}</span>
                                        </NavLink>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                            ))}
                        </SidebarMenuSub>
                    </CollapsibleContent>
                )}
            </SidebarMenuItem>
        </Collapsible>
    );
}

function NavItemCollapsed({ item, isActive }) {
    return (
        <SidebarMenuItem>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                        tooltip={item.title}
                        isActive={isActive(item.url, item.subItems)}
                    >
                        {item.icon && <item.icon />}
                        <span>{item.title}</span>
                        <ChevronRight />
                    </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-50 space-y-1" side="right" align="start">
                    {item.subItems?.map((subItem) => (
                        <DropdownMenuItem key={subItem.title} asChild>
                            <SidebarMenuSubButton
                                className="focus-visible:ring-0"
                                isActive={isActive(subItem.url)}
                                asChild
                            >
                                <NavLink to={subItem.url} end={subItem.end}>
                                    {subItem.icon && <subItem.icon />}
                                    <span>{subItem.title}</span>
                                </NavLink>
                            </SidebarMenuSubButton>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </SidebarMenuItem>
    );
}

export function NavMain({ items }) {
    const location = useLocation();
    const { state, isMobile } = useSidebar();
    const { subeSlug } = useAuth();

    const isItemActive = (url, subItems) => {
        if (subItems?.length) {
            return subItems.some((sub) => location.pathname === sub.url || location.pathname.startsWith(sub.url + '/'));
        }
        return location.pathname === url;
    };

    const isSubmenuOpen = (subItems) => {
        return subItems?.some((sub) => location.pathname === sub.url || location.pathname.startsWith(sub.url + '/')) ?? false;
    };

    return (
        <>
            {items.map((group) => (
                <SidebarGroup key={group.id}>
                    {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {group.items.map((item) => {
                                if (state === 'collapsed' && !isMobile) {
                                    if (!item.subItems) {
                                        return (
                                            <SidebarMenuItem key={item.title}>
                                                <SidebarMenuButton
                                                    asChild
                                                    tooltip={item.title}
                                                    isActive={isItemActive(item.url)}
                                                >
                                                    <NavLink to={item.url} end={item.end}>
                                                        {item.icon && <item.icon />}
                                                        <span>{item.title}</span>
                                                    </NavLink>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        );
                                    }
                                    return <NavItemCollapsed key={item.title} item={item} isActive={isItemActive} />;
                                }
                                return (
                                    <NavItemExpanded
                                        key={item.title}
                                        item={item}
                                        isActive={isItemActive}
                                        isSubmenuOpen={isSubmenuOpen}
                                    />
                                );
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            ))}
        </>
    );
}

