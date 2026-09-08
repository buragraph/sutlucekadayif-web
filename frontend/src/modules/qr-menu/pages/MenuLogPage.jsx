import { useState, useEffect, useCallback, useMemo } from 'react';
import { History, Search, X, EyeOff, Eye, Tag, Tags, ListPlus, ListMinus } from 'lucide-react';
import api from '../../../services/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';
import { ETIKETLER } from '../constants/etiketler';
import { fiyatYaz } from '../utils/fiyat';

/**
 * Menü Günlüğü — "kim, hangi şubede, neyi değiştirdi".
 *
 * Öncesi "Şube Değişiklikleri"ydi ve `urun_sube`nin SON DURUMUNU listeliyordu.
 * O bilgi artık Ürünler sayfasında şube seçilerek hem görülüyor hem
 * düzeltiliyor; ayrı bir ekranda tekrar etmesi kafa karıştırıyordu. Geriye
 * durumun cevaplayamadığı soru kaldı: ne zaman ve kimin eliyle oldu.
 *
 * GÜNLÜK 8 Eylül 2026'DA BAŞLADI: öncesinde hiçbir yerde aktör/zaman
 * tutulmuyordu, o dönemin değişiklikleri geri getirilemez.
 *
 * Süzme ve sayfalama SUNUCUDA — günlük sürekli büyüyen bir tablo.
 */
const ISLEMLER = [
    { key: '', ad: 'Tümü' },
    { key: 'mevcut_degil', ad: 'Mevcutluk' },
    { key: 'fiyat', ad: 'Şube fiyatı' },
    { key: 'etiket', ad: 'Şube etiketi' },
    { key: 'menuye_ekle', ad: 'Menüye ekleme' },
    { key: 'menuden_cikar', ad: 'Menüden çıkarma' },
];

const LIMIT = 50;

export default function MenuLogPage() {
    const [satirlar, setSatirlar] = useState([]);
    const [toplam, setToplam] = useState(0);
    const [sayfa, setSayfa] = useState(1);
    const [islem, setIslem] = useState('');
    const [sube, setSube] = useState('');
    const [q, setQ] = useState('');
    const [subeler, setSubeler] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/branches').then(({ data }) => setSubeler(data.subeler || [])).catch(() => {});
    }, []);

    // Şube adı sunucudan gelmiyor (menu_log'un subeler'e FK'si yok, kasıtlı);
    // çeviriyi elimizdeki listeyle burada yapıyoruz.
    const subeAdi = useMemo(() => {
        const m = new Map(subeler.map((s) => [s.slug, s.ad]));
        return (kod) => m.get(kod) || kod;
    }, [subeler]);

    const yukle = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/products/menu-log', {
                params: { islem: islem || undefined, sube: sube || undefined, q: q || undefined, sayfa, limit: LIMIT },
            });
            setSatirlar(data.satirlar || []);
            setToplam(data.toplam || 0);
        } catch { setSatirlar([]); setToplam(0); }
        setLoading(false);
    }, [islem, sube, q, sayfa]);

    // Arama yazarken her tuşta istek atmasın
    useEffect(() => { const t = setTimeout(yukle, q ? 400 : 0); return () => clearTimeout(t); }, [yukle, q]);
    // Süzgeç değişince ilk sayfaya dön — yoksa 7. sayfada boş liste görünür.
    const suzgecDegistir = (uygula) => { uygula(); setSayfa(1); };

    const sonSayfa = Math.max(1, Math.ceil(toplam / LIMIT));

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-3xl leading-none tracking-tight">Menü Günlüğü</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Şube menülerinde yapılan her değişiklik: kim, hangi şubede, neyi değiştirdi.
                    Menünün <em>şu anki</em> hâli için Ürünler sayfasından şubeyi seçin.
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1.5">
                    {ISLEMLER.map((t) => (
                        <button key={t.key} type="button" onClick={() => suzgecDegistir(() => setIslem(t.key))}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                islem === t.key ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                            }`}>
                            {t.ad}
                        </button>
                    ))}
                </div>

                <select value={sube} onChange={(e) => suzgecDegistir(() => setSube(e.target.value))}
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
                    <option value="">Tüm şubeler</option>
                    {subeler.map((s) => <option key={s.slug} value={s.slug}>{s.ad}</option>)}
                </select>

                <div className="relative min-w-0 flex-1 sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input value={q} onChange={(e) => suzgecDegistir(() => setQ(e.target.value))} placeholder="Ürün ara..." className="h-9 pl-8 pr-8 text-sm" />
                    {q && (
                        <button type="button" onClick={() => suzgecDegistir(() => setQ(''))} title="Temizle"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>

                <span className="text-xs text-muted-foreground tabular-nums">{toplam} kayıt</span>
            </div>

            {loading ? (
                <div className="flex flex-col items-center gap-3 py-16"><Spinner className="size-8" /></div>
            ) : satirlar.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
                    <History className="size-8" />
                    <p className="text-sm">Bu süzgeçle kayıt yok</p>
                    <p className="max-w-md text-xs">
                        Günlük tutulmaya yeni başlandı — 8 Eylül 2026 öncesindeki değişikliklerin
                        kaydı yok.
                    </p>
                </div>
            ) : (
                <>
                    <div className="rounded-lg border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-40">Zaman</TableHead>
                                    <TableHead className="w-56">Kim</TableHead>
                                    <TableHead className="w-40">Şube</TableHead>
                                    <TableHead>Ürün</TableHead>
                                    <TableHead>Değişiklik</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {satirlar.map((r) => (
                                    <TableRow key={r.id}>
                                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                                            {new Date(r.zaman).toLocaleString('tr-TR', {
                                                day: '2-digit', month: '2-digit', year: '2-digit',
                                                hour: '2-digit', minute: '2-digit',
                                            })}
                                        </TableCell>
                                        <TableCell className="max-w-[14rem]">
                                            <div className="truncate text-sm" title={r.kullanici}>{r.kullanici}</div>
                                            {/* Merkez, bir şube adına da işlem yapabiliyor — satırın
                                                "şube kararı mı, merkez müdahalesi mi" olduğu ancak
                                                rolden anlaşılır. */}
                                            {r.rol === 'admin' && (
                                                <span className="text-[11px] text-muted-foreground">merkez</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-sm font-medium">{subeAdi(r.subeKod)}</TableCell>
                                        <TableCell className="max-w-[20rem]">
                                            <div className="truncate text-sm" title={r.urunAd}>{r.urunAd || '—'}</div>
                                        </TableCell>
                                        <TableCell><Degisiklik satir={r} /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {sonSayfa > 1 && (
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-xs text-muted-foreground tabular-nums">
                                Sayfa {sayfa} / {sonSayfa}
                            </span>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" disabled={sayfa <= 1} onClick={() => setSayfa((p) => p - 1)}>Önceki</Button>
                                <Button variant="outline" size="sm" disabled={sayfa >= sonSayfa} onClick={() => setSayfa((p) => p + 1)}>Sonraki</Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

const etiketAdi = (k) => ETIKETLER.find((t) => t.key === k) || { ad: k, color: '#64748b' };

/**
 * Bir günlük satırının okunabilir özeti.
 *
 * "eski → yeni" biçimi türe göre değişiyor (boolean / sayı / dizi), o yüzden
 * tek bir metin şablonu yerine işlem başına küçük bir gösterim.
 */
function Degisiklik({ satir }) {
    const { islem, eski, yeni } = satir;

    if (islem === 'mevcut_degil') {
        const acildi = !!yeni?.mevcut;
        return (
            <Rozet renk={acildi ? 'yesil' : 'kirmizi'}>
                {acildi ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                {acildi ? 'Satışa açıldı' : 'Mevcut değil yapıldı'}
            </Rozet>
        );
    }

    if (islem === 'fiyat') {
        const oncekiFiyat = eski?.fiyat ?? eski?.merkez;
        const sonraki = yeni?.fiyat;
        return (
            <Rozet renk="sari">
                <Tag className="size-3" />
                {oncekiFiyat != null ? `${fiyatYaz(oncekiFiyat)} ₺` : '—'} →{' '}
                {/* Şube fiyatı temizlendiğinde satır merkez fiyatına döner;
                    "null" yazmak yerine dönülen fiyatı gösteriyoruz. */}
                {sonraki == null
                    ? `merkez${yeni?.merkez != null ? ` (${fiyatYaz(yeni.merkez)} ₺)` : ''}`
                    : `${fiyatYaz(sonraki)} ₺`}
            </Rozet>
        );
    }

    if (islem === 'etiket') {
        const oncekiEtiket = eski?.etiket || [];
        const sonrakiEtiket = yeni?.etiket || [];
        const eklenen = sonrakiEtiket.filter((k) => !oncekiEtiket.includes(k));
        const silinen = oncekiEtiket.filter((k) => !sonrakiEtiket.includes(k));
        return (
            <div className="flex flex-wrap items-center gap-1.5">
                {eklenen.length === 0 && silinen.length === 0 && (
                    <span className="text-xs text-muted-foreground">değişiklik yok</span>
                )}
                {eklenen.map((k) => {
                    const t = etiketAdi(k);
                    return (
                        <span key={`+${k}`} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{ background: t.color + '18', color: t.color }}>
                            <Tags className="size-3" /> +{t.ad}
                        </span>
                    );
                })}
                {silinen.map((k) => (
                    <span key={`-${k}`} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground line-through">
                        <Tags className="size-3" /> {etiketAdi(k).ad}
                    </span>
                ))}
            </div>
        );
    }

    if (islem === 'menuye_ekle') {
        return <Rozet renk="yesil"><ListPlus className="size-3" /> Menüye eklendi</Rozet>;
    }
    if (islem === 'menuden_cikar') {
        return <Rozet renk="kirmizi"><ListMinus className="size-3" /> Menüden çıkarıldı</Rozet>;
    }
    return <span className="text-xs text-muted-foreground">{islem}</span>;
}

const ROZET = {
    yesil: 'border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400',
    kirmizi: 'border-destructive/30 bg-destructive/5 text-destructive',
    sari: 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-500',
};

function Rozet({ renk, children }) {
    return (
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${ROZET[renk]}`}>
            {children}
        </span>
    );
}
