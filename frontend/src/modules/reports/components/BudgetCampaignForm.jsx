import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus, Trash2, Loader2, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import api from '../../../services/api';

// Bir bakiye seçeneğinin tüm bileşenleri.
// Meta reklam harcamasının üzerinden %5 KONUM ÜCRETİ alıyor; KDV bu ücret DAHİL
// matrah üzerinden hesaplanır. Örnek: 15.000 bakiye → 750 konum → 15.750 matrah
// → %14 KDV 2.205 → şubeden tahsil edilen toplam 17.955.
function secenekHesapla(bakiye, konumOrani, kdvOrani) {
    const b = Number(bakiye) || 0;
    const konum = Math.round(b * (Number(konumOrani) || 0) / 100);
    const matrah = b + konum;
    const kdv = Math.round(matrah * (Number(kdvOrani) || 0) / 100);
    return { bakiye: b, konum_ucreti: konum, kdv, kdv_dahil: matrah + kdv };
}

// Varsayılan bakiye seçenekleri — konum ücreti ve KDV formdaki oranlardan hesaplanır
const DEFAULT_BAKIYE_OPTIONS = [
    { bakiye: 15000 },
    { bakiye: 20000 },
    { bakiye: 25000 },
    { bakiye: 30000 },
    { bakiye: 35000 },
    { bakiye: 40000 },
    { bakiye: 45000 },
    { bakiye: 50000 },
    { bakiye: 55000 },
    { bakiye: 60000 },
    { bakiye: 65000 },
    { bakiye: 70000 },
];

export default function BudgetCampaignForm({ onCancel, onSuccess, editKampanya = null }) {
    const isEdit = !!editKampanya;
    const [loading, setLoading] = useState(false);
    const [baslik, setBaslik] = useState(editKampanya?.baslik || '');
    const [donemBaslangic, setDonemBaslangic] = useState(editKampanya?.donem_baslangic ? new Date(editKampanya.donem_baslangic) : null);
    const [donemBitis, setDonemBitis] = useState(editKampanya?.donem_bitis ? new Date(editKampanya.donem_bitis) : null);
    const [sonTarih, setSonTarih] = useState(editKampanya?.son_tarih ? new Date(editKampanya.son_tarih) : null);
    const [aliciAdi, setAliciAdi] = useState(editKampanya?.alici_adi || '');
    const [iban, setIban] = useState(editKampanya?.iban || '');
    const [odemeNotu, setOdemeNotu] = useState(editKampanya?.odeme_notu || '');
    const [konumOrani, setKonumOrani] = useState(() => {
        const o = editKampanya?.bakiye_secenekleri?.[0];
        return (o && o.bakiye && o.konum_ucreti) ? Math.round((o.konum_ucreti / o.bakiye) * 100) : 5;
    });
    const [kdvOrani, setKdvOrani] = useState(() => {
        const o = editKampanya?.bakiye_secenekleri?.[0];
        if (!o || !o.bakiye) return 20;
        // Yeni kayıtlar KDV'yi ayrı tutuyor; eskilerde yalnızca kdv_dahil var ve
        // konum ücreti hiç alınmamış — oran doğrudan bakiyeye göre çözülür.
        const matrah = o.bakiye + (o.konum_ucreti || 0);
        if (o.kdv && matrah) return Math.round((o.kdv / matrah) * 100);
        return o.kdv_dahil ? Math.round((o.kdv_dahil / o.bakiye - 1) * 100) : 20;
    });
    const [bakiyeSecenekleri, setBakiyeSecenekleri] = useState(
        editKampanya?.bakiye_secenekleri?.length
            ? editKampanya.bakiye_secenekleri.map((o) => ({ bakiye: o.bakiye }))
            : DEFAULT_BAKIYE_OPTIONS.map((o) => ({ bakiye: o.bakiye }))
    );

    const handleAddRow = () => {
        setBakiyeSecenekleri([...bakiyeSecenekleri, { bakiye: '' }]);
    };

    const handleRemoveRow = (index) => {
        setBakiyeSecenekleri(bakiyeSecenekleri.filter((_, i) => i !== index));
    };

    const handleRowChange = (index, field, value) => {
        const updated = [...bakiyeSecenekleri];
        updated[index] = { ...updated[index], [field]: value };
        setBakiyeSecenekleri(updated);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!baslik.trim()) return toast.error('Başlık gerekli.');
        if (!donemBaslangic || !donemBitis) return toast.error('Dönem tarihleri gerekli.');
        if (!sonTarih) return toast.error('Son tarih gerekli.');
        if (bakiyeSecenekleri.length === 0) return toast.error('En az bir bakiye seçeneği ekleyin.');

        const invalidRows = bakiyeSecenekleri.some(
            (r) => !r.bakiye || Number(r.bakiye) <= 0
        );
        if (invalidRows) return toast.error('Tüm bakiye seçeneklerini doldurun.');

        // KDV oranı boş bırakılırsa Number('') = 0 olur ve KDV dahil tutar
        // bakiyeyle aynı kaydedilirdi — geçerli pozitif oran zorunlu
        const oran = Number(kdvOrani);
        if (!Number.isFinite(oran) || oran <= 0) return toast.error('Geçerli bir KDV oranı girin (ör. 20).');

        const konumOran = Number(konumOrani);
        if (!Number.isFinite(konumOran) || konumOran < 0) {
            return toast.error('Geçerli bir konum ücreti oranı girin (ör. 5).');
        }
        const bakiyeListe = bakiyeSecenekleri.map((r) => secenekHesapla(r.bakiye, konumOran, oran));

        setLoading(true);
        try {
            if (isEdit) {
                // Dönem (donem_baslangic/bitis) kampanya kimliği — değiştirilmez.
                await api.put(`/reports/butce-kampanya/${editKampanya.id}`, {
                    baslik: baslik.trim(),
                    son_tarih: format(sonTarih, 'yyyy-MM-dd'),
                    alici_adi: aliciAdi.trim(),
                    iban: iban.trim(),
                    odeme_notu: odemeNotu.trim(),
                    bakiye_secenekleri: bakiyeListe,
                });
                toast.success('Kampanya güncellendi.');
            } else {
                await api.post('/reports/butce-kampanya', {
                    baslik: baslik.trim(),
                    donem_baslangic: format(donemBaslangic, 'yyyy-MM-dd'),
                    donem_bitis: format(donemBitis, 'yyyy-MM-dd'),
                    son_tarih: format(sonTarih, 'yyyy-MM-dd'),
                    alici_adi: aliciAdi.trim(),
                    iban: iban.trim(),
                    odeme_notu: odemeNotu.trim(),
                    bakiye_secenekleri: bakiyeListe,
                });
                toast.success('Kampanya oluşturuldu.');
            }
            onSuccess?.();
        } catch (err) {
            toast.error(err.response?.data?.error || (isEdit ? 'Kampanya güncellenemedi.' : 'Kampanya oluşturulamadı.'));
        } finally {
            setLoading(false);
        }
    };

    const DatePickerField = ({ label, value, onChange, disabled = false }) => (
        <div className="space-y-1.5">
            <Label className="text-sm">{label}</Label>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        disabled={disabled}
                        className={cn(
                            'w-full justify-start text-left font-normal',
                            !value && 'text-muted-foreground'
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {value ? format(value, 'd MMMM yyyy', { locale: tr }) : 'Tarih seçin'}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="single"
                        selected={value}
                        onSelect={onChange}
                        initialFocus
                        locale={tr}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );

    const formatCurrency = (val) => new Intl.NumberFormat('tr-TR').format(val);

    return (
        <>
            {/* Header */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="shrink-0" onClick={onCancel}>
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                    <h1 className="text-3xl leading-none tracking-tight text-foreground">
                        {isEdit ? 'Kampanyayı Düzenle' : 'Yeni Kampanya'}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {isEdit ? 'Kampanya bilgilerini güncelleyin.' : 'Şubelere gönderilecek bütçe kampanyasını oluşturun.'}
                    </p>
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Başlık */}
                        <div className="space-y-1.5">
                            <Label htmlFor="baslik">Başlık *</Label>
                            <Input
                                id="baslik"
                                value={baslik}
                                onChange={(e) => setBaslik(e.target.value)}
                                placeholder="Örn: Haziran 2025 Bütçe Toplama"
                            />
                        </div>

                        {/* Dönem Tarihleri */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <DatePickerField label="Dönem Başlangıç *" value={donemBaslangic} onChange={setDonemBaslangic} disabled={isEdit} />
                            <DatePickerField label="Dönem Bitiş *" value={donemBitis} onChange={setDonemBitis} disabled={isEdit} />
                            <DatePickerField label="Son Tarih *" value={sonTarih} onChange={setSonTarih} />
                        </div>
                        {isEdit && <p className="text-xs text-muted-foreground -mt-2">Dönem tarihleri kampanya kimliğidir, değiştirilemez.</p>}

                        {/* IBAN & Alıcı Adı */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="aliciAdi">Alıcı Adı Soyadı / Ünvan</Label>
                                <Input
                                    id="aliciAdi"
                                    value={aliciAdi}
                                    onChange={(e) => setAliciAdi(e.target.value)}
                                    placeholder="Örn: Sütlüce Kadayıf A.Ş."
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="iban">IBAN</Label>
                                <Input
                                    id="iban"
                                    value={iban}
                                    onChange={(e) => setIban(e.target.value)}
                                    placeholder="TR00 0000 0000 0000 0000 0000 00"
                                />
                            </div>
                        </div>

                        {/* Ödeme Notu */}
                        <div className="space-y-1.5">
                            <Label htmlFor="odemeNotu">Ödeme Notu</Label>
                            <textarea
                                id="odemeNotu"
                                value={odemeNotu}
                                onChange={(e) => setOdemeNotu(e.target.value)}
                                placeholder="Ödeme açıklaması..."
                                rows={3}
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            />
                        </div>

                        {/* Bakiye Seçenekleri */}
                        <div className="space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-4">
                                    <Label>Bakiye Seçenekleri</Label>
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="konumOrani" className="text-muted-foreground whitespace-nowrap text-xs">Konum Ücreti (%)</Label>
                                        <Input
                                            id="konumOrani"
                                            type="number"
                                            className="w-16 h-8"
                                            value={konumOrani}
                                            onChange={(e) => setKonumOrani(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="kdvOrani" className="text-muted-foreground whitespace-nowrap text-xs">KDV Oranı (%)</Label>
                                        <Input 
                                            id="kdvOrani"
                                            type="number" 
                                            className="w-16 h-8" 
                                            value={kdvOrani} 
                                            onChange={(e) => setKdvOrani(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={handleAddRow} className="shrink-0 w-full sm:w-auto">
                                    <Plus className="w-4 h-4 mr-1" /> Ekle
                                </Button>
                            </div>

                            <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_1fr_2.25rem] gap-2 px-1 text-[11px] font-medium text-muted-foreground">
                                <span>Reklam Bakiyesi</span>
                                <span>Konum Ücreti (%{Number(konumOrani) || 0})</span>
                                <span>KDV (%{Number(kdvOrani) || 0})</span>
                                <span>Şubeden Tahsil (KDV Dahil)</span>
                                <span />
                            </div>

                            <div className="space-y-2 max-h-80 overflow-y-auto p-1">
                                {bakiyeSecenekleri.map((row, i) => {
                                    const h = secenekHesapla(row.bakiye, konumOrani, kdvOrani);
                                    const dolu = h.bakiye > 0;
                                    return (
                                    <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_1fr_2.25rem] gap-2">
                                        <div className="relative focus-within:z-10 hover:z-10">
                                            <Input
                                                type="text"
                                                placeholder="Bakiye"
                                                value={row.bakiye ? formatCurrency(row.bakiye) : ''}
                                                onChange={(e) => {
                                                    const raw = e.target.value.replace(/\D/g, '');
                                                    handleRowChange(i, 'bakiye', raw);
                                                }}
                                            />
                                        </div>
                                        <Input
                                            type="text"
                                            disabled
                                            value={dolu ? formatCurrency(h.konum_ucreti) + ' ₺' : ''}
                                            placeholder="Konum (Oto)"
                                            className="bg-muted/50 cursor-not-allowed text-muted-foreground"
                                        />
                                        <Input
                                            type="text"
                                            disabled
                                            value={dolu ? formatCurrency(h.kdv) + ' ₺' : ''}
                                            placeholder="KDV (Oto)"
                                            className="bg-muted/50 cursor-not-allowed text-muted-foreground"
                                        />
                                        <Input
                                            type="text"
                                            disabled
                                            value={dolu ? formatCurrency(h.kdv_dahil) + ' ₺' : ''}
                                            placeholder="Toplam (Oto)"
                                            className="bg-muted/50 cursor-not-allowed font-medium"
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="shrink-0 text-muted-foreground hover:text-destructive"
                                            onClick={() => handleRemoveRow(i)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                );
                                })}
                            </div>

                            {bakiyeSecenekleri.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    {bakiyeSecenekleri.length} seçenek ·{' '}
                                    {formatCurrency(Math.min(...bakiyeSecenekleri.map((r) => Number(r.bakiye) || 0)))} ₺ -{' '}
                                    {formatCurrency(Math.max(...bakiyeSecenekleri.map((r) => Number(r.bakiye) || 0)))} ₺
                                </p>
                            )}
                        </div>

                        {/* Buttons */}
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
                                İptal
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                {isEdit ? 'Güncelle' : 'Oluştur'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </>
    );
}
