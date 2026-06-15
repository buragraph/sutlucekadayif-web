import { useState, useEffect } from 'react';
import api from '../../../services/api';
import { Plus, Pencil, Trash2, X, GripVertical, Globe, MapPin, ImagePlus, Images, FolderOpen, Package } from 'lucide-react';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { proxyImageUrl } from '../../../utils/imageProxy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';

export default function CategoriesPage() {
    const toast = useToast();
    const confirm = useConfirm();
    const [kategoriler, setKategoriler] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ ad: '', sira: '', tur: 'ortak', renk: '#dbeafe', gorsel: '' });
    const [saving, setSaving] = useState(false);
    const [replaceState, setReplaceState] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [showMediaLibrary, setShowMediaLibrary] = useState(false);
    const [loadingMedia, setLoadingMedia] = useState(false);
    const [mediaImages, setMediaImages] = useState([]);

    const colorPalette = [
        { bg: '#dbeafe', text: '#1e40af', label: 'Mavi' },
        { bg: '#fce7f3', text: '#9d174d', label: 'Pembe' },
        { bg: '#d1fae5', text: '#065f46', label: 'Yeşil' },
        { bg: '#fef3c7', text: '#92400e', label: 'Sarı' },
        { bg: '#ede9fe', text: '#5b21b6', label: 'Mor' },
        { bg: '#fee2e2', text: '#991b1b', label: 'Kırmızı' },
        { bg: '#e0e7ff', text: '#3730a3', label: 'Lacivert' },
        { bg: '#ccfbf1', text: '#115e59', label: 'Turkuaz' },
        { bg: '#fff7ed', text: '#9a3412', label: 'Turuncu' },
        { bg: '#f0fdf4', text: '#166534', label: 'Koyu Yeşil' },
    ];

    useEffect(() => { loadKategoriler(); }, []);

    async function loadKategoriler() {
        setLoading(true);
        try { const { data } = await api.get('/categories'); setKategoriler(data.kategoriler); }
        catch (err) { console.error('Kategoriler yüklenemedi:', err); }
        setLoading(false);
    }

    function openAdd() { setEditing(null); setForm({ ad: '', sira: '', tur: 'ortak', renk: '#dbeafe', gorsel: '' }); setShowModal(true); }
    function openEdit(kat) { setEditing(kat); setForm({ ad: kat.ad, sira: kat.sira || '', tur: kat.tur || 'ortak', renk: kat.renk || '#dbeafe', gorsel: kat.gorsel || '' }); setShowModal(true); }
    function closeModal() { setShowModal(false); setEditing(null); setShowMediaLibrary(false); }

    async function handleSubmit(e) {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = { ad: form.ad, tur: form.tur, renk: form.renk, gorsel: form.gorsel || '' };
            if (form.sira !== '' && form.sira !== undefined) payload.sira = Number(form.sira);
            if (editing) { await api.put(`/categories/${editing.id}`, payload); }
            else { await api.post('/categories', payload); }
            closeModal();
            await loadKategoriler();
            toast.success(editing ? 'Kategori güncellendi' : 'Kategori oluşturuldu');
        } catch (err) { toast.error(err.response?.data?.error || 'Bir hata oluştu'); }
        setSaving(false);
    }

    async function handleDelete(kat) {
        const ok = await confirm(`"${kat.ad}" kategorisini silmek istediğinize emin misiniz?`);
        if (!ok) return;
        try {
            await api.delete(`/categories/${kat.id}`);
            await loadKategoriler();
            toast.success('Kategori silindi');
        } catch (err) {
            if (err.response?.status === 409 && err.response?.data?.requiresReplacement) {
                setReplaceState({
                    kat,
                    urunSayisi: err.response.data.urunSayisi,
                    yeniKategori: '',
                });
            } else {
                toast.error(err.response?.data?.error || 'Silme işlemi başarısız');
            }
        }
    }

    async function handleReplaceAndDelete() {
        if (!replaceState?.yeniKategori) {
            toast.warning('Lütfen bir kategori seçin');
            return;
        }
        try {
            await api.delete(`/categories/${replaceState.kat.id}?yeniKategori=${replaceState.yeniKategori}`);
            setReplaceState(null);
            await loadKategoriler();
            toast.success('Ürünler taşındı ve kategori silindi');
        } catch (err) {
            toast.error(err.response?.data?.error || 'İşlem başarısız');
        }
    }

    async function handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('image', file);
            const { data } = await api.post('/upload/image', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setForm((prev) => ({ ...prev, gorsel: data.url }));
            toast.success('Görsel yüklendi');
        } catch (err) {
            toast.error('Görsel yüklenemedi');
        }
        setUploading(false);
    }

    async function loadMediaImages() {
        setLoadingMedia(true);
        try {
            const { data } = await api.get('/media');
            setMediaImages(data.medyalar || []);
        } catch { toast.error('Görseller yüklenemedi'); }
        setLoadingMedia(false);
    }

    function selectFromLibrary(url) {
        setForm((prev) => ({ ...prev, gorsel: url }));
        setShowMediaLibrary(false);
    }

    const ortakKategoriler = kategoriler.filter(k => (k.tur || 'ortak') === 'ortak');
    const subeKategoriler = kategoriler.filter(k => k.tur === 'sube_ozel');

    function KategoriCard({ kat }) {
        const colorInfo = colorPalette.find(c => c.bg === kat.renk) || { bg: kat.renk || '#dbeafe', text: '#374151' };
        const isOrtak = (kat.tur || 'ortak') === 'ortak';

        return (
            <div className="group relative flex items-center gap-3 rounded-lg border bg-card p-3 hover:shadow-sm transition-shadow">
                {/* Drag Handle */}
                <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />

                {/* Color / Image */}
                {kat.gorsel ? (
                    <img src={proxyImageUrl(kat.gorsel)} alt={kat.ad} className="size-10 shrink-0 rounded-lg object-cover" />
                ) : (
                    <div className="size-10 shrink-0 rounded-lg flex items-center justify-center text-sm font-bold"
                         style={{ background: colorInfo.bg, color: colorInfo.text }}>
                        {kat.ad.charAt(0).toUpperCase()}
                    </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-foreground truncate">{kat.ad}</h3>
                        <span className="text-[11px] text-muted-foreground shrink-0">{kat.urunSayisi || 0} ürün</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        {isOrtak ? (
                            <span className="inline-flex items-center text-[10px] text-blue-600">
                                <Globe className="size-2.5 mr-0.5" /> Ortak
                            </span>
                        ) : (
                            <span className="inline-flex items-center text-[10px] text-amber-600">
                                <MapPin className="size-2.5 mr-0.5" /> Şubeye Özel
                            </span>
                        )}
                        {kat.renk && (
                            <span className="inline-block size-2.5 rounded-full border border-black/10" style={{ background: kat.renk }} />
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(kat)} title="Düzenle">
                        <Pencil className="size-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(kat)} title="Sil">
                        <Trash2 className="size-3" />
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col gap-4 w-full">
            {/* Page Header */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-3xl leading-none tracking-tight text-foreground">Kategoriler</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">Menü kategorilerinizi düzenleyin ve yönetin.</p>
                </div>
                <Button size="sm" className="h-8 shadow-sm bg-primary hover:bg-primary/90 text-primary-foreground text-xs" onClick={openAdd}>
                    <Plus className="size-3.5 mr-1.5" /> Kategori Ekle
                </Button>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                    <Spinner className="size-8" />
                    <p className="text-sm text-muted-foreground">Kategoriler yükleniyor...</p>
                </div>
            ) : kategoriler.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground border border-dashed rounded-lg bg-card">
                    <FolderOpen className="size-10 text-muted-foreground/40" />
                    <div className="text-center">
                        <p className="text-sm font-medium text-foreground">Henüz kategori yok</p>
                        <p className="text-xs text-muted-foreground mt-1">İlk kategorinizi ekleyerek başlayın.</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={openAdd} className="mt-1">
                        <Plus className="size-3.5 mr-1.5" /> Kategori Ekle
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {/* Ortak Kategoriler */}
                    {ortakKategoriler.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Globe className="size-3.5 text-blue-600" />
                                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ortak Kategoriler</h2>
                                <span className="text-[10px] text-muted-foreground">({ortakKategoriler.length})</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {ortakKategoriler.map((kat) => (
                                    <KategoriCard key={kat.id} kat={kat} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Şubeye Özel Kategoriler */}
                    {subeKategoriler.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <MapPin className="size-3.5 text-amber-600" />
                                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Şubeye Özel</h2>
                                <span className="text-[10px] text-muted-foreground">({subeKategoriler.length})</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {subeKategoriler.map((kat) => (
                                    <KategoriCard key={kat.id} kat={kat} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Add/Edit Modal */}
            <Dialog open={showModal} onOpenChange={(open) => !open && closeModal()}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md p-0 gap-0 border">
                    <DialogHeader className="px-5 py-3 border-b">
                        <DialogTitle className="text-sm font-medium">{editing ? 'Kategori Düzenle' : 'Yeni Kategori'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="flex flex-col">
                        <div className="px-5 py-4 flex flex-col gap-4">
                            {/* Görsel */}
                            <div className="space-y-2">
                                <Label className="text-xs font-medium">Görsel</Label>
                                {form.gorsel ? (
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <img src={proxyImageUrl(form.gorsel)} alt="Önizleme" className="size-20 rounded-lg object-cover border" />
                                            <button type="button" onClick={() => { setForm({ ...form, gorsel: '' }); }}
                                                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-white text-xs">
                                                <X className="size-2.5" />
                                            </button>
                                        </div>
                                        <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => { setShowMediaLibrary(true); loadMediaImages(); }}>
                                            <Images className="size-3 mr-1" />Değiştir
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <Button type="button" variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => document.getElementById('catImageInput').click()}>
                                            <ImagePlus className="size-3.5 mr-1.5" />Yeni Yükle
                                        </Button>
                                        <Button type="button" variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => { setShowMediaLibrary(true); loadMediaImages(); }}>
                                            <Images className="size-3.5 mr-1.5" />Kütüphaneden
                                        </Button>
                                    </div>
                                )}
                                <input id="catImageInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageUpload} className="hidden" />
                                {showMediaLibrary && (
                                    <div className="mt-2 flex max-h-60 flex-col rounded-md border bg-muted/30 p-3">
                                        <div className="mb-2 flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Görsel Kütüphanesi</span>
                                            <div className="flex gap-1.5">
                                                <Button type="button" size="sm" className="h-5 text-[10px] px-2" onClick={() => document.getElementById('catImageInput').click()}>+ Yükle</Button>
                                                <Button type="button" size="sm" variant="outline" className="h-5 text-[10px] px-2" onClick={() => setShowMediaLibrary(false)}>Kapat</Button>
                                            </div>
                                        </div>
                                        {loadingMedia ? (
                                            <p className="py-5 text-center text-xs text-muted-foreground">Yükleniyor...</p>
                                        ) : mediaImages.length === 0 ? (
                                            <p className="py-5 text-center text-xs text-muted-foreground">Henüz görsel yok.</p>
                                        ) : (
                                            <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(70px,1fr))] gap-1.5 overflow-y-auto">
                                                {mediaImages.map((img) => (
                                                    <img key={img.id} src={proxyImageUrl(img.url)} alt={img.ad} onClick={() => selectFromLibrary(img.url)}
                                                        className={`aspect-square w-full cursor-pointer rounded-md object-cover ${form.gorsel === img.url ? 'ring-2 ring-primary opacity-100' : 'opacity-70 hover:opacity-100'}`} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Ad */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Kategori Adı</Label>
                                <Input type="text" value={form.ad} onChange={(e) => setForm({ ...form, ad: e.target.value })} placeholder="örn: Tatlılar" required autoFocus />
                            </div>

                            {/* Tür */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Tür</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => setForm({ ...form, tur: 'ortak' })}
                                        className={`flex items-center gap-2 px-3 py-2.5 rounded-md border text-xs font-medium transition-colors ${form.tur === 'ortak' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-border bg-card text-muted-foreground hover:bg-muted/50'}`}>
                                        <Globe className="size-3.5" />
                                        <div className="text-left">
                                            <div>Ortak</div>
                                            <div className="text-[10px] font-normal opacity-70">Tüm şubeler</div>
                                        </div>
                                    </button>
                                    <button type="button" onClick={() => setForm({ ...form, tur: 'sube_ozel' })}
                                        className={`flex items-center gap-2 px-3 py-2.5 rounded-md border text-xs font-medium transition-colors ${form.tur === 'sube_ozel' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-border bg-card text-muted-foreground hover:bg-muted/50'}`}>
                                        <MapPin className="size-3.5" />
                                        <div className="text-left">
                                            <div>Şubeye Özel</div>
                                            <div className="text-[10px] font-normal opacity-70">Tek şube</div>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Renk */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Renk</Label>
                                <div className="flex flex-wrap gap-2">
                                    {colorPalette.map((c) => (
                                        <button key={c.bg} type="button" title={c.label} onClick={() => setForm({ ...form, renk: c.bg })}
                                            className="size-7 rounded-full transition-transform"
                                            style={{ background: c.bg, border: form.renk === c.bg ? `3px solid ${c.text}` : '2px solid transparent', transform: form.renk === c.bg ? 'scale(1.15)' : 'scale(1)' }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="px-5 py-3 border-t">
                            <Button type="button" variant="outline" size="sm" onClick={closeModal}>İptal</Button>
                            <Button type="submit" size="sm" disabled={saving}>{saving ? 'Kaydediliyor...' : editing ? 'Güncelle' : 'Oluştur'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Replace Category Modal */}
            <Dialog open={!!replaceState} onOpenChange={(open) => !open && setReplaceState(null)}>
                <DialogContent className="sm:max-w-sm p-0 gap-0 border">
                    <DialogHeader className="px-5 py-3 border-b">
                        <DialogTitle className="text-sm font-medium">Kategori Değiştir</DialogTitle>
                    </DialogHeader>
                    {replaceState && (
                        <div className="px-5 py-4 flex flex-col gap-4">
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 leading-relaxed">
                                ⚠️ <strong>"{replaceState.kat.ad}"</strong> kategorisinde <strong>{replaceState.urunSayisi}</strong> ürün var. Silmek için ürünleri başka bir kategoriye taşıyın.
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Taşınacak kategori</Label>
                                <select
                                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                    value={replaceState.yeniKategori}
                                    onChange={(e) => setReplaceState({ ...replaceState, yeniKategori: e.target.value })}
                                >
                                    <option value="">Kategori seçin...</option>
                                    {kategoriler.filter(k => k.id !== replaceState.kat.id).map(k => (
                                        <option key={k.id} value={k.id}>{k.ad}</option>
                                    ))}
                                </select>
                            </div>
                            <DialogFooter className="p-0 pt-1">
                                <Button type="button" variant="outline" size="sm" onClick={() => setReplaceState(null)}>İptal</Button>
                                <Button type="button" variant="destructive" size="sm" onClick={handleReplaceAndDelete}>Taşı ve Sil</Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
