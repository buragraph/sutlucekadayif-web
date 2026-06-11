import React, { useState } from 'react';
import { useReportsStore, fmt, fmtC, formatDateTR, reportsApi } from '../hooks/useReports';
import { Plus, ArrowUpDown, ArrowUp, ArrowDown, LayoutDashboard, BarChart2, SlidersHorizontal, Eye, FileDown, Trash2, Settings, ChevronLeft, ChevronRight, AlertTriangle, Wallet, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 5;

export function BranchDetail() {
    const activeBranchCode = useReportsStore((s) => s.activeBranch);
    const branches = useReportsStore((s) => s.branches);
    const donemCache = useReportsStore((s) => s.donemCache);
    const sortCol = useReportsStore((s) => s.sortCol);
    const sortDir = useReportsStore((s) => s.sortDir);
    const setSort = useReportsStore((s) => s.setSort);
    const openModal = useReportsStore((s) => s.openModal);
    const budgetStatus = useReportsStore((s) => s.budgetStatus);

    const [currentPage, setCurrentPage] = useState(1);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async (baslangic, bitis) => {
        setIsRefreshing(true);
        try {
            await Promise.allSettled([
                reportsApi.metaFetchForBranch(null, baslangic, bitis, activeBranchCode),
                reportsApi.googleFetchForBranch(baslangic, bitis, activeBranchCode)
            ]);
            // Tam dashboard yenileme yerine yalnızca bu şubeyi tazele (~2 read):
            // şube dokümanı (aggregate + donem_ozetleri) ve bütçe durumu kaydı
            await Promise.allSettled([
                reportsApi.refreshBranch(activeBranchCode),
                reportsApi.fetchBudgetStatus(baslangic, bitis, activeBranchCode),
            ]);
            toast.success('Dönem verileri güncellendi!');
        } catch (err) {
            toast.error(err.message || 'Güncelleme sırasında bir hata oluştu');
        } finally {
            setIsRefreshing(false);
        }
    };

    // Reset page when branch changes
    const [prevBranch, setPrevBranch] = useState(null);
    if (activeBranchCode !== prevBranch) {
        setPrevBranch(activeBranchCode);
        if (currentPage !== 1) setCurrentPage(1);
    }
    
    if (!activeBranchCode) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center h-full text-center p-10 bg-background/50">
                <div className="w-12 h-12 rounded-lg bg-muted border flex items-center justify-center mb-4 text-muted-foreground">
                    <LayoutDashboard className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground mb-1">Şube Seçin</h2>
                <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                    Rapor detaylarını görüntülemek için soldaki listeden bir şube seçin.
                </p>
            </div>
        );
    }

    const branch = branches.find((b) => b.kod === activeBranchCode);
    const donemler = donemCache[activeBranchCode] || [];
    
    if (!branch) return null;

    const initial = (branch.ad.replace(/Sütlüce Kadayıf\s*/i, '') || branch.kod).charAt(0).toUpperCase();

    // Stats from branch-level aggregates (no need to iterate donemler)
    const tS = branch.toplamHarcama || 0;
    const tR = branch.toplamErisim || 0;
    const tSonuc = branch.toplamSonuc || 0;
    const tV = donemler.reduce((a, d) => a + (d.google?.gorunurluk || 0), 0);

    const sortedDonemler = [...donemler].sort((a, b) => {
        let valA, valB;
        if (sortCol === 'donem') { valA = a.baslangic; valB = b.baslangic; }
        else { valA = a.baslangic; valB = b.baslangic; }
        
        if (valA < valB) return sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    const totalPages = Math.ceil(sortedDonemler.length / ITEMS_PER_PAGE);
    const paginatedDonemler = sortedDonemler.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const SortIcon = ({ col }) => {
        if (sortCol !== col) return <ArrowUpDown className="inline-block w-3 h-3 ml-1 text-muted-foreground opacity-50 align-text-bottom" />;
        return sortDir === 'asc' ? <ArrowUp className="inline-block w-3 h-3 ml-1 text-foreground align-text-bottom" /> : <ArrowDown className="inline-block w-3 h-3 ml-1 text-foreground align-text-bottom" />;
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-background scrollbar-thin min-h-0">
            <div className="max-w-[1200px] mx-auto w-full">
                
                {/* Hero Section */}
                <div className="flex items-center justify-between pb-5 border-b mb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-muted border flex items-center justify-center font-semibold text-lg text-foreground">
                            {initial}
                        </div>
                        <div>
                            {branch.link ? (
                                <a href={branch.link} target="_blank" rel="noreferrer" className="text-xl font-semibold tracking-tight text-foreground hover:underline decoration-border underline-offset-4 flex items-center gap-1.5">
                                    {branch.ad}
                                </a>
                            ) : (
                                <h2 className="text-xl font-semibold tracking-tight text-foreground">{branch.ad}</h2>
                            )}
                            <div className="text-sm text-muted-foreground mt-0.5">{branch.adres || branch.kod} · {donemler.length} rapor</div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openModal('editBranch', branch.kod)}>
                            <Settings className="w-4 h-4 mr-1.5" /> Ayarlar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openModal('addData', { kod: branch.kod })}>
                            <Plus className="w-4 h-4 mr-1.5" /> Veri Ekle
                        </Button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {[
                        { label: 'Harcama (Meta)', val: fmtC(tS) },
                        { label: 'Toplam Erişim', val: fmt(tR) },
                        { label: 'Görünürlük (Google)', val: fmt(tV) },
                        { label: 'Sonuç', val: fmt(tSonuc) },
                    ].map((stat, i) => (
                        <div key={i} className="p-4 rounded-lg border bg-card flex flex-col">
                            <span className="text-[13px] font-medium text-muted-foreground mb-1">{stat.label}</span>
                            <span className="text-2xl font-semibold tracking-tight text-foreground">{stat.val}</span>
                        </div>
                    ))}
                </div>

                {/* Bütçe Durumu Kartı */}
                {(() => {
                    // Önce budgetStatus'tan bak (tarih aralığına göre)
                    let bs = budgetStatus?.subeler?.find(b => b.kod === activeBranchCode);
                    
                    // budgetStatus yoksa veya bütçesi yoksa, donemCache'den en son bütçeli döneme bak
                    if ((!bs || !bs.toplamButce) && donemler.length > 0) {
                        // En son bütçe olan dönemi bul (desc sıralı)
                        const sorted = [...donemler].sort((a, b) => (b.baslangic || '').localeCompare(a.baslangic || ''));
                        const latestBudget = sorted.find(d => (d.planlanan_butce || 0) > 0);
                        if (latestBudget) {
                            const todayStr = new Date().toISOString().split('T')[0];
                            if (latestBudget.bitis >= todayStr) {
                                const pb = latestBudget.planlanan_butce || 0;
                                const dev = latestBudget.devredilen_miktar || 0;
                                const merk = latestBudget.merkez_destegi || 0;
                                const tb = pb + dev + merk;
                                const harc = latestBudget.harcama || 0;
                                const kalan = tb - harc;
                                const oran = tb > 0 ? Math.round((harc / tb) * 1000) / 10 : 0;
                                let durum = 'normal';
                                if (oran >= 100) durum = 'asim';
                                else if (oran >= 80) durum = 'uyari';
                                bs = { kod: activeBranchCode, planlananButce: pb, devredilen: dev, merkezDestegi: merk, toplamButce: tb, harcama: harc, kalan, kullanimOrani: oran, durum, donem: `${latestBudget.baslangic} - ${latestBudget.bitis}`, baslangic: latestBudget.baslangic, bitis: latestBudget.bitis };
                            }
                        }
                    }

                    if (!bs || !bs.toplamButce) return null;

                    let remainingDays = 0;
                    let dailyBudget = 0;
                    let projectedOverage = 0;
                    let currentDailySpend = 0;

                    if (bs.baslangic && bs.bitis && bs.kalan > 0) {
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        const startDate = new Date(bs.baslangic);
                        startDate.setHours(0,0,0,0);
                        const endDate = new Date(bs.bitis);
                        endDate.setHours(0,0,0,0);
                        
                        if (today <= endDate) {
                            const calcStart = today > startDate ? today : startDate;
                            remainingDays = Math.ceil((endDate - calcStart) / (1000 * 60 * 60 * 24)) + 1;
                        }
                        if (remainingDays > 0) {
                            dailyBudget = bs.kalan / remainingDays;
                        }

                        if (today > startDate && today <= endDate && bs.harcama > 0) {
                            const passedDays = Math.ceil((today - startDate) / (1000 * 60 * 60 * 24));
                            if (passedDays > 0) {
                                currentDailySpend = bs.harcama / passedDays;
                                const projectedTotal = bs.harcama + (currentDailySpend * remainingDays);
                                if (projectedTotal > bs.toplamButce) {
                                    projectedOverage = projectedTotal - bs.toplamButce;
                                }
                            }
                        }
                    }

                    const pct = Math.min(bs.kullanimOrani, 100);
                    const borderColor = bs.durum === 'asim' ? 'border-red-500/50' : bs.durum === 'uyari' ? 'border-amber-500/50' : 'border-border';
                    const barColor = bs.durum === 'asim' ? 'bg-red-500' : bs.durum === 'uyari' ? 'bg-amber-500' : 'bg-emerald-500';
                    return (
                        <div className={`p-4 rounded-lg border ${borderColor} bg-card mb-6`}>
                            <div className="flex items-center gap-2 mb-3">
                                <Wallet className={`w-4 h-4 ${bs.durum === 'asim' ? 'text-red-500' : bs.durum === 'uyari' ? 'text-amber-500' : 'text-emerald-500'}`} />
                                <span className="text-sm font-semibold text-foreground">Bütçe Durumu</span>
                                {bs.donem && <span className="text-[10px] text-muted-foreground ml-1">({bs.donem})</span>}
                                
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6 ml-1 text-muted-foreground hover:text-foreground"
                                    disabled={isRefreshing}
                                    onClick={() => handleRefresh(bs.baslangic, bs.bitis)}
                                    title="Dönem verilerini yenile"
                                >
                                    {isRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                </Button>

                                {bs.durum === 'asim' && (
                                    <span className="ml-auto text-xs font-medium text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" /> Bütçe Aşıldı
                                    </span>
                                )}
                                {bs.durum === 'uyari' && (
                                    <span className="ml-auto text-xs font-medium text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">
                                        Bütçe Sınırına Yakın
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-4 mb-3">
                                <div>
                                    <div className="text-xs text-muted-foreground">Planlanan</div>
                                    <div className="text-lg font-semibold text-foreground">{fmtC(bs.toplamButce)}</div>
                                    {(bs.devredilen > 0 || bs.merkezDestegi > 0) && (
                                        <div className="text-[10px] text-muted-foreground">
                                            {fmtC(bs.planlananButce)}
                                            {bs.devredilen > 0 && <> + {fmtC(bs.devredilen)} devir</>}
                                            {bs.merkezDestegi > 0 && <> + {fmtC(bs.merkezDestegi)} merkez</>}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Harcanan</div>
                                    <div className={`text-lg font-semibold ${bs.durum === 'asim' ? 'text-red-500' : 'text-foreground'}`}>{fmtC(bs.harcama)}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Kalan</div>
                                    <div className={`text-lg font-semibold ${bs.kalan < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmtC(bs.kalan)}</div>
                                    {remainingDays > 0 && dailyBudget > 0 && (
                                        <div className="text-[10px] text-muted-foreground mt-0.5">
                                            Günlük: {fmtC(dailyBudget)} ({remainingDays} gün)
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className={`text-xs font-semibold ${bs.durum === 'asim' ? 'text-red-500' : bs.durum === 'uyari' ? 'text-amber-500' : 'text-muted-foreground'}`}>
                                    %{Math.round(bs.kullanimOrani)}
                                </span>
                            </div>
                            
                            {projectedOverage > 0 && remainingDays > 0 && dailyBudget > 0 && bs.durum !== 'asim' && (
                                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md text-xs text-amber-700 dark:text-amber-400/90 flex items-start gap-2.5 leading-relaxed">
                                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                    <div>
                                        Mevcut harcama hızıyla (<span className="font-semibold">{fmtC(currentDailySpend)}/gün</span>) devam edilirse dönem sonunda bütçe <span className="font-semibold">{fmtC(projectedOverage)}</span> aşılacak. Hedefi tutturmak için kalan günlerde <span className="font-semibold underline underline-offset-2">günlük en fazla {fmtC(dailyBudget)}</span> harcanmalıdır.
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Table */}
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">Dönemler</h3>
                    {totalPages > 1 && (
                        <div className="text-xs text-muted-foreground">
                            {sortedDonemler.length} dönem
                        </div>
                    )}
                </div>

                {donemler.length === 0 ? (
                    <div className="py-12 px-5 text-center text-muted-foreground bg-card rounded-lg border border-dashed">
                        <BarChart2 className="w-8 h-8 mb-3 text-muted-foreground/50 mx-auto" />
                        <div className="text-sm font-medium text-foreground mb-1">Kayıt Bulunamadı</div>
                        <div className="text-xs">Bu şube için gösterilecek bir rapor verisi yok.</div>
                    </div>
                ) : (
                    <>
                        <div className="border rounded-lg bg-card overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 border-b">
                                    <tr>
                                        <th onClick={() => setSort('donem')} className="cursor-pointer select-none px-4 py-2.5 text-left font-medium text-muted-foreground text-xs whitespace-nowrap">Dönem <SortIcon col="donem" /></th>
                                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">Veri</th>
                                        <th className="w-[120px]"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {paginatedDonemler.map((d) => {
                                        const hM = !!d.meta;
                                        const hG = !!d.google;
                                        return (
                                            <tr key={d.baslangic} className="hover:bg-muted/30 transition-colors group">
                                                <td className="px-4 py-3 text-[13px] font-medium text-foreground whitespace-nowrap">
                                                    {formatDateTR(d.baslangic)} - {formatDateTR(d.bitis)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex gap-1.5 items-center">
                                                        {hM && <span className="w-2 h-2 rounded-full bg-blue-500" title="Meta" />}
                                                        {hG && <span className="w-2 h-2 rounded-full bg-orange-500" title="Google" />}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2">
                                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={() => openModal('dataEdit', { kod: branch.kod, baslangic: d.baslangic, bitis: d.bitis })}>
                                                            <SlidersHorizontal className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={() => openModal('preview', { kod: branch.kod, ad: branch.ad, b: d.baslangic, e: d.bitis })}>
                                                            <Eye className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={() => openModal('downloadPdf', { kod: branch.kod, ad: branch.ad, b: d.baslangic, e: d.bitis })}>
                                                            <FileDown className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={() => openModal('deleteDonem', { kod: branch.kod, b: d.baslangic, e: d.bitis })}>
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-3 mb-4">
                                <div className="text-xs text-muted-foreground">
                                    {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, sortedDonemler.length)} / {sortedDonemler.length}
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button variant="outline" size="icon" className="w-7 h-7" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                    </Button>
                                    <span className="text-xs text-muted-foreground px-2">
                                        {currentPage} / {totalPages}
                                    </span>
                                    <Button variant="outline" size="icon" className="w-7 h-7" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {totalPages <= 1 && <div className="mb-4" />}
                    </>
                )}
            </div>
        </div>
    );
}
