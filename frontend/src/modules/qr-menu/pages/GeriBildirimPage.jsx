import { useState, useEffect, useMemo } from 'react';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import {
    Mail, Phone, Store, Trash2, Inbox, CalendarDays, Clock, ExternalLink,
    Plus, MessageSquare, PhoneCall, ArrowRight, Hash, Search, X,
} from 'lucide-react';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

// Backend'deki DURUMLAR / KATEGORILER ile birebir (routes/geribildirim.js)
const DURUM = {
    yeni: { label: 'Yeni', cls: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300' },
    inceleniyor: { label: 'İnceleniyor', cls: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300' },
    cozuldu: { label: 'Çözüldü', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' },
    kapatildi: { label: 'Kapatıldı', cls: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300' },
};
const DURUM_KEYS = Object.keys(DURUM);
// Kapanmamış kayıtlar — yaşlanma yalnızca bunlarda anlamlı.
const ACIK_DURUMLAR = ['yeni', 'inceleniyor'];

const KATEGORI = {
    urun_kalitesi: 'Ürün kalitesi',
    servis: 'Servis / ilgi',
    temizlik: 'Temizlik / hijyen',
    fiyat: 'Fiyat / ödeme',
    diger: 'Diğer',
};

const KAYNAK = {
    qr: { label: 'QR menü', cls: 'text-muted-foreground' },
    sikayetvar: { label: 'Şikayetvar', cls: 'text-rose-600 dark:text-rose-400' },
    elle: { label: 'Elle eklendi', cls: 'text-muted-foreground' },
};

// Kaç günden sonra "gecikti" sayılır. Şikayetvar markaları yanıt süresine göre
// puanlıyor; 3 gün, müşterinin oraya yazmadan önce beklediği tipik süre.
const GECIKME_GUN = 3;

function tarihTR(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

/** Kaydın açılışından bu yana geçen tam gün. */
function gunFarki(iso, bitis = Date.now()) {
    if (!iso) return 0;
    return Math.floor((bitis - new Date(iso).getTime()) / 86400000);
}

export default function GeriBildirimPage() {
    const { role, can } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();
    const [bildirimler, setBildirimler] = useState([]);
    const [sayac, setSayac] = useState({});
    const [loading, setLoading] = useState(true);
    const [filtre, setFiltre] = useState('hepsi');   // hepsi | <durum> | geciken
    const [arama, setArama] = useState('');
    const [secili, setSecili] = useState(null);
    const [gecmis, setGecmis] = useState([]);
    const [gecmisYukleniyor, setGecmisYukleniyor] = useState(false);
    const [mesajTur, setMesajTur] = useState('not');
    const [mesaj, setMesaj] = useState('');
    const [saving, setSaving] = useState(false);
    const [ekleAcik, setEkleAcik] = useState(false);

    const isAdmin = role === 'admin';
    const silebilir = can('geribildirim.delete');
    const ekleyebilir = can('geribildirim.create');

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, []);

    async function load() {
        setLoading(true);
        try {
            const { data } = await api.get('/geribildirim');
            setBildirimler(data.bildirimler || []);
            setSayac(data.sayac || {});
        } catch (err) {
            console.error('Geri bildirimler yüklenemedi:', err);
            toast.error('Geri bildirimler yüklenemedi');
        }
        setLoading(false);
    }

    function hesaplaSayac(list) {
        const s = Object.fromEntries(DURUM_KEYS.map((k) => [k, 0]));
        for (const b of list) if (b.durum in s) s[b.durum] += 1;
        return s;
    }

    async function durumGuncelle(id, durum) {
        const onceki = bildirimler;
        const yeni = bildirimler.map((b) => (b.id === id ? { ...b, durum } : b));
        setBildirimler(yeni);
        setSayac(hesaplaSayac(yeni));
        setSecili((s) => (s && s.id === id ? { ...s, durum } : s));
        try {
            await api.patch(`/geribildirim/${id}`, { durum });
            // Durum değişikliği sunucuda geçmişe düşüyor; açık pencerede akış
            // eskimesin diye tazeleniyor.
            if (secili?.id === id) gecmisYukle(id);
        } catch (err) {
            console.error(err);
            toast.error('Durum güncellenemedi');
            setBildirimler(onceki);
            setSayac(hesaplaSayac(onceki));
        }
    }

    async function gecmisYukle(id) {
        setGecmisYukleniyor(true);
        try {
            const { data } = await api.get(`/geribildirim/${id}/gecmis`);
            setGecmis(data.gecmis || []);
        } catch (err) {
            console.error(err);
            setGecmis([]);
        }
        setGecmisYukleniyor(false);
    }

    async function mesajGonder() {
        if (!secili || !mesaj.trim()) return;
        setSaving(true);
        try {
            await api.post(`/geribildirim/${secili.id}/mesaj`, { tur: mesajTur, metin: mesaj.trim() });
            setMesaj('');
            await gecmisYukle(secili.id);
            // İlk müşteri dönüşü SLA saatini durdurur; listedeki rozet hemen düzelsin.
            if (mesajTur === 'musteri') {
                const damga = new Date().toISOString();
                setBildirimler((list) => list.map((b) =>
                    (b.id === secili.id && !b.ilkYanit ? { ...b, ilkYanit: damga } : b)));
                setSecili((s) => (s && !s.ilkYanit ? { ...s, ilkYanit: damga } : s));
            }
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.error || 'Mesaj eklenemedi');
        }
        setSaving(false);
    }

    async function sil(b) {
        const ok = await confirm(
            `${b.ad} ${b.soyad} adlı kişinin geri bildirimi kalıcı olarak silinecek. Bu işlem geri alınamaz.`
        );
        if (!ok) return;
        try {
            await api.delete(`/geribildirim/${b.id}`);
            const kalan = bildirimler.filter((x) => x.id !== b.id);
            setBildirimler(kalan);
            setSayac(hesaplaSayac(kalan));
            if (secili?.id === b.id) setSecili(null);
            toast.success('Geri bildirim silindi');
        } catch (err) {
            console.error(err);
            toast.error('Silinemedi');
        }
    }

    function detayAc(b) {
        setSecili(b);
        setMesaj('');
        setMesajTur('not');
        setGecmis([]);
        gecmisYukle(b.id);
    }

    // ── Süzme ───────────────────────────────────────────────────────────
    const q = arama.trim().toLocaleLowerCase('tr');
    const aranan = !q ? bildirimler : bildirimler.filter((b) =>
        [b.ad, b.soyad, b.email, b.telefon, b.mesaj, b.subeAd, b.takipNo, KATEGORI[b.kategori]]
            .some((alan) => (alan || '').toLocaleLowerCase('tr').includes(q))
    );

    const gecikenler = aranan.filter((b) =>
        ACIK_DURUMLAR.includes(b.durum) && gunFarki(b.olusturmaZamani) >= GECIKME_GUN);

    const gosterilen = filtre === 'hepsi' ? aranan
        : filtre === 'geciken' ? gecikenler
        : aranan.filter((b) => b.durum === filtre);

    // ── SLA özeti ───────────────────────────────────────────────────────
    // Ortalama İLK DÖNÜŞ süresi: yalnızca dönülmüş kayıtlar üzerinden.
    // Dönülmemişleri "sonsuz" sayıp ortalamaya katmak sayıyı anlamsız yapardı;
    // onlar zaten "geciken" sayacında görünüyor.
    const ozet = useMemo(() => {
        const donulen = bildirimler.filter((b) => b.ilkYanit);
        const toplamSaat = donulen.reduce((t, b) =>
            t + (new Date(b.ilkYanit) - new Date(b.olusturmaZamani)) / 3600000, 0);
        return {
            acik: bildirimler.filter((b) => ACIK_DURUMLAR.includes(b.durum)).length,
            donulen: donulen.length,
            ortalamaSaat: donulen.length > 0 ? toplamSaat / donulen.length : null,
        };
    }, [bildirimler]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-3xl leading-none tracking-tight">Şikayet & Geri Bildirim</h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        {isAdmin
                            ? 'QR menüsü, Şikayetvar ve elle eklenen müşteri şikayetleri tek yerde'
                            : 'Şubenize gelen müşteri bildirimleri'}
                    </p>
                </div>
                {ekleyebilir && (
                    <Button variant="outline" onClick={() => setEkleAcik(true)}>
                        <Plus className="size-4" /> Şikayet Ekle
                    </Button>
                )}
            </div>

            {/* SLA şeridi — "kaç şikayet açık, ne kadar sürede dönüyoruz".
                Kapalı kayıtlar buraya girmiyor: masanın yükü açık olanlar. */}
            {!loading && bildirimler.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/30 px-4 py-2.5 text-sm">
                    <span><strong className="tabular-nums">{ozet.acik}</strong> açık şikayet</span>
                    <span className={gecikenler.length > 0 ? 'text-destructive' : 'text-muted-foreground'}>
                        <strong className="tabular-nums">{gecikenler.length}</strong> tanesi {GECIKME_GUN}+ gündür bekliyor
                    </span>
                    <span className="text-muted-foreground">
                        Ortalama ilk dönüş:{' '}
                        <strong className="tabular-nums text-foreground">
                            {ozet.ortalamaSaat == null ? '—'
                                : ozet.ortalamaSaat < 24 ? `${Math.round(ozet.ortalamaSaat)} saat`
                                : `${(ozet.ortalamaSaat / 24).toFixed(1)} gün`}
                        </strong>
                        {ozet.donulen > 0 && <span className="ml-1 opacity-70">({ozet.donulen} kayıt)</span>}
                    </span>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1 sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={arama}
                        onChange={(e) => setArama(e.target.value)}
                        placeholder="Ad, telefon, takip kodu, metin ara..."
                        className="h-9 pl-8 pr-8 text-sm"
                    />
                    {arama && (
                        <button type="button" onClick={() => setArama('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                title="Aramayı temizle">
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>
                <FilterChip active={filtre === 'hepsi'} onClick={() => setFiltre('hepsi')}>
                    Tümü <span className="opacity-60">({aranan.length})</span>
                </FilterChip>
                {DURUM_KEYS.map((k) => (
                    <FilterChip key={k} active={filtre === k} onClick={() => setFiltre(k)}>
                        {DURUM[k].label} <span className="opacity-60">({aranan.filter((b) => b.durum === k).length})</span>
                    </FilterChip>
                ))}
                {gecikenler.length > 0 && (
                    <FilterChip active={filtre === 'geciken'} onClick={() => setFiltre('geciken')} tehlike>
                        <Clock className="mr-1 inline size-3" />
                        Geciken <span className="opacity-70">({gecikenler.length})</span>
                    </FilterChip>
                )}
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                    <Spinner className="size-8" />
                    <p className="text-sm text-muted-foreground">Yükleniyor...</p>
                </div>
            ) : gosterilen.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                    <Inbox className="size-10 opacity-50" />
                    <p>
                        {q ? `"${arama.trim()}" için sonuç bulunamadı`
                            : filtre === 'hepsi' ? 'Henüz geri bildirim yok' : 'Bu süzgeçle kayıt yok'}
                    </p>
                </div>
            ) : (
                <div className="rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Gönderen</TableHead>
                                <TableHead>Konu</TableHead>
                                {isAdmin && <TableHead>Şube</TableHead>}
                                <TableHead>Tarih</TableHead>
                                <TableHead className="w-40">Durum</TableHead>
                                {silebilir && <TableHead className="w-14"></TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {gosterilen.map((b) => {
                                const acik = ACIK_DURUMLAR.includes(b.durum);
                                const gun = gunFarki(b.olusturmaZamani);
                                return (
                                <TableRow key={b.id} className="cursor-pointer" onClick={() => detayAc(b)}>
                                    <TableCell>
                                        <div className="font-medium">{b.ad || '—'} {b.soyad}</div>
                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            {b.email || b.telefon || '—'}
                                            {b.kaynak !== 'qr' && (
                                                <span className={KAYNAK[b.kaynak]?.cls}>· {KAYNAK[b.kaynak]?.label}</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{KATEGORI[b.kategori] ?? b.kategori}</Badge>
                                        <p className="mt-1 max-w-xs truncate text-xs text-muted-foreground">{b.mesaj}</p>
                                    </TableCell>
                                    {isAdmin && (
                                        <TableCell className="text-sm text-muted-foreground">
                                            {b.subeAd || b.subeSlug || '—'}
                                        </TableCell>
                                    )}
                                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                        {tarihTR(b.olusturmaZamani)}
                                        {/* Yaşlanma yalnızca AÇIK kayıtta: kapanmış şikayetin
                                            "12 gündür bekliyor" demesi yanlış olurdu. */}
                                        {acik && gun >= GECIKME_GUN && (
                                            <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-destructive">
                                                <Clock className="size-3" /> {gun} gündür bekliyor
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                        <Select value={b.durum} onValueChange={(v) => durumGuncelle(b.id, v)}>
                                            <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {DURUM_KEYS.map((k) => (
                                                    <SelectItem key={k} value={k}>{DURUM[k].label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    {silebilir && (
                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                            <Button
                                                variant="ghost" size="icon"
                                                className="size-8 text-muted-foreground hover:text-rose-600"
                                                onClick={() => sil(b)} title="Sil"
                                            >
                                                <Trash2 className="size-3.5" />
                                            </Button>
                                        </TableCell>
                                    )}
                                </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}

            <Dialog open={!!secili} onOpenChange={(o) => !o && setSecili(null)}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    {secili && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex flex-wrap items-center gap-2">
                                    {secili.ad || 'İsimsiz'} {secili.soyad}
                                    <Badge variant="outline" className={DURUM[secili.durum]?.cls}>
                                        {DURUM[secili.durum]?.label ?? secili.durum}
                                    </Badge>
                                    {secili.takipNo && (
                                        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-normal text-muted-foreground">
                                            <Hash className="size-3" />{secili.takipNo}
                                        </span>
                                    )}
                                </DialogTitle>
                            </DialogHeader>

                            <div className="space-y-3 text-sm">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline">{KATEGORI[secili.kategori] ?? secili.kategori}</Badge>
                                    {secili.kaynak !== 'qr' && (
                                        <Badge variant="outline" className={KAYNAK[secili.kaynak]?.cls}>
                                            {KAYNAK[secili.kaynak]?.label}
                                        </Badge>
                                    )}
                                    {secili.kaynakUrl && (
                                        <a href={secili.kaynakUrl} target="_blank" rel="noopener noreferrer"
                                           className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                            <ExternalLink className="size-3" /> Kaynağı aç
                                        </a>
                                    )}
                                </div>

                                {secili.email && (
                                    <a href={`mailto:${secili.email}`} className="flex items-center gap-2 hover:text-primary">
                                        <Mail className="size-4 text-muted-foreground" /> {secili.email}
                                    </a>
                                )}
                                {secili.telefon && (
                                    <a href={`tel:${secili.telefon}`} className="flex items-center gap-2 hover:text-primary">
                                        <Phone className="size-4 text-muted-foreground" /> {secili.telefon}
                                    </a>
                                )}
                                <div className="flex items-center gap-2">
                                    <Store className="size-4 text-muted-foreground" /> {secili.subeAd || secili.subeSlug || '—'}
                                </div>
                                {secili.olayTarihi && (
                                    <div className="flex items-center gap-2">
                                        <CalendarDays className="size-4 text-muted-foreground" />
                                        Olay tarihi: {secili.olayTarihi}
                                    </div>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Gönderim: {tarihTR(secili.olusturmaZamani)}
                                    {secili.ilkYanit
                                        ? ` · İlk dönüş: ${tarihTR(secili.ilkYanit)}`
                                        : ' · Müşteriye henüz dönülmedi'}
                                </p>

                                <div className="rounded-lg border bg-muted/40 p-3">
                                    <p className="mb-1 text-xs font-medium text-muted-foreground">Müşterinin mesajı</p>
                                    <p className="whitespace-pre-wrap">{secili.mesaj}</p>
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Durum</label>
                                    <Select value={secili.durum} onValueChange={(v) => durumGuncelle(secili.id, v)}>
                                        <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {DURUM_KEYS.map((k) => (
                                                <SelectItem key={k} value={k}>{DURUM[k].label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Akış — tek liste: notlar, müşteri dönüşleri ve durum
                                    değişiklikleri zaman sırasıyla. Eski tek satırlık
                                    "dahili not" alanı kaldırıldı: üstüne yazılıyordu ve
                                    kimin yazdığı kaybolurdu. */}
                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground">Şikayet akışı</p>
                                    {gecmisYukleniyor ? (
                                        <div className="flex justify-center py-4"><Spinner className="size-5" /></div>
                                    ) : gecmis.length === 0 ? (
                                        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                                            Henüz kayıt yok — ilk notu aşağıdan ekleyin.
                                        </p>
                                    ) : (
                                        <ol className="space-y-2">
                                            {gecmis.map((g) => <GecmisSatiri key={g.id} g={g} />)}
                                        </ol>
                                    )}
                                </div>

                                <div className="space-y-2 rounded-lg border p-3">
                                    <div className="flex flex-wrap gap-1.5">
                                        {[
                                            { key: 'not', ad: 'Dahili not', ipucu: 'Yalnızca ekip görür' },
                                            { key: 'musteri', ad: 'Müşteriye dönüş', ipucu: 'Aradık / yazdık — SLA saatini durdurur' },
                                        ].map((t) => (
                                            <button key={t.key} type="button" title={t.ipucu}
                                                onClick={() => setMesajTur(t.key)}
                                                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                                    mesajTur === t.key ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                                                }`}>
                                                {t.ad}
                                            </button>
                                        ))}
                                    </div>
                                    <Textarea
                                        rows={3} value={mesaj} onChange={(e) => setMesaj(e.target.value)}
                                        placeholder={mesajTur === 'musteri'
                                            ? 'Müşteriyle ne konuşuldu? (ör. arandı, özür dilendi, ikram teklif edildi)'
                                            : 'Ekip içi not — müşteri görmez'}
                                    />
                                    {/* E-posta gönderme altyapısı YOK: bu kayıt müşteriye
                                        otomatik iletilmiyor, yapılan aramanın izidir. */}
                                    {mesajTur === 'musteri' && (
                                        <p className="text-[11px] text-muted-foreground">
                                            Bu kayıt müşteriye otomatik gönderilmez; yaptığınız aramanın/yazışmanın izidir.
                                        </p>
                                    )}
                                    <Button size="sm" onClick={mesajGonder} disabled={saving || !mesaj.trim()}>
                                        {saving ? 'Ekleniyor...' : 'Akışa ekle'}
                                    </Button>
                                </div>
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setSecili(null)}>Kapat</Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {ekleyebilir && (
                <SikayetEkleDialog
                    acik={ekleAcik}
                    onKapat={() => setEkleAcik(false)}
                    onEklendi={() => { setEkleAcik(false); load(); }}
                />
            )}
        </div>
    );
}

/** Akıştaki tek satır — türüne göre ikon ve metin. */
function GecmisSatiri({ g }) {
    const TUR = {
        not: { Ikon: MessageSquare, cls: 'text-muted-foreground', ad: 'Dahili not' },
        musteri: { Ikon: PhoneCall, cls: 'text-emerald-600 dark:text-emerald-400', ad: 'Müşteriye dönüş' },
        durum: { Ikon: ArrowRight, cls: 'text-blue-600 dark:text-blue-400', ad: 'Durum' },
    }[g.tur] || { Ikon: MessageSquare, cls: '', ad: g.tur };
    const { Ikon } = TUR;
    return (
        <li className="flex gap-2.5 rounded-lg border bg-card p-2.5">
            <Ikon className={`mt-0.5 size-4 shrink-0 ${TUR.cls}`} />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{TUR.ad}</span>
                    <span className="truncate">{g.kim}</span>
                    <span>{tarihTR(g.zaman)}</span>
                </div>
                {g.tur === 'durum' ? (
                    <p className="mt-0.5 text-sm">
                        {DURUM[g.eskiDurum]?.label ?? g.eskiDurum} → <strong>{DURUM[g.yeniDurum]?.label ?? g.yeniDurum}</strong>
                    </p>
                ) : (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm">{g.metin}</p>
                )}
            </div>
        </li>
    );
}

/**
 * Dış kaynaktan gelen şikayeti masaya elle ekler.
 *
 * QR formundan gelenlerle AYNI tabloya yazar: müşteri nereden yazarsa yazsın
 * tek gelen kutusunda yönetilsin. KVKK onayı işaretlenmez — kaydı müşteri
 * değil merkez açıyor, form onayı taklit edilmemeli.
 */
function SikayetEkleDialog({ acik, onKapat, onEklendi }) {
    const toast = useToast();
    const [subeler, setSubeler] = useState([]);
    const [kaydediliyor, setKaydediliyor] = useState(false);
    const [form, setForm] = useState({
        kaynak: 'sikayetvar', subeSlug: '', kategori: 'diger',
        ad: '', soyad: '', telefon: '', email: '', mesaj: '', kaynakUrl: '',
    });

    useEffect(() => {
        if (!acik) return;
        api.get('/branches').then(({ data }) => setSubeler(data.subeler || [])).catch(() => {});
        setForm((f) => ({ ...f, ad: '', soyad: '', telefon: '', email: '', mesaj: '', kaynakUrl: '' }));
    }, [acik]);

    async function kaydet() {
        if (!form.mesaj.trim()) return toast.error('Şikayet metni zorunlu');
        setKaydediliyor(true);
        try {
            await api.post('/geribildirim/elle', {
                ...form,
                subeSlug: form.subeSlug || undefined,
                // Dış kayıtta özgün adres tekilleştirme anahtarı olarak da işe
                // yarıyor: aynı Şikayetvar bağlantısı iki kez eklenemesin.
                kaynakId: form.kaynakUrl.trim() || undefined,
            });
            toast.success('Şikayet eklendi');
            onEklendi();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Eklenemedi');
        }
        setKaydediliyor(false);
    }

    return (
        <Dialog open={acik} onOpenChange={(o) => !o && onKapat()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader><DialogTitle>Şikayet Ekle</DialogTitle></DialogHeader>
                <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Kaynak</label>
                            <Select value={form.kaynak} onValueChange={(v) => setForm({ ...form, kaynak: v })}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="sikayetvar">Şikayetvar</SelectItem>
                                    <SelectItem value="elle">Telefon / diğer</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Konu</label>
                            <Select value={form.kategori} onValueChange={(v) => setForm({ ...form, kategori: v })}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {Object.entries(KATEGORI).map(([k, ad]) => (
                                        <SelectItem key={k} value={k}>{ad}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Şube</label>
                        <select
                            value={form.subeSlug}
                            onChange={(e) => setForm({ ...form, subeSlug: e.target.value })}
                            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                        >
                            <option value="">Şube belirsiz</option>
                            {subeler.map((s) => <option key={s.slug} value={s.slug}>{s.ad}</option>)}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Ad</label>
                            <Input value={form.ad} onChange={(e) => setForm({ ...form, ad: e.target.value })} className="h-9" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Soyad</label>
                            <Input value={form.soyad} onChange={(e) => setForm({ ...form, soyad: e.target.value })} className="h-9" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Telefon</label>
                            <Input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} className="h-9" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">E-posta</label>
                            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-9" />
                        </div>
                    </div>

                    {form.kaynak === 'sikayetvar' && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Şikayetvar bağlantısı</label>
                            <Input
                                value={form.kaynakUrl}
                                onChange={(e) => setForm({ ...form, kaynakUrl: e.target.value })}
                                placeholder="https://www.sikayetvar.com/sutluce-kadayif/..."
                                className="h-9"
                            />
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Şikayet metni</label>
                        <Textarea rows={4} value={form.mesaj} onChange={(e) => setForm({ ...form, mesaj: e.target.value })} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onKapat}>İptal</Button>
                    <Button onClick={kaydet} disabled={kaydediliyor}>
                        {kaydediliyor ? 'Ekleniyor...' : 'Ekle'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function FilterChip({ active, onClick, children, tehlike = false }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                active
                    ? (tehlike ? 'border-destructive bg-destructive text-white' : 'border-primary bg-primary text-primary-foreground')
                    : (tehlike
                        ? 'border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted')
            }`}
        >
            {children}
        </button>
    );
}
