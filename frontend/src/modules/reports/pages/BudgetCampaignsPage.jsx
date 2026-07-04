import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    ArrowLeft, Plus, Loader2, Trash2, CheckCircle2,
    Clock, Users, Wallet, FileText, ExternalLink, ArrowUpDown, Check, Pencil,
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

// Dekontu kimlik doğrulamalı endpoint'ten (blob) açar — public URL ifşasını önler.
async function viewDekont(dekontUrl) {
    try {
        const i = (dekontUrl || '').indexOf('dekontlar/');
        if (i === -1) return; // beklenmeyen format
        const key = dekontUrl.substring(i);
        const res = await api.get(`/upload/dekont/${key}`, { responseType: 'blob' });
        const blobUrl = URL.createObjectURL(res.data);
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
        toast.error('Dekont açılamadı.');
    }
}

export default function BudgetCampaignsPage() {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailData, setDetailData] = useState(null);
    const [modalOpen, setModalOpen] = useState(false); // 'create'/'edit' view flag
    const [editKampanya, setEditKampanya] = useState(null); // doluysa düzenleme modu
    const [approvingAll, setApprovingAll] = useState(false);
    const [approvingSube, setApprovingSube] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [editedBalances, setEditedBalances] = useState({});
    const [editedMerkez, setEditedMerkez] = useState({});
    const [editedKdv, setEditedKdv] = useState({});
    const [devretBusy, setDevretBusy] = useState(null);
    const [devretildi, setDevretildi] = useState(new Set());
    const [sortType, setSortType] = useState('status'); // 'status' | 'name_asc' | 'name_desc'
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

    const fetchDetail = async (id) => {
        setDetailLoading(true);
        try {
            const { data } = await api.get(`/reports/butce-kampanya/${id}`);
            setDetailData(data);
            setEditedBalances({}); // Reset edited balances when opening detail
            setEditedMerkez({});
            setEditedKdv({});
            setDevretildi(new Set());
        } catch (err) {
            toast.error('Detay yüklenemedi.');
            setSelectedCampaign(null);
        } finally {
            setDetailLoading(false);
        }
    };

    useEffect(() => {
        fetchCampaigns();
    }, [fetchCampaigns]);

    useEffect(() => {
        if (selectedCampaign) fetchDetail(selectedCampaign);
    }, [selectedCampaign]);

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
            const bakiye = editedBalances[subeKod];
            const merkez = editedMerkez[subeKod];
            const kdv = editedKdv[subeKod];
            const payload = {};
            if (bakiye !== undefined) payload.bakiye = bakiye;
            if (merkez !== undefined && merkez !== '') payload.merkez = merkez;
            if (kdv !== undefined && kdv !== '') payload.kdv = kdv;
            await api.post(`/reports/butce-kampanya/${selectedCampaign}/onayla/${subeKod}`, payload);
            toast.success('Bildirim onaylandı.');
            fetchDetail(selectedCampaign);
            fetchCampaigns();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Onaylama başarısız.');
        } finally {
            setApprovingSube(null);
        }
    };

    const handleDevret = async (subeKod) => {
        setDevretBusy(subeKod);
        try {
            const { data } = await api.post(`/reports/butce-kampanya/${selectedCampaign}/devret/${subeKod}`);
            setDevretildi(prev => new Set(prev).add(subeKod));
            toast.success(`Önceki dönem kalanı devreden miktara işlendi.`);
            fetchDetail(selectedCampaign);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Devretme başarısız.');
        } finally {
            setDevretBusy(null);
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
                    <h1 className="text-3xl leading-none tracking-tight text-foreground">Bütçe Toplama</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Şube bütçe kampanyalarını oluşturun ve takip edin.
                    </p>
                </div>
                <Button onClick={() => { setEditKampanya(null); setModalOpen(true); }}>
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
        const oncekiKalanlar = kampanya.onceki_kalanlar || {};
        const subeAdlari = kampanya.sube_adlari || {};
        const oncekiKatilim = kampanya.onceki_katilim || {};
        const devredilenler = kampanya.devredilenler || {};
        // Yalnızca kampanyanın katılımcıları (yanitlar). Sonradan eklenen/test şubeler
        // kalabalık yapmasın; yeni bir şube ancak bildirim gönderince listeye girer.
        const bildirimler = Object.entries(yanitlarMap).map(([subeKod, yanit]) => ({
            sube_kod: subeKod,
            sube_adi: subeAdlari[subeKod] || subeKod,
            ...yanit,
            onceki_kalan: oncekiKalanlar[subeKod],
            onceki_katildi: !!oncekiKatilim[subeKod],
            devredilen: Number(devredilenler[subeKod]) || 0, // bu döneme işlenmiş gerçek devir
        }));
        // KDV dahil tutar: şube dekontla gönderdiyse kayıtlı değer; admin sadece bakiye
        // girip onayladıysa kampanyanın bakiye seçeneklerindeki orandan hesapla.
        const bakiyeOpts = kampanya.bakiye_secenekleri || [];
        const kdvOran = (bakiyeOpts[0] && bakiyeOpts[0].bakiye && bakiyeOpts[0].kdv_dahil)
            ? (Number(bakiyeOpts[0].kdv_dahil) / Number(bakiyeOpts[0].bakiye)) : 1;
        const kdvDahilOf = (b) => {
            if (b.kdv_dahil_tutar) return Number(b.kdv_dahil_tutar);
            const bk = Number(b.secilen_bakiye) || 0;
            if (!bk) return 0;
            const opt = bakiyeOpts.find((o) => Number(o.bakiye) === bk);
            return opt && opt.kdv_dahil ? Number(opt.kdv_dahil) : Math.round(bk * kdvOran);
        };
        const toplamButce = bildirimler
            .filter((b) => b.durum === 'gonderildi' || b.durum === 'onaylandi')
            .reduce((sum, b) => sum + kdvDahilOf(b), 0);
        const onaylananButce = bildirimler
            .filter((b) => b.durum === 'onaylandi')
            .reduce((sum, b) => sum + kdvDahilOf(b), 0);
        const dolduranSayisi = bildirimler.filter(
            (b) => b.durum === 'gonderildi' || b.durum === 'onaylandi'
        ).length;
        const bekleyenSayisi = bildirimler.filter((b) => b.durum === 'bekliyor').length;
        const gonderildiSayisi = bildirimler.filter((b) => b.durum === 'gonderildi').length;
        const onaylananSayisi = bildirimler.filter((b) => b.durum === 'onaylandi').length;
        const toplamSube = bildirimler.length;
        const tamamlanmaPct = toplamSube > 0 ? Math.round(((dolduranSayisi) / toplamSube) * 100) : 0;

        // Bütçe toplamları (gönderilmiş + onaylanmış üzerinden)
        const katilanlar = bildirimler.filter((b) => b.durum === 'gonderildi' || b.durum === 'onaylandi');
        const toplamBakiye = katilanlar.reduce((s, b) => s + (Number(b.secilen_bakiye) || 0), 0);
        const toplamMerkez = katilanlar.reduce((s, b) => s + (Number(b.merkez_destegi) || 0), 0);
        // Önceki dönem devri — YALNIZCA bu döneme işlenmiş (tiklenmiş/Düzenle) gerçek devir.
        // İşlenmemişse 0 → harcanacağa etki etmez. Pozitif eklenir, negatif/aşım düşülür.
        const toplamDevir = katilanlar.reduce((s, b) => s + (Number(b.devredilen) || 0), 0);
        const harcanacakTutar = toplamBakiye + toplamMerkez + toplamDevir;

        const sonTarih = kampanya.son_tarih ? parseISO(kampanya.son_tarih) : null;
        const expired = sonTarih ? isPast(sonTarih) : false;
        const daysLeft = sonTarih ? differenceInDays(sonTarih, new Date()) : null;
        const status = kampanya.durum || (expired ? 'tamamlandi' : 'aktif');
        const cfg = statusConfig[status] || statusConfig.aktif;

        // Sort: gonderildi first (action needed), then bekliyor, then onaylandi
        const statusOrder = { gonderildi: 0, bekliyor: 1, onaylandi: 2 };
        const sortedBildirimler = [...bildirimler].sort((a, b) => {
            if (sortType === 'status') {
                return (statusOrder[a.durum] ?? 1) - (statusOrder[b.durum] ?? 1);
            }
            
            const nameA = (a.sube_adi || a.subeAdi || a.sube_kod || '').toLowerCase();
            const nameB = (b.sube_adi || b.subeAdi || b.sube_kod || '').toLowerCase();
            
            if (sortType === 'name_asc') {
                return nameA.localeCompare(nameB);
            } else if (sortType === 'name_desc') {
                return nameB.localeCompare(nameA);
            }
            return 0;
        });

        const toggleSort = () => {
            if (sortType === 'status') setSortType('name_asc');
            else if (sortType === 'name_asc') setSortType('name_desc');
            else setSortType('status');
        };

        const renderStatusDot = (durum) => {
            const colors = {
                bekliyor: 'bg-gray-300 dark:bg-gray-600',
                gonderildi: 'bg-blue-500',
                onaylandi: 'bg-emerald-500',
            };
            return <div className={cn('w-2 h-2 rounded-full shrink-0', colors[durum] || colors.bekliyor)} />;
        };

        return (
            <>
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 mt-0.5"
                            onClick={() => {
                                setSelectedCampaign(null);
                                setDetailData(null);
                            }}
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-3xl leading-none tracking-tight text-foreground">
                                    {kampanya.baslik}
                                </h1>
                                <Badge className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 text-sm text-muted-foreground flex-wrap">
                                <span>{fmtDate(kampanya.donem_baslangic)} – {fmtDate(kampanya.donem_bitis)}</span>
                                <span className="text-border">·</span>
                                <span className="flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {expired ? (
                                        <span className="text-destructive font-medium">Süresi doldu</span>
                                    ) : daysLeft !== null ? (
                                        <span>Son tarih: {fmtDate(kampanya.son_tarih)} <span className="font-medium text-foreground">({daysLeft} gün)</span></span>
                                    ) : '-'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" onClick={() => { setEditKampanya(kampanya); setModalOpen(true); }}>
                            <Pencil className="w-4 h-4 mr-2" /> Düzenle
                        </Button>
                        {gonderildiSayisi > 0 && (
                            <Button onClick={handleApproveAll} disabled={approvingAll}>
                                {approvingAll && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Toplu Onayla ({gonderildiSayisi})
                            </Button>
                        )}
                    </div>
                </div>

                {/* IBAN / Ödeme bilgileri */}
                {(kampanya.iban || kampanya.odeme_notu || kampanya.alici_adi) && (
                    <div className="bg-muted/40 border rounded-xl p-4 flex flex-wrap gap-x-8 gap-y-2">
                        {kampanya.alici_adi && (
                            <div className="text-sm">
                                <span className="text-muted-foreground">Alıcı:</span>{' '}
                                <span className="font-medium">{kampanya.alici_adi}</span>
                            </div>
                        )}
                        {kampanya.iban && (
                            <div className="text-sm">
                                <span className="text-muted-foreground">IBAN:</span>{' '}
                                <span className="font-mono text-xs font-medium tracking-wide">{kampanya.iban}</span>
                            </div>
                        )}
                        {kampanya.odeme_notu && (
                            <div className="text-sm">
                                <span className="text-muted-foreground">Not:</span>{' '}
                                <span className="font-medium">{kampanya.odeme_notu}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border bg-card p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="rounded-lg bg-violet-100 dark:bg-violet-900/30 p-1.5">
                                <Wallet className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                            </div>
                            <span className="text-xs text-muted-foreground">Toplanan</span>
                        </div>
                        <p className="text-xl font-semibold tracking-tight">{fmtCurrency(toplamButce)}</p>
                        {onaylananButce > 0 && onaylananButce < toplamButce && (
                            <p className="text-[10px] text-muted-foreground mt-1">{fmtCurrency(onaylananButce)} onaylandı</p>
                        )}
                    </div>

                    <div className="rounded-xl border bg-card p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="rounded-lg bg-sky-100 dark:bg-sky-900/30 p-1.5">
                                <Wallet className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                            </div>
                            <span className="text-xs text-muted-foreground">Bakiye</span>
                        </div>
                        <p className="text-xl font-semibold tracking-tight">{fmtCurrency(toplamBakiye)}</p>
                    </div>

                    <div className="rounded-xl border bg-card p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-1.5">
                                <Wallet className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            <span className="text-xs text-muted-foreground">Merkez Desteği</span>
                        </div>
                        <p className="text-xl font-semibold tracking-tight">{fmtCurrency(toplamMerkez)}</p>
                    </div>

                    <div className="rounded-xl border bg-card p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-1.5">
                                <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <span className="text-xs text-muted-foreground">Harcanacak Tutar</span>
                        </div>
                        <p className="text-xl font-semibold tracking-tight">{fmtCurrency(harcanacakTutar)}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                            Bakiye + Merkez {toplamDevir < 0 ? '− ' + fmtCurrency(Math.abs(toplamDevir)) + ' devir' : toplamDevir > 0 ? '+ ' + fmtCurrency(toplamDevir) + ' devir' : ''}
                        </p>
                    </div>

                    <div className="rounded-xl border bg-card p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-1.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <span className="text-xs text-muted-foreground">Tamamlama</span>
                        </div>
                        <p className="text-xl font-semibold tracking-tight">{dolduranSayisi}<span className="text-sm font-normal text-muted-foreground">/{toplamSube}</span></p>
                        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${tamamlanmaPct}%` }} />
                        </div>
                    </div>

                    <div className="rounded-xl border bg-card p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-1.5">
                                <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <span className="text-xs text-muted-foreground">Onay Bekleyen</span>
                        </div>
                        <p className="text-xl font-semibold tracking-tight">{gonderildiSayisi}</p>
                        {gonderildiSayisi > 0 && (
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium mt-1">İşlem gerekli</p>
                        )}
                    </div>

                    <div className="rounded-xl border bg-card p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-1.5">
                                <Users className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            <span className="text-xs text-muted-foreground">Bekleyen</span>
                        </div>
                        <p className="text-xl font-semibold tracking-tight">{bekleyenSayisi}</p>
                        {bekleyenSayisi > 0 && toplamSube > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-1">%{Math.round((bekleyenSayisi / toplamSube) * 100)} henüz doldurmadı</p>
                        )}
                    </div>
                </div>

                {/* Table */}
                <Card className="overflow-hidden rounded-xl py-0 gap-0">
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/30">
                                    <TableHead className="w-[220px] pl-5 cursor-pointer hover:bg-muted/50 transition-colors" onClick={toggleSort}>
                                        <div className="flex items-center gap-1">
                                            Şube
                                            <ArrowUpDown className={cn("w-3 h-3 text-muted-foreground transition-colors", sortType !== 'status' && "text-foreground")} />
                                        </div>
                                    </TableHead>
                                    <TableHead className="w-[120px]">Durum</TableHead>
                                    <TableHead className="text-center">Geçen Dönem</TableHead>
                                    <TableHead className="text-right">Önceki Dönem</TableHead>
                                    <TableHead className="text-right">Merkez Desteği</TableHead>
                                    <TableHead className="text-right">Bakiye</TableHead>
                                    <TableHead className="text-right">KDV Dahil</TableHead>
                                    <TableHead className="w-[100px]">Dekont</TableHead>
                                    <TableHead>Tarih</TableHead>
                                    <TableHead className="text-right w-[100px] pr-5">İşlem</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedBildirimler.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                                            <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                            Henüz bildirim yok.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    sortedBildirimler.map((b) => {
                                        const durumCfg = bildirimDurumConfig[b.durum] || bildirimDurumConfig.bekliyor;
                                        const subeKodu = b.sube_kod || b.subeKod;
                                        // Devir işlenmiş mi: oturum içinde tıklandı VEYA kayıtlı devir == önceki kalan
                                        const devirIslendi = devretildi.has(subeKodu) || (!!b.onceki_kalan && Math.abs((b.devredilen || 0) - b.onceki_kalan) < 0.01);
                                        const isActionNeeded = b.durum === 'gonderildi';
                                        return (
                                            <TableRow 
                                                key={b.sube_kod || b.subeKod}
                                                className={cn(
                                                    isActionNeeded && 'bg-blue-50/50 dark:bg-blue-950/20'
                                                )}
                                            >
                                                <TableCell className="pl-5">
                                                    <span className="font-medium text-sm">{b.sube_adi || b.subeAdi || '-'}</span>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        {renderStatusDot(b.durum)}
                                                        <span className={cn(
                                                            'text-xs font-medium',
                                                            b.durum === 'gonderildi' && 'text-blue-600 dark:text-blue-400',
                                                            b.durum === 'onaylandi' && 'text-emerald-600 dark:text-emerald-400',
                                                            b.durum === 'bekliyor' && 'text-muted-foreground'
                                                        )}>
                                                            {durumCfg.label}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {b.onceki_katildi ? (
                                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                                            <Check className="size-3.5" strokeWidth={3} /> Katıldı
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground/50">Katılmadı</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums text-sm">
                                                    {b.onceki_kalan === undefined || b.onceki_kalan === null ? (
                                                        <span className="text-muted-foreground/40">—</span>
                                                    ) : (
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <span className={cn(
                                                                'font-medium',
                                                                b.onceki_kalan < 0 && 'text-red-500',
                                                                b.onceki_kalan > 0 && 'text-emerald-600',
                                                                b.onceki_kalan === 0 && 'text-muted-foreground'
                                                            )}>
                                                                {b.onceki_kalan > 0 ? '+' : ''}{fmtCurrency(b.onceki_kalan)}
                                                            </span>
                                                            {b.onceki_kalan !== 0 && (
                                                                <button
                                                                    type="button"
                                                                    title="Bu tutarı bu dönemin devreden miktarına işle"
                                                                    disabled={devretBusy === (b.sube_kod || b.subeKod)}
                                                                    onClick={() => handleDevret(b.sube_kod || b.subeKod)}
                                                                    className={cn(
                                                                        'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                                                                        devirIslendi
                                                                            ? 'bg-emerald-500 border-emerald-500 text-white'
                                                                            : 'border-border text-muted-foreground hover:border-emerald-500 hover:text-emerald-600'
                                                                    )}
                                                                >
                                                                    {devretBusy === (b.sube_kod || b.subeKod)
                                                                        ? <Loader2 className="size-3 animate-spin" />
                                                                        : <Check className="size-3" strokeWidth={3} />}
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end">
                                                        <Input
                                                            type="number"
                                                            placeholder="Merkez (₺)"
                                                            className="w-24 h-7 text-right text-xs"
                                                            value={editedMerkez[b.sube_kod || b.subeKod] !== undefined ? editedMerkez[b.sube_kod || b.subeKod] : (b.merkez_destegi || '')}
                                                            onChange={(e) => setEditedMerkez(prev => ({ ...prev, [b.sube_kod || b.subeKod]: e.target.value }))}
                                                        />
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end">
                                                        <Input
                                                            type="number"
                                                            placeholder="Tutar (₺)"
                                                            className="w-24 h-7 text-right text-xs"
                                                            value={editedBalances[b.sube_kod || b.subeKod] !== undefined ? editedBalances[b.sube_kod || b.subeKod] : (b.secilen_bakiye || '')}
                                                            onChange={(e) => setEditedBalances(prev => ({ ...prev, [b.sube_kod || b.subeKod]: e.target.value }))}
                                                        />
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end">
                                                        <Input
                                                            type="number"
                                                            placeholder="KDV dahil (₺)"
                                                            className="w-24 h-7 text-right text-xs"
                                                            value={editedKdv[b.sube_kod || b.subeKod] !== undefined ? editedKdv[b.sube_kod || b.subeKod] : (kdvDahilOf(b) || '')}
                                                            onChange={(e) => setEditedKdv(prev => ({ ...prev, [b.sube_kod || b.subeKod]: e.target.value }))}
                                                        />
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {b.dekont_url ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => viewDekont(b.dekont_url)}
                                                            className="inline-flex items-center gap-1.5 text-primary hover:underline text-xs font-medium"
                                                        >
                                                            <FileText className="w-3.5 h-3.5" />
                                                            Görüntüle
                                                        </button>
                                                    ) : (
                                                        <span className="text-muted-foreground/40">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {b.gonderim_tarihi ? fmtDate(b.gonderim_tarihi) : <span className="text-muted-foreground/40">—</span>}
                                                </TableCell>
                                                <TableCell className="text-right pr-5">
                                                    {b.durum !== 'onaylandi' ? (
                                                        <Button
                                                            size="sm"
                                                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                                            disabled={approvingSube === (b.sube_kod || b.subeKod) || (editedBalances[b.sube_kod || b.subeKod] === undefined ? !b.secilen_bakiye : !editedBalances[b.sube_kod || b.subeKod])}
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
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 text-xs"
                                                            disabled={approvingSube === (b.sube_kod || b.subeKod)}
                                                            onClick={() => handleApproveSingle(b.sube_kod || b.subeKod)}
                                                            title="Değişiklikleri kaydet"
                                                        >
                                                            {approvingSube === (b.sube_kod || b.subeKod) ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            ) : 'Güncelle'}
                                                        </Button>
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
        <div className="flex flex-col gap-5 w-full max-w-[1400px]">
            {modalOpen ? (
                <BudgetCampaignForm
                    editKampanya={editKampanya}
                    onCancel={() => { setModalOpen(false); setEditKampanya(null); }}
                    onSuccess={() => {
                        setModalOpen(false);
                        setEditKampanya(null);
                        fetchCampaigns();
                        if (selectedCampaign) fetchDetail(selectedCampaign);
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
