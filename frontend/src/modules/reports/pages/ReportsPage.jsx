import React, { useEffect, useState } from 'react';
import { useReportsStore, reportsApi, toastFetchSonuclari } from '../hooks/useReports';
import { BranchSidebar } from '../components/BranchSidebar';
import { BranchDetail } from '../components/BranchDetail';
import { ReportsModals } from '../components/ReportsModals';
import { Button } from '@/components/ui/button';
import { CalendarIcon, DownloadCloud, UploadCloud, Settings, FileDown, MapPin, Loader2, Wallet } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function ReportsPage() {
    const loadDashboard = useReportsStore((s) => s.loadDashboard);
    const dateRange = useReportsStore((s) => s.dateRange);
    const setDateRange = useReportsStore((s) => s.setDateRange);
    const settings = useReportsStore((s) => s.settings);
    const branches = useReportsStore((s) => s.branches);
    const openModal = useReportsStore((s) => s.openModal);
    const selectBranch = useReportsStore((s) => s.selectBranch);

    // Veri çekimi sonrası: şube listesini + cache'i tazele, aktif şubeyi yeniden çek.
    // Aktif şube store'dan TAZE okunur — tıklama anındaki değere kapanmak (stale
    // closure), çekim sürerken şube değiştiren kullanıcıyı eski şubeye geri zıplatıyordu.
    const refreshAfterFetch = async () => {
        await loadDashboard(true);
        const guncelAktif = useReportsStore.getState().activeBranch;
        if (guncelAktif) await selectBranch(guncelAktif, true);
    };

    const [isFetchingMeta, setIsFetchingMeta] = useState(false);
    const [isFetchingGoogle, setIsFetchingGoogle] = useState(false);
    const [isFetchingBudget, setIsFetchingBudget] = useState(false);
    const budgetStatus = useReportsStore((s) => s.budgetStatus);

    useEffect(() => {
        loadDashboard();
    }, [loadDashboard]);

    // Tarih aralığı değiştiğinde bütçe durumunu otomatik çek
    useEffect(() => {
        if (dateRange.since && dateRange.until) {
            reportsApi.fetchBudgetStatus(dateRange.since, dateRange.until).catch(() => {});
        }
    }, [dateRange.since, dateRange.until]);

    const handleMetaFetch = async () => {
        if (!settings.hasMetaToken) return toast.error('Meta token eksik. Ayarlardan ekleyin.');
        if (!dateRange.since || !dateRange.until) return toast.error('Tarih aralığı seçin.');
        
        setIsFetchingMeta(true);
        try {
            await reportsApi.globalMetaFetch(dateRange.since, dateRange.until, null);
            toast.success('Meta verileri çekildi.');
            await refreshAfterFetch();
        } catch (err) {
            toast.error(err.message || 'Meta verileri çekilemedi.');
        } finally {
            setIsFetchingMeta(false);
        }
    };

    const handleGoogleFetch = async () => {
        if (!dateRange.since || !dateRange.until) return toast.error('Tarih aralığı seçin.');
        
        setIsFetchingGoogle(true);
        try {
            await reportsApi.globalGoogleFetch(dateRange.since, dateRange.until);
            toast.success('Google verileri çekildi.');
            await refreshAfterFetch();
        } catch (err) {
            toast.error(err.message || 'Google verileri çekilemedi.');
        } finally {
            setIsFetchingGoogle(false);
        }
    };

    const handleFetchAll = async () => {
        if (!dateRange.since || !dateRange.until) return toast.error('Tarih aralığı seçin.');

        setIsFetchingMeta(true);
        setIsFetchingGoogle(true);
        const promises = [];
        const etiketler = [];
        if (settings.hasMetaToken) {
            promises.push(reportsApi.globalMetaFetch(dateRange.since, dateRange.until, null));
            etiketler.push('Meta');
        }
        promises.push(reportsApi.globalGoogleFetch(dateRange.since, dateRange.until));
        etiketler.push('Google');

        const sonuclar = await Promise.allSettled(promises);
        toastFetchSonuclari(sonuclar, etiketler, {
            basari: 'Tüm veriler çekildi.',
            hepsiHata: 'Veriler çekilemedi',
            kismi: 'Kısmen çekildi',
        });
        setIsFetchingMeta(false);
        setIsFetchingGoogle(false);
        await refreshAfterFetch();
    };

    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
    const handleBulkPdf = async () => {
        if (!dateRange.since || !dateRange.until) return toast.error('Tarih aralığı seçin.');
        if (branches.length === 0) return toast.error('İndirilecek şube bulunamadı.');

        setIsDownloadingPdf(true);
        toast.info('📦 Toplu ZIP hazırlanıyor... Lütfen bekleyin.');
        try {
            const subeKodlari = branches.map(s => s.kod);
            await reportsApi.bulkPdf(subeKodlari, dateRange.since, dateRange.until);
            toast.success('Tüm PDF\'ler ZIP olarak indirildi!');
        } catch (err) {
            toast.error(err.message || 'ZIP oluşturulamadı.');
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    const DatePicker = ({ label, value, onChange }) => (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[130px] justify-start text-left font-normal bg-background text-xs h-8 px-3", !value && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {value ? format(new Date(value), 'd MMM yyyy', { locale: tr }) : label}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={value ? new Date(value) : undefined}
                    onSelect={(d) => onChange(d ? format(d, 'yyyy-MM-dd') : '')}
                    initialFocus
                    locale={tr}
                />
            </PopoverContent>
        </Popover>
    );

    return (
        <div className="flex flex-col gap-4 w-full h-[calc(100vh-88px)] overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl leading-none tracking-tight text-foreground">Raporlar</h1>
                    <p className="text-sm text-muted-foreground mt-1">Şube performans raporlarını görüntüleyin ve yönetin.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-8" onClick={() => openModal('bulkUpload')}>
                        <UploadCloud className="w-4 h-4 mr-2" /> Toplu Veri
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => openModal('settings')}>
                        <Settings className="w-4 h-4 mr-2" /> Ayarlar
                    </Button>
                </div>
            </div>

            {branches.length > 0 && (
                <div className="bg-card border rounded-lg p-3 flex flex-wrap items-center justify-between gap-4 shrink-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-xs font-medium text-muted-foreground mr-2">Dönem:</div>
                        <DatePicker label="Başlangıç" value={dateRange.since} onChange={(v) => setDateRange({ ...dateRange, since: v })} />
                        <span className="text-muted-foreground text-xs mx-1">ile</span>
                        <DatePicker label="Bitiş" value={dateRange.until} onChange={(v) => setDateRange({ ...dateRange, until: v })} />
                    </div>
                    
                    <div className="flex items-center gap-2 flex-wrap">
                        {settings.hasMetaToken && (
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleMetaFetch} disabled={isFetchingMeta}>
                                {isFetchingMeta ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : (
                                    <svg className="w-3.5 h-3.5 mr-1.5 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M12 10.2c-.9-1.3-2.1-2.2-3.5-2.7-1.4-.5-2.8-.3-4 .5C3.3 8.8 2.4 10 2 11.5c-.3 1.2-.2 2.4.3 3.5.5 1.1 1.3 2 2.3 2.6.7.4 1.5.6 2.3.6.6 0 1.2-.1 1.7-.3 1.1-.4 2-1.2 2.8-2.2l.6-.8.6.8c.8 1 1.7 1.8 2.8 2.2.5.2 1.1.3 1.7.3.8 0 1.6-.2 2.3-.6 1-.6 1.8-1.5 2.3-2.6.5-1.1.6-2.3.3-3.5-.4-1.5-1.3-2.7-2.5-3.5-1.2-.8-2.6-1-4-.5-1.4.5-2.6 1.4-3.5 2.7z"/></svg>
                                )}
                                Meta Çek
                            </Button>
                        )}
                        
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleGoogleFetch} disabled={isFetchingGoogle}>
                            {isFetchingGoogle ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5 mr-1.5 text-orange-500" />} Google Çek
                        </Button>

                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleFetchAll} disabled={isFetchingMeta || isFetchingGoogle}>
                            {(isFetchingMeta || isFetchingGoogle) ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <DownloadCloud className="w-3.5 h-3.5 mr-1.5" />} Tümünü Çek
                        </Button>

                        <div className="w-px h-5 bg-border mx-2" />

                        <Button size="sm" variant="outline" className="h-8 text-xs bg-card" onClick={handleBulkPdf} disabled={isDownloadingPdf}>
                            {isDownloadingPdf ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5 mr-1.5" />} Toplu ZIP
                        </Button>
                    </div>
                </div>
            )}
            
            <div className="flex-1 flex overflow-hidden border rounded-lg bg-card min-h-0">
                <BranchSidebar />
                <BranchDetail />
            </div>

            <ReportsModals />
        </div>
    );
}
