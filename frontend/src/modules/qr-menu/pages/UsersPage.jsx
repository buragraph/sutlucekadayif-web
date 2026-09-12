import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../services/api';
import { Plus, Pencil, Trash2, X, UserPlus, RotateCcw, Copy, KeyRound, Search, Upload, Shuffle } from 'lucide-react';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import TopluKullaniciEkle from '../components/TopluKullaniciEkle';
import CalisanAkademiModal, { AkademiHucresi } from '../components/CalisanAkademi';
import SubeSecici from '../components/SubeSecici';

// PAROLAYI MERKEZ BELİRLER. Hesap geçici bir parolayla açılır, parola bir kez
// ekranda gösterilir ve `parola_degistir_gerekli` işaretlenir; kişi panele girer
// girmez ParolaDegistirKapisi ile kendi parolasını belirlemeden ilerleyemez.
//
// ESKİ AKIŞ KALDIRILDI: hesap parolasız açılıp kişinin giriş ekranına yazdığı
// ilk parola kalıcı yapılıyordu. Doğrulaması olmadığı için e-postayı bilen
// herkes kurulmamış bir hesabı sahiplenebiliyordu (backend routes/parola.js
// silindi).

// Son erişim: sunucu, kişinin panele en son eriştiği anı gönderiyor (parola
// girişi DEĞİL, oturum hareketi — bkz. backend routes/users.js). Aynı gün içinde
// tarih görmek bilgi vermediği için bugün/dün saat olarak yazılıyor.
function sonErisimYazisi(deger) {
    const t = new Date(deger);
    const gun = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const fark = (gun(new Date()) - gun(t)) / 86400000;
    const saat = t.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    if (fark === 0) return `Bugün ${saat}`;
    if (fark === 1) return `Dün ${saat}`;
    return t.toLocaleDateString('tr-TR');
}

// Parola kuralı sunucuyla aynı (backend-v2/shared/parola.js) ve zorunlu
// parola değiştirme kapısıyla da aynı: EN_AZ 8.
const EN_AZ_PAROLA = 8;

// Karıştırılabilir karakterler (0/O, 1/l/I) yok: bu parola telefonda okunup
// elle yazılıyor, "sıfır mı O mu" sorusu doğrudan destek çağrısı demek.
function geciciParolaUret() {
    const BUYUK = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const RAKAM = '23456789';
    const havuz = BUYUK + 'abcdefghijkmnopqrstuvwxyz' + RAKAM;
    const bayt = new Uint32Array(12);
    crypto.getRandomValues(bayt);
    let p = BUYUK[bayt[0] % BUYUK.length];
    for (let i = 1; i < 8; i++) p += havuz[bayt[i] % havuz.length];
    for (let i = 8; i < 12; i++) p += RAKAM[bayt[i] % RAKAM.length];
    return p;
}

export default function UsersPage() {
    // DİKKAT: rol ve şube context'te `user`ın YANINDA duruyor, İÇİNDE değil
    // (bkz. AuthContext#kullaniciNesnesi → {uid, email, displayName}).
    // `currentUser.role` yazımı sessizce undefined dönüyordu; şube sahibine
    // şube/rol kutuları görünüyor, "Toplu Ekle" düğmesi çıkıyordu.
    const { user: currentUser, role: currentRole, subeSlug: currentSubeSlug, refreshClaims } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();
    const [users, setUsers] = useState([]);
    const [subeler, setSubeler] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [topluAcik, setTopluAcik] = useState(false);
    const [yeniKimlik, setYeniKimlik] = useState(null);   // { email, parola } — yaratımdan sonra gösterilir
    const [editingUser, setEditingUser] = useState(null);
    // Akademi özeti şube sahibi için tek istekte gelir (uid → özet); ders ders
    // döküm yalnızca pencere açılınca istenir.
    const [akademi, setAkademi] = useState({});
    const [akademiKisi, setAkademiKisi] = useState(null);
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
            // İKİNCİL: akademi özeti gelmezse liste yine çalışsın — hücre "—" olur.
            if (currentRole === 'sube_sahibi') {
                api.get('/academy/progress/sube')
                    .then(({ data }) => setAkademi(Object.fromEntries(
                        (data.kisiler || []).map((k) => [k.uid, k])
                    )))
                    .catch(() => setAkademi({}));
            }
        } catch (err) {
            console.error('Veriler yüklenemedi:', err);
        }
        setLoading(false);
    }

    function openAddModal() {
        setEditingUser(null);
        const subeSahibiMi = currentRole === 'sube_sahibi';
        setForm({
            email: '',
            // Hazır bir parola üretilir; yönetici isterse değiştirir. Boş kutu
            // bırakmak "zayıf parola yazma" davranışını davet ediyordu.
            password: geciciParolaUret(),
            displayName: '',
            // Şube sahibi yalnızca KENDİ şubesine ÇALIŞAN açabilir; sunucu da
            // bunu zorluyor (routes/users.js). İstemci aynı değeri göndersin ki
            // gönderilen ile yazılan aynı olsun.
            subeSlug: subeSahibiMi ? (currentSubeSlug || '') : (subeler[0]?.slug || ''),
            role: subeSahibiMi ? 'calisan' : 'sube_sahibi',
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
        // Şube alanı artık native `select` değil (aranabilir seçici), yani
        // tarayıcının `required` doğrulaması devrede değil — elle kontrol.
        if (form.role !== 'admin' && !form.subeSlug) {
            toast.error('Şube seçin.');
            return;
        }
        if (!editingUser && form.password.length < EN_AZ_PAROLA) {
            toast.error(`Geçici parola en az ${EN_AZ_PAROLA} karakter olmalı.`);
            return;
        }
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
                // GEÇİCİ PAROLA: merkez belirler, kişi ilk girişte değiştirmek
                // zorunda kalır (bkz. ParolaDegistirKapisi).
                const yeniParola = form.password;
                const yeniEposta = form.email;
                await api.post('/users', {
                    email: yeniEposta,
                    password: yeniParola,
                    displayName: form.displayName,
                    subeSlug: form.subeSlug,
                    role: form.role,
                });
                closeModal();
                await loadData();
                setYeniKimlik({ baslik: 'Kullanıcı oluşturuldu', email: yeniEposta, parola: yeniParola });
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
        // ZORUNLU FORM KALKTI, YERİNE TUR VAR: bu düğme artık `onboarded`
        // bayrağını kaldırarak panel turunu geri getiriyor (bkz. HosGeldinTuru).
        const ok = await confirm(`${u.displayName || u.email} kullanıcısının panel tanıtım turu sıfırlansın mı? Bir sonraki girişinde tur baştan çıkar.`);
        if (!ok) return;
        try {
            await api.post(`/onboarding/reset/${u.uid}`);
            toast.success('Panel turu sıfırlandı');
            await loadData();   // düğme anında sönsün, ikinci kez basılmasın
        } catch (err) {
            console.error('Sıfırlama hatası:', err);
            toast.error(err.response?.data?.error || 'Sıfırlama başarısız');
        }
    }

    // Parola sıfırlama: sunucu yeni bir GEÇİCİ parola üretip yanıtta bir kez
    // döndürür. Ekranda gösterilir, yönetici kişiye iletir; kişi o parolayla
    // girer girmez kendi parolasını belirlemek zorunda kalır.
    async function handleParolaSifirla(u) {
        const ok = await confirm(
            `${u.displayName || u.email} kullanıcısına yeni bir geçici parola atansın mı? ` +
            'Mevcut parolası geçersiz olur. Yeni parola bir kez ekranda gösterilecek.'
        );
        if (!ok) return;
        try {
            const { data } = await api.put(`/users/${u.uid}`, { parolaSifirla: true });
            setYeniKimlik({ baslik: 'Yeni geçici parola', email: u.email, parola: data.geciciParola });
        } catch (err) {
            console.error('Parola sıfırlama hatası:', err);
            toast.error(err.response?.data?.error || 'Parola sıfırlanamadı');
        }
    }

    async function kopyala(metin) {
        try {
            await navigator.clipboard.writeText(metin);
            toast.success('Kopyalandı');
        } catch {
            toast.error('Kopyalanamadı, elle seçin');
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

    const isSubeSahibi = currentRole === 'sube_sahibi';

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
                                <TableHead>Son Erişim</TableHead>
                                {/* Yalnızca şube sahibinde: merkezin ağ geneli dökümü
                                    Akademi → Yönetim ekranında, burada tekrarı gereksiz. */}
                                {isSubeSahibi && <TableHead>Akademi</TableHead>}
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
                                        {u.lastSignIn ? (
                                            <span title={new Date(u.lastSignIn).toLocaleString('tr-TR')}>
                                                {sonErisimYazisi(u.lastSignIn)}
                                            </span>
                                        ) : '—'}
                                    </TableCell>
                                    {isSubeSahibi && (
                                        <TableCell>
                                            <AkademiHucresi
                                                ozet={akademi[u.uid]}
                                                onAc={() => setAkademiKisi(akademi[u.uid])}
                                            />
                                        </TableCell>
                                    )}
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
                                            {/* Form zaten sıfırsa (kişi henüz doldurmadı) düğme
                                                sönük: sıfırlanacak bir şey yok, tekrar basmak
                                                yalnızca kafa karıştırırdı. */}
                                            {!isSubeSahibi && u.role === 'sube_sahibi' && (
                                                // Başlık sarmalayıcı span'de: devre dışı düğme
                                                // pointer-events almadığı için kendi title'ı görünmüyor.
                                                <span title={u.onboarded
                                                    ? 'Panel tanıtım turunu sıfırla'
                                                    : 'Tur zaten sıfır — kullanıcı henüz görmedi'}>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-8"
                                                        disabled={!u.onboarded}
                                                        onClick={() => handleResetOnboarding(u)}
                                                    >
                                                        <RotateCcw className="size-3.5" />
                                                    </Button>
                                                </span>
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
                            <div className="space-y-1.5">
                                <Label>Geçici parola</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="text"
                                        className="font-mono"
                                        value={form.password}
                                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                                        required
                                        minLength={EN_AZ_PAROLA}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        title="Yeni parola üret"
                                        onClick={() => setForm({ ...form, password: geciciParolaUret() })}
                                    >
                                        <Shuffle className="size-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Kullanıcı bu parolayla girer, panele girer girmez kendi parolasını
                                    belirlemek zorunda kalır. En az {EN_AZ_PAROLA} karakter.
                                </p>
                            </div>
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
                                    <SubeSecici
                                        subeler={subeler}
                                        deger={form.subeSlug}
                                        yerTutucu="Seçiniz"
                                        onSec={(slug) => setForm({ ...form, subeSlug: slug })}
                                    />
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

            {/* Giriş bilgileri — parola BURADAN BAŞKA HİÇBİR YERDE görünmüyor:
                sunucu onu saklamıyor, yalnızca Auth'taki hash'i kalıyor. Pencere
                kapandıktan sonra kaybolursa yeniden sıfırlamak gerekir. */}
            <Dialog open={!!yeniKimlik} onOpenChange={(open) => !open && setYeniKimlik(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{yeniKimlik?.baslik || 'Giriş bilgileri'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Bu bilgileri kullanıcıya iletin. Parola yalnızca şimdi görünüyor;
                            pencereyi kapattıktan sonra bir daha gösterilemez. Kullanıcı panele
                            girer girmez kendi parolasını belirlemek zorunda kalacak.
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
                                    onClick={() => kopyala(yeniKimlik.email)}
                                >
                                    <Copy className="size-4" />
                                </Button>
                            </div>
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
                                    onClick={() => kopyala(yeniKimlik.parola)}
                                >
                                    <Copy className="size-4" />
                                </Button>
                            </div>
                        </div>
                        <Button
                            type="button"
                            variant="secondary"
                            className="w-full"
                            onClick={() => kopyala(`E-posta: ${yeniKimlik.email}\nGeçici parola: ${yeniKimlik.parola}`)}
                        >
                            <Copy className="mr-2 size-4" /> İkisini birden kopyala
                        </Button>
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

            {akademiKisi && (
                <CalisanAkademiModal
                    kisi={akademiKisi}
                    subeSlug={currentSubeSlug}
                    onKapat={() => setAkademiKisi(null)}
                />
            )}
        </div>
    );
}
