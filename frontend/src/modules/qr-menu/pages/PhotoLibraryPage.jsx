import { useState, useEffect } from 'react';
import api from '../../../services/api';
import { Plus, Pencil, Trash2, X, ImagePlus, Check, Search, FolderPlus, Folder, ChevronRight, ArrowLeft, FolderInput } from 'lucide-react';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { proxyImageUrl } from '../../../utils/imageProxy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Label } from '@/components/ui/label';

export default function PhotoLibraryPage() {
    const toast = useToast();
    const confirm = useConfirm();
    const [medyalar, setMedyalar] = useState([]);
    const [klasorler, setKlasorler] = useState([]);
    const [counts, setCounts] = useState({ genel: 0, total: 0, system: {} });
    const [cursor, setCursor] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [search, setSearch] = useState('');
    const [activeKlasor, setActiveKlasor] = useState(null); // null = Tüm, '' = Genel, string = klasör adı
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [editKlasor, setEditKlasor] = useState('');
    const [dragOverFolder, setDragOverFolder] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkMoveTarget, setBulkMoveTarget] = useState(null);

    async function loadKlasorler() {
        try {
            const { data } = await api.get('/media/klasorler');
            setKlasorler(data.klasorler);
            setCounts(data.counts || { genel: 0, total: 0, system: {} });
        } catch (err) { console.error('Klasör yükleme hatası:', err); }
    }

    // reset=true → ilk sayfa; reset=false → cursor ile sonraki sayfa (ekle).
    // Arama aktifse sunucu tarafı substring araması (klasör/sayfa yok sayılır).
    async function loadMedia(reset) {
        if (reset) setLoading(true); else setLoadingMore(true);
        try {
            const params = { limit: 60 };
            if (search && search.trim()) {
                params.q = search.trim();
            } else {
                if (activeKlasor === '') params.genel = 1;
                else if (activeKlasor) params.klasor = activeKlasor;
                if (!reset && cursor) params.cursor = cursor;
            }
            const { data } = await api.get('/media', { params });
            setMedyalar((prev) => (reset ? data.medyalar : [...prev, ...data.medyalar]));
            setCursor(data.nextCursor);
        } catch (err) { console.error('Medya yükleme hatası:', err); }
        if (reset) setLoading(false); else setLoadingMore(false);
    }

    // Mutasyon sonrası: sayaçları + aktif klasörün ilk sayfasını tazele
    async function refresh() {
        await Promise.all([loadKlasorler(), loadMedia(true)]);
    }

    // Klasör sayaçlarını (server-side count) bir kez yükle
    useEffect(() => { loadKlasorler(); }, []);
    // Mevcut görseller için arama token'larını bir kez doldur
    useEffect(() => {
        if (localStorage.getItem('mediaSearchTokensBackfilled')) return;
        api.post('/media/backfill-search')
            .then(() => localStorage.setItem('mediaSearchTokensBackfilled', '1'))
            .catch(() => {});
    }, []);
    // Klasör veya arama değişince ilk sayfayı yükle (arama debounce'lu)
    useEffect(() => {
        const t = setTimeout(() => loadMedia(true), 200);
        return () => clearTimeout(t);
    }, [activeKlasor, search]); // eslint-disable-line react-hooks/exhaustive-deps

    async function handleUpload(e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        setUploading(true);

        let basarili = 0;
        let kotaDoldu = 0; // 0 = dolmadı, >0 = kaç saniye beklenmeli
        for (const file of files) {
            let uploadedUrl = null;
            try {
                const formData = new FormData();
                formData.append('image', file);
                const { data: uploadData } = await api.post('/upload/image', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                uploadedUrl = uploadData.url;

                const baseName = file.name.replace(/\.[^.]+$/, '');
                await api.post('/media', {
                    ad: baseName,
                    url: uploadData.url,
                    klasor: activeKlasor === null ? '' : activeKlasor,
                    boyut: uploadData.optimizedSize || 0,
                });
                basarili++;
            } catch (err) {
                // Kayıt başarısızsa R2'ye yüklenen dosyayı geri sil (yetim dosya kalmasın)
                if (uploadedUrl) {
                    api.delete('/upload/image', { data: { url: uploadedUrl } }).catch(() => {});
                }
                // İstek kotası dolduysa kalan dosyaları denemek işe yaramaz: her
                // deneme kotayı biraz daha yakar ve dosya başına bir hata bildirimi
                // çıkarır. Döngüyü kes, tek ve anlaşılır bir uyarı ver.
                if (err.response?.status === 429) {
                    kotaDoldu = Number(err.response.headers?.['retry-after']) || 60;
                    break;
                }
                toast.error(`"${file.name}" yüklenemedi`);
            }
        }

        if (basarili > 0) toast.success(`${basarili} görsel yüklendi`);
        if (kotaDoldu) {
            const dk = Math.max(1, Math.ceil(kotaDoldu / 60));
            toast.error(`İstek sınırına takıldınız — ${dk} dakika sonra kalan görselleri yükleyebilirsiniz.`);
        }
        await refresh();
        setUploading(false);
        e.target.value = '';
    }

    async function handleRename(id) {
        if (!editName.trim()) return;
        try {
            await api.put(`/media/${id}`, { ad: editName.trim(), klasor: editKlasor });
            setEditingId(null);
            await refresh();
            toast.success('Güncellendi');
        } catch (err) {
            toast.error('Güncelleme başarısız');
        }
    }

    async function handleDelete(m) {
        const ok = await confirm(`"${m.ad}" görselini silmek istediğinize emin misiniz?`);
        if (!ok) return;
        try {
            await api.delete(`/media/${m.id}`);
            await refresh();
            toast.success('Görsel silindi');
        } catch (err) {
            toast.error('Silme başarısız');
        }
    }

    async function handleCreateFolder() {
        if (!newFolderName.trim()) return;
        try {
            await api.post('/media/klasorler', { ad: newFolderName.trim() });
            setNewFolderName('');
            setShowNewFolder(false);
            await refresh();
            toast.success('Klasör oluşturuldu');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Klasör oluşturulamadı');
        }
    }

    async function handleDeleteFolder(k) {
        const ok = await confirm(`"${k.ad}" klasörünü silmek istediğinize emin misiniz? İçindeki görseller Genel'e taşınacak.`);
        if (!ok) return;
        try {
            await api.delete(`/media/klasorler/${k.id}`);
            if (activeKlasor === k.ad) setActiveKlasor(null);
            await refresh();
            toast.success('Klasör silindi');
        } catch (err) {
            toast.error('Klasör silinemedi');
        }
    }

    function startEdit(m) {
        setEditingId(m.id);
        setEditName(m.ad);
        setEditKlasor(m.klasor || '');
    }

    function cancelEdit() {
        setEditingId(null);
        setEditName('');
        setEditKlasor('');
    }

    async function handleMoveFolder(m, newKlasor) {
        try {
            await api.put(`/media/${m.id}`, { klasor: newKlasor });
            await refresh();
            toast.success(`"${m.ad}" taşındı`);
        } catch (err) {
            toast.error('Taşıma başarısız');
        }
    }

    // Drag & Drop handlers
    const dragFlagRef = { current: false };

    function onDragStart(e, m) {
        dragFlagRef.current = true;
        e.dataTransfer.setData('mediaId', m.id);
        e.dataTransfer.effectAllowed = 'move';
    }

    function onDragEnd() {
        setTimeout(() => { dragFlagRef.current = false; }, 0);
    }

    function handleCardClick(m) {
        if (dragFlagRef.current) return;
        toggleSelect(m.id);
    }

    function onFolderDragOver(e, folderName) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverFolder(folderName);
    }

    function onFolderDragLeave() {
        setDragOverFolder(null);
    }

    function onFolderDrop(e, folderName) {
        e.preventDefault();
        setDragOverFolder(null);
        const mediaId = e.dataTransfer.getData('mediaId');
        const m = medyalar.find((x) => x.id === mediaId);
        if (m && (m.klasor || '') !== folderName) {
            handleMoveFolder(m, folderName);
        }
    }

    // Selection helpers
    function toggleSelect(id) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }
    function clearSelection() { setSelectedIds(new Set()); setBulkMoveTarget(null); }

    async function handleBulkMove() {
        if (bulkMoveTarget === null) return;
        const ids = [...selectedIds];
        try {
            await api.put('/media/bulk-move', { ids, klasor: bulkMoveTarget });
            await refresh();
            clearSelection();
            toast.success(`${ids.length} görsel taşındı`);
        } catch { toast.error('Toplu taşıma başarısız'); }
    }

    async function handleBulkDelete() {
        const ids = [...selectedIds];
        const ok = await confirm(`${ids.length} görseli silmek istediğinize emin misiniz?`);
        if (!ok) return;
        try {
            await api.post('/media/bulk-delete', { ids });
            await refresh();
            clearSelection();
            toast.success(`${ids.length} görsel silindi`);
        } catch { toast.error('Toplu silme başarısız'); }
    }

    // Klasör kapsaması ve arama artık server'da yapılıyor → doğrudan göster
    const filtered = medyalar;

    // Klasör sayaçları server'dan (count aggregation) — tüm medyayı yüklemeden
    const genelCount = counts.genel || 0;
    const SYSTEM_FOLDERS = ['Ürünler', 'Kategoriler'];
    const systemFolderCounts = counts.system || {};
    const folderCounts = {};
    klasorler.forEach((k) => { folderCounts[k.ad] = k.count || 0; });

    const FolderButton = ({ name, count, active, isDragOver, onClick, onDragOver: dOver, onDragLeave: dLeave, onDrop: dDrop, children }) => (
        <button
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${active ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'} ${isDragOver ? 'ring-2 ring-primary ring-offset-1' : ''}`}
            onClick={onClick}
            onDragOver={dOver}
            onDragLeave={dLeave}
            onDrop={dDrop}
        >
            <Folder className="size-4 shrink-0" />
            <span className="flex-1 truncate">{name}</span>
            <span className="text-xs text-muted-foreground">{count}</span>
            {children}
        </button>
    );

    const editingMedia = editingId ? medyalar.find(m => m.id === editingId) : null;

    // ---------- DETAIL / EDIT VIEW ----------
    if (editingMedia) {
        return (
            <div className="flex flex-1 flex-col gap-4 w-full h-full min-h-0">
                {/* Header */}
                <div className="flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={cancelEdit}>
                            <ArrowLeft className="size-4" />
                        </Button>
                        <div>
                            <p className="text-xs text-muted-foreground">Medya Kütüphanesi</p>
                            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">Görseli Düzenle</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={cancelEdit}>İptal</Button>
                        <Button onClick={() => handleRename(editingId)}>Kaydet</Button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto pb-10 min-h-0">
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6">
                                {/* Image Preview */}
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground font-medium">Önizleme</Label>
                                    <div className="relative group/img">
                                        <img
                                            src={proxyImageUrl(editingMedia.url)}
                                            alt={editName}
                                            className="w-full aspect-square rounded-xl object-cover ring-1 ring-border bg-muted/20"
                                        />
                                    </div>
                                    {editingMedia.boyut > 0 && (
                                        <p className="text-xs text-muted-foreground text-center">
                                            Boyut: {editingMedia.boyut >= 1024 * 1024
                                                ? `${(editingMedia.boyut / (1024 * 1024)).toFixed(1)} MB`
                                                : `${Math.round(editingMedia.boyut / 1024)} KB`}
                                        </p>
                                    )}
                                </div>

                                {/* Form */}
                                <div className="space-y-5">
                                    <div className="grid gap-2">
                                        <Label htmlFor="editMediaName">Görsel Adı</Label>
                                        <Input
                                            id="editMediaName"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            placeholder="Görsel adı"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleRename(editingId);
                                            }}
                                            autoFocus
                                        />
                                        <p className="text-xs text-muted-foreground">Görselin tanımlayıcı adını buraya yazabilirsiniz.</p>
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="editMediaFolder">Klasör</Label>
                                        <select
                                            id="editMediaFolder"
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            value={editKlasor}
                                            onChange={(e) => setEditKlasor(e.target.value)}
                                        >
                                            <option value="">Genel (Klasörsüz)</option>
                                            {SYSTEM_FOLDERS.map(name => (
                                                <option key={name} value={name}>{name}</option>
                                            ))}
                                            {klasorler.map(k => (
                                                <option key={k.id} value={k.ad}>{k.ad}</option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-muted-foreground">Görselin hangi klasörde yer alacağını seçin.</p>
                                    </div>

                                    <div className="border-t pt-4">
                                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Bilgiler</h4>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">Mevcut Klasör</span>
                                                <Badge variant="secondary">{editingMedia.klasor || 'Genel'}</Badge>
                                            </div>
                                            {editingMedia.boyut > 0 && (
                                                <div className="flex items-center justify-between">
                                                    <span className="text-muted-foreground">Dosya Boyutu</span>
                                                    <span className="font-medium">
                                                        {editingMedia.boyut >= 1024 * 1024
                                                            ? `${(editingMedia.boyut / (1024 * 1024)).toFixed(1)} MB`
                                                            : `${Math.round(editingMedia.boyut / 1024)} KB`}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="border-t pt-4">
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            className="w-full sm:w-auto"
                                            onClick={() => {
                                                handleDelete(editingMedia);
                                                cancelEdit();
                                            }}
                                        >
                                            <Trash2 className="size-3.5 mr-1.5" /> Görseli Sil
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ---------- LIST VIEW ----------
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl leading-none tracking-tight">Medya</h1>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowNewFolder(true)}>
                        <FolderPlus className="size-4" /> Klasör Ekle
                    </Button>
                    <Button asChild className={uploading ? 'pointer-events-none opacity-70' : ''}>
                        <label className="cursor-pointer">
                            {uploading ? (
                                <><Spinner className="size-4" /> Yükleniyor...</>
                            ) : (
                                <><Plus className="size-4" /> Medya Ekle</>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={handleUpload}
                                className="hidden"
                                disabled={uploading}
                            />
                        </label>
                    </Button>
                </div>
            </div>

            {/* Klasör Oluştur */}
            {showNewFolder && (
                <div className="flex max-w-md gap-2">
                    <Input
                        type="text"
                        placeholder="Klasör adı..."
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateFolder();
                            if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }
                        }}
                        autoFocus
                    />
                    <Button onClick={handleCreateFolder} className="shrink-0">
                        <Check className="size-3.5" /> Oluştur
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}>
                        <X className="size-3.5" />
                    </Button>
                </div>
            )}

            <div className="flex gap-5">
                {/* Sol: Klasör Listesi */}
                <div className="w-48 shrink-0 space-y-0.5">
                    <FolderButton name="Tümü" count={counts.total || 0} active={activeKlasor === null} onClick={() => setActiveKlasor(null)} />
                    <FolderButton name="Genel" count={genelCount} active={activeKlasor === ''} isDragOver={dragOverFolder === ''} onClick={() => setActiveKlasor('')}
                        onDragOver={(e) => onFolderDragOver(e, '')} onDragLeave={onFolderDragLeave} onDrop={(e) => onFolderDrop(e, '')} />

                    <div className="my-1.5 border-t" />
                    {SYSTEM_FOLDERS.map((name) => (
                        <FolderButton key={name} name={name} count={systemFolderCounts[name]} active={activeKlasor === name} isDragOver={dragOverFolder === name}
                            onClick={() => setActiveKlasor(name)} onDragOver={(e) => onFolderDragOver(e, name)} onDragLeave={onFolderDragLeave} onDrop={(e) => onFolderDrop(e, name)} />
                    ))}

                    {klasorler.length > 0 && <div className="my-1.5 border-t" />}
                    {klasorler.map((k) => (
                        <div key={k.id} className="group relative"
                            onDragOver={(e) => onFolderDragOver(e, k.ad)} onDragLeave={onFolderDragLeave} onDrop={(e) => onFolderDrop(e, k.ad)}>
                            <FolderButton name={k.ad} count={folderCounts[k.ad] || 0} active={activeKlasor === k.ad} isDragOver={dragOverFolder === k.ad}
                                onClick={() => setActiveKlasor(k.ad)} />
                            <button
                                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                                onClick={(e) => { e.stopPropagation(); handleDeleteFolder(k); }}
                                title="Klasörü sil"
                            >
                                <Trash2 className="size-3" />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Sağ: Görseller */}
                <div className="flex-1">
                    {/* Aktif klasör başlık + seçim + arama */}
                    <div className="mb-4 flex items-center gap-3 min-h-[40px]">
                        <h3 className="whitespace-nowrap text-sm font-semibold text-muted-foreground">
                            {activeKlasor === null ? 'Tüm Görseller' : activeKlasor === '' ? 'Genel' : activeKlasor}
                            <span className="ml-2 font-normal">({filtered.length})</span>
                        </h3>
                        <div className="h-[36px] flex items-center">
                            {selectedIds.size > 0 && (
                                <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5">
                                    <Badge variant="secondary" className="text-xs">{selectedIds.size} seçili</Badge>
                                    <div className="h-4 w-px bg-border" />
                                    <select
                                        className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                                        value={bulkMoveTarget ?? ''}
                                        onChange={(e) => setBulkMoveTarget(e.target.value)}
                                    >
                                        <option value="" disabled>Klasöre Taşı...</option>
                                        <option value="">Genel</option>
                                        {['Ürünler', 'Kategoriler'].map(name => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                        {klasorler.map((k) => (
                                            <option key={k.id} value={k.ad}>{k.ad}</option>
                                        ))}
                                    </select>
                                    {bulkMoveTarget !== null && (
                                        <Button size="sm" className="h-6 text-xs" onClick={handleBulkMove}>
                                            <Check className="size-3" /> Kaydet
                                        </Button>
                                    )}
                                    <Button variant="destructive" size="sm" className="h-6 text-xs" onClick={handleBulkDelete}>
                                        <Trash2 className="size-3" /> Sil
                                    </Button>
                                    <div className="h-4 w-px bg-border" />
                                    <Button variant="ghost" size="icon" className="size-6" onClick={clearSelection}>
                                        <X className="size-3.5" />
                                    </Button>
                                </div>
                            )}
                        </div>
                        <div className="ml-auto">
                            {medyalar.length > 0 && (
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ara..." className="h-8 w-48 pl-8 text-xs" />
                                </div>
                            )}
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16"><Spinner className="size-8" /><p className="text-sm text-muted-foreground">Yükleniyor...</p></div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                            <span className="text-4xl">📷</span>
                            <p>{search ? 'Sonuç bulunamadı' : 'Bu klasörde henüz fotoğraf yok'}</p>
                            <p className="text-xs">Yukarıdaki butona tıklayarak fotoğraf yükleyebilirsiniz</p>
                        </div>
                    ) : (
                        <>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
                            {filtered.map((m) => (
                                <div key={m.id} className={`group relative cursor-pointer overflow-hidden rounded-lg border transition-all ${selectedIds.has(m.id) ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                                    draggable
                                    onDragStart={(e) => onDragStart(e, m)}
                                    onDragEnd={onDragEnd}
                                    onClick={() => handleCardClick(m)}
                                >
                                    <div className="relative aspect-square">
                                        <img src={proxyImageUrl(m.url)} alt={m.ad} className="size-full object-cover" draggable={false} />
                                        {m.boyut > 0 && (
                                            <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                                {m.boyut >= 1024 * 1024 ? `${(m.boyut / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(m.boyut / 1024)} KB`}
                                            </span>
                                        )}
                                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                                            <button className="rounded-full bg-white/90 p-1.5 text-foreground transition-colors hover:bg-white" onClick={(e) => { e.stopPropagation(); startEdit(m); }} title="Düzenle">
                                                <Pencil className="size-3.5" />
                                            </button>
                                            <button className="rounded-full bg-white/90 p-1.5 text-destructive transition-colors hover:bg-white" onClick={(e) => { e.stopPropagation(); handleDelete(m); }} title="Sil">
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                    <p className="truncate px-2 py-1.5 text-xs font-medium" title={m.ad}>{m.ad}</p>
                                </div>
                            ))}
                        </div>
                        {cursor && (
                            <div className="flex justify-center pt-4">
                                <Button variant="outline" onClick={() => loadMedia(false)} disabled={loadingMore}>
                                    {loadingMore ? 'Yükleniyor...' : 'Daha fazla yükle'}
                                </Button>
                            </div>
                        )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
