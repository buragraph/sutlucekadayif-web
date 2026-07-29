import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../services/api';
import { Plus, Trash2, X, Search, ArrowUp, ArrowDown, ArrowUpDown, RotateCcw, Trash, ImagePlus, Images, Sparkles, ChevronLeft, ChevronRight, Check, ChevronsUpDown, Tag, ListPlus, ListMinus, Store, Pencil } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { proxyImageUrl } from '../../../utils/imageProxy';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { SubeCokluSecici } from '../components/SubeCokluSecici';

const ETIKETLER = [
    { key: 'en_cok_satan', label: 'En Çok Satan', emoji: '🔥', color: '#ef4444' },
    { key: 'yeni', label: 'Yeni', emoji: '✨', color: '#8b5cf6' },
    { key: 'onerilen', label: 'Önerilen', emoji: '⭐', color: '#f59e0b' },
    { key: 'vegan', label: 'Vegan', emoji: '🌱', color: '#22c55e' },
    { key: 'acili', label: 'Acılı', emoji: '🌶️', color: '#dc2626' },
];

// Referans e-ticaret tablosu tarzı noktalı durum rozeti
const DOT_TONE = {
    green: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
    red: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
    neutral: 'bg-muted text-muted-foreground',
};
const DOT_FILL = {
    green: 'bg-green-500',
    red: 'bg-red-500',
    violet: 'bg-violet-500',
    neutral: 'bg-muted-foreground/50',
};
function DotBadge({ tone = 'neutral', children }) {
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${DOT_TONE[tone]}`}>
            <span className={`size-1.5 rounded-full ${DOT_FILL[tone]}`} />
            {children}
        </span>
    );
}

// Medya kütüphanesinden ("Ürünler" klasörü) görsel seçtiren popover.
// Yükleme yok — görseller yalnızca Medya bölümünden eklenir.
const MEDIA_PAGE = 24;

function MediaPicker({ value, onSelect, children }) {
    const [open, setOpen] = useState(false);
    const [imgs, setImgs] = useState([]);
    const [cursor, setCursor] = useState(null);      // sonraki sayfa imleci (klasör modu)
    const [yedekMod, setYedekMod] = useState(false); // indeks yoksa indekssiz yedek (sayfalama kapalı)
    const [loaded, setLoaded] = useState(false);
    const [loading, setLoading] = useState(false);   // ilk sayfa / arama
    const [loadingMore, setLoadingMore] = useState(false);
    const [q, setQ] = useState('');
    const [aramaSonuc, setAramaSonuc] = useState(null); // arama modunda sonuçlar (null=arama yok)

    // "Ürünler" klasörü — cursor tabanlı sayfalama. İlk sayfa popover açılışta.
    async function sayfaYukle(reset) {
        if (reset) setLoading(true); else setLoadingMore(true);
        try {
            const params = { klasor: 'Ürünler', limit: MEDIA_PAGE };
            if (!reset && cursor) params.cursor = cursor;
            const { data } = await api.get('/media', { params });
            setImgs((prev) => (reset ? (data.medyalar || []) : [...prev, ...(data.medyalar || [])]));
            setCursor(data.nextCursor);
            setLoaded(true);
        } catch {
            // İndeks (klasor+createdAt) yoksa → indekssiz yedek: son medyayı çekip süz.
            if (reset) {
                try {
                    const { data } = await api.get('/media', { params: { limit: 200 } });
                    setImgs((data.medyalar || []).filter((m) => (m.klasor || '') === 'Ürünler'));
                    setCursor(null);
                    setYedekMod(true);
                    setLoaded(true);
                } catch { /* sessiz */ }
            }
        }
        if (reset) setLoading(false); else setLoadingMore(false);
    }

    // İlk açılışta klasör listesini yükle (bir kez)
    useEffect(() => {
        if (open && !loaded && !q.trim()) sayfaYukle(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Arama (debounce, sunucu tarafı isim araması → "Ürünler" klasörüne süz)
    useEffect(() => {
        if (!open) return;
        const ql = q.trim();
        if (!ql) { setAramaSonuc(null); return; }
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const { data } = await api.get('/media', { params: { q: ql } });
                setAramaSonuc((data.medyalar || []).filter((m) => (m.klasor || '') === 'Ürünler'));
            } catch { setAramaSonuc([]); }
            setLoading(false);
        }, 300);
        return () => clearTimeout(t);
    }, [q, open]);

    function onScroll(e) {
        if (yedekMod || aramaSonuc !== null || !cursor || loadingMore) return;
        const el = e.currentTarget;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) sayfaYukle(false);
    }

    const aramaModu = aramaSonuc !== null;
    const gosterilen = aramaModu ? aramaSonuc : imgs;
    const ilkYukleme = loading && gosterilen.length === 0;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{children}</PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="start">
                <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Görsel ara..." className="h-8 pl-8 text-xs" />
                </div>
                {ilkYukleme ? (
                    <div className="flex items-center justify-center py-8"><Spinner className="size-5" /></div>
                ) : gosterilen.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                        {aramaModu ? 'Sonuç bulunamadı' : 'Ürünler klasöründe görsel yok. Medya bölümünden ekleyin.'}
                    </p>
                ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto p-0.5" onScroll={onScroll}>
                        {gosterilen.map((img) => {
                            const secili = value === img.url;
                            return (
                                <button
                                    key={img.id}
                                    type="button"
                                    onClick={() => { onSelect(img.url); setOpen(false); }}
                                    className={`relative aspect-square overflow-hidden rounded-lg border transition-all ${secili ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-muted-foreground/40'}`}
                                    title={img.ad}
                                >
                                    <img src={proxyImageUrl(img.url)} alt={img.ad} className="size-full object-cover" loading="lazy" />
                                    {secili && (
                                        <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow ring-1 ring-background">
                                            <Check className="size-2.5" strokeWidth={3} />
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                        {loadingMore && (
                            <div className="col-span-3 flex items-center justify-center py-2"><Spinner className="size-4" /></div>
                        )}
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}

export default function ProductsPage() {
    const { subeSlug, role } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();
    const [selectedKategori, setSelectedKategori] = useState('all');
    const [selectedSube, setSelectedSube] = useState('ortak');
    const [searchTerm, setSearchTerm] = useState('');
    const [subeComboOpen, setSubeComboOpen] = useState(false);
    const [sortCol, setSortCol] = useState(null);
    const [sortDir, setSortDir] = useState('asc');

    const ITEMS_PER_PAGE = 10;
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedKategori, selectedSube, sortCol, sortDir]);

    const [urunler, setUrunler] = useState([]);
    const [loadingUrunler, setLoadingUrunler] = useState(true);
    const [viewMode, setViewMode] = useState('list');
    const [editingUrun, setEditingUrun] = useState(null);
    const [savingUrun, setSavingUrun] = useState(false);
    // Şube fiyat düzenleme penceresi (yalnızca merkez izin verdiği ürünlerde)
    const [fiyatUrun, setFiyatUrun] = useState(null);
    const [fiyatDeger, setFiyatDeger] = useState('');
    const [fiyatKaydediliyor, setFiyatKaydediliyor] = useState(false);
    const [urunForm, setUrunForm] = useState({ ad: '', fiyat: '', kategori: '', aciklama: '', sube_slug: '', gorsel: '', etiket: [], miktar: '', birim: 'gr', kilitli: '', gizli_subeler: [], fiyat_serbest: [], menude_subeler: [] });
    // Katalogdan menüye ürün ekleme penceresi (şube sahibi) — ürün OLUŞTURMAZ,
    // merkezin eklediği ortak ürünlerden şubenin sattıklarını işaretler.
    const [katalogAcik, setKatalogAcik] = useState(false);
    const [katalogArama, setKatalogArama] = useState('');
    const [katalogSecili, setKatalogSecili] = useState(new Set());
    const [katalogBusy, setKatalogBusy] = useState(false);
    // Mevcutluk anahtarı uçuşta olan ürünler — çift tıklamayı engeller
    const [mevcutBekleyen, setMevcutBekleyen] = useState(new Set());
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);

    const [showTrash, setShowTrash] = useState(false);
    const [trashUrunler, setTrashUrunler] = useState([]);

    const [kategoriler, setKategoriler] = useState([]);
    const [subeler, setSubeler] = useState([]);
    const [ortakUrunSayisi, setOrtakUrunSayisi] = useState(0);

    // ── Toplu işlemler ──
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [showBulkPrice, setShowBulkPrice] = useState(false);
    const [bulkPriceForm, setBulkPriceForm] = useState({ mode: 'set', value: '' });
    const [bulkBusy, setBulkBusy] = useState(false);
    const [bulkAddRows, setBulkAddRows] = useState([]);

    useEffect(() => { loadKategoriler(); }, []);
    useEffect(() => { if (role === 'admin' || subeSlug) loadUrunler(); }, [subeSlug, role, selectedSube]);
    useEffect(() => { if (role === 'admin') loadSubeler(); }, [role]);

    async function loadUrunler(silent = false) {
        if (!silent) setLoadingUrunler(true);
        try {
            const params = role === 'admin' ? { sube: selectedSube } : {};
            const { data } = await api.get('/products', { params });
            setUrunler(data.urunler);
        }
        catch (err) { console.error('Ürünler yüklenemedi:', err); }
        if (!silent) setLoadingUrunler(false);
    }

    async function loadKategoriler() {
        try { const { data } = await api.get('/categories'); setKategoriler(data.kategoriler); }
        catch (err) { console.error('Kategoriler yüklenemedi:', err); }
    }

    async function loadSubeler() {
        try {
            const { data } = await api.get('/branches');
            setSubeler(data.subeler);
            setOrtakUrunSayisi(data.ortakUrunSayisi || 0);
        }
        catch (err) { console.error('Şubeler yüklenemedi:', err); }
    }

    function openAddUrun() {
        setEditingUrun(null);
        // Yeni ortak ürün varsayılan olarak TÜM şubelerin menüsüne düşer (backend
        // de alan gelmezse aynısını yapar). Merkez isterse seçimi daraltır.
        setUrunForm({ ad: '', fiyat: '', kategori: kategoriler[0]?.id || '', aciklama: '', sube_slug: subeSlug || '', gorsel: '', etiket: [], miktar: '', birim: 'gr', kilitli: '', gizli_subeler: [], fiyat_serbest: [], menude_subeler: subeler.map((s) => s.slug) });
        setImageFile(null); setImagePreview(null);
        setViewMode('add');
    }

    function openEditUrun(urun) {
        setEditingUrun(urun);
        setUrunForm({ ad: urun.ad, fiyat: urun.fiyat, kategori: urun.kategori || '', aciklama: urun.aciklama || '', sube_slug: urun.sube_slug || '', gorsel: urun.gorsel || '', etiket: urun.etiket || [], miktar: urun.miktar || '', birim: urun.birim || 'gr', kilitli: typeof urun.kilitli === 'boolean' ? (urun.kilitli ? 'evet' : 'hayir') : '', gizli_subeler: urun.gizli_subeler || [], fiyat_serbest: urun.fiyat_serbest || [], menude_subeler: urun.menude_subeler || [] });
        setImageFile(null); setImagePreview(urun.gorsel || null);
        setViewMode('edit');
    }

    function closeUrunView() { setViewMode('list'); setEditingUrun(null); setImageFile(null); setImagePreview(null); }

    async function handleUrunSubmit(e) {
        e.preventDefault();
        setSavingUrun(true);
        try {
            const payload = { ad: urunForm.ad, fiyat: Number(urunForm.fiyat), kategori: urunForm.kategori, aciklama: urunForm.aciklama, etiket: urunForm.etiket || [], miktar: urunForm.miktar ? Number(urunForm.miktar) : null, birim: urunForm.birim || '' };
            // Ürün bazlı kilit — yalnızca admin gönderir. '' => null: bayrak
            // kaldırılır, kilit yine kategoriden miras alınır.
            if (role === 'admin') {
                payload.kilitli = urunForm.kilitli === '' ? null : urunForm.kilitli === 'evet';
                // Şube bazlı merkez ayarları — yalnızca ortak üründe anlamlı
                const kat = kategoriler.find((k) => k.id === urunForm.kategori);
                if (!kat || kat.tur !== 'sube_ozel') {
                    payload.gizli_subeler = urunForm.gizli_subeler || [];
                    payload.fiyat_serbest = urunForm.fiyat_serbest || [];
                    payload.menude_subeler = urunForm.menude_subeler || [];
                }
            }
            const selectedKat = kategoriler.find((k) => k.id === urunForm.kategori);
            if (selectedKat && (selectedKat.tur === 'sube_ozel') && urunForm.sube_slug) {
                payload.sube_slug = urunForm.sube_slug;
            }
            if (imageFile) {
                const formData = new FormData();
                formData.append('image', imageFile);
                formData.append('folder', 'urunler');
                const { data: uploadData } = await api.post('/upload/image', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                payload.gorsel = uploadData.url;
            } else if (urunForm.gorsel) {
                payload.gorsel = urunForm.gorsel;
            }
            if (editingUrun) {
                const { data } = await api.put(`/products/${editingUrun.id}`, payload);
                setUrunler(prev => prev.map(u => u.id === editingUrun.id ? data.urun : u));
            } else {
                const { data } = await api.post('/products', payload);
                setUrunler(prev => [...prev, { id: data.id, ...data }]);
            }
            closeUrunView();
            toast.success(editingUrun ? 'Ürün güncellendi' : 'Ürün eklendi');
        } catch (err) { toast.error(err.response?.data?.error || 'Bir hata oluştu'); }
        setSavingUrun(false);
    }

    async function handleUrunDelete(urun) {
        const ok = await confirm(`"${urun.ad}" ürünü silmek istediğinize emin misiniz?`);
        if (!ok) return;
        try {
            const queryParam = urun.tur === 'sube_ozel' && urun.sube_slug ? `?subeSlug=${urun.sube_slug}` : '';
            await api.delete(`/products/${urun.id}${queryParam}`);
            setUrunler(prev => prev.filter(u => u.id !== urun.id));
            toast.success('Ürün çöp kutusuna taşındı');
        }
        catch (err) { toast.error(err.response?.data?.error || 'Silme işlemi başarısız'); }
    }

    // ── Katalog → menü ──
    // Şube, merkezin eklediği ortak ürünlerden sattıklarını menüsüne alır.
    // Tekil çıkarma da çoklu ekleme de aynı uçtan geçer: menü JSON'ı işlem
    // başına bir kez yenilenir (ürün başına değil).
    async function menuyeYaz(ids, menude) {
        const { data } = await api.post('/products/menu', { ids, menude, subeSlug });
        setUrunler((prev) => prev.map((u) => (ids.includes(u.id) ? { ...u, menude } : u)));
        return data.islenen;
    }

    async function handleKatalogEkle() {
        const ids = [...katalogSecili];
        if (ids.length === 0) return;
        setKatalogBusy(true);
        try {
            const n = await menuyeYaz(ids, true);
            toast.success(`${n} ürün menünüze eklendi`);
            setKatalogAcik(false); setKatalogSecili(new Set()); setKatalogArama('');
        } catch (err) { toast.error(err.response?.data?.error || 'Ürün eklenemedi'); }
        setKatalogBusy(false);
    }

    // Mevcut / mevcut değil — İYİMSER güncelleme: anahtar anında düşer, istek
    // başarısız olursa eski değere geri alınır. Sunucu yanıtını beklemek
    // anahtarı "takılıyor" gibi gösteriyordu.
    async function handleMevcutToggle(urun, mevcut) {
        const oncekiMevcutDegil = urun.mevcut_degil || [];
        setUrunler((prev) => prev.map((u) => (u.id === urun.id ? {
            ...u,
            mevcut_degil: mevcut
                ? oncekiMevcutDegil.filter((s) => s !== subeSlug)
                : [...oncekiMevcutDegil, subeSlug],
        } : u)));
        setMevcutBekleyen((p) => new Set(p).add(urun.id));
        try {
            await api.put(`/products/${urun.id}/availability`, { subeSlug, mevcut });
        } catch (err) {
            setUrunler((prev) => prev.map((u) => (u.id === urun.id ? { ...u, mevcut_degil: oncekiMevcutDegil } : u)));
            toast.error(err.response?.data?.error || 'Güncelleme başarısız');
        }
        setMevcutBekleyen((p) => { const n = new Set(p); n.delete(urun.id); return n; });
    }

    async function handleMenudenCikar(urun) {
        const ok = await confirm(`"${urun.ad}" menünüzden çıkarılsın mı? Katalogdan tekrar ekleyebilirsiniz.`);
        if (!ok) return;
        try {
            await menuyeYaz([urun.id], false);
            toast.success('Ürün menünüzden çıkarıldı');
        } catch (err) { toast.error(err.response?.data?.error || 'Ürün çıkarılamadı'); }
    }

    const katMap = {};
    kategoriler.forEach((k) => { katMap[k.id] = k.ad; });

    // Şube sahibinin listesi = KENDİ menüsündeki ürünler. Menüde olmayan ortak
    // ürünler "Ürün Ekle" katalog penceresinde durur. `menude` sunucuda hesaplanır
    // (bkz. backend menudeMi) — burada kural yeniden yazılmaz.
    const menuUrunleri = urunler.filter((u) => u.menude !== false);
    const katalogUrunleri = urunler.filter((u) => u.menude === false);

    // Kategori rayı — şube sahibinde YALNIZCA menüsünde ürünü olan kategoriler.
    // Ortak katalog opt-in olduğu için şubenin hiç ürün almadığı kategoriler
    // tıklandığında boş liste veriyordu. Ray, arama sonucuna değil şubenin tüm
    // menüsüne bakar; yoksa kullanıcı yazdıkça sekmeler kaybolurdu.
    // Admin taksonomiyi bütün görmeli (ürünü kategorilere o dağıtıyor).
    const doluKatIdleri = new Set(menuUrunleri.map((u) => u.kategori));
    const gosterilecekKategoriler = role === 'admin'
        ? kategoriler
        : kategoriler.filter((k) => doluKatIdleri.has(k.id));

    // Seçili kategori artık rayda yoksa (son ürün menüden çıkarıldı) "Tümü" gibi
    // davran. Durumu sıfırlamıyoruz: ürün geri eklenince sekme seçili döner.
    const etkinKategori = selectedKategori !== 'all' && !gosterilecekKategoriler.some((k) => k.id === selectedKategori)
        ? 'all'
        : selectedKategori;

    const filteredUrunler = menuUrunleri.filter((u) => {
        const matchKategori = etkinKategori === 'all' || u.kategori === etkinKategori;
        const matchSearch = !searchTerm || u.ad.toLowerCase().includes(searchTerm.toLowerCase());
        let matchSube = true;
        if (role === 'admin' && selectedSube !== 'all') {
            if (selectedSube === 'ortak') {
                matchSube = u.tur !== 'sube_ozel';
            } else {
                matchSube = u.tur === 'sube_ozel' && u.sube_slug === selectedSube;
            }
        }
        return matchKategori && matchSearch && matchSube;
    });

    const toggleSort = (col) => {
        if (sortCol === col) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortCol(col);
            setSortDir('asc');
        }
    };

    const SortIcon = ({ col }) => {
        if (sortCol !== col) return <ArrowUpDown className="size-3 ml-1 opacity-25" />;
        return sortDir === 'asc' ? <ArrowUp className="size-3 ml-1 opacity-70" /> : <ArrowDown className="size-3 ml-1 opacity-70" />;
    };

    const sortedUrunler = [...filteredUrunler].sort((a, b) => {
        if (!sortCol) return 0;
        const dir = sortDir === 'asc' ? 1 : -1;
        if (sortCol === 'ad') return dir * a.ad.localeCompare(b.ad, 'tr');
        if (sortCol === 'fiyat') return dir * ((a.fiyat || 0) - (b.fiyat || 0));
        if (sortCol === 'kategori') return dir * (katMap[a.kategori] || '').localeCompare(katMap[b.kategori] || '', 'tr');
        if (sortCol === 'tarih') return dir * ((a.createdAt || '').localeCompare(b.createdAt || ''));
        return 0;
    });

    const paginatedUrunler = sortedUrunler.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    const totalPages = Math.ceil(sortedUrunler.length / ITEMS_PER_PAGE);

    // ── Toplu işlem yardımcıları ──
    // Kilit kuralı sunucuda çözülür (bkz. backend urunKilitliMi) ve her ürüne
    // `duzenlenemez` olarak gelir — burada YENİDEN HESAPLAMA, yoksa iki kopya
    // ayrışır ve arayüz izin verirken backend 403 döner.
    const seciliebilir = (u) => !u.duzenlenemez;
    const secilebilirSayfa = paginatedUrunler.filter(seciliebilir);
    const tumuSeciliMi = secilebilirSayfa.length > 0 && secilebilirSayfa.every(u => selectedIds.has(u.id));
    const selectedItems = () => urunler.filter(u => selectedIds.has(u.id)).map(u => ({ id: u.id, sube_slug: u.sube_slug }));

    function toggleSelect(id) {
        setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    }
    function toggleSelectAllPage() {
        setSelectedIds(prev => {
            const n = new Set(prev);
            if (tumuSeciliMi) secilebilirSayfa.forEach(u => n.delete(u.id));
            else secilebilirSayfa.forEach(u => n.add(u.id));
            return n;
        });
    }
    function clearSelection() { setSelectedIds(new Set()); }

    async function handleBulkPrice() {
        const value = Number(bulkPriceForm.value);
        if (!Number.isFinite(value)) { toast.error('Geçerli bir değer girin'); return; }
        setBulkBusy(true);
        try {
            const { data } = await api.put('/products/bulk-price', { items: selectedItems(), mode: bulkPriceForm.mode, value });
            toast.success(`${data.updated} ürünün fiyatı güncellendi`);
            setShowBulkPrice(false); setBulkPriceForm({ mode: 'set', value: '' });
            clearSelection(); await loadUrunler(true);
        } catch (err) { toast.error(err.response?.data?.error || 'Toplu fiyat güncellenemedi'); }
        setBulkBusy(false);
    }

    async function handleBulkDelete() {
        const ok = await confirm(`${selectedIds.size} ürünü silmek istediğinize emin misiniz?`);
        if (!ok) return;
        setBulkBusy(true);
        try {
            const { data } = await api.post('/products/bulk-delete', { items: selectedItems() });
            toast.success(`${data.deleted} ürün silindi`);
            clearSelection(); await loadUrunler(true); loadKategoriler();
        } catch (err) { toast.error(err.response?.data?.error || 'Toplu silme başarısız'); }
        setBulkBusy(false);
    }

    // ── Toplu ekleme ──
    const yeniBulkRow = () => ({ ad: '', fiyat: '', kategori: kategoriler[0]?.id || '', miktar: '', birim: 'gr', gorsel: '' });
    function openBulkAdd() { setBulkAddRows([yeniBulkRow(), yeniBulkRow(), yeniBulkRow()]); setViewMode('bulkAdd'); }
    function addBulkRow() { setBulkAddRows(r => [...r, yeniBulkRow()]); }
    function removeBulkRow(i) { setBulkAddRows(r => r.filter((_, idx) => idx !== i)); }
    function updateBulkRow(i, field, val) { setBulkAddRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row)); }
    async function handleBulkAddSubmit() {
        const gecerli = bulkAddRows.filter(r => r.ad.trim() && r.fiyat !== '' && r.kategori);
        if (gecerli.length === 0) { toast.error('En az bir geçerli ürün satırı girin (ad, fiyat, kategori)'); return; }
        setBulkBusy(true);
        try {
            const products = gecerli.map(r => ({
                ad: r.ad.trim(), fiyat: Number(r.fiyat), kategori: r.kategori,
                sube_slug: role === 'admin' ? (selectedSube !== 'all' && selectedSube !== 'ortak' ? selectedSube : undefined) : subeSlug,
                miktar: r.miktar ? Number(r.miktar) : null, birim: r.birim || '',
                gorsel: r.gorsel && r.gorsel !== 'loading' ? r.gorsel : '',
            }));
            const { data } = await api.post('/products/bulk', { products });
            toast.success(`${data.created} ürün eklendi`);
            setViewMode('list'); await loadUrunler(true); loadKategoriler();
        } catch (err) { toast.error(err.response?.data?.error || 'Toplu ekleme başarısız'); }
        setBulkBusy(false);
    }

    // ---------- DETAIL / FORM VIEW ----------
    // ---------- BULK ADD VIEW (tam sayfa) ----------
    if (viewMode === 'bulkAdd') {
        const gecerliSayi = bulkAddRows.filter(r => r.ad.trim() && r.fiyat !== '' && r.kategori).length;
        const katSecenek = role === 'admin' ? kategoriler : kategoriler.filter(k => k.tur === 'sube_ozel');
        return (
            <div className="flex flex-1 flex-col gap-4 w-full h-full min-h-0">
                {/* Header */}
                <div className="flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => setViewMode('list')}>
                            <ChevronLeft className="size-4" />
                        </Button>
                        <div>
                            <p className="text-xs text-muted-foreground">Ürünler</p>
                            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">Toplu Ürün Ekle</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={() => setViewMode('list')}>İptal</Button>
                        <Button onClick={handleBulkAddSubmit} disabled={bulkBusy || gecerliSayi === 0}>
                            {bulkBusy ? 'Ekleniyor...' : `${gecerliSayi > 0 ? gecerliSayi + ' ' : ''}Ürünü Ekle`}
                        </Button>
                    </div>
                </div>

                <Card className="flex flex-1 min-h-0 flex-col rounded-2xl">
                    <CardContent className="flex flex-1 min-h-0 flex-col gap-2 pt-5">
                        {/* Sütun başlıkları */}
                        <div className="hidden md:grid grid-cols-[56px_1fr_110px_1fr_80px_88px_36px] gap-2 px-1 text-xs font-medium text-muted-foreground shrink-0">
                            <span>Görsel</span><span>Ürün Adı</span><span>Fiyat ₺</span><span>Kategori</span><span>Miktar</span><span>Birim</span><span></span>
                        </div>
                        {/* Satırlar */}
                        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pr-1">
                            {bulkAddRows.map((row, i) => (
                                <div key={i} className="grid grid-cols-2 md:grid-cols-[56px_1fr_110px_1fr_80px_88px_36px] gap-2 items-center rounded-lg border p-2 md:border-0 md:p-0">
                                    {/* Görsel — medyadaki "Ürünler" klasöründen seçilir */}
                                    <MediaPicker value={row.gorsel} onSelect={(url) => updateBulkRow(i, 'gorsel', url)}>
                                        <button type="button" className="relative flex size-14 md:size-12 cursor-pointer items-center justify-center overflow-hidden rounded-lg border bg-muted/40 hover:bg-muted">
                                            {row.gorsel ? (
                                                <img src={proxyImageUrl(row.gorsel)} alt="" className="size-full object-cover" />
                                            ) : (
                                                <ImagePlus className="size-4 text-muted-foreground" />
                                            )}
                                        </button>
                                    </MediaPicker>
                                    <Input value={row.ad} onChange={(e) => updateBulkRow(i, 'ad', e.target.value)} placeholder="Ürün adı" className="h-9 text-sm" />
                                    <Input type="number" min="0" value={row.fiyat} onChange={(e) => updateBulkRow(i, 'fiyat', e.target.value)} placeholder="0" className="h-9 text-sm" />
                                    <Select value={row.kategori} onValueChange={(v) => updateBulkRow(i, 'kategori', v)}>
                                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Kategori" /></SelectTrigger>
                                        <SelectContent>
                                            {katSecenek.map(k => <SelectItem key={k.id} value={k.id}>{k.ad}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Input type="number" min="0" value={row.miktar} onChange={(e) => updateBulkRow(i, 'miktar', e.target.value)} placeholder="-" className="h-9 text-sm" />
                                    <Select value={row.birim} onValueChange={(v) => updateBulkRow(i, 'birim', v)}>
                                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="gr">gr</SelectItem>
                                            <SelectItem value="ml">ml</SelectItem>
                                            <SelectItem value="cl">cl</SelectItem>
                                            <SelectItem value="lt">lt</SelectItem>
                                            <SelectItem value="adet">adet</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button variant="ghost" size="icon" className="size-9 text-muted-foreground hover:text-destructive justify-self-end" onClick={() => removeBulkRow(i)}><X className="size-4" /></Button>
                                </div>
                            ))}
                        </div>
                        <Button variant="outline" size="sm" className="w-full shrink-0" onClick={addBulkRow}><Plus className="size-4 mr-1.5" /> Satır Ekle</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ---------- ADD / EDIT VIEW (tam sayfa) ----------
    if (viewMode === 'add' || viewMode === 'edit') {
        return (
            <div className="flex flex-1 flex-col gap-4 w-full h-full min-h-0">
                {/* Header */}
                <div className="flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={closeUrunView}>
                            <ChevronLeft className="size-4" />
                        </Button>
                        <div>
                            <p className="text-xs text-muted-foreground">Ürünler</p>
                            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">{viewMode === 'edit' ? editingUrun?.ad || 'Ürün Detayı' : 'Yeni Ürün Oluştur'}</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={closeUrunView}>İptal</Button>
                        <Button onClick={() => document.getElementById('urunFormSubmitBtn').click()} disabled={savingUrun}>
                            {savingUrun ? 'Kaydediliyor...' : viewMode === 'edit' ? 'Güncelle' : 'Oluştur'}
                        </Button>
                    </div>
                </div>

                {/* Form */}
                <div className="flex-1 overflow-y-auto pb-10 min-h-0">
                    <form id="urunForm" onSubmit={handleUrunSubmit}>
                        <div className="rounded-xl border border-border bg-card overflow-hidden">
                            {/* Section 1: Image + Name + Price */}
                            <div className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
                                    {/* Image — yalnızca "Ürünler" klasöründen seçilir */}
                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground font-medium">Görsel</Label>
                                        <MediaPicker value={urunForm.gorsel} onSelect={(url) => { setImageFile(null); setImagePreview(url); setUrunForm((prev) => ({ ...prev, gorsel: url })); }}>
                                            {imagePreview ? (
                                                <button type="button" className="group/img relative block w-full aspect-square overflow-hidden rounded-xl ring-1 ring-border">
                                                    <img src={proxyImageUrl(imagePreview)} alt="Önizleme" className="size-full object-cover" />
                                                    <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/0 text-xs font-medium text-white opacity-0 transition-colors group-hover/img:bg-black/40 group-hover/img:opacity-100">
                                                        <ImagePlus className="size-3.5" /> Değiştir
                                                    </span>
                                                </button>
                                            ) : (
                                                <button type="button"
                                                    className="flex w-full aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/20 text-muted-foreground transition-colors hover:border-primary/30 hover:bg-muted/40">
                                                    <Images className="size-8 opacity-40" />
                                                    <span className="text-[11px] font-medium">Görsel Seç</span>
                                                </button>
                                            )}
                                        </MediaPicker>
                                        {imagePreview && (
                                            <Button type="button" variant="ghost" size="sm" className="w-full text-xs h-7 text-muted-foreground hover:text-destructive" onClick={() => { setImageFile(null); setImagePreview(null); setUrunForm({ ...urunForm, gorsel: '' }); }}>
                                                <X className="size-3" /> Kaldır
                                            </Button>
                                        )}
                                    </div>

                                    {/* Core Fields */}
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <Label>Ürün Adı</Label>
                                            <Input type="text" value={urunForm.ad} onChange={(e) => setUrunForm({ ...urunForm, ad: e.target.value })} placeholder="örn: Soğuk Kadayıf" required autoFocus className="h-10 text-base font-medium" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <Label>Fiyat (₺)</Label>
                                                <Input type="number" value={urunForm.fiyat} onChange={(e) => setUrunForm({ ...urunForm, fiyat: e.target.value })} placeholder="0" required min="0" step="0.01" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Kategori</Label>
                                                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={urunForm.kategori} onChange={(e) => setUrunForm({ ...urunForm, kategori: e.target.value })} required>
                                                    <option value="">Seçiniz</option>
                                                    {(role === 'admin' ? kategoriler : kategoriler.filter(k => k.tur === 'sube_ozel')).map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Ürün bazlı kilit — yalnızca admin, yalnızca şubeye özel ürünlerde.
                                            Ortak ürünlerde göstermiyoruz: onlar tek doküman olduğu için zaten
                                            her zaman kilitli, bayrakla açılamaz. */}
                                        {(() => {
                                            const selectedKat = kategoriler.find((k) => k.id === urunForm.kategori);
                                            if (role !== 'admin' || !selectedKat || selectedKat.tur !== 'sube_ozel') return null;
                                            const katKilitli = !!selectedKat.kilitli;
                                            return (
                                                <div className="space-y-1.5">
                                                    <Label>Şube düzenleyebilsin mi?</Label>
                                                    <select
                                                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                                                        value={urunForm.kilitli}
                                                        onChange={(e) => setUrunForm({ ...urunForm, kilitli: e.target.value })}
                                                    >
                                                        <option value="">Kategoriden miras ({katKilitli ? 'kilitli' : 'düzenlenebilir'})</option>
                                                        <option value="hayir">Şube düzenleyebilir</option>
                                                        <option value="evet">Kilitli — şube yalnızca mevcut/mevcut değil yapar</option>
                                                    </select>
                                                </div>
                                            );
                                        })()}

                                        {/* Merkez ayarları — yalnızca admin, yalnızca ORTAK ürünlerde.
                                            Şubeye özel üründe anlamsız: o ürün zaten tek şubeye ait. */}
                                        {(() => {
                                            const selectedKat = kategoriler.find((k) => k.id === urunForm.kategori);
                                            if (role !== 'admin' || subeler.length === 0) return null;
                                            if (selectedKat && selectedKat.tur === 'sube_ozel') return null;
                                            return (
                                                <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                                                    <p className="text-xs font-medium text-muted-foreground">Şube ayarları</p>

                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs">
                                                            Menüsünde gösterecek şubeler
                                                            <span className="ml-1 font-normal text-muted-foreground">
                                                                — şube kendi de ekleyip çıkarabilir
                                                            </span>
                                                        </Label>
                                                        <SubeCokluSecici
                                                            subeler={subeler}
                                                            secili={urunForm.menude_subeler || []}
                                                            onChange={(v) => setUrunForm({ ...urunForm, menude_subeler: v })}
                                                            placeholder="Hiçbiri — hiçbir menüde görünmez"
                                                        />
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs">
                                                            Bu ürünü göremeyecek şubeler
                                                            <span className="ml-1 font-normal text-muted-foreground">
                                                                — panelde de görünmez, açamazlar
                                                            </span>
                                                        </Label>
                                                        <SubeCokluSecici
                                                            subeler={subeler}
                                                            secili={urunForm.gizli_subeler || []}
                                                            onChange={(v) => setUrunForm({ ...urunForm, gizli_subeler: v })}
                                                            placeholder="Tüm şubeler görebilir"
                                                        />
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs">
                                                            Kendi fiyatını girebilecek şubeler
                                                            <span className="ml-1 font-normal text-muted-foreground">
                                                                — yalnızca kendi menüsünü etkiler
                                                            </span>
                                                        </Label>
                                                        <SubeCokluSecici
                                                            subeler={subeler}
                                                            secili={urunForm.fiyat_serbest || []}
                                                            onChange={(v) => setUrunForm({ ...urunForm, fiyat_serbest: v })}
                                                            placeholder="Hiçbiri — merkez fiyatı geçerli"
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <Label>Miktar <span className="text-muted-foreground font-normal text-xs">(opsiyonel)</span></Label>
                                                <div className="flex items-center gap-1.5">
                                                    <Input type="number" value={urunForm.miktar} onChange={(e) => setUrunForm({ ...urunForm, miktar: e.target.value })} placeholder="200" min="0" className="flex-1" />
                                                    <select className="flex h-9 w-16 rounded-md border border-input bg-transparent px-1.5 py-1 text-sm" value={urunForm.birim} onChange={(e) => setUrunForm({ ...urunForm, birim: e.target.value })}>
                                                        <option value="gr">gr</option>
                                                        <option value="ml">ml</option>
                                                        <option value="cl">cl</option>
                                                        <option value="lt">lt</option>
                                                        <option value="adet">adet</option>
                                                    </select>
                                                </div>
                                            </div>
                                            {(() => {
                                                const selectedKat = kategoriler.find((k) => k.id === urunForm.kategori);
                                                if (selectedKat && selectedKat.tur === 'sube_ozel' && role === 'admin') {
                                                    return (
                                                        <div className="space-y-1.5">
                                                            <Label>Şube</Label>
                                                            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs" value={urunForm.sube_slug} onChange={(e) => setUrunForm({ ...urunForm, sube_slug: e.target.value })} required>
                                                                <option value="">Şube seçiniz</option>
                                                                {subeler.map((s) => <option key={s.slug} value={s.slug}>{s.ad || s.slug}</option>)}
                                                            </select>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-border" />

                            {/* Section 2: Açıklama */}
                            <div className="p-6">
                                <div className="flex items-center justify-between mb-3">
                                    <Label className="text-sm font-semibold">Açıklama</Label>
                                    <Button type="button" size="sm" disabled={aiLoading || !urunForm.ad.trim()} onClick={async () => {
                                        setAiLoading(true);
                                        try {
                                            const katAd = kategoriler.find(k => k.id === urunForm.kategori)?.ad || '';
                                            const { data } = await api.post('/ai/generate-description', {
                                                ad: urunForm.ad, kategori: katAd,
                                                miktar: urunForm.miktar || null, birim: urunForm.birim || '',
                                            });
                                            if (data.description) setUrunForm(prev => ({ ...prev, aciklama: data.description }));
                                        } catch (err) { toast.error('AI açıklama oluşturulamadı'); }
                                        setAiLoading(false);
                                    }}
                                        className="h-7 bg-gradient-to-r from-violet-500 to-indigo-500 text-xs text-white hover:from-violet-600 hover:to-indigo-600 shadow-sm">
                                        <Sparkles className="size-3" />
                                        {aiLoading ? 'Yazılıyor...' : 'AI ile yaz'}
                                    </Button>
                                </div>
                                <Textarea value={urunForm.aciklama} onChange={(e) => setUrunForm({ ...urunForm, aciklama: e.target.value })} placeholder="Ürün açıklaması (opsiyonel)" rows={3} className="resize-none" />
                            </div>

                            <div className="border-t border-border" />

                            {/* Section 3: Etiketler */}
                            <div className="p-6">
                                <Label className="text-sm font-semibold mb-3 block">Etiketler</Label>
                                <div className="flex flex-wrap gap-2">
                                    {ETIKETLER.map(tag => {
                                        const active = (urunForm.etiket || []).includes(tag.key);
                                        return (
                                            <button key={tag.key} type="button" onClick={() => {
                                                const current = urunForm.etiket || [];
                                                setUrunForm({ ...urunForm, etiket: active ? current.filter(k => k !== tag.key) : [...current, tag.key] });
                                            }} className={`rounded-full border-2 px-3.5 py-1.5 text-xs font-medium transition-all ${active ? 'font-bold shadow-sm' : 'border-border text-muted-foreground hover:border-muted-foreground/40'}`}
                                                style={active ? { borderColor: tag.color, background: tag.color + '18', color: tag.color } : {}}>
                                                {tag.emoji} {tag.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <button id="urunFormSubmitBtn" type="submit" className="hidden" />
                    </form>
                </div>
            </div>
        );
    }

    // ---------- LIST VIEW ----------
    return (
        <div className="flex flex-1 flex-col gap-4 w-full h-full min-h-0">
            {role !== 'admin' && !subeSlug && (
                <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive shrink-0">
                    Şube bilginiz tanımlanmamış. Yönetici ile iletişime geçin.
                </div>
            )}

            <Card className="flex flex-1 min-h-0 flex-col rounded-2xl">
                <CardHeader className="flex flex-col items-start gap-3 space-y-0 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="flex items-baseline gap-2.5 text-foreground text-2xl font-semibold tracking-tight leading-none">
                        Ürünler
                        <span className="text-sm font-normal text-muted-foreground tabular-nums">{sortedUrunler.length} ürün</span>
                    </CardTitle>
                    <CardAction className="flex flex-wrap items-center gap-1.5 self-center max-sm:w-full">
                        {selectedIds.size > 0 && (
                            <div className="flex items-center gap-1.5 mr-1.5 pr-2.5 border-r">
                                <span className="text-xs font-medium text-foreground whitespace-nowrap">{selectedIds.size} seçili</span>
                                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setBulkPriceForm({ mode: 'set', value: '' }); setShowBulkPrice(true); }}>
                                    <Tag className="size-3.5 mr-1.5" /> Toplu Fiyat
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 text-xs text-destructive hover:text-destructive" onClick={handleBulkDelete} disabled={bulkBusy}>
                                    <Trash2 className="size-3.5 mr-1.5" /> Toplu Sil
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clearSelection}>Temizle</Button>
                            </div>
                        )}
                        {/* Ürün OLUŞTURMA ve SİLME yalnızca merkezde. Şube sahibi ortak
                            katalogtan seçim yapar — "Ürün Ekle" katalog penceresini açar.
                            "Silinenler" de merkeze ait: şube ortak ürünü silemediği ve
                            artık şubeye özel ürün oluşturamadığı için çöp kutusuna hiçbir
                            zaman kayıt düşüremiyor — buton her şubede boş açılıyordu.
                            (Menüden çıkarma silme değildir; kayıt katalogda kalır.) */}
                        {role === 'admin' ? (
                            <>
                                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={async () => {
                                    try { const { data } = await api.get('/products/trash'); setTrashUrunler(data.urunler); setShowTrash(true); }
                                    catch { toast.error('Çöp kutusu yüklenemedi'); }
                                }}>
                                    <Trash className="size-3.5 mr-1.5" /> Silinenler
                                </Button>
                                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={openBulkAdd}>
                                    <ListPlus className="size-3.5 mr-1.5" /> Toplu Ekle
                                </Button>
                                <Button size="sm" className="h-8 text-xs" onClick={openAddUrun}>
                                    <Plus className="size-3.5 mr-1.5" /> Yeni Ürün
                                </Button>
                            </>
                        ) : (
                            <Button size="sm" className="h-8 text-xs" onClick={() => { setKatalogSecili(new Set()); setKatalogArama(''); setKatalogAcik(true); }}>
                                <Plus className="size-3.5 mr-1.5" /> Ürün Ekle
                            </Button>
                        )}
                    </CardAction>
                </CardHeader>
                <CardContent className="flex flex-1 min-h-0 flex-col gap-4 px-0">
            {loadingUrunler ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                    <Spinner className="size-8" />
                    <p className="text-sm text-muted-foreground">Ürünler yükleniyor...</p>
                </div>
            ) : menuUrunleri.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                    <span className="text-4xl">📋</span>
                    {role !== 'admin' && katalogUrunleri.length > 0 ? (
                        <>
                            <p>Menünüzde ürün yok</p>
                            <p className="text-xs">Katalogda {katalogUrunleri.length} ürün var — "Ürün Ekle" ile sattıklarınızı seçin.</p>
                        </>
                    ) : (
                        <p>Henüz ürün eklenmemiş</p>
                    )}
                </div>
            ) : (
                <div className="flex flex-col gap-4 flex-1 min-h-0">
                    {/* Toolbar: kategori segment toggle + arama + şube */}
                    <div className="flex flex-col gap-3 px-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="max-w-full overflow-x-auto">
                            <div className="inline-flex w-max items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground">
                                {[{ id: 'all', ad: 'Tümü' }, ...gosterilecekKategoriler].map((k) => {
                                    const active = etkinKategori === k.id;
                                    return (
                                        <button
                                            key={k.id}
                                            onClick={() => setSelectedKategori(k.id)}
                                            className={`rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${active ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground'}`}
                                        >
                                            {k.ad}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="relative w-full sm:w-56">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                                <Input
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Ürün ara..."
                                    className="h-8 pl-8 text-xs"
                                />
                            </div>
                            {role === 'admin' && subeler.length > 0 && (
                                <Popover open={subeComboOpen} onOpenChange={setSubeComboOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" role="combobox" aria-expanded={subeComboOpen} className="w-fit min-w-[180px] justify-between font-normal text-sm h-8">
                                            {selectedSube === 'all' ? 'Tüm Şubeler' : selectedSube === 'ortak' ? `Ortak Ürünler (${ortakUrunSayisi})` : (() => { const s = subeler.find(s => s.slug === selectedSube); return s ? `${s.ad} (${s.urunSayisi || 0})` : selectedSube; })()}
                                            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[260px] p-0" align="end">
                                        <Command>
                                            <CommandInput placeholder="Şube ara..." />
                                            <CommandList>
                                                <CommandEmpty>Şube bulunamadı.</CommandEmpty>
                                                <CommandGroup>
                                                    <CommandItem value="ortak" data-checked={selectedSube === 'ortak'} onSelect={() => { setSelectedSube('ortak'); setSubeComboOpen(false); }}>
                                                        Ortak Ürünler ({ortakUrunSayisi})
                                                    </CommandItem>
                                                    {subeler.map((s) => (
                                                        <CommandItem key={s.id} value={s.ad || s.slug} data-checked={selectedSube === s.slug} onSelect={() => { setSelectedSube(s.slug); setSubeComboOpen(false); }}>
                                                            {s.ad} ({s.urunSayisi || 0})
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            )}
                        </div>
                    </div>

                    {/* Tablo */}
                    <div className="flex-1 min-h-0 overflow-auto">
                        <Table className="**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4">
                            <TableHeader className="border-t **:data-[slot=table-head]:h-11 **:data-[slot=table-head]:font-normal **:data-[slot=table-head]:text-foreground **:data-[slot=table-head]:text-sm">
                                <TableRow>
                                    {/* Baş sütun: admin'de toplu seçim, şube sahibinde mevcutluk anahtarı.
                                        Şube ortak ürünü toplu işleme alamadığı için o kutu zaten hep boştu. */}
                                    <TableHead className={role === 'admin' ? 'w-10' : 'w-20'}>
                                        {role === 'admin'
                                            ? <Checkbox checked={tumuSeciliMi} onCheckedChange={toggleSelectAllPage} aria-label="Tümünü seç" disabled={secilebilirSayfa.length === 0} />
                                            : <span className="text-muted-foreground">Mevcut</span>}
                                    </TableHead>
                                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('ad')}>
                                        <span className="inline-flex items-center">Ürün <SortIcon col="ad" /></span>
                                    </TableHead>
                                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('fiyat')}>
                                        <span className="inline-flex items-center">Fiyat <SortIcon col="fiyat" /></span>
                                    </TableHead>
                                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('kategori')}>
                                        <span className="inline-flex items-center">Kategori <SortIcon col="kategori" /></span>
                                    </TableHead>
                                    {role === 'admin' && <TableHead>Şube</TableHead>}
                                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('tarih')}>
                                        <span className="inline-flex items-center">Tarih <SortIcon col="tarih" /></span>
                                    </TableHead>
                                    <TableHead className="w-20 text-right">İşlemler</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="**:data-[slot=table-row]:border-border/50 **:data-[slot=table-cell]:py-3">
                                {paginatedUrunler.map((urun) => {
                                    const mevcutDegil = urun.mevcut_degil || [];
                                    const buSubedeMevcut = !mevcutDegil.includes(subeSlug);
                                    const isKilitli = !!urun.duzenlenemez; // sunucudan gelir

                                    // Mevcut değilse satır soluklaşır AMA ilk hücre hariç: anahtar artık
                                    // asıl kontrol, yarı saydam olursa kapalıyken zor okunuyor.
                                    return (
                                        <TableRow
                                            key={urun.id}
                                            className={`group transition-colors ${!buSubedeMevcut ? '[&>td:not(:first-child)]:opacity-50' : ''} ${!isKilitli ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                                            onClick={(e) => {
                                                if (e.target.closest('button')) return;
                                                if (!isKilitli) openEditUrun(urun);
                                            }}
                                        >
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                {role !== 'admin' && subeSlug && urun.tur !== 'sube_ozel' ? (
                                                    // Mevcutluk anahtarı — /availability yalnızca ortak üründe
                                                    // çalışır, eski şubeye özel kayıtlar seçim kutusunda kalır.
                                                    <Switch
                                                        checked={buSubedeMevcut}
                                                        onCheckedChange={(v) => handleMevcutToggle(urun, v)}
                                                        disabled={mevcutBekleyen.has(urun.id)}
                                                        aria-label={`${urun.ad} — ${buSubedeMevcut ? 'mevcut' : 'mevcut değil'}`}
                                                    />
                                                ) : !isKilitli ? (
                                                    <Checkbox checked={selectedIds.has(urun.id)} onCheckedChange={() => toggleSelect(urun.id)} aria-label={`${urun.ad} seç`} />
                                                ) : null}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    {urun.gorsel
                                                        ? <img src={proxyImageUrl(urun.gorsel)} alt={urun.ad} className="size-11 shrink-0 rounded-lg object-cover ring-1 ring-border" />
                                                        : <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-xl">🍮</div>}
                                                    <div className="flex flex-col gap-1 min-w-0">
                                                        <span className="font-medium text-foreground truncate">{urun.ad}</span>
                                                        {urun.etiket?.length > 0 && (
                                                            <div className="flex gap-1 flex-wrap">
                                                                {urun.etiket.map(key => {
                                                                    const tag = ETIKETLER.find(t => t.key === key);
                                                                    return tag ? (
                                                                        <span key={key} className="text-[10px] px-1.5 py-px rounded-full font-semibold" style={{ background: tag.color + '18', color: tag.color }}>
                                                                            {tag.emoji} {tag.label}
                                                                        </span>
                                                                    ) : null;
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {/* Şube kendi fiyatını görür (etkinFiyat sunucuda çözülür).
                                                    Merkez fiyatından farklıysa küçük bir not düşülür. */}
                                                <span className="font-medium tabular-nums text-foreground">
                                                    {Math.round(urun.etkinFiyat ?? urun.fiyat)} ₺
                                                </span>
                                                {urun.miktar ? <span className="text-xs text-muted-foreground ml-1">/ {urun.miktar}{urun.birim}</span> : null}
                                                {role !== 'admin' && urun.etkinFiyat != null && urun.etkinFiyat !== urun.fiyat && (
                                                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                                                        (merkez {Math.round(urun.fiyat)} ₺)
                                                    </span>
                                                )}
                                                {/* Fiyat düzenleme, İşlemler sütunundaki etiket ikonu yerine fiyatın
                                                    yanında: hangi alanı değiştirdiği ikondan anlaşılmıyordu. */}
                                                {role !== 'admin' && urun.fiyatDuzenlenebilir && (
                                                    <Button
                                                        variant="ghost" size="icon"
                                                        className="ml-1.5 size-6 align-middle text-muted-foreground hover:text-foreground"
                                                        title="Şube fiyatını düzenle"
                                                        onClick={() => { setFiyatUrun(urun); setFiyatDeger(String(Math.round(urun.etkinFiyat ?? urun.fiyat))); }}
                                                    >
                                                        <Pencil className="size-3" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-muted-foreground">{katMap[urun.kategori] || '—'}</span>
                                            </TableCell>
                                            {role === 'admin' && (
                                                <TableCell>
                                                    {urun.tur === 'sube_ozel' && urun.sube_slug
                                                        ? <DotBadge tone="violet">{urun.sube_slug}</DotBadge>
                                                        : (() => {
                                                            // Ortak ürünün kaç şubenin menüsünde olduğu — merkezin
                                                            // "bu ürün nerede satılıyor" sorusuna tek bakışta yanıt.
                                                            const n = (urun.menude_subeler || []).length;
                                                            const hepsi = subeler.length > 0 && n === subeler.length;
                                                            return (
                                                                <DotBadge tone={n === 0 ? 'red' : hepsi ? 'green' : 'neutral'}>
                                                                    {n === 0 ? 'Hiçbir menüde' : hepsi ? `Tüm şubeler (${n})` : `${n} şube`}
                                                                </DotBadge>
                                                            );
                                                        })()}
                                                </TableCell>
                                            )}
                                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                                {urun.createdAt ? new Date(urun.createdAt).toLocaleDateString('tr-TR') : '—'}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex justify-end gap-1">
                                                    {!isKilitli && (
                                                        <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive hover:bg-destructive/10" title="Sil" onClick={() => handleUrunDelete(urun)}>
                                                            <Trash2 className="size-3.5" />
                                                        </Button>
                                                    )}
                                                    {/* Menüden çıkarma — ürünü SİLMEZ, yalnızca bu şubenin
                                                        menüsünden kaldırır. Katalogdan geri eklenebilir. */}
                                                    {role !== 'admin' && subeSlug && urun.tur !== 'sube_ozel' && (
                                                        <Button
                                                            variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive"
                                                            title="Menüden çıkar"
                                                            onClick={() => handleMenudenCikar(urun)}
                                                        >
                                                            <ListMinus className="size-3.5" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Alt bilgi + sayfalama */}
                    <div className="flex flex-col gap-3 px-4 pb-1 shrink-0 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-muted-foreground text-sm">
                            {sortedUrunler.length} üründen {sortedUrunler.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, sortedUrunler.length)} arası gösteriliyor
                        </p>
                        {totalPages > 1 && (() => {
                            const pageNumbers = totalPages <= 3
                                ? Array.from({ length: totalPages }, (_, i) => i + 1)
                                : currentPage <= 2
                                    ? [1, 2, 3]
                                    : currentPage >= totalPages - 1
                                        ? [totalPages - 2, totalPages - 1, totalPages]
                                        : [currentPage - 1, currentPage, currentPage + 1];
                            return (
                                <div className="flex items-center justify-end gap-1.5">
                                    <Button variant="ghost" size="sm" className="h-8 gap-1 text-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                                        <ChevronLeft className="size-4" /> Önceki
                                    </Button>
                                    {pageNumbers[0] > 1 && <span className="px-1 text-sm text-muted-foreground">…</span>}
                                    {pageNumbers.map((n) => (
                                        <Button key={n} variant={n === currentPage ? 'outline' : 'ghost'} size="icon" className="size-8 text-sm tabular-nums" onClick={() => setCurrentPage(n)}>
                                            {n}
                                        </Button>
                                    ))}
                                    {pageNumbers[pageNumbers.length - 1] < totalPages && <span className="px-1 text-sm text-muted-foreground">…</span>}
                                    <Button variant="ghost" size="sm" className="h-8 gap-1 text-sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                                        Sonraki <ChevronRight className="size-4" />
                                    </Button>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}
                </CardContent>
            </Card>

            {/* Katalogdan Ürün Ekle — şube sahibi.
                Yeni ürün OLUŞTURMAZ: merkezin ortak kataloğa eklediği, bu şubenin
                menüsünde henüz olmayan ürünleri listeler. Seçilenler tek istekte
                eklenir (menü JSON'ı bir kez yenilensin diye). */}
            <Dialog open={katalogAcik} onOpenChange={(o) => { if (!o) { setKatalogAcik(false); setKatalogSecili(new Set()); } }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Store className="size-4" /> Katalogdan Ürün Ekle</DialogTitle>
                    </DialogHeader>
                    {(() => {
                        const q = katalogArama.trim().toLocaleLowerCase('tr');
                        const liste = katalogUrunleri.filter((u) =>
                            !q || (u.ad || '').toLocaleLowerCase('tr').includes(q) || (katMap[u.kategori] || '').toLocaleLowerCase('tr').includes(q)
                        );
                        return (
                            <div className="space-y-3">
                                <p className="text-xs text-muted-foreground">
                                    Ürünleri merkez ekler. Buradan yalnızca şubenizde sattıklarınızı seçersiniz.
                                </p>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                                    <Input value={katalogArama} onChange={(e) => setKatalogArama(e.target.value)} placeholder="Ürün veya kategori ara..." className="h-9 pl-8 text-sm" autoFocus />
                                </div>
                                {katalogUrunleri.length === 0 ? (
                                    <p className="py-8 text-center text-sm text-muted-foreground">
                                        Katalogdaki tüm ürünler zaten menünüzde.
                                    </p>
                                ) : liste.length === 0 ? (
                                    <p className="py-8 text-center text-sm text-muted-foreground">Sonuç bulunamadı</p>
                                ) : (
                                    <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                                        {liste.map((u) => {
                                            const secili = katalogSecili.has(u.id);
                                            return (
                                                <button
                                                    key={u.id}
                                                    type="button"
                                                    onClick={() => setKatalogSecili((prev) => {
                                                        const n = new Set(prev);
                                                        n.has(u.id) ? n.delete(u.id) : n.add(u.id);
                                                        return n;
                                                    })}
                                                    className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors ${secili ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                                                >
                                                    <span className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${secili ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>
                                                        {secili && <Check className="size-3" />}
                                                    </span>
                                                    {u.gorsel
                                                        ? <img src={proxyImageUrl(u.gorsel)} alt="" className="size-9 shrink-0 rounded-md object-cover ring-1 ring-border" />
                                                        : <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-base">🍮</span>}
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm font-medium text-foreground">{u.ad}</span>
                                                        <span className="block text-xs text-muted-foreground">{katMap[u.kategori] || '—'}</span>
                                                    </span>
                                                    <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                                                        {Math.round(u.etkinFiyat ?? u.fiyat)} ₺
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" onClick={() => { setKatalogAcik(false); setKatalogSecili(new Set()); }}>İptal</Button>
                        <Button onClick={handleKatalogEkle} disabled={katalogBusy || katalogSecili.size === 0}>
                            {katalogBusy ? 'Ekleniyor...' : `${katalogSecili.size > 0 ? katalogSecili.size + ' ' : ''}Ürünü Ekle`}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Trash Dialog */}
            <Dialog open={showTrash} onOpenChange={(open) => !open && setShowTrash(false)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Trash className="size-4" /> Çöp Kutusu</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        {trashUrunler.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
                                <Trash className="size-8 opacity-40" />
                                <p className="text-sm">Çöp kutusu boş</p>
                            </div>
                        ) : (
                            <>
                                <p className="text-xs text-muted-foreground">Silinen ürünler 5 gün sonra kalıcı olarak silinir.</p>
                                <div className="max-h-96 overflow-y-auto space-y-2">
                                    {trashUrunler.map((u) => {
                                        const deletedDate = new Date(u.deletedAt);
                                        const daysLeft = Math.max(0, 5 - Math.floor((Date.now() - deletedDate.getTime()) / (1000 * 60 * 60 * 24)));
                                        return (
                                            <div key={u.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-semibold text-sm">{u.ad}</span>
                                                    <div className="text-[11px] text-muted-foreground mt-0.5">
                                                        {deletedDate.toLocaleDateString('tr-TR')} • {daysLeft > 0 ? `${daysLeft} gün kaldı` : 'Bugün silinecek'}
                                                    </div>
                                                </div>
                                                {/* Butonlar yalnızca kullanıcının gerçekten geri alabileceği
                                                    kayıtlarda. `duzenlenemez` sunucudan gelir — kural burada
                                                    yeniden yazılsaydı arayüz izin verip backend 403 dönerdi. */}
                                                {u.duzenlenemez ? (
                                                    <span className="text-xs text-muted-foreground">Geri alınamaz</span>
                                                ) : (
                                                <>
                                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={async () => {
                                                    try {
                                                        const queryParam = u.tur === 'sube_ozel' && u.sube_slug ? `?subeSlug=${u.sube_slug}` : '';
                                                        await api.put(`/products/${u.id}/restore${queryParam}`);
                                                        setTrashUrunler(prev => prev.filter(t => t.id !== u.id));
                                                        const { deletedAt, ...restoredUrun } = u;
                                                        setUrunler(prev => [...prev, restoredUrun]);
                                                        toast.success('Ürün geri yüklendi');
                                                    } catch { toast.error('Geri yükleme başarısız'); }
                                                }}>
                                                    <RotateCcw className="size-3" />Geri Al
                                                </Button>
                                                <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={async () => {
                                                    const ok = await confirm('Bu ürünü kalıcı olarak silmek istediğinize emin misiniz?');
                                                    if (!ok) return;
                                                    try {
                                                        const queryParam = u.tur === 'sube_ozel' && u.sube_slug ? `?subeSlug=${u.sube_slug}` : '';
                                                        await api.delete(`/products/${u.id}/permanent${queryParam}`);
                                                        setTrashUrunler(prev => prev.filter(t => t.id !== u.id));
                                                        toast.success('Ürün kalıcı olarak silindi');
                                                    } catch { toast.error('Silme başarısız'); }
                                                }}>
                                                    <Trash2 className="size-3" />Sil
                                                </Button>
                                                </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Şube fiyatı — merkez izin verdiyse şube kendi fiyatını girer.
                Yazılan değer ortak ürünün merkez fiyatını DEĞİL, yalnızca bu
                şubenin override'ını günceller (backend fiyat_override'a yazar). */}
            <Dialog open={!!fiyatUrun} onOpenChange={(o) => !o && setFiyatUrun(null)}>
                <DialogContent className="sm:max-w-sm">
                    {fiyatUrun && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Tag className="size-4" /> Şube Fiyatı
                                </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3">
                                <p className="text-sm text-muted-foreground">
                                    <span className="font-medium text-foreground">{fiyatUrun.ad}</span>
                                    {' — '}merkez fiyatı {Math.round(fiyatUrun.fiyat)} ₺
                                </p>
                                <div className="space-y-1.5">
                                    <Label>Şubenizdeki fiyat (₺)</Label>
                                    <Input
                                        type="number" min="0" step="0.01" autoFocus
                                        value={fiyatDeger}
                                        onChange={(e) => setFiyatDeger(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Yalnızca kendi menünüzü etkiler, diğer şubeler değişmez.
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                                <Button variant="outline" onClick={() => setFiyatUrun(null)}>İptal</Button>
                                <Button
                                    disabled={fiyatKaydediliyor || fiyatDeger === ''}
                                    onClick={async () => {
                                        setFiyatKaydediliyor(true);
                                        try {
                                            const { data } = await api.put(`/products/${fiyatUrun.id}`, { fiyat: Number(fiyatDeger) });
                                            const yeni = data?.urun?.etkinFiyat ?? Number(fiyatDeger);
                                            setUrunler((prev) => prev.map((u) => (u.id === fiyatUrun.id ? { ...u, etkinFiyat: yeni } : u)));
                                            toast.success('Fiyat güncellendi');
                                            setFiyatUrun(null);
                                        } catch (err) {
                                            toast.error(err.response?.data?.error || 'Fiyat güncellenemedi');
                                        }
                                        setFiyatKaydediliyor(false);
                                    }}
                                >
                                    {fiyatKaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
                                </Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Toplu Fiyat Dialog */}
            <Dialog open={showBulkPrice} onOpenChange={(o) => !o && setShowBulkPrice(false)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Tag className="size-4" /> Toplu Fiyat Güncelle</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">{selectedIds.size} seçili ürün için işlem:</p>
                        <div className="grid grid-cols-1 gap-2">
                            {[
                                { v: 'set', l: 'Yeni fiyat (hepsini eşitle)' },
                                { v: 'inc_pct', l: 'Yüzde artır (%)' },
                                { v: 'dec_pct', l: 'Yüzde azalt (%)' },
                                { v: 'inc_amt', l: 'Tutar ekle (₺)' },
                                { v: 'dec_amt', l: 'Tutar düş (₺)' },
                            ].map((o) => (
                                <label key={o.v} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${bulkPriceForm.mode === o.v ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted'}`}>
                                    <input type="radio" name="bulkmode" checked={bulkPriceForm.mode === o.v} onChange={() => setBulkPriceForm(f => ({ ...f, mode: o.v }))} className="size-4" />
                                    {o.l}
                                </label>
                            ))}
                        </div>
                        <div className="space-y-1.5">
                            <Label>{bulkPriceForm.mode.includes('pct') ? 'Yüzde' : bulkPriceForm.mode === 'set' ? 'Yeni Fiyat (₺)' : 'Tutar (₺)'}</Label>
                            <Input type="number" min="0" value={bulkPriceForm.value} onChange={(e) => setBulkPriceForm(f => ({ ...f, value: e.target.value }))} placeholder={bulkPriceForm.mode.includes('pct') ? 'örn: 10' : 'örn: 150'} autoFocus />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setShowBulkPrice(false)}>İptal</Button>
                        <Button onClick={handleBulkPrice} disabled={bulkBusy || bulkPriceForm.value === ''}>{bulkBusy ? 'Uygulanıyor...' : 'Uygula'}</Button>
                    </div>
                </DialogContent>
            </Dialog>

        </div>
    );
}
