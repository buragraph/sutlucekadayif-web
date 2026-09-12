import { useEffect, useState } from 'react';
import { GraduationCap, CircleCheck, CircleX, FileText, Video, ClipboardList } from 'lucide-react';
import api from '../../../services/api';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

/**
 * Şube sahibinin ÇALIŞANLAR ekranındaki akademi görünümü.
 *
 * NEDEN AKADEMİ'DE DEĞİL: Akademi bölümü kişinin KENDİ eğitimi — kendi
 * derslerini izlediği yer. Şube sahibinin sorusu başka: "işe aldığım kişi
 * eğitimini aldı mı?" Bu soru çalışan listesinde soruluyor, o yüzden cevabı da
 * orada duruyor. Merkezin ağ geneli ekranı (Akademi → Yönetim) ayrı ve şubeye
 * kapalı.
 *
 * VERİ TEK İSTEKTE: şube özeti (`/academy/progress/sube`) bir kez çekilip
 * uid'e göre eşleniyor; satır başına istek atılsaydı 90 çalışanlı bir şubede
 * tablo 90 istek açardı. Ders ders döküm yalnızca pencere açılınca isteniyor.
 */

const TUR_IKON = { video: Video, pdf: FileText, quiz: ClipboardList };

const tarihYaz = (v) => {
    if (!v) return null;
    const t = new Date(v);
    if (Number.isNaN(t.getTime())) return null;
    const gun = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const fark = (gun(new Date()) - gun(t)) / 86400000;
    if (fark === 0) return 'bugün';
    if (fark === 1) return 'dün';
    if (fark < 30) return `${Math.round(fark)} gün önce`;
    return t.toLocaleDateString('tr-TR');
};

/** Tablo hücresi: "12/88 ders" + ince ilerleme çubuğu. */
export function AkademiHucresi({ ozet, onAc }) {
    // Özet henüz gelmediyse (ya da kişi listede yoksa) hücre boş kalsın —
    // "0 ders" yazmak veri yokken yanlış bilgi olurdu.
    if (!ozet) return <span className="text-sm text-muted-foreground">—</span>;

    const { tamamlanan, toplamDers, sonHareket } = ozet;
    const oran = toplamDers > 0 ? Math.min(100, Math.round((tamamlanan / toplamDers) * 100)) : 0;
    const hic = tamamlanan === 0;

    return (
        <button
            type="button"
            onClick={onAc}
            className="group/ak w-full min-w-0 text-left"
            title="Ders ders dökümü için tıklayın"
        >
            <span className="flex items-baseline gap-1.5">
                <span className={`text-sm font-medium tabular-nums ${hic ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {tamamlanan}/{toplamDers}
                </span>
                <span className="text-xs text-muted-foreground">ders</span>
            </span>
            <span className="mt-1 block h-1 w-24 max-w-full overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-[#0f6b3a] transition-all dark:bg-emerald-500"
                      style={{ width: `${oran}%` }} />
            </span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {hic ? 'hiç başlamadı' : `son: ${tarihYaz(sonHareket) || '—'}`}
            </span>
        </button>
    );
}

/** Ders ders döküm + sınav denemeleri. */
export default function CalisanAkademiModal({ kisi, subeSlug, onKapat }) {
    const [yukleniyor, setYukleniyor] = useState(true);
    const [detay, setDetay] = useState([]);
    const [sinavlar, setSinavlar] = useState([]);
    const [hata, setHata] = useState(null);

    useEffect(() => {
        if (!kisi?.uid) return;
        let iptal = false;
        // Efekt gövdesinde setState YOK: pencere kişi başına yeniden kuruluyor
        // (kapanınca unmount), bu yüzden başlangıç durumu zaten "yükleniyor".
        // Senkron setState fazladan bir render turu demek.
        api.get(`/academy/progress/sube/${kisi.uid}/detay`, {
            params: subeSlug ? { subeSlug } : undefined,
        })
            .then(({ data }) => {
                if (iptal) return;
                setDetay(data.detay || []);
                setSinavlar(data.sinavlar || []);
            })
            .catch((err) => {
                if (!iptal) setHata(err.response?.data?.error || 'Döküm alınamadı.');
            })
            .finally(() => { if (!iptal) setYukleniyor(false); });
        return () => { iptal = true; };
    }, [kisi?.uid, subeSlug]);

    // Kalan sınavlar ayrı gösteriliyor: `ilerleme` yalnızca GEÇİLEN dersi
    // tutuyor, kalan deneme orada hiç görünmüyor — oysa kişinin kursta neden
    // takıldığını anlatan tek kayıt o.
    const kalanlar = sinavlar.filter((s) => !s.gecti);

    return (
        <Dialog open onOpenChange={(a) => !a && onKapat()}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <GraduationCap className="size-5" />
                        {kisi?.displayName || kisi?.email}
                    </DialogTitle>
                    <DialogDescription>
                        {kisi?.tamamlanan ?? 0}/{kisi?.toplamDers ?? 0} ders tamamlandı
                        {kisi?.sonHareket ? ` · son hareket ${tarihYaz(kisi.sonHareket)}` : ''}
                    </DialogDescription>
                </DialogHeader>

                {yukleniyor ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                        <Spinner className="size-5" /> Yükleniyor…
                    </div>
                ) : hata ? (
                    <p className="py-8 text-center text-sm text-destructive">{hata}</p>
                ) : (
                    <div className="flex flex-col gap-5">
                        {/* Kurs bazında özet — özetteki sayılar listeden türetilmiyor,
                            sunucudan geldiği gibi duruyor (yayından kalkmış kurs da
                            görünsün diye). */}
                        {(kisi?.kurslar || []).length > 0 && (
                            <div className="flex flex-col gap-2">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Kurslar
                                </h3>
                                {kisi.kurslar.map((k) => (
                                    <div key={k.kursId} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{k.baslik}</span>
                                        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                                            {k.tamamlanan}{k.toplam != null ? `/${k.toplam}` : ''} ders
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {kalanlar.length > 0 && (
                            <div className="flex flex-col gap-2">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Kalınan sınavlar
                                </h3>
                                {kalanlar.map((s, i) => (
                                    <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm text-foreground">{s.ders}</span>
                                            <span className="block truncate text-xs text-muted-foreground">{s.kurs}</span>
                                        </span>
                                        <span className="shrink-0 text-sm font-medium tabular-nums text-destructive">
                                            {s.puan} / baraj {s.baraj}
                                        </span>
                                    </div>
                                ))}
                                <p className="text-xs text-muted-foreground">
                                    Sınav hakkı tek seferdir; yenilenmesi için merkeze başvurun.
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Tamamlanan dersler
                            </h3>
                            {detay.length === 0 ? (
                                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                                    Henüz tamamlanmış ders yok.
                                </p>
                            ) : detay.map((d) => {
                                const Ikon = TUR_IKON[d.tur] || CircleCheck;
                                return (
                                    <div key={`${d.kursId}-${d.dersId}`} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                                        <Ikon className="size-4 shrink-0 text-muted-foreground" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm text-foreground">{d.ders}</span>
                                            <span className="block truncate text-xs text-muted-foreground">{d.kurs}</span>
                                        </span>
                                        {d.puan != null && (
                                            <Badge variant="outline" className="shrink-0 tabular-nums">{d.puan} puan</Badge>
                                        )}
                                        <span className="shrink-0 text-xs text-muted-foreground">{tarihYaz(d.tamamlandi)}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {sinavlar.length > 0 && kalanlar.length === 0 && (
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <CircleCheck className="size-3.5 text-emerald-600" />
                                Girdiği sınavların hepsini geçti.
                            </p>
                        )}
                        {sinavlar.length === 0 && detay.length > 0 && (
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <CircleX className="size-3.5" />
                                Henüz sınava girmedi.
                            </p>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
