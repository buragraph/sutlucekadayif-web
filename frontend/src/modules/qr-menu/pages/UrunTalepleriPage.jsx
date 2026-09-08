import { useState, useEffect } from 'react';
import { fiyatYaz } from '../utils/fiyat';
import { Inbox, Check, X, TriangleAlert, Store } from 'lucide-react';
import api from '../../../services/api';
import { proxyImageUrl } from '../../../utils/imageProxy';
import { useAuth } from '../../../context/AuthContext';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

const DURUM_ETIKET = {
    bekliyor: { ad: 'Bekliyor', renk: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
    onaylandi: { ad: 'Onaylandı', renk: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
    reddedildi: { ad: 'Reddedildi', renk: 'bg-destructive/10 text-destructive' },
};

/**
 * Ürün talepleri — admin gelen kutusu / şube kendi geçmişi.
 *
 * Admin için karar "onayla/reddet" DEĞİL, "eşleştir ya da yeni aç": talebin
 * yanında katalogdaki benzer ürünler durur, tek tıkla ona bağlanır. Mükerrer
 * ürün açılmasının önündeki asıl engel bu — ad karşılaştırmasını gözle yapmak
 * 88 şubelik akışta çalışmıyor.
 */
export default function UrunTalepleriPage() {
    const { role } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();
    const adminMi = role === 'admin';

    const [talepler, setTalepler] = useState([]);
    const [kategoriler, setKategoriler] = useState([]);
    const [yukleniyor, setYukleniyor] = useState(true);
    const [filtre, setFiltre] = useState('bekliyor');
    const [benzerler, setBenzerler] = useState({});   // talepId -> [{id, ad, fiyat}]
    const [islenen, setIslenen] = useState(null);
    const [taslak, setTaslak] = useState({});         // talepId -> { fiyat, kategoriId }

    async function kategorileriYukle() {
        try {
            const { data } = await api.get('/categories');
            setKategoriler(data.kategoriler || data || []);
        } catch { /* kategori listesi olmasa da onay yapılabilir (talepteki kullanılır) */ }
    }

    async function yukle() {
        setYukleniyor(true);
        try {
            const { data } = await api.get('/urun-talepleri', {
                params: filtre === 'hepsi' ? {} : { durum: filtre },
            });
            const liste = data.talepler || [];
            setTalepler(liste);
            if (adminMi) {
                // Her bekleyen talep için katalogdaki adayları çek — admin
                // "yeni ürün aç" demeden önce mevcudu görsün.
                const bekleyen = liste.filter((t) => t.durum === 'bekliyor');
                const sonuc = await Promise.all(bekleyen.map(async (t) => {
                    try {
                        const { data: b } = await api.get('/urun-talepleri/benzer', { params: { ad: t.ad } });
                        return [t.id, [...(b.benzerler || []), ...(b.yakinlar || [])]];
                    } catch { return [t.id, []]; }
                }));
                setBenzerler(Object.fromEntries(sonuc));
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'Talepler yüklenemedi');
        }
        setYukleniyor(false);
    }

    // Tanımların ALTINDA: yukarıda olsalardı `yukle` bildirilmeden erişilirdi.
    useEffect(() => { yukle(); }, [filtre]);
    useEffect(() => { if (adminMi) kategorileriYukle(); }, [adminMi]);

    async function onayla(talep, urunId) {
        const d = taslak[talep.id] || {};
        if (!urunId) {
            const kat = d.kategoriId || talep.kategoriId;
            const fiyat = d.fiyat ?? talep.fiyat;
            if (!kat) return toast.error('Kategori seçin');
            if (fiyat == null || fiyat === '') return toast.error('Fiyat girin');
        }
        setIslenen(talep.id);
        try {
            await api.patch(`/urun-talepleri/${talep.id}/onayla`, urunId
                ? { urunId }
                : {
                    // Merkez talebi olduğu gibi kabul etmek zorunda değil:
                    // gönderilmeyen alan sunucuda talepteki hâlinde kalır.
                    kategoriId: d.kategoriId || talep.kategoriId,
                    fiyat: d.fiyat ?? talep.fiyat,
                    ad: d.ad ?? talep.ad,
                    aciklama: d.aciklama ?? talep.aciklama ?? '',
                    gorsel: d.gorsel ?? talep.gorsel ?? '',
                    miktar: d.miktar,
                    birim: d.birim,
                    kalori: d.kalori,
                });
            toast.success(urunId
                ? `Mevcut ürün ${talep.subeSlug} şubesinde açıldı`
                : `"${talep.ad}" katalogda açıldı, ${talep.subeSlug} menüsüne eklendi — fiyatı her şube kendi belirleyebilir`);
            yukle();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Onaylanamadı');
        }
        setIslenen(null);
    }

    async function reddet(talep) {
        const ok = await confirm(`"${talep.ad}" talebi reddedilsin mi?`);
        if (!ok) return;
        setIslenen(talep.id);
        try {
            await api.patch(`/urun-talepleri/${talep.id}/reddet`, {});
            toast.success('Talep reddedildi');
            yukle();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Reddedilemedi');
        }
        setIslenen(null);
    }

    const bekleyenSayisi = talepler.filter((t) => t.durum === 'bekliyor').length;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
                        <Inbox className="size-4.5" /> Ürün Talepleri
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {adminMi
                            ? 'Şubelerin katalogda olmayan ürünler için açtığı talepler.'
                            : 'Merkeze ilettiğiniz ürün talepleri ve durumları.'}
                    </p>
                </div>
                <div className="flex gap-1.5">
                    {['bekliyor', 'onaylandi', 'reddedildi', 'hepsi'].map((f) => (
                        <Button key={f} size="sm" variant={filtre === f ? 'default' : 'outline'}
                                className="h-8 text-xs capitalize" onClick={() => setFiltre(f)}>
                            {f === 'hepsi' ? 'Hepsi' : DURUM_ETIKET[f].ad}
                            {f === 'bekliyor' && bekleyenSayisi > 0 && filtre === 'bekliyor' && ` (${bekleyenSayisi})`}
                        </Button>
                    ))}
                </div>
            </div>

            {yukleniyor ? (
                <p className="py-12 text-center text-sm text-muted-foreground">Yükleniyor…</p>
            ) : talepler.length === 0 ? (
                <div className="rounded-lg border bg-card py-14 text-center">
                    <Inbox className="mx-auto size-8 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">
                        {filtre === 'bekliyor' ? 'Bekleyen talep yok.' : 'Kayıt bulunamadı.'}
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {talepler.map((t) => {
                        const aday = benzerler[t.id] || [];
                        const d = taslak[t.id] || {};
                        const et = DURUM_ETIKET[t.durum] || DURUM_ETIKET.bekliyor;
                        return (
                            <div key={t.id} className="rounded-lg border bg-card p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    {t.gorsel && (
                                        <img src={proxyImageUrl(t.gorsel)} alt=""
                                             className="size-16 shrink-0 rounded-md border object-cover" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="text-sm font-medium text-foreground">{t.ad}</h2>
                                            <Badge className={`${et.renk} border-0 text-[10px]`}>{et.ad}</Badge>
                                        </div>
                                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            <span className="inline-flex items-center gap-1">
                                                <Store className="size-3" /> {t.subeSlug}
                                            </span>
                                            {t.fiyat != null && <span>· önerilen {fiyatYaz(t.fiyat)} ₺</span>}
                                            <span>· {new Date(t.olusturmaZamani).toLocaleDateString('tr-TR')}</span>
                                        </p>
                                        {t.aciklama && <p className="mt-1.5 text-xs text-foreground/80">{t.aciklama}</p>}
                                    </div>
                                </div>

                                {adminMi && t.durum === 'bekliyor' && (
                                    <div className="mt-3 space-y-3 border-t pt-3">
                                        {aday.length > 0 && (
                                            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 space-y-1.5">
                                                <p className="flex items-center gap-1.5 text-xs font-medium">
                                                    <TriangleAlert className="size-3.5 text-amber-600" />
                                                    Katalogda benzer ürün var — yeni açmak yerine bunu kullanabilirsiniz
                                                </p>
                                                {aday.map((u) => (
                                                    <div key={u.id} className="flex items-center gap-2 rounded bg-background/70 p-1.5">
                                                        <span className="min-w-0 flex-1 truncate text-sm">{u.ad}</span>
                                                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                                            {fiyatYaz(u.fiyat)} ₺
                                                        </span>
                                                        <Button size="sm" variant="outline" className="h-7 text-xs"
                                                                disabled={islenen === t.id}
                                                                onClick={() => onayla(t, u.id)}>
                                                            Bu ürünü kullan
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Talep merkezin ONAYLADIĞI hâliyle ürüne dönüşür;
                                            bu yüzden tüm içerik burada düzenlenebilir.
                                            Dokunulmayan alan talepteki değerinde kalır. */}
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <div className="space-y-1">
                                                <Label className="text-[11px]">Ürün adı</Label>
                                                <Input className="h-8 text-xs"
                                                       value={d.ad ?? t.ad ?? ''}
                                                       onChange={(e) => setTaslak((p) => ({ ...p, [t.id]: { ...d, ad: e.target.value } }))} />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[11px]">Açıklama</Label>
                                                <Input className="h-8 text-xs" placeholder="Menüde görünecek açıklama"
                                                       value={d.aciklama ?? t.aciklama ?? ''}
                                                       onChange={(e) => setTaslak((p) => ({ ...p, [t.id]: { ...d, aciklama: e.target.value } }))} />
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-end gap-2">
                                            <div className="space-y-1">
                                                <Label className="text-[11px]">Miktar</Label>
                                                <Input type="number" min="0" step="0.01" className="h-8 w-20 text-xs" placeholder="—"
                                                       value={d.miktar ?? ''}
                                                       onChange={(e) => setTaslak((p) => ({ ...p, [t.id]: { ...d, miktar: e.target.value } }))} />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[11px]">Birim</Label>
                                                <Input className="h-8 w-16 text-xs" placeholder="gr"
                                                       value={d.birim ?? ''}
                                                       onChange={(e) => setTaslak((p) => ({ ...p, [t.id]: { ...d, birim: e.target.value } }))} />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[11px]">Kalori</Label>
                                                <Input type="number" min="0" className="h-8 w-20 text-xs" placeholder="—"
                                                       value={d.kalori ?? ''}
                                                       onChange={(e) => setTaslak((p) => ({ ...p, [t.id]: { ...d, kalori: e.target.value } }))} />
                                            </div>
                                            {(d.gorsel ?? t.gorsel) && (
                                                <div className="space-y-1">
                                                    <Label className="text-[11px]">Görsel</Label>
                                                    <div className="flex items-center gap-1.5">
                                                        <img src={proxyImageUrl(d.gorsel ?? t.gorsel)} alt=""
                                                             className="size-8 rounded border object-cover" />
                                                        <Button size="sm" variant="ghost" className="h-8 px-2 text-[11px] text-muted-foreground"
                                                                onClick={() => setTaslak((p) => ({ ...p, [t.id]: { ...d, gorsel: '' } }))}>
                                                            Kaldır
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap items-end gap-2">
                                            <div className="space-y-1">
                                                <Label className="text-[11px]">Kategori</Label>
                                                <select
                                                    value={d.kategoriId ?? t.kategoriId ?? ''}
                                                    onChange={(e) => setTaslak((p) => ({ ...p, [t.id]: { ...d, kategoriId: e.target.value } }))}
                                                    className="h-8 w-44 rounded-md border border-input bg-transparent px-2 text-xs">
                                                    <option value="">Seçiniz</option>
                                                    {kategoriler.map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[11px]">Fiyat (₺)</Label>
                                                <Input type="number" min="0" step="0.01" className="h-8 w-24 text-xs"
                                                       value={d.fiyat ?? t.fiyat ?? ''}
                                                       onChange={(e) => setTaslak((p) => ({ ...p, [t.id]: { ...d, fiyat: e.target.value } }))} />
                                            </div>
                                            {/* Fiyat politikası onaydan ÖNCE görünmeli: merkez buraya
                                                girdiği rakamın bağlayıcı olmadığını bilerek onaylasın. */}
                                            <p className="w-full text-[11px] text-muted-foreground">
                                                Talepten doğan ürünün fiyatını her şube kendi belirleyebilir;
                                                buraya girdiğiniz fiyat varsayılan olur.
                                            </p>
                                            <Button size="sm" className="h-8 text-xs" disabled={islenen === t.id}
                                                    onClick={() => onayla(t, null)}>
                                                {islenen === t.id ? <Spinner className="size-3.5 mr-1.5" /> : <Check className="size-3.5 mr-1.5" />}
                                                Yeni ürün olarak aç
                                            </Button>
                                            <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive"
                                                    disabled={islenen === t.id} onClick={() => reddet(t)}>
                                                <X className="size-3.5 mr-1.5" /> Reddet
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {t.durum !== 'bekliyor' && t.not && (
                                    <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                                        Merkez notu: {t.not}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
