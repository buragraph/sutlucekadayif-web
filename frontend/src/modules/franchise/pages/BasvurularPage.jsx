import { useState, useEffect, useCallback } from 'react';
import api from '../../../services/api';
import { Mail, Phone, MapPin, Trash2, Inbox } from 'lucide-react';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

// Durum meta — etiket + rozet rengi (permissions/route ile aynı anahtarlar)
const DURUM = {
    yeni: { label: 'Yeni', cls: 'border-blue-200 bg-blue-50 text-blue-700' },
    inceleniyor: { label: 'İnceleniyor', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
    gorusuldu: { label: 'Görüşüldü', cls: 'border-purple-200 bg-purple-50 text-purple-700' },
    olumlu: { label: 'Olumlu', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    olumsuz: { label: 'Olumsuz', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
};
const DURUM_KEYS = Object.keys(DURUM);

function tarihTR(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

export default function BasvurularPage() {
    const toast = useToast();
    const confirm = useConfirm();
    const [basvurular, setBasvurular] = useState([]);
    const [sayac, setSayac] = useState({});
    const [loading, setLoading] = useState(true);
    const [filtre, setFiltre] = useState('hepsi');
    const [secili, setSecili] = useState(null); // detay modalındaki başvuru
    const [not, setNot] = useState('');
    const [saving, setSaving] = useState(false);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, []);

    async function load() {
        setLoading(true);
        try {
            const { data } = await api.get('/basvurular');
            setBasvurular(data.basvurular || []);
            setSayac(data.sayac || {});
        } catch (err) {
            console.error('Başvurular yüklenemedi:', err);
            toast.error('Başvurular yüklenemedi');
        }
        setLoading(false);
    }

    async function durumGuncelle(id, durum) {
        // İyimser güncelleme — hata olursa geri al
        const onceki = basvurular;
        const yeni = basvurular.map((b) => (b.id === id ? { ...b, durum } : b));
        setBasvurular(yeni);
        setSayac(hesaplaSayac(yeni));
        setSecili((s) => (s && s.id === id ? { ...s, durum } : s));
        try {
            await api.patch(`/basvurular/${id}`, { durum });
        } catch (err) {
            console.error(err);
            toast.error('Durum güncellenemedi');
            setBasvurular(onceki);
            setSayac(hesaplaSayac(onceki));
        }
    }

    function hesaplaSayac(list) {
        const s = Object.fromEntries(DURUM_KEYS.map((k) => [k, 0]));
        for (const b of list) if (b.durum in s) s[b.durum] += 1;
        return s;
    }

    async function notKaydet() {
        if (!secili) return;
        setSaving(true);
        try {
            await api.patch(`/basvurular/${secili.id}`, { not });
            setBasvurular((list) => list.map((b) => (b.id === secili.id ? { ...b, not } : b)));
            toast.success('Not kaydedildi');
            setSecili(null);
        } catch (err) {
            console.error(err);
            toast.error('Not kaydedilemedi');
        }
        setSaving(false);
    }

    async function sil(b) {
        const ok = await confirm(
            `${b.ad} ${b.soyad} adlı başvuru kalıcı olarak silinecek. Bu işlem geri alınamaz.`
        );
        if (!ok) return;
        try {
            await api.delete(`/basvurular/${b.id}`);
            const kalan = basvurular.filter((x) => x.id !== b.id);
            setBasvurular(kalan);
            setSayac(hesaplaSayac(kalan));
            if (secili?.id === b.id) setSecili(null);
            toast.success('Başvuru silindi');
        } catch (err) {
            console.error(err);
            toast.error('Başvuru silinemedi');
        }
    }

    function detayAc(b) {
        setSecili(b);
        setNot(b.not || '');
    }

    const gosterilen = filtre === 'hepsi' ? basvurular : basvurular.filter((b) => b.durum === filtre);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl leading-none tracking-tight">Franchise Başvuruları</h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        Siteden gelen franchise talepleri
                    </p>
                </div>
            </div>

            {/* Durum filtre çipleri */}
            <div className="flex flex-wrap gap-2">
                <FilterChip active={filtre === 'hepsi'} onClick={() => setFiltre('hepsi')}>
                    Tümü <span className="opacity-60">({basvurular.length})</span>
                </FilterChip>
                {DURUM_KEYS.map((k) => (
                    <FilterChip key={k} active={filtre === k} onClick={() => setFiltre(k)}>
                        {DURUM[k].label} <span className="opacity-60">({sayac[k] ?? 0})</span>
                    </FilterChip>
                ))}
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                    <Spinner className="size-8" />
                    <p className="text-sm text-muted-foreground">Başvurular yükleniyor...</p>
                </div>
            ) : gosterilen.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                    <Inbox className="size-10 opacity-50" />
                    <p>{filtre === 'hepsi' ? 'Henüz başvuru yok' : 'Bu durumda başvuru yok'}</p>
                </div>
            ) : (
                <div className="rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Ad Soyad</TableHead>
                                <TableHead>İletişim</TableHead>
                                <TableHead>Konum</TableHead>
                                <TableHead>Tarih</TableHead>
                                <TableHead className="w-40">Durum</TableHead>
                                <TableHead className="w-20"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {gosterilen.map((b) => (
                                <TableRow
                                    key={b.id}
                                    className="cursor-pointer"
                                    onClick={() => detayAc(b)}
                                >
                                    <TableCell className="font-medium">
                                        {b.ad} {b.soyad}
                                        {b.mesaj && (
                                            <span className="ml-2 text-xs text-muted-foreground">✉︎ mesaj var</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                            <Mail className="size-3.5" /> {b.email}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                            <Phone className="size-3.5" /> {b.telefon}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {b.il}{b.ilce ? ` / ${b.ilce}` : ''}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                        {tarihTR(b.olusturmaZamani)}
                                    </TableCell>
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                        <Select value={b.durum} onValueChange={(v) => durumGuncelle(b.id, v)}>
                                            <SelectTrigger className="h-8 w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {DURUM_KEYS.map((k) => (
                                                    <SelectItem key={k} value={k}>{DURUM[k].label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                        <Button
                                            variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-rose-600"
                                            onClick={() => sil(b)} title="Sil"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* Detay modalı */}
            <Dialog open={!!secili} onOpenChange={(o) => !o && setSecili(null)}>
                <DialogContent className="sm:max-w-lg">
                    {secili && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    {secili.ad} {secili.soyad}
                                    <Badge variant="outline" className={DURUM[secili.durum]?.cls}>
                                        {DURUM[secili.durum]?.label ?? secili.durum}
                                    </Badge>
                                </DialogTitle>
                            </DialogHeader>

                            <div className="space-y-3 text-sm">
                                <a href={`mailto:${secili.email}`} className="flex items-center gap-2 hover:text-primary">
                                    <Mail className="size-4 text-muted-foreground" /> {secili.email}
                                </a>
                                <a href={`tel:${secili.telefon}`} className="flex items-center gap-2 hover:text-primary">
                                    <Phone className="size-4 text-muted-foreground" /> {secili.telefon}
                                </a>
                                <div className="flex items-center gap-2">
                                    <MapPin className="size-4 text-muted-foreground" />
                                    {secili.il}{secili.ilce ? ` / ${secili.ilce}` : ''}
                                </div>
                                <p className="text-xs text-muted-foreground">{tarihTR(secili.olusturmaZamani)}</p>

                                {secili.mesaj && (
                                    <div className="rounded-lg border bg-muted/40 p-3">
                                        <p className="mb-1 text-xs font-medium text-muted-foreground">Mesaj</p>
                                        <p className="whitespace-pre-wrap">{secili.mesaj}</p>
                                    </div>
                                )}

                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Durum</label>
                                    <Select value={secili.durum} onValueChange={(v) => durumGuncelle(secili.id, v)}>
                                        <SelectTrigger className="h-9 w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {DURUM_KEYS.map((k) => (
                                                <SelectItem key={k} value={k}>{DURUM[k].label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Dahili not</label>
                                    <Textarea
                                        rows={3}
                                        value={not}
                                        onChange={(e) => setNot(e.target.value)}
                                        placeholder="Bu başvuruyla ilgili notlarınız (yalnızca ekip görür)"
                                    />
                                </div>
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setSecili(null)}>Kapat</Button>
                                <Button onClick={notKaydet} disabled={saving}>
                                    {saving ? 'Kaydediliyor...' : 'Notu Kaydet'}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function FilterChip({ active, onClick, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
            }`}
        >
            {children}
        </button>
    );
}
