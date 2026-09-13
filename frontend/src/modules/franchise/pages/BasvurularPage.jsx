import { useState, useEffect, useCallback } from 'react';
import api from '../../../services/api';
import { Mail, Phone, MapPin, Trash2, Inbox, Settings2, Search, X, Plus, Globe, PhoneCall } from 'lucide-react';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ilIlceData from '../../../data/tr-iller-ilceler.json';

// Durum meta — etiket + rozet rengi (permissions/route ile aynı anahtarlar)
const DURUM = {
    yeni: { label: 'Yeni', cls: 'border-blue-200 bg-blue-50 text-blue-700', satir: 'bg-blue-50/40 hover:bg-blue-50/70 dark:bg-blue-950/20 dark:hover:bg-blue-950/30' },
    inceleniyor: { label: 'İnceleniyor', cls: 'border-amber-200 bg-amber-50 text-amber-700', satir: 'bg-amber-50/40 hover:bg-amber-50/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/30' },
    gorusuldu: { label: 'Görüşüldü', cls: 'border-purple-200 bg-purple-50 text-purple-700', satir: 'bg-purple-50/40 hover:bg-purple-50/70 dark:bg-purple-950/20 dark:hover:bg-purple-950/30' },
    olumlu: { label: 'Olumlu', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', satir: 'bg-emerald-50/50 hover:bg-emerald-50/80 dark:bg-emerald-950/25 dark:hover:bg-emerald-950/40' },
    // Olumsuz kayıt SOLUK: liste açık talepler için taranıyor, kapanmış olan
    // göz akışını bölmemeli. Rengi var ama öne çıkmıyor.
    olumsuz: { label: 'Olumsuz', cls: 'border-rose-200 bg-rose-50 text-rose-700', satir: 'bg-rose-50/30 opacity-70 hover:opacity-100 hover:bg-rose-50/60 dark:bg-rose-950/15 dark:hover:bg-rose-950/30' },
};
const DURUM_KEYS = Object.keys(DURUM);

/**
 * Başvurunun geliş kanalı. Telefonla arayanın kaydını merkez panelden
 * giriyor; iki kanal aynı listede ama karıştırılmamalı — web başvurusunda
 * kişi formu kendi doldurmuş, telefonda ise bilgiyi not alan kişi yazmış.
 */
const KAYNAK = {
    web: { label: 'Web', Ikon: Globe, cls: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300' },
    telefon: { label: 'Telefon', Ikon: PhoneCall, cls: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300' },
};

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
    const [kaynakFiltre, setKaynakFiltre] = useState('hepsi');   // 'hepsi' | 'web' | 'telefon'
    const [elleAcik, setElleAcik] = useState(false);
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

    const kaynakli = kaynakFiltre === 'hepsi'
        ? basvurular
        : basvurular.filter((b) => (b.kaynak || 'web') === kaynakFiltre);
    const gosterilen = filtre === 'hepsi' ? kaynakli : kaynakli.filter((b) => b.durum === filtre);
    const kaynakSayim = (k) => basvurular.filter((b) => (b.kaynak || 'web') === k).length;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl leading-none tracking-tight">Franchise Başvuruları</h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        Siteden ve telefonla gelen franchise talepleri
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={() => setElleAcik(true)}>
                        <Plus className="size-4" /> Telefon Başvurusu
                    </Button>
                    <FormAyarlari />
                </div>
            </div>

            {/* KANAL ŞERİDİ DURUMDAN AYRI SATIRDA: ikisi aynı satıra dizilince
                sekiz çip yan yana geliyor ve hangisinin neyi süzdüğü karışıyor. */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Kanal:</span>
                <FilterChip active={kaynakFiltre === 'hepsi'} onClick={() => setKaynakFiltre('hepsi')}>
                    Tümü <span className="opacity-60">({basvurular.length})</span>
                </FilterChip>
                {Object.entries(KAYNAK).map(([k, m]) => (
                    <FilterChip key={k} active={kaynakFiltre === k} onClick={() => setKaynakFiltre(k)}>
                        {m.label} <span className="opacity-60">({kaynakSayim(k)})</span>
                    </FilterChip>
                ))}
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
                                <TableHead className="w-24">Kanal</TableHead>
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
                                    /* SATIR RENGİ DURUMDAN: rozet tek başına
                                       yetmiyordu — 30 satırlık listede hangi
                                       talebin hangi aşamada olduğu ancak
                                       satır satır okunarak anlaşılıyordu.
                                       Renk soluk tutuldu; tablo alacalı bir
                                       şeye dönüşmesin, sadece gruplansın. */
                                    className={`cursor-pointer transition-colors ${(DURUM[b.durum] || {}).satir || ''}`}
                                    onClick={() => detayAc(b)}
                                >
                                    <TableCell className="font-medium">
                                        {b.ad} {b.soyad}
                                        {b.mesaj && (
                                            <span className="ml-2 text-xs text-muted-foreground">✉︎ mesaj var</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {(() => {
                                            const m = KAYNAK[b.kaynak || 'web'];
                                            return (
                                                <Badge variant="outline" className={`gap-1 ${m.cls}`}>
                                                    <m.Ikon className="size-3" /> {m.label}
                                                </Badge>
                                            );
                                        })()}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        {/* Telefon başvurusunda e-posta çoğu zaman yok:
                                            zorunlu tutmak uydurma adres girdiriyordu. */}
                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                            <Mail className="size-3.5" /> {b.email || '—'}
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

            {elleAcik && (
                <TelefonBasvurusu
                    onKapat={() => setElleAcik(false)}
                    onKaydedildi={() => { setElleAcik(false); load(); }}
                />
            )}
        </div>
    );
}

/**
 * Telefonla gelen başvurunun panelden kaydı.
 *
 * ZORUNLU ALANLAR AZ: ad, telefon, il. Web formunda e-posta ve soyad da
 * zorunlu ama telefonda konuşurken çoğu kişi e-posta bırakmıyor; zorunlu
 * tutmak uydurma adres girilmesine yol açıyor. Kaydın değeri numarada.
 */
function TelefonBasvurusu({ onKapat, onKaydedildi }) {
    const toast = useToast();
    const [form, setForm] = useState({ ad: '', soyad: '', telefon: '', email: '', il: '', ilce: '', mesaj: '' });
    const [kaydediliyor, setKaydediliyor] = useState(false);

    const ilceler = form.il ? (ilIlceData[form.il] || []) : [];

    async function kaydet() {
        if (!form.ad.trim() || !form.telefon.trim() || !form.il) {
            toast.error('Ad, telefon ve il zorunlu.');
            return;
        }
        setKaydediliyor(true);
        try {
            await api.post('/basvurular/elle', form);
            toast.success('Başvuru kaydedildi.');
            onKaydedildi();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Başvuru kaydedilemedi.');
        }
        setKaydediliyor(false);
    }

    return (
        <Dialog open onOpenChange={(a) => !a && onKapat()}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <PhoneCall className="size-5" /> Telefon Başvurusu
                    </DialogTitle>
                </DialogHeader>

                <p className="text-sm text-muted-foreground">
                    Merkezi arayan kişinin talebini buraya kaydedin. Kayıt listede
                    “Telefon” kanalıyla görünür.
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label>Ad *</Label>
                        <Input value={form.ad} onChange={(e) => setForm({ ...form, ad: e.target.value })} autoFocus />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Soyad</Label>
                        <Input value={form.soyad} onChange={(e) => setForm({ ...form, soyad: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Telefon *</Label>
                        <Input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })}
                               placeholder="05xx xxx xx xx" />
                    </div>
                    <div className="space-y-1.5">
                        <Label>E-posta</Label>
                        <Input type="email" value={form.email}
                               onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="opsiyonel" />
                    </div>
                    <div className="space-y-1.5">
                        <Label>İl *</Label>
                        <Select value={form.il} onValueChange={(v) => setForm({ ...form, il: v, ilce: '' })}>
                            <SelectTrigger><SelectValue placeholder="Seçiniz" /></SelectTrigger>
                            <SelectContent>
                                {TUM_ILLER.map((il) => <SelectItem key={il} value={il}>{il}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label>İlçe</Label>
                        <Select value={form.ilce} onValueChange={(v) => setForm({ ...form, ilce: v })} disabled={!form.il}>
                            <SelectTrigger><SelectValue placeholder={form.il ? 'Seçiniz' : 'Önce il'} /></SelectTrigger>
                            <SelectContent>
                                {ilceler.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                        <Label>Görüşme notu</Label>
                        <Textarea rows={3} value={form.mesaj}
                                  onChange={(e) => setForm({ ...form, mesaj: e.target.value })}
                                  placeholder="Ne konuşuldu, ne istiyor?" />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onKapat}>Vazgeç</Button>
                    <Button onClick={kaydet} disabled={kaydediliyor}>
                        {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
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

/**
 * Hangi illerin franchise başvurusuna açık olduğu.
 *
 * NEDEN PANELDE: tanıtım sitesi STATİK (Astro). Doygun bir bölgeyi — ör.
 * İstanbul — açılır listeden çıkarmak kodu değiştirip yeniden yayınlamak
 * demekti. Ayar artık veritabanında; site sayfa açılışında okuyup listeyi
 * süzüyor, bir ili kapatmak yayın işi olmaktan çıktı.
 *
 * KAPALI LİSTE TUTULUYOR, AÇIK LİSTE DEĞİL: 81 il varsayılan olarak açık,
 * merkez yalnızca kapattığını işaretliyor. Açık liste tutulsaydı bir kez eksik
 * yazıldığında iller sessizce kapanırdı.
 *
 * SUNUCU DA AYNI LİSTEYİ OKUYOR: kapalı ilden gelen başvuru reddediliyor —
 * eski bir sekme ya da önbellekteki sayfa tek savunma olarak istemciye
 * güvenilemeyeceğini gösteriyor.
 */
const TUM_ILLER = Object.keys(ilIlceData).sort((a, b) => a.localeCompare(b, 'tr'));

function FormAyarlari() {
    const toast = useToast();
    const [kapali, setKapali] = useState(null);   // null = henüz okunmadı
    const [acik, setAcik] = useState(false);
    const [arama, setArama] = useState('');
    const [kaydediliyor, setKaydediliyor] = useState(false);

    // İl → o ilde şubesi olan şirketler. Kapatma kararı "orada kim işletiyor"
    // bilgisi olmadan verilemiyordu: merkez ili kapatırken hangi şirketin
    // bölgesine dokunduğunu görmeli. Şubelerden TÜRETİLİYOR; ayrı bir
    // "il şu şirkete ait" tablosu tutmak ikinci bir doğruluk kaynağı olurdu.
    const [ilSirket, setIlSirket] = useState({});

    useEffect(() => {
        let iptal = false;
        api.get('/basvurular/form-ayarlari')
            .then(({ data }) => { if (!iptal) setKapali(data?.kapaliIller || []); })
            .catch(() => { if (!iptal) setKapali([]); })
        // Şube listesi ikincil: gelmezse iller tek grupta kalır, kapatma çalışır.
        api.get('/branches')
            .then(({ data }) => {
                if (iptal) return;
                const harita = {};
                for (const sube of data.subeler || []) {
                    if (!sube.il || !sube.sirket) continue;
                    (harita[sube.il] = harita[sube.il] || new Set()).add(sube.sirket);
                }
                setIlSirket(Object.fromEntries(Object.entries(harita).map(([il, k]) => [il, [...k]])));
            })
            .catch(() => {});
        return () => { iptal = true; };
    }, []);

    async function kaydet(yeniListe) {
        const onceki = kapali;
        setKapali(yeniListe);   // iyimser: kutucuk anında dolsun
        setKaydediliyor(true);
        try {
            await api.put('/basvurular/form-ayarlari', { kapaliIller: yeniListe });
        } catch (err) {
            console.error(err);
            setKapali(onceki);
            toast.error('Ayar kaydedilemedi');
        }
        setKaydediliyor(false);
    }

    if (!kapali) return null;

    const kapaliSet = new Set(kapali);
    const q = arama.trim().toLocaleLowerCase('tr');
    const gorunen = q ? TUM_ILLER.filter((il) => il.toLocaleLowerCase('tr').includes(q)) : TUM_ILLER;

    // Gruplar: iki şirketin de şubesi olan il "her ikisi" altında — orayı
    // kapatmak iki şirketi birden etkiliyor, ayrı görünmesi gerekiyor.
    const grupAnahtari = (il) => {
        const k = ilSirket[il] || [];
        if (k.length === 0) return 'yok';
        if (k.length > 1) return 'ikisi';
        return k[0];
    };
    const GRUPLAR = [
        { key: 'ums', baslik: 'UMS bölgesi' },
        { key: 'beylikduzu', baslik: 'Beylikdüzü bölgesi' },
        { key: 'ikisi', baslik: 'Her iki şirket' },
        { key: 'yok', baslik: 'Şube yok' },
    ];
    const gruplu = GRUPLAR
        .map((g) => ({ ...g, iller: gorunen.filter((il) => grupAnahtari(il) === g.key) }))
        .filter((g) => g.iller.length > 0);

    const degistir = (il, kapat) => kaydet(
        kapat ? [...kapali, il].sort((a, b) => a.localeCompare(b, 'tr'))
              : kapali.filter((x) => x !== il)
    );

    return (
        <>
            <Button variant="outline" onClick={() => setAcik(true)}>
                <Settings2 className="size-4" />
                Başvuruya açık iller
                <Badge variant={kapali.length ? 'secondary' : 'outline'} className="ml-1">
                    {TUM_ILLER.length - kapali.length} / {TUM_ILLER.length}
                </Badge>
            </Button>

            <Dialog open={acik} onOpenChange={(a) => { if (!a) { setAcik(false); setArama(''); } }}>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Başvuruya açık iller</DialogTitle>
                    </DialogHeader>

                    <p className="text-sm text-muted-foreground">
                        İşareti kaldırdığınız il, sitedeki başvuru formunun il listesinde
                        görünmez ve o ilden gelen başvuru kabul edilmez. Değişiklik anında
                        geçerli olur, site yeniden yayınlanmaz.
                    </p>

                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={arama}
                            onChange={(e) => setArama(e.target.value)}
                            placeholder="İl ara..."
                            className="h-9 pl-8 pr-8 text-sm"
                        />
                        {arama && (
                            <button type="button" onClick={() => setArama('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                <X className="size-3.5" />
                            </button>
                        )}
                    </div>

                    {kapali.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed p-2.5">
                            <span className="text-xs font-medium text-muted-foreground">Kapalı:</span>
                            {kapali.map((il) => (
                                <Badge key={il} variant="secondary" className="gap-1">
                                    {il}
                                    <button type="button" onClick={() => degistir(il, false)} title="Yeniden aç">
                                        <X className="size-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-col gap-4">
                        {gruplu.map((g) => (
                            <div key={g.key} className="flex flex-col gap-1.5">
                                <div className="flex items-baseline gap-2 border-b pb-1">
                                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        {g.baslik}
                                    </h4>
                                    <span className="text-xs tabular-nums text-muted-foreground">
                                        {g.iller.filter((il) => !kapaliSet.has(il)).length}/{g.iller.length} açık
                                    </span>
                                </div>
                                <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 md:grid-cols-3">
                                    {g.iller.map((il) => (
                                        <label key={il} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60">
                                            <Checkbox
                                                checked={!kapaliSet.has(il)}
                                                disabled={kaydediliyor}
                                                onCheckedChange={(v) => degistir(il, !v)}
                                            />
                                            <span className={kapaliSet.has(il) ? 'text-muted-foreground line-through' : ''}>{il}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {gorunen.length === 0 && (
                            <p className="py-4 text-center text-sm text-muted-foreground">İl bulunamadı</p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button onClick={() => { setAcik(false); setArama(''); }}>Kapat</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
