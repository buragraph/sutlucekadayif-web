import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { Megaphone, Plus, Pencil, Trash2, Eye, EyeOff, Store, Check, ChevronsUpDown, Users, FileDown, ImageDown } from 'lucide-react';
import api from '../../../services/api';
import { useConfirm } from '../../../shared/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { duyuruBelgeHtml, duyuruDosyaAdi, BELGE_GENISLIGI, BELGE_YUKSEKLIGI } from '../utils/duyuru-belge';
import { parcaYukle } from '../../../shared/utils/parca-yukle';

/**
 * Duyurular — merkez yazar, şube sahibi kendi dashboard'unda görür.
 *
 * Hedefleme: hiç şube seçilmezse duyuru TÜM şubelere gider (boş dizi = herkes,
 * bkz. 0021_duyurular.sql). Ayrı bir "herkese gönder" anahtarı koymadık;
 * iki alanın çelişme ihtimali olmasın.
 */
const ONEMLER = [
    { key: 'bilgi', ad: 'Bilgi', stil: 'border-border bg-muted/40 text-foreground' },
    { key: 'uyari', ad: 'Uyarı', stil: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-500' },
    { key: 'onemli', ad: 'Önemli', stil: 'border-destructive/30 bg-destructive/10 text-destructive' },
];

const BOS = {
    baslik: '', icerik: '', onem: 'bilgi', yayinda: true,
    // `tarihli` yalnızca FORM durumu, sunucuya gitmez (bkz. kaydet). Kapalıyken
    // duyuru o andan itibaren süresiz yayında; tarih alanları hiç görünmüyor.
    tarihli: false, baslangic: '', bitis: '', hedefSubeler: [],
};

const tarihYaz = (d) => {
    if (!d) return null;
    try { return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { return null; }
};
// <input type="date"> yyyy-mm-dd ister; ISO damgasının ilk 10 hanesi tam bu.
const tarihGirdi = (d) => (d ? String(d).slice(0, 10) : '');

export default function DuyurularPage() {
    const confirm = useConfirm();
    const [duyurular, setDuyurular] = useState([]);
    const [subeler, setSubeler] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState(null);          // null = pencere kapalı
    const [duzenlenen, setDuzenlenen] = useState(null);
    const [kaydediliyor, setKaydediliyor] = useState(false);
    const [subeSecici, setSubeSecici] = useState(false);
    const [okuyanlar, setOkuyanlar] = useState(null);   // { duyuru, liste } — pencere

    const yukle = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/duyurular');
            setDuyurular(data.duyurular || []);
        } catch { toast.error('Duyurular yüklenemedi'); }
        setLoading(false);
    }, []);

    useEffect(() => {
        yukle();
        api.get('/branches').then(({ data }) => setSubeler(data.subeler || [])).catch(() => {});
    }, [yukle]);

    const subeAdi = (kod) => subeler.find((s) => s.slug === kod)?.ad || kod;

    function yeniAc() { setDuzenlenen(null); setForm({ ...BOS }); }

    function duzenleAc(d) {
        setDuzenlenen(d);
        setForm({
            baslik: d.baslik, icerik: d.icerik || '', onem: d.onem,
            yayinda: d.yayinda,
            // Kayıtta tarih varsa kutu işaretli açılsın, yoksa kapalı.
            tarihli: !!(d.baslangic || d.bitis),
            baslangic: tarihGirdi(d.baslangic), bitis: tarihGirdi(d.bitis),
            hedefSubeler: d.hedefSubeler || [],
        });
    }

    async function kaydet() {
        if (!form.baslik.trim()) { toast.error('Başlık gerekli'); return; }
        setKaydediliyor(true);
        try {
            const { tarihli, ...alanlar } = form;
            const govde = {
                ...alanlar,
                baslik: form.baslik.trim(),
                // Tarih kutusu kapalıysa iki alan da TEMİZLENİR: düzenlemede
                // kutuyu kaldıran kişi "artık süresiz" demek istiyor, eski
                // tarihlerin sessizce kalması olmaz.
                // Boş dize null demek: "tarih girilmedi" ile "1970" karışmasın.
                baslangic: tarihli ? (form.baslangic || null) : null,
                // Bitiş GÜNÜN SONU: 15 Eylül seçen kişi 15 Eylül akşamına kadar
                // yayında kalmasını bekler, o günün 00:00'ında düşmesini değil.
                bitis: tarihli && form.bitis ? `${form.bitis}T23:59:59` : null,
            };
            if (duzenlenen) await api.put(`/duyurular/${duzenlenen.id}`, govde);
            else await api.post('/duyurular', govde);
            toast.success(duzenlenen ? 'Duyuru güncellendi' : 'Duyuru yayınlandı');
            setForm(null);
            yukle();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Kaydedilemedi');
        }
        setKaydediliyor(false);
    }

    async function okuyanlariAc(d) {
        setOkuyanlar({ duyuru: d, liste: null });
        try {
            const { data } = await api.get(`/duyurular/${d.id}/okuyanlar`);
            setOkuyanlar({ duyuru: d, liste: data.okuyanlar || [] });
        } catch {
            toast.error('Okuyanlar getirilemedi');
            setOkuyanlar(null);
        }
    }

    async function yayinDegistir(d) {
        try {
            await api.put(`/duyurular/${d.id}`, { yayinda: !d.yayinda });
            setDuyurular((p) => p.map((x) => (x.id === d.id ? { ...x, yayinda: !x.yayinda } : x)));
        } catch { toast.error('Güncellenemedi'); }
    }

    async function sil(d) {
        const ok = await confirm(`"${d.baslik}" duyurusu silinsin mi?`);
        if (!ok) return;
        try {
            await api.delete(`/duyurular/${d.id}`);
            setDuyurular((p) => p.filter((x) => x.id !== d.id));
            toast.success('Duyuru silindi');
        } catch { toast.error('Silinemedi'); }
    }

    const suresiGecti = (d) => d.bitis && new Date(d.bitis) < new Date();
    // Başlangıcı ileri tarihli duyuru "yayında" görünüyor ama şubeye HENÜZ
    // gitmiyor. Rozet olmadan bu fark anlaşılmıyor; duyuru eklenip
    // dashboard'da görünmeyince hata sanılıyordu.
    const baslamadi = (d) => d.baslangic && new Date(d.baslangic) > new Date();

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-3xl leading-none tracking-tight">Duyurular</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Merkezden şubelere duyuru. Şube sahipleri kendi genel bakış ekranında görür.
                    </p>
                </div>
                <Button onClick={yeniAc}><Plus className="mr-1.5 size-4" /> Yeni Duyuru</Button>
            </div>

            {loading ? (
                <div className="flex justify-center py-16"><Spinner className="size-8" /></div>
            ) : duyurular.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                    <Megaphone className="size-8" />
                    <p className="text-sm">Henüz duyuru yok</p>
                </div>
            ) : (
                <div className="flex flex-col gap-2.5">
                    {duyurular.map((d) => {
                        const onem = ONEMLER.find((o) => o.key === d.onem) || ONEMLER[0];
                        const gecti = suresiGecti(d);
                        const bekliyor = baslamadi(d);
                        const hedef = d.hedefSubeler || [];
                        return (
                            <div key={d.id}
                                className={`rounded-xl border p-4 transition-colors ${!d.yayinda || gecti || bekliyor ? 'opacity-60' : ''}`}>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${onem.stil}`}>
                                                {onem.ad}
                                            </span>
                                            <h3 className="font-medium text-foreground">{d.baslik}</h3>
                                            {!d.yayinda && (
                                                <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Yayında değil</span>
                                            )}
                                            {gecti && d.yayinda && (
                                                <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Süresi geçti</span>
                                            )}
                                            {bekliyor && d.yayinda && !gecti && (
                                                <span className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400">
                                                    {tarihYaz(d.baslangic)} tarihinde yayınlanacak
                                                </span>
                                            )}
                                        </div>
                                        {d.icerik && (
                                            <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{d.icerik}</p>
                                        )}
                                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                            <span className="inline-flex items-center gap-1">
                                                <Store className="size-3" />
                                                {hedef.length === 0
                                                    ? 'Tüm şubeler'
                                                    : hedef.length <= 3
                                                        ? hedef.map(subeAdi).join(', ')
                                                        : `${hedef.length} şube`}
                                            </span>
                                            {(d.baslangic || d.bitis) && (
                                                <span>
                                                    {tarihYaz(d.baslangic) || 'hemen'} → {tarihYaz(d.bitis) || 'süresiz'}
                                                </span>
                                            )}
                                            {d.olusturan && <span>{d.olusturan}</span>}
                                            {/* Okunma sayısı: hedefi tüm şubeler olan duyuruda
                                                payda şube sayısı, hedefli duyuruda hedef sayısı. */}
                                            <button type="button" onClick={() => okuyanlariAc(d)}
                                                className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                                                <Users className="size-3" />
                                                {d.okuyanSube || 0}/{hedef.length === 0 ? subeler.length : hedef.length} şube okudu
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button variant="ghost" size="icon" className="size-8"
                                            title={d.yayinda ? 'Yayından kaldır' : 'Yayınla'}
                                            onClick={() => yayinDegistir(d)}>
                                            {d.yayinda ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                                        </Button>
                                        <Button variant="ghost" size="icon" className="size-8" title="Düzenle"
                                            onClick={() => duzenleAc(d)}>
                                            <Pencil className="size-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon"
                                            className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            title="Sil" onClick={() => sil(d)}>
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <Dialog open={!!okuyanlar} onOpenChange={(a) => !a && setOkuyanlar(null)}>
                <DialogContent className="max-w-md [&>*]:min-w-0">
                    <DialogHeader>
                        <DialogTitle className="truncate">{okuyanlar?.duyuru?.baslik}</DialogTitle>
                    </DialogHeader>
                    {okuyanlar?.liste === null ? (
                        <div className="flex justify-center py-8"><Spinner className="size-6" /></div>
                    ) : okuyanlar?.liste?.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">Henüz kimse okumadı.</p>
                    ) : (
                        <div className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto">
                            {(okuyanlar?.liste || []).map((o, i) => (
                                <div key={`${o.kullanici}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                                    <div className="min-w-0">
                                        <p className="truncate font-medium text-foreground">{subeAdi(o.subeKod) || '—'}</p>
                                        <p className="truncate text-xs text-muted-foreground">{o.kullanici}</p>
                                    </div>
                                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                        {tarihYaz(o.zaman)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={!!form} onOpenChange={(a) => !a && setForm(null)}>
                <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl [&>*]:min-w-0">
                    <DialogHeader>
                        <DialogTitle>{duzenlenen ? 'Duyuruyu Düzenle' : 'Yeni Duyuru'}</DialogTitle>
                    </DialogHeader>

                    {/* Form solda, antetli belgenin ÖNİZLEMESİ sağda. Duyuru
                        şubelere hem panelden hem PDF/PNG olarak gidiyor; nasıl
                        görüneceğini indirmeden görmek gerekiyordu. */}
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
                    {form && (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="d-baslik">Başlık</Label>
                                <Input id="d-baslik" value={form.baslik} maxLength={160}
                                    onChange={(e) => setForm((f) => ({ ...f, baslik: e.target.value }))}
                                    placeholder="Ör. Ramazan kampanyası başlıyor" />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="d-icerik">İçerik</Label>
                                <Textarea id="d-icerik" rows={5} value={form.icerik} maxLength={4000}
                                    onChange={(e) => setForm((f) => ({ ...f, icerik: e.target.value }))}
                                    placeholder="Şubelerin bilmesi gerekenler…" />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label>Önem</Label>
                                <div className="flex gap-1.5">
                                    {ONEMLER.map((o) => (
                                        <button key={o.key} type="button"
                                            onClick={() => setForm((f) => ({ ...f, onem: o.key }))}
                                            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                                                form.onem === o.key ? o.stil : 'border-transparent bg-muted text-muted-foreground hover:bg-muted/70'
                                            }`}>
                                            {o.ad}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label>Hedef şubeler</Label>
                                <Popover open={subeSecici} onOpenChange={setSubeSecici}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" role="combobox" className="justify-between font-normal">
                                            {form.hedefSubeler.length === 0
                                                ? 'Tüm şubeler'
                                                : `${form.hedefSubeler.length} şube seçili`}
                                            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[320px] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="Şube ara..." />
                                            <CommandList>
                                                <CommandEmpty>Şube bulunamadı.</CommandEmpty>
                                                <CommandGroup>
                                                    <CommandItem
                                                        value="__tumu"
                                                        onSelect={() => setForm((f) => ({ ...f, hedefSubeler: [] }))}
                                                    >
                                                        <Check className={`mr-2 size-3.5 ${form.hedefSubeler.length === 0 ? '' : 'opacity-0'}`} />
                                                        Tüm şubeler
                                                    </CommandItem>
                                                    {subeler.map((s) => {
                                                        const secili = form.hedefSubeler.includes(s.slug);
                                                        return (
                                                            <CommandItem key={s.slug} value={s.ad || s.slug}
                                                                onSelect={() => setForm((f) => ({
                                                                    ...f,
                                                                    hedefSubeler: secili
                                                                        ? f.hedefSubeler.filter((x) => x !== s.slug)
                                                                        : [...f.hedefSubeler, s.slug],
                                                                }))}
                                                            >
                                                                <Check className={`mr-2 size-3.5 ${secili ? '' : 'opacity-0'}`} />
                                                                {s.ad}
                                                            </CommandItem>
                                                        );
                                                    })}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                <p className="text-xs text-muted-foreground">
                                    Hiç şube seçilmezse duyuru tüm şubelere gider.
                                </p>
                            </div>

                            {/* Tarih varsayılan olarak KAPALI: normal duyuru "şimdi yayınla,
                                ben kaldırana kadar dursun" demek. Tarih alanları hep açık
                                durduğunda doldurulması gerekiyormuş gibi görünüyor ve ileri
                                tarih seçilince duyuru sessizce görünmez oluyordu. */}
                            <div className="flex flex-col gap-3 rounded-lg border p-3">
                                <label className="flex cursor-pointer items-start gap-2.5">
                                    <Checkbox checked={form.tarihli} className="mt-0.5"
                                        onCheckedChange={(v) => setForm((f) => ({
                                            ...f, tarihli: !!v, baslangic: v ? f.baslangic : '', bitis: v ? f.bitis : '',
                                        }))} />
                                    <span>
                                        <span className="text-sm font-medium">Tarih aralığı belirle</span>
                                        <span className="block text-xs text-muted-foreground">
                                            İşaretlenmezse duyuru hemen yayınlanır ve siz kaldırana kadar kalır.
                                        </span>
                                    </span>
                                </label>

                                {form.tarihli && (
                                    <>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="flex flex-col gap-1.5">
                                                <Label htmlFor="d-bas">Başlangıç</Label>
                                                <Input id="d-bas" type="date" value={form.baslangic}
                                                    onChange={(e) => setForm((f) => ({ ...f, baslangic: e.target.value }))} />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <Label htmlFor="d-bit">Bitiş</Label>
                                                <Input id="d-bit" type="date" value={form.bitis}
                                                    onChange={(e) => setForm((f) => ({ ...f, bitis: e.target.value }))} />
                                            </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Başlangıç ileri bir tarihse duyuru <strong>o güne kadar şubelere gitmez</strong>.
                                            Alanları boş bırakırsanız o uçtan sınırsız olur.
                                        </p>
                                    </>
                                )}
                            </div>

                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div>
                                    <p className="text-sm font-medium">Yayında</p>
                                    <p className="text-xs text-muted-foreground">Kapalıyken şubeler görmez.</p>
                                </div>
                                <Switch checked={form.yayinda}
                                    onCheckedChange={(v) => setForm((f) => ({ ...f, yayinda: v }))} />
                            </div>
                        </div>
                    )}

                    {/* Belgedeki tarih: duyuru yayına girecekse o gün, yoksa
                        bugün. Düzenlemede de aynı mantık — çıktı "bu duyuru ne
                        zaman geçerli" sorusunu cevaplamalı. */}
                    {form && <DuyuruOnizleme duyuru={{ ...form, tarih: form.baslangic || undefined }} />}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setForm(null)}>İptal</Button>
                        <Button onClick={kaydet} disabled={kaydediliyor}>
                            {kaydediliyor ? 'Kaydediliyor…' : (duzenlenen ? 'Kaydet' : 'Yayınla')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/**
 * Antetli belgenin canlı önizlemesi + tek tıkla PDF/PNG indirme.
 *
 * IFRAME + SRCDOC: belge kendi CSS'iyle yaşasın (panelin Tailwind'i sızmasın)
 * ve yazarın metni panele `innerHTML` olarak basılmasın. Çerçeve A4 eninde
 * (794px) kurulur, sonra kaba sığdırma için `transform: scale` ile küçültülür —
 * genişliği daraltmak yerine ölçekliyoruz ki önizleme, çıktının BİREBİR küçük
 * hâli olsun; satır sonları kaymasın.
 *
 * İNDİRME AYNI DİZEYİ KULLANIR (bkz. utils/duyuru-belge.js): ekranda görünen
 * ile inen dosya aynı HTML'den üretiliyor.
 */
function DuyuruOnizleme({ duyuru }) {
    const [indiriliyor, setIndiriliyor] = useState(null);   // 'pdf' | 'png' | null
    const sarmalRef = useRef(null);
    const cerceveRef = useRef(null);
    const [olcek, setOlcek] = useState(1);

    const html = useMemo(() => duyuruBelgeHtml(duyuru), [duyuru]);

    // BELGE ÇERÇEVEYE ELLE YAZILIYOR, `srcDoc` İLE DEĞİL: srcdoc ilk
    // gezinmeden sonra güncellenince Chrome çerçeveyi güvenilir biçimde
    // yeniden yüklemiyor — ölçüldü, başlık değişikliği geçiyor ama sonraki
    // gövde değişiklikleri ekrana hiç gelmiyordu (srcdoc doğru, DOM eski).
    // Aynı nedenle her tuşta yazmamak için küçük bir gecikme var.
    useEffect(() => {
        const zaman = setTimeout(() => {
            const bel = cerceveRef.current?.contentDocument;
            if (!bel) return;
            bel.open();
            bel.write(html);
            bel.close();
        }, 200);
        return () => clearTimeout(zaman);
    }, [html]);

    // Kullanılabilir genişliğe göre ölçek. ResizeObserver: pencere boyutu ve
    // düzen (lg kırılımı) değişince önizleme de küçülüp büyüsün.
    useEffect(() => {
        const el = sarmalRef.current;
        if (!el) return;
        const guncelle = () => setOlcek(Math.min(1, el.clientWidth / BELGE_GENISLIGI));
        guncelle();
        const ro = new ResizeObserver(guncelle);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    async function indir(bicim) {
        setIndiriliyor(bicim);
        try {
            const ad = duyuruDosyaAdi(duyuru);
            const secenek = { genislik: BELGE_GENISLIGI };
            // PDF modülü jspdf + modern-screenshot çekiyor; ana pakete girmesin.
            // parcaYukle: yeni sürüm yayınlanınca eski sekmenin istediği hash'li
            // parça sunucudan kalkıyor (bkz. shared/utils/parca-yukle.js).
            const { raporPdfIndir, raporPngIndir } = await parcaYukle(
                () => import('../../reports/utils/pdf-yazdir'), 'PDF modülü');
            // PDF A4 SAYFALARA BÖLÜNÜR: tek uzun sayfa ekranda sorun değil ama
            // yazdırılınca kâğıda sığmıyordu. PNG bölünmez — tek görsel olarak
            // paylaşılıyor, zaten kaydırarak okunuyor.
            if (bicim === 'pdf') {
                await raporPdfIndir(html, ad, { ...secenek, sayfaYuksekligi: BELGE_YUKSEKLIGI });
            } else {
                await raporPngIndir(html, ad, secenek);
            }
        } catch (err) {
            console.error('Duyuru çıktısı:', err);
            toast.error('Çıktı üretilemedi');
        }
        setIndiriliyor(null);
    }

    // A4 oranını koru: ölçeklenen çerçevenin kapladığı yükseklik.
    const YUKSEKLIK = BELGE_YUKSEKLIGI;

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Önizleme</Label>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={!!indiriliyor}
                            onClick={() => indir('pdf')}>
                        <FileDown className="size-3.5" />
                        {indiriliyor === 'pdf' ? 'Hazırlanıyor…' : 'PDF'}
                    </Button>
                    <Button size="sm" variant="outline" disabled={!!indiriliyor}
                            onClick={() => indir('png')}>
                        <ImageDown className="size-3.5" />
                        {indiriliyor === 'png' ? 'Hazırlanıyor…' : 'PNG'}
                    </Button>
                </div>
            </div>

            <div ref={sarmalRef} className="overflow-hidden rounded-lg border bg-muted/30">
                <div style={{ height: YUKSEKLIK * olcek }}>
                    <iframe
                        ref={cerceveRef}
                        title="Duyuru önizleme"
                        // `allow-same-origin` VAR ama `allow-scripts` YOK: ikisi
                        // birlikte verilseydi sanal alanın anlamı kalmazdı. Tek
                        // başına same-origin iki şeyi açıyor — antet görselinin
                        // yüklenmesi ve belgeyi buradan YAZABİLMEK; script yine
                        // çalışmıyor, yani yazarın metnine gömülü etiket etkisiz.
                        sandbox="allow-same-origin"
                        scrolling="no"
                        style={{
                            width: BELGE_GENISLIGI,
                            height: YUKSEKLIK,
                            border: 0,
                            transform: `scale(${olcek})`,
                            transformOrigin: 'top left',
                        }}
                    />
                </div>
            </div>
            <p className="text-xs text-muted-foreground">
                Çıktı A4 enindedir; PDF ve PNG bu görüntünün birebir aynısıdır.
            </p>
        </div>
    );
}
