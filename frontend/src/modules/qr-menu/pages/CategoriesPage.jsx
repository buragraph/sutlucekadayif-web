import { useState, useEffect } from 'react';
import api from '../../../services/api';
import { Plus, Pencil, Trash2, X, GripVertical, Globe, MapPin, ImagePlus, Upload, Images } from 'lucide-react';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { proxyImageUrl } from '../../../utils/imageProxy';

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
    function closeModal() { setShowModal(false); setEditing(null); }

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
            const { data } = await api.get('/media', { params: { klasor: 'Kategoriler' } });
            setMediaImages(data.medyalar || []);
        } catch { toast.error('Görseller yüklenemedi'); }
        setLoadingMedia(false);
    }

    function selectFromLibrary(url) {
        setForm((prev) => ({ ...prev, gorsel: url }));
        setShowMediaLibrary(false);
    }

    return (
        <div className="page-padding">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <p className="page-header__crumb">QR Menü</p>
                    <h1 className="page-header__title">Kategoriler</h1>
                </div>
                <button className="btn btn--primary" onClick={openAdd}><Plus size={16} /> Kategori Ekle</button>
            </div>

            {loading ? (
                <div className="loading-container"><div className="spinner" /><p className="loading-text">Kategoriler yükleniyor...</p></div>
            ) : kategoriler.length === 0 ? (
                <div className="empty-state"><div className="icon">📂</div><p>Henüz kategori yok</p></div>
            ) : (
                <div className="categories-list">
                    {kategoriler.map((kat) => (
                        <div key={kat.id} className="category-row">
                            <div className="category-row__grip"><GripVertical size={16} /></div>
                            <div className="category-row__info">
                                {kat.gorsel && <img src={proxyImageUrl(kat.gorsel)} alt={kat.ad} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', marginRight: 12, flexShrink: 0 }} />}
                                <h3 className="category-row__name">{kat.ad}</h3>
                                <span className="text-muted" style={{ fontSize: 12 }}>{kat.urunSayisi || 0} ürün</span>
                                <span className={`category-tur-badge ${(kat.tur || 'ortak') === 'ortak' ? 'category-tur-badge--ortak' : 'category-tur-badge--ozel'}`}>
                                    {(kat.tur || 'ortak') === 'ortak' ? <><Globe size={11} /> Ortak</> : <><MapPin size={11} /> Şubeye Özel</>}
                                </span>
                                {kat.renk && <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: kat.renk, marginLeft: 6, verticalAlign: 'middle', border: '1px solid rgba(0,0,0,0.1)' }} />}

                            </div>
                            <div className="actions-cell">
                                <button className="icon-btn" onClick={() => openEdit(kat)} title="Düzenle"><Pencil size={15} /></button>
                                <button className="icon-btn icon-btn--danger" onClick={() => handleDelete(kat)} title="Sil"><Trash2 size={15} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editing ? 'Kategori Düzenle' : 'Yeni Kategori'}</h2>
                            <button className="modal-close" onClick={closeModal}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-form">
                            <div className="form-group">
                                <label className="form-label">Kategori Görseli</label>
                                {form.gorsel ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ position: 'relative' }}>
                                            <img src={proxyImageUrl(form.gorsel)} alt="Önizleme" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 10 }} />
                                            <button type="button" onClick={() => { setForm({ ...form, gorsel: '' }); }}
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
                                        <button type="button" className="btn btn--secondary" style={{ flex: 1, padding: '14px 0', fontSize: 13 }} onClick={() => document.getElementById('catImageInput').click()}>
                                            <ImagePlus size={18} style={{ marginRight: 6 }} />Yeni Yükle
                                        </button>
                                        <button type="button" className="btn btn--secondary" style={{ flex: 1, padding: '14px 0', fontSize: 13 }} onClick={() => { setShowMediaLibrary(true); loadMediaImages(); }}>
                                            <Images size={18} style={{ marginRight: 6 }} />Kütüphaneden Seç
                                        </button>
                                    </div>
                                )}
                                <input id="catImageInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageUpload} style={{ display: 'none' }} />
                                {showMediaLibrary && (
                                    <div style={{ marginTop: 12, border: '1px solid var(--color-border)', borderRadius: 12, padding: 12, background: 'var(--color-bg)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Görsel Kütüphanesi</span>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button type="button" style={{ fontSize: 11, padding: '4px 10px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }} onClick={() => document.getElementById('catImageInput').click()}>+ Yeni Yükle</button>
                                                <button type="button" style={{ fontSize: 11, padding: '4px 10px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, cursor: 'pointer' }} onClick={() => setShowMediaLibrary(false)}>Kapat</button>
                                            </div>
                                        </div>
                                        {loadingMedia ? (
                                            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)', padding: 20 }}>Yükleniyor...</p>
                                        ) : mediaImages.length === 0 ? (
                                            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)', padding: 20 }}>Henüz görsel yok. Yeni yükleyin.</p>
                                        ) : (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
                                                {mediaImages.map((img) => (
                                                    <img key={img.id} src={proxyImageUrl(img.url)} alt={img.ad} onClick={() => selectFromLibrary(img.url)}
                                                        style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: form.gorsel === img.url ? '3px solid var(--color-primary)' : '3px solid transparent', transition: 'border 0.15s', opacity: form.gorsel === img.url ? 1 : 0.85 }}
                                                        onMouseOver={(e) => e.target.style.opacity = 1}
                                                        onMouseOut={(e) => e.target.style.opacity = form.gorsel === img.url ? 1 : 0.85} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="form-group">
                                <label className="form-label">Kategori Adı</label>
                                <input type="text" className="form-input" value={form.ad} onChange={(e) => setForm({ ...form, ad: e.target.value })} placeholder="örn: Tatlılar" required autoFocus />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Tür</label>
                                <select className="form-input" value={form.tur} onChange={(e) => setForm({ ...form, tur: e.target.value })}>
                                    <option value="ortak">Ortak (Tüm Şubeler)</option>
                                    <option value="sube_ozel">Şubeye Özel</option>
                                </select>
                            </div>
                            <div className="form-hint">
                                {form.tur === 'ortak'
                                    ? '🌐 Bu kategorideki ürünler tüm şubelerde görünür.'
                                    : '📍 Bu kategorideki ürünler yalnızca eklendiği şubede görünür.'}
                            </div>
                            <div className="form-group">
                                <label className="form-label">Renk</label>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {colorPalette.map((c) => (
                                        <button key={c.bg} type="button" title={c.label} onClick={() => setForm({ ...form, renk: c.bg })}
                                            style={{ width: 32, height: 32, borderRadius: '50%', background: c.bg, border: form.renk === c.bg ? `3px solid ${c.text}` : '2px solid transparent', cursor: 'pointer', transition: 'all 0.15s', transform: form.renk === c.bg ? 'scale(1.15)' : 'scale(1)' }} />
                                    ))}
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn--secondary" onClick={closeModal}>İptal</button>
                                <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Kaydediliyor...' : editing ? 'Güncelle' : 'Oluştur'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {replaceState && (
                <div className="modal-overlay" onClick={() => setReplaceState(null)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="modal-header">
                            <h2>Kategori Değiştir</h2>
                            <button className="modal-close" onClick={() => setReplaceState(null)}><X size={18} /></button>
                        </div>
                        <div style={{ padding: '0 24px 24px' }}>
                            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#92400e' }}>
                                ⚠️ <strong>"{replaceState.kat.ad}"</strong> kategorisinde <strong>{replaceState.urunSayisi}</strong> ürün bulunuyor. Silmek için ürünleri başka bir kategoriye taşımalısınız.
                            </div>
                            <div className="form-group">
                                <label className="form-label">Ürünleri taşıyacağınız kategori</label>
                                <select
                                    className="form-input"
                                    value={replaceState.yeniKategori}
                                    onChange={(e) => setReplaceState({ ...replaceState, yeniKategori: e.target.value })}
                                >
                                    <option value="">Kategori seçin...</option>
                                    {kategoriler.filter(k => k.id !== replaceState.kat.id).map(k => (
                                        <option key={k.id} value={k.id}>{k.ad}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn--secondary" onClick={() => setReplaceState(null)}>İptal</button>
                                <button type="button" className="btn btn--danger" onClick={handleReplaceAndDelete}>Taşı ve Sil</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
