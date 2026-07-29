import { useEffect, useRef } from 'react';

/**
 * Yatay kaydırılan çip rayı (kategori sekmeleri).
 *
 * Üç şey yapar:
 *  1. Kaydırma çubuğunu inceltir (kaldırmaz) ve kenara yumuşak bir solma
 *     bindirir, böylece ray "bıçakla kesilmiş" gibi durmaz.
 *  2. Solmayı YALNIZCA o yönde gizli içerik varsa açar (`data-sol`/`data-sag`).
 *  3. Dikey tekerlek hareketini yatay kaydırmaya çevirir — tek satırlık rayda
 *     fare tekerleği başka türlü işe yaramıyor.
 *
 * İki katman var: solma degradesi SARMALAYICIYA bindirilir, kaydırma İÇTEKİ
 * katmanda olur. Tek katman olsaydı solmayı maskeyle yapmak gerekirdi ve maske
 * kaydırma çubuğunun ucunu da soluklaştırırdı.
 *
 * Kenar durumu React state'i yerine doğrudan `dataset` üzerinden yazılır:
 * her kaydırma karesinde yeniden render etmenin anlamı yok, değişen tek şey
 * bir degradenin opaklığı. Görsel kurallar index.css `.ray-sarmal`/`.ray-kaydir`.
 */
export function KaydirilirRay({ children, className = '' }) {
    const sarmalRef = useRef(null);
    const kaydirRef = useRef(null);

    useEffect(() => {
        const el = kaydirRef.current;
        const sarmal = sarmalRef.current;
        if (!el || !sarmal) return;

        const guncelle = () => {
            const kalanSag = el.scrollWidth - el.clientWidth - el.scrollLeft;
            sarmal.dataset.sol = el.scrollLeft > 1 ? '1' : '0';
            sarmal.dataset.sag = kalanSag > 1 ? '1' : '0';
        };

        // Dikey tekerlek → yatay kaydırma. preventDefault YALNIZCA o yönde
        // gidecek yer varken çağrılır; yoksa sayfanın kendi kaydırması çalınmış olur.
        const tekerlek = (e) => {
            if (e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
            const kalanSag = el.scrollWidth - el.clientWidth - el.scrollLeft;
            if ((e.deltaY > 0 && kalanSag < 1) || (e.deltaY < 0 && el.scrollLeft < 1)) return;
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        };

        guncelle();
        el.addEventListener('scroll', guncelle, { passive: true });
        el.addEventListener('wheel', tekerlek, { passive: false });

        // Çip sayısı/genişliği değişince (kategori listesi güncellenince,
        // pencere yeniden boyutlanınca) kenar durumu yeniden ölçülmeli.
        const ro = new ResizeObserver(guncelle);
        ro.observe(el);
        if (el.firstElementChild) ro.observe(el.firstElementChild);

        return () => {
            el.removeEventListener('scroll', guncelle);
            el.removeEventListener('wheel', tekerlek);
            ro.disconnect();
        };
    }, []);

    return (
        <div ref={sarmalRef} className={`ray-sarmal ${className}`} data-sol="0" data-sag="0">
            <div ref={kaydirRef} className="ray-kaydir">
                {children}
            </div>
        </div>
    );
}

export default KaydirilirRay;
