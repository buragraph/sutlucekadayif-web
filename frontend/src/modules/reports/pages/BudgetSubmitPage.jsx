import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
    Loader2, Upload, CheckCircle2, Copy, Wallet, FileText, AlertCircle, Camera,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import api from '../../../services/api';
import { useConfirm } from '../../../shared/components/Toast';

const fmtCurrency = (val) => new Intl.NumberFormat('tr-TR').format(val) + ' ₺';
const fmtDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
        return format(parseISO(dateStr), 'd MMMM yyyy', { locale: tr });
    } catch {
        return dateStr;
    }
};

// Katıldığı kampanya özeti — dönem sonuna kadar görünür
function KatilimKarti({ k }) {
    const onaylandi = k.durum === 'onaylandi';
    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{k.baslik}</CardTitle>
                    <Badge className={onaylandi
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs'}>
                        {onaylandi ? 'Onaylandı' : 'Onay bekliyor'}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Dönem</span>
                    <span className="font-medium">{fmtDate(k.donem_baslangic)} – {fmtDate(k.donem_bitis)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Katıldığınız Bakiye</span>
                    <span className="font-medium">{fmtCurrency(k.secilen_bakiye)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">KDV Dahil Ödenen</span>
                    <span className="font-medium">{fmtCurrency(k.kdv_dahil_tutar)}</span>
                </div>
                <p className="pt-1 text-xs text-muted-foreground">
                    Bu özet dönem sonuna ({fmtDate(k.donem_bitis)}) kadar görünür.
                </p>
            </CardContent>
        </Card>
    );
}

export default function BudgetSubmitPage() {
    const confirm = useConfirm();
    const [loading, setLoading] = useState(true);
    const [kampanya, setKampanya] = useState(null);
    const [katildiklarim, setKatildiklarim] = useState([]);

    const [selectedBakiye, setSelectedBakiye] = useState(null);
    const [dekontFile, setDekontFile] = useState(null);
    const [notlar, setNotlar] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/reports/butce-bekleyen');
            const kampanyalar = data.kampanyalar || [];
            setKampanya(kampanyalar[0] || null);
            setKatildiklarim(data.katildiklarim || []);
        } catch (err) {
            if (err.response?.status !== 404) {
                toast.error('Bilgi yüklenemedi.');
            }
            setKampanya(null);
            setKatildiklarim([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Seçilen görselin küçük önizlemesi. Blob URL'i dosya değişince serbest
    // bırakılıyor, yoksa her seçimde bir tane sızıyor.
    const [dekontOnizleme, setDekontOnizleme] = useState(null);
    useEffect(() => {
        if (!dekontFile || !dekontFile.type.startsWith('image/')) { setDekontOnizleme(null); return; }
        const url = URL.createObjectURL(dekontFile);
        setDekontOnizleme(url);
        return () => URL.revokeObjectURL(url);
    }, [dekontFile]);

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

        // `ustuneYaz`: bir şubenin birden fazla sahibi olabiliyor ve yanıt şube
        // bazında tutuluyor. Sunucu, başkası cevap vermişse 409 + çakışma
        // bilgisi döner; kullanıcıya kimin ne gönderdiğini gösterip onayını
        // alıyoruz. Onaysız üzerine yazma yok.
        const gonder = async (ustuneYaz = false) => {
            const formData = new FormData();
            formData.append('secilen_bakiye', option.bakiye);
            formData.append('kdv_dahil_tutar', option.kdv_dahil);
            formData.append('notlar', notlar);
            if (dekontFile) formData.append('dekont', dekontFile);
            if (ustuneYaz) formData.append('ustune_yaz', 'evet');

            return api.post(`/reports/butce-gonder/${kampanya.id}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
        };

        setSubmitting(true);
        try {
            try {
                await gonder();
            } catch (err) {
                const c = err.response?.status === 409 && err.response.data?.cakisma;
                if (!c) throw err;
                const onay = await confirm(
                    `Bu kampanyaya şubenizden ${c.gonderen_ad} zaten cevap verdi`
                    + (c.secilen_bakiye ? ` (${fmtCurrency(c.secilen_bakiye)} bakiye)` : '')
                    + (c.gonderim_tarihi ? `, ${fmtDate(c.gonderim_tarihi)}` : '')
                    + '. Sizin bildiriminiz onunkinin yerine geçsin mi?'
                );
                if (!onay) { setSubmitting(false); return; }
                await gonder(true);
            }

            toast.success('Bütçe bildirimi gönderildi.');
            // Formu sıfırla ve yeniden çek — kampanya "katıldıklarım" özetine geçer
            setSelectedBakiye(null);
            setDekontFile(null);
            setNotlar('');
            await fetchData();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Bildirim gönderilemedi.');
        } finally {
            setSubmitting(false);
        }
    };

    // Seçilen seçeneğin ödenecek tutarı — gönder düğmesinde tekrar gösteriliyor.
    const secilenSecenek = (kampanya?.bakiye_secenekleri || []).find(
        (o) => Number(o.bakiye) === Number(selectedBakiye));
    const odenecek = secilenSecenek ? Number(secilenSecenek.kdv_dahil) : 0;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const header = (
        <div>
            <h1 className="text-3xl leading-none tracking-tight text-foreground">Bütçe Bildirim</h1>
            <p className="text-sm text-muted-foreground mt-1">
                Aktif kampanya için bütçe bildirimi yapın.
            </p>
        </div>
    );

    const katilimBolumu = katildiklarim.length > 0 && (
        <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Katıldığınız Kampanyalar</h2>
            <div className="grid gap-3 sm:grid-cols-2">
                {katildiklarim.map((k) => <KatilimKarti key={k.id} k={k} />)}
            </div>
        </div>
    );

    // Bekleyen kampanya yoksa: katıldıklarım varsa onları, yoksa boş durum
    if (!kampanya) {
        return (
            <div className="flex flex-col gap-6 w-full">
                {header}
                {katilimBolumu}
                {katildiklarim.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground max-w-md mx-auto text-center">
                        <Wallet className="w-12 h-12 mb-4 opacity-30" />
                        <p className="text-lg font-medium">Bekleyen bütçe bildirimi yok</p>
                        <p className="text-sm mt-1">
                            Şu anda aktif bir bütçe kampanyası bulunmuyor. Yeni bir kampanya açıldığında burada görüntülenecektir.
                        </p>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 w-full">
            {header}
            {katilimBolumu}

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
                        {/* IBAN TELEFONDA TAM SATIR. Tek satırda `truncate` ile
                            durduğu sürece numara okunmuyordu; havaleyi yapacak
                            kişi ya elle yazacak ya kopyalayacak — ikisi de
                            numaranın tamamını istiyor. Kopyala düğmesi de parmak
                            hedefi olacak kadar büyük (h-11), telefonda tam en. */}
                        {kampanya.iban && (
                            <div className="space-y-2">
                                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">IBAN</span>
                                <code className="block break-all rounded border bg-background px-3 py-2 font-mono text-sm">
                                    {kampanya.iban}
                                </code>
                                <Button
                                    type="button" variant="outline"
                                    className="h-11 w-full sm:h-9 sm:w-auto"
                                    onClick={handleCopyIban}
                                >
                                    <Copy className="mr-2 size-4" /> IBAN'ı kopyala
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
                    <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Reklam bakiyesi</span> reklama harcanan tutardır.
                        Meta, reklam harcaması üzerinden ayrıca <span className="font-medium text-foreground">konum ücreti</span> alır;
                        KDV bu ikisinin toplamı üzerinden hesaplanır. Bankaya yatıracağınız tutar
                        <span className="font-medium text-foreground"> ödenecek tutar</span>dır.
                    </p>
                    {/* SEÇİM TABLOSU DEĞİL, SEÇİM KARTLARI.
                        Bu sayfa telefonda dolduruluyor: şube bankadan havaleyi
                        yapıp dekontun fotoğrafını yüklüyor. Beş sütunlu tablo
                        375px'te ya yana kayıyor ya da eziliyordu; satırın kendisi
                        de 4px'lik bir radyo dairesi kadar hedefti. Artık her
                        seçenek tam genişlikte bir düğme: telefonda ödenecek tutar
                        en büyük sayı, ayrıntı altında; sm'den itibaren aynı
                        kartlar dört sütuna hizalanıyor. */}
                    <div className="hidden gap-3 px-3 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1.5rem_1fr_1fr_1fr_1.2fr]">
                        <span />
                        <span className="text-right">Reklam Bakiyesi</span>
                        <span className="text-right">Konum Ücreti</span>
                        <span className="text-right">KDV</span>
                        <span className="text-right">Ödenecek Tutar</span>
                    </div>
                    <div className="flex flex-col gap-2">
                        {(kampanya.bakiye_secenekleri || []).map((opt, i) => {
                            const secili = Number(selectedBakiye) === Number(opt.bakiye);
                            const kdv = opt.kdv
                                ? Number(opt.kdv)
                                : Number(opt.kdv_dahil) - Number(opt.bakiye) - Number(opt.konum_ucreti || 0);
                            return (
                                <button
                                    type="button"
                                    key={i}
                                    onClick={() => setSelectedBakiye(opt.bakiye)}
                                    aria-pressed={secili}
                                    className={cn(
                                        'w-full rounded-xl border p-3 text-left transition-colors',
                                        'sm:grid sm:grid-cols-[1.5rem_1fr_1fr_1fr_1.2fr] sm:items-center sm:gap-3 sm:px-3',
                                        secili
                                            ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                            : 'hover:bg-muted/40',
                                    )}
                                >
                                    <span className="flex items-center gap-3 sm:contents">
                                        <span
                                            className={cn(
                                                'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                                                secili ? 'border-primary' : 'border-muted-foreground/30',
                                            )}
                                        >
                                            {secili && <span className="size-2.5 rounded-full bg-primary" />}
                                        </span>

                                        {/* Telefonda başlık ÖDENECEK TUTAR: bankaya yazılacak
                                            sayı o. Bakiye ve ayrıntı altına iniyor. */}
                                        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2 sm:contents">
                                            <span className="text-sm text-muted-foreground sm:order-1 sm:text-right sm:text-sm sm:text-foreground sm:font-medium">
                                                <span className="sm:hidden">Bakiye </span>
                                                {fmtCurrency(opt.bakiye)}
                                            </span>
                                            <span className="hidden text-right text-sm text-muted-foreground sm:order-2 sm:block">
                                                {opt.konum_ucreti ? fmtCurrency(opt.konum_ucreti) : '—'}
                                            </span>
                                            <span className="hidden text-right text-sm text-muted-foreground sm:order-3 sm:block">
                                                {fmtCurrency(kdv)}
                                            </span>
                                            <span className="shrink-0 text-right sm:order-4">
                                                <span className="block whitespace-nowrap text-lg font-semibold tabular-nums text-foreground sm:text-sm">
                                                    {fmtCurrency(opt.kdv_dahil)}
                                                </span>
                                                <span className="block text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">
                                                    ödenecek
                                                </span>
                                            </span>
                                        </span>
                                    </span>

                                    {/* Ayrıntı yalnızca telefonda: masaüstünde kendi sütunlarında. */}
                                    <span className="mt-1 block pl-8 text-xs text-muted-foreground sm:hidden">
                                        {opt.konum_ucreti ? `konum ücreti ${fmtCurrency(opt.konum_ucreti)} · ` : ''}
                                        KDV {fmtCurrency(kdv)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Dekont Yükleme */}
                <div className="space-y-2">
                    <Label className="text-sm font-medium">Dekont Yükleme</Label>
                    {/* TELEFONDA DEKONT = FOTOĞRAF. Şube havaleyi banka
                        uygulamasından yapıyor ve dekontu ya ekran görüntüsü ya da
                        kamerayla çekiyor; tek bir "dosya seç" bağlantısı bu işi
                        anlatmıyordu. İki düğme: kamera (capture) ve galeri/dosya.
                        Seçilen görselin küçük önizlemesi de gösteriliyor —
                        yanlış fotoğrafı göndermek burada pahalı. */}
                    <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileChange}
                        className="hidden"
                        id="dekont-kamera"
                    />
                    <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleFileChange}
                        className="hidden"
                        id="dekont-upload"
                    />

                    {dekontFile ? (
                        <div className="flex items-center gap-3 rounded-lg border p-3">
                            {dekontOnizleme ? (
                                <img src={dekontOnizleme} alt=""
                                     className="size-14 shrink-0 rounded-md border object-cover" />
                            ) : (
                                <span className="flex size-14 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                                    <FileText className="size-6" />
                                </span>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-foreground">{dekontFile.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {dekontFile.size >= 1024 * 1024
                                        ? `${(dekontFile.size / 1024 / 1024).toFixed(1)} MB`
                                        : `${Math.max(1, Math.round(dekontFile.size / 1024))} KB`}
                                </p>
                            </div>
                            <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0"
                                    onClick={() => setDekontFile(null)}>
                                Kaldır
                            </Button>
                        </div>
                    ) : (
                        <div className="grid gap-2 sm:grid-cols-2">
                            <Button asChild type="button" variant="outline" className="h-12 sm:h-10">
                                <label htmlFor="dekont-kamera" className="cursor-pointer">
                                    <Camera className="mr-2 size-4" /> Fotoğraf çek
                                </label>
                            </Button>
                            <Button asChild type="button" variant="outline" className="h-12 sm:h-10">
                                <label htmlFor="dekont-upload" className="cursor-pointer">
                                    <Upload className="mr-2 size-4" /> Dosya seç
                                </label>
                            </Button>
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground">PDF, JPG, PNG · Maks 5 MB</p>
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

                {/* GÖNDER TELEFONDA SAYFAYA YAPIŞIK: form uzun, düğme en altta
                    kalınca seçim yapan kişi "gönderdim mi" diye aşağı iniyordu.
                    sm'den itibaren eski akışına dönüyor. */}
                <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:items-center sm:gap-3 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
                    <Button type="submit" disabled={submitting || !selectedBakiye}
                            className="h-12 w-full sm:h-9 sm:w-auto sm:min-w-[120px]">
                        {submitting ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                        )}
                        {selectedBakiye ? `${fmtCurrency(odenecek)} için bildirim gönder` : 'Gönder'}
                    </Button>
                    {!selectedBakiye && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Bir bakiye seçeneği seçin
                        </p>
                    )}
                </div>
            </form>
        </div>
    );
}
