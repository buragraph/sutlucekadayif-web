import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquareWarning, Clock, ChevronRight } from 'lucide-react';
import api from '../../../services/api';

/**
 * Dashboard'daki şikayet uyarısı.
 *
 * NEDEN VAR: şikayet masası sessizdi — kayıt düşüyordu ama kimse haberdar
 * olmuyordu; şube her gün "Şikayet & Geri Bildirim" sayfasını açmayı akıl
 * etmeliydi. E-posta gönderme altyapımız yok, o yüzden bildirim panelin
 * kendisinde: giriş yapınca ilk görülen yerde.
 *
 * DUYURU KARTLARIYLA AYNI KURAL: bekleyen şikayet yoksa bileşen HİÇBİR ŞEY
 * çizmez. "0 şikayetiniz var" kartı her gün yer kaplardı.
 */
const GECIKME_GUN = 3;                       // GeriBildirimPage ile aynı eşik
const ACIK_DURUMLAR = ['yeni', 'inceleniyor'];

export default function SikayetUyarisi() {
    const [ozet, setOzet] = useState(null);

    useEffect(() => {
        let iptal = false;
        api.get('/geribildirim')
            .then(({ data }) => {
                if (iptal) return;
                const liste = data.bildirimler || [];
                const acik = liste.filter((b) => ACIK_DURUMLAR.includes(b.durum));
                setOzet({
                    yeni: acik.filter((b) => b.durum === 'yeni').length,
                    acik: acik.length,
                    geciken: acik.filter((b) =>
                        (Date.now() - new Date(b.olusturmaZamani)) / 86400000 >= GECIKME_GUN).length,
                });
            })
            // İkincil içerik: yüklenemezse dashboard'a hata basmıyoruz.
            .catch(() => {});
        return () => { iptal = true; };
    }, []);

    if (!ozet || ozet.acik === 0) return null;

    const acil = ozet.geciken > 0;

    return (
        <Link
            to="/admin/geri-bildirim"
            className={`flex items-center gap-3 rounded-2xl border p-4 transition-colors ${
                acil
                    ? 'border-destructive/40 bg-destructive/5 hover:bg-destructive/10'
                    : 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10'
            }`}
        >
            <MessageSquareWarning className={`size-5 shrink-0 ${acil ? 'text-destructive' : 'text-amber-600 dark:text-amber-500'}`} />
            <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-foreground">
                    {ozet.yeni > 0
                        ? `${ozet.yeni} yeni şikayet bekliyor`
                        : `${ozet.acik} şikayet açık`}
                </p>
                {acil && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
                        <Clock className="size-3" />
                        {ozet.geciken} tanesi {GECIKME_GUN} günden uzun süredir yanıtsız
                    </p>
                )}
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
    );
}
