import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '../../../services/api';

// Backend'deki KATEGORILER ile birebir aynı anahtarlar (routes/geribildirim.js)
const KATEGORILER = [
    { id: 'urun_kalitesi', label: 'Ürün kalitesi' },
    { id: 'servis', label: 'Servis / ilgi' },
    { id: 'temizlik', label: 'Temizlik / hijyen' },
    { id: 'fiyat', label: 'Fiyat / ödeme' },
    { id: 'diger', label: 'Diğer' },
];

// KVKK aydınlatma metninin adresi. NOT: yeni sitedeki gizlilik sayfası hâlâ
// yer tutucu; metin hazırlanınca bu bağlantı güncel sayfaya yönlendirilmeli.
const AYDINLATMA_URL = 'https://sutlucekadayif.com/gizlilik-politikasi/';

const BOS = {
    kategori: '', mesaj: '', olayTarihi: '',
    ad: '', soyad: '', telefon: '', email: '', kvkkOnay: false, website: '',
};

/**
 * QR menüsündeki "İletişim" formu — şikayet & geri bildirim.
 * Şube bilgisi menüden gelir (müşteri seçmez), kayıt CMS'e düşer.
 */
export default function GeriBildirimModal({ subeSlug, subeAd, onClose }) {
    const [form, setForm] = useState(BOS);
    const [gonderiliyor, setGonderiliyor] = useState(false);
    const [hata, setHata] = useState('');
    const [basarili, setBasarili] = useState(false);

    // ESC ile kapat + arka planı kilitle
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    }, [onClose]);

    // Kullanıcı bir alana dokununca eski hata mesajı kaybolsun
    const set = (k, v) => {
        setForm((f) => ({ ...f, [k]: v }));
        setHata('');
    };

    async function gonder(e) {
        e.preventDefault();
        setHata('');

        if (form.website) return;                       // honeypot — bot
        if (!form.kategori) return setHata('Lütfen bir konu seçin.');
        if (!form.mesaj.trim()) return setHata('Lütfen yaşadığınız durumu anlatın.');
        for (const [k, ad] of [['ad', 'İsim'], ['soyad', 'Soyisim'], ['telefon', 'Telefon'], ['email', 'E-posta']]) {
            if (!form[k].trim()) return setHata(`${ad} alanı zorunludur.`);
        }
        if (!form.kvkkOnay) return setHata('Devam etmek için aydınlatma metnini onaylamanız gerekir.');

        setGonderiliyor(true);
        try {
            await api.post('/geribildirim', { ...form, subeSlug });
            setBasarili(true);
        } catch (err) {
            setHata(err.response?.data?.error || 'Gönderilemedi. Lütfen daha sonra tekrar deneyin.');
        }
        setGonderiliyor(false);
    }

    return (
        <div className="pm-modal__overlay" onClick={onClose}>
            <div className="pm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Şikayet ve geri bildirim formu">
                <button className="pm-modal__close" onClick={onClose} aria-label="Kapat"><X size={18} /></button>

                <div className="pm-modal__body">
                    {basarili ? (
                        <div className="pm-form__success">
                            <span className="pm-form__success-icon">✓</span>
                            <h3 className="pm-modal__name">Geri bildiriminiz alındı</h3>
                            <p className="pm-modal__desc">
                                Bizimle paylaştığınız için teşekkür ederiz. Ekibimiz en kısa sürede
                                değerlendirip sizinle iletişime geçecek.
                            </p>
                            <button type="button" className="pm-form__submit" onClick={onClose}>Kapat</button>
                        </div>
                    ) : (
                        <form onSubmit={gonder} noValidate>
                            <h3 className="pm-modal__name">Şikayet & Geri Bildirim</h3>
                            <p className="pm-form__sube">{subeAd || subeSlug} şubesi</p>

                            <label className="pm-form__label">Konu</label>
                            <div className="pm-form__chips">
                                {KATEGORILER.map((k) => (
                                    <button
                                        key={k.id}
                                        type="button"
                                        className={`pm-form__chip${form.kategori === k.id ? ' pm-form__chip--active' : ''}`}
                                        onClick={() => set('kategori', k.id)}
                                    >
                                        {k.label}
                                    </button>
                                ))}
                            </div>

                            <label className="pm-form__label" htmlFor="gb-mesaj">Yaşadığınız durumu kısaca anlatabilir misiniz?</label>
                            <textarea
                                id="gb-mesaj" rows={4} className="pm-form__input"
                                value={form.mesaj} onChange={(e) => set('mesaj', e.target.value)}
                            />

                            <label className="pm-form__label" htmlFor="gb-tarih">Bu durumu ne zaman yaşadınız? <span className="pm-form__opt">(opsiyonel)</span></label>
                            <input
                                id="gb-tarih" type="date" className="pm-form__input"
                                value={form.olayTarihi} onChange={(e) => set('olayTarihi', e.target.value)}
                            />

                            <div className="pm-form__row">
                                <div>
                                    <label className="pm-form__label" htmlFor="gb-ad">İsim</label>
                                    <input id="gb-ad" className="pm-form__input" value={form.ad} onChange={(e) => set('ad', e.target.value)} />
                                </div>
                                <div>
                                    <label className="pm-form__label" htmlFor="gb-soyad">Soyisim</label>
                                    <input id="gb-soyad" className="pm-form__input" value={form.soyad} onChange={(e) => set('soyad', e.target.value)} />
                                </div>
                            </div>

                            <div className="pm-form__row">
                                <div>
                                    <label className="pm-form__label" htmlFor="gb-tel">Telefon</label>
                                    <input id="gb-tel" type="tel" className="pm-form__input" value={form.telefon} onChange={(e) => set('telefon', e.target.value)} />
                                </div>
                                <div>
                                    <label className="pm-form__label" htmlFor="gb-email">E-posta</label>
                                    <input id="gb-email" type="email" className="pm-form__input" value={form.email} onChange={(e) => set('email', e.target.value)} />
                                </div>
                            </div>

                            {/* honeypot — ekranda görünmez, botlar doldurur */}
                            <input
                                type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
                                className="pm-form__hp" value={form.website} onChange={(e) => set('website', e.target.value)}
                            />

                            <label className="pm-form__consent">
                                <input type="checkbox" checked={form.kvkkOnay} onChange={(e) => set('kvkkOnay', e.target.checked)} />
                                <span>
                                    <a href={AYDINLATMA_URL} target="_blank" rel="noopener noreferrer">Aydınlatma Metni</a>'ni
                                    okudum, kişisel verilerimin işlenmesine ilişkin bilgilendirildim.
                                </span>
                            </label>

                            {hata && <p className="pm-form__error">{hata}</p>}

                            <button type="submit" className="pm-form__submit" disabled={gonderiliyor}>
                                {gonderiliyor ? 'Gönderiliyor...' : 'Gönder'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
