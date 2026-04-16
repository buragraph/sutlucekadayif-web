import { useState, useEffect } from 'react';
import api from '../../../services/api';
import { Plus, Pencil, Trash2, X, MapPin } from 'lucide-react';

export default function BranchesPage() {
    const [subeler, setSubeler] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ slug: '', ad: '', adres: '', telefon: '' });

    useEffect(() => { loadSubeler(); }, []);

    async function loadSubeler() {
        setLoading(true);
        try { const { data } = await api.get('/branches'); setSubeler(data.subeler); }
        catch (err) { console.error('Şubeler yüklenemedi:', err); }
        setLoading(false);
    }

    function openAdd() {
        setEditing(null);
        setForm({ slug: '', ad: '', adres: '', telefon: '' });
        setShowModal(true);
    }

    function openEdit(sube) {
        setEditing(sube);
        setForm({ slug: sube.slug, ad: sube.ad, adres: sube.adres || '', telefon: sube.telefon || '' });
        setShowModal(true);
    }

    function closeModal() { setShowModal(false); setEditing(null); }

    async function handleSubmit(e) {
        e.preventDefault();
        setSaving(true);
        try {
            if (editing) {
                await api.put(`/branches/${editing.slug}`, { ad: form.ad, adres: form.adres, telefon: form.telefon });
            } else {
                await api.post('/branches', form);
            }
            closeModal();
            await loadSubeler();
        } catch (err) { alert(err.response?.data?.error || 'Bir hata oluştu'); }
        setSaving(false);
    }

    async function handleDelete(sube) {
        if (!confirm(`"${sube.ad}" şubesini silmek istediğinize emin misiniz?`)) return;
        try { await api.delete(`/branches/${sube.slug}`); await loadSubeler(); }
        catch (err) { alert(err.response?.data?.error || 'Silme işlemi başarısız'); }
    }

    return (
        <div className="page-padding">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <p className="page-header__crumb">Yönetim</p>
                    <h1 className="page-header__title">Şubeler</h1>
                </div>
                <button className="btn btn--primary" onClick={openAdd}><Plus size={16} /> Şube Ekle</button>
            </div>

            {loading ? (
                <div className="loading-container"><div className="spinner" /><p className="loading-text">Şubeler yükleniyor...</p></div>
            ) : subeler.length === 0 ? (
                <div className="empty-state"><div className="icon">🏪</div><p>Henüz şube yok</p></div>
            ) : (
                <div className="users-table-wrapper">
                    <table className="users-table">
                        <thead>
                            <tr>
                                <th>Slug</th>
                                <th>Şube Adı</th>
                                <th>Adres</th>
                                <th>Telefon</th>
                                <th style={{ width: 90 }}>İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            {subeler.map((sube) => (
                                <tr key={sube.slug}>
                                    <td><code style={{ fontSize: 12, background: 'var(--color-surface)', padding: '2px 6px', borderRadius: 4 }}>{sube.slug}</code></td>
                                    <td><span className="user-email">{sube.ad}</span></td>
                                    <td><span className="text-muted">{sube.adres || '—'}</span></td>
                                    <td><span className="text-muted">{sube.telefon || '—'}</span></td>
                                    <td>
                                        <div className="actions-cell">
                                            <button className="icon-btn" onClick={() => openEdit(sube)} title="Düzenle"><Pencil size={15} /></button>
                                            <button className="icon-btn icon-btn--danger" onClick={() => handleDelete(sube)} title="Sil"><Trash2 size={15} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editing ? 'Şube Düzenle' : 'Yeni Şube'}</h2>
                            <button className="modal-close" onClick={closeModal}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-form">
                            <div className="form-group">
                                <label className="form-label">Slug (URL)</label>
                                <input type="text" className="form-input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="örn: ankara" required disabled={!!editing} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Şube Adı</label>
                                <input type="text" className="form-input" value={form.ad} onChange={(e) => setForm({ ...form, ad: e.target.value })} placeholder="örn: Ankara Şubesi" required autoFocus />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Adres</label>
                                <input type="text" className="form-input" value={form.adres} onChange={(e) => setForm({ ...form, adres: e.target.value })} placeholder="Şube adresi (opsiyonel)" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Telefon</label>
                                <input type="text" className="form-input" value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} placeholder="Şube telefonu (opsiyonel)" />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn--secondary" onClick={closeModal}>İptal</button>
                                <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Kaydediliyor...' : editing ? 'Güncelle' : 'Oluştur'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
