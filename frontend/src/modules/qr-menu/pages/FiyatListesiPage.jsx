import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { format as tarihBicim } from 'date-fns';
import { tr } from 'date-fns/locale';
import { ArrowLeft, Download, FileImage, FileText, CalendarIcon } from 'lucide-react';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MenuPreview } from '../fiyat-listesi/menu-svg';
import { createFormatFile, formats } from '../fiyat-listesi/export-utils';
import { kategoriSirasiniAyarla } from '../fiyat-listesi/data';
import { ciktiGrubu } from '../fiyat-listesi/cikti-gruplari';
import '../fiyat-listesi/fiyat-listesi.css';

/**
 * Şubenin masaya/vitrine koyduğu fiyat listesi çıktısı.
 *
 * AYRI SAYFA, PENCERE DEĞİL: önizleme A4 oranında ve okunabilir olması için
 * yer istiyor; pencere içinde hem küçük kalıyordu hem de ölçü değiştirdikçe
 * pencere boyu zıplıyordu.
 *
 * ÇİZİM MOTORU DIŞARIDAN: `menu-svg.tsx` + `export-utils.ts` Sütlüce Fiyat
 * Listesi uygulamasından olduğu gibi alındı (bkz. fiyat-listesi/FIYAT-LISTESI.md).
 * Buradaki iş yalnızca veri çevirisi ve ekran.
 *
 * VERİ ŞUBENİN KENDİ MENÜSÜ: müşteriye görünen neyse kâğıda o basılır —
 * menüde olmayan ya da "mevcut değil" işaretli ürün girmez, fiyat şubenin
 * geçerli fiyatıdır (kendi fiyatı varsa o, yoksa merkezinki).
 */
const tarihYaz = (d) => tarihBicim(d, 'd MMMM yyyy', { locale: tr });

// Şube kodundan okunur ad — şube sahibinde şube listesi yüklenmiyor.
const subeSlugAd = (slug) => String(slug || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\S+/g, (k) => k.charAt(0).toLocaleUpperCase('tr') + k.slice(1));

export default function FiyatListesiPage() {
    const { role, subeSlug } = useAuth();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();

    // Admin hangi şube adına basacağını adres çubuğundan getirir (Ürünler
    // sayfasındaki düğme oradan gelirken koyuyor); şube sahibi her zaman kendi
    // şubesi — gövdeye/adrese bakılmaz.
    const hedefSube = role === 'admin' ? (params.get('sube') || '') : subeSlug;

    const [urunler, setUrunler] = useState([]);
    const [kategoriler, setKategoriler] = useState([]);
    const [subeler, setSubeler] = useState([]);
    const [yukleniyor, setYukleniyor] = useState(true);
    const [tarih, setTarih] = useState(() => new Date());
    const [takvimAcik, setTakvimAcik] = useState(false);
    const [format, setFormat] = useState('a4');
    const [indiriliyor, setIndiriliyor] = useState(null);

    // Ref KAPTA, SVG'de değil: MenuPreview dışarıdan gelen bir bileşen ve
    // ref'i <svg>'ye geçirmiyor.
    const kapRef = useRef(null);

    const yukle = useCallback(async () => {
        if (!hedefSube) { setYukleniyor(false); return; }
        setYukleniyor(true);
        try {
            const [u, k] = await Promise.all([
                api.get('/products', { params: role === 'admin' ? { sube: hedefSube } : {} }),
                api.get('/categories'),
            ]);
            setUrunler(u.data.urunler || []);
            setKategoriler(k.data.kategoriler || []);
        } catch {
            toast.error('Menü yüklenemedi');
        }
        setYukleniyor(false);
    }, [hedefSube, role]);

    useEffect(() => { yukle(); }, [yukle]);

    // Şube seçici yalnızca admin'de; şube sahibinin seçeceği bir şey yok.
    useEffect(() => {
        if (role !== 'admin') return;
        api.get('/branches').then(({ data }) => setSubeler(data.subeler || [])).catch(() => {});
    }, [role]);

    const subeAd = subeler.find((s) => s.slug === hedefSube)?.ad || subeSlugAd(hedefSube);

    const urunlerCizim = useMemo(() => {
        const katAdi = new Map(kategoriler.map((k) => [k.id, k.ad]));
        // Motor kategori sırasını modül düzeyinde okuyor; çizimden önce dolar.
        kategoriSirasiniAyarla(kategoriler.map((k) => k.ad));

        return urunler
            .filter((u) => (u.menude_subeler || []).includes(hedefSube)
                || (u.tur === 'sube_ozel' && u.sube_slug === hedefSube))
            .filter((u) => !(u.mevcut_degil || []).includes(hedefSube))
            .map((u) => {
                const kategoriAdi = katAdi.get(u.kategori) || 'Diğer';
                const override = u.fiyat_override?.[hedefSube];
                return {
                    id: u.id,
                    categoryId: u.kategori || '',
                    category: kategoriAdi,
                    name: u.ad,
                    // Şubenin geçerli fiyatı: kendi fiyatı varsa o, yoksa merkezinki.
                    price: Number(override ?? u.etkinFiyat ?? u.fiyat) || 0,
                    locked: false,
                    enabled: true,
                    // LED/pleksi/A5 iki kâğıda ayrılıyor; A4'te kullanılmaz.
                    outputGroup: ciktiGrubu(kategoriAdi),
                    owner: 'central',
                };
            });
    }, [urunler, kategoriler, hedefSube]);

    // Seçili ölçüde kâğıda kaç ürün düşüyor: LED/pleksi/A5 gruba göre süzdüğü
    // için sayı A4'ten farklı olur, boş kâğıt indirilmesin.
    const grup = format.includes('tatli') ? 'dessert' : format.includes('diger') ? 'other' : null;
    const basilacak = grup ? urunlerCizim.filter((u) => u.outputGroup === grup) : urunlerCizim;

    async function indir(cikti) {
        const svg = kapRef.current?.querySelector('svg');
        if (!svg) return;
        setIndiriliyor(cikti);
        try {
            const { name, blob } = await createFormatFile(svg, format, subeAd || 'sube', cikti);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            // Tarayıcı indirmeyi başlatana kadar URL yaşamalı.
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (err) {
            toast.error(err?.message || 'Çıktı oluşturulamadı');
        }
        setIndiriliyor(null);
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-start gap-3">
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/admin/qr-menu')}>
                    <ArrowLeft className="size-5" />
                </Button>
                <div className="min-w-0">
                    <h1 className="text-3xl leading-none tracking-tight">Fiyat Listesi Çıktısı</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Menünüzün basılabilir hâli. Masaya, vitrine veya ekrana asmak için indirin.
                    </p>
                </div>
            </div>

            {role === 'admin' && !hedefSube ? (
                <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
                    Önce bir şube seçin.
                    <div className="mt-3">
                        <Button variant="outline" size="sm" onClick={() => navigate('/admin/qr-menu')}>
                            Ürünler'e dön
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
                    {/* Ayarlar sütunu */}
                    <div className="flex flex-col gap-5">
                        {role === 'admin' && (
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="fl-sube">Şube</Label>
                                <select
                                    id="fl-sube"
                                    value={hedefSube}
                                    onChange={(e) => setParams({ sube: e.target.value })}
                                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                                >
                                    {subeler.map((s) => (
                                        <option key={s.slug} value={s.slug}>{s.ad}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="flex flex-col gap-1.5">
                            <Label>Liste tarihi</Label>
                            <Popover open={takvimAcik} onOpenChange={setTakvimAcik}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="justify-start text-left font-normal">
                                        <CalendarIcon className="mr-2 size-4" />
                                        {tarihYaz(tarih)}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={tarih}
                                        // Seçili güne tekrar tıklamak seçimi kaldırıyor;
                                        // liste tarihsiz basılamaz, eskisi korunur.
                                        onSelect={(d) => { if (d) setTarih(d); setTakvimAcik(false); }}
                                        initialFocus
                                        locale={tr}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label>Ölçü</Label>
                            {/* LED/pleksi/A5 iki kâğıt: ön yüz tatlılar, arka yüz
                                içecekler ve diğerleri (bkz. cikti-gruplari.js). */}
                            <div className="flex flex-wrap gap-1.5">
                                {formats.map((f) => (
                                    <button key={f.id} type="button" onClick={() => setFormat(f.id)}
                                        className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                            format === f.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                                        }`}>
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-lg border p-3 text-xs text-muted-foreground">
                            <p><strong className="text-foreground">{basilacak.length} ürün</strong> · {subeAd}</p>
                            <p className="mt-1">
                                Menünüzde satışta olan ürünler basılır; "mevcut değil" işaretledikleriniz hariç.
                            </p>
                            <p className="mt-1">Yazdırırken ölçeklemeyi %100 seçin, kenar boşluğu eklemeyin.</p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Button className="flex-1" disabled={!!indiriliyor || basilacak.length === 0}
                                onClick={() => indir('pdf')}>
                                {indiriliyor === 'pdf'
                                    ? <><Download className="mr-1.5 size-4 animate-pulse" /> Hazırlanıyor…</>
                                    : <><FileText className="mr-1.5 size-4" /> PDF indir</>}
                            </Button>
                            <Button variant="outline" disabled={!!indiriliyor || basilacak.length === 0}
                                onClick={() => indir('png')}>
                                <FileImage className="mr-1.5 size-4" /> PNG
                            </Button>
                            <Button variant="outline" disabled={!!indiriliyor || basilacak.length === 0}
                                onClick={() => indir('jpeg')}>
                                <FileImage className="mr-1.5 size-4" /> JPEG
                            </Button>
                        </div>
                    </div>

                    {/* Önizleme */}
                    {yukleniyor ? (
                        <div className="flex items-center justify-center rounded-xl border py-24"><Spinner className="size-8" /></div>
                    ) : basilacak.length === 0 ? (
                        <div className="flex items-center justify-center rounded-xl border py-24 text-sm text-muted-foreground">
                            Bu ölçüde basılacak ürün yok.
                        </div>
                    ) : (
                        <div ref={kapRef} className="fl-onizleme fl-onizleme--sayfa">
                            <MenuPreview
                                products={urunlerCizim}
                                format={format}
                                date={tarihYaz(tarih)}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
