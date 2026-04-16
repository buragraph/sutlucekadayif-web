import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../services/api';
import { Plus, Pencil, Trash2, X, UserPlus } from 'lucide-react';

export default function UsersPage() {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState([]);
    const [subeler, setSubeler] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        email: '',
        password: '',
        displayName: '',
        subeSlug: '',
        role: 'sube_sahibi',
    });

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const [usersRes, menuRes] = await Promise.all([
                api.get('/users'),
                api.get('/menu/subeler'),
            ]);
            setUsers(usersRes.data.users);
            setSubeler(menuRes.data.subeler || []);
        } catch (err) {
            console.error('Veriler yüklenemedi:', err);
        }
        setLoading(false);
    }

    function openAddModal() {
        setEditingUser(null);
        setForm({
            email: '',
            password: '',
            displayName: '',
            subeSlug: subeler[0]?.slug || '',
            role: 'sube_sahibi',
        });
        setShowModal(true);
    }

    function openEditModal(u) {
        setEditingUser(u);
        setForm({
            email: u.email,
            password: '',
            displayName: u.displayName || '',
            subeSlug: u.subeSlug || '',
            role: u.role || 'sube_sahibi',
        });
        setShowModal(true);
    }

    function closeModal() {
        setShowModal(false);
        setEditingUser(null);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setSaving(true);

        try {
            if (editingUser) {
                await api.put(`/users/${editingUser.uid}`, {
                    email: form.email,
                    displayName: form.displayName,
                    subeSlug: form.subeSlug,
                    role: form.role,
                });
            } else {
                if (!form.password) {
                    alert('Şifre zorunludur');
                    setSaving(false);
                    return;
                }
                await api.post('/users', form);
            }
            closeModal();
            await loadData();
        } catch (err) {
            console.error('İşlem hatası:', err);
            const msg = err.response?.data?.error || 'Bir hata oluştu';
            alert(msg);
        }
        setSaving(false);
    }

    async function handleDelete(u) {
        if (u.uid === currentUser?.uid) {
            alert('Kendi hesabınızı silemezsiniz');
            return;
        }
        if (!confirm(`${u.email} kullanıcısını silmek istediğinize emin misiniz?`)) return;

        try {
            await api.delete(`/users/${u.uid}`);
            await loadData();
        } catch (err) {
            console.error('Silme hatası:', err);
            alert(err.response?.data?.error || 'Silme işlemi başarısız');
        }
    }

    const rolLabel = (role) => {
        switch (role) {
            case 'admin': return 'Yönetici';
            case 'sube_sahibi': return 'Şube Sahibi';
            default: return role || '—';
        }
    };

    return (
        <div className="page-padding">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <p className="page-header__crumb">Yönetim</p>
                    <h1 className="page-header__title">Kullanıcılar</h1>
                </div>
                <button className="btn btn--primary" onClick={openAddModal}>
                    <UserPlus size={16} />
                    Kullanıcı Ekle
                </button>
            </div>

            {loading ? (
                <div className="loading-container">
                    <div className="spinner" />
                    <p className="loading-text">Kullanıcılar yükleniyor...</p>
                </div>
            ) : users.length === 0 ? (
                <div className="empty-state">
                    <div className="icon">👥</div>
                    <p>Henüz kullanıcı yok</p>
                </div>
            ) : (
                <div className="users-table-wrapper">
                    <table className="users-table">
                        <thead>
                            <tr>
                                <th>E-posta</th>
                                <th>Ad</th>
                                <th>Şube</th>
                                <th>Rol</th>
                                <th>Son Giriş</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u) => (
                                <tr key={u.uid}>
                                    <td>
                                        <span className="user-email">{u.email}</span>
                                    </td>
                                    <td>{u.displayName || '—'}</td>
                                    <td>
                                        {u.subeSlug ? (
                                            <span className="sube-chip">{u.subeSlug}</span>
                                        ) : (
                                            <span className="text-muted">—</span>
                                        )}
                                    </td>
                                    <td>
                                        <span className={`role-badge ${u.role || ''}`}>
                                            {rolLabel(u.role)}
                                        </span>
                                    </td>
                                    <td className="text-muted">
                                        {u.lastSignIn
                                            ? new Date(u.lastSignIn).toLocaleDateString('tr-TR')
                                            : '—'}
                                    </td>
                                    <td>
                                        <div className="actions-cell">
                                            <button
                                                className="icon-btn"
                                                onClick={() => openEditModal(u)}
                                                title="Düzenle"
                                            >
                                                <Pencil size={15} />
                                            </button>
                                            {u.uid !== currentUser?.uid && (
                                                <button
                                                    className="icon-btn icon-btn--danger"
                                                    onClick={() => handleDelete(u)}
                                                    title="Sil"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingUser ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'}</h2>
                            <button className="modal-close" onClick={closeModal}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="modal-form">
                            <div className="form-group">
                                <label className="form-label">E-posta</label>
                                <input
                                    type="email"
                                    className="form-input"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    required
                                    disabled={!!editingUser}
                                />
                            </div>

                            {!editingUser && (
                                <div className="form-group">
                                    <label className="form-label">Şifre</label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        value={form.password}
                                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                                        required
                                        minLength={6}
                                        placeholder="Min. 6 karakter"
                                    />
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">Ad Soyad</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={form.displayName}
                                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                                    placeholder="Opsiyonel"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">Şube</label>
                                    <select
                                        className="form-input"
                                        value={form.subeSlug}
                                        onChange={(e) => setForm({ ...form, subeSlug: e.target.value })}
                                        required={form.role !== 'admin'}
                                    >
                                        <option value="">Seçiniz</option>
                                        {subeler.map((s) => (
                                            <option key={s.slug} value={s.slug}>
                                                {s.ad}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">Rol</label>
                                    <select
                                        className="form-input"
                                        value={form.role}
                                        onChange={(e) => {
                                            const newRole = e.target.value;
                                            setForm({ ...form, role: newRole, subeSlug: newRole === 'admin' ? '' : form.subeSlug });
                                        }}
                                        required
                                    >
                                        <option value="sube_sahibi">Şube Sahibi</option>
                                        <option value="admin">Yönetici</option>
                                    </select>
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn--secondary" onClick={closeModal}>
                                    İptal
                                </button>
                                <button type="submit" className="btn btn--primary" disabled={saving}>
                                    {saving ? 'Kaydediliyor...' : editingUser ? 'Güncelle' : 'Oluştur'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
