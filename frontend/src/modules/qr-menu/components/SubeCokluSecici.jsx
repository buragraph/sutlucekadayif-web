import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';

/**
 * Çoklu şube seçici — arama + işaretleme + toplu seç.
 *
 * Ürün formunda iki yerde kullanılır (gizlenecek şubeler / fiyatı serbest
 * bırakılan şubeler). 97 şube olduğu için liste aranabilir; "Tümünü seç" ve
 * "Temizle" toplu işlemi sağlar.
 *
 * Değer olarak şube SLUG dizisi tutulur (backend de slug bekliyor).
 */
export function SubeCokluSecici({ subeler = [], secili = [], onChange, placeholder = 'Şube seçin' }) {
    const [acik, setAcik] = useState(false);
    const [arama, setArama] = useState('');

    const seciliSet = useMemo(() => new Set(secili), [secili]);

    // Arama kutusundaki metne göre süzülmüş liste — "tümünü seç" bu listeye uygulanır,
    // böylece kullanıcı önce arayıp sonra topluca işaretleyebilir.
    const suzulmus = useMemo(() => {
        const q = arama.trim().toLocaleLowerCase('tr');
        if (!q) return subeler;
        return subeler.filter((s) =>
            (s.ad || '').toLocaleLowerCase('tr').includes(q) ||
            (s.slug || '').toLocaleLowerCase('tr').includes(q)
        );
    }, [subeler, arama]);

    const degistir = (slug) => {
        const yeni = seciliSet.has(slug) ? secili.filter((x) => x !== slug) : [...secili, slug];
        onChange(yeni);
    };

    const tumunuSec = () => {
        const eklenecek = suzulmus.map((s) => s.slug);
        onChange([...new Set([...secili, ...eklenecek])]);
    };

    const temizle = () => {
        // Arama varsa yalnızca görünenleri kaldır; yoksa hepsini
        if (arama.trim()) {
            const kaldir = new Set(suzulmus.map((s) => s.slug));
            onChange(secili.filter((x) => !kaldir.has(x)));
        } else {
            onChange([]);
        }
    };

    const etiket = secili.length === 0
        ? placeholder
        : secili.length === subeler.length
            ? `Tüm şubeler (${secili.length})`
            : `${secili.length} şube seçili`;

    return (
        <div className="space-y-2">
            <Popover open={acik} onOpenChange={setAcik}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={acik}
                        className="w-full justify-between font-normal"
                    >
                        <span className={secili.length ? '' : 'text-muted-foreground'}>{etiket}</span>
                        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                        <CommandInput placeholder="Şube ara..." value={arama} onValueChange={setArama} />
                        <div className="flex items-center gap-1 border-b px-2 py-1.5">
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={tumunuSec}>
                                {arama.trim() ? `Görünenleri seç (${suzulmus.length})` : `Tümünü seç (${subeler.length})`}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={temizle}>
                                {arama.trim() ? 'Görünenleri kaldır' : 'Temizle'}
                            </Button>
                        </div>
                        <CommandList>
                            <CommandEmpty>Şube bulunamadı</CommandEmpty>
                            <CommandGroup>
                                {suzulmus.map((s) => {
                                    const isaretli = seciliSet.has(s.slug);
                                    return (
                                        <CommandItem key={s.slug} value={s.slug} onSelect={() => degistir(s.slug)}>
                                            <div className={`mr-2 flex size-4 items-center justify-center rounded-sm border ${isaretli ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}`}>
                                                {isaretli && <Check className="size-3" />}
                                            </div>
                                            <span className="truncate">{s.ad || s.slug}</span>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

            {/* Seçilenler — tek tek kaldırılabilir. Uzun listede ilk 8 gösterilir. */}
            {secili.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {secili.slice(0, 8).map((slug) => {
                        const s = subeler.find((x) => x.slug === slug);
                        return (
                            <Badge key={slug} variant="secondary" className="gap-1 font-normal">
                                {s?.ad || slug}
                                <button
                                    type="button"
                                    onClick={() => degistir(slug)}
                                    className="text-muted-foreground hover:text-foreground"
                                    aria-label={`${s?.ad || slug} seçimini kaldır`}
                                >
                                    <X className="size-3" />
                                </button>
                            </Badge>
                        );
                    })}
                    {secili.length > 8 && (
                        <Badge variant="outline" className="font-normal">+{secili.length - 8} şube</Badge>
                    )}
                </div>
            )}
        </div>
    );
}

export default SubeCokluSecici;
