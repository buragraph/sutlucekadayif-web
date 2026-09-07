import { useState, useEffect, useCallback } from 'react';
import { Store, Search, X, EyeOff, Tag, Tags, TriangleAlert } from 'lucide-react';
import api from '../../../services/api';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';
import { ETIKETLER } from '../constants/etiketler';
import { fiyatYaz } from '../utils/fiyat';

/**
 * Şube Değişiklikleri — merkez denetimi.
 *
 * Şubenin merkez kaydından saptığı üç şey `urun_sube` satırında duruyor ve
 * ürün listesinde görünmüyordu: "mevcut değil" işareti, şubenin kendi
 * etiketleri, şube fiyatı. Merkez "hangi şube neyi kapatmış / neye rozet
 * vermiş" sorusunu ancak şube şube gezerek cevaplayabiliyordu.
 *
 * Süzme ve sayfalama SUNUCUDA: 2400+ sapma satırı var, tamamını çekip
 * istemcide süzmek hem yavaş hem PostgREST'in 1000 satır sınırına takılır.
 */
const TURLER = [
    { key: '', ad: 'Tümü' },
    { key: 'mevcut_degil', ad: 'Mevcut değil' },
    { key: 'etiket', ad: 'Şube etiketi' },
    { key: 'fiyat', ad: 'Şube fiyatı' },
];

export default function SubeSapmalariPage() {
    const [satirlar, setSatirlar] = useState([]);
    const [toplam, setToplam] = useState(0);
    const [sayfa, setSayfa] = useState(1);
    const [tur, setTur] = useState('');
    const [sube, setSube] = useState('');
    const [q, setQ] = useState('');
    const [subeler, setSubeler] = useState([]);
    const [loading, setLoading] = useState(true);
    const [gorunum, setGorunum] = useState('urun');      // 'urun' | 'sube' | 'liste'
    const [ozet, setOzet] = useState(null);
    const [ozetYukleniyor, setOzetYukleniyor] = useState(true);
    const LIMIT = 50;

    useEffect(() => {
        api.get('/branches').then(({ data }) => setSubeler(data.subeler || [])).catch(() => {});
        api.get('/products/sube-sapmalari/ozet')
            .then(({ data }) => setOzet(data))
            .catch(() => setOzet(null))
            .finally(() => setOzetYukleniyor(false));
    }, []);

    const yukle = useCallback(async () => {
        if (gorunum !== 'liste') return;          // özet sekmelerinde satır listesi gereksiz
        setLoading(true);
        try {
            const { data } = await api.get('/products/sube-sapmalari', {
                params: { tur: tur || undefined, sube: sube || undefined, q: q || undefined, sayfa, limit: LIMIT },
            });
            setSatirlar(data.satirlar || []);
            setToplam(data.toplam || 0);
        } catch { setSatirlar([]); setToplam(0); }
        setLoading(false);
    }, [tur, sube, q, sayfa, gorunum]);

    // Arama yazarken her tuşta istek atmasın
    useEffect(() => { const t = setTimeout(yukle, q ? 400 : 0); return () => clearTimeout(t); }, [yukle, q]);
    // Süzgeç değişince ilk sayfaya dön — yoksa 7. sayfada boş liste görünür.
    // Efekt yerine tek bir yardımcıda: efektten setState zincirleme render tetikliyor.
    const suzgecDegistir = (uygula) => { uygula(); setSayfa(1); };

    const sonSayfa = Math.max(1, Math.ceil(toplam / LIMIT));
    const etiketAdi = (k) => ETIKETLER.find((t) => t.key === k) || { ad: k, color: '#64748b', emoji: '' };

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-3xl leading-none tracking-tight">Şube Değişiklikleri</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Şubelerin kendi menülerinde yaptığı değişiklikler: kapattıkları ürünler,
                    verdikleri etiketler ve girdikleri fiyatlar.
                </p>
            </div>

            {/* Görünüm seçimi. Düz liste tek başına "ne oldu" sorusunu
                cevaplamıyordu: 2.400 satır kaydırılıyor ama hangi ürünün
                fiilen öldüğü, hangi şubenin aykırı olduğu görünmüyordu. */}
            <div className="flex flex-wrap gap-1.5">
                {[
                    { key: 'urun', ad: 'Ürüne göre', ipucu: 'Hangi ürün kaç şubede kapalı' },
                    { key: 'sube', ad: 'Şubeye göre', ipucu: 'Hangi şube menüsünün ne kadarını kapatmış' },
                    { key: 'liste', ad: 'Tek tek', ipucu: 'Ham kayıt listesi' },
                ].map((g) => (
                    <button key={g.key} type="button" title={g.ipucu} onClick={() => setGorunum(g.key)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                            gorunum === g.key ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                        }`}>
                        {g.ad}
                    </button>
                ))}
            </div>

            {gorunum !== 'liste' && (ozetYukleniyor ? (
                <div className="flex justify-center py-16"><Spinner className="size-8" /></div>
            ) : !ozet ? (
                <p className="py-16 text-center text-sm text-muted-foreground">Özet yüklenemedi</p>
            ) : gorunum === 'urun' ? (
                <UrunOzeti ozet={ozet} />
            ) : (
                <SubeOzeti ozet={ozet} />
            ))}

            {gorunum === 'liste' && (
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1.5">
                    {TURLER.map((t) => (
                        <button key={t.key} type="button" onClick={() => suzgecDegistir(() => setTur(t.key))}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                tur === t.key ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/70'
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
            )}

            {gorunum === 'liste' && (loading ? (
                <div className="flex flex-col items-center gap-3 py-16"><Spinner className="size-8" /></div>
            ) : satirlar.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                    <Store className="size-8" /><p className="text-sm">Bu süzgeçle değişiklik yok</p>
                </div>
            ) : (
                <>
                    <div className="rounded-lg border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Şube</TableHead>
                                    <TableHead>Ürün</TableHead>
                                    <TableHead>Değişiklik</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {satirlar.map((r) => (
                                    <TableRow key={`${r.subeKod}|${r.urunId}`}>
                                        <TableCell className="whitespace-nowrap text-sm font-medium">{r.subeAd}</TableCell>
                                        <TableCell className="max-w-[24rem]">
                                            <div className="truncate text-sm" title={r.urunAd}>{r.urunAd}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {r.mevcutDegil && (
                                                    <Badge variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive">
                                                        <EyeOff className="mr-1 size-3" /> Mevcut değil
                                                    </Badge>
                                                )}
                                                {r.subeFiyat != null && (
                                                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                                                        <Tag className="mr-1 size-3" />
                                                        {fiyatYaz(r.merkezFiyat)} → {fiyatYaz(r.subeFiyat)} ₺
                                                    </Badge>
                                                )}
                                                {r.etiket.map((k) => {
                                                    const t = etiketAdi(k);
                                                    return (
                                                        <span key={k} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                                                            style={{ background: t.color + '18', color: t.color }}>
                                                            <Tags className="size-3" /> {t.ad}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </TableCell>
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
            ))}
        </div>
    );
}

/** A) Ürüne göre — "88 şubede menüde, 88'inde kapalı" gibi ölü ürünleri açığa çıkarır. */
function UrunOzeti({ ozet }) {
    const satirlar = ozet.urunler;
    const olu = satirlar.filter((u) => u.tamamenKapali);
    return (
        <div className="space-y-3">
            {olu.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    <span>
                        <strong>{olu.length} ürün</strong> menüde olduğu <em>her</em> şubede kapalı
                        — bunlar şube kararı değil, fiilen satılmayan ürünler. Katalogdan
                        kaldırmak ya da menülerden çıkarmak gerekebilir.
                    </span>
                </div>
            )}
            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Ürün</TableHead>
                            <TableHead className="w-[38%]">Kapalı olduğu şubeler</TableHead>
                            <TableHead className="whitespace-nowrap">Şube fiyatı</TableHead>
                            <TableHead className="whitespace-nowrap">Şube etiketi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {satirlar.map((u) => (
                            <TableRow key={u.urunId} className={u.tamamenKapali ? 'bg-destructive/5' : ''}>
                                <TableCell className="max-w-[22rem]">
                                    <div className="truncate text-sm font-medium" title={u.ad}>{u.ad}</div>
                                </TableCell>
                                <TableCell>
                                    {u.kapali > 0 ? (
                                        <div className="flex items-center gap-2">
                                            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                                                <div className={u.tamamenKapali ? 'h-full bg-destructive' : 'h-full bg-amber-500'}
                                                     style={{ width: `${Math.min(100, (u.kapali / Math.max(u.menude, 1)) * 100)}%` }} />
                                            </div>
                                            <span className="text-xs tabular-nums text-muted-foreground">
                                                {u.kapali} / {u.menude}
                                            </span>
                                            {u.tamamenKapali && (
                                                <Badge variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive">
                                                    hiçbir şubede satılmıyor
                                                </Badge>
                                            )}
                                        </div>
                                    ) : <span className="text-xs text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell className="text-xs tabular-nums text-muted-foreground">
                                    {u.fiyatli || '—'}
                                </TableCell>
                                <TableCell className="text-xs tabular-nums text-muted-foreground">
                                    {u.etiketli || '—'}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

/** B) Şubeye göre — oran ham sayıdan anlamlı; ortalamayla kıyaslanır. */
function SubeOzeti({ ozet }) {
    const ort = ozet.ortalamaKapaliOran;
    const yuzde = (o) => `%${(o * 100).toFixed(0)}`;
    return (
        <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
                Şubelerin menülerinin ortalama <strong>{yuzde(ort)}</strong>’i kapalı.
                Bu oranın belirgin üstündeki şubeler işaretli — menüsü hiç kurulmamış ya da
                fiilen kapanmış olabilir.
            </p>
            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Şube</TableHead>
                            <TableHead className="w-[38%]">Menüsünde kapalı</TableHead>
                            <TableHead className="whitespace-nowrap">Şube fiyatı</TableHead>
                            <TableHead className="whitespace-nowrap">Şube etiketi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {ozet.subeler.map((s) => {
                            // Ortalamanın 1,5 katı: rastgele dalgalanma değil, bakılası fark.
                            const aykiri = s.kapaliOran > ort * 1.5 && s.kapali > 0;
                            return (
                                <TableRow key={s.subeKod} className={aykiri ? 'bg-amber-500/5' : ''}>
                                    <TableCell className="whitespace-nowrap text-sm font-medium">
                                        <div className="flex items-center gap-2">
                                            {s.ad}
                                            {s.kapanmaTarihi && (
                                                <Badge variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive">
                                                    Kapalı şube
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                                                <div className={aykiri ? 'h-full bg-amber-500' : 'h-full bg-foreground/40'}
                                                     style={{ width: `${Math.min(100, s.kapaliOran * 100)}%` }} />
                                            </div>
                                            <span className="text-xs tabular-nums text-muted-foreground">
                                                {yuzde(s.kapaliOran)} · {s.kapali}/{s.menude}
                                            </span>
                                            {aykiri && (
                                                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                                                    ortalamanın üstünde
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs tabular-nums text-muted-foreground">{s.fiyatli || '—'}</TableCell>
                                    <TableCell className="text-xs tabular-nums text-muted-foreground">{s.etiketli || '—'}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
