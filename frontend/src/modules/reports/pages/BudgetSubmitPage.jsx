import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Loader2, Upload, CheckCircle2, Copy, Wallet, FileText, AlertCircle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import api from '../../../services/api';

const fmtCurrency = (val) => new Intl.NumberFormat('tr-TR').format(val) + ' ₺';
const fmtDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
        return format(parseISO(dateStr), 'd MMMM yyyy', { locale: tr });
    } catch {
        return dateStr;
    }
};

export default function BudgetSubmitPage() {
    const [loading, setLoading] = useState(true);
    const [kampanya, setKampanya] = useState(null);
    const [mevcutBildirim, setMevcutBildirim] = useState(null);

    const [selectedBakiye, setSelectedBakiye] = useState(null);
    const [dekontFile, setDekontFile] = useState(null);
    const [notlar, setNotlar] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const fetchPending = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/reports/butce-bekleyen');
            const kampanyalar = data.kampanyalar || [];
            if (kampanyalar.length > 0) {
                const first = kampanyalar[0];
                setKampanya(first);
                const yanit = first.yanit || null;
                setMevcutBildirim(yanit);
                if (yanit && yanit.durum !== 'bekliyor') {
                    setSubmitted(true);
                }
            } else {
                setKampanya(null);
            }
        } catch (err) {
            // 404 = no pending campaign
            if (err.response?.status !== 404) {
                toast.error('Bilgi yüklenemedi.');
            }
            setKampanya(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPending();
    }, []);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
        if (!allowedTypes.includes(file.type)) {
            toast.error('Sadece PDF, JPG ve PNG dosyaları kabul edilir.');
            e.target.value = '';
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Dosya boyutu en fazla 5 MB olabilir.');
            e.target.value = '';
            return;
        }
        setDekontFile(file);
    };

    const handleCopyIban = async () => {
        if (!kampanya?.iban) return;
        try {
            await navigator.clipboard.writeText(kampanya.iban);
            toast.success('IBAN kopyalandı.');
        } catch {
            toast.error('IBAN kopyalanamadı.');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedBakiye) return toast.error('Bir bakiye seçeneği seçin.');

        const option = kampanya.bakiye_secenekleri.find(
            (o) => Number(o.bakiye) === Number(selectedBakiye)
        );
        if (!option) return toast.error('Geçersiz bakiye seçeneği.');

        setSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('secilen_bakiye', option.bakiye);
            formData.append('kdv_dahil_tutar', option.kdv_dahil);
            formData.append('notlar', notlar);
            if (dekontFile) formData.append('dekont', dekontFile);

            await api.post(`/reports/butce-gonder/${kampanya.id}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            toast.success('Bütçe bildirimi gönderildi.');
            setMevcutBildirim({
                secilen_bakiye: option.bakiye,
                kdv_dahil_tutar: option.kdv_dahil,
                durum: 'gonderildi',
            });
            setSubmitted(true);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Bildirim gönderilemedi.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!kampanya) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground max-w-md mx-auto text-center">
                <Wallet className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-lg font-medium">Bekleyen bütçe bildirimi yok</p>
                <p className="text-sm mt-1">
                    Şu anda aktif bir bütçe kampanyası bulunmuyor. Yeni bir kampanya açıldığında burada görüntülenecektir.
                </p>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="flex flex-col items-center justify-center py-20 max-w-md mx-auto text-center">
                <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-4 mb-4">
                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                </div>
                <h2 className="text-xl font-semibold">Bildiriminiz Alındı</h2>
                <p className="text-sm text-muted-foreground mt-2">
                    Bütçe bildirimi başarıyla gönderildi. Onaylandığında bilgilendirileceksiniz.
                </p>
                {mevcutBildirim && (
                    <Card className="mt-6 w-full text-left">
                        <CardContent className="pt-5 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Seçilen Bakiye</span>
                                <span className="font-medium">{fmtCurrency(mevcutBildirim.secilen_bakiye)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">KDV Dahil</span>
                                <span className="font-medium">{fmtCurrency(mevcutBildirim.kdv_dahil_tutar)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Durum</span>
                                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs">
                                    Gönderildi
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Bütçe Bildirim</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Aktif kampanya için bütçe bildirimi yapın.
                </p>
            </div>

            {/* Campaign Info */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">{kampanya.baslik}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                    <p>Dönem: {fmtDate(kampanya.donem_baslangic)} – {fmtDate(kampanya.donem_bitis)}</p>
                    <p>Son Tarih: {fmtDate(kampanya.son_tarih)}</p>
                </CardContent>
            </Card>

            {/* Ödeme Bilgisi */}
            {(kampanya.iban || kampanya.odeme_notu) && (
                <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-600" />
                            Ödeme Bilgisi
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {kampanya.iban && (
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">IBAN:</span>
                                <code className="text-xs bg-background px-2 py-1 rounded border font-mono flex-1 truncate">
                                    {kampanya.iban}
                                </code>
                                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCopyIban}>
                                    <Copy className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        )}
                        {kampanya.odeme_notu && (
                            <p className="text-sm text-muted-foreground">{kampanya.odeme_notu}</p>
                        )}
                    </CardContent>
                </Card>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Bakiye Seçenekleri */}
                <div className="space-y-3">
                    <Label className="text-sm font-medium">Bakiye Seçeneği *</Label>
                    <Card>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12"></TableHead>
                                        <TableHead className="text-right">Bakiye</TableHead>
                                        <TableHead className="text-right">KDV Dahil</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(kampanya.bakiye_secenekleri || []).map((opt, i) => {
                                        const isSelected = Number(selectedBakiye) === Number(opt.bakiye);
                                        return (
                                            <TableRow
                                                key={i}
                                                className={cn(
                                                    'cursor-pointer transition-colors',
                                                    isSelected && 'bg-primary/5 dark:bg-primary/10'
                                                )}
                                                onClick={() => setSelectedBakiye(opt.bakiye)}
                                            >
                                                <TableCell>
                                                    <div
                                                        className={cn(
                                                            'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                                                            isSelected
                                                                ? 'border-primary'
                                                                : 'border-muted-foreground/30'
                                                        )}
                                                    >
                                                        {isSelected && (
                                                            <div className="w-2 h-2 rounded-full bg-primary" />
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-medium">
                                                    {fmtCurrency(opt.bakiye)}
                                                </TableCell>
                                                <TableCell className="text-right text-muted-foreground">
                                                    {fmtCurrency(opt.kdv_dahil)}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                {/* Dekont Yükleme */}
                <div className="space-y-2">
                    <Label className="text-sm font-medium">Dekont Yükleme</Label>
                    <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                        <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={handleFileChange}
                            className="hidden"
                            id="dekont-upload"
                        />
                        <label htmlFor="dekont-upload" className="cursor-pointer space-y-2">
                            <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                            {dekontFile ? (
                                <p className="text-sm font-medium text-foreground">{dekontFile.name}</p>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    Dekont dosyasını yüklemek için tıklayın
                                </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                PDF, JPG, PNG · Maks 5 MB
                            </p>
                        </label>
                    </div>
                </div>

                {/* Notlar */}
                <div className="space-y-2">
                    <Label htmlFor="notlar" className="text-sm font-medium">Notlar</Label>
                    <textarea
                        id="notlar"
                        value={notlar}
                        onChange={(e) => setNotlar(e.target.value)}
                        placeholder="Eklemek istediğiniz notları yazın..."
                        rows={3}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                </div>

                {/* Submit */}
                <div className="flex items-center gap-3">
                    <Button type="submit" disabled={submitting || !selectedBakiye} className="min-w-[120px]">
                        {submitting ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                        )}
                        Gönder
                    </Button>
                    {!selectedBakiye && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Bir bakiye seçeneği seçin
                        </p>
                    )}
                </div>
            </form>
        </div>
    );
}
