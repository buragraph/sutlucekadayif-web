import { useState, useEffect } from 'react';
import api from '../../../services/api';
import { Plus, Pencil, Trash2, X, MapPin, FileText } from 'lucide-react';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import illerIlceler from '@/data/tr-iller-ilceler.json';

const IL_LISTESI = Object.keys(illerIlceler);

export default function BranchesPage() {
    const toast = useToast();
    const confirm = useConfirm();
    const [subeler, setSubeler] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ slug: '', ad: '', adres: '', telefon: '', yetkili_adi: '', fatura_adresi: '', vkn: '', sirket_tipi: '' });

    useEffect(() => { loadSubeler(); }, []);

    async function loadSubeler() {
        setLoading(true);
        try { const { data } = await api.get('/branches'); setSubeler(data.subeler); }
        catch (err) { console.error('Şubeler yüklenemedi:', err); }
        setLoading(false);
    }

    function openAdd() {
        setEditing(null);
        setForm({ slug: '', ad: '', adres: '', telefon: '', yetkili_adi: '', fatura_adresi: '', vkn: '', sirket_tipi: '', il: '', ilce: '' });
        setShowModal(true);
    }

    function openEdit(sube) {
        setEditing(sube);
        setForm({
            slug: sube.slug,
            ad: sube.ad,
            adres: sube.adres || '',
            telefon: sube.telefon || '',
            yetkili_adi: sube.yetkili_adi || '',
            fatura_adresi: sube.fatura_adresi || '',
            vkn: sube.vkn || '',
            sirket_tipi: sube.sirket_tipi || '',
            il: sube.il || '',
            ilce: sube.ilce || '',
        });
        setShowModal(true);
    }

    function closeModal() { setShowModal(false); setEditing(null); }

    async function handleSubmit(e) {
        e.preventDefault();
        setSaving(true);
        try {
            if (editing) {
                await api.put(`/branches/${editing.slug}`, {
                    ad: form.ad,
                    adres: form.adres,
                    telefon: form.telefon,
                    yetkili_adi: form.yetkili_adi,
                    fatura_adresi: form.fatura_adresi,
                    vkn: form.vkn,
                    sirket_tipi: form.sirket_tipi,
                    il: form.il,
                    ilce: form.ilce,
                });
            } else {
                await api.post('/branches', form);
            }
            closeModal();
            await loadSubeler();
            toast.success(editing ? 'Şube güncellendi' : 'Şube oluşturuldu');
        } catch (err) { toast.error(err.response?.data?.error || 'Bir hata oluştu'); }
        setSaving(false);
    }

    async function handleDelete(sube) {
        const ok = await confirm(`"${sube.ad}" şubesini silmek istediğinize emin misiniz?`);
        if (!ok) return;
        try { await api.delete(`/branches/${sube.slug}`); await loadSubeler(); toast.success('Şube silindi'); }
        catch (err) { toast.error(err.response?.data?.error || 'Silme işlemi başarısız'); }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl leading-none tracking-tight">Şubeler</h1>
                <Button onClick={openAdd}><Plus className="size-4" /> Şube Ekle</Button>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16"><Spinner className="size-8" /><p className="text-sm text-muted-foreground">Şubeler yükleniyor...</p></div>
            ) : subeler.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground"><span className="text-4xl">🏪</span><p>Henüz şube yok</p></div>
            ) : (
                <div className="rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Slug</TableHead>
                                <TableHead>Şube Adı</TableHead>
                                <TableHead>Adres</TableHead>
                                <TableHead>Telefon</TableHead>
                                <TableHead>Ürün Sayısı</TableHead>
                                <TableHead>Fatura</TableHead>
                                <TableHead className="w-24">İşlemler</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {subeler.map((sube) => (
                                <TableRow key={sube.slug}>
                                    <TableCell><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{sube.slug}</code></TableCell>
                                    <TableCell className="font-medium">{sube.ad}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{sube.adres || '—'}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{sube.telefon || '—'}</TableCell>
                                    <TableCell><Badge variant="secondary">{sube.urunSayisi || 0}</Badge></TableCell>
                                    <TableCell>
                                        {sube.vkn && sube.fatura_adresi
                                            ? <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">Tamam</Badge>
                                            : <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">Eksik</Badge>
                                        }
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex gap-1">
                                            <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(sube)} title="Düzenle"><Pencil className="size-3.5" /></Button>
                                            <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => handleDelete(sube)} title="Sil"><Trash2 className="size-3.5" /></Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            <Dialog open={showModal} onOpenChange={(open) => !open && closeModal()}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Şube Düzenle' : 'Yeni Şube'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label>Slug (URL)</Label>
                            <Input type="text" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="örn: ankara" required disabled={!!editing} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Şube Adı</Label>
                            <Input type="text" value={form.ad} onChange={(e) => setForm({ ...form, ad: e.target.value })} placeholder="örn: Ankara Şubesi" required autoFocus />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>İl</Label>
                                <Select value={form.il} onValueChange={(val) => setForm({ ...form, il: val, ilce: '' })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="İl seçiniz" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-72">
                                        {IL_LISTESI.map((il) => (
                                            <SelectItem key={il} value={il}>{il}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>İlçe</Label>
                                <Select value={form.ilce} onValueChange={(val) => setForm({ ...form, ilce: val })} disabled={!form.il}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={form.il ? 'İlçe seçiniz' : 'Önce il seçin'} />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-72">
                                        {(illerIlceler[form.il] || []).map((ilce) => (
                                            <SelectItem key={ilce} value={ilce}>{ilce}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Adres</Label>
                            <Input type="text" value={form.adres} onChange={(e) => setForm({ ...form, adres: e.target.value })} placeholder="Açık adres (opsiyonel)" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Telefon</Label>
                            <Input type="text" value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} placeholder="Şube telefonu (opsiyonel)" />
                        </div>

                        {/* Fatura Bilgileri */}
                        <div className="border-t pt-4 mt-2">
                            <div className="flex items-center gap-2 mb-3">
                                <FileText className="size-4 text-muted-foreground" />
                                <span className="text-sm font-semibold text-muted-foreground">Fatura Bilgileri</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Yetkili Adı</Label>
                                    <Input type="text" value={form.yetkili_adi} onChange={(e) => setForm({ ...form, yetkili_adi: e.target.value })} placeholder="İsim Soyisim" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>VKN</Label>
                                    <Input type="text" value={form.vkn} onChange={(e) => setForm({ ...form, vkn: e.target.value })} placeholder="Vergi Kimlik No" />
                                </div>
                                <div className="space-y-1.5 col-span-2">
                                    <Label>Fatura Adresi</Label>
                                    <Input type="text" value={form.fatura_adresi} onChange={(e) => setForm({ ...form, fatura_adresi: e.target.value })} placeholder="Fatura adresi" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Şirket Tipi</Label>
                                    <Select value={form.sirket_tipi} onValueChange={(val) => setForm({ ...form, sirket_tipi: val })}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seçiniz" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="sahis">Şahıs</SelectItem>
                                            <SelectItem value="ltd">Ltd. Şti.</SelectItem>
                                            <SelectItem value="as">A.Ş.</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={closeModal}>İptal</Button>
                            <Button type="submit" disabled={saving}>{saving ? 'Kaydediliyor...' : editing ? 'Güncelle' : 'Oluştur'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
