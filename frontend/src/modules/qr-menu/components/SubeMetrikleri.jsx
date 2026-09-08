import { useState, useEffect } from 'react';
import { Users, Navigation, MapPin, UtensilsCrossed } from 'lucide-react';
import api from '../../../services/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Şube dashboard'undaki rapor sayıları — SON TAMAMLANMIŞ dönem.
 *
 * Yarım dönemin kısmi sayısını göstermek şubeye "düşüş var" gibi gelirdi;
 * grafik de aynı kuralla çalışıyor (bkz. reports/sube/:kod/ozet-kartlar).
 *
 * Değeri olmayan kart HİÇ ÇİZİLMEZ: bir şubenin Google eşleşmesi yoksa
 * "0 yol tarifi" yazmak yanlış bilgi olur — veri yok demek, sıfır demek değil.
 */
const KARTLAR = [
    { key: 'erisim', ad: 'Reklamla Ulaşılan Kişi', Ikon: Users },
    { key: 'yolTarifi', ad: 'Yol Tarifi', Ikon: Navigation },
    { key: 'haritaGoruntulenme', ad: "Google'da Görüntülenme", Ikon: MapPin },
    { key: 'googleMenuTiklama', ad: 'Menü Tıklaması', Ikon: UtensilsCrossed },
];

const sayiYaz = (v) => new Intl.NumberFormat('tr-TR').format(Math.round(v || 0));

const donemYaz = (d) => {
    try {
        const bas = new Date(d.baslangic).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        const bit = new Date(d.bitis).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: '2-digit' });
        return `${bas} – ${bit}`;
    } catch { return ''; }
};

export default function SubeMetrikleri({ subeSlug }) {
    const [veri, setVeri] = useState(null);
    const [yukleniyor, setYukleniyor] = useState(true);

    useEffect(() => {
        if (!subeSlug) { setYukleniyor(false); return; }
        let iptal = false;
        setYukleniyor(true);
        api.get(`/reports/sube/${subeSlug}/ozet-kartlar`)
            .then(({ data }) => { if (!iptal) setVeri(data); })
            // Rapor sayıları ikincil: gelmezse dashboard'a hata basmıyoruz.
            .catch(() => { if (!iptal) setVeri(null); })
            .finally(() => { if (!iptal) setYukleniyor(false); });
        return () => { iptal = true; };
    }, [subeSlug]);

    if (yukleniyor) {
        return (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {KARTLAR.map((k) => (
                    <Card key={k.key} className="rounded-2xl">
                        <CardHeader className="pb-2"><Skeleton className="h-3 w-28" /></CardHeader>
                        <CardContent><Skeleton className="h-7 w-20" /></CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    const gosterilecek = KARTLAR.filter((k) => veri?.kartlar?.[k.key] != null);
    if (gosterilecek.length === 0) return null;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Son Dönem Özeti
                </h2>
                {veri?.donem && (
                    <span className="text-xs text-muted-foreground">{donemYaz(veri.donem)}</span>
                )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {gosterilecek.map(({ key, ad, Ikon }) => (
                    <Card key={key} className="bg-linear-to-t from-primary/5 to-card rounded-2xl transition-all hover:border-muted-foreground/30">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{ad}</p>
                            <div className="flex size-9 items-center justify-center rounded-xl border bg-muted text-[#084529] dark:text-[#d8c7a3]">
                                <Ikon className="size-4.5" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
                                {sayiYaz(veri.kartlar[key])}
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
