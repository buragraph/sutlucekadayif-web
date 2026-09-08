import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../../services/api';

/**
 * Herkese açık şikayet durumu sorgulama.
 *
 * NEDEN VAR: müşteri şikayetini gönderdikten sonra hiçbir şey göremiyordu.
 * E-posta gönderme altyapımız yok, o yüzden dönüş kanalı bu sayfa: formun
 * verdiği takip kodu buraya girilir.
 *
 * KİŞİSEL VERİ GÖSTERMEZ. Uç yalnızca durum, konu, şube ve tarihleri
 * döndürüyor (bkz. GET /geribildirim/durum/:takipNo) — kodu ele geçiren biri
 * ad/telefon/mesaj göremiyor. Sayfa panelin dışında, giriş istemez.
 */
const DURUM = {
    yeni: { ad: 'Alındı', desc: 'Şikayetiniz ekibimize ulaştı, sıraya alındı.' },
    inceleniyor: { ad: 'İnceleniyor', desc: 'Şikayetiniz ilgili şube ve merkez ekibimizce inceleniyor.' },
    cozuldu: { ad: 'Çözüldü', desc: 'Şikayetiniz çözüme kavuşturuldu.' },
    kapatildi: { ad: 'Kapatıldı', desc: 'Şikayet kaydınız kapatıldı.' },
};

const KATEGORI = {
    urun_kalitesi: 'Ürün kalitesi',
    servis: 'Servis / ilgi',
    temizlik: 'Temizlik / hijyen',
    fiyat: 'Fiyat / ödeme',
    diger: 'Diğer',
};

const tarihTR = (iso) => (iso
    ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—');

export default function SikayetTakipPage() {
    const [params, setParams] = useSearchParams();
    const [kod, setKod] = useState(params.get('kod') || '');
    const [sonuc, setSonuc] = useState(null);
    const [hata, setHata] = useState('');
    const [yukleniyor, setYukleniyor] = useState(false);

    const sorgula = useCallback(async (deger) => {
        const temiz = (deger || '').trim().toUpperCase();
        if (!temiz) return;
        setYukleniyor(true);
        setHata('');
        setSonuc(null);
        try {
            const { data } = await api.get(`/geribildirim/durum/${encodeURIComponent(temiz)}`);
            setSonuc(data);
        } catch (err) {
            setHata(err.response?.data?.error || 'Sorgulama başarısız. Lütfen daha sonra tekrar deneyin.');
        }
        setYukleniyor(false);
    }, []);

    // Formdaki bağlantı ?kod= ile geliyor — kullanıcı ikinci kez yazmasın.
    useEffect(() => {
        const q = params.get('kod');
        if (q) sorgula(q);
        // yalnızca ilk açılışta
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function gonder(e) {
        e.preventDefault();
        setParams(kod.trim() ? { kod: kod.trim().toUpperCase() } : {});
        sorgula(kod);
    }

    const d = sonuc ? (DURUM[sonuc.durum] || { ad: sonuc.durum, desc: '' }) : null;

    return (
        <div className="pm-takip">
            <div className="pm-takip__kart">
                <h1 className="pm-takip__baslik">Şikayet Takibi</h1>
                <p className="pm-takip__alt">
                    Geri bildirim formunu doldurduğunuzda verilen takip kodunu girin.
                </p>

                <form onSubmit={gonder} className="pm-takip__form">
                    <input
                        value={kod}
                        onChange={(e) => setKod(e.target.value)}
                        placeholder="SK-XXXXXX"
                        aria-label="Takip kodu"
                        className="pm-takip__input"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <button type="submit" className="pm-takip__btn" disabled={yukleniyor || !kod.trim()}>
                        {yukleniyor ? 'Sorgulanıyor...' : 'Sorgula'}
                    </button>
                </form>

                {hata && <p className="pm-takip__hata">{hata}</p>}

                {sonuc && (
                    <div className="pm-takip__sonuc">
                        <span className={`pm-takip__rozet pm-takip__rozet--${sonuc.durum}`}>{d.ad}</span>
                        <p className="pm-takip__desc">{d.desc}</p>
                        <dl className="pm-takip__liste">
                            <div><dt>Takip kodu</dt><dd className="pm-takip__mono">{sonuc.takipNo}</dd></div>
                            <div><dt>Konu</dt><dd>{KATEGORI[sonuc.kategori] || sonuc.kategori}</dd></div>
                            {sonuc.subeAd && <div><dt>Şube</dt><dd>{sonuc.subeAd}</dd></div>}
                            <div><dt>Bildirim tarihi</dt><dd>{tarihTR(sonuc.olusturmaZamani)}</dd></div>
                            <div>
                                <dt>Size dönüş</dt>
                                <dd>{sonuc.donuldu ? 'Yapıldı' : 'Henüz yapılmadı'}</dd>
                            </div>
                        </dl>
                        {/* Kişisel veri göstermeme kararını müşteriye de açıklıyoruz:
                            "neden mesajımı görmüyorum" sorusu gelmesin. */}
                        <p className="pm-takip__not">
                            Güvenliğiniz için bu sayfada kişisel bilgileriniz ve şikayet metniniz
                            gösterilmez. Ekibimiz sizinle paylaştığınız telefon veya e-posta üzerinden
                            iletişime geçer.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
