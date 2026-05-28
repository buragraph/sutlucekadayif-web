import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '@/components/ui/command';
import { useAuth } from '../../context/AuthContext';
import { getNavGroups } from '../../config/nav-items';

function flattenNavItems(navGroups) {
    return navGroups.flatMap((group) =>
        group.items.flatMap((item) => {
            if (item.subItems) {
                return item.subItems.map((sub) => ({
                    group: item.title,
                    label: sub.title,
                    url: sub.url,
                    icon: sub.icon || item.icon,
                }));
            }
            return [{
                group: group.label || 'Diğer',
                label: item.title,
                url: item.url,
                icon: item.icon,
            }];
        })
    );
}

function groupBy(items) {
    const groups = [...new Set(items.map((item) => item.group))];
    return groups.map((group) => ({
        group,
        items: items.filter((item) => item.group === group),
    }));
}

export function SearchDialog() {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const navigate = useNavigate();
    const { can } = useAuth();

    const navGroups = React.useMemo(() => getNavGroups(can), [can]);
    const searchItems = React.useMemo(() => flattenNavItems(navGroups), [navGroups]);

    React.useEffect(() => {
        const down = (e) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((prev) => !prev);
            }
        };
        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, []);

    const handleOpenChange = (value) => {
        setOpen(value);
        if (!value) setQuery('');
    };

    const handleSelect = (item) => {
        handleOpenChange(false);
        navigate(item.url);
    };

    const renderGroups = (items) =>
        groupBy(items).map(({ group, items: groupItems }, index) => (
            <React.Fragment key={group}>
                {index > 0 && <CommandSeparator />}
                <CommandGroup heading={group}>
                    {groupItems.map((item) => (
                        <CommandItem
                            key={`${group}-${item.url}`}
                            value={`${item.group} ${item.label}`}
                            onSelect={() => handleSelect(item)}
                        >
                            {item.icon && <item.icon className="size-4" />}
                            <span>{item.label}</span>
                        </CommandItem>
                    ))}
                </CommandGroup>
            </React.Fragment>
        ));

    return (
        <>
            <Button
                onClick={() => handleOpenChange(true)}
                variant="outline"
                className="h-8 w-64 justify-start gap-2 rounded-lg bg-muted/40 border-transparent text-muted-foreground font-normal shadow-none hover:bg-muted/60 hover:border-transparent"
            >
                <Search className="size-4 opacity-50" />
                <span className="text-sm">Ara...</span>
                <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-medium text-[10px] text-muted-foreground">
                    <span className="text-xs">⌘</span>K
                </kbd>
            </Button>
            <CommandDialog
                open={open}
                onOpenChange={handleOpenChange}
                title="Ara"
                description="Sayfa ve menü öğelerini arayın"
            >
                <Command>
                    <CommandInput
                        placeholder="Sayfa, menü ve ayarları ara…"
                        value={query}
                        onValueChange={setQuery}
                    />
                    <CommandList>
                        <CommandEmpty>Sonuç bulunamadı.</CommandEmpty>
                        {renderGroups(searchItems)}
                    </CommandList>
                </Command>
            </CommandDialog>
        </>
    );
}
