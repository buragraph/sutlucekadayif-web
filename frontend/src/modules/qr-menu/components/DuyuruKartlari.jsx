import { useState, useEffect } from 'react';
import { Megaphone, TriangleAlert, Info, ChevronDown } from 'lucide-react';
import api from '../../../services/api';

/**
 * Dashboard'daki merkez duyuruları.
 *
 * Süzme SUNUCUDA (bkz. routes/duyurular.js `/aktif`): yayından kalkmış,
 * süresi geçmiş ya da başka şubeye hedeflenmiş duyuru buraya hiç gelmiyor.
 * Burada yalnızca gösterim var.
 *
 * Hiç duyuru yoksa bileşen HİÇBİR ŞEY çizmez — boş bir "duyuru yok" kartı
 * dashboard'da yer kaplardı ve şube her gün onu görürdü.
 */
const STIL = {
    onemli: {
        kart: 'border-destructive/30 bg-destructive/5',
        ikon: 'text-destructive',
        Ikon: TriangleAlert,
        etiket: 'Önemli',
    },
    uyari: {
        kart: 'border-amber-500/40 bg-amber-500/5',
        ikon: 'text-amber-600 dark:text-amber-500',
        Ikon: TriangleAlert,
        etiket: 'Uyarı',
    },
    bilgi: {
        kart: 'border-border bg-card',
        ikon: 'text-[#084529] dark:text-[#d8c7a3]',
        Ikon: Info,
        etiket: 'Bilgi',
    },
};

const tarihYaz = (d) => {
    try {
        return new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return ''; }
};

export default function DuyuruKartlari() {
    const [duyurular, setDuyurular] = useState([]);
    const [acik, setAcik] = useState({});

    useEffect(() => {
        let iptal = false;
        api.get('/duyurular/aktif')
            .then(({ data }) => { if (!iptal) setDuyurular(data.duyurular || []); })
            // Duyuru ikincil içerik: yüklenemezse dashboard'a hata basmıyoruz.
            .catch(() => {});
        return () => { iptal = true; };
    }, []);

    if (duyurular.length === 0) return null;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <Megaphone className="size-4 text-muted-foreground" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Merkezden Duyurular
                </h2>
            </div>

            {duyurular.map((d) => {
                const s = STIL[d.onem] || STIL.bilgi;
                // Uzun metin katlanır: üç duyuru varken dashboard'ı aşağı itmesin.
                const uzun = (d.icerik || '').length > 260;
                const genis = acik[d.id];
                return (
                    <div key={d.id} className={`rounded-2xl border p-4 ${s.kart}`}>
                        <div className="flex items-start gap-3">
                            <s.Ikon className={`mt-0.5 size-4 shrink-0 ${s.ikon}`} />
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                    <h3 className="font-medium text-foreground">{d.baslik}</h3>
                                    <span className="text-xs text-muted-foreground">
                                        {tarihYaz(d.baslangic || d.olusturma)}
                                    </span>
                                </div>
                                {d.icerik && (
                                    <p className={`mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground ${uzun && !genis ? 'line-clamp-3' : ''}`}>
                                        {d.icerik}
                                    </p>
                                )}
                                {uzun && (
                                    <button
                                        type="button"
                                        onClick={() => setAcik((p) => ({ ...p, [d.id]: !p[d.id] }))}
                                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
                                    >
                                        {genis ? 'Daha az' : 'Devamını oku'}
                                        <ChevronDown className={`size-3 transition-transform ${genis ? 'rotate-180' : ''}`} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
