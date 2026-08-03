import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../services/api';
import { Plus, Pencil, Trash2, X, UserPlus, RotateCcw, Copy } from 'lucide-react';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';

// Yeni kullanıcıya verilecek geçici parola. E-posta gönderimine bağlı bir
// "şifre belirleme" akışı yok; parolayı yönetici iletir, kullanıcı profilinden değiştirir.
const PAROLA_HARFLERI = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%*-_';
function uretParola(uzunluk = 14) {
    const b = crypto.getRandomValues(new Uint8Array(uzunluk));
    return Array.from(b, (x) => PAROLA_HARFLERI[x % PAROLA_HARFLERI.length]).join('');
}

export default function UsersPage() {
    const { user: currentUser, refreshClaims } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();
    const [users, setUsers] = useState([]);
    const [subeler, setSubeler] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [yeniKimlik, setYeniKimlik] = useState(null);   // { email, parola } — yaratımdan sonra gösterilir
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
                // Kullanıcı kendi rol/şubesini değiştirdiyse token'ı tazele (yeniden giriş gerekmesin)
                if (editingUser.uid === currentUser?.uid) await refreshClaims();
                closeModal();
                await loadData();
                toast.success('Kullanıcı güncellendi');
            } else {
                const parola = uretParola();
                await api.post('/users', {
                    email: form.email,
                    password: parola,
                    displayName: form.displayName,
                    subeSlug: form.subeSlug,
                    role: form.role,
                });
                closeModal();
                await loadData();
                // Parola yalnızca burada görünür — kullanıcıya yönetici iletir.
                setYeniKimlik({ email: form.email, parola });
            }
        } catch (err) {
            console.error('İşlem hatası:', err);
            toast.error(err.response?.data?.error || 'Bir hata oluştu');
        }
        setSaving(false);
    }

    async function handleDelete(u) {
        if (u.uid === currentUser?.uid) {
            toast.error('Kendi hesabınızı silemezsiniz');
            return;
        }
        const ok = await confirm(`${u.email} kullanıcısını silmek istediğinize emin misiniz?`);
        if (!ok) return;

        try {
            await api.delete(`/users/${u.uid}`);
            await loadData();
            toast.success('Kullanıcı silindi');
        } catch (err) {
            console.error('Silme hatası:', err);
            toast.error(err.response?.data?.error || 'Silme işlemi başarısız');
        }
    }

    async function handleResetOnboarding(u) {
        const ok = await confirm(`${u.displayName || u.email} kullanıcısının ilk giriş formu sıfırlansın mı? Bir sonraki girişinde wizard tekrar çıkar.`);
        if (!ok) return;
        try {
            await api.post(`/onboarding/reset/${u.uid}`);
            toast.success('İlk giriş formu sıfırlandı');
        } catch (err) {
            console.error('Sıfırlama hatası:', err);
            toast.error(err.response?.data?.error || 'Sıfırlama başarısız');
        }
    }

    const rolLabel = (role) => {
        switch (role) {
            case 'admin': return 'Yönetici';
            case 'sube_sahibi': return 'Şube Sahibi';
            case 'calisan': return 'Çalışan';
            default: return role || '—';
        }
    };

    const isSubeSahibi = currentUser?.role === 'sube_sahibi';

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-3xl leading-none tracking-tight">{isSubeSahibi ? 'Çalışanlar' : 'Kullanıcılar'}</h1>
                <Button onClick={openAddModal}>
                    <UserPlus className="size-4" />
                    {isSubeSahibi ? 'Çalışan Ekle' : 'Kullanıcı Ekle'}
                </Button>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                    <Spinner className="size-8" />
                    <p className="text-sm text-muted-foreground">Kullanıcılar yükleniyor...</p>
                </div>
            ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                    <span className="text-4xl">👥</span>
                    <p>Henüz kullanıcı yok</p>
                </div>
            ) : (
                <div className="rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>E-posta</TableHead>
                                <TableHead>Ad</TableHead>
                                <TableHead>Telefon</TableHead>
                                <TableHead>Şube</TableHead>
                                <TableHead>Rol</TableHead>
                                <TableHead>Son Giriş</TableHead>
                                <TableHead className="w-24"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.map((u) => (
                                <TableRow key={u.uid}>
                                    <TableCell className="font-medium">{u.email}</TableCell>
                                    <TableCell>{u.displayName || '—'}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{u.telefon || '—'}</TableCell>
                                    <TableCell>
                                        {u.subeSlug ? (
                                            <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700">{u.subeSlug}</Badge>
                                        ) : (
                                            <span className="text-sm text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                                            {rolLabel(u.role)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {u.lastSignIn
                                            ? new Date(u.lastSignIn).toLocaleDateString('tr-TR')
                                            : '—'}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex gap-1">
                                            <Button variant="ghost" size="icon" className="size-8" onClick={() => openEditModal(u)} title="Düzenle">
                                                <Pencil className="size-3.5" />
                                            </Button>
                                            {!isSubeSahibi && u.role === 'sube_sahibi' && (
                                                <Button variant="ghost" size="icon" className="size-8" onClick={() => handleResetOnboarding(u)} title="İlk giriş formunu sıfırla">
                                                    <RotateCcw className="size-3.5" />
                                                </Button>
                                            )}
                                            {u.uid !== currentUser?.uid && (
                                                <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => handleDelete(u)} title="Sil">
                                                    <Trash2 className="size-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            <Dialog open={showModal} onOpenChange={(open) => !open && closeModal()}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editingUser ? (isSubeSahibi ? 'Çalışanı Düzenle' : 'Kullanıcı Düzenle') : (isSubeSahibi ? 'Yeni Çalışan' : 'Yeni Kullanıcı')}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label>E-posta</Label>
                            <Input
                                type="email"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                required
                                disabled={!!editingUser}
                            />
                        </div>

                        {!editingUser && (
                            <p className="text-sm text-muted-foreground">
                                Kullanıcı oluşturulunca geçici bir parola üretilir ve size gösterilir.
                                Parolayı kullanıcıya siz iletirsiniz; kullanıcı profil sayfasından değiştirebilir.
                            </p>
                        )}

                        <div className="space-y-1.5">
                            <Label>Ad Soyad</Label>
                            <Input
                                type="text"
                                value={form.displayName}
                                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                                placeholder="Opsiyonel"
                            />
                        </div>

                        {!isSubeSahibi && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Şube</Label>
                                    <select
                                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
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

                                <div className="space-y-1.5">
                                    <Label>Rol</Label>
                                    <select
                                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                        value={form.role}
                                        onChange={(e) => {
                                            const newRole = e.target.value;
                                            setForm({ ...form, role: newRole, subeSlug: newRole === 'admin' ? '' : form.subeSlug });
                                        }}
                                        required
                                    >
                                        <option value="calisan">Çalışan</option>
                                        <option value="sube_sahibi">Şube Sahibi</option>
                                        <option value="admin">Yönetici</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={closeModal}>
                                İptal
                            </Button>
                            <Button type="submit" disabled={saving}>
                                {saving ? 'Kaydediliyor...' : editingUser ? 'Güncelle' : 'Oluştur'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Yeni kullanıcının geçici parolası — yalnızca bir kez gösterilir */}
            <Dialog open={!!yeniKimlik} onOpenChange={(open) => !open && setYeniKimlik(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Kullanıcı oluşturuldu</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Aşağıdaki geçici parolayı kullanıcıya iletin. Bu parola bir daha gösterilmez;
                            kullanıcı giriş yaptıktan sonra profil sayfasından kendi parolasını belirleyebilir.
                        </p>
                        <div className="space-y-1.5">
                            <Label>E-posta</Label>
                            <Input readOnly value={yeniKimlik?.email || ''} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Geçici parola</Label>
                            <div className="flex gap-2">
                                <Input readOnly value={yeniKimlik?.parola || ''} className="font-mono" />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    title="Kopyala"
                                    onClick={async () => {
                                        try {
                                            await navigator.clipboard.writeText(
                                                `${yeniKimlik.email} / ${yeniKimlik.parola}`
                                            );
                                            toast.success('Kopyalandı');
                                        } catch {
                                            toast.error('Kopyalanamadı, elle seçin');
                                        }
                                    }}
                                >
                                    <Copy className="size-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setYeniKimlik(null)}>Tamam</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
