import { useState, useEffect } from 'react';
import { CheckCircle2, TriangleAlert, Loader2, ChevronDown } from 'lucide-react';
import api from '../../../services/api';

/**
 * Gece çekiminin son turu — tek satır.
 *
 * NEDEN VAR: çekim hataları yalnızca Worker loglarına düşüyordu ve kimse
 * oraya bakmıyor; 90 şubenin 14'ünün aylarca çekilmemesi böyle görünmez
 * kalmıştı. Üstelik bir dönem yalnızca bitişinden sonraki 7 gece kuyruğa
 * giriyor — o pencere sessizce hatalı geçerse o ayın verisi kalıcı olarak
 * eksik kalıyor.
 *
 * Uç admin'e özel; şube sahibinde 403 döner ve bileşen hiçbir şey çizmez.
 */
const zamanYaz = (iso) => {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('tr-TR', {
            day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
        });
    } catch { return iso; }
};

export default function CekimDurumu() {
    const [durum, setDurum] = useState(null);
    const [acik, setAcik] = useState(false);

    useEffect(() => {
        let iptal = false;
        api.get('/reports/cekim-durumu')
            .then(({ data }) => { if (!iptal) setDurum(data); })
            .catch(() => {});   // yetkisiz ya da erişilemez: satır hiç çıkmaz
        return () => { iptal = true; };
    }, []);

    if (!durum) return null;
    const ozet = durum.suruyor ? durum.surenOzet : durum.sonCekim;
    if (!ozet) return null;

    const hatalar = ozet.hatalar || [];
    const eksik = Math.max(0, (ozet.hedef || 0) - (ozet.islenen || 0));
    // "Sorunlu" = hata var YA DA hedeflenen şubelerin hepsi işlenmemiş.
    const sorunlu = !durum.suruyor && (hatalar.length > 0 || eksik > 0);

    const Ikon = durum.suruyor ? Loader2 : sorunlu ? TriangleAlert : CheckCircle2;

    return (
        <div className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${
            durum.suruyor ? 'bg-muted/40'
                : sorunlu ? 'border-destructive/30 bg-destructive/5'
                    : 'bg-muted/30'
        }`}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-2 font-medium">
                    <Ikon className={`size-4 ${
                        durum.suruyor ? 'animate-spin text-muted-foreground'
                            : sorunlu ? 'text-destructive' : 'text-emerald-600'
                    }`} />
                    {durum.suruyor ? 'Otomatik çekim sürüyor' : 'Son otomatik çekim'}
                </span>

                <span className="text-muted-foreground">
                    {zamanYaz(durum.suruyor ? ozet.baslangic : (ozet.bitis || ozet.baslangic))}
                </span>

                <span className="tabular-nums">
                    <strong>{ozet.islenen || 0}</strong>
                    <span className="text-muted-foreground">/{ozet.hedef || 0} şube</span>
                </span>

                {/* Meta ve Google ayrı sayılıyor: biri sıfırsa sorun o kanalda. */}
                <span className="text-muted-foreground tabular-nums">
                    Meta {ozet.meta || 0} · Google {ozet.google || 0}
                </span>

                {durum.suruyor && (
                    <span className="text-muted-foreground tabular-nums">kalan {durum.kalan}</span>
                )}

                {!durum.suruyor && (
                    hatalar.length > 0 || eksik > 0 ? (
                        <button type="button" onClick={() => setAcik((v) => !v)}
                            className="inline-flex items-center gap-1 font-medium text-destructive hover:underline">
                            {hatalar.length > 0 && `${hatalar.length} hata`}
                            {hatalar.length > 0 && eksik > 0 && ' · '}
                            {eksik > 0 && `${eksik} şube işlenmedi`}
                            <ChevronDown className={`size-3.5 transition-transform ${acik ? 'rotate-180' : ''}`} />
                        </button>
                    ) : (
                        <span className="text-emerald-700 dark:text-emerald-400">hata yok</span>
                    )
                )}
            </div>

            {acik && hatalar.length > 0 && (
                <ul className="mt-2 space-y-0.5 border-t pt-2 text-xs text-muted-foreground">
                    {hatalar.map((h, i) => <li key={i} className="break-words">{h}</li>)}
                </ul>
            )}
        </div>
    );
}
