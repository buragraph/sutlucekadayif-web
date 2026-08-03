import { useState, useEffect } from 'react';
import api from '../../../services/api';
import { User, Store, ReceiptText, KeyRound, Pencil, Check } from 'lucide-react';
import {
    Card, CardHeader, CardTitle, CardDescription, CardContent,
} from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '../../../context/AuthContext';
import { toast } from 'sonner';
import ilIlceData from '../../../data/tr-iller-ilceler.json';

const ILLER = Object.keys(ilIlceData).sort((a, b) => a.localeCompare(b, 'tr'));

// Etiket + değer satırı (boşsa —) — salt okunur
function Alan({ label, value, className = '' }) {
    return (
        <div className={`flex flex-col gap-0.5 ${className}`}>
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-sm font-medium text-foreground">{value || '—'}</span>
        </div>
    );
}

// Düzenlenebilir alan — görüntülemede değer, düzenlemede input
function Field({ label, value, editing, onChange, className = '', placeholder }) {
    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            <span className="text-xs text-muted-foreground">{label}</span>
            {editing ? (
                <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9" />
            ) : (
                <span className="text-sm font-medium text-foreground py-0.5">{value || '—'}</span>
            )}
        </div>
    );
}

// Yükleme iskeleti — sayfa düzenini taklit eder
function ProfilIskelet() {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-4 w-56" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                {[0, 1, 2].map((i) => (
                    <Card key={i} className={i === 2 ? 'md:col-span-2' : ''}>
                        <CardHeader>
                            <Skeleton className="h-5 w-32" />
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <Skeleton className="h-9" />
                            <Skeleton className="h-9" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}

export default function ProfilePage() {
    const { parolaDegistir } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [resetBusy, setResetBusy] = useState(false);
    const [yeniParola, setYeniParola] = useState('');
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(null);

    // Parola doğrudan burada değiştirilir — e-posta/SMTP'ye bağlı bir akış yok.
    const handleResetPassword = async () => {
        if (yeniParola.length < 8) {
            toast.error('Parola en az 8 karakter olmalı.');
            return;
        }
        setResetBusy(true);
        try {
            await parolaDegistir(yeniParola);
            setYeniParola('');
            toast.success('Parolanız güncellendi.');
        } catch (err) {
            toast.error(err?.message || 'Parola güncellenemedi.');
        }
        setResetBusy(false);
    };

    async function loadProfil() {
        setLoading(true);
        try { const { data } = await api.get('/profil'); setData(data); }
        catch { setData(null); }
        setLoading(false);
    }

    useEffect(() => { loadProfil(); }, []);

    function startEdit() {
        setForm({
            ad_soyad: data.hesap.ad_soyad || '',
            telefon: data.hesap.telefon || '',
            magaza: data.magaza ? { ...data.magaza } : null,
            fatura: data.fatura ? { ...data.fatura } : null,
        });
        setEditing(true);
    }
    function cancelEdit() { setEditing(false); setForm(null); }

    async function saveEdit() {
        setSaving(true);
        try {
            const payload = { ad_soyad: form.ad_soyad, telefon: form.telefon };
            // Şube adı buradan değiştirilemez — yalnızca konum/adres gönderilir
            if (form.magaza) Object.assign(payload, { il: form.magaza.il, ilce: form.magaza.ilce, adres: form.magaza.adres });
            if (form.fatura) Object.assign(payload, { vkn: form.fatura.vkn, sirket_tipi: form.fatura.sirket_tipi, fatura_adresi: form.fatura.fatura_adresi });
            await api.put('/profil', payload);
            toast.success('Profil güncellendi');
            setEditing(false);
            setForm(null);
            await loadProfil();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Profil kaydedilemedi');
        }
        setSaving(false);
    }

    if (loading) return <ProfilIskelet />;

    if (!data) {
        return (
            <Alert variant="destructive">
                <AlertTitle>Profil yüklenemedi</AlertTitle>
                <AlertDescription>
                    Bilgiler alınırken bir sorun oluştu. Lütfen sayfayı yenileyin.
                </AlertDescription>
            </Alert>
        );
    }

    const { hesap, magaza, fatura } = data;
    const setM = (k, v) => setForm((f) => ({ ...f, magaza: { ...f.magaza, [k]: v } }));
    const setF = (k, v) => setForm((f) => ({ ...f, fatura: { ...f.fatura, [k]: v } }));

    return (
        <div className="flex flex-col gap-6">
            {/* Başlık */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl leading-none tracking-tight text-foreground">Profil</h1>
                    <p className="text-sm text-muted-foreground">Hesap ve mağaza bilgileriniz</p>
                </div>
                {editing ? (
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>İptal</Button>
                        <Button size="sm" onClick={saveEdit} disabled={saving}>
                            <Check className="size-4" /> {saving ? 'Kaydediliyor...' : 'Kaydet'}
                        </Button>
                    </div>
                ) : (
                    <Button variant="outline" size="sm" onClick={startEdit}>
                        <Pencil className="size-4" /> Düzenle
                    </Button>
                )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {/* Hesap */}
                <Card className={magaza ? '' : 'md:col-span-2'}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="size-4 text-muted-foreground" />
                            Hesap
                        </CardTitle>
                        <CardDescription>İletişim ve giriş bilgileriniz</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                        <Field label="Ad Soyad" editing={editing} value={editing ? form.ad_soyad : hesap.ad_soyad} onChange={(v) => setForm((f) => ({ ...f, ad_soyad: v }))} placeholder="Ad Soyad" />
                        <Field label="Telefon" editing={editing} value={editing ? form.telefon : hesap.telefon} onChange={(v) => setForm((f) => ({ ...f, telefon: v }))} placeholder="05XX XXX XX XX" />
                        <Alan label="E-posta" value={hesap.email} />
                        <div className="flex flex-col gap-1.5">
                            <span className="text-xs text-muted-foreground">Şifre</span>
                            {editing ? (
                                <>
                                    <div className="flex gap-2">
                                        <Input
                                            type="password"
                                            className="h-8 max-w-[220px]"
                                            placeholder="Yeni parola"
                                            autoComplete="new-password"
                                            value={yeniParola}
                                            onChange={(e) => setYeniParola(e.target.value)}
                                        />
                                        <Button variant="outline" size="sm" className="w-fit" onClick={handleResetPassword} disabled={resetBusy || !yeniParola}>
                                            <KeyRound className="size-3.5" /> {resetBusy ? 'Kaydediliyor...' : 'Değiştir'}
                                        </Button>
                                    </div>
                                    <span className="text-[11px] text-muted-foreground">En az 8 karakter. Değişiklik anında geçerli olur.</span>
                                </>
                            ) : (
                                <span className="text-sm font-medium text-foreground tracking-[0.2em]">••••••••</span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Mağaza — yalnızca şubesi olan kullanıcılarda */}
                {magaza && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Store className="size-4 text-muted-foreground" />
                                Mağaza
                            </CardTitle>
                            <CardDescription>Şubenizin konum bilgileri</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <Alan label="Şube" value={magaza.ad} className={editing ? 'sm:col-span-2' : ''} />
                            {editing ? (
                                <>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-muted-foreground">İl</span>
                                        <Select value={form.magaza.il || ''} onValueChange={(v) => setForm((f) => ({ ...f, magaza: { ...f.magaza, il: v, ilce: '' } }))}>
                                            <SelectTrigger className="h-9 w-full"><SelectValue placeholder="İl seçin" /></SelectTrigger>
                                            <SelectContent>{ILLER.map((il) => <SelectItem key={il} value={il}>{il}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-muted-foreground">İlçe</span>
                                        <Select value={form.magaza.ilce || ''} onValueChange={(v) => setM('ilce', v)} disabled={!form.magaza.il}>
                                            <SelectTrigger className="h-9 w-full"><SelectValue placeholder={form.magaza.il ? 'İlçe seçin' : 'Önce il seçin'} /></SelectTrigger>
                                            <SelectContent>{(ilIlceData[form.magaza.il] || []).map((ilce) => <SelectItem key={ilce} value={ilce}>{ilce}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                </>
                            ) : (
                                <Alan label="İl / İlçe" value={[magaza.il, magaza.ilce].filter(Boolean).join(' / ')} />
                            )}
                            <Field label="Adres" editing={editing} value={editing ? form.magaza.adres : magaza.adres} onChange={(v) => setM('adres', v)} className="sm:col-span-2" placeholder="Açık adres" />
                        </CardContent>
                    </Card>
                )}

                {/* Fatura & Vergi — yalnızca şubesi olan kullanıcılarda */}
                {fatura && (
                    <Card className="md:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ReceiptText className="size-4 text-muted-foreground" />
                                Fatura & Vergi
                            </CardTitle>
                            <CardDescription>Faturalandırma ve vergi bilgileri</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-3">
                            <Field label="Vergi No (VKN)" editing={editing} value={editing ? form.fatura.vkn : fatura.vkn} onChange={(v) => setF('vkn', v)} placeholder="VKN / TCKN" />
                            <Field label="Şirket Tipi" editing={editing} value={editing ? form.fatura.sirket_tipi : fatura.sirket_tipi} onChange={(v) => setF('sirket_tipi', v)} placeholder="Şahıs / Limited..." />
                            <Field label="Fatura Adresi" editing={editing} value={editing ? form.fatura.fatura_adresi : fatura.fatura_adresi} onChange={(v) => setF('fatura_adresi', v)} className="sm:col-span-3" placeholder="Fatura adresi" />
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
