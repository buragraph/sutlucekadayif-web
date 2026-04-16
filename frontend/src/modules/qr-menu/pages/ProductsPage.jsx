import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../services/api';
import { Plus, Pencil, Trash2, X, Search, ArrowUp, ArrowDown, ArrowUpDown, RotateCcw, Trash, ImagePlus, Images, Sparkles } from 'lucide-react';
import SearchInput from '../../../shared/components/SearchInput';
import { proxyImageUrl } from '../../../utils/imageProxy';
import { useToast, useConfirm } from '../../../shared/components/Toast';

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
    const [selectedSube, setSelectedSube] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortCol, setSortCol] = useState(null);
    const [sortDir, setSortDir] = useState('asc');

    const [urunler, setUrunler] = useState([]);
    const [loadingUrunler, setLoadingUrunler] = useState(true);
    const [showUrunModal, setShowUrunModal] = useState(false);
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

    const [quickEdit, setQuickEdit] = useState(null);
    const [quickForm, setQuickForm] = useState({ ad: '', fiyat: '', kategori: '', sube_slug: '' });
    const [subeError, setSubeError] = useState(false);

    const [showTrash, setShowTrash] = useState(false);
    const [trashUrunler, setTrashUrunler] = useState([]);

    const [kategoriler, setKategoriler] = useState([]);
    const [subeler, setSubeler] = useState([]);

    const categoryColors = [
        { bg: '#dbeafe', text: '#1e40af' },
        { bg: '#fce7f3', text: '#9d174d' },
        { bg: '#d1fae5', text: '#065f46' },
        { bg: '#fef3c7', text: '#92400e' },
        { bg: '#ede9fe', text: '#5b21b6' },
        { bg: '#fee2e2', text: '#991b1b' },
        { bg: '#e0e7ff', text: '#3730a3' },
        { bg: '#ccfbf1', text: '#115e59' },
        { bg: '#fff7ed', text: '#9a3412' },
        { bg: '#f0fdf4', text: '#166534' },
    ];

    function getCatColor(catId) {
        const kat = kategoriler.find(k => k.id === catId);
        if (kat?.renk) {
            const match = categoryColors.find(c => c.bg === kat.renk);
            if (match) return match;
            return { bg: kat.renk, text: '#333' };
        }
        if (!catId) return categoryColors[0];
        let hash = 0;
        for (let i = 0; i < catId.length; i++) hash = catId.charCodeAt(i) + ((hash << 5) - hash);
        return categoryColors[Math.abs(hash) % categoryColors.length];
    }

    useEffect(() => { loadKategoriler(); }, []);
    useEffect(() => { if (role === 'admin' || subeSlug) loadUrunler(); }, [subeSlug, role]);
    useEffect(() => { if (role === 'admin') loadSubeler(); }, [role]);

    async function loadUrunler(silent = false) {
        if (!silent) setLoadingUrunler(true);
        try { const { data } = await api.get('/products'); setUrunler(data.urunler); }
        catch (err) { console.error('Ürünler yüklenemedi:', err); }
        if (!silent) setLoadingUrunler(false);
    }

    async function loadKategoriler() {
        try { const { data } = await api.get('/categories'); setKategoriler(data.kategoriler); }
        catch (err) { console.error('Kategoriler yüklenemedi:', err); }
    }

    async function loadSubeler() {
        try { const { data } = await api.get('/menu/subeler'); setSubeler(data.subeler || []); }
        catch (err) { console.error('Şubeler yüklenemedi:', err); }
    }

    function openAddUrun() {
        setEditingUrun(null);
        setUrunForm({ ad: '', fiyat: '', kategori: kategoriler[0]?.id || '', aciklama: '', sube_slug: subeSlug || '', gorsel: '', etiket: [], miktar: '', birim: 'gr' });
        setImageFile(null); setImagePreview(null);
        setShowUrunModal(true);
    }
    function openEditUrun(urun) {
        setEditingUrun(urun);
        setUrunForm({ ad: urun.ad, fiyat: urun.fiyat, kategori: urun.kategori || '', aciklama: urun.aciklama || '', sube_slug: urun.sube_slug || '', gorsel: urun.gorsel || '', etiket: urun.etiket || [], miktar: urun.miktar || '', birim: urun.birim || 'gr' });
        setImageFile(null); setImagePreview(urun.gorsel || null);
        setShowUrunModal(true);
    }
    function closeUrunModal() { setShowUrunModal(false); setEditingUrun(null); setImageFile(null); setImagePreview(null); }

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
            // Görsel yükle
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
                // Optimistic: backend'den dönen güncel veriyle güncelle
                setUrunler(prev => prev.map(u => u.id === editingUrun.id ? data.urun : u));
            } else {
                const { data } = await api.post('/products', payload);
                setUrunler(prev => [...prev, { id: data.id, ...data }]);
            }
            closeUrunModal();
            toast.success(editingUrun ? 'Ürün güncellendi' : 'Ürün eklendi');
        } catch (err) { toast.error(err.response?.data?.error || 'Bir hata oluştu'); }
        setSavingUrun(false);
    }

    async function handleUrunDelete(urun) {
        const ok = await confirm(`"${urun.ad}" ürünü silmek istediğinize emin misiniz?`);
        if (!ok) return;
        try {
            await api.delete(`/products/${urun.id}`);
            // Optimistic: listeden kaldır
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
        if (selectedSube !== 'all') {
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
        if (sortCol !== col) return <ArrowUpDown size={12} style={{ marginLeft: 4, opacity: 0.25 }} />;
        return sortDir === 'asc' ? <ArrowUp size={12} style={{ marginLeft: 4, opacity: 0.7 }} /> : <ArrowDown size={12} style={{ marginLeft: 4, opacity: 0.7 }} />;
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

    return (
        <div className="page-padding">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111', margin: 0 }}>Ürünler</h1>
                <button className="btn btn--primary" onClick={openAddUrun} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', fontSize: 12 }}>
                    <Plus size={14} /> Yeni Ürün Ekle
                </button>
                <div style={{ flex: 1 }} />
                <button className="btn btn--secondary" onClick={async () => {
                    try { const { data } = await api.get('/products/trash'); setTrashUrunler(data.urunler); setShowTrash(true); }
                    catch (err) { toast.error('Çöp kutusu yüklenemedi'); }
                }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', fontSize: 12 }}>
                    <Trash size={14} /> Silinenler
                </button>
            </div>

            {role !== 'admin' && !subeSlug && <div className="form-error">Şube bilginiz tanımlanmamış. Yönetici ile iletişime geçin.</div>}

            {loadingUrunler ? (
                <div className="loading-container"><div className="spinner" /><p className="loading-text">Ürünler yükleniyor...</p></div>
            ) : urunler.length === 0 ? (
                <div className="empty-state"><div className="icon">📋</div><p>Henüz ürün eklenmemiş</p></div>
            ) : (
                <div>
                    <div className="admin-filters">
                        <div className="admin-filters__top">
                            <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Ürün ara..." />
                            {role === 'admin' && subeler.length > 0 && (
                                <select className="admin-select" value={selectedSube} onChange={(e) => setSelectedSube(e.target.value)}>
                                    <option value="all">Tüm Şubeler</option>
                                    <option value="ortak">Ortak Ürünler</option>
                                    {subeler.map((s) => <option key={s.id} value={s.slug}>{s.ad}</option>)}
                                </select>
                            )}
                            <span className="admin-count">{sortedUrunler.length} ürün</span>
                        </div>
                        <div className="admin-tabs">
                            <button className={`admin-tab ${selectedKategori === 'all' ? 'admin-tab--active' : ''}`} onClick={() => setSelectedKategori('all')}>Tümü</button>
                            {kategoriler.map((k) => (
                                <button key={k.id} className={`admin-tab ${selectedKategori === k.id ? 'admin-tab--active' : ''}`} onClick={() => setSelectedKategori(k.id)}>{k.ad}</button>
                            ))}
                        </div>
                    </div>
                    <div className="users-table-wrapper" style={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto', overflowX: 'auto' }}>
                        <table className="users-table" style={{ minWidth: 700 }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 48 }}></th>
                                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('ad')}>Ürün <SortIcon col="ad" /></th>
                                    <th className="col-fiyat" style={{ textAlign: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('fiyat')}>Fiyat <SortIcon col="fiyat" /></th>
                                    <th className="col-kategori" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('kategori')}>Kategori <SortIcon col="kategori" /></th>
                                    {role === 'admin' && <th className="col-sube">Şube</th>}
                                    {role !== 'admin' && subeSlug && <th style={{ textAlign: 'center' }}>Durum</th>}
                                    <th className="col-tarih" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('tarih')}>Tarih <SortIcon col="tarih" /></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedUrunler.map((urun) => {
                                    const mevcutDegil = urun.mevcut_degil || [];
                                    const buSubedeMevcut = !mevcutDegil.includes(subeSlug);
                                    return (() => {
                                        const isKilitli = role !== 'admin' && (kategoriler.find(k => k.id === urun.kategori)?.kilitli || urun.tur !== 'sube_ozel');
                                        return (
                                            <tr key={urun.id} className={`wp-row ${quickEdit === urun.id ? 'wp-row--editing' : ''}`}>
                                                <td>
                                                    {urun.gorsel
                                                        ? <img src={proxyImageUrl(urun.gorsel)} alt={urun.ad} style={{ width: 60, height: 60, borderRadius: 10, objectFit: 'cover' }} />
                                                        : <span style={{ fontSize: 28 }}>🍮</span>}
                                                </td>
                                                <td>
                                                    {quickEdit === urun.id && !isKilitli ? (
                                                        <div className="quick-edit-field">
                                                            <input type="text" className="form-input" value={quickForm.ad} onChange={(e) => setQuickForm({ ...quickForm, ad: e.target.value })} style={{ fontSize: 14, fontWeight: 600 }} autoFocus />
                                                            <div className="wp-row-actions" style={{ marginTop: 6 }}>
                                                                <button className="wp-action" onClick={async () => {
                                                                    const selectedKat = kategoriler.find(k => k.id === quickForm.kategori);
                                                                    if (selectedKat && selectedKat.tur === 'sube_ozel' && !quickForm.sube_slug) {
                                                                        toast.warning('Şubeye özel kategori için şube seçmelisiniz');
                                                                        setSubeError(true);
                                                                        return;
                                                                    }
                                                                    try {
                                                                        const payload = { ad: quickForm.ad, fiyat: Number(quickForm.fiyat), kategori: quickForm.kategori };
                                                                        if (selectedKat && selectedKat.tur === 'sube_ozel') {
                                                                            payload.sube_slug = quickForm.sube_slug;
                                                                        }
                                                                        const { data } = await api.put(`/products/${urun.id}`, payload);
                                                                        // Optimistic: backend'den dönen güncel veriyle güncelle
                                                                        setUrunler(prev => prev.map(u => u.id === urun.id ? data.urun : u));
                                                                        setQuickEdit(null);
                                                                    } catch (err) { toast.error('Kaydetme başarısız'); }
                                                                }}>Kaydet</button>
                                                                <button className="wp-action" onClick={() => { setQuickEdit(null); setSubeError(false); }}>İptal</button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <span style={{ fontWeight: 700, fontSize: 15 }}>{urun.ad}</span>
                                                            {urun.etiket?.length > 0 && (
                                                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                                                                    {urun.etiket.map(key => { const tag = ETIKETLER.find(t => t.key === key); return tag ? <span key={key} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: tag.color + '18', color: tag.color, fontWeight: 600 }}>{tag.emoji} {tag.label}</span> : null; })}
                                                                </div>
                                                            )}
                                                            <div className="wp-row-actions">
                                                                {!isKilitli && <button className="wp-action" onClick={() => openEditUrun(urun)}>Düzenle</button>}
                                                                {!isKilitli && <button className="wp-action" onClick={() => { setQuickEdit(urun.id); setQuickForm({ ad: urun.ad, fiyat: urun.fiyat, kategori: urun.kategori || '', sube_slug: urun.sube_slug || '' }); }}>Hızlı Düzenle</button>}
                                                                {role !== 'admin' && subeSlug && (
                                                                    <button
                                                                        className={`wp-action ${!buSubedeMevcut ? 'wp-action--warning' : ''}`}
                                                                        onClick={async () => {
                                                                            try {
                                                                                await api.put(`/products/${urun.id}/availability`, { subeSlug, mevcut: !buSubedeMevcut });
                                                                                setUrunler(prev => prev.map(u => u.id === urun.id ? {
                                                                                    ...u,
                                                                                    mevcut_degil: buSubedeMevcut
                                                                                        ? [...(u.mevcut_degil || []), subeSlug]
                                                                                        : (u.mevcut_degil || []).filter(s => s !== subeSlug)
                                                                                } : u));
                                                                            } catch (err) { toast.error('Güncelleme başarısız'); }
                                                                        }}
                                                                    >
                                                                        {buSubedeMevcut ? 'Mevcut Değil Yap' : 'Mevcut Yap'}
                                                                    </button>
                                                                )}
                                                                {!isKilitli && <button className="wp-action wp-action--danger" onClick={() => handleUrunDelete(urun)}>Sil</button>}
                                                            </div>
                                                        </>
                                                    )}
                                                </td>
                                                <td className="col-fiyat" style={{ textAlign: 'center' }}>
                                                    {quickEdit === urun.id ? (
                                                        <input type="number" className="form-input" value={quickForm.fiyat} onChange={(e) => setQuickForm({ ...quickForm, fiyat: e.target.value })} style={{ width: 80, fontSize: 13 }} min="0" step="0.01" />
                                                    ) : (
                                                        <span style={{ fontWeight: 700, fontSize: 16, color: '#111', letterSpacing: '-0.5px', background: '#f1f3f5', padding: '5px 14px', borderRadius: 8 }}>
                                                            {Math.round(urun.fiyat)} ₺
                                                            {urun.miktar && <span style={{ fontSize: 11, fontWeight: 400, color: '#888', marginLeft: 4 }}>/ {urun.miktar}{urun.birim}</span>}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="col-kategori">
                                                    {quickEdit === urun.id ? (
                                                        <select className="form-input" value={quickForm.kategori} onChange={(e) => {
                                                            const newKatId = e.target.value;
                                                            const newKat = kategoriler.find(k => k.id === newKatId);
                                                            const update = { ...quickForm, kategori: newKatId };
                                                            if (!newKat || newKat.tur !== 'sube_ozel') {
                                                                update.sube_slug = '';
                                                            }
                                                            setQuickForm(update);
                                                            setSubeError(false);
                                                        }} style={{ fontSize: 13 }}>
                                                            <option value="">Seçiniz</option>
                                                            {kategoriler.map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}
                                                        </select>
                                                    ) : (
                                                        <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: getCatColor(urun.kategori).bg, color: getCatColor(urun.kategori).text }}>{katMap[urun.kategori] || '—'}</span>
                                                    )}
                                                </td>
                                                {role === 'admin' && (
                                                    <td className="col-sube">
                                                        {quickEdit === urun.id ? (() => {
                                                            const selectedKat = kategoriler.find(k => k.id === quickForm.kategori);
                                                            if (selectedKat && selectedKat.tur === 'sube_ozel') {
                                                                return (
                                                                    <select className="form-input" value={quickForm.sube_slug} onChange={(e) => { setQuickForm({ ...quickForm, sube_slug: e.target.value }); setSubeError(false); }} style={{ fontSize: 13, borderColor: subeError ? '#ef4444' : undefined, boxShadow: subeError ? '0 0 0 2px rgba(239,68,68,0.2)' : undefined }}>
                                                                        <option value="">Şube seçin...</option>
                                                                        {subeler.map((s) => <option key={s.id} value={s.slug}>{s.ad}</option>)}
                                                                    </select>
                                                                );
                                                            }
                                                            return <span className="text-muted">Ortak</span>;
                                                        })() : (
                                                            urun.tur === 'sube_ozel' && urun.sube_slug
                                                                ? <span style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed', background: '#ede9fe', padding: '4px 12px', borderRadius: 20 }}>{urun.sube_slug}</span>
                                                                : <span className="text-muted">Ortak</span>
                                                        )}
                                                    </td>
                                                )}
                                                {role !== 'admin' && subeSlug && (
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span style={{
                                                            fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20, whiteSpace: 'nowrap',
                                                            background: buSubedeMevcut ? '#dcfce7' : '#fee2e2',
                                                            color: buSubedeMevcut ? '#16a34a' : '#dc2626',
                                                        }}>
                                                            {buSubedeMevcut ? '✓ Mevcut' : '✗ Mevcut Değil'}
                                                        </span>
                                                    </td>
                                                )}
                                                <td className="col-tarih text-muted" style={{ fontSize: 12 }}>
                                                    {urun.createdAt ? new Date(urun.createdAt).toLocaleDateString('tr-TR') : '—'}
                                                </td>
                                            </tr>
                                        );
                                    })()
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showUrunModal && (
                <div className="modal-overlay" onClick={closeUrunModal}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingUrun ? 'Ürün Düzenle' : 'Yeni Ürün'}</h2>
                            <button className="modal-close" onClick={closeUrunModal}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleUrunSubmit} className="modal-form">
                            <div className="form-group">
                                <label className="form-label">Ürün Görseli</label>
                                {imagePreview ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ position: 'relative' }}>
                                            <img src={proxyImageUrl(imagePreview)} alt="Önizleme" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 10 }} />
                                            <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); setUrunForm({ ...urunForm, gorsel: '' }); }}
                                                style={{ position: 'absolute', top: -8, right: -8, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <X size={14} />
                                            </button>
                                        </div>
                                        <div>
                                            <button type="button" className="btn btn--secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => { setShowMediaLibrary(true); loadMediaImages(); }}>
                                                <Images size={14} style={{ marginRight: 4 }} />Değiştir
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button type="button" className="btn btn--secondary" style={{ flex: 1, padding: '14px 0', fontSize: 13 }} onClick={() => document.getElementById('imageInput').click()}>
                                            <ImagePlus size={18} style={{ marginRight: 6 }} />Yeni Yükle
                                        </button>
                                        <button type="button" className="btn btn--secondary" style={{ flex: 1, padding: '14px 0', fontSize: 13 }} onClick={() => { setShowMediaLibrary(true); loadMediaImages(); }}>
                                            <Images size={18} style={{ marginRight: 6 }} />Kütüphaneden Seç
                                        </button>
                                    </div>
                                )}
                                <input id="imageInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageSelect} style={{ display: 'none' }} />
                                {showMediaLibrary && (
                                    <div style={{ marginTop: 12, border: '1px solid var(--color-border)', borderRadius: 12, padding: 12, background: 'var(--color-bg)', maxHeight: 340, display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Görsel Kütüphanesi</span>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button type="button" style={{ fontSize: 11, padding: '4px 10px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }} onClick={() => document.getElementById('imageInput').click()}>+ Yeni Yükle</button>
                                                <button type="button" style={{ fontSize: 11, padding: '4px 10px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, cursor: 'pointer' }} onClick={() => setShowMediaLibrary(false)}>Kapat</button>
                                            </div>
                                        </div>
                                        <div style={{ position: 'relative', marginBottom: 8 }}>
                                            <Search size={12} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="Görsel ara..."
                                                value={mediaSearch}
                                                onChange={(e) => setMediaSearch(e.target.value)}
                                                style={{ fontSize: 11, padding: '4px 6px 4px 24px', width: '100%' }}
                                            />
                                        </div>
                                        {loadingMedia ? (
                                            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)', padding: 20 }}>Yükleniyor...</p>
                                        ) : (() => {
                                            const filteredMedia = mediaImages.filter(img => !mediaSearch || img.ad?.toLowerCase().includes(mediaSearch.toLowerCase()));
                                            return filteredMedia.length === 0 ? (
                                                <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)', padding: 20 }}>{mediaSearch ? 'Sonuç bulunamadı' : 'Henüz görsel yok. Yeni yükleyin.'}</p>
                                            ) : (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8, flex: 1, overflowY: 'auto' }}>
                                                    {filteredMedia.map((img) => (
                                                        <img key={img.key} src={proxyImageUrl(img.url)} alt="" onClick={() => selectFromLibrary(img.url)}
                                                            style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: imagePreview === img.url ? '3px solid var(--color-primary)' : '3px solid transparent', transition: 'border 0.15s', opacity: imagePreview === img.url ? 1 : 0.85 }}
                                                            onMouseOver={(e) => e.target.style.opacity = 1}
                                                            onMouseOut={(e) => e.target.style.opacity = imagePreview === img.url ? 1 : 0.85} />
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>
                            <div className="form-group">
                                <label className="form-label">Ürün Adı</label>
                                <input type="text" className="form-input" value={urunForm.ad} onChange={(e) => setUrunForm({ ...urunForm, ad: e.target.value })} placeholder="örn: Soğuk Kadayıf" required autoFocus />
                            </div>
                            <div className="form-row">
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">Fiyat (₺)</label>
                                    <input type="number" className="form-input" value={urunForm.fiyat} onChange={(e) => setUrunForm({ ...urunForm, fiyat: e.target.value })} placeholder="0" required min="0" step="0.01" />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">Kategori</label>
                                    <select className="form-input" value={urunForm.kategori} onChange={(e) => setUrunForm({ ...urunForm, kategori: e.target.value })} required>
                                        <option value="">Seçiniz</option>
                                        {(role === 'admin' ? kategoriler : kategoriler.filter(k => k.tur === 'sube_ozel')).map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Miktar / Porsiyon</label>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input type="number" className="form-input" value={urunForm.miktar} onChange={(e) => setUrunForm({ ...urunForm, miktar: e.target.value })} placeholder="örn: 200" min="0" style={{ width: 120 }} />
                                    <select className="form-input" value={urunForm.birim} onChange={(e) => setUrunForm({ ...urunForm, birim: e.target.value })} style={{ width: 80 }}>
                                        <option value="gr">gr</option>
                                        <option value="ml">ml</option>
                                        <option value="cl">cl</option>
                                        <option value="lt">lt</option>
                                        <option value="adet">adet</option>
                                    </select>
                                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>opsiyonel</span>
                                </div>
                            </div>
                            {(() => {
                                const selectedKat = kategoriler.find((k) => k.id === urunForm.kategori);
                                if (selectedKat && selectedKat.tur === 'sube_ozel' && role === 'admin') {
                                    return (
                                        <div className="form-group">
                                            <label className="form-label">Şube</label>
                                            <select className="form-input" value={urunForm.sube_slug} onChange={(e) => setUrunForm({ ...urunForm, sube_slug: e.target.value })} required>
                                                <option value="">Şube seçiniz</option>
                                                {subeler.map((s) => <option key={s.slug} value={s.slug}>{s.ad || s.slug}</option>)}
                                            </select>
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                            <div className="form-group">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <label className="form-label" style={{ marginBottom: 0 }}>Açıklama</label>
                                    <button type="button" disabled={aiLoading || !urunForm.ad.trim()} onClick={async () => {
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
                                    }} style={{
                                        display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                                        padding: '3px 10px', borderRadius: 12, cursor: 'pointer', border: 'none',
                                        background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff',
                                        opacity: (aiLoading || !urunForm.ad.trim()) ? 0.5 : 1, transition: 'opacity 0.15s',
                                    }}>
                                        <Sparkles size={12} />
                                        {aiLoading ? 'Yazılıyor...' : 'AI ile yaz'}
                                    </button>
                                </div>
                                <textarea className="form-input form-textarea" value={urunForm.aciklama} onChange={(e) => setUrunForm({ ...urunForm, aciklama: e.target.value })} placeholder="Ürün açıklaması (opsiyonel)" rows={3} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Etiketler</label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {ETIKETLER.map(tag => {
                                        const active = (urunForm.etiket || []).includes(tag.key);
                                        return (
                                            <button key={tag.key} type="button" onClick={() => {
                                                const current = urunForm.etiket || [];
                                                setUrunForm({ ...urunForm, etiket: active ? current.filter(k => k !== tag.key) : [...current, tag.key] });
                                            }} style={{
                                                fontSize: 12, padding: '4px 10px', borderRadius: 16, cursor: 'pointer', transition: 'all 0.15s',
                                                border: active ? `2px solid ${tag.color}` : '2px solid var(--color-border)',
                                                background: active ? tag.color + '18' : 'transparent',
                                                color: active ? tag.color : 'var(--color-text-secondary)', fontWeight: active ? 700 : 500,
                                            }}>
                                                {tag.emoji} {tag.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn--secondary" onClick={closeUrunModal}>İptal</button>
                                <button type="submit" className="btn btn--primary" disabled={savingUrun}>{savingUrun ? 'Kaydediliyor...' : editingUrun ? 'Güncelle' : 'Oluştur'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showTrash && (
                <div className="modal-overlay" onClick={() => setShowTrash(false)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
                        <div className="modal-header">
                            <h2><Trash size={18} style={{ marginRight: 8 }} />Çöp Kutusu</h2>
                            <button className="modal-close" onClick={() => setShowTrash(false)}><X size={18} /></button>
                        </div>
                        <div style={{ padding: '0 24px 24px' }}>
                            {trashUrunler.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af' }}>
                                    <Trash size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                                    <p>Çöp kutusu boş</p>
                                </div>
                            ) : (
                                <>
                                    <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>Silinen ürünler 5 gün sonra kalıcı olarak silinir.</p>
                                    <div style={{ maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {trashUrunler.map((u) => {
                                            const deletedDate = new Date(u.deletedAt);
                                            const daysLeft = Math.max(0, 5 - Math.floor((Date.now() - deletedDate.getTime()) / (1000 * 60 * 60 * 24)));
                                            return (
                                                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fafafa' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <span style={{ fontWeight: 600, fontSize: 14 }}>{u.ad}</span>
                                                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                                                            {deletedDate.toLocaleDateString('tr-TR')} • {daysLeft > 0 ? `${daysLeft} gün kaldı` : 'Bugün silinecek'}
                                                        </div>
                                                    </div>
                                                    <button className="btn btn--secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={async () => {
                                                        try {
                                                            await api.put(`/products/${u.id}/restore`);
                                                            setTrashUrunler(prev => prev.filter(t => t.id !== u.id));
                                                            // Optimistic: geri yüklenen ürünü listeye ekle
                                                            const { deletedAt, ...restoredUrun } = u;
                                                            setUrunler(prev => [...prev, restoredUrun]);
                                                            toast.success('Ürün geri yüklendi');
                                                        } catch { toast.error('Geri yükleme başarısız'); }
                                                    }}>
                                                        <RotateCcw size={12} style={{ marginRight: 4 }} />Geri Al
                                                    </button>
                                                    <button className="btn btn--danger" style={{ padding: '4px 10px', fontSize: 11 }} onClick={async () => {
                                                        const ok = await confirm('Bu ürünü kalıcı olarak silmek istediğinize emin misiniz?');
                                                        if (!ok) return;
                                                        try {
                                                            await api.delete(`/products/${u.id}/permanent`);
                                                            setTrashUrunler(prev => prev.filter(t => t.id !== u.id));
                                                            toast.success('Ürün kalıcı olarak silindi');
                                                        } catch { toast.error('Silme başarısız'); }
                                                    }}>
                                                        <Trash2 size={12} style={{ marginRight: 4 }} />Sil
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
