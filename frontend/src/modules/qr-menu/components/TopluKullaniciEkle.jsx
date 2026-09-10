import { useMemo, useState } from 'react';
import { Upload, Check, X, AlertTriangle } from 'lucide-react';
import api from '../../../services/api';
import { useToast } from '../../../shared/components/Toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import SubeSecici from './SubeSecici';

/**
 * Listeden toplu kullanıcı açma.
 *
 * NEDEN VAR: şube sahibi devrinde ~90 hesap açılacak. Tek tek açmak yavaş
 * olduğu kadar hataya da açık; asıl zorluk her satırın DOĞRU ŞUBEYE
 * bağlanması. Bu yüzden ekran önce eşleştirmeyi yapıp gösteriyor, yazma
 * ancak onaydan sonra oluyor.
 *
 * ŞUBE EŞLEŞTİRME kaynak listedeki adlar bizimkilerle birebir aynı olmadığı
 * için kademeli: tam ad → il öneki düşmüş ad ("Çayırova" ↔ "Kocaeli
 * Çayırova") → şube kodu → tek adaylı kısmi eşleşme. Tutmayan satır kırmızı
 * çıkar ve elle seçilir; tahmin edip sessizce yanlış şubeye bağlamaz.
 */
const nrm = (s) => String(s || '')
    .normalize('NFC').toLocaleLowerCase('tr')
    .replace(/[^a-z0-9çğıöşü]+/gi, ' ').trim();

function subeBul(ad, subeler) {
    const n = nrm(ad);
    if (!n) return null;
    let m = subeler.find((s) => nrm(s.ad) === n);
    if (m) return m.slug;
    m = subeler.find((s) => nrm(s.ad).endsWith(` ${n}`));
    if (m) return m.slug;
    m = subeler.find((s) => nrm(s.slug).replace(/[_-]/g, ' ') === n);
    if (m) return m.slug;
    const aday = subeler.filter((s) => nrm(s.ad).includes(n));
    return aday.length === 1 ? aday[0].slug : null;
}

// Satır ayrıştırma: Excel'den kopyalayınca sekme, CSV'den virgül/noktalı virgül.
function satirAyir(satir) {
    const ayrac = satir.includes('\t') ? '\t' : (satir.includes(';') ? ';' : ',');
    return satir.split(ayrac).map((h) => h.trim());
}

const EPOSTA_KALIBI = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function TopluKullaniciEkle({ subeler, acik, onKapat, onBitti }) {
    const toast = useToast();
    const [metin, setMetin] = useState('');
    const [rol, setRol] = useState('sube_sahibi');
    const [elleSube, setElleSube] = useState({});      // { satirNo: slug } — kullanıcı düzeltmesi
    const [kaydediliyor, setKaydediliyor] = useState(false);
    const [sonuc, setSonuc] = useState(null);

    const satirlar = useMemo(() => {
        return metin.split('\n').map((h) => h.trim()).filter(Boolean).map((ham, i) => {
            const p = satirAyir(ham);
            const email = (p[0] || '').toLowerCase();
            const parola = p[1] || '';
            const subeAdi = p[2] || '';
            const adSoyad = p[3] || '';
            const otomatik = rol === 'admin' ? '' : subeBul(subeAdi, subeler);
            const slug = elleSube[i] ?? otomatik ?? '';
            const hatalar = [];
            if (!EPOSTA_KALIBI.test(email)) hatalar.push('e-posta geçersiz');
            if (parola && parola.length < 6) hatalar.push('parola çok kısa');
            if (rol !== 'admin' && !slug) hatalar.push('şube eşleşmedi');
            return { i, email, parola, subeAdi, adSoyad, slug, hatalar };
        });
    }, [metin, rol, subeler, elleSube]);

    const gecerli = satirlar.filter((s) => s.hatalar.length === 0);
    const hatali = satirlar.length - gecerli.length;

    async function gonder() {
        setKaydediliyor(true);
        try {
            const { data } = await api.post('/users/toplu', {
                kayitlar: gecerli.map((s) => ({
                    email: s.email,
                    password: s.parola || undefined,
                    ad_soyad: s.adSoyad || undefined,
                    subeSlug: s.slug || undefined,
                    role: rol,
                })),
            });
            setSonuc(data);
            onBitti?.();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Toplu açma başarısız.');
        }
        setKaydediliyor(false);
    }

    return (
        <Dialog open={acik} onOpenChange={(a) => { if (!a) { setSonuc(null); onKapat(); } }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="size-5" /> Toplu kullanıcı ekle
                    </DialogTitle>
                    <DialogDescription>
                        Excel'den kopyalayıp yapıştırın. Sütun sırası:
                        <strong> e-posta · parola · şube adı · ad soyad</strong> (son ikisi boş bırakılabilir).
                        Parola girilirse kullanıcı ilk girişte değiştirmek zorunda kalır.
                    </DialogDescription>
                </DialogHeader>

                {sonuc ? (
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(sonuc.ozet).map(([k, v]) => (
                                <Badge key={k} variant={k === 'olusturuldu' ? 'default' : 'secondary'}>
                                    {k === 'olusturuldu' ? 'açıldı' : k === 'zaten_var' ? 'zaten vardı' : 'hata'}: {v}
                                </Badge>
                            ))}
                        </div>
                        <div className="max-h-80 overflow-y-auto rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-10">#</TableHead>
                                        <TableHead>E-posta</TableHead>
                                        <TableHead>Sonuç</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sonuc.sonuclar.map((s) => (
                                        <TableRow key={s.sira}>
                                            <TableCell className="text-muted-foreground">{s.sira}</TableCell>
                                            <TableCell className="font-mono text-xs">{s.email}</TableCell>
                                            <TableCell className="text-xs">
                                                {s.durum === 'olusturuldu' ? (
                                                    <span className="text-emerald-700 dark:text-emerald-400">
                                                        <Check className="mr-1 inline size-3.5" />açıldı
                                                        {s.ilerlemeBaglandi > 0 && ` · ${s.ilerlemeBaglandi} akademi kaydı bağlandı`}
                                                    </span>
                                                ) : s.durum === 'zaten_var' ? (
                                                    <span className="text-muted-foreground">zaten vardı</span>
                                                ) : (
                                                    <span className="text-destructive">{s.mesaj}</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="flex flex-col gap-1.5">
                                <Label>Rol</Label>
                                <Select value={rol} onValueChange={setRol}>
                                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="sube_sahibi">Şube Sahibi</SelectItem>
                                        <SelectItem value="calisan">Çalışan</SelectItem>
                                        <SelectItem value="admin">Yönetici</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {satirlar.length > 0 && (
                                <div className="flex gap-2 pb-1.5">
                                    <Badge variant="default">{gecerli.length} hazır</Badge>
                                    {hatali > 0 && <Badge variant="destructive">{hatali} sorunlu</Badge>}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="toplu-metin">Liste</Label>
                            <Textarea
                                id="toplu-metin"
                                rows={6}
                                className="font-mono text-xs"
                                placeholder={'ornek@sutlucekadayif.com\tGeciciParola123\tÇAYIROVA\tAhmet Yılmaz'}
                                value={metin}
                                onChange={(e) => { setMetin(e.target.value); setElleSube({}); }}
                            />
                        </div>

                        {satirlar.length > 0 && (
                            <div className="max-h-72 overflow-y-auto rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-10">#</TableHead>
                                            <TableHead>E-posta</TableHead>
                                            <TableHead>Şube</TableHead>
                                            <TableHead className="w-24">Parola</TableHead>
                                            <TableHead>Durum</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {satirlar.map((s) => (
                                            <TableRow key={s.i} className={s.hatalar.length ? 'bg-destructive/5' : ''}>
                                                <TableCell className="text-muted-foreground">{s.i + 1}</TableCell>
                                                <TableCell className="font-mono text-xs">{s.email || '—'}</TableCell>
                                                <TableCell>
                                                    {rol === 'admin' ? (
                                                        <span className="text-muted-foreground text-xs">—</span>
                                                    ) : (
                                                        <SubeSecici
                                                            subeler={subeler}
                                                            deger={s.slug}
                                                            yerTutucu={s.subeAdi || 'Şube seçin'}
                                                            kucuk
                                                            onSec={(v) => setElleSube((o) => ({ ...o, [s.i]: v }))}
                                                        />
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {s.parola ? 'var' : <span className="text-muted-foreground">yok</span>}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {s.hatalar.length ? (
                                                        <span className="text-destructive">
                                                            <AlertTriangle className="mr-1 inline size-3.5" />
                                                            {s.hatalar.join(', ')}
                                                        </span>
                                                    ) : (
                                                        <span className="text-emerald-700 dark:text-emerald-400">hazır</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    {sonuc ? (
                        <Button onClick={() => { setSonuc(null); setMetin(''); setElleSube({}); onKapat(); }}>
                            Kapat
                        </Button>
                    ) : (
                        <>
                            <Button variant="outline" onClick={onKapat}>
                                <X className="mr-2 size-4" /> Vazgeç
                            </Button>
                            <Button onClick={gonder} disabled={gecerli.length === 0 || kaydediliyor}>
                                {kaydediliyor ? <Spinner className="mr-2 size-4" /> : <Check className="mr-2 size-4" />}
                                {gecerli.length} kullanıcıyı aç
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
