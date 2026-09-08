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
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
    ArrowLeft, Plus, Loader2, Trash2, CheckCircle2,
    Clock, Users, Wallet, FileText, ExternalLink, ArrowUpDown, Check, Pencil, FileDown,
    Banknote, Receipt, CircleDollarSign, Building2, RotateCcw,
} from 'lucide-react';
import { format, differenceInDays, isPast, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useConfirm } from '../../../shared/components/Toast';
import api from '../../../services/api';
import BudgetCampaignForm from '../components/BudgetCampaignForm';
import { parcaYukle } from '../../../shared/utils/parca-yukle';

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
    const [addingSube, setAddingSube] = useState(false);
    const [devretildi, setDevretildi] = useState(new Set());
    const [ciktiBusy, setCiktiBusy] = useState(false);
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
            const { data } = await api.post(`/reports/butce-kampanya/${selectedCampaign}/onayla`);
            // Toplama devam mı ediyor, kampanya kapandı mı — bu ayrım artık
            // önemli: onay, cevap vermemiş şube kaldığı sürece kampanyayı
            // kapatmıyor (bkz. budget-routes.js toplu onay).
            toast.success(data?.kampanyaKapandi
                ? 'Tüm bildirimler onaylandı, kampanya kapandı.'
                : `Bildirimler onaylandı. ${data?.bekleyen ?? 0} şube hâlâ cevap vermedi, kampanya açık kalıyor.`);
            fetchDetail(selectedCampaign);
            fetchCampaigns();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Onaylama başarısız.');
        } finally {
            setApprovingAll(false);
        }
    };

    /**
     * Kapanmış kampanyayı yeniden açar.
     *
     * Kapanan kampanyaya bildirim gönderilemiyor. Eskiden dönüş yolu yoktu:
     * durum hiçbir uçtan yazılamıyordu ve aynı id ile yeni kampanya
     * açılamıyordu (id birincil anahtar). Yanlışlıkla kapanan bir dönem
     * kalıcı olarak kapalı kalıyordu.
     */
    const handleYenidenAc = async () => {
        const ok = await confirm('Kampanya yeniden açılsın mı? Cevap vermemiş şubeler tekrar bildirim yapabilir.');
        if (!ok) return;
        try {
            await api.put(`/reports/butce-kampanya/${selectedCampaign}`, { durum: 'aktif' });
            toast.success('Kampanya yeniden açıldı.');
            fetchDetail(selectedCampaign);
            fetchCampaigns();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Kampanya açılamadı.');
        }
    };

    const handleAddSube = async (subeKod) => {
        setAddingSube(true);
        try {
            await api.post(`/reports/butce-kampanya/${selectedCampaign}/sube/${subeKod}`);
            toast.success('Şube kampanyaya eklendi.');
            fetchDetail(selectedCampaign);
            fetchCampaigns();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Şube eklenemedi.');
        } finally {
            setAddingSube(false);
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
        // Yalnızca kampanyanın katılımcıları (yanitlar) listelenir. Sonradan eklenen
        // şubeler "Şube Ekle" ile kampanyaya dahil edilir (son tarih geçse de çalışır).
        const eksikSubeler = Object.entries(subeAdlari)
            .filter(([kod]) => !yanitlarMap[kod])
            .sort((a, b) => a[1].localeCompare(b[1], 'tr'));
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
        // Meta konum ücreti. Kampanya seçeneğinde yazılıysa o kullanılır; eski usul
        // kurulmuş kampanyalarda alan yoktur ve ücret tahsilata girmemiştir — o
        // durumda reklam bakiyesi üzerinden %5 ile TAMAMLANIR ki kartlar gerçek
        // maliyeti göstersin.
        const KONUM_ORANI = 0.05;
        const konumOran = (Number(bakiyeOpts[0]?.bakiye) && Number(bakiyeOpts[0]?.konum_ucreti))
            ? Number(bakiyeOpts[0].konum_ucreti) / Number(bakiyeOpts[0].bakiye) : KONUM_ORANI;
        // Kampanya kaydında YAZILI olan (tahsilata girmiş) konum ücreti
        const konumKayitliOf = (b) => {
            const bk = Number(b.secilen_bakiye) || 0;
            if (!bk) return 0;
            const opt = bakiyeOpts.find((o) => Number(o.bakiye) === bk);
            return opt && opt.konum_ucreti ? Number(opt.konum_ucreti) : 0;
        };
        // Gösterilen konum ücreti — yazılı yoksa %5 üzerinden hesaplanır
        const konumUcretiOf = (b) => {
            const bk = Number(b.secilen_bakiye) || 0;
            if (!bk) return 0;
            return konumKayitliOf(b) || Math.round(bk * konumOran);
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

        // ── Üst finansal özet ──
        // KDV ayrıştırması KAYITLI ÇİFTTEN yapılır: `kdv_dahil_tutar` brüt tahsilat,
        // `secilen_bakiye` aynı kaydın KDV hariç karşılığı. Böylece
        // "KDV dahil = KDV hariç + KDV tutarı" her zaman birebir tutar; sabit bir
        // oran varsayılmaz (kampanya seçenekleri farklı oran taşıyabilir).
        const toplamKonumUcreti = katilanlar.reduce((s, b) => s + konumUcretiOf(b), 0);
        const kayitliKonumToplam = katilanlar.reduce((s, b) => s + konumKayitliOf(b), 0);
        // "Hariç" kart hem KDV'den hem konum ücretinden arındırılmış tutarı gösterir
        // — yani şubenin saf reklam bakiyesi.
        const konumKdvHaricToplanan = toplamBakiye;
        // KDV, şubelerden FİİLEN tahsil edilen vergidir; konum ücreti tamamlaması
        // bu rakamı değiştirmez.
        const kdvTutari = toplamButce - toplamBakiye - kayitliKonumToplam;
        // Dahil = saf bakiye + konum ücreti + KDV. Seçenekte konum ücreti zaten
        // varsa toplam tahsilata eşit çıkar (çift sayım olmaz); yoksa %5 eklenir.
        const kdvDahilToplanan = toplamBakiye + toplamKonumUcreti + kdvTutari;
        // Meta konum ücreti reklam bakiyesinin PARÇASI DEĞİLDİR: reklam harcamasının
        // (şube bütçeleri + merkez desteği) ÜZERİNE eklenen ayrı bir maliyettir.
        const META_KONUM_ORANI = 0.05;
        const reklamHarcamasi = toplamBakiye + toplamMerkez;
        const metaKonumUcreti = reklamHarcamasi * META_KONUM_ORANI;
        const harcanacakTutar = reklamHarcamasi + metaKonumUcreti;

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

        // Yazdırılabilir kampanya çıktısı — rapor PDF'iyle aynı akış (gizli iframe +
        // window.print), geometri A4. KAYITLI veriyi basar; tablodaki henüz
        // onaylanmamış input değişiklikleri çıktıya girmez.
        const handleCikti = async () => {
            setCiktiBusy(true);
            try {
                // Gerçekleşen harcama bölümü opsiyonel — çekilemezse çıktı onsuz üretilir
                let harcama = null;
                try {
                    const { data } = await api.get('/reports/butce-durum', {
                        params: { since: kampanya.donem_baslangic, until: kampanya.donem_bitis },
                    });
                    const subeler = (data.subeler || []).filter((s) => s.toplamButce > 0);
                    if (subeler.length > 0) {
                        harcama = {
                            toplamButce: data.ozet?.toplamPlanlanan || 0,
                            toplamHarcama: data.ozet?.toplamHarcama || 0,
                            toplamKalan: data.ozet?.toplamKalan || 0,
                            asimSayisi: data.ozet?.asimSayisi || 0,
                            uyariSayisi: data.ozet?.uyariSayisi || 0,
                            subeler: [...subeler].sort((a, b) => b.harcama - a.harcama),
                        };
                    }
                } catch {
                    /* harcama bölümü olmadan devam */
                }

                const [{ butceCiktiHtml }, { raporPdfIndir }] = await Promise.all([
                    parcaYukle(() => import('../utils/butce-cikti-sablonu'), 'Çıktı şablonu'),
                    parcaYukle(() => import('../utils/pdf-yazdir'), 'PDF modülü'),
                ]);

                const html = butceCiktiHtml({
                    baslik: kampanya.baslik,
                    donemBaslangic: kampanya.donem_baslangic,
                    donemBitis: kampanya.donem_bitis,
                    sonTarih: kampanya.son_tarih,
                    durum: status,
                    aliciAdi: kampanya.alici_adi,
                    iban: kampanya.iban,
                    odemeNotu: kampanya.odeme_notu,
                    bakiyeSecenekleri: bakiyeOpts,
                    satirlar: sortedBildirimler.map((b) => ({
                        ad: b.sube_adi || b.sube_kod,
                        kod: b.sube_kod,
                        durum: b.durum,
                        oncekiKatildi: b.onceki_katildi,
                        oncekiKalan: b.onceki_kalan ?? null,
                        devredilen: Number(b.devredilen) || 0,
                        merkezDestegi: Number(b.merkez_destegi) || 0,
                        bakiye: Number(b.secilen_bakiye) || 0,
                        konumUcreti: konumUcretiOf(b),
                        kdvDahil: kdvDahilOf(b),
                        dekontVar: !!b.dekont_url,
                        gonderimTarihi: b.gonderim_tarihi,
                    })),
                    ozet: {
                        toplamBakiye,
                        toplamMerkez,
                        toplamDevir,
                        harcanacak: harcanacakTutar,
                        toplananKdv: kdvDahilToplanan,
                        onaylananKdv: onaylananButce,
                        // Ekrandaki üst özetle birebir aynı rakamlar (çelişki olmasın)
                        kdvHaric: konumKdvHaricToplanan,
                        kdvTutari,
                        toplamKonumUcreti,
                        reklamHarcamasi,
                        metaKonumUcreti,
                        metaOrani: META_KONUM_ORANI,
                    },
                    katilim: {
                        toplam: toplamSube,
                        dolduran: dolduranSayisi,
                        onaylanan: onaylananSayisi,
                        gonderildi: gonderildiSayisi,
                        bekleyen: bekleyenSayisi,
                        yuzde: tamamlanmaPct,
                    },
                    harcama,
                    olusturma: new Date().toISOString(),
                });

                // Rapor PDF'iyle aynı geometri: 480px genişlik, ölçülen yükseklikte tek sayfa
                await raporPdfIndir(html, `butce-${kampanya.donem_baslangic}_${kampanya.donem_bitis}`);
                toast.success('Çıktı PDF olarak indirildi.');
            } catch (err) {
                toast.error(err.message || 'Çıktı oluşturulamadı.');
            } finally {
                setCiktiBusy(false);
            }
        };

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
                        {eksikSubeler.length > 0 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" disabled={addingSube}>
                                        {addingSube
                                            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            : <Plus className="w-4 h-4 mr-2" />}
                                        Şube Ekle
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                                    {eksikSubeler.map(([kod, ad]) => (
                                        <DropdownMenuItem key={kod} onClick={() => handleAddSube(kod)}>
                                            {ad}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        <Button variant="outline" onClick={handleCikti} disabled={ciktiBusy}>
                            {ciktiBusy
                                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                : <FileDown className="w-4 h-4 mr-2" />}
                            Çıktı Al
                        </Button>
                        <Button variant="outline" onClick={() => { setEditKampanya(kampanya); setModalOpen(true); }}>
                            <Pencil className="w-4 h-4 mr-2" /> Düzenle
                        </Button>
                        {/* Kapanmış kampanyada toplama durur; yeniden açmak
                            merkezin elinde olmalı. */}
                        {kampanya.durum === 'tamamlandi' && (
                            <Button variant="outline" onClick={handleYenidenAc}>
                                <RotateCcw className="w-4 h-4 mr-2" /> Yeniden Aç
                            </Button>
                        )}
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

                {/* Summary Cards — üst finansal özet */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* 1. KDV DAHİL TOPLANAN TUTAR */}
                    <div className="rounded-xl border bg-card p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="rounded-lg bg-violet-100 dark:bg-violet-900/30 p-1.5">
                                <Banknote className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                            </div>
                            <span className="text-xs text-muted-foreground leading-tight">KDV + Konum Ücreti Dahil Toplanan Tutar</span>
                        </div>
                        <p className="text-xl font-semibold tracking-tight tabular-nums">{fmtCurrency(kdvDahilToplanan)}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                            Şubelerden tahsil edilen, KDV ve konum ücreti dahil toplam tutar
                        </p>
                    </div>

                    {/* 2. KDV HARİÇ TOPLANAN TUTAR */}
                    <div className="rounded-xl border bg-card p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="rounded-lg bg-sky-100 dark:bg-sky-900/30 p-1.5">
                                <CircleDollarSign className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                            </div>
                            <span className="text-xs text-muted-foreground leading-tight">KDV + Konum Ücreti Hariç Toplanan Tutar</span>
                        </div>
                        <p className="text-xl font-semibold tracking-tight tabular-nums">{fmtCurrency(konumKdvHaricToplanan)}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                            Şubelerden tahsil edilen tutarın KDV ve konum ücreti hariç karşılığı
                        </p>
                    </div>

                    {/* 3. KDV TUTARI */}
                    <div className="rounded-xl border bg-card p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-1.5">
                                <Receipt className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            <span className="text-xs text-muted-foreground leading-tight">KDV Tutarı</span>
                        </div>
                        <p className="text-xl font-semibold tracking-tight tabular-nums">{fmtCurrency(kdvTutari)}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                            Şubelerden tahsil edilen toplam tutarın KDV tutarı
                        </p>
                    </div>

                    {/* 4. HARCANACAK TUTAR */}
                    <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-1.5">
                                <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <span className="text-xs text-emerald-800/80 dark:text-emerald-300/80 leading-tight">Harcanacak Tutar</span>
                        </div>
                        <p className="text-xl font-semibold tracking-tight tabular-nums text-emerald-700 dark:text-emerald-400">
                            {fmtCurrency(harcanacakTutar)}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                            Şube reklam bütçeleri + merkezi destek + %5 Meta Konum Ücreti
                        </p>
                        <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5 tabular-nums">
                            Meta konum ücreti: {fmtCurrency(metaKonumUcreti)}
                        </p>
                    </div>

                    {/* 6. MERKEZ DESTEĞİ */}
                    <div className="rounded-xl border bg-card p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-1.5">
                                <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            <span className="text-xs text-muted-foreground leading-tight">Merkez Desteği</span>
                        </div>
                        <p className="text-xl font-semibold tracking-tight tabular-nums">{fmtCurrency(toplamMerkez)}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                            Şubelere verilen merkezi destek
                        </p>
                    </div>

                    {/* Katılan şube sayısı */}
                    <div className="rounded-xl border bg-card p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-1.5">
                                <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <span className="text-xs text-muted-foreground leading-tight">Katılan Şube</span>
                        </div>
                        <p className="text-xl font-semibold tracking-tight tabular-nums">{dolduranSayisi}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                            Kampanyaya katılan şube sayısı
                        </p>
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
                                    <TableHead className="text-right">Konum Ücreti</TableHead>
                                    <TableHead className="text-right">KDV Dahil</TableHead>
                                    <TableHead className="w-[100px]">Dekont</TableHead>
                                    <TableHead>Tarih</TableHead>
                                    <TableHead className="text-right w-[100px] pr-5">İşlem</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedBildirimler.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
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
                                                <TableCell className="text-right tabular-nums text-sm">
                                                    {konumUcretiOf(b)
                                                        ? <span className="font-medium">{fmtCurrency(konumUcretiOf(b))}</span>
                                                        : <span className="text-muted-foreground/40">—</span>}
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
                                                {/* Gönderen kim: bir şubenin birden fazla sahibi
                                                    olabiliyor, yanıt ise şube bazında tutuluyor.
                                                    Tarihin altında kimin gönderdiği yazmazsa
                                                    çift sahipli şubede iz kalmıyordu. */}
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {b.gonderim_tarihi ? (
                                                        <>
                                                            <div>{fmtDate(b.gonderim_tarihi)}</div>
                                                            {b.gonderen_ad && (
                                                                <div className="truncate text-[10px] text-muted-foreground/70" title={b.gonderen_ad}>
                                                                    {b.gonderen_ad}
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : <span className="text-muted-foreground/40">—</span>}
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
