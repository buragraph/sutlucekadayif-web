import { useState, useEffect, useRef } from 'react';
import { X, Check, Copy } from 'lucide-react';
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

// Sunucudaki sınırla aynı (routes/geribildirim.js LIMITLER.mesaj)
const MESAJ_SINIR = 3000;

const BOS = {
    kategori: '', mesaj: '', olayTarihi: '',
    ad: '', soyad: '', telefon: '', email: '', kvkkOnay: false, website: '',
};

const gecerliEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
// Türkiye numarası: boşluk/parantez/tire serbest, 10-11 hane bekleniyor.
const gecerliTelefon = (v) => /^[0-9]{10,11}$/.test(v.replace(/[\s()+-]/g, ''));

/**
 * QR menüsündeki "İletişim" formu — şikayet & geri bildirim.
 * Şube bilgisi menüden gelir (müşteri seçmez), kayıt CMS'e düşer.
 *
 * DOĞRULAMA TOPLU VE ALAN BAZLI: önceki sürüm ilk eksik alanda durup tek
 * satırlık bir hata basıyordu; müşteri bir alanı düzeltip gönderiyor, bu kez
 * başka hata alıyordu. Artık eksiklerin hepsi bir kerede, ilgili alanın
 * altında gösteriliyor ve ilk hatalı alana odaklanılıyor.
 */
export default function GeriBildirimModal({ subeSlug, subeAd, onClose }) {
    const [form, setForm] = useState(BOS);
    const [gonderiliyor, setGonderiliyor] = useState(false);
    const [hatalar, setHatalar] = useState({});      // { alan: mesaj }
    const [sunucuHatasi, setSunucuHatasi] = useState('');
    const [takipNo, setTakipNo] = useState(null);    // dolu ise gönderim başarılı
    const [kopyalandi, setKopyalandi] = useState(false);
    const formRef = useRef(null);

    // ESC ile kapat + arka planı kilitle
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    }, [onClose]);

    // Kullanıcı bir alana dokununca O ALANIN hatası kaybolsun; diğerleri kalsın
    // ki neyi düzeltmesi gerektiğini görmeye devam etsin.
    const set = (k, v) => {
        setForm((f) => ({ ...f, [k]: v }));
        setHatalar((h) => (h[k] ? { ...h, [k]: undefined } : h));
        setSunucuHatasi('');
    };

    function dogrula() {
        const h = {};
        if (!form.kategori) h.kategori = 'Lütfen bir konu seçin.';
        if (!form.mesaj.trim()) h.mesaj = 'Lütfen yaşadığınız durumu anlatın.';
        if (!form.ad.trim()) h.ad = 'İsim gerekli.';
        if (!form.soyad.trim()) h.soyad = 'Soyisim gerekli.';
        if (!form.telefon.trim()) h.telefon = 'Telefon gerekli.';
        else if (!gecerliTelefon(form.telefon)) h.telefon = 'Telefon numarası 10 haneli olmalı.';
        if (!form.email.trim()) h.email = 'E-posta gerekli.';
        else if (!gecerliEmail(form.email)) h.email = 'Geçerli bir e-posta girin.';
        if (!form.kvkkOnay) h.kvkkOnay = 'Devam etmek için onaylamanız gerekiyor.';
        return h;
    }

    async function gonder(e) {
        e.preventDefault();
        setSunucuHatasi('');

        if (form.website) return;                       // honeypot — bot

        const h = dogrula();
        setHatalar(h);
        if (Object.keys(h).length > 0) {
            // İlk hatalı alana götür: uzun formda hatanın ekran dışında kalması
            // "gönderemiyorum ama neden bilmiyorum" hissi veriyordu.
            const ilk = formRef.current?.querySelector('[aria-invalid="true"]');
            ilk?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            ilk?.focus?.({ preventScroll: true });
            return;
        }

        setGonderiliyor(true);
        try {
            const { data } = await api.post('/geribildirim', { ...form, subeSlug });
            // Kod ekranda kalmalı: e-posta gönderme altyapısı yok, müşterinin
            // şikayetini sonradan sorgulayabilmesinin TEK yolu bu.
            setTakipNo(data?.takipNo || '');
        } catch (err) {
            setSunucuHatasi(err.response?.data?.error || 'Gönderilemedi. Lütfen daha sonra tekrar deneyin.');
        }
        setGonderiliyor(false);
    }

    async function kodKopyala() {
        try {
            await navigator.clipboard.writeText(takipNo);
            setKopyalandi(true);
            setTimeout(() => setKopyalandi(false), 2000);
        } catch {
            // Pano izni yoksa kod zaten ekranda yazıyor; sessiz geçilir.
        }
    }

    // Tekrar eden alan iskeleti — etiket, hata mesajı ve aria bağlantısı tek yerde.
    const Alan = ({ id, etiket, zorunlu, ipucu, children }) => (
        <div className="pm-form__field">
            <label className="pm-form__label" htmlFor={id}>
                {etiket}
                {zorunlu && <span className="pm-form__req" aria-hidden="true">*</span>}
                {ipucu && <span className="pm-form__opt"> {ipucu}</span>}
            </label>
            {children}
            {hatalar[id] && <p className="pm-form__field-error" id={`${id}-hata`}>{hatalar[id]}</p>}
        </div>
    );

    const girdiOzellik = (ad) => ({
        id: ad,
        className: `pm-form__input${hatalar[ad] ? ' pm-form__input--hata' : ''}`,
        value: form[ad],
        onChange: (e) => set(ad, e.target.value),
        'aria-invalid': hatalar[ad] ? 'true' : undefined,
        'aria-describedby': hatalar[ad] ? `${ad}-hata` : undefined,
    });

    return (
        <div className="pm-modal__overlay" onClick={onClose}>
            <div className="pm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Şikayet ve geri bildirim formu">
                <button className="pm-modal__close" onClick={onClose} aria-label="Kapat"><X size={18} /></button>

                <div className="pm-modal__body">
                    {takipNo !== null ? (
                        <div className="pm-form__success">
                            <span className="pm-form__success-icon">✓</span>
                            <h3 className="pm-modal__name">Geri bildiriminiz alındı</h3>
                            <p className="pm-modal__desc">
                                Bizimle paylaştığınız için teşekkür ederiz. Ekibimiz en kısa sürede
                                değerlendirip sizinle iletişime geçecek.
                            </p>
                            {takipNo && (
                                <div className="pm-form__takip">
                                    <span className="pm-form__takip-etiket">Takip kodunuz</span>
                                    <div className="pm-form__takip-satir">
                                        <strong className="pm-form__takip-kod">{takipNo}</strong>
                                        {/* Kod not almanın tek yolu ekrandan okumaktı; kopyala
                                            düğmesi telefonda yanlış hane yazma riskini kaldırıyor. */}
                                        <button type="button" className="pm-form__kopyala" onClick={kodKopyala}>
                                            {kopyalandi ? <><Check size={13} /> Kopyalandı</> : <><Copy size={13} /> Kopyala</>}
                                        </button>
                                    </div>
                                    <p className="pm-form__takip-desc">
                                        Bu kodu not alın. Şikayetinizin durumunu{' '}
                                        <a href={`/sikayet-takip?kod=${takipNo}`} target="_blank" rel="noopener noreferrer">
                                            takip sayfasından
                                        </a>{' '}
                                        sorgulayabilirsiniz.
                                    </p>
                                </div>
                            )}
                            <button type="button" className="pm-form__submit" onClick={onClose}>Kapat</button>
                        </div>
                    ) : (
                        <form onSubmit={gonder} noValidate ref={formRef}>
                            <h3 className="pm-modal__name">Şikayet & Geri Bildirim</h3>
                            <p className="pm-form__sube">{subeAd || subeSlug} şubesi</p>
                            <p className="pm-form__intro">
                                Mesajınız merkez ekibine ve şube yöneticisine iletilir.
                                Gönderim sonunda size bir takip kodu veririz.
                            </p>

                            <div className="pm-form__field">
                                <span className="pm-form__label">
                                    Konu<span className="pm-form__req" aria-hidden="true">*</span>
                                </span>
                                <div className="pm-form__chips" role="group" aria-label="Konu">
                                    {KATEGORILER.map((k) => {
                                        const secili = form.kategori === k.id;
                                        return (
                                            <button
                                                key={k.id}
                                                type="button"
                                                aria-pressed={secili}
                                                className={`pm-form__chip${secili ? ' pm-form__chip--active' : ''}`}
                                                onClick={() => set('kategori', k.id)}
                                            >
                                                {secili && <Check size={13} className="pm-form__chip-tik" />}
                                                {k.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {hatalar.kategori && <p className="pm-form__field-error">{hatalar.kategori}</p>}
                            </div>

                            <Alan id="mesaj" etiket="Yaşadığınız durumu kısaca anlatabilir misiniz?" zorunlu>
                                <textarea
                                    {...girdiOzellik('mesaj')}
                                    rows={4}
                                    maxLength={MESAJ_SINIR}
                                    placeholder="Ne zaman, nerede ve ne yaşadığınızı yazarsanız daha hızlı çözebiliriz."
                                />
                                {/* Sayaç yalnızca sınıra yaklaşınca: boş formda 0/3000 yazmak
                                    "uzun yazmam mı gerekiyor" hissi veriyor. */}
                                {form.mesaj.length > MESAJ_SINIR * 0.8 && (
                                    <p className="pm-form__sayac">{form.mesaj.length} / {MESAJ_SINIR}</p>
                                )}
                            </Alan>

                            <Alan id="olayTarihi" etiket="Bu durumu ne zaman yaşadınız?" ipucu="(opsiyonel)">
                                <input
                                    {...girdiOzellik('olayTarihi')}
                                    type="date"
                                    max={new Date().toISOString().slice(0, 10)}
                                />
                            </Alan>

                            <div className="pm-form__bolum">
                                <span className="pm-form__bolum-baslik">Size nasıl ulaşalım?</span>
                            </div>

                            <div className="pm-form__row">
                                <Alan id="ad" etiket="İsim" zorunlu>
                                    <input {...girdiOzellik('ad')} autoComplete="given-name" autoCapitalize="words" />
                                </Alan>
                                <Alan id="soyad" etiket="Soyisim" zorunlu>
                                    <input {...girdiOzellik('soyad')} autoComplete="family-name" autoCapitalize="words" />
                                </Alan>
                            </div>

                            <div className="pm-form__row">
                                <Alan id="telefon" etiket="Telefon" zorunlu>
                                    {/* inputMode: telefonda harf klavyesi yerine tuş takımı açılır */}
                                    <input {...girdiOzellik('telefon')} type="tel" inputMode="tel"
                                        autoComplete="tel" placeholder="05XX XXX XX XX" />
                                </Alan>
                                <Alan id="email" etiket="E-posta" zorunlu>
                                    <input {...girdiOzellik('email')} type="email" inputMode="email"
                                        autoComplete="email" autoCapitalize="off" spellCheck="false" />
                                </Alan>
                            </div>

                            {/* honeypot — ekranda görünmez, botlar doldurur */}
                            <input
                                type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
                                className="pm-form__hp" value={form.website} onChange={(e) => set('website', e.target.value)}
                            />

                            <label className={`pm-form__consent${hatalar.kvkkOnay ? ' pm-form__consent--hata' : ''}`}>
                                <input type="checkbox" checked={form.kvkkOnay}
                                    aria-invalid={hatalar.kvkkOnay ? 'true' : undefined}
                                    onChange={(e) => set('kvkkOnay', e.target.checked)} />
                                <span>
                                    <a href={AYDINLATMA_URL} target="_blank" rel="noopener noreferrer">Aydınlatma Metni</a>'ni
                                    okudum, kişisel verilerimin işlenmesine ilişkin bilgilendirildim.
                                </span>
                            </label>
                            {hatalar.kvkkOnay && <p className="pm-form__field-error">{hatalar.kvkkOnay}</p>}

                            {sunucuHatasi && <p className="pm-form__error">{sunucuHatasi}</p>}

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
