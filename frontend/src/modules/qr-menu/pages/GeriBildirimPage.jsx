import { useState, useEffect, useMemo } from 'react';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import {
    Mail, Phone, Store, Trash2, Inbox, CalendarDays, Clock, ExternalLink,
    Plus, MessageSquare, PhoneCall, ArrowRight, Hash, Search, X,
    ChevronLeft, ChevronRight,
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
import SubeSecici from '../components/SubeSecici';

// Backend'deki DURUMLAR / KATEGORILER ile birebir (routes/geribildirim.js)
//
// MASA İKİ YÖNLÜ: 'musteri' = şube HAKKINDA dışarıdan gelen şikayet,
// 'sube' = şubeDEN merkeze iletilen şikayet/talep. Yön farklı olduğu için
// durum ve konu listeleri de farklı; ikisi de tip'e göre seçiliyor.
const YENI_RENK = 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300';
const INCELEME_RENK = 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300';
const BITTI_RENK = 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300';
const KAPALI_RENK = 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';

const DURUMLAR = {
    musteri: {
        yeni: { label: 'Yeni', cls: YENI_RENK },
        inceleniyor: { label: 'İnceleniyor', cls: INCELEME_RENK },
        cozuldu: { label: 'Çözüldü', cls: BITTI_RENK },
        kapatildi: { label: 'Kapatıldı', cls: KAPALI_RENK },
    },
    sube: {
        yeni: { label: 'Yeni', cls: YENI_RENK },
        inceleniyor: { label: 'Merkez inceliyor', cls: INCELEME_RENK },
        // "Çözüldü" değil: merkez cevap verdi ama iş bitmemiş olabilir,
        // bitiş ayrı adım.
        donut_saglandi: { label: 'Dönüt sağlandı', cls: BITTI_RENK },
        kapatildi: { label: 'Kapatıldı', cls: KAPALI_RENK },
    },
};
// Kapanmamış kayıtlar — yaşlanma yalnızca bunlarda anlamlı.
const ACIK_DURUMLAR = ['yeni', 'inceleniyor'];

const KATEGORILER = {
    musteri: {
        urun_kalitesi: 'Ürün kalitesi',
        servis: 'Servis / ilgi',
        temizlik: 'Temizlik / hijyen',
        fiyat: 'Fiyat / ödeme',
        diger: 'Diğer',
    },
    // Müşteri konuları (temizlik, servis) şube→merkez akışına uymuyor.
    sube: {
        tedarik: 'Tedarik / sevkiyat',
        urun_kalitesi: 'Ürün kalitesi',
        fiyat_listesi: 'Fiyat listesi',
        sistem: 'Panel / sistem',
        egitim: 'Eğitim',
        muhasebe: 'Muhasebe / ödeme',
        diger: 'Diğer',
    },
};

/**
 * Şikayetin nereden geldiği. Rozet HER SATIRDA görünür (QR dahil): masada
 * artık üç kanal var ve "bunu müşteri mi yazdı, Şikayetvar'dan mı geldi"
 * sorusu ilk bakışta cevaplanmalı — kaynağa göre yapılacak iş farklı.
 */
const KAYNAK = {
    qr: { label: 'QR menü', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' },
    sikayetvar: { label: 'Şikayetvar', cls: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300' },
    elle: { label: 'Telefon / diğer', cls: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300' },
};
const KAYNAK_KEYS = Object.keys(KAYNAK);

// Kaç günden sonra "gecikti" sayılır. Şikayetvar markaları yanıt süresine göre
// puanlıyor; 3 gün, müşterinin oraya yazmadan önce beklediği tipik süre.
const GECIKME_GUN = 3;

function tarihTR(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

/** Liste için kısa tarih — saat/dakika yalnızca detayda gösteriliyor. */
function tarihKisaTR(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' });
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
    const [tip, setTip] = useState('musteri');       // musteri | sube
    const [filtre, setFiltre] = useState('hepsi');   // hepsi | <durum> | geciken
    const [kaynakFiltre, setKaynakFiltre] = useState('hepsi');
    const [arama, setArama] = useState('');
    const [sayfa, setSayfa] = useState(1);
    const [secili, setSecili] = useState(null);
    const [gecmis, setGecmis] = useState([]);
    const [gecmisYukleniyor, setGecmisYukleniyor] = useState(false);
    const [mesajTur, setMesajTur] = useState('not');
    const [mesaj, setMesaj] = useState('');
    const [saving, setSaving] = useState(false);
    const [ekleAcik, setEkleAcik] = useState(false);
    const [subeEkleAcik, setSubeEkleAcik] = useState(false);
    const [subeler, setSubeler] = useState([]);

    const isAdmin = role === 'admin';
    const silebilir = can('geribildirim.delete');
    const ekleyebilir = can('geribildirim.create');
    const subeSikayetiAcabilir = can('subeSikayet.create');

    const subeSekmesi = tip === 'sube';
    const DURUM = DURUMLAR[tip];
    const DURUM_KEYS = Object.keys(DURUM);
    const KATEGORI = KATEGORILER[tip];
    // Şube şikayetinde dış dönüş MERKEZDEN ŞUBEYE; müşteri şikayetinde
    // müşteriye. Sunucu da bu ayrımı yapıyor (routes/geribildirim.js).
    const disDonusTuru = subeSekmesi ? 'donut' : 'musteri';
    // Şube kendi talebinin durumunu ilerletemez — o merkezin işi.
    const durumDegistirebilir = !subeSekmesi || isAdmin;

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [tip]);
    // Şube listesi yalnızca merkeze gerekli: kaydın şubesini değiştirebilen o.
    useEffect(() => {
        if (!isAdmin) return;
        api.get('/menu/subeler')
            .then(({ data }) => setSubeler(data.subeler || []))
            .catch(() => setSubeler([]));
    }, [isAdmin]);
    // Süzgeç ya da arama değişince 7. sayfada boş liste görünmesin.
    useEffect(() => { setSayfa(1); }, [arama, filtre, kaynakFiltre, tip]);

    async function load() {
        setLoading(true);
        try {
            const { data } = await api.get('/geribildirim', { params: { tip } });
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

    // Dış kaynaklı şikayetler masaya elle ekleniyor ve şubesi o an
    // bilinmeyebiliyor. Şubesi boş kayıt HİÇBİR şube sahibine görünmüyor
    // (liste `sube_slug` eşitliğiyle süzülüyor); atama yolu olmadan o kayıt
    // ilgili şubeye hiç ulaşamıyordu.
    async function subeAta(id, slug) {
        const onceki = bildirimler;
        const sube = subeler.find((x) => x.slug === slug);
        const yenile = (b) => ({ ...b, subeSlug: slug || null, subeAd: sube?.ad || null });
        setBildirimler(bildirimler.map((b) => (b.id === id ? yenile(b) : b)));
        setSecili((x) => (x && x.id === id ? yenile(x) : x));
        try {
            await api.patch(`/geribildirim/${id}`, { subeSlug: slug || '' });
            toast.success(sube ? `${sube.ad} şubesine atandı` : 'Şube ataması kaldırıldı');
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.error || 'Şube atanamadı');
            setBildirimler(onceki);
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
            if (mesajTur === disDonusTuru) {
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
        // Şube şikayetinde ad/soyad alanları boş — onay metni "undefined
        // undefined adlı kişinin" diye çıkmasın.
        const kim = [b.ad, b.soyad].filter(Boolean).join(' ').trim();
        const ok = await confirm(
            kim
                ? `${kim} adlı kişinin geri bildirimi kalıcı olarak silinecek. Bu işlem geri alınamaz.`
                : `${b.subeAd || b.subeSlug || 'Bu'} kaydı kalıcı olarak silinecek. Bu işlem geri alınamaz.`
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

    // Sekme değişince durum çipi ve kaynak süzgeci karşı tarafta geçersiz
    // kalıyor (ör. "cozuldu" şube sekmesinde yok) — liste boş görünürdü.
    function sekmeSec(yeni) {
        if (yeni === tip) return;
        setTip(yeni);
        setFiltre('hepsi');
        setKaynakFiltre('hepsi');
        setSecili(null);
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
    // Arama ve KAYNAK önce uygulanır; durum çipleri bu sonucu böler. Böylece
    // çipteki sayı "bu kaynakta kaç tanesi yeni" sorusunu cevaplar.
    // Takip kodu telefonda okunuyor: müşteri "SK-2YP5HD" de diyebilir
    // "sk 2yp5hd" de. Karşılaştırma için harf/rakam dışındaki her şey atılır.
    const kodSadele = (v) => (v || '').toLocaleLowerCase('tr').replace(/[^a-z0-9]/g, '');
    const qKod = kodSadele(q);
    const aranan = bildirimler.filter((b) => {
        if (kaynakFiltre !== 'hepsi' && (b.kaynak || 'qr') !== kaynakFiltre) return false;
        if (!q) return true;
        if (qKod && b.takipNo && kodSadele(b.takipNo).includes(qKod)) return true;
        return [b.ad, b.soyad, b.email, b.telefon, b.mesaj, b.subeAd, b.takipNo, KATEGORI[b.kategori]]
            .some((alan) => (alan || '').toLocaleLowerCase('tr').includes(q));
    });

    // Kaynak seçicideki sayılar aramadan BAĞIMSIZ: seçenekler daralınca
    // "hangi kanalda kaç kayıt var" bilgisi kaybolurdu.
    const kaynakSayim = (k) => bildirimler.filter((b) => (b.kaynak || 'qr') === k).length;

    const gecikenler = aranan.filter((b) =>
        ACIK_DURUMLAR.includes(b.durum) && gunFarki(b.olusturmaZamani) >= GECIKME_GUN);

    const gosterilen = filtre === 'hepsi' ? aranan
        : filtre === 'geciken' ? gecikenler
        : aranan.filter((b) => b.durum === filtre);

    // Sayfalama İSTEMCİDE: kayıtlar zaten tek çağrıda geliyor (sunucu artık
    // sayfa sayfa çekip birleştiriyor). Amaç ağ değil, DOM: bin satırlık tabloyu
    // tek seferde çizmek tarayıcıyı kilitliyordu.
    const SAYFA_BOYU = 50;
    const sonSayfa = Math.max(1, Math.ceil(gosterilen.length / SAYFA_BOYU));
    // Süzgeç/arama sonucu küçülünce elde olmayan bir sayfada kalınmasın.
    const aktifSayfa = Math.min(sayfa, sonSayfa);
    const sayfadakiler = gosterilen.slice((aktifSayfa - 1) * SAYFA_BOYU, aktifSayfa * SAYFA_BOYU);

    // ── SLA özeti ───────────────────────────────────────────────────────
    // Ortalama İLK DÖNÜŞ süresi: yalnızca dönülmüş kayıtlar üzerinden.
    // Dönülmemişleri "sonsuz" sayıp ortalamaya katmak sayıyı anlamsız yapardı;
    // onlar zaten "geciken" sayacında görünüyor.
    // Şerit SÜZÜLMÜŞ kümeyi anlatır: "geciken" sayısı zaten süzgece uyuyordu,
    // açık sayısı ve ortalama uymuyordu — aynı satırda biri süzülü biri değil
    // olunca sayılar birbirini tutmuyormuş gibi görünüyordu.
    const ozet = useMemo(() => {
        const donulen = aranan.filter((b) => b.ilkYanit);
        const toplamSaat = donulen.reduce((t, b) =>
            t + (new Date(b.ilkYanit) - new Date(b.olusturmaZamani)) / 3600000, 0);
        return {
            acik: aranan.filter((b) => ACIK_DURUMLAR.includes(b.durum)).length,
            donulen: donulen.length,
            ortalamaSaat: donulen.length > 0 ? toplamSaat / donulen.length : null,
        };
    }, [aranan]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-3xl leading-none tracking-tight">Şikayet & Geri Bildirim</h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        {subeSekmesi
                            ? (isAdmin
                                ? 'Şubelerin merkeze ilettiği şikayet ve talepler'
                                : 'Merkeze ilettiğiniz şikayet ve talepler')
                            : (isAdmin
                                ? 'QR menüsü, Şikayetvar ve elle eklenen müşteri şikayetleri tek yerde'
                                : 'Şubenize gelen müşteri bildirimleri')}
                    </p>
                </div>
                {/* Ekleme düğmesi SEKMEYE GÖRE: müşteri masasında merkez dış
                    kaynaklı şikayeti elle ekler; şube masasında şube merkeze
                    kendi talebini iletir. İki farklı yön, iki farklı uç. */}
                {subeSekmesi
                    ? subeSikayetiAcabilir && (
                        <Button onClick={() => setSubeEkleAcik(true)}>
                            <Plus className="size-4" /> Merkeze İlet
                        </Button>
                    )
                    : ekleyebilir && (
                        <Button variant="outline" onClick={() => setEkleAcik(true)}>
                            <Plus className="size-4" /> Şikayet Ekle
                        </Button>
                    )}
            </div>

            {/* İki yönlü masa: müşteri → şube ve şube → merkez. */}
            <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground">
                {[
                    { key: 'musteri', ad: 'Müşteri Şikayetleri' },
                    { key: 'sube', ad: 'Şube Şikayetleri' },
                ].map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => sekmeSec(t.key)}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                            tip === t.key ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground'
                        }`}
                    >
                        {t.ad}
                    </button>
                ))}
            </div>

            {/* SLA şeridi — "kaç şikayet açık, ne kadar sürede dönüyoruz".
                Kapalı kayıtlar buraya girmiyor: masanın yükü açık olanlar. */}
            {!loading && aranan.length > 0 && (
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
                {/* Kaynak (QR / Şikayetvar / telefon) yalnızca müşteri
                    şikayetinde anlamlı; şube talebi tek kanaldan geliyor. */}
                {!subeSekmesi && (
                <Select value={kaynakFiltre} onValueChange={(v) => setKaynakFiltre(v)}>
                    <SelectTrigger className="h-9 w-auto min-w-[10rem] text-sm">
                        <span className="flex items-center gap-1.5 truncate">
                            <span className="shrink-0 text-muted-foreground">Kaynak:</span>
                            <SelectValue />
                        </span>
                    </SelectTrigger>
                    <SelectContent align="start">
                        <SelectItem value="hepsi">
                            Tümü <span className="ml-1 tabular-nums text-muted-foreground">{bildirimler.length}</span>
                        </SelectItem>
                        {KAYNAK_KEYS.map((k) => (
                            <SelectItem key={k} value={k}>
                                {KAYNAK[k].label}
                                <span className="ml-1 tabular-nums text-muted-foreground">{kaynakSayim(k)}</span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                )}

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
                            : (filtre === 'hepsi' && kaynakFiltre === 'hepsi')
                                ? 'Henüz geri bildirim yok'
                                : 'Bu süzgeçle kayıt yok'}
                    </p>
                </div>
            ) : (
                // overflow-x-auto: durum seçici ve sil sütunu dar ekranda
                // Tarih'i kırpıyordu; artık kaydırılıyor, kesilmiyor.
                <div className="overflow-x-auto rounded-lg border">
                    {/* table-fixed + yüzdeli genişlik: otomatik yerleşimde uzun
                        şikayet metni Konu sütununu şişirip Durum'u ekran dışına
                        itiyordu. Sabit oranla metin kırpılıyor, sütunlar duruyor. */}
                    <Table className="table-fixed">
                        <TableHeader className="sticky top-0 z-10 bg-background">
                            <TableRow>
                                {/* Kaynak ayrı sütun değil: her satırda tek bir rozet
                                    tekrar ediyordu ve tabloyu genişletiyordu. Rozet
                                    gönderenin yanına taşındı — bilgi duruyor, sütun gitti. */}
                                <TableHead className="w-[22%]">Gönderen</TableHead>
                                <TableHead>Konu</TableHead>
                                {isAdmin && <TableHead className="w-[13%]">Şube</TableHead>}
                                <TableHead className="w-[9%]">Tarih</TableHead>
                                <TableHead className="w-[13%]">Durum</TableHead>
                                {silebilir && <TableHead className="w-12"></TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sayfadakiler.map((b) => {
                                const acik = ACIK_DURUMLAR.includes(b.durum);
                                const gun = gunFarki(b.olusturmaZamani);
                                return (
                                <TableRow key={b.id} className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => detayAc(b)}>
                                    <TableCell className="align-top">
                                        <div className="truncate font-medium">{b.ad || '—'} {b.soyad}</div>
                                        {/* Rozet ve iletişim bilgisi AYNI SATIRDA: ayrı
                                            satırlarda her kayıt üç satır yer kaplıyordu.
                                            Dış kaynakta iletişim bilgisi YOK — Şikayetvar
                                            yalnızca görünen adı yayınlıyor; boş bir "—"
                                            yerine bunu söylemek "eksik veri mi çekilmiş"
                                            sorusunu baştan kapatıyor. */}
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                            <Badge variant="outline" className={`px-1.5 py-0 text-[10px] font-normal ${KAYNAK[b.kaynak || 'qr']?.cls}`}>
                                                {KAYNAK[b.kaynak || 'qr']?.label || b.kaynak}
                                            </Badge>
                                            {/* Takip kodu yalnızca QR menüden gelen kayıtta var
                                                (Şikayetvar kendi numarasını vermiyor). Müşteri
                                                telefonda kodu okuduğunda kayıt tek tıkla
                                                süzülsün diye tıklanabilir. */}
                                            {b.takipNo && (
                                                <button
                                                    type="button"
                                                    title="Bu takip koduyla ara"
                                                    onClick={(e) => { e.stopPropagation(); setArama(b.takipNo); }}
                                                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground hover:bg-muted-foreground/20"
                                                >
                                                    {b.takipNo}
                                                </button>
                                            )}
                                            <span className="truncate">
                                                {b.email || b.telefon
                                                    || ((b.kaynak || 'qr') === 'qr' ? '—' : 'iletişim yok')}
                                            </span>
                                        </div>
                                    </TableCell>
                                    {/* whitespace-normal: TableCell varsayılanı `nowrap`,
                                        metin ikinci satıra hiç geçmiyor ve tek satırda
                                        kırpılıyordu. */}
                                    <TableCell className="align-top whitespace-normal">
                                        {/* Mesaj artık asıl metin: masada "hangi şikayet"
                                            sorusunu kategori rozeti değil ilk cümle
                                            cevaplıyor. İki satır gösterilip kırpılıyor. */}
                                        <p className="line-clamp-2 break-words text-sm text-foreground">{b.mesaj}</p>
                                        <span className="mt-1 inline-block text-xs text-muted-foreground">
                                            {KATEGORI[b.kategori] ?? b.kategori}
                                        </span>
                                    </TableCell>
                                    {isAdmin && (
                                        <TableCell className="align-top text-sm text-muted-foreground">
                                            <span className="block truncate">{b.subeAd || b.subeSlug || '—'}</span>
                                        </TableCell>
                                    )}
                                    <TableCell className="align-top whitespace-nowrap text-xs text-muted-foreground">
                                        {tarihKisaTR(b.olusturmaZamani)}
                                        {/* Yaşlanma yalnızca AÇIK kayıtta: kapanmış şikayetin
                                            "12 gündür bekliyor" demesi yanlış olurdu. */}
                                        {acik && gun >= GECIKME_GUN && (
                                            <div className="mt-1 flex items-center gap-1 font-medium text-destructive"
                                                 title={`${gun} gündür bekliyor`}>
                                                <Clock className="size-3" /> {gun} gün
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="align-top" onClick={(e) => e.stopPropagation()}>
                                        <Select value={b.durum} disabled={!durumDegistirebilir}
                                                onValueChange={(v) => durumGuncelle(b.id, v)}>
                                            <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {DURUM_KEYS.map((k) => (
                                                    <SelectItem key={k} value={k}>{DURUM[k].label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    {silebilir && (
                                        <TableCell className="align-top" onClick={(e) => e.stopPropagation()}>
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

            {!loading && sonSayfa > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                        {gosterilen.length} kayıttan{' '}
                        {(aktifSayfa - 1) * SAYFA_BOYU + 1}–{Math.min(aktifSayfa * SAYFA_BOYU, gosterilen.length)}{' '}
                        arası gösteriliyor
                    </p>
                    <div className="flex items-center gap-1.5">
                        <Button variant="ghost" size="sm" className="gap-1"
                                disabled={aktifSayfa <= 1} onClick={() => setSayfa(aktifSayfa - 1)}>
                            <ChevronLeft className="size-4" /> Önceki
                        </Button>
                        <span className="px-2 text-sm tabular-nums text-muted-foreground">
                            {aktifSayfa} / {sonSayfa}
                        </span>
                        <Button variant="ghost" size="sm" className="gap-1"
                                disabled={aktifSayfa >= sonSayfa} onClick={() => setSayfa(aktifSayfa + 1)}>
                            Sonraki <ChevronRight className="size-4" />
                        </Button>
                    </div>
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
                                    <Badge variant="outline" className={KAYNAK[secili.kaynak || 'qr']?.cls}>
                                        {KAYNAK[secili.kaynak || 'qr']?.label || secili.kaynak}
                                    </Badge>
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

                                {/* ŞUBE ATAMASI — yalnızca merkez. Şikayetvar
                                    kayıtlarının bir kısmı şubesiz ekleniyor ve
                                    şubesiz kayıt hiçbir şube sahibine düşmüyor. */}
                                {isAdmin && !subeSekmesi && (
                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                                            Şube
                                            {!secili.subeSlug && (
                                                <span className="ml-1.5 font-normal text-amber-600 dark:text-amber-500">
                                                    — atanmadı, şube sahibi bu şikayeti görmüyor
                                                </span>
                                            )}
                                        </label>
                                        <SubeSecici
                                            subeler={subeler}
                                            deger={secili.subeSlug || ''}
                                            yerTutucu="Şube seçin"
                                            onSec={(slug) => subeAta(secili.id, slug)}
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Durum</label>
                                    <Select value={secili.durum} disabled={!durumDegistirebilir}
                                            onValueChange={(v) => durumGuncelle(secili.id, v)}>
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
                                            {gecmis.map((g) => <GecmisSatiri key={g.id} g={g} durumlar={DURUM} />)}
                                        </ol>
                                    )}
                                </div>

                                <div className="space-y-2 rounded-lg border p-3">
                                    <div className="flex flex-wrap gap-1.5">
                                        {[
                                            { key: 'not', ad: 'Dahili not', ipucu: 'Yalnızca ekip görür' },
                                            // Dış dönüşü yalnızca merkez yazabilir (sunucu da
                                            // engelliyor): şube kendi talebine "merkez cevap
                                            // verdi" diyemez.
                                            ...(subeSekmesi && !isAdmin ? [] : [{
                                                key: disDonusTuru,
                                                ad: subeSekmesi ? 'Şubeye dönüş' : 'Müşteriye dönüş',
                                                ipucu: 'Aradık / yazdık — SLA saatini durdurur',
                                            }]),
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
                                        placeholder={mesajTur === disDonusTuru
                                            ? (subeSekmesi
                                                ? 'Şubeye ne iletildi? (ör. arandı, sevkiyat planı paylaşıldı)'
                                                : 'Müşteriyle ne konuşuldu? (ör. arandı, özür dilendi, ikram teklif edildi)')
                                            : 'Ekip içi not — karşı taraf görmez'}
                                    />
                                    {/* E-posta gönderme altyapısı YOK: bu kayıt müşteriye
                                        otomatik iletilmiyor, yapılan aramanın izidir. */}
                                    {mesajTur === disDonusTuru && (
                                        <p className="text-[11px] text-muted-foreground">
                                            Bu kayıt karşı tarafa otomatik gönderilmez; yaptığınız
                                            aramanın/yazışmanın izidir.
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

            {subeSikayetiAcabilir && (
                <SubeSikayetDialog
                    acik={subeEkleAcik}
                    isAdmin={isAdmin}
                    onKapat={() => setSubeEkleAcik(false)}
                    onEklendi={() => { setSubeEkleAcik(false); load(); }}
                />
            )}
        </div>
    );
}

/** Akıştaki tek satır — türüne göre ikon ve metin. */
function GecmisSatiri({ g, durumlar }) {
    const TUR = {
        not: { Ikon: MessageSquare, cls: 'text-muted-foreground', ad: 'Dahili not' },
        musteri: { Ikon: PhoneCall, cls: 'text-emerald-600 dark:text-emerald-400', ad: 'Müşteriye dönüş' },
        donut: { Ikon: PhoneCall, cls: 'text-emerald-600 dark:text-emerald-400', ad: 'Merkezden dönüş' },
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
                        {durumlar[g.eskiDurum]?.label ?? g.eskiDurum} → <strong>{durumlar[g.yeniDurum]?.label ?? g.yeniDurum}</strong>
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
                                    {Object.entries(KATEGORILER.musteri).map(([k, ad]) => (
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

/**
 * Şubenin MERKEZE ilettiği şikayet/talep.
 *
 * MÜŞTERİ FORMUNDAN AYRI: burada ad/telefon/KVKK alanı yok — gönderen zaten
 * giriş yapmış kullanıcı, kimliği token'dan biliniyor. Şube de seçtirilmiyor;
 * sunucu şubeyi token'dan alıyor (admin bir şube adına açarsa gövdeden).
 */
function SubeSikayetDialog({ acik, isAdmin, onKapat, onEklendi }) {
    const toast = useToast();
    const [subeler, setSubeler] = useState([]);
    const [form, setForm] = useState({ kategori: 'tedarik', mesaj: '', subeSlug: '' });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Şube listesi yalnızca merkez bir şube adına kayıt açarken gerekli.
        if (!acik || !isAdmin) return;
        api.get('/menu/subeler')
            .then(({ data }) => setSubeler(data.subeler || []))
            .catch(() => setSubeler([]));
    }, [acik, isAdmin]);

    async function kaydet() {
        if (!form.mesaj.trim()) return;
        setSaving(true);
        try {
            await api.post('/geribildirim/sube', {
                kategori: form.kategori,
                mesaj: form.mesaj.trim(),
                ...(isAdmin && form.subeSlug ? { subeSlug: form.subeSlug } : {}),
            });
            setForm({ kategori: 'tedarik', mesaj: '', subeSlug: '' });
            toast.success('Merkeze iletildi');
            onEklendi();
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.error || 'İletilemedi');
        }
        setSaving(false);
    }

    return (
        <Dialog open={acik} onOpenChange={(a) => !a && onKapat()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Merkeze ilet</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {isAdmin && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Şube</label>
                            <SubeSecici
                                subeler={subeler}
                                deger={form.subeSlug}
                                yerTutucu="Şube seçin"
                                onSec={(slug) => setForm({ ...form, subeSlug: slug })}
                            />
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Konu</label>
                        <Select value={form.kategori} onValueChange={(v) => setForm({ ...form, kategori: v })}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {Object.entries(KATEGORILER.sube).map(([k, ad]) => (
                                    <SelectItem key={k} value={k}>{ad}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Şikayet / talep</label>
                        <Textarea
                            rows={6}
                            value={form.mesaj}
                            onChange={(e) => setForm({ ...form, mesaj: e.target.value })}
                            placeholder="Ne oldu, ne bekliyorsunuz? Tarih ve sipariş/sevkiyat numarası varsa yazın."
                        />
                        <p className="text-[11px] text-muted-foreground">
                            Merkez inceledikçe durumu buradan takip edebilirsiniz.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onKapat}>Vazgeç</Button>
                    <Button onClick={kaydet} disabled={saving || !form.mesaj.trim() || (isAdmin && !form.subeSlug)}>
                        {saving ? 'Gönderiliyor...' : 'Gönder'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
