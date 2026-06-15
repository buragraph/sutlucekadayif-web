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

const DEFAULT_BAKIYE_OPTIONS = [
    { bakiye: 15000, kdv_dahil: 17100 },
    { bakiye: 20000, kdv_dahil: 22800 },
    { bakiye: 25000, kdv_dahil: 28500 },
    { bakiye: 30000, kdv_dahil: 34200 },
    { bakiye: 35000, kdv_dahil: 39900 },
    { bakiye: 40000, kdv_dahil: 45600 },
    { bakiye: 45000, kdv_dahil: 51300 },
    { bakiye: 50000, kdv_dahil: 57000 },
    { bakiye: 55000, kdv_dahil: 62700 },
    { bakiye: 60000, kdv_dahil: 68400 },
    { bakiye: 65000, kdv_dahil: 74100 },
    { bakiye: 70000, kdv_dahil: 79800 },
];

export default function BudgetCampaignForm({ onCancel, onSuccess }) {
    const [loading, setLoading] = useState(false);
    const [baslik, setBaslik] = useState('');
    const [donemBaslangic, setDonemBaslangic] = useState(null);
    const [donemBitis, setDonemBitis] = useState(null);
    const [sonTarih, setSonTarih] = useState(null);
    const [aliciAdi, setAliciAdi] = useState('');
    const [iban, setIban] = useState('');
    const [odemeNotu, setOdemeNotu] = useState('');
    const [kdvOrani, setKdvOrani] = useState(20);
    const [bakiyeSecenekleri, setBakiyeSecenekleri] = useState(
        DEFAULT_BAKIYE_OPTIONS.map((o) => ({ bakiye: o.bakiye }))
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

        setLoading(true);
        try {
            await api.post('/reports/butce-kampanya', {
                baslik: baslik.trim(),
                donem_baslangic: format(donemBaslangic, 'yyyy-MM-dd'),
                donem_bitis: format(donemBitis, 'yyyy-MM-dd'),
                son_tarih: format(sonTarih, 'yyyy-MM-dd'),
                alici_adi: aliciAdi.trim(),
                iban: iban.trim(),
                odeme_notu: odemeNotu.trim(),
                bakiye_secenekleri: bakiyeSecenekleri.map((r) => {
                    const b = Number(r.bakiye);
                    return {
                        bakiye: b,
                        kdv_dahil: Math.round(b * (1 + Number(kdvOrani) / 100)),
                    };
                }),
            });
            toast.success('Kampanya oluşturuldu.');
            onSuccess?.();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Kampanya oluşturulamadı.');
        } finally {
            setLoading(false);
        }
    };

    const DatePickerField = ({ label, value, onChange }) => (
        <div className="space-y-1.5">
            <Label className="text-sm">{label}</Label>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
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
                        Yeni Kampanya
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Şubelere gönderilecek bütçe kampanyasını oluşturun.
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
                            <DatePickerField label="Dönem Başlangıç *" value={donemBaslangic} onChange={setDonemBaslangic} />
                            <DatePickerField label="Dönem Bitiş *" value={donemBitis} onChange={setDonemBitis} />
                            <DatePickerField label="Son Tarih *" value={sonTarih} onChange={setSonTarih} />
                        </div>

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
                                        <Label htmlFor="kdvOrani" className="text-muted-foreground whitespace-nowrap text-xs">KDV Oranı (%)</Label>
                                        <Input 
                                            id="kdvOrani"
                                            type="number" 
                                            className="w-20 h-8" 
                                            value={kdvOrani} 
                                            onChange={(e) => setKdvOrani(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={handleAddRow} className="shrink-0 w-full sm:w-auto">
                                    <Plus className="w-4 h-4 mr-1" /> Ekle
                                </Button>
                            </div>

                            <div className="space-y-2 max-h-80 overflow-y-auto p-1">
                                {bakiyeSecenekleri.map((row, i) => {
                                    const b = Number(row.bakiye) || 0;
                                    const kdvli = Math.round(b * (1 + Number(kdvOrani) / 100));
                                    return (
                                    <div key={i} className="flex items-center gap-2">
                                        <div className="flex-1 relative focus-within:z-10 hover:z-10">
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
                                        <div className="flex-1 relative">
                                            <Input
                                                type="text"
                                                disabled
                                                value={b ? formatCurrency(kdvli) + ' ₺' : ''}
                                                placeholder="KDV Dahil (Oto)"
                                                className="bg-muted/50 cursor-not-allowed text-muted-foreground"
                                            />
                                        </div>
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
                                Oluştur
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </>
    );
}
