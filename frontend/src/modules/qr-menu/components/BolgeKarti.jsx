import { useState, useEffect } from 'react';
import { MapPin, TrendingUp } from 'lucide-react';
import api from '../../../services/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

/**
 * Şubenin bulunduğu ilçenin sosyo-ekonomik profili.
 *
 * KAYNAK RESMÎ VE TEK: Sanayi ve Teknoloji Bakanlığı İlçe SEGE-2022 (973
 * ilçe). Kaynağı ekranda yazıyoruz — şube sahibi "bu sayı nereden geliyor"
 * diye sormasın ve tahmin sanmasın.
 *
 * VERİSİ OLMAYAN ŞUBEDE HİÇ ÇİZİLMEZ. İlçe atanmamışsa kart yerine tek
 * satırlık bir uyarı çıkar: "veri yok" ile "ilçe girilmemiş" farklı şeyler,
 * ikincisi çözülebilir bir eksik.
 */
const KADEME_ETIKET = {
    1: { ad: '1. kademe', not: 'en gelişmiş', renk: 'text-emerald-700 dark:text-emerald-400' },
    2: { ad: '2. kademe', not: 'gelişmiş', renk: 'text-emerald-700 dark:text-emerald-400' },
    3: { ad: '3. kademe', not: 'orta üstü', renk: 'text-foreground' },
    4: { ad: '4. kademe', not: 'orta altı', renk: 'text-foreground' },
    5: { ad: '5. kademe', not: 'az gelişmiş', renk: 'text-amber-700 dark:text-amber-500' },
    6: { ad: '6. kademe', not: 'en az gelişmiş', renk: 'text-amber-700 dark:text-amber-500' },
};

const sayiYaz = (v) => new Intl.NumberFormat('tr-TR').format(v ?? 0);

/**
 * `dikey`: haritanın yanında duran tek sütunluk biçim. Dashboard'da harita
 * 2 sütun, bölge paneli 1 sütun — dört kartlık yatay şerit oraya sığmıyordu.
 */
export default function BolgeKarti({ subeSlug, dikey = false }) {
    const [veri, setVeri] = useState(null);

    useEffect(() => {
        if (!subeSlug) return;
        let iptal = false;
        api.get(`/branches/${subeSlug}/demografi`)
            .then(({ data }) => { if (!iptal) setVeri(data); })
            .catch(() => {});
        return () => { iptal = true; };
    }, [subeSlug]);

    if (!veri) return null;

    if (veri.sebep === 'ilce_yok') {
        return (
            <div className="rounded-lg border border-dashed px-4 py-2.5 text-sm text-muted-foreground">
                <MapPin className="mr-1.5 inline size-3.5" />
                Şubenizin ilçesi tanımlı değil; bölge bilgisi bunun için gösterilemiyor.
            </div>
        );
    }
    const d = veri.demografi;
    if (!d) return null;

    const kademe = KADEME_ETIKET[d.sege_kademe] || null;
    // Yaş/eğitim TÜİK verisi yüklenince dolacak; o ana kadar yalnızca SEGE var.
    const yasVar = d.nufus != null;

    if (dikey) {
        // h-full YOK: sütunun boyuna göre gerilince NÜFUS ile kaynak satırı
        // arasında kocaman bir boşluk kalıyordu. Kart içeriği kadar yer kaplasın.
        return (
            <Card className="flex flex-col rounded-2xl">
                <CardHeader className="pb-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Bölgeniz
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <MapPin className="size-3.5 text-[#084529] dark:text-[#d8c7a3]" />
                        {veri.il} · {veri.ilce}
                    </p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Sosyo-ekonomik sıra
                        </p>
                        <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-foreground">
                            {sayiYaz(d.sege_sira)}
                            <span className="text-base font-normal text-muted-foreground">
                                {' '}/ {sayiYaz(veri.toplamIlce)}
                            </span>
                        </p>
                        {kademe && (
                            <p className={`mt-1 text-xs font-medium ${kademe.renk}`}>
                                {kademe.ad} — {kademe.not}
                            </p>
                        )}
                    </div>

                    {yasVar && (
                        <div className="border-t pt-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Nüfus
                            </p>
                            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">
                                {sayiYaz(d.nufus)}
                            </p>
                        </div>
                    )}

                    {/* KAYNAK EKRANDA VE DOĞRU: şube sahibi "bu sayı nereden
                        geliyor" diye sormasın, tahmin sanmasın. Nüfus resmî TÜİK
                        yayınından DEĞİL, açık veri derlemesinden geliyor (bkz.
                        migration 0038) — "TÜİK" yazmak doğrulanmamış bir iddia
                        olurdu. Resmî ADNKS tablosu geldiğinde bu satır düzelecek. */}
                    <p className="mt-1 border-t pt-3 text-[11px] leading-snug text-muted-foreground">
                        Sosyo-ekonomik sıra: Sanayi ve Teknoloji Bakanlığı, İlçe SEGE-{d.kaynak_yili}
                        {yasVar ? <><br />Nüfus: açık veri derlemesi</> : null}
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Bölgeniz
                </h2>
                <span className="text-xs text-muted-foreground">{veri.il} · {veri.ilce}</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-linear-to-t from-primary/5 to-card rounded-2xl">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Sosyo-ekonomik sıra
                        </p>
                        <div className="flex size-9 items-center justify-center rounded-xl border bg-muted text-[#084529] dark:text-[#d8c7a3]">
                            <TrendingUp className="size-4.5" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
                            {sayiYaz(d.sege_sira)}
                            <span className="text-base font-normal text-muted-foreground">
                                {' '}/ {sayiYaz(veri.toplamIlce)}
                            </span>
                        </p>
                        {kademe && (
                            <p className={`mt-1 text-xs font-medium ${kademe.renk}`}>
                                {kademe.ad} — {kademe.not}
                            </p>
                        )}
                        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                            Sanayi ve Teknoloji Bakanlığı, İlçe SEGE-{d.kaynak_yili}
                        </p>
                    </CardContent>
                </Card>

                {yasVar && (
                    <Card className="rounded-2xl">
                        <CardHeader className="pb-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nüfus</p>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{sayiYaz(d.nufus)}</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
