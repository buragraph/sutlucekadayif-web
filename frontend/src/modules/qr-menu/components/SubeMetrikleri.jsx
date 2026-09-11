import { useState, useEffect, useId } from 'react';
import { Users, Navigation, MapPin, UtensilsCrossed, TrendingUp, TrendingDown, Minus } from 'lucide-react';
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
    { key: 'erisim', ad: 'Reklamla Ulaşılan Kişi', Ikon: Users, aciklama: 'Reklamlarınızın eriştiği farklı kişi sayısı' },
    { key: 'yolTarifi', ad: 'Yol Tarifi', Ikon: Navigation, aciklama: "Google'dan şubenize yol tarifi alan kişi" },
    { key: 'haritaGoruntulenme', ad: "Google'da Görüntülenme", Ikon: MapPin, aciklama: 'Arama ve haritada kaç kez göründünüz' },
    { key: 'googleMenuTiklama', ad: 'Menü Tıklaması', Ikon: UtensilsCrossed, aciklama: "Google'daki menü bağlantınıza tıklama" },
];

/**
 * Geçen döneme göre değişim.
 *
 * NEDEN GEREKLİ: tek başına "3.195 görüntülenme" iyi mi kötü mü belli değil;
 * şube o sayıyı ancak bir öncekiyle kıyaslayınca okuyabiliyor.
 *
 * ÖNCEKİ 0 İSE YÜZDE YOK: sıfırdan artış "sonsuz yüzde" demek. O durumda
 * yalnızca "yeni" denir.
 */
function degisim(simdi, onceki) {
    if (simdi == null || onceki == null) return null;
    if (onceki === 0) return simdi > 0 ? { tur: 'yeni' } : null;
    const oran = ((simdi - onceki) / onceki) * 100;
    // ±%1 altı gürültü: her dönem birkaç puan oynayan sayılarda ok göstermek
    // "değişti" izlenimi verirdi.
    if (Math.abs(oran) < 1) return { tur: 'sabit' };
    return { tur: oran > 0 ? 'artis' : 'dusus', oran: Math.abs(Math.round(oran)) };
}

/**
 * Kart içindeki mini eğilim grafiği — son dönemler, eskiden yeniye.
 *
 * NEDEN SVG, KÜTÜPHANE DEĞİL: recharts bu iş için ağır (dashboard'a ayrı bir
 * parça yüklerdi) ve burada eksen, ızgara, ipucu istemiyoruz — tek bir çizgi
 * yeter. Dört kartta dört küçük SVG, toplam birkaç yüz bayt.
 *
 * ÖLÇEK KARTA ÖZEL: her metrik kendi en küçük-en büyük aralığına göre
 * çiziliyor. Ortak ölçek kullanılsaydı 524 bin erişimin yanında 124 menü
 * tıklaması düz çizgi olurdu.
 *
 * TEK NOKTALI SERİ ÇİZİLMEZ: iki dönemden azı "eğilim" değil.
 */
function Egilim({ degerler, artis }) {
    // Degrade kimliği `useId` ile: her kartın kendi degradesi var ve
    // Math.random() render sırasında saf olmayan çağrı sayılıyor.
    const kimlik = useId();
    const veri = (degerler || []).filter((v) => v != null);
    if (veri.length < 2) return null;

    const G = 100, Y = 28;              // görünüm kutusu (viewBox birimi)
    const enAz = Math.min(...veri);
    const enCok = Math.max(...veri);
    const aralik = enCok - enAz || 1;
    const noktalar = veri.map((v, i) => [
        (i / (veri.length - 1)) * G,
        Y - ((v - enAz) / aralik) * (Y - 4) - 2,
    ]);
    const cizgi = noktalar.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const alan = `${cizgi} L${G},${Y} L0,${Y} Z`;
    const renk = artis === false ? '#e11d48' : '#0f6b3a';

    return (
        <svg viewBox={`0 0 ${G} ${Y}`} preserveAspectRatio="none"
             className="mt-1 h-8 w-full" aria-hidden="true">
            <defs>
                <linearGradient id={kimlik} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={renk} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={renk} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={alan} fill={`url(#${kimlik})`} />
            {/* SON NOKTAYA İŞARET KOYULMADI: `preserveAspectRatio="none"` yatayda
                geriyor, daire basık bir elipse dönüşüyordu. Çizginin sağ ucu zaten
                "şu an"ı gösteriyor. */}
            <path d={cizgi} fill="none" stroke={renk} strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

function DegisimRozeti({ d }) {
    if (!d) return null;
    if (d.tur === 'yeni') {
        return <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">yeni</span>;
    }
    if (d.tur === 'sabit') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Minus className="size-3" /> değişim yok
            </span>
        );
    }
    const artis = d.tur === 'artis';
    const Ok = artis ? TrendingUp : TrendingDown;
    return (
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${
            artis ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
        }`}>
            <Ok className="size-3" /> %{d.oran}
        </span>
    );
}

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
                {veri?.oncekiDonem && (
                    <span className="text-xs text-muted-foreground">
                        · önceki dönemle karşılaştırıldı ({donemYaz(veri.oncekiDonem)})
                    </span>
                )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {gosterilecek.map((k) => {
                    const d = degisim(veri.kartlar[k.key], veri.oncekiKartlar?.[k.key]);
                    return (
                        <Card key={k.key} className="rounded-2xl bg-linear-to-t from-primary/5 to-card transition-all hover:border-muted-foreground/30">
                            <CardHeader className="flex flex-row items-start justify-between pb-2">
                                <p className="text-xs font-semibold uppercase leading-tight tracking-wider text-muted-foreground">
                                    {k.ad}
                                </p>
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-muted text-[#084529] dark:text-[#d8c7a3]">
                                    <k.Ikon className="size-4.5" />
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-1">
                                <div className="flex flex-wrap items-baseline gap-x-2">
                                    <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
                                        {sayiYaz(veri.kartlar[k.key])}
                                    </p>
                                    <DegisimRozeti d={d} />
                                </div>
                                {/* Sayının ne olduğu kartın kendisinde: "Yol Tarifi"
                                    başlığı tek başına neyi saydığını söylemiyordu. */}
                                <p className="text-[11px] leading-snug text-muted-foreground">{k.aciklama}</p>
                                <Egilim
                                    degerler={(veri.seri || []).map((x) => x[k.key])}
                                    artis={d?.tur === 'dusus' ? false : true}
                                />
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
