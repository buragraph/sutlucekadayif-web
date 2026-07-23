import React, { useState, useEffect } from 'react';
import { StickyNote, Loader2, Check } from 'lucide-react';
import { reportsApi } from '../hooks/useReports';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const LIMIT = 5000; // backend ile aynı (db.js NOT_LIMIT)

function zamanTR(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

/**
 * Şube notu — yalnızca yönetici. Şube dokümanından ayrı bir uçtan gelir
 * (şube sahibine sızmaması için; bkz. backend modules/reports/db.js).
 * Bu bileşen yalnızca admin için render edilmeli (BranchDetail'de gate var).
 */
export function SubeNotu({ kod }) {
    const [not, setNot] = useState('');
    const [kayitli, setKayitli] = useState('');       // sunucudaki son hâli
    const [meta, setMeta] = useState(null);           // { guncelleyen, guncellemeZamani }
    const [yukleniyor, setYukleniyor] = useState(true);
    const [kaydediyor, setKaydediyor] = useState(false);

    // BranchDetail bu bileşeni key={kod} ile kuruyor: şube değişince yeniden
    // monte olur, dolayısıyla state'i burada elle sıfırlamaya gerek yok.
    // Geriye tek yarış kalıyor — geç dönen istek, bileşen kaldırıldıktan sonra
    // yazmasın diye iptal bayrağı.
    useEffect(() => {
        let iptal = false;

        reportsApi.getSubeNot(kod)
            .then((d) => {
                if (iptal) return;
                setNot(d.not || '');
                setKayitli(d.not || '');
                setMeta(d.guncellemeZamani ? d : null);
            })
            .catch(() => {
                if (!iptal) toast.error('Şube notu okunamadı');
            })
            .finally(() => {
                if (!iptal) setYukleniyor(false);
            });

        return () => { iptal = true; };
    }, [kod]);

    const degisti = not !== kayitli;

    async function kaydet() {
        setKaydediyor(true);
        try {
            const d = await reportsApi.saveSubeNot(kod, not);
            setKayitli(d.not || '');
            setMeta(d.guncellemeZamani ? d : null);
            toast.success('Not kaydedildi');
        } catch (e) {
            toast.error(e.message || 'Not kaydedilemedi');
        }
        setKaydediyor(false);
    }

    return (
        <div className="p-4 rounded-lg border bg-card mb-6">
            <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <StickyNote className="w-4 h-4 text-muted-foreground" />
                    <span className="text-[13px] font-medium text-foreground">Şube Notu</span>
                    <span className="text-[11px] text-muted-foreground">· yalnızca yöneticiler görür</span>
                </div>
                {degisti && !yukleniyor && (
                    <Button size="sm" onClick={kaydet} disabled={kaydediyor}>
                        {kaydediyor
                            ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Kaydediliyor</>
                            : <><Check className="w-3.5 h-3.5 mr-1.5" /> Kaydet</>}
                    </Button>
                )}
            </div>

            {yukleniyor ? (
                <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor...
                </div>
            ) : (
                <>
                    <Textarea
                        rows={3}
                        value={not}
                        maxLength={LIMIT}
                        onChange={(e) => setNot(e.target.value)}
                        placeholder="Bu şubeyle ilgili notlarınız — sahibiyle görüşmeler, kampanya kararları, dikkat edilecekler..."
                        className="resize-y"
                    />
                    <div className="flex items-center justify-between gap-3 mt-2">
                        <span className="text-[11px] text-muted-foreground">
                            {meta?.guncellemeZamani
                                ? `Son güncelleme: ${zamanTR(meta.guncellemeZamani)}${meta.guncelleyen ? ` · ${meta.guncelleyen}` : ''}`
                                : 'Henüz not eklenmemiş'}
                        </span>
                        {not.length > LIMIT * 0.9 && (
                            <span className="text-[11px] text-muted-foreground">{not.length}/{LIMIT}</span>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
