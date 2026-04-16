import { useState, useEffect } from 'react';
import api from '../../../services/api';
import { Plus, Pencil, Trash2, X, ImagePlus, Check, Search, FolderPlus, Folder, ChevronRight, ArrowLeft, FolderInput } from 'lucide-react';
import SearchInput from '../../../shared/components/SearchInput';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { proxyImageUrl } from '../../../utils/imageProxy';

export default function PhotoLibraryPage() {
    const toast = useToast();
    const confirm = useConfirm();
    const [medyalar, setMedyalar] = useState([]);
    const [klasorler, setKlasorler] = useState([]);
    const [loading, setLoading] = useState(true);
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

    useEffect(() => {
        loadAll();
    }, []);

    async function loadAll() {
        setLoading(true);
        try {
            const [medyaRes, klasorRes] = await Promise.all([
                api.get('/media'),
                api.get('/media/klasorler'),
            ]);
            setMedyalar(medyaRes.data.medyalar);
            setKlasorler(klasorRes.data.klasorler);
        } catch (err) {
            console.error('Yükleme hatası:', err);
        }
        setLoading(false);
    }

    async function handleUpload(e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        setUploading(true);

        for (const file of files) {
            try {
                const formData = new FormData();
                formData.append('image', file);
                const { data: uploadData } = await api.post('/upload/image', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });

                const baseName = file.name.replace(/\.[^.]+$/, '');
                await api.post('/media', {
                    ad: baseName,
                    url: uploadData.url,
                    klasor: activeKlasor === null ? '' : activeKlasor,
                    boyut: uploadData.optimizedSize || 0,
                });
            } catch (err) {
                toast.error(`"${file.name}" yüklenemedi`);
            }
        }

        toast.success(`${files.length} görsel yüklendi`);
        await loadAll();
        setUploading(false);
        e.target.value = '';
    }

    async function handleRename(id) {
        if (!editName.trim()) return;
        try {
            await api.put(`/media/${id}`, { ad: editName.trim(), klasor: editKlasor });
            setEditingId(null);
            await loadAll();
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
            await loadAll();
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
            await loadAll();
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
            await loadAll();
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
            await loadAll();
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
            await Promise.all(ids.map(id => api.put(`/media/${id}`, { klasor: bulkMoveTarget })));
            await loadAll();
            clearSelection();
            toast.success(`${ids.length} görsel taşındı`);
        } catch { toast.error('Toplu taşıma başarısız'); }
    }

    async function handleBulkDelete() {
        const ids = [...selectedIds];
        const ok = await confirm(`${ids.length} görseli silmek istediğinize emin misiniz?`);
        if (!ok) return;
        try {
            await Promise.all(ids.map(id => api.delete(`/media/${id}`)));
            await loadAll();
            clearSelection();
            toast.success(`${ids.length} görsel silindi`);
        } catch { toast.error('Toplu silme başarısız'); }
    }

    // Filtreleme
    let filtered = medyalar;
    if (activeKlasor !== null) {
        filtered = medyalar.filter((m) => (m.klasor || '') === activeKlasor);
    }
    if (search) {
        filtered = filtered.filter((m) => m.ad.toLowerCase().includes(search.toLowerCase()));
    }

    // Klasör başına medya sayısı
    const genelCount = medyalar.filter((m) => !m.klasor).length;
    const SYSTEM_FOLDERS = ['Ürünler', 'Kategoriler'];
    const systemFolderCounts = {};
    SYSTEM_FOLDERS.forEach((name) => {
        systemFolderCounts[name] = medyalar.filter((m) => m.klasor === name).length;
    });
    const folderCounts = {};
    klasorler.forEach((k) => {
        folderCounts[k.ad] = medyalar.filter((m) => m.klasor === k.ad).length;
    });

    return (
        <div className="page-padding">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <p className="page-header__crumb">Medya</p>
                    <h1 className="page-header__title">Medya</h1>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn--secondary" onClick={() => setShowNewFolder(true)}>
                        <FolderPlus size={16} /> Klasör Ekle
                    </button>
                    <label className="btn btn--primary" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
                        {uploading ? (
                            <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Yükleniyor...</>
                        ) : (
                            <><Plus size={16} /> Medya Ekle</>
                        )}
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleUpload}
                            style={{ display: 'none' }}
                            disabled={uploading}
                        />
                    </label>
                </div>
            </div>

            {/* Klasör Oluştur */}
            {showNewFolder && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, maxWidth: 400 }}>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Klasör adı..."
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateFolder();
                            if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }
                        }}
                        autoFocus
                    />
                    <button className="btn btn--primary" onClick={handleCreateFolder} style={{ whiteSpace: 'nowrap' }}>
                        <Check size={14} /> Oluştur
                    </button>
                    <button className="btn btn--secondary" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}>
                        <X size={14} />
                    </button>
                </div>
            )}

            <div style={{ display: 'flex', gap: 20 }}>
                {/* Sol: Klasör Listesi */}
                <div className="folder-sidebar">
                    <button
                        className={`folder-item ${activeKlasor === null ? 'folder-item--active' : ''}`}
                        onClick={() => setActiveKlasor(null)}
                    >
                        <Folder size={16} />
                        <span>Tümü</span>
                        <span className="folder-item__count">{medyalar.length}</span>
                    </button>
                    <button
                        className={`folder-item ${activeKlasor === '' ? 'folder-item--active' : ''} ${dragOverFolder === '' ? 'folder-item--drag-over' : ''}`}
                        onClick={() => setActiveKlasor('')}
                        onDragOver={(e) => onFolderDragOver(e, '')}
                        onDragLeave={onFolderDragLeave}
                        onDrop={(e) => onFolderDrop(e, '')}
                    >
                        <Folder size={16} />
                        <span>Genel</span>
                        <span className="folder-item__count">{genelCount}</span>
                    </button>

                    {/* Sistem Klasörleri */}
                    <div style={{ margin: '6px 0', borderTop: '1px solid var(--color-border)' }} />
                    {SYSTEM_FOLDERS.map((name) => (
                        <button
                            key={name}
                            className={`folder-item ${activeKlasor === name ? 'folder-item--active' : ''} ${dragOverFolder === name ? 'folder-item--drag-over' : ''}`}
                            onClick={() => setActiveKlasor(name)}
                            onDragOver={(e) => onFolderDragOver(e, name)}
                            onDragLeave={onFolderDragLeave}
                            onDrop={(e) => onFolderDrop(e, name)}
                        >
                            <Folder size={16} />
                            <span>{name}</span>
                            <span className="folder-item__count">{systemFolderCounts[name]}</span>
                        </button>
                    ))}

                    {/* Özel Klasörler */}
                    {klasorler.length > 0 && (
                        <div style={{ margin: '6px 0', borderTop: '1px solid var(--color-border)' }} />
                    )}
                    {klasorler.map((k) => (
                        <div key={k.id}
                            className={`folder-item ${activeKlasor === k.ad ? 'folder-item--active' : ''} ${dragOverFolder === k.ad ? 'folder-item--drag-over' : ''}`}
                            onDragOver={(e) => onFolderDragOver(e, k.ad)}
                            onDragLeave={onFolderDragLeave}
                            onDrop={(e) => onFolderDrop(e, k.ad)}
                        >
                            <button
                                style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', fontSize: 'inherit', textAlign: 'left' }}
                                onClick={() => setActiveKlasor(k.ad)}
                            >
                                <Folder size={16} />
                                <span style={{ flex: 1 }}>{k.ad}</span>
                                <span className="folder-item__count">{folderCounts[k.ad] || 0}</span>
                            </button>
                            <button
                                className="folder-item__delete"
                                onClick={(e) => { e.stopPropagation(); handleDeleteFolder(k); }}
                                title="Klasörü sil"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Sağ: Görseller */}
                <div style={{ flex: 1 }}>
                    {/* Aktif klasör başlık + seçim + arama */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, height: 36, overflow: 'visible' }}>
                        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-secondary)', margin: 0, whiteSpace: 'nowrap' }}>
                            {activeKlasor === null ? 'Tüm Görseller' : activeKlasor === '' ? 'Genel' : activeKlasor}
                            <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 8 }}>({filtered.length})</span>
                        </h3>
                        {selectedIds.size > 0 && (
                            <div className="bulk-bar">
                                <span className="bulk-bar__badge">{selectedIds.size} seçili</span>
                                <div className="bulk-bar__divider" />
                                <select
                                    className="bulk-bar__select"
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
                                    <button className="bulk-bar__btn bulk-bar__btn--save" onClick={handleBulkMove}>
                                        <Check size={13} /> Kaydet
                                    </button>
                                )}
                                <button className="bulk-bar__btn bulk-bar__btn--delete" onClick={handleBulkDelete}>
                                    <Trash2 size={13} /> Sil
                                </button>
                                <div className="bulk-bar__divider" />
                                <button className="bulk-bar__btn bulk-bar__btn--close" onClick={clearSelection}>
                                    <X size={14} />
                                </button>
                            </div>
                        )}
                        <div style={{ marginLeft: 'auto' }}>
                            {medyalar.length > 0 && (
                                <SearchInput value={search} onChange={setSearch} placeholder="Ara..." />
                            )}
                        </div>
                    </div>


                    {loading ? (
                        <div className="loading-container"><div className="spinner" /><p className="loading-text">Yükleniyor...</p></div>
                    ) : filtered.length === 0 ? (
                        <div className="empty-state">
                            <div className="icon">📷</div>
                            <p>{search ? 'Sonuç bulunamadı' : 'Bu klasörde henüz fotoğraf yok'}</p>
                            <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>Yukarıdaki butona tıklayarak fotoğraf yükleyebilirsiniz</p>
                        </div>
                    ) : (
                        <div className="photo-grid">
                            {filtered.map((m) => (
                                <div key={m.id} className={`photo-card ${selectedIds.has(m.id) ? 'photo-card--selected' : ''}`}
                                    draggable
                                    onDragStart={(e) => onDragStart(e, m)}
                                    onDragEnd={onDragEnd}
                                    onClick={() => handleCardClick(m)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="photo-card__img-wrap">
                                        <img src={proxyImageUrl(m.url)} alt={m.ad} className="photo-card__img" draggable={false} />
                                        {m.boyut > 0 && (
                                            <span className="photo-card__size">
                                                {m.boyut >= 1024 * 1024 ? `${(m.boyut / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(m.boyut / 1024)} KB`}
                                            </span>
                                        )}
                                        <div className="photo-card__overlay">
                                            <button className="photo-card__action" onClick={(e) => { e.stopPropagation(); startEdit(m); }} title="Düzenle">
                                                <Pencil size={14} />
                                            </button>
                                            <button className="photo-card__action photo-card__action--danger" onClick={(e) => { e.stopPropagation(); handleDelete(m); }} title="Sil">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    {editingId === m.id ? (
                                        <div className="photo-card__edit" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRename(m.id);
                                                    if (e.key === 'Escape') cancelEdit();
                                                }}
                                                autoFocus
                                                style={{ fontSize: 13, padding: '6px 8px', height: 'auto' }}
                                                placeholder="Görsel adı"
                                            />
                                            <div style={{ marginTop: 6 }}>
                                                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Klasör</span>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                                    {[{ value: '', label: 'Genel' }, ...SYSTEM_FOLDERS.map(name => ({ value: name, label: name })), ...klasorler.map(k => ({ value: k.ad, label: k.ad }))].map(opt => (
                                                        <button
                                                            key={opt.value}
                                                            type="button"
                                                            onClick={() => setEditKlasor(opt.value)}
                                                            style={{
                                                                fontSize: 10, padding: '3px 8px', borderRadius: 12, cursor: 'pointer',
                                                                border: editKlasor === opt.value ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                                                                background: editKlasor === opt.value ? 'var(--color-primary-light, #e0e7ff)' : 'var(--color-card)',
                                                                color: editKlasor === opt.value ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                                                fontWeight: editKlasor === opt.value ? 600 : 400,
                                                                transition: 'all 0.15s',
                                                            }}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 4, marginTop: 8, justifyContent: 'flex-end' }}>
                                                <button className="icon-btn" onClick={cancelEdit} style={{ padding: 4 }} title="İptal"><X size={14} /></button>
                                                <button onClick={() => handleRename(m.id)} style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Check size={12} /> Kaydet
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="photo-card__name" title={m.ad}>{m.ad}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
