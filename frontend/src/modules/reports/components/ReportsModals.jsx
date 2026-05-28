import React, { useEffect, useState, useRef } from 'react';
import { useReportsStore, reportsApi, fmtThousand, parseThousand, formatDateTR } from '../hooks/useReports';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { 
    Settings, UploadCloud, MapPin, Search, Loader2, GitBranch, Target, Edit2, 
    SlidersHorizontal, Check, Eye, Trash2, CalendarIcon, PlusCircle, AlertCircle, Info, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// --- Shared Components ---
const FormGroup = ({ label, children, description }) => (
    <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
        <Label className="text-[10px] font-bold text-foreground uppercase tracking-wide">{label}</Label>
        {children}
        {description && <div className="text-[11px] text-muted-foreground mt-1 leading-tight">{description}</div>}
    </div>
);

const DatePicker = ({ label, value, onChange }) => (
    <Popover>
        <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-full justify-start text-left font-normal bg-background text-xs h-9 px-3", !value && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {value ? format(new Date(value), 'd MMM yyyy', { locale: tr }) : label}
            </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={value ? new Date(value) : undefined} onSelect={(d) => onChange(d ? format(d, 'yyyy-MM-dd') : '')} initialFocus locale={tr} />
        </PopoverContent>
    </Popover>
);

// --- Settings Modal ---
export function SettingsModal() {
    const open = useReportsStore(s => s.modals.settings);
    const closeModal = () => useReportsStore.getState().closeModal('settings');
    const settings = useReportsStore(s => s.settings);
    const loadDashboard = useReportsStore(s => s.loadDashboard);
    const openModal = useReportsStore(s => s.openModal);

    const [form, setForm] = useState({ metaApiToken: '', googleClientId: '', googleClientSecret: '', googleRedirectUri: 'https://api-fyfp72cohq-uc.a.run.app/api/reports/auth/google/callback' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) setForm({ metaApiToken: settings.metaApiToken || '', googleClientId: settings.googleClientId || '', googleClientSecret: settings.googleClientSecret || '', googleRedirectUri: settings.googleRedirectUri || 'https://api-fyfp72cohq-uc.a.run.app/api/reports/auth/google/callback' });
    }, [open, settings]);

    const handleSave = async () => {
        setLoading(true);
        try { await reportsApi.saveSettings(form); toast.success('Ayarlar kaydedildi.'); closeModal(); loadDashboard(); } 
        catch (err) { toast.error(err.message || 'Ayarlar kaydedilemedi.'); } 
        finally { setLoading(false); }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader><DialogTitle className="flex items-center gap-2 text-muted-foreground"><Settings className="w-4 h-4" /> Ayarlar</DialogTitle></DialogHeader>
                <div className="flex flex-col gap-4 py-2">
                    <FormGroup label="Meta API Access Token" description="Meta verilerini çekmek için gerekli Graph API token'ı. (Veritabanında güvenli bir şekilde saklanır).">
                        <Input type="password" value={form.metaApiToken} onChange={e => setForm({...form, metaApiToken: e.target.value})} className="font-mono text-xs" placeholder="EAAI..." />
                    </FormGroup>
                    <div className="pt-2">
                        <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Google Entegrasyonu</Label>
                        <div className="flex gap-4 mt-2">
                            <FormGroup label="Client ID"><Input value={form.googleClientId} onChange={e => setForm({...form, googleClientId: e.target.value})} className="font-mono text-xs" placeholder="103617...apps.googleusercontent.com" /></FormGroup>
                            <FormGroup label="Client Secret"><Input type="password" value={form.googleClientSecret} onChange={e => setForm({...form, googleClientSecret: e.target.value})} className="font-mono text-xs" placeholder="GOCSPX-..." /></FormGroup>
                        </div>
                        <div className="mt-3">
                            <FormGroup label="Yönlendirme (Redirect URI)"><Input value={form.googleRedirectUri} onChange={e => setForm({...form, googleRedirectUri: e.target.value})} className="font-mono text-xs" placeholder="Örn: https://sutlucekadayif.com/api/reports/auth/google/callback" /></FormGroup>
                        </div>
                    </div>
                    <div className="pt-2">
                        <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Veri Eşleştirme Araçları</Label>
                        <div className="flex flex-col gap-2 mt-2">
                            <Button variant="outline" className="w-full justify-center text-purple-500 border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10" onClick={() => { closeModal(); openModal('campaignMap'); }}>
                                <GitBranch className="w-4 h-4 mr-2" /> Kampanya Eşleştir
                            </Button>
                            <Button variant="outline" className="w-full justify-center text-pink-500 border-pink-500/20 bg-pink-500/5 hover:bg-pink-500/10" onClick={() => { closeModal(); openModal('adsetMap'); }}>
                                <Target className="w-4 h-4 mr-2" /> Reklam Seti Eşleştir
                            </Button>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={closeModal}>Vazgeç</Button>
                    <Button onClick={handleSave} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Kaydet</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// --- Preview Modal ---
export function PreviewModal() {
    const open = useReportsStore(s => s.modals.preview);
    const data = useReportsStore(s => s.modalData.preview);
    const closeModal = () => useReportsStore.getState().closeModal('preview');
    
    const [html, setHtml] = useState('');
    const [loading, setLoading] = useState(false);
    const [dlLoading, setDlLoading] = useState(false);

    useEffect(() => {
        if (open && data) {
            setLoading(true); setHtml('');
            reportsApi.previewReport(data.kod, data.b, data.e).then(setHtml).catch(err => toast.error(err.message)).finally(() => setLoading(false));
        }
    }, [open, data]);

    const handleDownload = async () => {
        setDlLoading(true);
        try { await reportsApi.generatePdf(data.kod, data.b, data.e); toast.success('PDF indirildi!'); } 
        catch (err) { toast.error(err.message); } 
        finally { setDlLoading(false); }
    };

    const iframeRef = React.useRef(null);
    const handleIframeLoad = () => {
        try {
            const doc = iframeRef.current?.contentDocument || iframeRef.current?.contentWindow?.document;
            if (doc) {
                iframeRef.current.style.height = doc.documentElement.scrollHeight + 'px';
            }
        } catch {}
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
            <DialogContent className="sm:max-w-[520px] w-[95vw] p-0 overflow-hidden border gap-0 max-h-[85vh] flex flex-col">
                <DialogHeader className="px-4 py-3 border-b bg-card shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-sm font-medium"><Eye className="w-4 h-4" /> Rapor Önizleme</DialogTitle>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-auto">
                    {loading ? <div className="flex items-center justify-center py-20 text-muted-foreground text-sm"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Yükleniyor...</div> 
                    : <iframe ref={iframeRef} srcDoc={html} onLoad={handleIframeLoad} className="w-full border-none bg-white" style={{ minHeight: '200px' }} title="Rapor Önizleme" />}
                </div>
                <DialogFooter className="m-0 px-4 py-3 border-t bg-card sm:justify-start shrink-0">
                    <Button onClick={handleDownload} disabled={dlLoading} variant="outline" size="sm">
                        {dlLoading ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Eye className="w-3.5 h-3.5 mr-2" />} PDF İndir
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// --- Bulk Upload Modal ---
export function BulkUploadModal() {
    const open = useReportsStore(s => s.modals.bulkUpload);
    const closeModal = () => useReportsStore.getState().closeModal('bulkUpload');
    const loadDashboard = useReportsStore(s => s.loadDashboard);
    const selectBranch = useReportsStore(s => s.selectBranch);

    const [form, setForm] = useState({ kod: '', ad: '', planlanan: '', devredilen: '', erisim: '' });
    const metaRef = useRef(null);
    const googleRef = useRef(null);
    const [loading, setLoading] = useState(false);

    const handleUpload = async () => {
        const metaFiles = metaRef.current?.files;
        const googleFiles = googleRef.current?.files;
        if (!metaFiles?.length && !googleFiles?.length) return toast.info('En az bir CSV dosyası seçin.');

        setLoading(true);
        const fd = new FormData();
        if (form.kod) fd.append('subeKod', form.kod.trim().toLowerCase());
        if (form.ad) fd.append('subeAd', form.ad.trim());
        if (metaFiles) Array.from(metaFiles).forEach(f => fd.append('metaCsv', f));
        if (googleFiles) Array.from(googleFiles).forEach(f => fd.append('googleCsv', f));
        if (form.planlanan) fd.append('planlananButce', form.planlanan);
        if (form.devredilen) fd.append('devredilenMiktar', form.devredilen);
        if (form.erisim) fd.append('toplamErisim', form.erisim);

        try {
            const data = await reportsApi.uploadData(fd);
            toast.success(`${data.message} (${data.subeAd || data.subeKod})`);
            closeModal();
            await loadDashboard();
            if (data.subeKod) selectBranch(data.subeKod);
        } catch (err) { toast.error(err.message); }
        finally { setLoading(false); }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-blue-500"><UploadCloud className="w-5 h-5" /> Toplu CSV Veri Yükleme</DialogTitle>
                </DialogHeader>
                <div className="py-2 flex flex-col gap-5">
                    <p className="text-xs text-muted-foreground">Meta veya Google CSV dosyalarını yükleyin. Şube otomatik algılanır ya da aşağıdan belirtebilirsiniz.</p>
                    <div className="flex gap-4">
                        <FormGroup label="Şube Kodu"><Input value={form.kod} onChange={e=>setForm({...form, kod:e.target.value})} placeholder="Boş bırakılabilir" /></FormGroup>
                        <FormGroup label="Şube Adı"><Input value={form.ad} onChange={e=>setForm({...form, ad:e.target.value})} placeholder="İsteğe bağlı" /></FormGroup>
                    </div>
                    <div className="flex gap-4">
                        <FormGroup label="Meta CSV"><Input type="file" accept=".csv" multiple ref={metaRef} className="cursor-pointer file:text-xs file:font-semibold" /></FormGroup>
                        <FormGroup label="Google İşletme CSV"><Input type="file" accept=".csv" multiple ref={googleRef} className="cursor-pointer file:text-xs file:font-semibold" /></FormGroup>
                    </div>
                    <div>
                        <Label className="text-[10px] font-bold text-foreground uppercase tracking-wide mb-2 block">Bütçe Girişleri (İsteğe Bağlı)</Label>
                        <div className="flex gap-4 mb-3">
                            <FormGroup label="Planlanan Bütçe (₺)"><Input type="number" step="any" value={form.planlanan} onChange={e=>setForm({...form, planlanan:e.target.value})} placeholder="0" /></FormGroup>
                            <FormGroup label="Devredilen Miktar (₺)">
                                <Input type="number" step="any" value={form.devredilen} onChange={e=>setForm({...form, devredilen:e.target.value})} placeholder="0" />
                                {form.devredilen.startsWith('-') && (
                                    <div className="text-[10px] text-amber-500 mt-1 flex items-start gap-1"><Info className="w-3 h-3 shrink-0 mt-0.5" /> Eksi (-) değer: Geçen ayki fazla harcamayı telafi etmek için hedef bütçeden düşülecek tutar.</div>
                                )}
                            </FormGroup>
                        </div>
                        <FormGroup label="Hesap Özeti Toplam Erişim"><Input type="number" step="1" value={form.erisim} onChange={e=>setForm({...form, erisim:e.target.value})} placeholder="Hesap panelinden net değer..." /></FormGroup>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={closeModal}>Vazgeç</Button>
                    <Button onClick={handleUpload} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
                        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />} Verileri İçe Aktar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// --- Add Branch Modal ---
export function AddBranchModal() {
    const open = useReportsStore(s => s.modals.addBranch);
    const closeModal = () => useReportsStore.getState().closeModal('addBranch');
    const loadDashboard = useReportsStore(s => s.loadDashboard);
    const selectBranch = useReportsStore(s => s.selectBranch);

    const [form, setForm] = useState({ kod: '', ad: '', adres: '', link: '' });
    const [loading, setLoading] = useState(false);

    useEffect(() => { if (open) setForm({ kod: '', ad: '', adres: '', link: '' }); }, [open]);

    const handleAdd = async () => {
        const kod = form.kod.trim().toLowerCase().replace(/\s+/g, '-');
        const ad = form.ad.trim();
        if (!kod || !ad) return toast.error('Kod ve Ad zorunludur.');
        setLoading(true);
        try {
            await reportsApi.addBranch({ kod, ad, adres: form.adres.trim(), link: form.link.trim() });
            toast.success('Şube eklendi');
            closeModal();
            await loadDashboard();
            selectBranch(kod);
        } catch (err) { toast.error(err.message); }
        finally { setLoading(false); }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader><DialogTitle className="flex items-center gap-2"><PlusCircle className="w-5 h-5 text-primary" /> Yeni Şube Ekle</DialogTitle></DialogHeader>
                <div className="flex flex-col gap-4 py-4">
                    <FormGroup label="Şube Kodu"><Input value={form.kod} onChange={e=>setForm({...form, kod:e.target.value})} placeholder="örn: antalya" /></FormGroup>
                    <FormGroup label="Şube Adı"><Input value={form.ad} onChange={e=>setForm({...form, ad:e.target.value})} placeholder="örn: Sütlüce Kadayıf Antalya" /></FormGroup>
                    <FormGroup label="Menü Linki (İsteğe Bağlı)"><Input value={form.link} onChange={e=>setForm({...form, link:e.target.value})} placeholder="https://..." /></FormGroup>
                    <FormGroup label="Adres (İsteğe Bağlı)"><Input value={form.adres} onChange={e=>setForm({...form, adres:e.target.value})} placeholder="Açık adres" /></FormGroup>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={closeModal}>Vazgeç</Button>
                    <Button onClick={handleAdd} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Ekle</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// --- Data Edit Modal (Overrides) ---
export function DataEditModal() {
    const open = useReportsStore(s => s.modals.dataEdit);
    const data = useReportsStore(s => s.modalData.dataEdit);
    const closeModal = () => useReportsStore.getState().closeModal('dataEdit');
    const loadDashboard = useReportsStore(s => s.loadDashboard);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        deHarcama:'', deErisim:'', deGosterim:'', deSonuc:'', deTiklama:'', deTiklamaTumu:'', dePaylasim:'', deYorum:'', deMesaj:'',
        deGoogleArama:'', deGoogleHarita:'', deGoogleYol:'', deGoogleTelefon:'', deGoogleWeb:'', deGoogleMenu:'',
        dePlanlananButce:'', deDevredilenMiktar:''
    });

    useEffect(() => {
        if (open && data) {
            setLoading(true);
            reportsApi.fetchDonemVerileri(data.kod, data.baslangic, data.bitis)
                .then(res => {
                    const c = res.computed; const o = res.overrides || {};
                    const formatVal = (v) => (v == null || v === '') ? '' : v.toString().replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ".");
                    setForm({
                        deHarcama: formatVal(o.toplamHarcama ?? c.toplamHarcama),
                        deErisim: formatVal(o.toplamErisim ?? c.toplamErisim),
                        deGosterim: formatVal(o.toplamGosterim ?? c.toplamGosterim),
                        deSonuc: formatVal(o.toplamSonuc ?? c.toplamSonuc),
                        deTiklama: formatVal(o.toplamTiklama ?? c.toplamTiklama),
                        deTiklamaTumu: formatVal(o.toplamTiklamaTumu ?? c.toplamTiklamaTumu),
                        dePaylasim: formatVal(o.toplamPaylasim ?? c.toplamPaylasim),
                        deYorum: formatVal(o.toplamYorum ?? c.toplamYorum),
                        deMesaj: formatVal(o.toplamMesaj ?? c.toplamMesaj),
                        deGoogleArama: formatVal(o.googleArama ?? c.googleArama),
                        deGoogleHarita: formatVal(o.googleHarita ?? c.googleHarita),
                        deGoogleYol: formatVal(o.googleYolTarifi ?? c.googleYolTarifi),
                        deGoogleTelefon: formatVal(o.googleTelefon ?? c.googleTelefon),
                        deGoogleWeb: formatVal(o.googleWebTiklama ?? c.googleWebTiklama),
                        deGoogleMenu: formatVal(o.googleMenuTiklama ?? c.googleMenuTiklama),
                        dePlanlananButce: formatVal(o.planlananButce ?? c.planlananButce),
                        deDevredilenMiktar: formatVal(o.devredilenMiktar ?? c.devredilenMiktar),
                    });
                })
                .catch(err => { toast.error('Veri yüklenemedi'); closeModal(); })
                .finally(() => setLoading(false));
        }
    }, [open, data]);

    const handleInput = (key, val) => {
        let isNegative = val.startsWith('-');
        let v = val.replace(/[^0-9,]/g, '');
        if (v === '' && !isNegative) { setForm(prev => ({...prev, [key]: ''})); return; }
        if (v === '' && isNegative) { setForm(prev => ({...prev, [key]: '-'})); return; }
        let parts = v.split(',');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        if (parts.length > 2) parts = [parts[0], parts.slice(1).join('')];
        setForm(prev => ({...prev, [key]: (isNegative ? '-' : '') + parts.join(',')}));
    };

    const handleSave = async () => {
        setSaving(true);
        const getV = (val) => { const v = val.replace(/\./g, '').replace(/,/g, '.'); return v ? parseFloat(v) : 0; };
        const overrides = {
            toplamHarcama: getV(form.deHarcama), toplamErisim: getV(form.deErisim), toplamGosterim: getV(form.deGosterim), toplamSonuc: getV(form.deSonuc),
            toplamTiklama: getV(form.deTiklama), toplamTiklamaTumu: getV(form.deTiklamaTumu), toplamPaylasim: getV(form.dePaylasim),
            toplamYorum: getV(form.deYorum), toplamMesaj: getV(form.deMesaj),
            googleArama: getV(form.deGoogleArama), googleHarita: getV(form.deGoogleHarita), googleYolTarifi: getV(form.deGoogleYol),
            googleTelefon: getV(form.deGoogleTelefon), googleWebTiklama: getV(form.deGoogleWeb), googleMenuTiklama: getV(form.deGoogleMenu),
            planlananButce: getV(form.dePlanlananButce), devredilenMiktar: getV(form.deDevredilenMiktar)
        };
        try {
            await reportsApi.saveOverrides(data.kod, data.baslangic, data.bitis, overrides);
            toast.success('Rapor verileri güncellendi!');
            closeModal();
            await loadDashboard();
        } catch (err) { toast.error(err.message); }
        finally { setSaving(false); }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
            <DialogContent className="max-w-[520px] p-0 overflow-hidden border gap-0">
                {loading && (
                    <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mb-3" />
                        <span className="text-sm text-muted-foreground">Veriler Yükleniyor...</span>
                    </div>
                )}
                <DialogHeader className="px-5 py-3 border-b">
                    <DialogTitle className="flex items-center gap-2 text-sm font-medium">
                        <SlidersHorizontal className="w-4 h-4" /> Rapor Verilerini Düzenle
                    </DialogTitle>
                </DialogHeader>
                <div className="px-5 py-4 overflow-y-auto max-h-[70vh] flex flex-col gap-4">
                    {data && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border rounded-md">
                            <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium text-foreground">{formatDateTR(data.baslangic)} → {formatDateTR(data.bitis)}</span>
                        </div>
                    )}

                    <div>
                        <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                            <SlidersHorizontal className="w-3 h-3" /> Bütçe
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <FormGroup label="Planlanan Bütçe (₺)"><Input value={form.dePlanlananButce} onChange={e=>handleInput('dePlanlananButce', e.target.value)} placeholder="0" /></FormGroup>
                            <FormGroup label="Devredilen Miktar (₺)">
                                <Input value={form.deDevredilenMiktar} onChange={e=>handleInput('deDevredilenMiktar', e.target.value)} placeholder="0" />
                                {form.deDevredilenMiktar.startsWith('-') && <div className="text-[10px] text-amber-500 mt-1 flex items-start gap-1"><Info className="w-3 h-3 shrink-0 mt-0.5" /> Eksi (-) değer</div>}
                            </FormGroup>
                        </div>
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-blue-600 mb-2 flex items-center gap-1.5">
                            <Target className="w-3 h-3" /> Meta Reklam Verileri
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <FormGroup label="Toplam Harcama (₺)"><Input value={form.deHarcama} onChange={e=>handleInput('deHarcama', e.target.value)} placeholder="0" /></FormGroup>
                            <FormGroup label="Toplam Erişim"><Input value={form.deErisim} onChange={e=>handleInput('deErisim', e.target.value)} placeholder="0" /></FormGroup>
                            <FormGroup label="Toplam Gösterim"><Input value={form.deGosterim} onChange={e=>handleInput('deGosterim', e.target.value)} placeholder="0" /></FormGroup>
                            <FormGroup label="Toplam Sonuç"><Input value={form.deSonuc} onChange={e=>handleInput('deSonuc', e.target.value)} placeholder="0" /></FormGroup>
                        </div>
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-orange-600 mb-2 flex items-center gap-1.5">
                            <MapPin className="w-3 h-3" /> Google İşletme Verileri
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <FormGroup label="Arama (Toplam)"><Input value={form.deGoogleArama} onChange={e=>handleInput('deGoogleArama', e.target.value)} placeholder="0" /></FormGroup>
                            <FormGroup label="Harita (Toplam)"><Input value={form.deGoogleHarita} onChange={e=>handleInput('deGoogleHarita', e.target.value)} placeholder="0" /></FormGroup>
                            <FormGroup label="Yol Tarifi"><Input value={form.deGoogleYol} onChange={e=>handleInput('deGoogleYol', e.target.value)} placeholder="0" /></FormGroup>
                            <FormGroup label="Telefon Araması"><Input value={form.deGoogleTelefon} onChange={e=>handleInput('deGoogleTelefon', e.target.value)} placeholder="0" /></FormGroup>
                            <FormGroup label="Web Sitesi Tıklama"><Input value={form.deGoogleWeb} onChange={e=>handleInput('deGoogleWeb', e.target.value)} placeholder="0" /></FormGroup>
                            <FormGroup label="Menü Tıklama"><Input value={form.deGoogleMenu} onChange={e=>handleInput('deGoogleMenu', e.target.value)} placeholder="0" /></FormGroup>
                        </div>
                    </div>
                </div>
                <DialogFooter className="m-0 px-5 py-3 border-t sm:justify-end">
                    <Button variant="outline" onClick={closeModal}>Vazgeç</Button>
                    <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Kaydet</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// --- Delete Period Confirm Modal ---
export function DeleteDonemModal() {
    const open = useReportsStore(s => s.modals.deleteDonem);
    const data = useReportsStore(s => s.modalData.deleteDonem);
    const closeModal = () => useReportsStore.getState().closeModal('deleteDonem');
    const loadDashboard = useReportsStore(s => s.loadDashboard);
    const selectBranch = useReportsStore(s => s.selectBranch);
    const [loading, setLoading] = useState(false);

    const handleDelete = async () => {
        setLoading(true);
        try {
            await reportsApi.deleteDonem(data.kod, data.b, data.e);
            toast.success('Dönem verileri silindi.');
            closeModal();
            await loadDashboard();
            selectBranch(data.kod);
        } catch (err) { toast.error(err.message); }
        finally { setLoading(false); }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
            <DialogContent className="sm:max-w-[420px]">
                <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><AlertCircle className="w-5 h-5" /> Dönem Sil</DialogTitle></DialogHeader>
                <div className="py-4">
                    {data && (
                        <p className="text-sm text-foreground">
                            <strong>{formatDateTR(data.b)} → {formatDateTR(data.e)}</strong> dönemine ait tüm rapor verilerini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={closeModal}>Vazgeç</Button>
                    <Button onClick={handleDelete} disabled={loading} variant="destructive">
                        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Sil
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// Export a wrapper that mounts all modals
// --- Edit Branch Modal ---
export function EditBranchModal() {
    const open = useReportsStore(s => s.modals.editBranch);
    const data = useReportsStore(s => s.modalData.editBranch);
    const closeModal = () => useReportsStore.getState().closeModal('editBranch');
    const branches = useReportsStore(s => s.branches);
    const loadDashboard = useReportsStore(s => s.loadDashboard);
    const selectBranch = useReportsStore(s => s.selectBranch);
    const reverseCampaigns = useReportsStore(s => s.reverseCampaigns);
    const reverseAdsets = useReportsStore(s => s.reverseAdsets);
    const metaPrefixMappings = useReportsStore(s => s.metaPrefixMappings);
    const googleMappings = useReportsStore(s => s.googleMappings);
    const settings = useReportsStore(s => s.settings);
    const setActiveBranch = useReportsStore(s => s.setActiveBranch);

    const activeKod = typeof data === 'object' ? data?.kod : data;
    const sube = branches.find(s => s?.kod === activeKod) || {};
    
    const [form, setForm] = useState({ ad: '', adres: '', link: '' });
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Meta Prefix Select Options
    const [metaPrefixes, setMetaPrefixes] = useState([]);
    const [metaPrefixLoading, setMetaPrefixLoading] = useState(false);
    const [selectedMetaPrefix, setSelectedMetaPrefix] = useState('');
    const [metaMappedText, setMetaMappedText] = useState(null);

    // Google Locations Options
    const [googleLocations, setGoogleLocations] = useState([]);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [selectedGoogleLoc, setSelectedGoogleLoc] = useState('');
    const [googleSearch, setGoogleSearch] = useState('');

    useEffect(() => {
        if (open && activeKod) {
            setForm({ ad: sube.ad || '', adres: sube.adres || '', link: sube.link || '' });
            
            // Meta logic
            let currentMetaPrefix = '';
            for (const [slug, sKod] of Object.entries(metaPrefixMappings)) {
                if (sKod === activeKod) { currentMetaPrefix = slug; break; }
            }
            setSelectedMetaPrefix(currentMetaPrefix);

            if (reverseAdsets[activeKod]?.length > 0) {
                setMetaMappedText(`🎯 ${reverseAdsets[activeKod].length} reklam seti ile otomatik eşleşti`);
            } else if (reverseCampaigns[activeKod]?.length > 0) {
                setMetaMappedText(`🎯 ${reverseCampaigns[activeKod].length} kampanya ile otomatik eşleşti`);
            } else {
                setMetaMappedText(null);
                if (settings.metaApiToken) {
                    setMetaPrefixLoading(true);
                    reportsApi.previewMeta(settings.metaApiToken, '2025-06-01', '2026-12-31')
                        .then(res => setMetaPrefixes(res.gruplar.filter(g => g.kayitSayisi >= 3).sort((a,b) => a.prefix.localeCompare(b.prefix,'tr'))))
                        .catch(() => {})
                        .finally(() => setMetaPrefixLoading(false));
                }
            }

            // Google logic
            let currentGoogleLoc = '';
            for (const [locName, sKod] of Object.entries(googleMappings)) {
                if (sKod === activeKod) { currentGoogleLoc = locName; break; }
            }
            setSelectedGoogleLoc(currentGoogleLoc);
            setGoogleLoading(true);
            reportsApi.fetchGoogleLocations()
                .then(res => setGoogleLocations(res.locations || []))
                .catch(() => {})
                .finally(() => setGoogleLoading(false));
        }
    }, [open, activeKod, sube.ad, sube.adres]);

    const handleSave = async () => {
        if (!form.ad.trim()) return toast.error('Şube adı boş olamaz.');
        setSaving(true);
        try {
            await reportsApi.editBranch(activeKod, { ad: form.ad.trim(), adres: form.adres.trim(), link: form.link.trim() });
            
            // Meta Save
            if (!metaMappedText && selectedMetaPrefix !== '__campaign_mapped__' && selectedMetaPrefix !== '__adset_mapped__') {
                const newMetaMap = { ...metaPrefixMappings };
                for (const [slug, sKod] of Object.entries(newMetaMap)) {
                    if (sKod === activeKod) delete newMetaMap[slug];
                }
                if (selectedMetaPrefix) newMetaMap[selectedMetaPrefix] = activeKod;
                await reportsApi.saveMetaMappings(newMetaMap);
            }

            // Google Save
            const newGoogleMap = { ...googleMappings };
            for (const [locName, sKod] of Object.entries(newGoogleMap)) {
                if (sKod === activeKod) delete newGoogleMap[locName];
            }
            if (selectedGoogleLoc) newGoogleMap[selectedGoogleLoc] = activeKod;
            await reportsApi.saveGoogleMappings(newGoogleMap);

            toast.success('Şube güncellendi.');
            closeModal();
            await loadDashboard();
            selectBranch(activeKod);
        } catch (err) { toast.error(err.message); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!confirm(`"${sube.ad}" şubesini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return;
        setDeleting(true);
        try {
            await reportsApi.deleteBranch(activeKod);
            toast.success('Şube silindi.');
            closeModal();
            setActiveBranch(null);
            await loadDashboard();
        } catch (err) { toast.error(err.message); }
        finally { setDeleting(false); }
    };

    const filteredGoogleLocations = googleLocations
        .filter(loc => loc.title.toLowerCase().includes(googleSearch.toLowerCase().trim()))
        .sort((a, b) => {
            if (a.name === selectedGoogleLoc) return -1;
            if (b.name === selectedGoogleLoc) return 1;
            return 0;
        });

    return (
        <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
            <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden border border-border gap-0">
                <DialogHeader className="px-6 py-4 border-b border-border bg-card">
                    <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
                        {sube.ad} Ayarları
                    </DialogTitle>
                </DialogHeader>
                
                <div className="flex flex-col overflow-y-auto max-h-[75vh] bg-card p-6 gap-8">
                    {/* General Settings */}
                    <div className="flex flex-col gap-4">
                        <h3 className="text-sm font-semibold border-b pb-2 mb-2">Genel Bilgiler</h3>
                        <FormGroup label="Şube Kodu"><Input value={activeKod || ''} disabled className="bg-muted text-muted-foreground w-full md:w-2/3" /></FormGroup>
                        <FormGroup label="Şube Adı"><Input value={form.ad} onChange={e => setForm({...form, ad: e.target.value})} className="w-full" /></FormGroup>
                        <FormGroup label="Menü Linki (İsteğe Bağlı)"><Input value={form.link} onChange={e => setForm({...form, link: e.target.value})} placeholder="https://..." className="w-full" /></FormGroup>
                        <FormGroup label="Adres (İsteğe Bağlı)"><Input value={form.adres} onChange={e => setForm({...form, adres: e.target.value})} className="w-full" /></FormGroup>
                    </div>

                    {/* Meta Integration */}
                    <div className="flex flex-col gap-4">
                        <h3 className="text-sm font-semibold border-b pb-2 mb-2 flex items-center gap-2">
                            <GitBranch className="w-4 h-4 text-muted-foreground" /> Meta Entegrasyonu
                        </h3>
                        {metaMappedText ? (
                            <div className="text-sm text-foreground bg-muted p-3 rounded-md border border-border flex items-start gap-2">
                                <span className="mt-0.5">🎯</span>
                                <span>{metaMappedText}</span>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-semibold text-foreground">Reklam Kampanyası Prefix'i</Label>
                                <select 
                                    className="w-full md:w-2/3 bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                    value={selectedMetaPrefix}
                                    onChange={e => setSelectedMetaPrefix(e.target.value)}
                                    disabled={!settings.metaApiToken || metaPrefixLoading}
                                >
                                    {!settings.metaApiToken ? <option value="">— Token yok (Ayarlar'dan ayarlayın) —</option>
                                    : metaPrefixLoading ? <option value="">Yükleniyor...</option>
                                    : (
                                        <>
                                            <option value="">— Bağlı değil —</option>
                                            {metaPrefixes.map(g => <option key={g.slug} value={g.slug}>{g.prefix} ({g.kayitSayisi} set)</option>)}
                                        </>
                                    )}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Google Integration */}
                    <div className="flex flex-col gap-4">
                        <h3 className="text-sm font-semibold border-b pb-2 mb-2 flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-muted-foreground" /> Google İşletme Entegrasyonu
                        </h3>
                        <div className="border border-border rounded-md overflow-hidden bg-card flex flex-col">
                            <div className="p-3 border-b border-border bg-muted/50">
                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                                    <Input placeholder="Lokasyon ara..." value={googleSearch} onChange={e => setGoogleSearch(e.target.value)} className="pl-9 text-sm h-9 bg-background" />
                                </div>
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                                {googleLoading ? (
                                    <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                                ) : (
                                    <div className="flex flex-col">
                                        <div 
                                            onClick={() => setSelectedGoogleLoc('')}
                                            className={cn("px-4 py-3 border-b border-border cursor-pointer flex items-center gap-3 text-sm transition-colors", selectedGoogleLoc === '' ? 'bg-muted/50 text-foreground' : 'hover:bg-muted text-muted-foreground')}
                                        >
                                            <div className="w-4 h-4 rounded-full border border-input flex items-center justify-center shrink-0">
                                                {selectedGoogleLoc === '' && <div className="w-2 h-2 bg-foreground rounded-full" />}
                                            </div>
                                            <span className={selectedGoogleLoc === '' ? 'font-medium' : ''}>— Bağlı değil —</span>
                                        </div>
                                        {filteredGoogleLocations.map(loc => {
                                            const isSelected = selectedGoogleLoc === loc.name;
                                            return (
                                                <div 
                                                    key={loc.name}
                                                    onClick={() => setSelectedGoogleLoc(loc.name)}
                                                    className={cn("px-4 py-3 border-b border-border cursor-pointer flex items-center gap-3 text-sm transition-colors last:border-b-0", isSelected ? 'bg-muted/50 text-foreground' : 'hover:bg-muted text-muted-foreground')}
                                                >
                                                    <div className="w-4 h-4 rounded-full border border-input flex items-center justify-center shrink-0">
                                                        {isSelected && <div className="w-2 h-2 bg-foreground rounded-full" />}
                                                    </div>
                                                    <span className={isSelected ? 'font-medium' : ''}>{loc.title}</span>
                                                </div>
                                            );
                                        })}
                                        {filteredGoogleLocations.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Sonuç bulunamadı</div>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Danger Zone */}
                    <div className="flex flex-col gap-4 mt-4">
                        <h3 className="text-sm font-semibold text-destructive border-b border-destructive/20 pb-2 mb-2">Tehlikeli Alan</h3>
                        <div className="border border-destructive rounded-md p-4 flex items-center justify-between gap-4">
                            <div className="flex flex-col">
                                <strong className="text-sm text-foreground">Şubeyi Sil</strong>
                                <span className="text-xs text-muted-foreground mt-1">Şubeyi ve tüm dönem verilerini kalıcı olarak siler. Geri alınamaz.</span>
                            </div>
                            <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive hover:text-white shrink-0" onClick={handleDelete} disabled={deleting}>
                                {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Sil
                            </Button>
                        </div>
                    </div>

                </div>
                
                <DialogFooter className="m-0 px-6 py-4 border-t border-border bg-muted/30 sm:justify-end gap-2">
                    <Button variant="outline" onClick={closeModal}>İptal</Button>
                    <Button variant="outline" className="bg-foreground text-background hover:bg-foreground/90" onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Kaydet
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// --- Add Data Modal ---
export function AddDataModal() {
    const open = useReportsStore(s => s.modals.addData);
    const data = useReportsStore(s => s.modalData.addData);
    const closeModal = () => useReportsStore.getState().closeModal('addData');
    const loadDashboard = useReportsStore(s => s.loadDashboard);
    const selectBranch = useReportsStore(s => s.selectBranch);
    const settings = useReportsStore(s => s.settings);

    const [form, setForm] = useState({ since: '', until: '', planlanan: '', devredilen: '', erisim: '' });
    const metaRef = useRef(null);
    const googleRef = useRef(null);
    const [metaLoading, setMetaLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [uploadLoading, setUploadLoading] = useState(false);

    useEffect(() => {
        if (open) {
            const now = new Date();
            const curMonth = now.getMonth();
            const curYear = now.getFullYear();
            const lastDay = new Date(curYear, curMonth + 1, 0).getDate();
            const pad = n => String(n).padStart(2, '0');
            setForm({
                since: `${curYear}-${pad(curMonth + 1)}-01`,
                until: `${curYear}-${pad(curMonth + 1)}-${pad(lastDay)}`,
                planlanan: '', devredilen: '', erisim: ''
            });
            if (metaRef.current) metaRef.current.value = '';
            if (googleRef.current) googleRef.current.value = '';
        }
    }, [open]);

    const handleMetaFetch = async () => {
        if (!form.since || !form.until) return toast.info('Tarih aralığı seçin.');
        if (!settings.metaApiToken) return toast.error('Meta token bulunamadı. Ayarlardan ayarlayın.');
        setMetaLoading(true);
        try {
            const res = await reportsApi.metaFetchForBranch(settings.metaApiToken, form.since, form.until, data.kod);
            toast.success(res.message || 'Meta verileri çekildi!');
            await loadDashboard();
            selectBranch(data.kod);
        } catch (err) { toast.error(err.message); }
        finally { setMetaLoading(false); }
    };

    const handleGoogleFetch = async () => {
        if (!form.since || !form.until) return toast.info('Tarih aralığı seçin.');
        setGoogleLoading(true);
        try {
            const res = await reportsApi.googleFetchForBranch(form.since, form.until, data.kod);
            toast.success(res.message || 'Google verileri çekildi!');
            await loadDashboard();
            selectBranch(data.kod);
        } catch (err) { toast.error(err.message); }
        finally { setGoogleLoading(false); }
    };

    const handleFetchAll = async () => {
        if (!form.since || !form.until) return toast.info('Tarih aralığı seçin.');
        setMetaLoading(true); setGoogleLoading(true);
        await Promise.allSettled([
            handleMetaFetch(),
            handleGoogleFetch()
        ]);
        setMetaLoading(false); setGoogleLoading(false);
    };

    const handleUpload = async () => {
        const metaFiles = metaRef.current?.files;
        const googleFiles = googleRef.current?.files;
        if (!metaFiles?.length && !googleFiles?.length) return toast.info('En az bir CSV dosyası seçin.');

        setUploadLoading(true);
        const fd = new FormData();
        fd.append('subeKod', data.kod);
        if (metaFiles?.length) fd.append('metaCsv', metaFiles[0]);
        if (googleFiles?.length) fd.append('googleCsv', googleFiles[0]);
        if (form.planlanan) fd.append('planlananButce', form.planlanan);
        if (form.devredilen) fd.append('devredilenMiktar', form.devredilen);
        if (form.erisim) fd.append('toplamErisim', form.erisim);

        try {
            await reportsApi.uploadData(fd);
            toast.success('Veriler başarıyla yüklendi!');
            closeModal();
            await loadDashboard();
            selectBranch(data.kod);
        } catch (err) { toast.error(err.message); }
        finally { setUploadLoading(false); }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-primary text-sm font-serif"><PlusCircle className="w-5 h-5" /> Veri Ekle</DialogTitle>
                </DialogHeader>
                <div className="py-2 flex flex-col gap-5">
                    <div>
                        <Label className="text-[10px] font-bold text-foreground uppercase tracking-wide mb-2 block">1. Otomatik Veri Çekme</Label>
                        <div className="flex gap-4 mb-3">
                            <FormGroup label="Başlangıç"><DatePicker value={form.since} onChange={d => setForm({...form, since: d})} /></FormGroup>
                            <FormGroup label="Bitiş"><DatePicker value={form.until} onChange={d => setForm({...form, until: d})} /></FormGroup>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" className="flex-1 bg-blue-500/5 hover:bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs" onClick={handleMetaFetch} disabled={metaLoading}>
                                {metaLoading ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : null} Meta Çek
                            </Button>
                            <Button variant="outline" className="flex-1 bg-orange-500/5 hover:bg-orange-500/10 text-orange-600 border-orange-500/20 text-xs" onClick={handleGoogleFetch} disabled={googleLoading}>
                                {googleLoading ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <MapPin className="w-3 h-3 mr-1.5" />} Google Çek
                            </Button>
                            <Button variant="default" className="flex-1 text-xs" onClick={handleFetchAll} disabled={metaLoading || googleLoading}>
                                Tümünü Çek
                            </Button>
                        </div>
                    </div>
                    
                    <div className="h-px bg-border w-full" />

                    <div>
                        <Label className="text-[10px] font-bold text-foreground uppercase tracking-wide mb-2 block">2. Manuel CSV Yükleme (İsteğe Bağlı)</Label>
                        <div className="flex gap-4">
                            <FormGroup label="Meta CSV"><Input type="file" accept=".csv" ref={metaRef} className="cursor-pointer file:text-xs file:font-semibold" /></FormGroup>
                            <FormGroup label="Google İşletme CSV"><Input type="file" accept=".csv" ref={googleRef} className="cursor-pointer file:text-xs file:font-semibold" /></FormGroup>
                        </div>
                    </div>

                    <div className="h-px bg-border w-full" />

                    <div>
                        <Label className="text-[10px] font-bold text-foreground uppercase tracking-wide mb-2 block">3. Bütçe Verileri (İsteğe Bağlı)</Label>
                        <div className="flex gap-4 mb-3">
                            <FormGroup label="Planlanan Bütçe (₺)"><Input type="number" step="any" value={form.planlanan} onChange={e=>setForm({...form, planlanan:e.target.value})} placeholder="0" /></FormGroup>
                            <FormGroup label="Devredilen Miktar (₺)">
                                <Input type="number" step="any" value={form.devredilen} onChange={e=>setForm({...form, devredilen:e.target.value})} placeholder="0" />
                                {form.devredilen.startsWith('-') && (
                                    <div className="text-[10px] text-amber-500 mt-1 flex items-start gap-1"><Info className="w-3 h-3 shrink-0 mt-0.5" /> Eksi (-) değer</div>
                                )}
                            </FormGroup>
                        </div>
                        <FormGroup label="Hesap Özeti Toplam Erişim"><Input type="number" step="1" value={form.erisim} onChange={e=>setForm({...form, erisim:e.target.value})} placeholder="Hesap panelinden net değer..." /></FormGroup>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={closeModal}>Vazgeç</Button>
                    <Button onClick={handleUpload} disabled={uploadLoading} variant="outline">
                        {uploadLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />} Verileri Aktar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// --- Campaign Map Modal ---
export function CampaignMapModal() {
    const open = useReportsStore(s => s.modals.campaignMap);
    const closeModal = () => useReportsStore.getState().closeModal('campaignMap');
    const settings = useReportsStore(s => s.settings);
    const dateRange = useReportsStore(s => s.dateRange);
    const loadDashboard = useReportsStore(s => s.loadDashboard);
    
    const [campaigns, setCampaigns] = useState([]);
    const [subeler, setSubeler] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selections, setSelections] = useState({}); // { campaignId: subeKod }

    useEffect(() => {
        if (open && settings.metaApiToken) {
            setLoading(true);
            reportsApi.fetchCampaigns(settings.metaApiToken, dateRange.since || '2025-01-01', dateRange.until || '2026-12-31')
                .then(res => {
                    setCampaigns(res.kampanyalar || []);
                    setSubeler(res.mevcutSubeler || []);
                    const initialSelections = {};
                    (res.kampanyalar || []).forEach(c => {
                        if (c.eslesmeKod) initialSelections[c.id] = c.eslesmeKod;
                    });
                    setSelections(initialSelections);
                })
                .catch(err => toast.error(err.message))
                .finally(() => setLoading(false));
        }
    }, [open]);

    const handleSave = async () => {
        setSaving(true);
        const mappings = {};
        campaigns.forEach(c => {
            const val = selections[c.id];
            if (val && val !== '__atla__') {
                mappings[c.id] = { sube: val, name: c.name };
            }
        });

        try {
            const res = await reportsApi.saveCampaignMappings(mappings);
            toast.success(res.message);
            closeModal();
            await loadDashboard();
        } catch (err) { toast.error(err.message); }
        finally { setSaving(false); }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
            <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden border gap-0">
                <DialogHeader className="px-6 py-4 border-b border-border bg-card">
                    <DialogTitle className="flex items-center gap-2 text-foreground text-lg font-semibold tracking-tight"><GitBranch className="w-5 h-5 text-purple-500" /> Meta Kampanya Eşleştirme</DialogTitle>
                </DialogHeader>
                {campaigns.length > 0 && !loading && settings.metaApiToken && (
                    <div className="px-6 py-3 border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground flex justify-between">
                        <span>KAMPANYA ADI</span>
                        <span>{campaigns.length} kayıt</span>
                    </div>
                )}
                <div className="p-0 overflow-y-auto h-[60vh] bg-card">
                    {!settings.metaApiToken ? (
                        <div className="p-8 text-center text-destructive text-sm">Meta token bulunamadı. Ayarlardan ayarlayın.</div>
                    ) : loading ? (
                        <div className="p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <span className="text-sm">Kampanyalar yükleniyor...</span>
                        </div>
                    ) : campaigns.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground text-sm">Kampanya bulunamadı.</div>
                    ) : (
                        <div className="flex flex-col">
                            {campaigns.map(c => (
                                <div key={c.id} className="flex items-center gap-4 px-6 py-4 bg-card border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-foreground truncate" title={c.name}>{c.name}</div>
                                        <div className="text-xs text-muted-foreground mt-1">₺{fmtThousand(c.spend?.toString())} harcama · {fmtThousand(c.reach?.toString())} erişim</div>
                                    </div>
                                    <select
                                        className="w-48 bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                        value={selections[c.id] || '__atla__'}
                                        onChange={e => setSelections({...selections, [c.id]: e.target.value})}
                                    >
                                        <option value="__atla__">— Atla —</option>
                                        {subeler.map(s => <option key={s.kod} value={s.kod}>{s.ad}</option>)}
                                    </select>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <DialogFooter className="m-0 px-6 py-4 border-t border-border bg-muted/30 sm:justify-end gap-2">
                    <Button variant="outline" onClick={closeModal}>Vazgeç</Button>
                    <Button onClick={handleSave} disabled={saving} className="bg-foreground text-background hover:bg-foreground/90">
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Kaydet
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// --- Adset Map Modal ---
export function AdsetMapModal() {
    const open = useReportsStore(s => s.modals.adsetMap);
    const closeModal = () => useReportsStore.getState().closeModal('adsetMap');
    const settings = useReportsStore(s => s.settings);
    const dateRange = useReportsStore(s => s.dateRange);
    const loadDashboard = useReportsStore(s => s.loadDashboard);
    
    const [adsets, setAdsets] = useState([]);
    const [subeler, setSubeler] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selections, setSelections] = useState({}); // { adsetId: subeKod }
    const [checked, setChecked] = useState({}); // { adsetId: boolean }
    const [search, setSearch] = useState('');
    const [bulkSelect, setBulkSelect] = useState('');

    const loadData = async (forceRefresh = false) => {
        setLoading(true);
        try {
            const res = await reportsApi.fetchAdsets(settings.metaApiToken, dateRange.since || '2025-01-01', dateRange.until || '2026-12-31', forceRefresh);
            setAdsets(res.adsets || []);
            setSubeler(res.mevcutSubeler || []);
            const initialSelections = {};
            (res.adsets || []).forEach(a => {
                if (a.eslesmeKod) initialSelections[a.id] = a.eslesmeKod;
            });
            setSelections(initialSelections);
            setChecked({});
        } catch (err) { toast.error(err.message); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        if (open && settings.metaApiToken) {
            setSearch(''); setBulkSelect('');
            loadData();
        }
    }, [open]);

    const handleSave = async () => {
        setSaving(true);
        const mappings = {};
        adsets.forEach(a => {
            const val = selections[a.id];
            if (val && val !== '__atla__') {
                mappings[a.id] = { sube: val, name: a.name };
            }
        });

        try {
            const res = await reportsApi.saveAdsetMappings(mappings);
            toast.success(res.message);
            closeModal();
            await loadDashboard();
        } catch (err) { toast.error(err.message); }
        finally { setSaving(false); }
    };

    const filteredAdsets = adsets.filter(a => (a.name + ' ' + a.campaignName).toLowerCase().includes(search.toLowerCase().trim()));

    const handleToggleAll = (e) => {
        const isChecked = e.target.checked;
        const newChecked = { ...checked };
        filteredAdsets.forEach(a => newChecked[a.id] = isChecked);
        setChecked(newChecked);
    };

    const handleApplyBulk = () => {
        if (!bulkSelect) return toast.info('Toplu atama için bir şube seçin.');
        const selectedIds = Object.keys(checked).filter(id => checked[id]);
        if (selectedIds.length === 0) return toast.info('En az bir reklam seti seçmelisiniz.');

        const newSelections = { ...selections };
        selectedIds.forEach(id => newSelections[id] = bulkSelect);
        setSelections(newSelections);
        setChecked({});
        setBulkSelect('');
        toast.success(`${selectedIds.length} reklam seti işaretlendi. Kaydet butonuna basarak işlemi onaylayın.`);
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
            <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden border gap-0">
                <DialogHeader className="px-6 py-4 border-b border-border bg-card">
                    <DialogTitle className="flex items-center justify-between gap-2 text-foreground text-lg font-semibold tracking-tight">
                        <div className="flex items-center gap-2"><Target className="w-5 h-5 text-pink-500" /> Meta Reklam Seti Eşleştirme</div>
                        <div className="flex items-center">
                            <Button variant="outline" size="sm" onClick={() => loadData(true)} disabled={loading} className="mr-6">
                                <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} /> Yenile
                            </Button>
                        </div>
                    </DialogTitle>
                </DialogHeader>
                <div className="p-4 border-b border-border bg-muted/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="relative flex-1 w-full">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                        <Input placeholder="Reklam seti veya kampanya ara..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 bg-background w-full" />
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <select
                            className="flex-1 sm:w-48 bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring h-9"
                            value={bulkSelect} onChange={e => setBulkSelect(e.target.value)}
                        >
                            <option value="">— Şube Seçin —</option>
                            <option value="__atla__">— Atla —</option>
                            {subeler.map(s => <option key={s.kod} value={s.kod}>{s.ad}</option>)}
                        </select>
                        <Button variant="secondary" size="sm" onClick={handleApplyBulk} className="h-9">Uygula</Button>
                    </div>
                </div>

                {filteredAdsets.length > 0 && !loading && settings.metaApiToken && (
                    <div className="px-6 py-3 bg-muted/50 border-b border-border flex items-center gap-4 text-xs font-semibold text-muted-foreground">
                        <input type="checkbox" onChange={handleToggleAll} className="cursor-pointer w-4 h-4 rounded border-input text-foreground focus:ring-foreground" checked={filteredAdsets.length > 0 && filteredAdsets.every(a => checked[a.id])} />
                        <span>TÜMÜNÜ SEÇ</span>
                        <span className="ml-auto">{filteredAdsets.length} kayıt gösteriliyor</span>
                    </div>
                )}
                <div className="p-0 overflow-y-auto h-[50vh] bg-card">
                    {!settings.metaApiToken ? (
                        <div className="p-8 text-center text-destructive text-sm">Meta token bulunamadı. Ayarlardan ayarlayın.</div>
                    ) : loading ? (
                        <div className="p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <span className="text-sm">Reklam setleri yükleniyor...</span>
                        </div>
                    ) : filteredAdsets.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground text-sm">Reklam seti bulunamadı.</div>
                    ) : (
                        <div className="flex flex-col">
                            {filteredAdsets.map(a => (
                                <div key={a.id} className="flex items-center gap-4 px-6 py-4 bg-card border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors">
                                    <input type="checkbox" className="cursor-pointer w-4 h-4 rounded border-input text-foreground focus:ring-foreground" checked={!!checked[a.id]} onChange={e => setChecked({...checked, [a.id]: e.target.checked})} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-foreground truncate" title={a.name}>{a.name}</div>
                                        <div className="text-xs text-muted-foreground mt-1 truncate">Kampanya: {a.campaignName}</div>
                                        <div className="text-xs text-blue-600 mt-1">₺{fmtThousand(a.spend?.toString())} harcama · {fmtThousand(a.reach?.toString())} erişim</div>
                                    </div>
                                    <select
                                        className="w-48 bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                        value={selections[a.id] || '__atla__'}
                                        onChange={e => setSelections({...selections, [a.id]: e.target.value})}
                                    >
                                        <option value="__atla__">— Atla —</option>
                                        {subeler.map(s => <option key={s.kod} value={s.kod}>{s.ad}</option>)}
                                    </select>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <DialogFooter className="m-0 px-6 py-4 border-t border-border bg-muted/30 sm:justify-end gap-2">
                    <Button variant="outline" onClick={closeModal}>Vazgeç</Button>
                    <Button onClick={handleSave} disabled={saving} className="bg-foreground text-background hover:bg-foreground/90">
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Kaydet
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// Export a wrapper that mounts all modals
export function ReportsModals() {
    return (
        <>
            <SettingsModal />
            <PreviewModal />
            <BulkUploadModal />
            <AddBranchModal />
            <DataEditModal />
            <DeleteDonemModal />
            <EditBranchModal />
            <AddDataModal />
            <CampaignMapModal />
            <AdsetMapModal />
        </>
    );
}
