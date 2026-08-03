import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '../../../services/api';

// Backend'deki sabitlerle birebir aynı anahtarlar (routes/isbasvuru.js)
const CALISMA_TIPLERI = [
    { id: 'tam_zamanli', label: 'Tam Zamanlı' },
    { id: 'yari_zamanli', label: 'Yarı Zamanlı' },
    { id: 'donemsel', label: 'Dönemsel' },
];

const BECERILER = [
    { id: 'kasa', label: 'Kasa kullanımı' },
    { id: 'pos', label: 'POS / ödeme sistemleri' },
    { id: 'servis', label: 'Servis ve müşteri ilişkileri' },
    { id: 'tezgahtarlik', label: 'Tezgahtarlık' },
    { id: 'paketleme', label: 'Paketleme / ürün hazırlama' },
    { id: 'hijyen', label: 'Hijyen kurallarına hâkimim' },
    { id: 'ekip', label: 'Ekip çalışmasına uyumlu' },
    { id: 'yogun_tempo', label: 'Yoğun tempoya alışığım' },
];

// KVKK aydınlatma metni. NOT: ana siteye metin eklenince bu adres güncellenecek.
const AYDINLATMA_URL = 'https://sutlucekadayif.com/gizlilik-politikasi/';

const BOS = {
    ad: '', soyad: '', dogumTarihi: '', telefon: '', email: '',
    calismaTipi: '', musaitlik: '', beceriler: [],
    gidaDeneyimi: '', gidaDeneyimiDetay: '', markaDeneyimi: '',
    halenCalisiyor: '', baslangicTarihi: '', referans: '',
    kvkkOnay: false, website: '',
};

/**
 * QR menüsünün altındaki "İş Başvurusu Yap" formu.
 * Şube menüden gelir; başvuru hem ilgili şubeye hem merkeze düşer.
 */
export default function IsBasvuruModal({ subeSlug, subeAd, onClose }) {
    const [form, setForm] = useState(BOS);
    const [gonderiliyor, setGonderiliyor] = useState(false);
    const [hata, setHata] = useState('');
    const [basarili, setBasarili] = useState(false);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    }, [onClose]);

    // Alana dokununca eski hata mesajı kaybolsun
    const set = (k, v) => {
        setForm((f) => ({ ...f, [k]: v }));
        setHata('');
    };

    const beceriToggle = (id) => {
        setHata('');
        setForm((f) => ({
            ...f,
            beceriler: f.beceriler.includes(id)
                ? f.beceriler.filter((b) => b !== id)
                : [...f.beceriler, id],
        }));
    };

    async function gonder(e) {
        e.preventDefault();
        setHata('');

        if (form.website) return; // honeypot
        for (const [k, ad] of [
            ['ad', 'İsim'], ['soyad', 'Soyisim'], ['dogumTarihi', 'Doğum tarihi'],
            ['telefon', 'Telefon'], ['email', 'E-posta'],
        ]) {
            if (!form[k].trim()) return setHata(`${ad} alanı zorunludur.`);
        }
        if (!form.calismaTipi) return setHata('Lütfen çalışma tipini seçin.');
        if (!form.musaitlik.trim()) return setHata('Çalışabileceğiniz gün ve saatleri yazın.');
        if (form.beceriler.length === 0) return setHata('Lütfen en az bir beceri seçin.');
        if (!form.gidaDeneyimi) return setHata('Gıda/tatlı sektörü deneyimi sorusunu yanıtlayın.');
        if (!form.halenCalisiyor) return setHata('Şu an çalışıyor musunuz sorusunu yanıtlayın.');
        if (!form.kvkkOnay) return setHata('Devam etmek için aydınlatma metnini onaylamanız gerekir.');

        setGonderiliyor(true);
        try {
            await api.post('/isbasvuru', { ...form, subeSlug });
            setBasarili(true);
        } catch (err) {
            setHata(err.response?.data?.error || 'Gönderilemedi. Lütfen daha sonra tekrar deneyin.');
        }
        setGonderiliyor(false);
    }

    return (
        <div className="pm-modal__overlay" onClick={onClose}>
            <div className="pm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="İş başvurusu formu">
                <button className="pm-modal__close" onClick={onClose} aria-label="Kapat"><X size={18} /></button>

                <div className="pm-modal__body">
                    {basarili ? (
                        <div className="pm-form__success">
                            <span className="pm-form__success-icon">✓</span>
                            <h3 className="pm-modal__name">Başvurunuz alındı</h3>
                            <p className="pm-modal__desc">
                                İlgilendiğiniz için teşekkür ederiz. Başvurunuz {subeAd || subeSlug} şubemize
                                ve merkeze iletildi; uygun bir pozisyon olduğunda sizinle iletişime geçeceğiz.
                            </p>
                            <button type="button" className="pm-form__submit" onClick={onClose}>Kapat</button>
                        </div>
                    ) : (
                        <form onSubmit={gonder} noValidate>
                            <h3 className="pm-modal__name">İş Başvurusu</h3>
                            <p className="pm-form__sube">{subeAd || subeSlug} şubesi</p>

                            <div className="pm-form__row">
                                <div>
                                    <label className="pm-form__label" htmlFor="ib-ad">İsim</label>
                                    <input id="ib-ad" className="pm-form__input" value={form.ad} onChange={(e) => set('ad', e.target.value)} />
                                </div>
                                <div>
                                    <label className="pm-form__label" htmlFor="ib-soyad">Soyisim</label>
                                    <input id="ib-soyad" className="pm-form__input" value={form.soyad} onChange={(e) => set('soyad', e.target.value)} />
                                </div>
                            </div>

                            <label className="pm-form__label" htmlFor="ib-dogum">Doğum tarihi</label>
                            <input id="ib-dogum" type="date" className="pm-form__input" value={form.dogumTarihi} onChange={(e) => set('dogumTarihi', e.target.value)} />

                            <div className="pm-form__row">
                                <div>
                                    <label className="pm-form__label" htmlFor="ib-tel">Telefon</label>
                                    <input id="ib-tel" type="tel" className="pm-form__input" value={form.telefon} onChange={(e) => set('telefon', e.target.value)} />
                                </div>
                                <div>
                                    <label className="pm-form__label" htmlFor="ib-email">E-posta</label>
                                    <input id="ib-email" type="email" className="pm-form__input" value={form.email} onChange={(e) => set('email', e.target.value)} />
                                </div>
                            </div>

                            <label className="pm-form__label">Çalışma tipi</label>
                            <div className="pm-form__chips">
                                {CALISMA_TIPLERI.map((c) => (
                                    <button
                                        key={c.id} type="button"
                                        className={`pm-form__chip${form.calismaTipi === c.id ? ' pm-form__chip--active' : ''}`}
                                        onClick={() => set('calismaTipi', c.id)}
                                    >
                                        {c.label}
                                    </button>
                                ))}
                            </div>

                            <label className="pm-form__label" htmlFor="ib-musaitlik">Çalışabileceğiniz gün ve saat aralıkları</label>
                            <textarea
                                id="ib-musaitlik" rows={2} className="pm-form__input"
                                placeholder="Örn: Hafta içi 09:00-17:00, Cumartesi tam gün"
                                value={form.musaitlik} onChange={(e) => set('musaitlik', e.target.value)}
                            />

                            <label className="pm-form__label">Sahip olduğunuz deneyim veya beceriler</label>
                            <div className="pm-form__chips">
                                {BECERILER.map((b) => (
                                    <button
                                        key={b.id} type="button"
                                        className={`pm-form__chip${form.beceriler.includes(b.id) ? ' pm-form__chip--active' : ''}`}
                                        onClick={() => beceriToggle(b.id)}
                                    >
                                        {b.label}
                                    </button>
                                ))}
                            </div>

                            <label className="pm-form__label">Daha önce gıda veya tatlı sektöründe çalıştınız mı?</label>
                            <EvetHayir value={form.gidaDeneyimi} onChange={(v) => set('gidaDeneyimi', v)} />

                            {form.gidaDeneyimi === 'evet' && (
                                <>
                                    <label className="pm-form__label" htmlFor="ib-detay">Hangi işletmelerde ve ne kadar süre? <span className="pm-form__opt">(opsiyonel)</span></label>
                                    <textarea id="ib-detay" rows={2} className="pm-form__input" value={form.gidaDeneyimiDetay} onChange={(e) => set('gidaDeneyimiDetay', e.target.value)} />
                                </>
                            )}

                            <label className="pm-form__label" htmlFor="ib-marka">Daha önce Sütlüce Kadayıf veya benzeri bir markada çalıştınız mı? <span className="pm-form__opt">(opsiyonel)</span></label>
                            <textarea id="ib-marka" rows={2} className="pm-form__input" value={form.markaDeneyimi} onChange={(e) => set('markaDeneyimi', e.target.value)} />

                            <label className="pm-form__label">Şu anda bir işte çalışıyor musunuz?</label>
                            <EvetHayir value={form.halenCalisiyor} onChange={(v) => set('halenCalisiyor', v)} />

                            <label className="pm-form__label" htmlFor="ib-baslangic">İşe başlamak için uygun olduğunuz tarih <span className="pm-form__opt">(opsiyonel)</span></label>
                            <input id="ib-baslangic" type="date" className="pm-form__input" value={form.baslangicTarihi} onChange={(e) => set('baslangicTarihi', e.target.value)} />

                            <label className="pm-form__label" htmlFor="ib-referans">Referans verebileceğiniz bir kişi var mı? <span className="pm-form__opt">(opsiyonel)</span></label>
                            <textarea id="ib-referans" rows={2} className="pm-form__input" value={form.referans} onChange={(e) => set('referans', e.target.value)} />

                            {/* honeypot */}
                            <input
                                type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
                                className="pm-form__hp" value={form.website} onChange={(e) => set('website', e.target.value)}
                            />

                            <label className="pm-form__consent">
                                <input type="checkbox" checked={form.kvkkOnay} onChange={(e) => set('kvkkOnay', e.target.checked)} />
                                <span>
                                    Kişisel verilerimin iş başvurusu sürecinde değerlendirilmesi amacıyla
                                    işlenmesini kabul ediyorum. <a href={AYDINLATMA_URL} target="_blank" rel="noopener noreferrer">Aydınlatma Metni</a>
                                </span>
                            </label>

                            {hata && <p className="pm-form__error">{hata}</p>}

                            <button type="submit" className="pm-form__submit" disabled={gonderiliyor}>
                                {gonderiliyor ? 'Gönderiliyor...' : 'Başvuruyu Gönder'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}

function EvetHayir({ value, onChange }) {
    return (
        <div className="pm-form__chips">
            {[['evet', 'Evet'], ['hayir', 'Hayır']].map(([id, label]) => (
                <button
                    key={id} type="button"
                    className={`pm-form__chip${value === id ? ' pm-form__chip--active' : ''}`}
                    onClick={() => onChange(id)}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
