import { useState, useEffect, useRef } from 'react';
import { fiyatYaz } from '../utils/fiyat';
import { Send, TriangleAlert, Check, Image as ImageIcon, X } from 'lucide-react';
import api from '../../../services/api';
import { gorseliWebpYap } from '../utils/gorsel';
import { proxyImageUrl } from '../../../utils/imageProxy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';

/**
 * Şube ürün talebi formu.
 *
 * Duplikasyon buradaki canlı kontrolle engellenir, onay ekranında DEĞİL:
 * şube ad yazarken katalogda aynı/benzer ürün aranır ve "bunu mu kastettin?"
 * çıkar. Katalogda varsa talep açmaya gerek yok — `onKatalogtanEkle` ile
 * doğrudan menüsüne eklenir.
 */
export default function UrunTalepModal({ acik, onKapat, kategoriler, onGonderildi, onKatalogtanEkle }) {
    const [ad, setAd] = useState('');
    const [kategoriId, setKategoriId] = useState('');
    const [fiyat, setFiyat] = useState('');
    const [aciklama, setAciklama] = useState('');
    const [gorsel, setGorsel] = useState('');
    const [gorselYukleniyor, setGorselYukleniyor] = useState(false);
    const [hazirGorseller, setHazirGorseller] = useState([]);
    const [gorselSekme, setGorselSekme] = useState('sec');   // 'sec' | 'yukle'
    const [tam, setTam] = useState([]);       // birebir aynı ürün — talep gereksiz
    const [yakin, setYakin] = useState([]);   // yazım hatası şüphesi — uyarı
    const [araniyor, setAraniyor] = useState(false);
    const [gonderiliyor, setGonderiliyor] = useState(false);
    const [hata, setHata] = useState('');
    const zamanlayici = useRef(null);

    // Sıfırlama effect'te DEĞİL kapatma yolunda: effect içinde senkron setState
    // zincirleme render tetikliyor (react-hooks/set-state-in-effect).
    function kapat() {
        setAd(''); setKategoriId(''); setFiyat(''); setAciklama(''); setGorsel('');
        setTam([]); setYakin([]); setHata('');
        onKapat();
    }

    // Yazarken arama — her tuşta istek atmamak için 350 ms bekletilir.
    useEffect(() => {
        clearTimeout(zamanlayici.current);
        const q = ad.trim();
        if (q.length < 2) {
            // Zaten boşsa dokunma — gereksiz render olmasın
            setTam((p) => (p.length ? [] : p));
            setYakin((p) => (p.length ? [] : p));
            return;
        }
        zamanlayici.current = setTimeout(async () => {
            setAraniyor(true);
            try {
                const { data } = await api.get('/urun-talepleri/benzer', { params: { ad: q } });
                setTam(data.benzerler || []);
                setYakin(data.yakinlar || []);
            } catch { /* arama sessizce başarısız olabilir, form yine çalışır */ }
            setAraniyor(false);
        }, 350);
        return () => clearTimeout(zamanlayici.current);
    }, [ad]);

    async function gonder(zorla = false) {
        setHata('');
        if (!ad.trim()) return setHata('Ürün adı zorunludur.');
        setGonderiliyor(true);
        try {
            await api.post('/urun-talepleri', {
                ad: ad.trim(),
                kategoriId: kategoriId || undefined,
                fiyat: fiyat === '' ? undefined : Number(fiyat),
                aciklama: aciklama.trim() || undefined,
                gorsel: gorsel || undefined,
                zorla,
            });
            onGonderildi?.();
            kapat();
        } catch (err) {
            const d = err.response?.data;
            if (err.response?.status === 409 && (d?.benzerler?.length || d?.yakinlar?.length)) {
                setTam(d.benzerler || []); setYakin(d.yakinlar || []);
                setHata(d.error || 'Katalogda benzer ürün var.');
            } else {
                setHata(d?.error || 'Talep gönderilemedi.');
            }
        }
        setGonderiliyor(false);
    }

    // Görsel merkeze "bu ürün neye benziyor" bilgisini taşır; talep onaylanınca
    // aynı görsel ürüne geçer (bkz. backend onayla). Yükleme ucu şubeye açık tek
    // uç: /urun-talepleri/gorsel — medya kütüphanesi şube sahibine kapalı.
    async function gorselSec(e) {
        const dosya = e.target.files?.[0];
        e.target.value = '';
        if (!dosya) return;
        setGorselYukleniyor(true);
        try {
            const govde = new FormData();
            govde.append('image', await gorseliWebpYap(dosya));
            const { data } = await api.post('/urun-talepleri/gorsel', govde, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setGorsel(data.url);
        } catch (err) {
            setHata(err.response?.data?.error || 'Görsel yüklenemedi');
        }
        setGorselYukleniyor(false);
    }

    // Merkezin "şubelere açık" işaretlediği medya klasörlerindeki hazır
    // görseller. Medya kütüphanesinin tamamı şubeye kapalı; bu uç yalnızca
    // açık klasörleri döndürür (bkz. urun-talepleri.js GET /gorseller).
    useEffect(() => {
        if (!acik) return;
        let iptal = false;
        api.get('/urun-talepleri/gorseller')
            .then(({ data }) => { if (!iptal) setHazirGorseller(data.gorseller || []); })
            .catch(() => { /* klasör açılmamışsa sekme hiç görünmez */ });
        return () => { iptal = true; };
    }, [acik]);

    const eslesme = [...tam, ...yakin];

    return (
        <Dialog open={acik} onOpenChange={(o) => { if (!o) kapat(); }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Send className="size-4" /> Ürün Talebi Oluştur
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                        Katalogda olmayan bir ürün için talep açarsınız. Merkez onaylayınca ürün
                        menünüze eklenir.
                    </p>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Ürün adı</Label>
                        <Input value={ad} onChange={(e) => setAd(e.target.value)}
                               placeholder="Örn. Fıstıklı Sarma Şerbetli Kadayıf" autoFocus className="h-9 text-sm" />
                        {araniyor && <p className="text-xs text-muted-foreground">Katalogda aranıyor…</p>}
                    </div>

                    {eslesme.length > 0 && (
                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                            <p className="flex items-start gap-2 text-xs font-medium text-foreground">
                                <TriangleAlert className="size-3.5 shrink-0 mt-0.5 text-amber-600" />
                                {tam.length > 0
                                    ? 'Bu ürün katalogda zaten var — talep açmak yerine menünüze ekleyebilirsiniz.'
                                    : 'Katalogda çok benzer bir ürün var. Yazım hatası olabilir.'}
                            </p>
                            {eslesme.map((u) => (
                                <div key={u.id} className="flex items-center gap-2 rounded-md bg-background/70 p-2">
                                    <span className="min-w-0 flex-1 truncate text-sm">{u.ad}</span>
                                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                        {fiyatYaz(u.fiyat)} ₺
                                    </span>
                                    <Button size="sm" variant="outline" className="h-7 text-xs"
                                            onClick={() => { onKatalogtanEkle?.(u.id); kapat(); }}>
                                        <Check className="size-3 mr-1" /> Menüme ekle
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Kategori</Label>
                            <select value={kategoriId} onChange={(e) => setKategoriId(e.target.value)}
                                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                                <option value="">Seçiniz</option>
                                {kategoriler.map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Önerilen fiyat (₺)</Label>
                            <Input type="number" min="0" step="0.01" value={fiyat}
                                   onChange={(e) => setFiyat(e.target.value)} className="h-9 text-sm" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Açıklama <span className="text-muted-foreground">(isteğe bağlı)</span></Label>
                        <Textarea value={aciklama} onChange={(e) => setAciklama(e.target.value)} rows={2}
                                  placeholder="Merkeze iletmek istediğiniz not" className="text-sm" />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Ürün Görseli <span className="text-muted-foreground">(isteğe bağlı)</span></Label>
                        {gorsel ? (
                            <div className="relative overflow-hidden rounded-md border">
                                <img src={proxyImageUrl(gorsel)} alt="" className="h-28 w-full object-cover" />
                                <Button type="button" variant="secondary" size="icon"
                                        className="absolute right-2 top-2 size-7" title="Görseli kaldır"
                                        onClick={() => setGorsel('')}>
                                    <X className="size-3.5" />
                                </Button>
                            </div>
                        ) : (
                          <>
                            {/* Merkez hazır görsel paylaştıysa önce ONU seçtir:
                                aynı ürünün her şubeden farklı fotoğrafla gelmesi
                                yerine ortak görsel kullanılsın. Aradığı yoksa
                                kendi fotoğrafını yükleyebilir. */}
                            {hazirGorseller.length > 0 && (
                                <div className="mb-2 flex gap-1">
                                    {[['sec', 'Hazır görseller'], ['yukle', 'Kendi fotoğrafım']].map(([k, etiket]) => (
                                        <button key={k} type="button" onClick={() => setGorselSekme(k)}
                                                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                                    gorselSekme === k ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                                                }`}>
                                            {etiket}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {hazirGorseller.length > 0 && gorselSekme === 'sec' ? (
                                <div className="grid max-h-40 grid-cols-4 gap-1.5 overflow-y-auto rounded-md border p-1.5">
                                    {hazirGorseller.map((g) => (
                                        <button key={g.id} type="button" title={g.ad || ''}
                                                onClick={() => setGorsel(g.url)}
                                                className="overflow-hidden rounded border transition-colors hover:border-foreground/40">
                                            <img src={proxyImageUrl(g.url)} alt={g.ad || ''}
                                                 className="aspect-square w-full object-cover" loading="lazy" />
                                        </button>
                                    ))}
                                </div>
                            ) : (
                            <label className={`flex h-20 items-center justify-center gap-2 rounded-md border border-dashed text-xs text-muted-foreground ${gorselYukleniyor ? 'cursor-default' : 'cursor-pointer hover:bg-muted/40'}`}>
                                {gorselYukleniyor
                                    ? <><Spinner className="size-4" /> Yükleniyor…</>
                                    : <><ImageIcon className="size-4" /> Görsel seç</>}
                                <input type="file" accept="image/*" className="hidden"
                                       disabled={gorselYukleniyor} onChange={gorselSec} />
                            </label>
                            )}
                          </>
                        )}
                    </div>

                    {hata && <p className="text-xs text-destructive">{hata}</p>}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                    <Button variant="outline" onClick={kapat}>İptal</Button>
                    <Button onClick={() => gonder(eslesme.length > 0)} disabled={gonderiliyor || !ad.trim()}>
                        {gonderiliyor && <Spinner className="size-3.5 mr-1.5" />}
                        {eslesme.length > 0 ? 'Yine de talep et' : 'Talep Gönder'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
