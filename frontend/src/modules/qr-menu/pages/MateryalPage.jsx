import { useState, useEffect } from 'react';
import {
    Upload, Download, Trash2, FileText, Image as ImageIcon, FileArchive,
    Palette, Package, Search, X,
} from 'lucide-react';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

/**
 * Kurumsal materyaller — merkez yükler, şube indirir.
 *
 * NEDEN AYRI EKRAN: medya kütüphanesi ürün görselleri için ve merkeze özel.
 * Buradaki dosyalar (logo, tabela görseli, sosyal medya şablonu, marka
 * kılavuzu) şubenin dışarıya kullandığı malzeme; izleyicisi farklı, ömrü
 * farklı.
 *
 * İNDİRME UCU ÜZERİNDEN: dosyalar R2'nin genel proxy'sinden servis edilmiyor
 * — o uç kimliksiz (QR menüsü oradan okuyor). Burada indirme `materyal.view`
 * arkasında ve anahtar sunucuda kayıttan okunuyor.
 */
const KATEGORI = {
    logo: { ad: 'Logo', Ikon: Palette, cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' },
    gorsel: { ad: 'Görsel', Ikon: ImageIcon, cls: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300' },
    sablon: { ad: 'Şablon', Ikon: Package, cls: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300' },
    dokuman: { ad: 'Doküman', Ikon: FileText, cls: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300' },
    diger: { ad: 'Diğer', Ikon: FileArchive, cls: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300' },
};
const KATEGORI_KEYS = Object.keys(KATEGORI);

const boyutYaz = (b) => (b >= 1024 * 1024
    ? `${(b / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(b / 1024))} KB`);

const tarihYaz = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return '—'; }
};

export default function MateryalPage() {
    const { can } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();
    const yonetebilir = can('materyal.manage');

    const [materyaller, setMateryaller] = useState([]);
    const [yukleniyor, setYukleniyor] = useState(true);
    const [arama, setArama] = useState('');
    const [kategoriFiltre, setKategoriFiltre] = useState('hepsi');
    const [ekleAcik, setEkleAcik] = useState(false);
    // İndirme sırasında hangi satırın beklediğini göstermek için: dosya
    // büyükse (50 MB'a kadar) tıklamadan sonra hiçbir şey olmuyormuş gibi
    // görünüyordu.
    const [inen, setInen] = useState(null);

    useEffect(() => { yukle(); }, []);

    async function yukle() {
        setYukleniyor(true);
        try {
            const { data } = await api.get('/materyal');
            setMateryaller(data.materyaller || []);
        } catch {
            toast.error('Materyaller yüklenemedi.');
        }
        setYukleniyor(false);
    }

    async function indir(m) {
        setInen(m.id);
        try {
            // Blob üzerinden: uç `Authorization` başlığı istiyor, düz bir
            // <a href> ile çağrılamıyor (tarayıcı başlık göndermez).
            const { data } = await api.get(`/materyal/${m.id}/indir`, { responseType: 'blob' });
            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = m.dosyaAdi || m.ad;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('Dosya indirilemedi.');
        }
        setInen(null);
    }

    async function sil(m) {
        const ok = await confirm(`"${m.ad}" kalıcı olarak silinsin mi? Şubeler artık indiremez.`);
        if (!ok) return;
        try {
            await api.delete(`/materyal/${m.id}`);
            toast.success('Materyal silindi.');
            yukle();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Silinemedi.');
        }
    }

    const q = arama.trim().toLocaleLowerCase('tr');
    const gorunen = materyaller
        .filter((m) => (kategoriFiltre === 'hepsi' ? true : m.kategori === kategoriFiltre))
        .filter((m) => (!q ? true
            : [m.ad, m.aciklama, m.dosyaAdi].some((x) => (x || '').toLocaleLowerCase('tr').includes(q))));

    const sayim = (k) => materyaller.filter((m) => m.kategori === k).length;

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-3xl leading-none tracking-tight">Kurumsal Materyaller</h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        {yonetebilir
                            ? 'Şubelerin indirebileceği logo, görsel ve şablonları buradan yayınlayın.'
                            : 'Merkezin paylaştığı logo, görsel ve şablonlar. İndirip kullanabilirsiniz.'}
                    </p>
                </div>
                {yonetebilir && (
                    <Button onClick={() => setEkleAcik(true)}>
                        <Upload className="size-4" /> Materyal Yükle
                    </Button>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full min-w-0 sm:w-auto sm:max-w-xs sm:flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input value={arama} onChange={(e) => setArama(e.target.value)}
                           placeholder="Materyal ara..." className="h-9 pl-8 pr-8 text-sm" />
                    {arama && (
                        <button type="button" onClick={() => setArama('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>
                <Cip aktif={kategoriFiltre === 'hepsi'} onClick={() => setKategoriFiltre('hepsi')}>
                    Tümü <span className="opacity-60">({materyaller.length})</span>
                </Cip>
                {KATEGORI_KEYS.map((k) => (
                    <Cip key={k} aktif={kategoriFiltre === k} onClick={() => setKategoriFiltre(k)}>
                        {KATEGORI[k].ad} <span className="opacity-60">({sayim(k)})</span>
                    </Cip>
                ))}
            </div>

            {yukleniyor ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                    <Spinner className="size-8" />
                    <p className="text-sm text-muted-foreground">Yükleniyor…</p>
                </div>
            ) : gorunen.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-muted-foreground">
                    <FileArchive className="size-10 opacity-40" />
                    <p>{materyaller.length === 0 ? 'Henüz materyal yüklenmedi' : 'Aramayla eşleşen materyal yok'}</p>
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {gorunen.map((m) => {
                        const kat = KATEGORI[m.kategori] || KATEGORI.diger;
                        return (
                            <div key={m.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                                <div className="flex items-start gap-3">
                                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                        <kat.Ikon className="size-5" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium text-foreground" title={m.ad}>{m.ad}</p>
                                        <p className="truncate text-xs text-muted-foreground" title={m.dosyaAdi}>
                                            {m.dosyaAdi} · {boyutYaz(m.boyut)}
                                        </p>
                                    </div>
                                </div>

                                {m.aciklama && (
                                    <p className="line-clamp-2 text-sm text-muted-foreground">{m.aciklama}</p>
                                )}

                                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                                    <Badge variant="outline" className={kat.cls}>{kat.ad}</Badge>
                                    <span className="text-xs text-muted-foreground">{tarihYaz(m.olusturmaZamani)}</span>
                                </div>

                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" className="h-10 flex-1 sm:h-9"
                                            disabled={inen === m.id} onClick={() => indir(m)}>
                                        {inen === m.id
                                            ? <><Spinner className="mr-2 size-4" /> İndiriliyor…</>
                                            : <><Download className="mr-2 size-4" /> İndir</>}
                                    </Button>
                                    {yonetebilir && (
                                        <Button variant="ghost" size="icon" className="size-10 shrink-0 text-muted-foreground hover:text-destructive sm:size-9"
                                                onClick={() => sil(m)} title="Sil">
                                            <Trash2 className="size-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {ekleAcik && (
                <MateryalYukle onKapat={() => setEkleAcik(false)}
                               onBitti={() => { setEkleAcik(false); yukle(); }} />
            )}
        </div>
    );
}

function Cip({ aktif, onClick, children }) {
    return (
        <button type="button" onClick={onClick}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    aktif ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                }`}>
            {children}
        </button>
    );
}

/** Merkez tarafı: dosya + künye. */
function MateryalYukle({ onKapat, onBitti }) {
    const toast = useToast();
    const [dosya, setDosya] = useState(null);
    const [ad, setAd] = useState('');
    const [kategori, setKategori] = useState('logo');
    const [aciklama, setAciklama] = useState('');
    const [gonderiliyor, setGonderiliyor] = useState(false);

    function dosyaSec(e) {
        const f = e.target.files?.[0];
        if (!f) return;
        setDosya(f);
        // Ad boşsa dosya adından öneri: çoğu yüklemede ikisi aynı olacak,
        // kullanıcıya iki kez yazdırmanın anlamı yok.
        if (!ad.trim()) setAd(f.name.replace(/\.[^.]+$/, ''));
    }

    async function gonder() {
        if (!dosya) { toast.error('Dosya seçin.'); return; }
        if (!ad.trim()) { toast.error('Materyal adı gerekli.'); return; }
        setGonderiliyor(true);
        try {
            const form = new FormData();
            form.append('dosya', dosya);
            form.append('ad', ad.trim());
            form.append('kategori', kategori);
            form.append('aciklama', aciklama.trim());
            await api.post('/materyal', form, { headers: { 'Content-Type': 'multipart/form-data' } });
            toast.success('Materyal yayınlandı.');
            onBitti();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Yüklenemedi.');
        }
        setGonderiliyor(false);
    }

    return (
        <Dialog open onOpenChange={(a) => !a && onKapat()}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="size-5" /> Materyal Yükle
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-3">
                    <input type="file" id="materyal-dosya" className="hidden" onChange={dosyaSec}
                           accept=".png,.jpg,.jpeg,.webp,.svg,.pdf,.zip,.ai,.eps,.docx,.pptx" />
                    {dosya ? (
                        <div className="flex items-center gap-3 rounded-lg border p-3">
                            <FileArchive className="size-5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-foreground">{dosya.name}</p>
                                <p className="text-xs text-muted-foreground">{boyutYaz(dosya.size)}</p>
                            </div>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setDosya(null)}>Kaldır</Button>
                        </div>
                    ) : (
                        <Button asChild type="button" variant="outline" className="h-12">
                            <label htmlFor="materyal-dosya" className="cursor-pointer">
                                <Upload className="mr-2 size-4" /> Dosya seç
                            </label>
                        </Button>
                    )}
                    <p className="text-xs text-muted-foreground">
                        PNG, JPG, WebP, SVG, PDF, ZIP, AI/EPS, DOCX, PPTX · en fazla 50 MB
                    </p>

                    <div className="space-y-1.5">
                        <Label>Materyal adı *</Label>
                        <Input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="örn: Yatay Logo (PNG)" />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Kategori</Label>
                        <Select value={kategori} onValueChange={setKategori}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {KATEGORI_KEYS.map((k) => (
                                    <SelectItem key={k} value={k}>{KATEGORI[k].ad}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Açıklama</Label>
                        <Textarea rows={2} value={aciklama} onChange={(e) => setAciklama(e.target.value)}
                                  placeholder="Nerede kullanılacağı, ölçü notu…" />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onKapat}>Vazgeç</Button>
                    <Button onClick={gonder} disabled={gonderiliyor}>
                        {gonderiliyor ? 'Yükleniyor…' : 'Yayınla'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
