import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../services/api';
import { Plus, Trash2, X, Search, ArrowUp, ArrowDown, ArrowUpDown, RotateCcw, Trash, ImagePlus, Images, Sparkles, Eye, EyeOff, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Check, ChevronsUpDown } from 'lucide-react';
import { proxyImageUrl } from '../../../utils/imageProxy';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';

const ETIKETLER = [
    { key: 'en_cok_satan', label: 'En Çok Satan', emoji: '🔥', color: '#ef4444' },
    { key: 'yeni', label: 'Yeni', emoji: '✨', color: '#8b5cf6' },
    { key: 'onerilen', label: 'Önerilen', emoji: '⭐', color: '#f59e0b' },
    { key: 'vegan', label: 'Vegan', emoji: '🌱', color: '#22c55e' },
    { key: 'acili', label: 'Acılı', emoji: '🌶️', color: '#dc2626' },
];

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
    const [urunForm, setUrunForm] = useState({ ad: '', fiyat: '', kategori: '', aciklama: '', sube_slug: '', gorsel: '', etiket: [], miktar: '', birim: 'gr' });
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [showMediaLibrary, setShowMediaLibrary] = useState(false);
    const [mediaImages, setMediaImages] = useState([]);
    const [loadingMedia, setLoadingMedia] = useState(false);
    const [mediaSearch, setMediaSearch] = useState('');
    const [aiLoading, setAiLoading] = useState(false);

    const [showTrash, setShowTrash] = useState(false);
    const [trashUrunler, setTrashUrunler] = useState([]);

    const [kategoriler, setKategoriler] = useState([]);
    const [subeler, setSubeler] = useState([]);
    const [ortakUrunSayisi, setOrtakUrunSayisi] = useState(0);

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
        setUrunForm({ ad: '', fiyat: '', kategori: kategoriler[0]?.id || '', aciklama: '', sube_slug: subeSlug || '', gorsel: '', etiket: [], miktar: '', birim: 'gr' });
        setImageFile(null); setImagePreview(null);
        setViewMode('add');
    }

    function openEditUrun(urun) {
        setEditingUrun(urun);
        setUrunForm({ ad: urun.ad, fiyat: urun.fiyat, kategori: urun.kategori || '', aciklama: urun.aciklama || '', sube_slug: urun.sube_slug || '', gorsel: urun.gorsel || '', etiket: urun.etiket || [], miktar: urun.miktar || '', birim: urun.birim || 'gr' });
        setImageFile(null); setImagePreview(urun.gorsel || null);
        setViewMode('edit');
    }

    function closeUrunView() { setViewMode('list'); setEditingUrun(null); setImageFile(null); setImagePreview(null); }

    function handleImageSelect(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { toast.error('Dosya 10MB\'dan küçük olmalı'); return; }
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
        setShowMediaLibrary(false);
    }

    async function loadMediaImages() {
        setLoadingMedia(true);
        setMediaSearch('');
        try {
            const { data } = await api.get('/media');
            setMediaImages((data.medyalar || []).map(m => ({ key: m.id, url: m.url, ad: m.ad })));
        } catch { toast.error('Görseller yüklenemedi'); }
        setLoadingMedia(false);
    }

    function selectFromLibrary(url) {
        setImageFile(null);
        setImagePreview(url);
        setUrunForm(prev => ({ ...prev, gorsel: url }));
        setShowMediaLibrary(false);
    }

    async function handleUrunSubmit(e) {
        e.preventDefault();
        setSavingUrun(true);
        try {
            const payload = { ad: urunForm.ad, fiyat: Number(urunForm.fiyat), kategori: urunForm.kategori, aciklama: urunForm.aciklama, etiket: urunForm.etiket || [], miktar: urunForm.miktar ? Number(urunForm.miktar) : null, birim: urunForm.birim || '' };
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

    const katMap = {};
    kategoriler.forEach((k) => { katMap[k.id] = k.ad; });

    const filteredUrunler = urunler.filter((u) => {
        const matchKategori = selectedKategori === 'all' || u.kategori === selectedKategori;
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

    // ---------- DETAIL / FORM VIEW ----------
    if (viewMode !== 'list') {
        return (
            <div className="flex flex-1 flex-col gap-4 max-w-[1600px] mx-auto w-full h-full min-h-0">
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
                                    {/* Image */}
                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground font-medium">Görsel</Label>
                                        {imagePreview ? (
                                            <div className="relative group/img">
                                                <img src={proxyImageUrl(imagePreview)} alt="Önizleme" className="w-full aspect-square rounded-xl object-cover ring-1 ring-border" />
                                                <div className="absolute inset-0 rounded-xl bg-black/0 group-hover/img:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover/img:opacity-100">
                                                    <Button type="button" variant="secondary" size="sm" className="h-7 text-xs shadow-lg" onClick={() => document.getElementById('imageInput').click()}>
                                                        <ImagePlus className="size-3" /> Değiştir
                                                    </Button>
                                                    <Button type="button" variant="secondary" size="sm" className="h-7 text-xs shadow-lg text-destructive hover:text-destructive" onClick={() => { setImageFile(null); setImagePreview(null); setUrunForm({ ...urunForm, gorsel: '' }); }}>
                                                        <X className="size-3" /> Kaldır
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button type="button" onClick={() => document.getElementById('imageInput').click()}
                                                className="w-full aspect-square rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/20 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/30 hover:bg-muted/40 transition-colors cursor-pointer">
                                                <ImagePlus className="size-8 opacity-40" />
                                                <span className="text-[11px] font-medium">Görsel Ekle</span>
                                            </button>
                                        )}
                                        <Button type="button" variant="ghost" size="sm" className="w-full text-xs h-7 text-muted-foreground" onClick={() => { setShowMediaLibrary(true); loadMediaImages(); }}>
                                            <Images className="size-3" /> Kütüphaneden seç
                                        </Button>
                                        <input id="imageInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageSelect} className="hidden" />
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

                    {/* Media Library Dialog */}
                    {showMediaLibrary && (
                        <div className="mt-4 rounded-xl border bg-card overflow-hidden">
                            <div className="p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-semibold">Görsel Kütüphanesi</span>
                                    <div className="flex gap-1.5">
                                        <Button type="button" size="sm" className="h-7 text-xs" onClick={() => document.getElementById('imageInput').click()}>
                                            <ImagePlus className="size-3" /> Yeni Yükle
                                        </Button>
                                        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setShowMediaLibrary(false)}>
                                            <X className="size-4" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                                    <Input type="text" placeholder="Görsel ara..." value={mediaSearch} onChange={(e) => setMediaSearch(e.target.value)} className="h-8 pl-8 text-xs" />
                                </div>
                                {loadingMedia ? (
                                    <div className="flex items-center justify-center py-8"><Spinner className="size-5" /></div>
                                ) : (() => {
                                    const filteredMedia = mediaImages.filter(img => !mediaSearch || img.ad?.toLowerCase().includes(mediaSearch.toLowerCase()));
                                    return filteredMedia.length === 0 ? (
                                        <p className="text-center text-xs text-muted-foreground py-6">{mediaSearch ? 'Sonuç bulunamadı' : 'Henüz görsel yok.'}</p>
                                    ) : (
                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2 max-h-56 overflow-y-auto">
                                            {filteredMedia.map((img) => (
                                                <img key={img.key} src={proxyImageUrl(img.url)} alt=""
                                                    onClick={() => selectFromLibrary(img.url)}
                                                    className={`w-full aspect-square object-cover rounded-lg border cursor-pointer transition-all ring-2 hover:opacity-100 ${imagePreview === img.url ? 'ring-primary opacity-100 scale-95' : 'ring-transparent opacity-75 hover:ring-muted-foreground/30'}`} />
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ---------- LIST VIEW ----------
    return (
        <div className="flex flex-1 flex-col gap-4 max-w-[1600px] mx-auto w-full h-full min-h-0">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Ürünler</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">Menünüzdeki ürünleri görüntüleyin ve yönetin.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" className="h-8 shadow-sm text-xs" onClick={async () => {
                        try { const { data } = await api.get('/products/trash'); setTrashUrunler(data.urunler); setShowTrash(true); }
                        catch (err) { toast.error('Çöp kutusu yüklenemedi'); }
                    }}>
                        <Trash className="size-3.5 mr-1.5" /> Silinenler
                    </Button>
                    <Button size="sm" className="h-8 shadow-sm bg-primary hover:bg-primary/90 text-primary-foreground text-xs" onClick={openAddUrun}>
                        <Plus className="size-3.5 mr-1.5" /> Yeni Ürün Ekle
                    </Button>
                </div>
            </div>

            {role !== 'admin' && !subeSlug && (
                <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
                    Şube bilginiz tanımlanmamış. Yönetici ile iletişime geçin.
                </div>
            )}

            {loadingUrunler ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                    <Spinner className="size-8" />
                    <p className="text-sm text-muted-foreground">Ürünler yükleniyor...</p>
                </div>
            ) : urunler.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                    <span className="text-4xl">📋</span>
                    <p>Henüz ürün eklenmemiş</p>
                </div>
            ) : (
                <div className="flex flex-col gap-4 flex-1 min-h-0">
                    {/* Filters Bar */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
                        <div className="relative w-full sm:w-64">
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
                                <PopoverContent className="w-[260px] p-0" align="start">
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
                        <span className="hidden text-muted-foreground text-xs lg:flex items-center">{sortedUrunler.length} ürün</span>
                    </div>

                    {/* Category Tabs */}
                    <Tabs value={selectedKategori} onValueChange={setSelectedKategori} className="shrink-0">
                        <TabsList variant="line" className="flex-wrap h-auto gap-0">
                            <TabsTrigger value="all" className="text-xs">Tümü</TabsTrigger>
                            {kategoriler.map((k) => (
                                <TabsTrigger key={k.id} value={k.id} className="text-xs">{k.ad}</TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>

                    {/* Table */}
                    <div className="rounded-lg border overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-30"></TableHead>
                                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('ad')}>
                                        <span className="inline-flex items-center">Ürün <SortIcon col="ad" /></span>
                                    </TableHead>
                                    <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort('fiyat')}>
                                        <span className="inline-flex items-center">Fiyat <SortIcon col="fiyat" /></span>
                                    </TableHead>
                                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('kategori')}>
                                        <span className="inline-flex items-center">Kategori <SortIcon col="kategori" /></span>
                                    </TableHead>
                                    {role === 'admin' && <TableHead>Şube</TableHead>}
                                    {role !== 'admin' && subeSlug && <TableHead className="text-center">Durum</TableHead>}
                                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('tarih')}>
                                        <span className="inline-flex items-center">Tarih <SortIcon col="tarih" /></span>
                                    </TableHead>
                                    <TableHead className="w-20">İşlemler</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedUrunler.map((urun) => {
                                    const mevcutDegil = urun.mevcut_degil || [];
                                    const buSubedeMevcut = !mevcutDegil.includes(subeSlug);
                                    const isKilitli = role !== 'admin' && (kategoriler.find(k => k.id === urun.kategori)?.kilitli || urun.tur !== 'sube_ozel');

                                    return (
                                        <TableRow
                                            key={urun.id}
                                            className={`group transition-colors ${!buSubedeMevcut ? 'opacity-50' : ''} ${!isKilitli ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                                            onClick={(e) => {
                                                if (e.target.closest('button')) return;
                                                if (!isKilitli) openEditUrun(urun);
                                            }}
                                        >
                                            <TableCell className="py-3">
                                                {urun.gorsel
                                                    ? <img src={proxyImageUrl(urun.gorsel)} alt={urun.ad} className="w-45 h-20 rounded-lg object-cover ring-1 ring-border" />
                                                    : <span className="text-3xl">🍮</span>}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-semibold text-base">{urun.ad}</span>
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
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="secondary" className="font-bold tabular-nums">
                                                    {Math.round(urun.fiyat)} ₺
                                                    {urun.miktar && <span className="font-normal text-muted-foreground ml-1">/ {urun.miktar}{urun.birim}</span>}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="font-medium text-xs">
                                                    {katMap[urun.kategori] || '—'}
                                                </Badge>
                                            </TableCell>
                                            {role === 'admin' && (
                                                <TableCell>
                                                    {urun.tur === 'sube_ozel' && urun.sube_slug
                                                        ? <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border-0">{urun.sube_slug}</Badge>
                                                        : <span className="text-xs text-muted-foreground">Ortak</span>}
                                                </TableCell>
                                            )}
                                            {role !== 'admin' && subeSlug && (
                                                <TableCell className="text-center">
                                                    <Badge variant={buSubedeMevcut ? 'default' : 'destructive'} className={`text-[10px] ${buSubedeMevcut ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0' : ''}`}>
                                                        {buSubedeMevcut ? '✓ Mevcut' : '✗ Mevcut Değil'}
                                                    </Badge>
                                                </TableCell>
                                            )}
                                            <TableCell className="text-xs text-muted-foreground">
                                                {urun.createdAt ? new Date(urun.createdAt).toLocaleDateString('tr-TR') : '—'}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {!isKilitli && (
                                                        <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive hover:bg-destructive/10" title="Sil" onClick={() => handleUrunDelete(urun)}>
                                                            <Trash2 className="size-3.5" />
                                                        </Button>
                                                    )}
                                                    {role !== 'admin' && subeSlug && (
                                                        <Button variant="ghost" size="icon" className="size-7" title={buSubedeMevcut ? 'Mevcut Değil Yap' : 'Mevcut Yap'} onClick={async () => {
                                                            try {
                                                                await api.put(`/products/${urun.id}/availability`, { subeSlug, mevcut: !buSubedeMevcut });
                                                                setUrunler(prev => prev.map(u => u.id === urun.id ? {
                                                                    ...u,
                                                                    mevcut_degil: buSubedeMevcut
                                                                        ? [...(u.mevcut_degil || []), subeSlug]
                                                                        : (u.mevcut_degil || []).filter(s => s !== subeSlug)
                                                                } : u));
                                                            } catch (err) { toast.error('Güncelleme başarısız'); }
                                                        }}>
                                                            {buSubedeMevcut ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
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

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-1 shrink-0 pb-2">
                            <div className="hidden flex-1 text-muted-foreground text-sm lg:flex">
                                Toplam {sortedUrunler.length} üründen {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, sortedUrunler.length)} arası gösteriliyor.
                            </div>
                            <div className="flex w-full items-center gap-4 lg:w-fit sm:justify-end">
                                <div className="flex w-fit items-center justify-center font-medium text-sm text-muted-foreground">
                                    Sayfa {currentPage} / {totalPages}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" className="hidden size-8 lg:flex" size="icon" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>
                                        <span className="sr-only">İlk sayfa</span>
                                        <ChevronsLeft className="size-4" />
                                    </Button>
                                    <Button variant="outline" className="size-8" size="icon" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                                        <span className="sr-only">Önceki sayfa</span>
                                        <ChevronLeft className="size-4" />
                                    </Button>
                                    <Button variant="outline" className="size-8" size="icon" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                                        <span className="sr-only">Sonraki sayfa</span>
                                        <ChevronRight className="size-4" />
                                    </Button>
                                    <Button variant="outline" className="hidden size-8 lg:flex" size="icon" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(totalPages)}>
                                        <span className="sr-only">Son sayfa</span>
                                        <ChevronsRight className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

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
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
