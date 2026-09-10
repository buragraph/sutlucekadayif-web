import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../services/api';
import { Plus, Pencil, Trash2, X, UserPlus, RotateCcw, Copy, KeyRound, Search, Upload } from 'lucide-react';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import TopluKullaniciEkle from '../components/TopluKullaniciEkle';

// PAROLA İKİ YOLDAN BİRİ:
//  - Parola boş bırakılırsa hesap parolasız açılır; kişi giriş ekranına ilk
//    yazdığı parolayı kendi parolası yapar (bkz. backend routes/parola.js).
//  - Merkez bir parola verirse (toplu devirde olduğu gibi) hesapta
//    `parola_degistir_gerekli` işaretlenir ve kişi panele girer girmez
//    ParolaDegistirKapisi ile kendi parolasını belirlemeden ilerleyemez.

export default function UsersPage() {
    const { user: currentUser, refreshClaims } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();
    const [users, setUsers] = useState([]);
    const [subeler, setSubeler] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [topluAcik, setTopluAcik] = useState(false);
    const [yeniKimlik, setYeniKimlik] = useState(null);   // { email, parola } — yaratımdan sonra gösterilir
    const [editingUser, setEditingUser] = useState(null);
    const [arama, setArama] = useState('');
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
                // Parola GÖNDERİLMEZ: hesap parolasız açılır.
                await api.post('/users', {
                    email: form.email,
                    displayName: form.displayName,
                    subeSlug: form.subeSlug,
                    role: form.role,
                });
                closeModal();
                await loadData();
                setYeniKimlik({ email: form.email });
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

    // Parola sıfırlama: yeni parola ATANMAZ, hesap "ilk giriş" durumuna döner —
    // kişi giriş ekranında yeni parolasını kendisi belirler.
    async function handleParolaSifirla(u) {
        const ok = await confirm(
            `${u.displayName || u.email} kullanıcısının parolası sıfırlansın mı? ` +
            'Mevcut parolası geçersiz olur; giriş ekranında yazacağı ilk parola yeni parolası olur.'
        );
        if (!ok) return;
        try {
            await api.put(`/users/${u.uid}`, { parolaSifirla: true });
            toast.success('Parola sıfırlandı — kullanıcı ilk girişte yenisini belirleyecek');
        } catch (err) {
            console.error('Parola sıfırlama hatası:', err);
            toast.error(err.response?.data?.error || 'Parola sıfırlanamadı');
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

    // Türkçe karşılaştırma: 'İSTANBUL'.toLowerCase() 'i̇stanbul' üretip eşleşmeyi
    // kaçırır, o yüzden toLocaleLowerCase('tr').
    //
    // Şube ADI da aranıyor: tabloda yalnızca slug görünüyor ama kimse
    // "bahcekent_cadde_outlet" diye aramıyor — listedeki şubeden adı çözülür.
    // Rol etiketi de dahil: "yönetici" yazınca adminler gelsin.
    const q = arama.trim().toLocaleLowerCase('tr');
    const subeAdi = (slug) => subeler.find((x) => x.slug === slug)?.ad || '';
    const gorunenUsers = !q ? users : users.filter((u) =>
        [u.email, u.displayName, u.telefon, u.subeSlug, subeAdi(u.subeSlug), rolLabel(u.role)]
            .some((alan) => (alan || '').toLocaleLowerCase('tr').includes(q))
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-3xl leading-none tracking-tight">{isSubeSahibi ? 'Çalışanlar' : 'Kullanıcılar'}</h1>
                <div className="flex flex-wrap items-center gap-2">
                    {/* Toplu açma yalnızca yöneticide: uç gövdeden serbest şube
                        aldığı için sunucu tarafında da role göre kapalı. */}
                    {!isSubeSahibi && (
                        <Button variant="outline" onClick={() => setTopluAcik(true)}>
                            <Upload className="size-4" />
                            Toplu Ekle
                        </Button>
                    )}
                    <Button onClick={openAddModal}>
                        <UserPlus className="size-4" />
                        {isSubeSahibi ? 'Çalışan Ekle' : 'Kullanıcı Ekle'}
                    </Button>
                </div>
            </div>

            {/* Arama yalnızca liste doluyken: tek kullanıcılı şube panelinde
                kutu boşuna yer kaplardı. */}
            {users.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-0 flex-1 sm:max-w-xs">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={arama}
                            onChange={(e) => setArama(e.target.value)}
                            placeholder="E-posta, ad, telefon, şube, rol ara..."
                            className="h-9 pl-8 pr-8 text-sm"
                        />
                        {arama && (
                            <button type="button" onClick={() => setArama('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    title="Aramayı temizle">
                                <X className="size-3.5" />
                            </button>
                        )}
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {q ? `${gorunenUsers.length} / ${users.length}` : `${users.length}`} kişi
                    </span>
                </div>
            )}

            {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                    <Spinner className="size-8" />
                    <p className="text-sm text-muted-foreground">Kullanıcılar yükleniyor...</p>
                </div>
            ) : gorunenUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                    <span className="text-4xl">👥</span>
                    <p>{q ? `"${arama.trim()}" için sonuç bulunamadı` : 'Henüz kullanıcı yok'}</p>
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
                            {gorunenUsers.map((u) => (
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
                                            {u.uid !== currentUser?.uid && (
                                                <Button variant="ghost" size="icon" className="size-8" onClick={() => handleParolaSifirla(u)} title="Parolayı sıfırla">
                                                    <KeyRound className="size-3.5" />
                                                </Button>
                                            )}
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
                                Parola belirlemenize gerek yok. Kullanıcı giriş ekranına e-postasını
                                ve istediği parolayı yazdığında o parola hesabına kaydedilir.
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

            {/* Hesap açıldı — parola dağıtımı yok, kişi ilk girişte kendi belirler */}
            <Dialog open={!!yeniKimlik} onOpenChange={(open) => !open && setYeniKimlik(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Kullanıcı oluşturuldu</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Hesap parolasız açıldı. Kullanıcıya yalnızca e-posta adresini bildirin:
                            giriş ekranında bu adresi ve istediği parolayı yazdığında o parola
                            hesabına kaydedilir ve girişi tamamlanır.
                        </p>
                        <div className="space-y-1.5">
                            <Label>E-posta</Label>
                            <div className="flex gap-2">
                                <Input readOnly value={yeniKimlik?.email || ''} className="font-mono" />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    title="Kopyala"
                                    onClick={async () => {
                                        try {
                                            await navigator.clipboard.writeText(yeniKimlik.email);
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

            <TopluKullaniciEkle
                subeler={subeler}
                acik={topluAcik}
                onKapat={() => setTopluAcik(false)}
                onBitti={loadData}
            />
        </div>
    );
}
