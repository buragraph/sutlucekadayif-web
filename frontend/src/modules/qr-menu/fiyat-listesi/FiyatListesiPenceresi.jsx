import { useState, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { Printer, Download, FileImage, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MenuPreview } from './menu-svg';
import { createFormatFile, formats } from './export-utils';
import { kategoriSirasiniAyarla } from './data';
import { ciktiGrubu } from './cikti-gruplari';
import './fiyat-listesi.css';

/**
 * Şubenin masa/vitrin için bastığı A4 fiyat listesi.
 *
 * ÇİZİM MOTORU DIŞARIDAN: `menu-svg.tsx` + `export-utils.ts` Sütlüce Fiyat
 * Listesi uygulamasından olduğu gibi alındı, dokunulmuyor (bkz. data.ts).
 * Buradaki iş yalnızca "bizim menü verisi → motorun beklediği ürün şekli"
 * çevirisi ve pencere.
 *
 * VERİ ŞUBENİN KENDİ MENÜSÜ: müşteriye görünen neyse kâğıda o basılır —
 * menüde olmayan ya da "mevcut değil" işaretli ürün listeye girmez, fiyat
 * şubenin geçerli fiyatıdır (varsa kendi fiyatı, yoksa merkezinki).
 */
const bugun = () => new Date().toISOString().slice(0, 10);

const tarihYaz = (iso) => {
    try {
        return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return iso; }
};

export default function FiyatListesiPenceresi({ acik, kapat, urunler, kategoriler, subeAd }) {
    const [tarih, setTarih] = useState(bugun);
    const [format, setFormat] = useState('a4');
    const [indiriliyor, setIndiriliyor] = useState(null);
    // Ref KAPTA, SVG'de değil: MenuPreview dışarıdan gelen bir bileşen ve
    // ref'i <svg>'ye geçirmiyor. Kaptan sorgulamak motoru değiştirmeden
    // çıktı elemanına ulaşmanın tek yolu.
    const kapRef = useRef(null);
    const svgAl = () => kapRef.current?.querySelector('svg');

    // Kategori sırası merkezin belirlediği sıra (kategoriler.sira). Motor bunu
    // modül düzeyinde okuyor, çizimden önce doldurulmalı.
    const urunlerCizim = useMemo(() => {
        const katAdi = new Map(kategoriler.map((k) => [k.id, k.ad]));
        kategoriSirasiniAyarla(kategoriler.map((k) => k.ad));

        return (urunler || []).map((u) => ({
            id: u.id,
            categoryId: u.kategori || '',
            category: katAdi.get(u.kategori) || 'Diğer',
            name: u.ad,
            // Şubenin geçerli fiyatı: kendi fiyatı varsa o, yoksa merkezinki.
            price: Number(u.etkinFiyat ?? u.fiyat) || 0,
            locked: false,
            enabled: true,
            // LED/pleksi/A5 çıktıları tatlı ve diğer diye iki kâğıda ayrılıyor;
            // motor ürünü bu alana göre süzüyor. A4'te kullanılmaz.
            outputGroup: ciktiGrubu(katAdi.get(u.kategori) || ''),
            owner: 'central',
        }));
    }, [urunler, kategoriler]);

    // Seçili ölçüde kâğıda kaç ürün düşüyor: LED/pleksi/A5 gruba göre
    // süzdüğü için sayı A4'ten farklı olur, kullanıcı boş kâğıt indirmesin.
    const grup = format.includes('tatli') ? 'dessert' : format.includes('diger') ? 'other' : null;
    const basilacak = grup ? urunlerCizim.filter((u) => u.outputGroup === grup) : urunlerCizim;

    async function indir(cikti) {
        const svg = svgAl();
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
        <Dialog open={acik} onOpenChange={(a) => !a && kapat()}>
            <DialogContent className="max-w-2xl [&>*]:min-w-0">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Printer className="size-4" /> Fiyat Listesi
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="fl-tarih">Liste tarihi</Label>
                            <Input id="fl-tarih" type="date" className="w-44"
                                value={tarih} onChange={(e) => setTarih(e.target.value)} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {basilacak.length} ürün · {subeAd}
                        </p>
                    </div>

                    {/* Ölçü seçimi. LED/pleksi/A5 iki kâğıt: ön yüz tatlılar,
                        arka yüz içecekler ve diğerleri (bkz. cikti-gruplari.js). */}
                    <div className="flex flex-wrap gap-1.5">
                        {formats.map((f) => (
                            <button key={f.id} type="button" onClick={() => setFormat(f.id)}
                                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                    format === f.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                                }`}>
                                {f.label}
                            </button>
                        ))}
                    </div>

                    {basilacak.length === 0 ? (
                        <p className="py-12 text-center text-sm text-muted-foreground">
                            Bu ölçüde basılacak ürün yok.
                        </p>
                    ) : (
                        <div ref={kapRef} className="fl-onizleme max-h-[55vh] overflow-auto">
                            <MenuPreview
                                products={urunlerCizim}
                                format={format}
                                date={tarihYaz(tarih)}
                            />
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:justify-between">
                    <p className="text-xs text-muted-foreground sm:mr-auto">
                        Yazdırırken ölçeklemeyi <strong>%100</strong> seçin, kenar boşluğu eklemeyin.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" disabled={!!indiriliyor || basilacak.length === 0}
                            onClick={() => indir('png')}>
                            <FileImage className="mr-1.5 size-4" /> PNG
                        </Button>
                        <Button variant="outline" size="sm" disabled={!!indiriliyor || basilacak.length === 0}
                            onClick={() => indir('jpeg')}>
                            <FileImage className="mr-1.5 size-4" /> JPEG
                        </Button>
                        <Button size="sm" disabled={!!indiriliyor || basilacak.length === 0}
                            onClick={() => indir('pdf')}>
                            {indiriliyor === 'pdf'
                                ? <><Download className="mr-1.5 size-4 animate-pulse" /> Hazırlanıyor…</>
                                : <><FileText className="mr-1.5 size-4" /> PDF indir</>}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
