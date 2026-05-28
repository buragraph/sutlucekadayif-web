import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    ArrowLeft, Plus, Loader2, Trash2, CheckCircle2,
    Clock, Users, Wallet, FileText, ExternalLink,
} from 'lucide-react';
import { format, differenceInDays, isPast, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useConfirm } from '../../../shared/components/Toast';
import api from '../../../services/api';
import BudgetCampaignForm from '../components/BudgetCampaignForm';

const fmtCurrency = (val) => new Intl.NumberFormat('tr-TR').format(val) + ' ₺';
const fmtDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
        return format(parseISO(dateStr), 'd MMM yyyy', { locale: tr });
    } catch {
        return dateStr;
    }
};

const statusConfig = {
    aktif: { label: 'Aktif', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
    tamamlandi: { label: 'Tamamlandı', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
};

const bildirimDurumConfig = {
    bekliyor: { label: 'Bekliyor', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
    gonderildi: { label: 'Gönderildi', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    onaylandi: { label: 'Onaylandı', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
};

export default function BudgetCampaignsPage() {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailData, setDetailData] = useState(null);
    const [modalOpen, setModalOpen] = useState(false); // 'create' view flag
    const [approvingAll, setApprovingAll] = useState(false);
    const [approvingSube, setApprovingSube] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const confirm = useConfirm();

    const fetchCampaigns = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/reports/butce-kampanya');
            setCampaigns(data.kampanyalar || data || []);
        } catch (err) {
            toast.error('Kampanyalar yüklenemedi.');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchDetail = useCallback(async (id) => {
        setDetailLoading(true);
        try {
            const { data } = await api.get(`/reports/butce-kampanya/${id}`);
            setDetailData(data);
        } catch (err) {
            toast.error('Kampanya detayı yüklenemedi.');
            setSelectedCampaign(null);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCampaigns();
    }, [fetchCampaigns]);

    useEffect(() => {
        if (selectedCampaign) fetchDetail(selectedCampaign);
    }, [selectedCampaign, fetchDetail]);

    const handleApproveAll = async () => {
        if (!detailData) return;
        const ok = await confirm('Gönderilmiş tüm bildirimleri onaylamak istediğinize emin misiniz?');
        if (!ok) return;

        setApprovingAll(true);
        try {
            await api.post(`/reports/butce-kampanya/${selectedCampaign}/onayla`);
            toast.success('Tüm bildirimler onaylandı.');
            fetchDetail(selectedCampaign);
            fetchCampaigns();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Onaylama başarısız.');
        } finally {
            setApprovingAll(false);
        }
    };

    const handleApproveSingle = async (subeKod) => {
        setApprovingSube(subeKod);
        try {
            await api.post(`/reports/butce-kampanya/${selectedCampaign}/onayla/${subeKod}`);
            toast.success('Bildirim onaylandı.');
            fetchDetail(selectedCampaign);
            fetchCampaigns();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Onaylama başarısız.');
        } finally {
            setApprovingSube(null);
        }
    };

    const handleDelete = async (id, e) => {
        e?.stopPropagation();
        const ok = await confirm('Bu kampanyayı silmek istediğinize emin misiniz?');
        if (!ok) return;

        setDeleting(id);
        try {
            await api.delete(`/reports/butce-kampanya/${id}`);
            toast.success('Kampanya silindi.');
            if (selectedCampaign === id) {
                setSelectedCampaign(null);
                setDetailData(null);
            }
            fetchCampaigns();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Silme başarısız.');
        } finally {
            setDeleting(null);
        }
    };

    // ─── List View ───
    const renderListView = () => (
        <>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Bütçe Toplama</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Şube bütçe kampanyalarını oluşturun ve takip edin.
                    </p>
                </div>
                <Button onClick={() => setModalOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" /> Yeni Kampanya
                </Button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : campaigns.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                    <Wallet className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium">Henüz kampanya yok</p>
                    <p className="text-sm mt-1">Yeni bir bütçe kampanyası oluşturmak için butona tıklayın.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {campaigns.map((c) => {
                        const yanitlarObj = c.yanitlar || {};
                        const yanitlarArr = Object.values(yanitlarObj);
                        const filled = yanitlarArr.filter(y => y.durum === 'gonderildi' || y.durum === 'onaylandi').length;
                        const total = yanitlarArr.length || 1;
                        const pct = Math.round((filled / total) * 100);
                        const sonTarih = c.son_tarih ? parseISO(c.son_tarih) : null;
                        const expired = sonTarih ? isPast(sonTarih) : false;
                        const daysLeft = sonTarih ? differenceInDays(sonTarih, new Date()) : null;
                        const status = c.durum || (expired ? 'tamamlandi' : 'aktif');
                        const cfg = statusConfig[status] || statusConfig.aktif;

                        return (
                            <Card
                                key={c.id}
                                className="cursor-pointer hover:shadow-md transition-shadow group relative"
                                onClick={() => setSelectedCampaign(c.id)}
                            >
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <CardTitle className="text-base leading-snug">{c.baslik}</CardTitle>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <Badge className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                                onClick={(e) => handleDelete(c.id, e)}
                                                disabled={deleting === c.id}
                                            >
                                                {deleting === c.id ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <p className="text-xs text-muted-foreground">
                                        Dönem: {fmtDate(c.donem_baslangic)} – {fmtDate(c.donem_bitis)}
                                    </p>

                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">Dolduran</span>
                                            <span className="font-medium">{filled}/{total}</span>
                                        </div>
                                        <Progress value={pct} className="h-2" />
                                    </div>

                                    <div className="flex items-center gap-1.5 text-xs">
                                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                        {expired ? (
                                            <span className="text-destructive font-medium">Süresi doldu</span>
                                        ) : daysLeft !== null ? (
                                            <span className="text-muted-foreground">
                                                Son tarih: {fmtDate(c.son_tarih)} ({daysLeft} gün kaldı)
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground">-</span>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </>
    );

    // ─── Detail View ───
    const renderDetailView = () => {
        if (detailLoading || !detailData) {
            return (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            );
        }

        const kampanya = detailData;
        const yanitlarMap = kampanya.yanitlar || {};
        const bildirimler = Object.entries(yanitlarMap).map(([subeKod, yanit]) => ({
            sube_kod: subeKod,
            sube_adi: subeKod,
            ...yanit,
        }));
        const toplamButce = bildirimler
            .filter((b) => b.durum === 'gonderildi' || b.durum === 'onaylandi')
            .reduce((sum, b) => sum + (Number(b.kdv_dahil_tutar) || 0), 0);
        const dolduranSayisi = bildirimler.filter(
            (b) => b.durum === 'gonderildi' || b.durum === 'onaylandi'
        ).length;
        const bekleyenSayisi = bildirimler.filter((b) => b.durum === 'bekliyor').length;
        const gonderildiSayisi = bildirimler.filter((b) => b.durum === 'gonderildi').length;

        return (
            <>
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            onClick={() => {
                                setSelectedCampaign(null);
                                setDetailData(null);
                            }}
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                                {kampanya.baslik}
                            </h1>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                Dönem: {fmtDate(kampanya.donem_baslangic)} – {fmtDate(kampanya.donem_bitis)}
                                {' · '}Son tarih: {fmtDate(kampanya.son_tarih)}
                            </p>
                        </div>
                    </div>
                    {gonderildiSayisi > 0 && (
                        <Button onClick={handleApproveAll} disabled={approvingAll}>
                            {approvingAll && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            Toplu Onayla ({gonderildiSayisi})
                        </Button>
                    )}
                </div>

                {/* IBAN / Ödeme Notu */}
                {(kampanya.iban || kampanya.odeme_notu || kampanya.alici_adi) && (
                    <div className="bg-muted/50 border rounded-lg p-4 space-y-1">
                        {kampanya.alici_adi && (
                            <p className="text-sm">
                                <span className="font-medium">Alıcı Adı:</span> {kampanya.alici_adi}
                            </p>
                        )}
                        {kampanya.iban && (
                            <p className="text-sm">
                                <span className="font-medium">IBAN:</span>{' '}
                                <span className="font-mono text-xs">{kampanya.iban}</span>
                            </p>
                        )}
                        {kampanya.odeme_notu && (
                            <p className="text-sm">
                                <span className="font-medium">Ödeme Notu:</span> {kampanya.odeme_notu}
                            </p>
                        )}
                    </div>
                )}

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card>
                        <CardContent className="pt-5">
                            <div className="flex items-center gap-3">
                                <div className="rounded-lg bg-primary/10 p-2.5">
                                    <Wallet className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Toplam Bütçe</p>
                                    <p className="text-lg font-semibold">{fmtCurrency(toplamButce)}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-5">
                            <div className="flex items-center gap-3">
                                <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-2.5">
                                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Dolduran</p>
                                    <p className="text-lg font-semibold">{dolduranSayisi}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-5">
                            <div className="flex items-center gap-3">
                                <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2.5">
                                    <Users className="w-5 h-5 text-amber-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Bekleyen</p>
                                    <p className="text-lg font-semibold">{bekleyenSayisi}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Table */}
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Şube Adı</TableHead>
                                    <TableHead>Durum</TableHead>
                                    <TableHead className="text-right">Seçilen Bakiye</TableHead>
                                    <TableHead className="text-right">KDV Dahil</TableHead>
                                    <TableHead>Dekont</TableHead>
                                    <TableHead>Tarih</TableHead>
                                    <TableHead className="text-right">İşlem</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {bildirimler.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                            Henüz bildirim yok.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    bildirimler.map((b) => {
                                        const durumCfg = bildirimDurumConfig[b.durum] || bildirimDurumConfig.bekliyor;
                                        return (
                                            <TableRow key={b.sube_kod || b.subeKod}>
                                                <TableCell className="font-medium">{b.sube_adi || b.subeAdi || '-'}</TableCell>
                                                <TableCell>
                                                    <Badge className={cn('text-xs', durumCfg.className)}>
                                                        {durumCfg.label}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {b.secilen_bakiye ? fmtCurrency(b.secilen_bakiye) : '-'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {b.kdv_dahil_tutar ? fmtCurrency(b.kdv_dahil_tutar) : '-'}
                                                </TableCell>
                                                <TableCell>
                                                    {b.dekont_url ? (
                                                        <a
                                                            href={b.dekont_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                                                        >
                                                            <FileText className="w-3.5 h-3.5" />
                                                            Görüntüle
                                                            <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">❌</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {b.gonderim_tarihi ? fmtDate(b.gonderim_tarihi) : '-'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {b.durum === 'gonderildi' && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 text-xs"
                                                            disabled={approvingSube === (b.sube_kod || b.subeKod)}
                                                            onClick={() => handleApproveSingle(b.sube_kod || b.subeKod)}
                                                        >
                                                            {approvingSube === (b.sube_kod || b.subeKod) ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            ) : (
                                                                <>
                                                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                                                    Onayla
                                                                </>
                                                            )}
                                                        </Button>
                                                    )}
                                                    {b.durum === 'onaylandi' && (
                                                        <span className="text-xs text-green-600 font-medium">✓ Onaylandı</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </>
        );
    };

    return (
        <div className="flex flex-col gap-4 max-w-[1200px] mx-auto w-full">
            {modalOpen ? (
                <BudgetCampaignForm
                    onCancel={() => setModalOpen(false)}
                    onSuccess={() => {
                        setModalOpen(false);
                        fetchCampaigns();
                    }}
                />
            ) : selectedCampaign ? (
                renderDetailView()
            ) : (
                renderListView()
            )}
        </div>
    );
}
