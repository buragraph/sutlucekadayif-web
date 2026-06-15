import React, { useEffect, useState } from 'react';
import { useReportsStore, reportsApi, fmt, fmtC, formatDateTR } from '../hooks/useReports';
import { useAuth } from '../../../context/AuthContext';
import { ReportsModals } from '../components/ReportsModals';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Loader2, Upload, CheckCircle2, Copy, Wallet, FileText, AlertCircle,
    Eye, FileDown, BarChart2, ChevronLeft, ChevronRight,
    TrendingUp, Users, Search as SearchIcon, DollarSign, MousePointerClick, AlertTriangle
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import api from '../../../services/api';

const ITEMS_PER_PAGE = 5;

const fmtDateLong = (dateStr) => {
    if (!dateStr) return '-';
    try {
        return format(parseISO(dateStr), 'd MMMM yyyy', { locale: tr });
    } catch {
        return dateStr;
    }
};

export default function BranchReklamPage() {
    const { subeSlug } = useAuth();
    
    // Reports Store states & actions
    const loadDashboard = useReportsStore((s) => s.loadDashboard);
    const branches = useReportsStore((s) => s.branches);
    const donemCache = useReportsStore((s) => s.donemCache);
    const activeBranchCode = useReportsStore((s) => s.activeBranch);
    const selectBranch = useReportsStore((s) => s.selectBranch);
    const openModal = useReportsStore((s) => s.openModal);
    const storeLoading = useReportsStore((s) => s.loading);

    // Sorting and Pagination
    const [sortDir, setSortDir] = useState('desc');
    const [currentPage, setCurrentPage] = useState(1);

    // Budget Campaign States
    const [budgetLoading, setBudgetLoading] = useState(true);
    const [kampanya, setKampanya] = useState(null);
    const [mevcutBildirim, setMevcutBildirim] = useState(null);
    const [selectedBakiye, setSelectedBakiye] = useState(null);
    const [dekontFile, setDekontFile] = useState(null);
    const [notlar, setNotlar] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [formExpanded, setFormExpanded] = useState(false);

    // Load Dashboard and Budget on Mount
    useEffect(() => {
        loadDashboard();
    }, [loadDashboard]);

    // Select this branch automatically when slug and branches are loaded
    useEffect(() => {
        if (subeSlug && !storeLoading && branches.length > 0) {
            selectBranch(subeSlug);
        }
    }, [subeSlug, selectBranch, storeLoading, branches.length]);

    // Fetch pending campaign
    const fetchPendingBudget = async () => {
        if (!subeSlug) return;
        setBudgetLoading(true);
        try {
            const { data } = await api.get('/reports/butce-bekleyen');
            const kampanyalar = data.campaigns || data.kampanyalar || [];
            if (kampanyalar.length > 0) {
                const first = kampanyalar[0];
                setKampanya(first);
                const yanit = first.yanit || null;
                setMevcutBildirim(yanit);
                if (yanit && yanit.durum !== 'bekliyor') {
                    setSubmitted(true);
                } else {
                    setFormExpanded(true);
                }
            } else {
                setKampanya(null);
            }
        } catch (err) {
            if (err.response?.status !== 404) {
                console.error('Bütçe bilgileri yüklenemedi:', err);
            }
            setKampanya(null);
        } finally {
            setBudgetLoading(false);
        }
    };

    useEffect(() => {
        fetchPendingBudget();
    }, [subeSlug]);

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

    const handleBudgetSubmit = async (e) => {
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
            formData.append('kdv_dahil_tutar', option.kdv_dahil || Math.round(option.bakiye * 1.2));
            formData.append('notlar', notlar);
            if (dekontFile) formData.append('dekont', dekontFile);

            await api.post(`/reports/butce-gonder/${kampanya.id}`, formData);

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

    // Active branch report computations
    const branch = branches.find((b) => b.kod === activeBranchCode);
    const donemler = activeBranchCode ? (donemCache[activeBranchCode] || []) : [];

    const tS = branch?.toplamHarcama || 0;
    const tR = branch?.toplamErisim || 0;
    const tSonuc = branch?.toplamSonuc || 0;
    const tV = donemler.reduce((a, d) => a + (d.google?.gorunurluk || 0), 0);

    const sortedDonemler = [...donemler].sort((a, b) => {
        const valA = a.baslangic;
        const valB = b.baslangic;
        if (valA < valB) return sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    const totalPages = Math.ceil(sortedDonemler.length / ITEMS_PER_PAGE);
    const paginatedDonemler = sortedDonemler.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const handleDownloadPdf = async (d) => {
        try {
            await reportsApi.generatePdf(activeBranchCode, d.baslangic, d.bitis);
            toast.success('PDF indirildi.');
        } catch (err) {
            toast.error(err.message || 'PDF indirilemedi.');
        }
    };

    // ─── Stats card data ───
    const statsCards = [
        { label: 'Toplam Harcama', value: fmtC(tS), description: 'Meta reklam harcaması', icon: DollarSign },
        { label: 'Toplam Erişim', value: fmt(tR), description: 'Kişiye ulaşıldı', icon: Users },
        { label: 'Görünürlük', value: fmt(tV), description: 'Google İşletme gösterim', icon: SearchIcon },
        { label: 'Dönüşüm', value: fmt(tSonuc), description: 'Sonuç ve etkileşim', icon: MousePointerClick },
    ];

    return (
        <div className="flex flex-col gap-4 md:gap-6 w-full pb-8">
            {/* ─── Page Header ─── */}
            <div>
                <h1 className="text-3xl leading-none tracking-tight">Reklam Paneli</h1>
                <p className="text-muted-foreground text-sm">
                    {branch
                        ? `${branch.ad} şubesi için reklam performansı ve bütçe yönetimi.`
                        : 'Reklam raporlarınızı ve bütçe süreçlerinizi yönetin.'}
                </p>
            </div>

            {/* ─── Loading State ─── */}
            {(storeLoading || budgetLoading) && !branch ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Veriler yükleniyor…</p>
                </div>
            ) : (
                <>
                    {/* ═══════════════════════════════════════════
                        BÜTÇE BİLDİRİM KARTI
                    ═══════════════════════════════════════════ */}
                    {kampanya && (
                        <Card className={cn(
                            "transition-all duration-300",
                            submitted
                                ? "border-green-200 dark:border-green-900/40"
                                : "border-amber-200 dark:border-amber-900/40"
                        )}>
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "flex size-9 items-center justify-center rounded-lg border",
                                        submitted
                                            ? "bg-green-50 text-green-600 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800"
                                            : "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800"
                                    )}>
                                        <Wallet className="size-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <CardTitle className="leading-none text-base">{kampanya.baslik}</CardTitle>
                                        <CardDescription className="mt-1">
                                            {fmtDateLong(kampanya.donem_baslangic)} – {fmtDateLong(kampanya.donem_bitis)}
                                            <span className="mx-2 text-border">•</span>
                                            <span className="text-destructive font-medium">Son: {fmtDateLong(kampanya.son_tarih)}</span>
                                        </CardDescription>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 ml-auto">
                                    {submitted ? (
                                        <Badge variant="outline" className="text-green-600 border-green-200 dark:text-green-400 dark:border-green-800">
                                            <CheckCircle2 className="size-3 mr-1" /> Gönderildi
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-amber-600 border-amber-200 dark:text-amber-400 dark:border-amber-800 animate-pulse">
                                            <AlertCircle className="size-3 mr-1" /> Bildirim Bekliyor
                                        </Badge>
                                    )}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setFormExpanded(!formExpanded)}
                                    >
                                        {formExpanded ? 'Gizle' : 'Göster'}
                                    </Button>
                                </div>
                            </CardHeader>

                            {formExpanded && (
                                <CardContent className="pt-0">
                                    {submitted ? (
                                        /* ── Gönderim Onay Mesajı ── */
                                        <div className="flex flex-col items-center justify-center py-8 text-center max-w-sm mx-auto">
                                            <div className="flex size-12 items-center justify-center rounded-full border-2 border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 mb-4">
                                                <CheckCircle2 className="size-6 text-green-600 dark:text-green-400" />
                                            </div>
                                            <h3 className="font-semibold text-base">Bütçe Bildiriminiz Alındı</h3>
                                            <p className="text-muted-foreground text-sm mt-2">
                                                Bu dönem için bütçe tercihiniz merkez ofise iletildi. Onaylandıktan sonra raporunuza yansıtılacaktır.
                                            </p>
                                            {mevcutBildirim && (
                                                <div className="mt-6 w-full border rounded-lg divide-y text-sm">
                                                    <div className="flex justify-between px-4 py-2.5">
                                                        <span className="text-muted-foreground">Seçilen Bütçe</span>
                                                        <span className="font-medium tabular-nums">{fmtC(mevcutBildirim.secilen_bakiye)}</span>
                                                    </div>
                                                    <div className="flex justify-between px-4 py-2.5">
                                                        <span className="text-muted-foreground">KDV Dahil Tutar</span>
                                                        <span className="font-medium tabular-nums">{fmtC(mevcutBildirim.kdv_dahil_tutar)}</span>
                                                    </div>
                                                    {mevcutBildirim.gonderim_tarihi && (
                                                        <div className="flex justify-between px-4 py-2.5">
                                                            <span className="text-muted-foreground">Gönderim Tarihi</span>
                                                            <span className="text-muted-foreground">{fmtDateLong(mevcutBildirim.gonderim_tarihi.split('T')[0])}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        /* ── Bildirim Formu ── */
                                        <div className="space-y-6">
                                            {/* ── Bütçe Seçenekleri (Üst: kompakt grid) ── */}
                                            <div className="space-y-3">
                                                <Label className="text-sm font-medium">Bütçe paketinizi seçin <span className="text-destructive">*</span></Label>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                                    {(kampanya.bakiye_secenekleri || []).map((opt, i) => {
                                                        const isSelected = Number(selectedBakiye) === Number(opt.bakiye);
                                                        return (
                                                            <button
                                                                key={i}
                                                                type="button"
                                                                onClick={() => setSelectedBakiye(opt.bakiye)}
                                                                className={cn(
                                                                    "relative rounded-lg border p-3 text-left transition-all duration-150 hover:border-primary/50",
                                                                    isSelected
                                                                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                                                        : "border-border bg-background"
                                                                )}
                                                            >
                                                                {isSelected && (
                                                                    <div className="absolute top-1.5 right-1.5">
                                                                        <CheckCircle2 className="size-4 text-primary" />
                                                                    </div>
                                                                )}
                                                                <div className="font-semibold text-base tabular-nums tracking-tight">
                                                                    {fmtC(opt.bakiye)}
                                                                </div>
                                                                <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                                                                    KDV dahil {fmtC(opt.kdv_dahil)}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* ── Ödeme Bilgisi + Form (Alt: tam genişlik 2 kolon) ── */}
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                {/* Ödeme bilgisi */}
                                                <div className="space-y-5">
                                                    {(kampanya.iban || kampanya.odeme_notu || kampanya.alici_adi) && (
                                                        <div className="rounded-lg border bg-muted/15 p-4 space-y-3">
                                                            <div className="flex items-center gap-2 text-sm font-medium">
                                                                <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                                                                    <FileText className="size-4" />
                                                                </div>
                                                                Ödeme & IBAN Bilgileri
                                                            </div>
                                                            {kampanya.alici_adi && (
                                                                <div className="text-sm font-medium" title={kampanya.alici_adi}>
                                                                    {kampanya.alici_adi}
                                                                </div>
                                                            )}
                                                            {kampanya.iban && (
                                                                <div className="flex items-center gap-2 bg-background border px-3 py-2 rounded-md">
                                                                    <code className="text-sm font-mono font-medium flex-1 truncate select-all">
                                                                        {kampanya.iban}
                                                                    </code>
                                                                    <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground shrink-0" onClick={handleCopyIban} title="IBAN Kopyala">
                                                                        <Copy className="size-3.5" />
                                                                    </Button>
                                                                </div>
                                                            )}
                                                            {kampanya.odeme_notu && (
                                                                <p className="text-muted-foreground text-sm leading-relaxed">{kampanya.odeme_notu}</p>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Dekont Yükleme */}
                                                    <div className="space-y-2">
                                                        <Label className="text-sm font-medium">Dekont Yükleme <span className="text-muted-foreground font-normal">(İsteğe Bağlı)</span></Label>
                                                        <div className="border border-dashed rounded-lg p-4 text-center bg-background hover:border-primary/50 transition-colors">
                                                            <input
                                                                type="file"
                                                                accept=".pdf,.jpg,.jpeg,.png"
                                                                onChange={handleFileChange}
                                                                className="hidden"
                                                                id="dekont-file-upload"
                                                            />
                                                            <label htmlFor="dekont-file-upload" className="cursor-pointer flex items-center gap-3 justify-center">
                                                                <div className="flex size-9 items-center justify-center rounded-lg border bg-muted text-muted-foreground shrink-0">
                                                                    <Upload className="size-4" />
                                                                </div>
                                                                <div className="text-left">
                                                                    {dekontFile ? (
                                                                        <p className="text-sm font-medium truncate max-w-xs">{dekontFile.name}</p>
                                                                    ) : (
                                                                        <p className="text-sm text-muted-foreground">Dosya seçmek için tıklayın</p>
                                                                    )}
                                                                    <p className="text-xs text-muted-foreground">PDF, JPG, PNG · Maks 5 MB</p>
                                                                </div>
                                                            </label>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Notlar + Gönder */}
                                                <form onSubmit={handleBudgetSubmit} className="space-y-5">
                                                    <div className="space-y-2">
                                                        <Label htmlFor="reklam-notlar" className="text-sm font-medium">Notlar</Label>
                                                        <textarea
                                                            id="reklam-notlar"
                                                            value={notlar}
                                                            onChange={(e) => setNotlar(e.target.value)}
                                                            placeholder="Varsa eklemek istediğiniz açıklamaları yazın…"
                                                            rows={4}
                                                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                        />
                                                    </div>

                                                    <div className="flex items-center gap-3">
                                                        <Button type="submit" size="sm" disabled={submitting || !selectedBakiye}>
                                                            {submitting ? (
                                                                <Loader2 className="size-3.5 mr-2 animate-spin" />
                                                            ) : (
                                                                <CheckCircle2 className="size-3.5 mr-2" />
                                                            )}
                                                            Bildirimi Gönder
                                                        </Button>
                                                        {!selectedBakiye && (
                                                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                                <AlertCircle className="size-3 text-amber-500" />
                                                                Yukarıdan bir bütçe paketi seçin.
                                                            </p>
                                                        )}
                                                    </div>
                                                </form>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            )}
                        </Card>
                    )}

                    {/* ═══════════════════════════════════════════
                        RAPOR VERİLERİ
                    ═══════════════════════════════════════════ */}
                    {branch ? (
                        <>
                            {/* ── Stat Cards (shadcn dashboard pattern) ── */}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                {statsCards.map((stat, i) => (
                                    <Card key={i}>
                                        <CardHeader>
                                            <CardTitle>
                                                <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                                                    <stat.icon className="size-4" />
                                                </div>
                                            </CardTitle>
                                            <CardDescription>{stat.label}</CardDescription>
                                        </CardHeader>
                                        <CardContent className="flex flex-col gap-1">
                                            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
                                                {stat.value}
                                            </div>
                                            <p className="text-muted-foreground text-sm">{stat.description}</p>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>

                            {/* Bütçe Durumu kartı kaldırıldı — şube sahibi güncel dönemi görmemeli */}

                            {/* ── Rapor Dönemleri Tablosu ── */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="leading-none">{donemler.length} Rapor Dönemi</CardTitle>
                                    <CardDescription>
                                        Şubenize ait aylık reklam performans raporları ve dönem verileri.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    {donemler.length === 0 ? (
                                        <div className="py-16 text-center border border-dashed rounded-lg">
                                            <div className="flex size-12 items-center justify-center rounded-lg border bg-muted text-muted-foreground mx-auto mb-3">
                                                <BarChart2 className="size-5" />
                                            </div>
                                            <p className="font-medium text-sm">Rapor Bulunamadı</p>
                                            <p className="text-muted-foreground text-sm mt-1 max-w-xs mx-auto">
                                                Bu şube için henüz sisteme yüklenmiş bir reklam performans verisi bulunmamaktadır.
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="overflow-hidden rounded-lg border bg-card">
                                                <Table>
                                                    <TableHeader className="bg-muted/15">
                                                        <TableRow>
                                                            <TableHead className="h-11 p-3 font-medium">Dönem</TableHead>
                                                            <TableHead className="h-11 p-3 font-medium text-center">Veri Türleri</TableHead>
                                                            <TableHead className="h-11 p-3 font-medium text-right w-[120px]">İşlemler</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {paginatedDonemler.map((d) => {
                                                            const hM = !!d.meta;
                                                            const hG = !!d.google;
                                                            return (
                                                                <TableRow key={d.baslangic}>
                                                                    <TableCell className="p-3 align-middle">
                                                                        <span className="font-medium text-sm">
                                                                            {formatDateTR(d.baslangic)} – {formatDateTR(d.bitis)}
                                                                        </span>
                                                                    </TableCell>
                                                                    <TableCell className="p-3 align-middle">
                                                                        <div className="flex gap-1.5 items-center justify-center">
                                                                            {hM && (
                                                                                <Badge variant="outline" className="px-1.5 text-muted-foreground">
                                                                                    Meta Reklam
                                                                                </Badge>
                                                                            )}
                                                                            {hG && (
                                                                                <Badge variant="outline" className="px-1.5 text-muted-foreground">
                                                                                    Google İşletme
                                                                                </Badge>
                                                                            )}
                                                                            {!hM && !hG && <span className="text-muted-foreground">—</span>}
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="p-3 align-middle text-right">
                                                                        <div className="flex justify-end gap-1">
                                                                            <Button
                                                                                variant="outline"
                                                                                size="icon"
                                                                                className="size-8"
                                                                                onClick={() => openModal('preview', { kod: branch.kod, ad: branch.ad, b: d.baslangic, e: d.bitis })}
                                                                                title="Önizleme"
                                                                            >
                                                                                <Eye className="size-4" />
                                                                            </Button>
                                                                            <Button
                                                                                variant="outline"
                                                                                size="icon"
                                                                                className="size-8"
                                                                                onClick={() => handleDownloadPdf(d)}
                                                                                title="PDF İndir"
                                                                            >
                                                                                <FileDown className="size-4" />
                                                                            </Button>
                                                                        </div>
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })}
                                                    </TableBody>
                                                </Table>
                                            </div>

                                            {/* Pagination */}
                                            {totalPages > 1 && (
                                                <div className="flex items-center justify-between mt-3 px-1">
                                                    <div className="text-muted-foreground text-sm">
                                                        {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, sortedDonemler.length)} / {sortedDonemler.length}
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Button variant="outline" size="icon" className="size-8" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                                                            <ChevronLeft className="size-4" />
                                                        </Button>
                                                        <span className="text-sm font-medium px-2">
                                                            {currentPage} / {totalPages}
                                                        </span>
                                                        <Button variant="outline" size="icon" className="size-8" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                                                            <ChevronRight className="size-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </CardContent>
                            </Card>
                        </>
                    ) : (
                        <Card className="border-dashed">
                            <CardContent className="py-16 text-center">
                                <div className="flex size-12 items-center justify-center rounded-lg border bg-muted text-muted-foreground mx-auto mb-3">
                                    <BarChart2 className="size-5" />
                                </div>
                                <p className="font-medium text-sm">Şube Bilgisi Bulunamadı</p>
                                <p className="text-muted-foreground text-sm mt-1 max-w-xs mx-auto">
                                    Hesabınıza bağlı bir şube kaydı bulunamadı. Lütfen sistem yöneticisiyle iletişime geçin.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}

            {/* Mount standard preview dialog */}
            <ReportsModals />
        </div>
    );
}
