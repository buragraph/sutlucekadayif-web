import { useState, useEffect } from 'react';
import { fiyatYaz, fiyatGirdi } from '../utils/fiyat';
import { useAuth } from '../../../context/AuthContext';
import UrunTalepModal from '../components/UrunTalepModal';
import api from '../../../services/api';
import { Plus, Trash2, X, Search, RotateCcw, Trash, ImagePlus, Images, Sparkles, ChevronLeft, ChevronRight, Check, ChevronsUpDown, Tag, ListPlus, Store, Send, Printer } from 'lucide-react';
import { proxyImageUrl } from '../../../utils/imageProxy';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { SubeCokluSecici } from '../components/SubeCokluSecici';
import { KaydirilirRay } from '../components/KaydirilirRay';

import { ETIKETLER } from '../constants/etiketler';
import FiyatListesiPenceresi from '../fiyat-listesi/FiyatListesiPenceresi';
import UrunKarti from '../components/UrunKarti';
import { gorseliWebpYap } from '../utils/gorsel';

// Şube kodundan okunur ad: "ankara_etimesgut" → "Ankara Etimesgut".
// Şube sahibinde şube listesi YÜKLENMİYOR (90 satırı tek ad için çekmek
// gereksiz), o yüzden fiyat listesi başlığı ve dosya adı için bu yeter.
const subeSlugAd = (slug) => String(slug || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\S+/g, (k) => k.charAt(0).toLocaleUpperCase('tr') + k.slice(1));

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
    const { subeSlug, role, realRole, simulatedRole } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();
    const [selectedKategori, setSelectedKategori] = useState('all');
    const [selectedSube, setSelectedSube] = useState('ortak');
    const [searchTerm, setSearchTerm] = useState('');
    const [subeComboOpen, setSubeComboOpen] = useState(false);
    // Şube sahibinin ASIL ekseni kategori değil DURUM: ortalama şubede 72 ürünün
    // 23'ü kapalı ve günlük iş "ne bitti / ne geri geldi". Kategori ikincil kaldı.
    const [durumFiltre, setDurumFiltre] = useState('hepsi');   // hepsi | satista | kapali
    const [sortCol, setSortCol] = useState(null);
    const [sortDir, setSortDir] = useState('asc');

    // Tabloda 10 satır ekrana sığıyor; grid 4-5 sütun olduğu için 10 kalem
    // yarım satır bırakıyor — şube görünümünde sayfa boyu büyütülür.
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedKategori, selectedSube, sortCol, sortDir, durumFiltre]);

    const [urunler, setUrunler] = useState([]);
    const [loadingUrunler, setLoadingUrunler] = useState(true);
    const [viewMode, setViewMode] = useState('list');
    const [editingUrun, setEditingUrun] = useState(null);
    const [savingUrun, setSavingUrun] = useState(false);
    // Şube fiyat düzenleme penceresi (yalnızca merkez izin verdiği ürünlerde)
    const [fiyatUrun, setFiyatUrun] = useState(null);
    const [fiyatDeger, setFiyatDeger] = useState('');
    const [etiketUrun, setEtiketUrun] = useState(null);        // şube etiketi düzenlenen ürün
    const [etiketSecim, setEtiketSecim] = useState([]);
    const [etiketKaydediliyor, setEtiketKaydediliyor] = useState(false);
    // Sayfa boyu: grid en geniş ekranda 6 sütun (2xl) — admin'de 36, orada
    // 6 sıra demek; dar ekranda daha çok sıra ama zaten kaydırılıyor.
    const ITEMS_PER_PAGE = role !== 'admin' ? 24 : 36;

    const [fiyatKaydediliyor, setFiyatKaydediliyor] = useState(false);
    const [sifirlaniyor, setSifirlaniyor] = useState(false);
    const [urunForm, setUrunForm] = useState({ ad: '', fiyat: '', kategori: '', aciklama: '', sube_slug: '', gorsel: '', etiket: [], miktar: '', birim: 'gr', kalori: '', kilitli: '', gizli_subeler: [], fiyat_serbest: [], menude_subeler: [] });
    // Katalogdan menüye ürün ekleme penceresi (şube sahibi) — ürün OLUŞTURMAZ,
    // merkezin eklediği ortak ürünlerden şubenin sattıklarını işaretler.
    const [talepAcik, setTalepAcik] = useState(false);
    const [katalogAcik, setKatalogAcik] = useState(false);
    const [katalogUrunleri, setKatalogUrunleri] = useState([]);
    const [katalogYukleniyor, setKatalogYukleniyor] = useState(false);
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
    const [fiyatListesiAcik, setFiyatListesiAcik] = useState(false);
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

    // Katalog (menüye eklenebilecek ortak ürünler) ayrı uçtan gelir: `/products`
    // artık şubeye yalnızca MENÜSÜNDEKİ ürünleri döndürüyor, katalogun tamamını
    // her şubeye göndermek sunucuda 510 ürünlük okumaya mal oluyordu.
    //
    // Sayfa açılışında DEĞİL, yalnızca "Ürün Ekle" penceresi açılınca yüklenir:
    // şube sahiplerinin çoğu katalogu hiç açmaz, açılışa bağlasaydık herkes için
    // okunurdu. Sunucudaki katalog cache'i sürümlüdür, ürün değiştiğinde tazelenir.
    async function loadKatalog() {
        setKatalogYukleniyor(true);
        try {
            const { data } = await api.get('/products/katalog');
            setKatalogUrunleri(data.urunler);
        }
        catch (err) { toast.error('Katalog yüklenemedi'); }
        setKatalogYukleniyor(false);
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

    /**
     * Ürünün tüm şube fiyatlarını siler; herkes merkez fiyatına döner.
     *
     * Menüde `coalesce(override, merkez)` geçerli olduğu için merkez zammı,
     * kendi fiyatını girmiş şubelere İŞLEMEZ. Bu düğme zammın ardından
     * "hepsini hizala" demenin tek adımlık yolu; `fiyat_serbest` iznine
     * dokunmaz, şube yarın yine kendi fiyatını girebilir.
     */
    async function subeFiyatlariniSifirla() {
        if (!editingUrun) return;
        const n = Object.keys(editingUrun.fiyat_override || {}).length;
        const ok = await confirm(
            `${n} şubenin kendi fiyatı silinsin ve hepsi merkez fiyatına (${fiyatYaz(editingUrun.fiyat)} ₺) dönsün mü?`
        );
        if (!ok) return;
        setSifirlaniyor(true);
        try {
            const { data } = await api.post(`/products/${editingUrun.id}/sube-fiyat/sifirla`);
            // Sunucu doğrulanmış durumu döndürmüyor (yalnızca sayaç): yerelde
            // override haritasını boşaltmak yeterli, liste ve pencere aynı
            // kaydı gösteriyor.
            setEditingUrun((p) => ({ ...p, fiyat_override: {} }));
            setUrunler((prev) => prev.map((u) => (u.id === editingUrun.id ? { ...u, fiyat_override: {} } : u)));
            toast.success(data.temizlenen > 0
                ? `${data.temizlenen} şube merkez fiyatına döndü`
                : 'Kendi fiyatını girmiş şube yoktu');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Şube fiyatları sıfırlanamadı');
        }
        setSifirlaniyor(false);
    }

    function openAddUrun() {
        setEditingUrun(null);
        // Yeni ortak ürün varsayılan olarak TÜM şubelerin menüsüne düşer (backend
        // de alan gelmezse aynısını yapar). Merkez isterse seçimi daraltır.
        setUrunForm({ ad: '', fiyat: '', kategori: kategoriler[0]?.id || '', aciklama: '', sube_slug: subeSlug || '', gorsel: '', etiket: [], miktar: '', birim: 'gr', kalori: '', kilitli: '', gizli_subeler: [], fiyat_serbest: [], menude_subeler: subeler.map((s) => s.slug) });
        setImageFile(null); setImagePreview(null);
        setViewMode('add');
    }

    function openEditUrun(urun) {
        setEditingUrun(urun);
        setUrunForm({ ad: urun.ad, fiyat: urun.fiyat, kategori: urun.kategori || '', aciklama: urun.aciklama || '', sube_slug: urun.sube_slug || '', gorsel: urun.gorsel || '', etiket: urun.etiket || [], miktar: urun.miktar || '', birim: urun.birim || 'gr', kalori: urun.kalori ?? '', kilitli: typeof urun.kilitli === 'boolean' ? (urun.kilitli ? 'evet' : 'hayir') : '', gizli_subeler: urun.gizli_subeler || [], fiyat_serbest: urun.fiyat_serbest || [], menude_subeler: urun.menude_subeler || [] });
        setImageFile(null); setImagePreview(urun.gorsel || null);
        setViewMode('edit');
    }

    function closeUrunView() { setViewMode('list'); setEditingUrun(null); setImageFile(null); setImagePreview(null); }

    async function handleUrunSubmit(e) {
        e.preventDefault();
        setSavingUrun(true);
        try {
            // kalori: '' => null (alan temizlendi), '0' => 0 korunur (suyun kalorisi
            // gerçekten 0). Bu yüzden `urunForm.kalori ? ... : null` yazılmaz.
            const payload = { ad: urunForm.ad, fiyat: Number(urunForm.fiyat), kategori: urunForm.kategori, aciklama: urunForm.aciklama, etiket: urunForm.etiket || [], miktar: urunForm.miktar ? Number(urunForm.miktar) : null, birim: urunForm.birim || '', kalori: urunForm.kalori === '' ? null : Number(urunForm.kalori) };
            // Ürün bazlı kilit — yalnızca admin gönderir. '' => null: bayrak
            // kaldırılır, kilit yine kategoriden miras alınır.
            if (role === 'admin') {
                payload.kilitli = urunForm.kilitli === '' ? null : urunForm.kilitli === 'evet';
                // Şube bazlı merkez ayarları. Kategorinin "türü" kalktı
                // (şube ayrımı artık ürün/kategori gizlemeyle yapılıyor),
                // bu yüzden koşulsuz gönderiliyor.
                payload.gizli_subeler = urunForm.gizli_subeler || [];
                payload.fiyat_serbest = urunForm.fiyat_serbest || [];
                payload.menude_subeler = urunForm.menude_subeler || [];
            }
            if (imageFile) {
                const formData = new FormData();
                formData.append('image', await gorseliWebpYap(imageFile));
                formData.append('folder', 'urunler');
                const { data: uploadData } = await api.post('/upload/image', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                payload.gorsel = uploadData.url;
            } else if (urunForm.gorsel) {
                payload.gorsel = urunForm.gorsel;
            }
            if (editingUrun) {
                const { data } = await api.put(`/products/${editingUrun.id}`, payload);
                // Sunucu her 2xx yanıtta `urun` DÖNDÜRMEZ: değişiklik yoksa yalnızca
                // { success: true } gelir. Gövdeye körü körüne güvenilirse listeye
                // `undefined` girer ve sonraki render `u.menude` okurken çöker.
                if (data?.urun) {
                    setUrunler(prev => prev.map(u => u.id === editingUrun.id ? data.urun : u));
                } else {
                    await loadUrunler(true);
                }
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
    async function menuyeYaz(ids, menude, hedefSube = subeSlug) {
        const { data } = await api.post('/products/menu', { ids, menude, subeSlug: hedefSube });
        // Liste ve katalog artık iki ayrı uçtan geliyor; ürün hangi yöne gittiyse
        // bir listeden çıkıp diğerine geçer. Sunucuya yeniden sormaya gerek yok.
        if (menude) {
            const tasinan = katalogUrunleri
                .filter((u) => ids.includes(u.id))
                .map((u) => ({ ...u, menude: true }));
            setKatalogUrunleri((prev) => prev.filter((u) => !ids.includes(u.id)));
            setUrunler((prev) => [...prev, ...tasinan]);
        } else {
            const tasinan = urunler
                .filter((u) => ids.includes(u.id))
                .map((u) => ({ ...u, menude: false }));
            setUrunler((prev) => prev.filter((u) => !ids.includes(u.id)));
            setKatalogUrunleri((prev) => [...prev, ...tasinan]);
        }
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
    // Admin bir şube seçtiyse o ŞUBE ADINA yazar; şube sahibinde kendi şubesi.
    // Uçlar admin'den `subeSlug` kabul ediyor (bkz. availability/etiket/menu).
    async function handleMevcutToggle(urun, mevcut) {
        const hedef = gorunenSube;
        if (!hedef) return;
        const oncekiMevcutDegil = urun.mevcut_degil || [];
        setUrunler((prev) => prev.map((u) => (u.id === urun.id ? {
            ...u,
            mevcut_degil: mevcut
                ? oncekiMevcutDegil.filter((s) => s !== hedef)
                : [...oncekiMevcutDegil, hedef],
        } : u)));
        setMevcutBekleyen((p) => new Set(p).add(urun.id));
        try {
            await api.put(`/products/${urun.id}/availability`, { subeSlug: hedef, mevcut });
        } catch (err) {
            setUrunler((prev) => prev.map((u) => (u.id === urun.id ? { ...u, mevcut_degil: oncekiMevcutDegil } : u)));
            toast.error(err.response?.data?.error || 'Güncelleme başarısız');
        }
        setMevcutBekleyen((p) => { const n = new Set(p); n.delete(urun.id); return n; });
    }

    // Şube kendi etiketlerini yazar. Merkezin `urunler.etiket` alanına
    // DOKUNMAZ — o tek kayıt ve tüm şubeleri etkilerdi; bu uç yalnızca
    // urun_sube.etiket'e yazıyor (bkz. PUT /products/:id/etiket).
    async function handleEtiketKaydet() {
        if (!etiketUrun) return;
        setEtiketKaydediliyor(true);
        try {
            const { data } = await api.put(`/products/${etiketUrun.id}/etiket`,
                { etiket: etiketSecim, subeSlug: gorunenSube });
            const yeni = data?.etiket ?? etiketSecim;
            setUrunler((p) => p.map((u) => (u.id === etiketUrun.id ? { ...u, subeEtiket: yeni } : u)));
            setEtiketUrun(null);
            toast.success('Etiketler güncellendi');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Etiketler kaydedilemedi');
        }
        setEtiketKaydediliyor(false);
    }

    async function handleMenudenCikar(urun) {
        const ok = await confirm(`"${urun.ad}" menünüzden çıkarılsın mı? Katalogdan tekrar ekleyebilirsiniz.`);
        if (!ok) return;
        try {
            await menuyeYaz([urun.id], false, gorunenSube);
            toast.success('Ürün menünüzden çıkarıldı');
        } catch (err) { toast.error(err.response?.data?.error || 'Ürün çıkarılamadı'); }
    }

    // Admin "Şube Sahibi"/"Çalışan" simülasyonundayken sunucu kararları hâlâ
    // GERÇEK token'a göre geliyor; ekranın yanıltmaması için şube kuralları
    // istemcide uygulanır (liste, kilit, fiyat kalemi).
    const rolSimulasyonu = realRole === 'admin' && !!simulatedRole && simulatedRole !== 'admin';

    const katMap = {};
    kategoriler.forEach((k) => { katMap[k.id] = k.ad; });

    // Merkez bazı kategorileri "menüden çıkarılamaz" işaretleyebiliyor: şube o
    // ürünü menüden kaldıramaz, yalnızca "Mevcut değil" diyebilir. Sunucu da
    // aynı kuralı uyguluyor (products.js `katCikarmaKilidi`) — burası sadece
    // butonu göstermemek için, yetki kararı istemcide verilmiyor.
    const katCikarmaKilidi = {};
    kategoriler.forEach((k) => { katCikarmaKilidi[k.id] = !!k.menuden_cikarilamaz; });
    const menudenCikarilabilir = (u) => !katCikarmaKilidi[u.kategori];

    // Şube sahibinin listesi = KENDİ menüsündeki ürünler. Menüde olmayan ortak
    // ürünler "Ürün Ekle" katalog penceresinde durur. `menude` sunucuda hesaplanır
    // (bkz. backend menudeMi) — burada kural yeniden yazılmaz.
    //
    // ROL SİMÜLASYONU: sunucu listeyi GERÇEK role göre veriyor, yani admin
    // simülasyona geçtiğinde katalogun tamamı (448) geliyor — şubenin menüsünde
    // olmayan 376 ürünün anahtarına basınca uç haklı olarak "Ürün menünüzde
    // değil" diyordu. Simülasyondayken listeyi de şubeye indiriyoruz:
    // menüde olanlar + merkezin o şubeden gizlemedikleri + yalnızca kendi
    // şubesine ait özel ürünler (bkz. backend GET /products şube dalı).
    const simulasyonaGoreSuz = (u) => {
        if (!rolSimulasyonu) return true;
        if ((u.gizli_subeler || []).includes(subeSlug)) return false;
        if (u.tur === 'sube_ozel') return u.sube_slug === subeSlug;
        return (u.menude_subeler || []).includes(subeSlug);
    };
    const menuUrunleri = urunler.filter((u) => u.menude !== false).filter(simulasyonaGoreSuz);

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

    // GÖRÜNEN ŞUBE: kartların/satırların hangi şubenin gözüyle gösterileceği.
    // Şube sahibinde kendi şubesi; admin bir şube seçtiyse O şube. Admin'in de
    // kendi `subeSlug`ı var ama katalog görünümünde onu kullanmak yanıltıcı
    // olurdu — seçilen şubeyi değil, admin'in şubesini gösterirdi.
    const gorunenSube = role === 'admin'
        ? (selectedSube !== 'all' && selectedSube !== 'ortak' ? selectedSube : null)
        : subeSlug;

    // Şube başına MENÜ ürünü sayısı. /branches'ten gelen `urunSayisi` şubeye
    // ÖZEL ürün sayısıydı ve hepsi 0'dı — seçicide her şube "(0)" görünüyordu.
    const subeMenuSayisi = {};
    if (role === 'admin') {
        for (const u of urunler) {
            for (const slug of (u.menude_subeler || [])) {
                subeMenuSayisi[slug] = (subeMenuSayisi[slug] || 0) + 1;
            }
        }
    }

    // Şube seçilince O ŞUBENİN MENÜSÜ gelir. Eskiden yalnızca şubeye ÖZEL
    // ürünlere bakıyordu; öyle ürün kalmadığı için her şube boş görünüyordu
    // (ölçüldü: 58 ürünlük Denizli'de "Sonuç bulunamadı").
    const subeyeUyar = (u) => {
        if (role !== 'admin' || selectedSube === 'all') return true;
        if (selectedSube === 'ortak') return u.tur !== 'sube_ozel';
        return (u.menude_subeler || []).includes(selectedSube)
            || (u.tur === 'sube_ozel' && u.sube_slug === selectedSube);
    };

    /**
     * Ürünü GÖRÜNEN ŞUBENİN gözünden zenginleştirir: o şubenin fiyatı ve
     * etiketleri. Kart/satır zaten `etkinFiyat` ve `subeEtiket` okuyor;
     * şube sahibinde bunları sunucu dolduruyor, admin bir şube seçtiğinde
     * burada dolduruluyor (veri yanıtta zaten var: fiyat_override, sube_etiket).
     */
    const subeGozuyle = (u) => {
        if (role !== 'admin' || !gorunenSube) return u;
        const of = u.fiyat_override?.[gorunenSube];
        return {
            ...u,
            etkinFiyat: of != null ? of : u.fiyat,
            subeEtiket: u.sube_etiket?.[gorunenSube] || [],
        };
    };

    // Sekme sayıları ARAMAYA bakmaz — yazdıkça sayılar oynasa ray güvenilmez
    // olurdu (aynı gerekçe rayın kendisi için de geçerli, bkz. yukarıdaki not).
    const sayimTabani = menuUrunleri.filter(subeyeUyar);
    const katSayim = sayimTabani.reduce((m, u) => m.set(u.kategori, (m.get(u.kategori) || 0) + 1), new Map());

    // Şubede satışta mı? (şubeye özel eski ürünlerde anahtar yok, satışta sayılır)
    const satistaMi = (u) => !(u.mevcut_degil || []).includes(gorunenSube);
    const durumSayim = {
        hepsi: sayimTabani.length,
        satista: sayimTabani.filter(satistaMi).length,
        kapali: sayimTabani.filter((u) => !satistaMi(u)).length,
    };

    const filteredUrunler = menuUrunleri.filter((u) => {
        const matchKategori = etkinKategori === 'all' || u.kategori === etkinKategori;
        const matchSearch = !searchTerm || u.ad.toLowerCase().includes(searchTerm.toLowerCase());
        const matchDurum = durumFiltre === 'hepsi'
            || (durumFiltre === 'satista' ? satistaMi(u) : !satistaMi(u));
        return matchKategori && matchSearch && matchDurum && subeyeUyar(u);
    });

    const sortedUrunler = [...filteredUrunler].sort((a, b) => {
        if (!sortCol) return 0;
        const dir = sortDir === 'asc' ? 1 : -1;
        if (sortCol === 'ad') return dir * a.ad.localeCompare(b.ad, 'tr');
        if (sortCol === 'fiyat') return dir * ((a.fiyat || 0) - (b.fiyat || 0));
        if (sortCol === 'kategori') return dir * (katMap[a.kategori] || '').localeCompare(katMap[b.kategori] || '', 'tr');
        if (sortCol === 'tarih') return dir * ((a.createdAt || '').localeCompare(b.createdAt || ''));
        return 0;
    });

    // Şube menüsü en fazla 126 kalem (ortalama 72) — grid'i sayfalamak, kategori
    // gruplarını sayfa ortasında ikiye bölüyordu. Şube sahibinde tamamı basılır
    // (kartlar `loading="lazy"`), sayfalama yalnızca admin tablosunda kalır.
    // "Tümü" sekmesinde kartlar kategori kategori YATAY şeritlerde akıyor.
    // Şerit ancak kategorinin TAMAMINI taşırsa anlamlı: sayfalanmış 36 ürünü
    // 14 kategoriye bölmek her şeride 2-3 kart bırakırdı, kaydıracak bir şey
    // kalmazdı. Bu yüzden o modda sayfalama kapalı.
    const yataySeritler = etkinKategori === 'all';
    const sayfalamaVar = role === 'admin' && !yataySeritler;
    const paginatedUrunler = sayfalamaVar
        ? sortedUrunler.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
        : sortedUrunler;
    const totalPages = sayfalamaVar ? Math.ceil(sortedUrunler.length / ITEMS_PER_PAGE) : 1;

    // "Tümü" seçiliyken grid kategori kategori bölünür: 70+ kartlık kesintisiz
    // akışta şube sahibi nerede olduğunu kaybediyordu. Kategori seçiliyse tek
    // grup (başlık gereksiz — sekme zaten onu söylüyor).
    const gridGruplari = etkinKategori !== 'all'
        ? [{ id: etkinKategori, ad: null, urunler: paginatedUrunler }]
        : gosterilecekKategoriler
            .map((k) => ({ id: k.id, ad: k.ad, urunler: paginatedUrunler.filter((u) => u.kategori === k.id) }))
            .filter((g) => g.urunler.length > 0);

    // ── Kilit ──
    // Kilit kuralı sunucuda çözülür (bkz. backend urunKilitliMi) ve her ürüne
    // `duzenlenemez` olarak gelir — burada YENİDEN HESAPLAMA, yoksa iki kopya
    // ayrışır ve arayüz izin verirken backend 403 döner.
    //
    // TEK İSTİSNA — ROL SİMÜLASYONU: sunucu kararını GERÇEK token'dan veriyor,
    // yani admin "Şube Sahibi" moduna geçtiğinde `duzenlenemez` yine false
    // geliyordu ve ekran, gerçek şube sahibinin göremeyeceği düzenle/sil
    // eylemlerini gösteriyordu. Sunucunun kararını ezmiyoruz, yalnızca
    // simülasyondayken üzerine ekliyoruz: şube sahibi ortak ürünü düzenleyemez.
    const kilitliMi = (u) => !!u.duzenlenemez || (rolSimulasyonu && u.tur !== 'sube_ozel');

    // Fiyat kalemi de aynı tuzağa düşüyordu: `fiyatDuzenlenebilir` sunucuda
    // admin için her zaman true (bkz. fiyatDuzenlenebilirMi). Simülasyonda şube
    // kuralı uygulanır: ortak üründe yalnızca merkez `fiyat_serbest` verdiyse.
    const fiyatiDuzenlenebilirMi = (u) => {
        if (rolSimulasyonu) return u.tur !== 'sube_ozel' && (u.fiyat_serbest || []).includes(subeSlug);
        // Admin bir ŞUBEYE bakıyorken: o şubenin fiyatını ancak merkez serbest
        // bıraktıysa girebilir. Merkez fiyatlı üründe (ör. fincanlar) şubeye
        // özel fiyat açılmaz — sunucu da aynı kuralı uyguluyor.
        if (role === 'admin' && gorunenSube) {
            return u.tur !== 'sube_ozel' && (u.fiyat_serbest || []).includes(gorunenSube);
        }
        return !!u.fiyatDuzenlenebilir;
    };

    // ── Toplu işlem yardımcıları ──
    const seciliebilir = (u) => !kilitliMi(u);
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
    const yeniBulkRow = () => ({ ad: '', fiyat: '', kategori: kategoriler[0]?.id || '', miktar: '', birim: 'gr', kalori: '', gorsel: '' });
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
                kalori: r.kalori === '' ? null : Number(r.kalori),
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
        const katSecenek = kategoriler;
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
                        <div className="hidden md:grid grid-cols-[56px_1fr_110px_1fr_80px_88px_80px_36px] gap-2 px-1 text-xs font-medium text-muted-foreground shrink-0">
                            <span>Görsel</span><span>Ürün Adı</span><span>Fiyat ₺</span><span>Kategori</span><span>Miktar</span><span>Birim</span><span>Kalori</span><span></span>
                        </div>
                        {/* Satırlar */}
                        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pr-1">
                            {bulkAddRows.map((row, i) => (
                                <div key={i} className="grid grid-cols-2 md:grid-cols-[56px_1fr_110px_1fr_80px_88px_80px_36px] gap-2 items-center rounded-lg border p-2 md:border-0 md:p-0">
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
                                    <Input type="number" min="0" step="0.01" value={row.fiyat} onChange={(e) => updateBulkRow(i, 'fiyat', e.target.value)} placeholder="0" className="h-9 text-sm" />
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
                                    <Input type="number" min="0" value={row.kalori} onChange={(e) => updateBulkRow(i, 'kalori', e.target.value)} placeholder="kcal" className="h-9 text-sm" />
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
                                                    {kategoriler.map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Merkez fiyatı override'ları EZMEZ: menüde
                                            coalesce(override, merkez) geçerli. Zam yapan
                                            merkezin bunu fiyat kutusunun DİBİNDE görmesi
                                            gerekiyor, yoksa zam sessizce eksik uygulanır. */}
                                        {(() => {
                                            if (role !== 'admin' || !editingUrun) return null;
                                            const kendiFiyatli = Object.keys(editingUrun.fiyat_override || {}).length;
                                            if (kendiFiyatli === 0) return null;
                                            return (
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
                                                    <span className="text-amber-700 dark:text-amber-500">
                                                        <strong className="tabular-nums">{kendiFiyatli} şube</strong> kendi fiyatını girmiş —
                                                        buradaki fiyat onlara işlemez.
                                                    </span>
                                                    <Button
                                                        type="button" variant="outline" size="sm"
                                                        className="ml-auto h-7 text-xs"
                                                        disabled={sifirlaniyor}
                                                        onClick={subeFiyatlariniSifirla}
                                                    >
                                                        <RotateCcw className="mr-1.5 size-3" />
                                                        Hepsini merkez fiyatına döndür
                                                    </Button>
                                                </div>
                                            );
                                        })()}

                                        {/* Merkez ayarları — yalnızca admin, yalnızca ORTAK ürünlerde.
                                            Şubeye özel üründe anlamsız: o ürün zaten tek şubeye ait. */}
                                        {(() => {
                                            if (role !== 'admin' || subeler.length === 0) return null;
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
                                            <div className="space-y-1.5">
                                                <Label>Kalori <span className="text-muted-foreground font-normal text-xs">(opsiyonel)</span></Label>
                                                <div className="flex items-center gap-1.5">
                                                    <Input type="number" value={urunForm.kalori} onChange={(e) => setUrunForm({ ...urunForm, kalori: e.target.value })} placeholder="320" min="0" className="flex-1" />
                                                    <span className="flex h-9 w-16 items-center justify-center rounded-md border border-input px-1.5 text-sm text-muted-foreground">kcal</span>
                                                </div>
                                            </div>
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
                                                {tag.emoji} {tag.ad}
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
                        {/* A4 fiyat listesi — şubenin masaya koyduğu kâğıt.
                            Admin'de yalnızca bir şube seçiliyken çıkar: liste
                            "bu şubenin menüsü, bu şubenin fiyatlarıyla" demek,
                            katalog görünümünde karşılığı yok. */}
                        {gorunenSube && (
                            <Button variant="outline" size="sm" className="h-8 text-xs"
                                onClick={() => setFiyatListesiAcik(true)}>
                                <Printer className="size-3.5 mr-1.5" /> Fiyat Listesini Çıktı Al
                            </Button>
                        )}
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
                            <Button size="sm" className="h-8 text-xs" onClick={() => { setKatalogSecili(new Set()); setKatalogArama(''); setKatalogAcik(true); loadKatalog(); }}>
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
                    {/* Katalog sayısı burada gösterilmiyor: katalog artık yalnızca
                        "Ürün Ekle" açılınca yükleniyor (okuma tasarrufu). */}
                    {role !== 'admin' ? (
                        <>
                            <p>Menünüzde ürün yok</p>
                            <p className="text-xs">"Ürün Ekle" ile katalogdan sattıklarınızı seçin.</p>
                        </>
                    ) : (
                        <p>Henüz ürün eklenmemiş</p>
                    )}
                </div>
            ) : (
                <div className="flex flex-col gap-4 flex-1 min-h-0">
                    {/* Tek toolbar satırı: solda filtreler (durum + kategori),
                        sağda arama + sıralama. Dar ekranda satır alt satıra sarıyor
                        (referans kalıbı: yatay kaydırma yok, flex-wrap var). */}
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {role !== 'admin' && (
                            <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground">
                                {[
                                    { id: 'satista', ad: 'Satışta' },
                                    { id: 'kapali', ad: 'Kapalı' },
                                    { id: 'hepsi', ad: 'Tümü' },
                                ].map((d) => {
                                    const active = durumFiltre === d.id;
                                    return (
                                        <button
                                            key={d.id}
                                            onClick={() => setDurumFiltre(d.id)}
                                            className={`rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${active ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground'}`}
                                        >
                                            {d.ad}
                                            <span className={`ml-1.5 tabular-nums ${active ? 'text-muted-foreground' : 'opacity-60'}`}>
                                                {durumSayim[d.id]}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {/* KATEGORİ SEÇİMİ ROLE GÖRE:
                            Şube sahibinde 11-15 kategori var ve yatay çip rayı dar
                            ekranda çalışmıyordu (375px'te 15 çipten yalnızca 2'si
                            görünüyor). Tasarım referansında (next-shadcn-admin-dashboard)
                            çip/segment rayı hiçbir yerde 5 öğeyi geçmiyor; 6+ seçenek
                            için Select kullanılmış ve seçili değer tetikleyicide
                            "Kategori: X" biçiminde gösteriliyor (users.tsx kalıbı).
                            Ayrıca referansta hiçbir filtre satırı yatay kaydırmıyor,
                            hepsi wrap ediyor.
                            Admin taksonomiyi bir bütün görmek istediği için onda ray kalır. */}
                        {role !== 'admin' ? (
                            <Select
                                value={etkinKategori}
                                onValueChange={(v) => setSelectedKategori(v)}
                            >
                                <SelectTrigger size="sm" className="h-8 w-full min-w-0 text-xs sm:w-auto sm:min-w-[11rem]">
                                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                                        <span className="shrink-0 text-muted-foreground">Kategori:</span>
                                        <SelectValue />
                                    </span>
                                </SelectTrigger>
                                <SelectContent align="start">
                                    {[{ id: 'all', ad: 'Tümü' }, ...gosterilecekKategoriler].map((k) => (
                                        <SelectItem key={k.id} value={k.id} className="text-xs">
                                            {k.ad}
                                            <span className="ml-1.5 tabular-nums text-muted-foreground">
                                                {k.id === 'all' ? sayimTabani.length : (katSayim.get(k.id) || 0)}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            // min-w-0: flex satırında öğenin varsayılan `min-width:auto`
                            // değeri, rayın içerik genişliğinin altına inmesini engelliyor.
                            <KaydirilirRay className="min-w-0 lg:flex-1">
                            <div className="inline-flex w-max items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground">
                                {[{ id: 'all', ad: 'Tümü' }, ...gosterilecekKategoriler].map((k) => {
                                    const active = etkinKategori === k.id;
                                    const adet = k.id === 'all' ? sayimTabani.length : (katSayim.get(k.id) || 0);
                                    return (
                                        <button
                                            key={k.id}
                                            onClick={(e) => {
                                                setSelectedKategori(k.id);
                                                // Yarım görünen çipe tıklanınca tamamı görünür alana gelsin
                                                e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
                                            }}
                                            className={`rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${active ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground'}`}
                                        >
                                            {k.ad}
                                            {/* Sayı sekmenin kendisinde: şube "Dondurmalar"a
                                                tıklamadan kaç ürünü olduğunu görmeli. */}
                                            <span className={`ml-1.5 tabular-nums ${active ? 'text-muted-foreground' : 'opacity-60'}`}>{adet}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </KaydirilirRay>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                            <div className="relative w-full sm:w-56">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                                <Input
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Ürün ara..."
                                    className="h-8 pl-8 text-xs"
                                />
                            </div>
                            {(
                                // Sıralama tablo başlıklarındaydı; grid'de başlık yok,
                                // aynı sortCol/sortDir durumunu buradan sürüyoruz.
                                <select
                                    value={sortCol ? `${sortCol}:${sortDir}` : ''}
                                    onChange={(e) => {
                                        const [c, d] = e.target.value.split(':');
                                        setSortCol(c || null);
                                        setSortDir(d || 'asc');
                                    }}
                                    className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                                    aria-label="Sıralama"
                                >
                                    <option value="">Varsayılan sıra</option>
                                    <option value="ad:asc">İsim (A→Z)</option>
                                    <option value="ad:desc">İsim (Z→A)</option>
                                    <option value="fiyat:asc">Fiyat (artan)</option>
                                    <option value="fiyat:desc">Fiyat (azalan)</option>
                                    <option value="kategori:asc">Kategori</option>
                                    <option value="tarih:desc">En yeni</option>
                                </select>
                            )}
                            {/* "Tümünü seç" tablo başlığındaydı; tablo kalkınca toplu
                                işlem için tek seçim yolu kart kart tıklamak kalıyordu. */}
                            {role === 'admin' && secilebilirSayfa.length > 0 && (
                                <Button variant="outline" size="sm" className="h-8 text-xs"
                                        onClick={toggleSelectAllPage}>
                                    <Check className="size-3.5 mr-1.5" />
                                    {tumuSeciliMi ? 'Seçimi kaldır' : 'Tümünü seç'}
                                </Button>
                            )}
                            {role === 'admin' && subeler.length > 0 && (
                                <Popover open={subeComboOpen} onOpenChange={setSubeComboOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" role="combobox" aria-expanded={subeComboOpen} className="w-fit min-w-[180px] justify-between font-normal text-sm h-8">
                                            {selectedSube === 'all' ? 'Tüm Şubeler' : selectedSube === 'ortak' ? `Ortak Ürünler (${ortakUrunSayisi})` : (() => { const s = subeler.find(s => s.slug === selectedSube); return s ? `${s.ad} (${subeMenuSayisi[selectedSube] || 0})` : selectedSube; })()}
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
                                                            {s.ad} ({subeMenuSayisi[s.slug] || 0})
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

                    {/* Ürün ızgarası — tek görünüm. Eski tablo görünümü kaldırıldı:
                        kart hem admin hem şube için aynı bilgiyi (seçim, "kaç şubede
                        açık", şube durumu) taşıyor, iki ayrı düzen bakmaya değmiyordu. */}
                    <div className="flex-1 min-h-0 overflow-auto">
                        <div className="flex min-w-0 flex-col gap-6 p-4">
                            {gridGruplari.length === 0 && (
                                <p className="py-12 text-center text-sm text-muted-foreground">
                                    {durumFiltre === 'kapali' ? 'Kapalı ürününüz yok — hepsi satışta.'
                                        : durumFiltre === 'satista' ? 'Satışta ürününüz yok.'
                                        : 'Sonuç bulunamadı.'}
                                </p>
                            )}
                            {gridGruplari.map((grup) => (
                            <div key={grup.id} className="flex min-w-0 flex-col gap-2">
                                {grup.ad && (
                                    <div className="flex items-baseline gap-2 border-b pb-1.5">
                                        <h3 className="text-sm font-medium text-foreground">{grup.ad}</h3>
                                        <span className="text-xs text-muted-foreground">{grup.urunler.length} ürün</span>
                                    </div>
                                )}
                                {/* Yatay şerit: kategori tek satırda kalır, yana kaydırılır.
                                    `[&>*]:w-40` — flex çocuğu kart olduğu için sabit genişlik
                                    şart, yoksa içeriğe göre büzülür. `snap` ile kart kart durur.
                                    Kategori seçiliyken sarmalı grid: orada dikey akış doğru. */}
                                {/* min-w-0: sütun yönlü flex'te çocuk, içeriğinin
                                    min-content genişliğinin altına inmiyor — şerit
                                    kendi içinde kaydırılacağına kartı (1775px) taşırıp
                                    overflow-hidden'ın altına saklıyordu; odak bir kartı
                                    görünür yapmak isteyince tüm sayfa yana kayıyordu. */}
                                <div className={yataySeritler
                                    ? 'flex min-w-0 snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2 [&>*]:w-40 [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-44'
                                    : 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'}>
                            {grup.urunler.map((ham) => {
                                const urun = subeGozuyle(ham);
                                const mevcutDegil = urun.mevcut_degil || [];
                                // ŞUBE EYLEMLERİ yalnızca bir şubeye BAKILIRKEN çıkar.
                                // Admin katalog görünümündeyken (Ortak Ürünler / Tüm Şubeler)
                                // `gorunenSube` boştur ve eylemler görünmez — eskiden admin'in
                                // KENDİ şubesi üzerinden işlem yapıyorlardı, yanıltıcıydı.
                                // Admin bir şube seçtiğinde o şube adına işlem yapar.
                                const ortakUrun = !!gorunenSube && urun.tur !== 'sube_ozel';
                                // Admin kartında tablodaki bilgi kaybolmasın: toplu seçim
                                // kutusu ve "kaç şubede açık" karta taşındı.
                                const adminKart = role === 'admin';
                                const acikSube = (urun.menude_subeler || []).length;
                                return (
                                    <UrunKarti
                                        key={urun.id}
                                        urun={urun}
                                        mevcut={!mevcutDegil.includes(gorunenSube)}
                                        kilitli={kilitliMi(urun)}
                                        bekliyor={mevcutBekleyen.has(urun.id)}
                                        secili={adminKart ? selectedIds.has(urun.id) : undefined}
                                        onSecim={adminKart ? toggleSelect : null}
                                        altBilgi={!adminKart ? null
                                            : gorunenSube
                                                // Bir şubeye bakılıyorken "90 şubede açık" bilgisi
                                                // alakasız; o şubedeki durum lazım.
                                                ? (mevcutDegil.includes(gorunenSube) ? 'bu şubede kapalı' : 'bu şubede satışta')
                                                : (urun.tur === 'sube_ozel'
                                                    ? `şubeye özel · ${urun.sube_slug || ''}`
                                                    : `${acikSube} şubede açık`)}
                                                onMevcutDegistir={ortakUrun ? handleMevcutToggle : null}
                                                onEtiket={ortakUrun ? ((u) => { setEtiketUrun(u); setEtiketSecim(u.subeEtiket || []); }) : null}
                                        onDuzenle={openEditUrun}
                                        onFiyat={ortakUrun && fiyatiDuzenlenebilirMi(urun)
                                            ? ((u) => { setFiyatUrun(u); setFiyatDeger(fiyatGirdi(u.etkinFiyat ?? u.fiyat)); }) : null}
                                        onMenudenCikar={ortakUrun && menudenCikarilabilir(urun) ? handleMenudenCikar : null}
                                        onSil={handleUrunDelete}
                                        silHepGorunur={adminKart}
                                        tiklamaSecer={adminKart}
                                    />
                                );
                            })}
                            {/* Şeridin sonunda "hepsini gör": 170 ürünlü kategoride
                                sonuna kaydırmak uzun sürüyor; bu kart o kategorinin
                                sekmesine geçirip sayfalanmış grid'i açıyor.
                                Eşik: ekrana sığandan fazlası varsa göster — yoksa
                                zaten hepsi görünürken gereksiz bir kart olurdu. */}
                            {yataySeritler && grup.urunler.length > 8 && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedKategori(grup.id)}
                                    className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed bg-card text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                                >
                                    <ChevronRight className="size-5" />
                                    <span className="text-xs font-medium">Hepsini gör</span>
                                    <span className="text-[11px] tabular-nums">{grup.urunler.length} ürün</span>
                                </button>
                            )}
                                </div>
                            </div>
                            ))}
                        </div>
                    </div>

                    {/* Alt bilgi + sayfalama */}
                    <div className="flex flex-col gap-3 px-4 pb-1 shrink-0 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-muted-foreground text-sm">
                            {sayfalamaVar
                                ? `${sortedUrunler.length} üründen ${sortedUrunler.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1}-${Math.min(currentPage * ITEMS_PER_PAGE, sortedUrunler.length)} arası gösteriliyor`
                                : `${sortedUrunler.length} ürün`}
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

            {/* A4 fiyat listesi penceresi. Basılacak liste = MÜŞTERİYE GÖRÜNEN
                menü: menüdeki ürünler, "mevcut değil" olanlar hariç, şubenin
                geçerli fiyatlarıyla (subeGozuyle `etkinFiyat`i çözüyor). */}
            {gorunenSube && (
                <FiyatListesiPenceresi
                    acik={fiyatListesiAcik}
                    kapat={() => setFiyatListesiAcik(false)}
                    urunler={urunler
                        .filter((u) => (u.menude_subeler || []).includes(gorunenSube)
                            || (u.tur === 'sube_ozel' && u.sube_slug === gorunenSube))
                        .filter((u) => !(u.mevcut_degil || []).includes(gorunenSube))
                        .map(subeGozuyle)}
                    kategoriler={kategoriler}
                    subeAd={subeler.find((x) => x.slug === gorunenSube)?.ad || subeSlugAd(gorunenSube)}
                />
            )}

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
                                {katalogYukleniyor ? (
                                    <p className="py-8 text-center text-sm text-muted-foreground">Katalog yükleniyor...</p>
                                ) : katalogUrunleri.length === 0 ? (
                                    <p className="py-8 text-center text-sm text-muted-foreground">
                                        Katalogdaki tüm ürünler zaten menünüzde.
                                    </p>
                                ) : liste.length === 0 ? (
                                    <div className="py-8 text-center space-y-2">
                                        <p className="text-sm text-muted-foreground">Sonuç bulunamadı</p>
                                        <Button variant="outline" size="sm" className="h-8 text-xs"
                                                onClick={() => { setKatalogAcik(false); setTalepAcik(true); }}>
                                            <Send className="size-3.5 mr-1.5" /> "{katalogArama.trim()}" için talep oluştur
                                        </Button>
                                    </div>
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
                                                    {/* Kısalan ada tam metni title ile ver: merkezin
                                                        katalogunda içindeki aromaları tek tek sayan
                                                        çok uzun adlar var. */}
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm font-medium text-foreground" title={u.ad}>{u.ad}</span>
                                                        <span className="block truncate text-xs text-muted-foreground">{katMap[u.kategori] || '—'}</span>
                                                    </span>
                                                    <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                                                        {fiyatYaz(u.etkinFiyat ?? u.fiyat)} ₺
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                    <div className="flex items-center justify-between gap-2 pt-1">
                        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground"
                                onClick={() => { setKatalogAcik(false); setTalepAcik(true); }}>
                            <Send className="size-3.5 mr-1.5" /> Aradığınız yok mu? Talep açın
                        </Button>
                        <div className="flex gap-2">
                        <Button variant="outline" onClick={() => { setKatalogAcik(false); setKatalogSecili(new Set()); }}>İptal</Button>
                        <Button onClick={handleKatalogEkle} disabled={katalogBusy || katalogSecili.size === 0}>
                            {katalogBusy ? 'Ekleniyor...' : `${katalogSecili.size > 0 ? katalogSecili.size + ' ' : ''}Ürünü Ekle`}
                        </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <UrunTalepModal
                acik={talepAcik}
                onKapat={() => setTalepAcik(false)}
                kategoriler={kategoriler}
                onGonderildi={() => toast.success('Talebiniz merkeze iletildi')}
                onKatalogtanEkle={async (urunId) => {
                    try {
                        await menuyeYaz([urunId], true);
                        toast.success('Ürün menünüze eklendi');
                        loadUrunler();
                    } catch (err) { toast.error(err.response?.data?.error || 'Ürün eklenemedi'); }
                }}
            />

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

            {/* Şube etiketi — merkezin etiketini değiştirmez, kendi menüsüne
                ekler. Müşteri menüsünde ikisi birleşik görünür. */}
            <Dialog open={!!etiketUrun} onOpenChange={(o) => !o && setEtiketUrun(null)}>
                <DialogContent className="sm:max-w-md">
                    {etiketUrun && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Tag className="size-4" /> Şube Etiketleri
                                </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3">
                                <p className="text-sm text-muted-foreground">
                                    <span className="font-medium text-foreground">{etiketUrun.ad}</span>
                                    {' — '}yalnızca kendi menünüzde görünür.
                                </p>
                                {(etiketUrun.etiket || []).length > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        Merkezin etiketleri:{' '}
                                        {(etiketUrun.etiket || [])
                                            .map((k) => ETIKETLER.find((t) => t.key === k)?.ad || k).join(', ')}
                                        {' '}— bunlar kaldırılamaz.
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-1.5">
                                    {ETIKETLER.map((t) => {
                                        const secili = etiketSecim.includes(t.key);
                                        const merkezde = (etiketUrun.etiket || []).includes(t.key);
                                        return (
                                            <button
                                                key={t.key}
                                                type="button"
                                                disabled={merkezde}
                                                title={merkezde ? 'Merkez bu etiketi zaten koymuş' : ''}
                                                onClick={() => setEtiketSecim((p) =>
                                                    p.includes(t.key) ? p.filter((x) => x !== t.key) : [...p, t.key])}
                                                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                                                    merkezde ? 'cursor-not-allowed opacity-40'
                                                        : secili ? 'border-transparent text-white' : 'hover:bg-muted'
                                                }`}
                                                style={secili && !merkezde ? { background: t.color } : undefined}
                                            >
                                                {t.emoji} {t.ad}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                                <Button variant="outline" onClick={() => setEtiketUrun(null)}>İptal</Button>
                                <Button disabled={etiketKaydediliyor} onClick={handleEtiketKaydet}>
                                    {etiketKaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
                                </Button>
                            </div>
                        </>
                    )}
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
                                    {' — '}merkez fiyatı {fiyatYaz(fiyatUrun.fiyat)} ₺
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
                            <div className="flex items-center justify-end gap-2 pt-1">
                                {/* Yanlış girilmiş şube fiyatını merkeze döndürmek
                                    için: override silinir, şube merkez fiyatına döner. */}
                                {role === 'admin' && gorunenSube
                                    && fiyatUrun.fiyat_override?.[gorunenSube] != null && (
                                    <Button
                                        variant="ghost"
                                        className="mr-auto text-xs text-muted-foreground"
                                        disabled={fiyatKaydediliyor}
                                        onClick={async () => {
                                            setFiyatKaydediliyor(true);
                                            try {
                                                await api.put(`/products/${fiyatUrun.id}/sube-fiyat`,
                                                    { subeSlug: gorunenSube, fiyat: null });
                                                setUrunler((prev) => prev.map((u) => {
                                                    if (u.id !== fiyatUrun.id) return u;
                                                    const o = { ...(u.fiyat_override || {}) };
                                                    delete o[gorunenSube];
                                                    return { ...u, fiyat_override: o };
                                                }));
                                                toast.success('Şube fiyatı kaldırıldı, merkez fiyatı geçerli');
                                                setFiyatUrun(null);
                                            } catch (err) {
                                                toast.error(err.response?.data?.error || 'Fiyat sıfırlanamadı');
                                            }
                                            setFiyatKaydediliyor(false);
                                        }}
                                    >
                                        Merkez fiyatına döndür
                                    </Button>
                                )}
                                <Button variant="outline" onClick={() => setFiyatUrun(null)}>İptal</Button>
                                <Button
                                    disabled={fiyatKaydediliyor || fiyatDeger === ''}
                                    onClick={async () => {
                                        setFiyatKaydediliyor(true);
                                        try {
                                            // Admin bir şubeye bakıyorsa ŞUBE fiyatını yazar
                                            // (urun_sube.fiyat_override); merkez fiyatı ürün
                                            // düzenleme formundan değişir. Şube sahibi eski
                                            // yolu kullanır — sunucu onu override'a çeviriyor.
                                            const { data } = (role === 'admin' && gorunenSube)
                                                ? await api.put(`/products/${fiyatUrun.id}/sube-fiyat`,
                                                    { subeSlug: gorunenSube, fiyat: fiyatDeger === '' ? null : Number(fiyatDeger) })
                                                : await api.put(`/products/${fiyatUrun.id}`, { fiyat: Number(fiyatDeger) });
                                            const yeni = data?.urun?.etkinFiyat ?? Number(fiyatDeger);
                                            setUrunler((prev) => prev.map((u) => (u.id !== fiyatUrun.id ? u
                                                // Admin görünümünde kart fiyatı `fiyat_override`dan
                                                // türetiliyor (bkz. subeGozuyle); `etkinFiyat` yazmak
                                                // yetmez, harita tazelenmeli.
                                                : (role === 'admin' && gorunenSube)
                                                    ? { ...u, fiyat_override: { ...(u.fiyat_override || {}), [gorunenSube]: yeni } }
                                                    : { ...u, etkinFiyat: yeni })));
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
