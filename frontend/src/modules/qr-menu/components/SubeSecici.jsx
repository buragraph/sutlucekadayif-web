import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';

/**
 * Tek şube seçici — aranabilir.
 *
 * NEDEN düz `select` değil: 93 açık şube var, doğru olanı kaydırarak bulmak
 * eziyet. Filtre Türkçe duyarlı (toLocaleLowerCase('tr'), yoksa 'İSTANBUL'
 * eşleşmeyi kaçırır) ve şube KODUNA da bakıyor — panelde ad "Kocaeli Gebze
 * Tatlıkuyu" ama herkes "gebze" diye arıyor.
 *
 * Çoklu seçim gerekiyorsa SubeCokluSecici kullan; bu onun tek seçimlik kardeşi.
 */
export default function SubeSecici({
    subeler = [],
    deger = '',
    yerTutucu = 'Şube seçin',
    onSec,
    kucuk = false,
    className = '',
}) {
    const [acik, setAcik] = useState(false);
    const [arama, setArama] = useState('');

    const suzulmus = useMemo(() => {
        const q = arama.trim().toLocaleLowerCase('tr');
        if (!q) return subeler;
        return subeler.filter((s) =>
            (s.ad || '').toLocaleLowerCase('tr').includes(q) ||
            (s.slug || '').toLocaleLowerCase('tr').includes(q)
        );
    }, [subeler, arama]);

    const secili = subeler.find((s) => s.slug === deger);

    return (
        /* modal ŞART: bu liste bir PENCERE İÇİNDE açılıyor. Popover içeriği
           portalla belgenin köküne taşınıyor, Dialog'un kaydırma kilidi
           (react-remove-scroll) kendi ağacı DIŞINDAKİ tekerlek olaylarını
           engelliyor — 288px kutuda 3140px içerik olmasına rağmen scrollTop
           hep 0 kalıyordu. `modal` Popover'ı kendi kilidini yöneten katman
           yapıyor, tekerlek geri geliyor. */
        <Popover modal open={acik} onOpenChange={(a) => { setAcik(a); if (!a) setArama(''); }}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={acik}
                    className={`justify-between font-normal ${kucuk ? 'h-8 w-56 px-2 text-xs' : 'h-9 w-full px-3 text-sm'} ${className}`}
                >
                    <span className={`truncate ${secili ? '' : 'text-muted-foreground'}`}>
                        {secili ? secili.ad : yerTutucu}
                    </span>
                    <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
                {/* shouldFilter={false}: süzme yukarıda Türkçe kurallarıyla yapılıyor,
                    cmdk'nin kendi eşleştiricisi devreye girerse iki kez süzülür. */}
                <Command shouldFilter={false}>
                    <CommandInput placeholder="Şube ara..." value={arama} onValueChange={setArama} />
                    <CommandList>
                        <CommandEmpty>Şube bulunamadı</CommandEmpty>
                        <CommandGroup>
                            {suzulmus.map((s) => (
                                <CommandItem
                                    key={s.slug}
                                    value={s.slug}
                                    onSelect={() => { onSec(s.slug); setAcik(false); setArama(''); }}
                                >
                                    <Check className={`mr-2 size-3.5 ${s.slug === deger ? 'opacity-100' : 'opacity-0'}`} />
                                    <span className="truncate">{s.ad}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
