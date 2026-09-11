import { useState, useEffect } from 'react';
import { Megaphone, TriangleAlert, Info, ChevronDown, Check } from 'lucide-react';
import api from '../../../services/api';

/**
 * Dashboard'daki merkez duyuruları.
 *
 * Süzme SUNUCUDA (bkz. routes/duyurular.js `/aktif`): yayından kalkmış,
 * süresi geçmiş ya da başka şubeye hedeflenmiş duyuru buraya hiç gelmiyor.
 *
 * OKUNMUŞLAR SİLİNMİYOR, KATLANIYOR: "okundu" deyince duyuru ekrandan
 * tamamen kaybolsaydı şube bir daha ulaşamazdı ("hani şu kampanya yazısı?").
 * Okunanlar altta tek satırlık bir açılır bölümde duruyor.
 *
 * BOŞKEN DAVRANIŞ ÇAĞIRANA BAĞLI (`blok`):
 *   - varsayılan: hiç duyuru yoksa hiçbir şey çizilmez. Serbest akışta duran
 *     bir "duyuru yok" kartı boşuna yer kaplardı.
 *   - `blok`: panoda duyurulara ayrılmış sabit bir sütun var; orada bileşen
 *     kaybolunca sütunun yarısı boş kalıyor ve düzen bozuluyordu. O yüzden
 *     çerçeve her hâlükârda çiziliyor, içi boşsa boş duruyor.
 */
const STIL = {
    onemli: {
        kart: 'border-destructive/30 bg-destructive/5',
        ikon: 'text-destructive',
        Ikon: TriangleAlert,
    },
    uyari: {
        kart: 'border-amber-500/40 bg-amber-500/5',
        ikon: 'text-amber-600 dark:text-amber-500',
        Ikon: TriangleAlert,
    },
    bilgi: {
        kart: 'border-border bg-card',
        ikon: 'text-[#084529] dark:text-[#d8c7a3]',
        Ikon: Info,
    },
};

const tarihYaz = (d) => {
    try {
        return new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return ''; }
};

export default function DuyuruKartlari({ blok = false }) {
    const [duyurular, setDuyurular] = useState([]);
    const [acik, setAcik] = useState({});
    const [okunanlarAcik, setOkunanlarAcik] = useState(false);
    const [bekleyen, setBekleyen] = useState(null);

    useEffect(() => {
        let iptal = false;
        api.get('/duyurular/aktif')
            .then(({ data }) => { if (!iptal) setDuyurular(data.duyurular || []); })
            // Duyuru ikincil içerik: yüklenemezse dashboard'a hata basmıyoruz.
            .catch(() => {});
        return () => { iptal = true; };
    }, []);

    async function okunduIsaretle(d) {
        setBekleyen(d.id);
        // İyimser: işaret sunucuya yazılmadan kart okunanlara geçsin, tıklama
        // gecikmeli hissettirmesin. Hata olursa geri alınıyor.
        setDuyurular((p) => p.map((x) => (x.id === d.id ? { ...x, okundu: true } : x)));
        try {
            await api.post(`/duyurular/${d.id}/okundu`);
        } catch {
            setDuyurular((p) => p.map((x) => (x.id === d.id ? { ...x, okundu: false } : x)));
        }
        setBekleyen(null);
    }

    if (duyurular.length === 0 && !blok) return null;

    const okunmamis = duyurular.filter((d) => !d.okundu);
    const okunmus = duyurular.filter((d) => d.okundu);

    const Kart = ({ d, sonuk }) => {
        const s = STIL[d.onem] || STIL.bilgi;
        // Uzun metin katlanır: üç duyuru varken dashboard'ı aşağı itmesin.
        const uzun = (d.icerik || '').length > 260;
        const genis = acik[d.id];
        return (
            <div className={`rounded-2xl border p-4 ${sonuk ? 'border-border bg-muted/30' : s.kart}`}>
                <div className="flex items-start gap-3">
                    <s.Ikon className={`mt-0.5 size-4 shrink-0 ${sonuk ? 'text-muted-foreground' : s.ikon}`} />
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <h3 className={`font-medium ${sonuk ? 'text-muted-foreground' : 'text-foreground'}`}>{d.baslik}</h3>
                            <span className="text-xs text-muted-foreground">
                                {tarihYaz(d.baslangic || d.olusturma)}
                            </span>
                        </div>
                        {d.icerik && (
                            <p className={`mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground ${uzun && !genis ? 'line-clamp-3' : ''}`}>
                                {d.icerik}
                            </p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                            {uzun && (
                                <button
                                    type="button"
                                    onClick={() => setAcik((p) => ({ ...p, [d.id]: !p[d.id] }))}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
                                >
                                    {genis ? 'Daha az' : 'Devamını oku'}
                                    <ChevronDown className={`size-3 transition-transform ${genis ? 'rotate-180' : ''}`} />
                                </button>
                            )}
                            {!d.okundu && (
                                <button
                                    type="button"
                                    disabled={bekleyen === d.id}
                                    onClick={() => okunduIsaretle(d)}
                                    className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                                >
                                    <Check className="size-3" /> Okudum
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={`flex flex-col gap-3 ${blok ? 'h-full rounded-2xl border bg-card p-4' : ''}`}>
            <div className="flex items-center gap-2">
                <Megaphone className="size-4 text-muted-foreground" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Merkezden Duyurular
                </h2>
                {okunmamis.length > 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {okunmamis.length} yeni
                    </span>
                )}
            </div>

            {duyurular.length === 0 && (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
                    <Megaphone className="size-7 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">Şu an bekleyen duyuru yok</p>
                    <p className="max-w-xs text-xs text-muted-foreground/80">
                        Merkez bir duyuru yayınladığında burada görünür.
                    </p>
                </div>
            )}

            {okunmamis.map((d) => <Kart key={d.id} d={d} />)}

            {okunmus.length > 0 && (
                <div className="flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={() => setOkunanlarAcik((v) => !v)}
                        className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                        <ChevronDown className={`size-3.5 transition-transform ${okunanlarAcik ? 'rotate-180' : ''}`} />
                        Okuduğunuz duyurular ({okunmus.length})
                    </button>
                    {okunanlarAcik && okunmus.map((d) => <Kart key={d.id} d={d} sonuk />)}
                </div>
            )}
        </div>
    );
}
