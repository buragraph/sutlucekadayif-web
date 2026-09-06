import { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';

/**
 * QR menüsündeki "Alerjen Bilgileri" paneli — geri bildirim/iş başvurusu
 * formlarıyla aynı alttan açılan modal deseni.
 *
 * PDF <iframe> ile gömülür. Mobil tarayıcıların bir kısmı (özellikle iOS
 * Safari'nin eski sürümleri) gömülü PDF'i çizmez; o yüzden altta HER ZAMAN
 * "yeni sekmede aç" bağlantısı durur — boş bir çerçeveyle baş başa kalınmasın.
 */
export default function AlerjenModal({ url, onClose }) {
    // ESC ile kapat + arka planı kilitle (diğer modallarla birebir aynı)
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    }, [onClose]);

    return (
        <div className="pm-modal__overlay" onClick={onClose}>
            <div
                className="pm-modal pm-modal--pdf"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Alerjen bilgileri"
            >
                <button className="pm-modal__close" onClick={onClose} aria-label="Kapat"><X size={18} /></button>

                <div className="pm-alerjen-panel">
                    <h3 className="pm-modal__name">Alerjen Bilgileri</h3>
                    <iframe className="pm-alerjen-frame" src={url} title="Alerjen bilgileri" />
                    <a
                        className="pm-alerjen-panel__link"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <ExternalLink size={14} /> PDF açılmadıysa buradan görüntüleyin
                    </a>
                </div>
            </div>
        </div>
    );
}
