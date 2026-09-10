import { useState, useEffect, useRef } from 'react';
import api from '../../../services/api';
import { Plus, Pencil, Trash2, GripVertical, FileText, ExternalLink, CalendarDays, EyeOff, Lock } from 'lucide-react';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { proxyKeyUrl } from '../../../utils/imageProxy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { SubeCokluSecici } from '../components/SubeCokluSecici';


/**
 * Kategori kartı — MODÜL kapsamında tanımlı OLMALI.
 *
 * Daha önce CategoriesPage'in içinde tanımlıydı; bu, her render'da yeni bir
 * bileşen TÜRÜ üretiyordu ve React kartları taşımak yerine hepsini DOM'dan
 * silip yeniden oluşturuyordu (ölçüldü: 14/14 düğüm yenileniyordu).
 * Sürüklemede ilk `dragover` yeniden render tetiklediği için sürüklenen düğüm
 * yok oluyor, tarayıcı sürüklemeyi iptal ediyor ve `dragend` hiç gelmiyordu —
 * sıra bu yüzden kaydedilmiyordu. Bileşen dışarı alınınca düğümler korunuyor.
 */
/**
 * Kategori satırı — MODÜL kapsamında tanımlı OLMALI.
 *
 * Daha önce CategoriesPage'in içinde tanımlıydı; bu, her render'da yeni bir
 * bileşen TÜRÜ üretiyordu ve React kartları taşımak yerine hepsini DOM'dan
 * silip yeniden oluşturuyordu (ölçüldü: 14/14 düğüm yenileniyordu).
 * Sürüklemede ilk `dragover` yeniden render tetiklediği için sürüklenen düğüm
 * yok oluyor, tarayıcı sürüklemeyi iptal ediyor ve `dragend` hiç gelmiyordu —
 * sıra bu yüzden kaydedilmiyordu. Bileşen dışarı alınınca düğümler korunuyor.
 *
 * SADELEŞTİRİLDİ: tür (ortak/şubeye özel), renk ve görsel kaldırıldı.
 * Şube ayrımı artık ürün ve kategori bazlı gizlemeyle yapılıyor
 * (urunler.gizli_subeler / kategoriler.gizli_subeler), kategorinin ayrı bir
 * "türü" olmasına gerek kalmadı. Renk ve görseli de müşteri menüsü hiç
 * okumuyordu — panelde yer kaplayan ölü alanlardı.
 */
function KategoriCard({ kat, sira, surukleId, siraKaydediliyor, onSurukleBasla, onSurukleUzerinde, onSurukleBitti, onDuzenle, onSil }) {
    const gizliSayisi = (kat.gizli_subeler || []).length;

    return (
        <div
            draggable={!siraKaydediliyor}
            onDragStart={(e) => { onSurukleBasla(kat.id); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(e) => onSurukleUzerinde(e, kat)}
            onDragEnd={onSurukleBitti}
            className={`group flex items-center gap-3 border-b px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted/40 ${
                surukleId === kat.id ? 'opacity-40 ring-1 ring-inset ring-primary' : ''
            } ${siraKaydediliyor ? 'pointer-events-none opacity-60' : ''}`}
        >
            <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />

            {/* Sıra numarası: bu ekranın asıl işi sıralama, kaçıncı olduğu
                görünmeden sürüklemenin sonucu takip edilemiyordu. */}
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground/60">{sira}</span>

            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{kat.ad}</span>

            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{kat.urunSayisi || 0} ürün</span>

            {/* Gerçekten davranışı değiştiren iki ayar; yoksa hiç yer kaplamıyor. */}
            <div className="flex shrink-0 items-center gap-1.5">
                {kat.menuden_cikarilamaz && (
                    <Badge variant="outline" className="gap-1 border-blue-200 bg-blue-50 text-blue-700"
                           title="Şube bu kategorideki ürünleri menüsünden çıkaramaz">
                        <Lock className="size-2.5" /> Çıkarılamaz
                    </Badge>
                )}
                {gizliSayisi > 0 && (
                    <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/5 text-destructive"
                           title={(kat.gizli_subeler || []).join(', ')}>
                        <EyeOff className="size-2.5" /> {gizliSayisi} şubede gizli
                    </Badge>
                )}
            </div>

            <div className="flex shrink-0 gap-0.5">
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={() => onDuzenle(kat)} title="Düzenle">
                    <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => onSil(kat)} title="Sil">
                    <Trash2 className="size-3.5" />
                </Button>
            </div>
        </div>
    );
}

export default function CategoriesPage() {
    const toast = useToast();
    const confirm = useConfirm();
    const [kategoriler, setKategoriler] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ ad: '', sira: '', gizli_subeler: [], menuden_cikarilamaz: false });
    const [subeler, setSubeler] = useState([]);
    const [saving, setSaving] = useState(false);
    const [replaceState, setReplaceState] = useState(null);
    const [surukleId, setSurukleId] = useState(null);
    const [siraKaydediliyor, setSiraKaydediliyor] = useState(false);
    const siraRef = useRef([]); // sürükleme sırasında oluşan güncel sıra (id dizisi)
    const [alerjenPdf, setAlerjenPdf] = useState(null);          // { key, ad, boyut, zaman } | null
    const [alerjenYukleniyor, setAlerjenYukleniyor] = useState(false);
    const alerjenInputRef = useRef(null);
    const [fiyatTarihi, setFiyatTarihi] = useState('');          // 'YYYY-MM-DD' | ''
    const [fiyatTarihiKayitli, setFiyatTarihiKayitli] = useState('');
    const [fiyatTarihiYukleniyor, setFiyatTarihiYukleniyor] = useState(false);

    useEffect(() => { loadKategoriler(); loadSubeler(); loadAlerjenPdf(); loadFiyatTarihi(); }, []);

    async function loadFiyatTarihi() {
        try {
            const { data } = await api.get('/menu/fiyat-tarihi');
            const t = data.fiyatTarihi?.tarih || '';
            setFiyatTarihi(t);
            setFiyatTarihiKayitli(t);
        } catch (err) { console.error('Fiyat tarihi yüklenemedi:', err); }
    }

    async function handleFiyatTarihiKaydet(deger) {
        setFiyatTarihiYukleniyor(true);
        try {
            await api.put('/menu/fiyat-tarihi', { tarih: deger || null });
            setFiyatTarihi(deger);
            setFiyatTarihiKayitli(deger);
            toast.success(deger ? 'Fiyat tarihi güncellendi — menüde yayında' : 'Fiyat tarihi kaldırıldı');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Fiyat tarihi kaydedilemedi');
        }
        setFiyatTarihiYukleniyor(false);
    }

    async function loadAlerjenPdf() {
        try {
            const { data } = await api.get('/menu/alerjen-pdf');
            setAlerjenPdf(data.pdf || null);
        } catch (err) { console.error('Alerjen PDF bilgisi yüklenemedi:', err); }
    }

    async function handleAlerjenUpload(e) {
        const file = e.target.files[0];
        e.target.value = ''; // aynı dosya tekrar seçilebilsin
        if (!file) return;
        setAlerjenYukleniyor(true);
        try {
            const formData = new FormData();
            formData.append('pdf', file);
            const { data } = await api.post('/menu/alerjen-pdf', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setAlerjenPdf(data.pdf);
            toast.success('Alerjen PDF\'i güncellendi — menüde yayında');
        } catch (err) {
            toast.error(err.response?.data?.error || 'PDF yüklenemedi');
        }
        setAlerjenYukleniyor(false);
    }

    async function handleAlerjenSil() {
        const ok = await confirm('Alerjen PDF\'i kaldırılsın mı? Menüdeki "Alerjen Bilgileri" butonu kaybolur.');
        if (!ok) return;
        setAlerjenYukleniyor(true);
        try {
            await api.delete('/menu/alerjen-pdf');
            setAlerjenPdf(null);
            toast.success('Alerjen PDF\'i kaldırıldı');
        } catch (err) {
            toast.error(err.response?.data?.error || 'PDF kaldırılamadı');
        }
        setAlerjenYukleniyor(false);
    }

    async function loadKategoriler() {
        setLoading(true);
        try {
            const { data } = await api.get('/categories');
            setKategoriler(data.kategoriler);
            siraRef.current = data.kategoriler.map((k) => k.id);
        }
        catch (err) { console.error('Kategoriler yüklenemedi:', err); }
        setLoading(false);
    }

    // Şube listesi yalnızca "bu kategoriyi göremeyecek şubeler" alanı için gerekli.
    // Hata yutuluyor: liste gelmezse alan boş kalır, kategori düzenlemesi çalışmaya devam eder.
    async function loadSubeler() {
        try { const { data } = await api.get('/branches'); setSubeler(data.subeler || []); }
        catch (err) { console.error('Şubeler yüklenemedi:', err); }
    }

    function openAdd() { setEditing(null); setForm({ ad: '', sira: '', gizli_subeler: [], menuden_cikarilamaz: false }); setShowModal(true); }
    function openEdit(kat) { setEditing(kat); setForm({ ad: kat.ad, sira: kat.sira || '', gizli_subeler: kat.gizli_subeler || [], menuden_cikarilamaz: !!kat.menuden_cikarilamaz }); setShowModal(true); }
    function closeModal() { setShowModal(false); setEditing(null); }

    async function handleSubmit(e) {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = { ad: form.ad, gizli_subeler: form.gizli_subeler || [], menuden_cikarilamaz: !!form.menuden_cikarilamaz };
            if (form.sira !== '' && form.sira !== undefined) payload.sira = Number(form.sira);
            if (editing) { await api.put(`/categories/${editing.id}`, payload); }
            else { await api.post('/categories', payload); }
            closeModal();
            await loadKategoriler();
            toast.success(editing ? 'Kategori güncellendi' : 'Kategori oluşturuldu');
        } catch (err) { toast.error(err.response?.data?.error || 'Bir hata oluştu'); }
        setSaving(false);
    }

    async function handleDelete(kat) {
        const ok = await confirm(`"${kat.ad}" kategorisini silmek istediğinize emin misiniz?`);
        if (!ok) return;
        try {
            await api.delete(`/categories/${kat.id}`);
            await loadKategoriler();
            toast.success('Kategori silindi');
        } catch (err) {
            if (err.response?.status === 409 && err.response?.data?.requiresReplacement) {
                setReplaceState({
                    kat,
                    urunSayisi: err.response.data.urunSayisi,
                    yeniKategori: '',
                });
            } else {
                toast.error(err.response?.data?.error || 'Silme işlemi başarısız');
            }
        }
    }

    async function handleReplaceAndDelete() {
        if (!replaceState?.yeniKategori) {
            toast.warning('Lütfen bir kategori seçin');
            return;
        }
        try {
            await api.delete(`/categories/${replaceState.kat.id}?yeniKategori=${replaceState.yeniKategori}`);
            setReplaceState(null);
            await loadKategoriler();
            toast.success('Ürünler taşındı ve kategori silindi');
        } catch (err) {
            toast.error(err.response?.data?.error || 'İşlem başarısız');
        }
    }


    // ── Sürükle-bırak ile sıralama ──
    // Menü kategorileri `sira` alanına göre listeliyor (menu-builder.js) ama bu
    // alanı değiştirecek bir arayüz yoktu; tutamaç ikonu duruyordu, mantığı yoktu.
    // Sıra sunucuya TEK istekte gönderilir (PUT /categories/sira): kategori başına
    // ayrı istek 92 şubenin menüsünü her seferinde yeniden ürettirirdi.
    function suruklemeUzerinde(e, hedef) {
        e.preventDefault();
        if (!surukleId || surukleId === hedef.id) return;
        const kaynakIdx = kategoriler.findIndex((k) => k.id === surukleId);
        const hedefIdx = kategoriler.findIndex((k) => k.id === hedef.id);
        if (kaynakIdx < 0 || hedefIdx < 0) return;
        // Ortak ↔ şubeye özel gruplar karışmasın (farklı `tur`, farklı liste)
        if ((kategoriler[kaynakIdx].tur || 'ortak') !== (kategoriler[hedefIdx].tur || 'ortak')) return;
        const yeni = [...kategoriler];
        const [tasinan] = yeni.splice(kaynakIdx, 1);
        yeni.splice(hedefIdx, 0, tasinan);
        setKategoriler(yeni);
        siraRef.current = yeni.map((k) => k.id); // onDragEnd bayat state okumasın
    }

    async function suruklemeBitti() {
        const bitenId = surukleId;
        setSurukleId(null);
        if (!bitenId || siraRef.current.length === 0) return;
        setSiraKaydediliyor(true);
        try {
            await api.put('/categories/sira', { idler: siraRef.current });
            toast.success('Kategori sırası kaydedildi');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Sıra kaydedilemedi');
            await loadKategoriler(); // sunucudaki gerçek sıraya geri dön
        }
        setSiraKaydediliyor(false);
    }


    // Karta geçilen ortak alanlar — iki listede de aynı
    const kartProplari = {
        surukleId, siraKaydediliyor,
        onSurukleBasla: setSurukleId,
        onSurukleUzerinde: suruklemeUzerinde,
        onSurukleBitti: suruklemeBitti,
        onDuzenle: openEdit,
        onSil: handleDelete,
    };

    return (
        <div className="flex flex-1 flex-col gap-4 w-full">
            {/* Page Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div>
                    <h1 className="text-3xl leading-none tracking-tight text-foreground">Kategoriler</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">Menü kategorilerinizi düzenleyin ve yönetin.</p>
                </div>
                <Button size="sm" className="h-8 shadow-sm bg-primary hover:bg-primary/90 text-primary-foreground text-xs" onClick={openAdd}>
                    <Plus className="size-3.5 mr-1.5" /> Kategori Ekle
                </Button>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                    <Spinner className="size-8" />
                    <p className="text-sm text-muted-foreground">Kategoriler yükleniyor...</p>
                </div>
            ) : kategoriler.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground border border-dashed rounded-lg bg-card">
                    <FolderOpen className="size-10 text-muted-foreground/40" />
                    <div className="text-center">
                        <p className="text-sm font-medium text-foreground">Henüz kategori yok</p>
                        <p className="text-xs text-muted-foreground mt-1">İlk kategorinizi ekleyerek başlayın.</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={openAdd} className="mt-1">
                        <Plus className="size-3.5 mr-1.5" /> Kategori Ekle
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {/* Sıralama menüye birebir yansıyor; kullanıcı kartları sürükleyebileceğini
                        bilmiyordu (tutamaç ikonu vardı ama açıklama yoktu). */}
                    <p className="-mb-3 text-xs text-muted-foreground">
                        {siraKaydediliyor
                            ? 'Sıra kaydediliyor, tüm şubelerin menüsü yenileniyor...'
                            : 'Kartları sürükleyerek sıralayın — bu sıra QR menüsünde de geçerli olur.'}
                    </p>

                    {/* TEK LİSTE: kategoriler artık tür ayrımına girmiyor.
                        İki sütunlu ızgara ayrıca sıralamayı belirsiz kılıyordu —
                        sıra soldan sağa mı yukarıdan aşağı mı, bakan anlamıyordu.
                        Bu ekranın işi sıralama olduğu için tek sütun. */}
                    <div className="rounded-lg border">
                        {kategoriler.map((kat, i) => (
                            <KategoriCard key={kat.id} kat={kat} sira={i + 1} {...kartProplari} />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Alerjen PDF'i ── QR menüde "Alerjen Bilgileri" butonuyla açılan
                tek global dosya. Kategorilerden bağımsız, her durumda görünür. */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <FileText className="size-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-medium text-foreground">Alerjen Bilgileri (PDF)</h2>
                    {alerjenPdf ? (
                        <p className="truncate text-xs text-muted-foreground mt-0.5">
                            {alerjenPdf.ad} · {(alerjenPdf.boyut / 1024 / 1024).toFixed(1)} MB
                            {alerjenPdf.zaman && ` · ${new Date(alerjenPdf.zaman).toLocaleDateString('tr-TR')}`}
                        </p>
                    ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Henüz yüklenmedi — yüklenince QR menüde "Alerjen Bilgileri" butonu görünür.
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {alerjenPdf && (
                        <>
                            <Button size="sm" variant="outline" className="h-8 text-xs" asChild>
                                <a href={proxyKeyUrl(alerjenPdf.key)} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="size-3.5 mr-1.5" /> Görüntüle
                                </a>
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive"
                                    disabled={alerjenYukleniyor} onClick={handleAlerjenSil}>
                                <Trash2 className="size-3.5" />
                            </Button>
                        </>
                    )}
                    <Button size="sm" className="h-8 text-xs" disabled={alerjenYukleniyor}
                            onClick={() => alerjenInputRef.current?.click()}>
                        {alerjenYukleniyor ? <Spinner className="size-3.5 mr-1.5" /> : <Plus className="size-3.5 mr-1.5" />}
                        {alerjenPdf ? 'Değiştir' : 'PDF Yükle'}
                    </Button>
                    <input ref={alerjenInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleAlerjenUpload} />
                </div>
            </div>

            {/* ── Fiyat Değiştirilme Tarihi ── Alerjen PDF'iyle aynı global ayar
                dosyasında; elle girilir, tüm şubelerin menüsünde görünür. */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <CalendarDays className="size-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-medium text-foreground">Fiyat Değiştirilme Tarihi</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {fiyatTarihiKayitli
                            ? `Menüde "${new Date(fiyatTarihiKayitli).toLocaleDateString('tr-TR')}" olarak görünüyor.`
                            : 'Girilmedi — menüde tarih satırı görünmez.'}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <Input
                        type="date"
                        value={fiyatTarihi}
                        disabled={fiyatTarihiYukleniyor}
                        onChange={(e) => setFiyatTarihi(e.target.value)}
                        className="h-8 w-[150px] text-xs"
                    />
                    <Button size="sm" className="h-8 text-xs"
                            disabled={fiyatTarihiYukleniyor || fiyatTarihi === fiyatTarihiKayitli}
                            onClick={() => handleFiyatTarihiKaydet(fiyatTarihi)}>
                        {fiyatTarihiYukleniyor ? <Spinner className="size-3.5 mr-1.5" /> : null}
                        Kaydet
                    </Button>
                    {fiyatTarihiKayitli && (
                        <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive"
                                disabled={fiyatTarihiYukleniyor}
                                onClick={() => handleFiyatTarihiKaydet('')}>
                            <Trash2 className="size-3.5" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Add/Edit Modal */}
            <Dialog open={showModal} onOpenChange={(open) => !open && closeModal()}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md p-0 gap-0 border">
                    <DialogHeader className="px-5 py-3 border-b">
                        <DialogTitle className="text-sm font-medium">{editing ? 'Kategori Düzenle' : 'Yeni Kategori'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="flex flex-col">
                        <div className="px-5 py-4 flex flex-col gap-4">
                            {/* Ad */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Kategori Adı</Label>
                                <Input type="text" value={form.ad} onChange={(e) => setForm({ ...form, ad: e.target.value })} placeholder="örn: Tatlılar" required autoFocus />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">
                                    Bu kategoriyi göremeyecek şubeler
                                    <span className="ml-1 font-normal text-muted-foreground">
                                        — kategorideki tüm ürünler o şubelerde gizlenir
                                    </span>
                                </Label>
                                <SubeCokluSecici
                                    subeler={subeler}
                                    secili={form.gizli_subeler || []}
                                    onChange={(v) => setForm({ ...form, gizli_subeler: v })}
                                    placeholder="Tüm şubeler görebilir"
                                />
                            </div>

                            {/* Şube bu kategoride ürünü menüden çıkarabilsin mi.
                                Çekirdek kategorilerde (ör. Soğuk Kadayıf) merkez
                                ürünün tamamen kalkmasını istemiyor; şube yalnızca
                                "şu an satmıyorum" diyebilmeli. */}
                            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                                <input
                                    type="checkbox"
                                    className="mt-0.5 size-4 shrink-0 accent-foreground"
                                    checked={!!form.menuden_cikarilamaz}
                                    onChange={(e) => setForm({ ...form, menuden_cikarilamaz: e.target.checked })}
                                />
                                <span className="text-xs">
                                    <span className="font-medium">Şube menüden çıkaramasın</span>
                                    <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                                        Şube sahibi bu kategorideki ürünleri menüsünden kaldıramaz; yalnızca
                                        “Mevcut değil” olarak işaretleyebilir.
                                    </span>
                                </span>
                            </label>

                        </div>
                        {/* m-0 ŞART: DialogFooter varsayılanı `-mx-4 -mb-4` taşıyor — kendi
                            dolgusu olan DialogContent'e yaslanmak için. Bu diyalog `p-0`
                            kullanıyor, dolayısıyla negatif kenar boşluğu içeriği kutunun
                            16px dışına taşırıyor ve diyalogda hem yatay hem dikey kaydırma
                            çubuğu beliriyordu (ölçüldü: 431/447 ve 343/359). */}
                        <DialogFooter className="m-0 px-5 py-3 border-t">
                            <Button type="button" variant="outline" size="sm" onClick={closeModal}>İptal</Button>
                            <Button type="submit" size="sm" disabled={saving}>{saving ? 'Kaydediliyor...' : editing ? 'Güncelle' : 'Oluştur'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Replace Category Modal */}
            <Dialog open={!!replaceState} onOpenChange={(open) => !open && setReplaceState(null)}>
                <DialogContent className="sm:max-w-sm p-0 gap-0 border">
                    <DialogHeader className="px-5 py-3 border-b">
                        <DialogTitle className="text-sm font-medium">Kategori Değiştir</DialogTitle>
                    </DialogHeader>
                    {replaceState && (
                        <div className="px-5 py-4 flex flex-col gap-4">
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 leading-relaxed">
                                ⚠️ <strong>"{replaceState.kat.ad}"</strong> kategorisinde <strong>{replaceState.urunSayisi}</strong> ürün var. Silmek için ürünleri başka bir kategoriye taşıyın.
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Taşınacak kategori</Label>
                                <select
                                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                    value={replaceState.yeniKategori}
                                    onChange={(e) => setReplaceState({ ...replaceState, yeniKategori: e.target.value })}
                                >
                                    <option value="">Kategori seçin...</option>
                                    {kategoriler.filter(k => k.id !== replaceState.kat.id).map(k => (
                                        <option key={k.id} value={k.id}>{k.ad}</option>
                                    ))}
                                </select>
                            </div>
                            <DialogFooter className="m-0 p-0 pt-1">
                                <Button type="button" variant="outline" size="sm" onClick={() => setReplaceState(null)}>İptal</Button>
                                <Button type="button" variant="destructive" size="sm" onClick={handleReplaceAndDelete}>Taşı ve Sil</Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
