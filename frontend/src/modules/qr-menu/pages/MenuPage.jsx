import { useState, useEffect, useRef, useMemo } from 'react';
import { fiyatYaz } from '../utils/fiyat';
import { useParams } from 'react-router-dom';
import api from '../../../services/api';
import { Search, ChevronUp, Instagram, MessageCircle, X, FileText } from 'lucide-react';
import { proxyImageUrl, proxyR2Url, proxyKeyUrl } from '../../../utils/imageProxy';
import GeriBildirimModal from '../components/GeriBildirimModal';
import IsBasvuruModal from '../components/IsBasvuruModal';
import AlerjenModal from '../components/AlerjenModal';

import { etiketKisaAd } from '../constants/etiketler';
import { menuGoruntulendi } from '../utils/analitik';

/* ─── Skeleton Loading ─── */
function SkeletonLoading() {
    return (
        <div className="pm">
            <div className="pm-skeleton-header">
                <div className="pm-skeleton-bone pm-skeleton-bone--w120 pm-skeleton-bone--h14" />
                <div className="pm-skeleton-bone pm-skeleton-bone--w100 pm-skeleton-bone--h18" />
                <div className="pm-skeleton-bone pm-skeleton-bone--w120 pm-skeleton-bone--h14" />
            </div>
            <div className="pm-skeleton-hero">
                <div className="pm-skeleton-bone pm-skeleton-bone--hero" />
            </div>
            <div className="pm-skeleton-chips">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="pm-skeleton-bone pm-skeleton-bone--chip" />
                ))}
            </div>
            <div className="pm-skeleton-grid">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="pm-skeleton-bone pm-skeleton-bone--card" />
                ))}
            </div>
        </div>
    );
}

/* ─── Banner Şeridi ─── */
/* Logonun hemen altında dönen marka duyuruları. Eski QR menüsündeki
   (qr.sutlucekadayif.com) karusel deseninin aynısı: iki-üç görsel, otomatik
   geçiş, altta nokta.

   ŞUBEDEN BAĞIMSIZ: `menu/_ayarlar.json` içinden gelir, şube JSON'una
   gömülmez — yoksa banner değiştikçe 90 dosyanın yeniden yazılması gerekirdi.

   Banner yoksa hiç çizilmez; menü boş bir kutuyla açılmasın. */
function BannerSeridi({ bannerlar }) {
    const [aktif, setAktif] = useState(0);
    const adet = bannerlar.length;

    useEffect(() => {
        if (adet < 2) return;
        const t = setInterval(() => setAktif((i) => (i + 1) % adet), 5000);
        return () => clearInterval(t);
    }, [adet]);

    if (adet === 0) return null;

    return (
        <section className="pm-banner" aria-label="Duyurular">
            <div className="pm-banner__ray" style={{ transform: `translateX(-${aktif * 100}%)` }}>
                {bannerlar.map((b, i) => {
                    const gorsel = (
                        <img
                            src={proxyKeyUrl(b.key)}
                            alt=""
                            className="pm-banner__img"
                            /* İlk banner sayfanın ilk ekranında; gerisi tembel. */
                            loading={i === 0 ? 'eager' : 'lazy'}
                        />
                    );
                    return (
                        <div className="pm-banner__slayt" key={b.key}>
                            {b.baglanti
                                ? <a href={b.baglanti} target="_blank" rel="noopener noreferrer">{gorsel}</a>
                                : gorsel}
                        </div>
                    );
                })}
            </div>
            {adet > 1 && (
                <div className="pm-banner__noktalar">
                    {bannerlar.map((b, i) => (
                        <button
                            key={b.key}
                            type="button"
                            className={`pm-banner__nokta${i === aktif ? ' pm-banner__nokta--aktif' : ''}`}
                            onClick={() => setAktif(i)}
                            aria-label={`${i + 1}. duyuru`}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

/* ─── Product Card ─── */
function ProductCard({ urun, index, onClick }) {
    const ref = useRef(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
            { threshold: 0.1 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <article
            ref={ref}
            className={`pm-card ${visible ? 'pm-card--visible' : ''}`}
            style={{ animationDelay: `${index * 0.06}s` }}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
        >
            <div className="pm-card__img-wrap">
                {/* Kart KÜÇÜK boyu kullanır (≈400px), detay penceresi büyüğü.
                    Eski ürünlerde küçük boy yoksa `gorsel`e düşer. */}
                {urun.gorsel ? (
                    <img src={proxyImageUrl(urun.gorselKucuk || urun.gorsel)} alt={urun.ad} className="pm-card__img" loading="lazy" />
                ) : (
                    <div className="pm-card__img-placeholder">🍮</div>
                )}
            </div>
            <div className="pm-card__body">
                <h4 className="pm-card__name">{urun.ad}</h4>
                {urun.aciklama && <p className="pm-card__desc">{urun.aciklama}</p>}
                <div className="pm-card__meta">
                    <span className="pm-card__price">
                        {fiyatYaz(urun.fiyat)}₺
                        {urun.miktar && <span className="pm-card__miktar"> / {urun.miktar}{urun.birim === 'g' ? 'gr' : urun.birim}</span>}
                        {/* != null: 0 kcal geçerli (su, sade soda) — `&&` ile gizlenirdi */}
                        {urun.kalori != null && <span className="pm-card__kalori"> · {urun.kalori} kcal</span>}
                    </span>
                    {urun.etiket?.length > 0 && (
                        <span className="pm-card__tag pm-card__tag--inline">
                            {etiketKisaAd(urun.etiket[0])}
                        </span>
                    )}
                </div>
            </div>
        </article>
    );
}

/* ─── Product Detail Modal ─── */
function ProductModal({ urun, onClose }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    }, [onClose]);

    if (!urun) return null;

    return (
        <div className="pm-modal__overlay" onClick={onClose}>
            <div className="pm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <button className="pm-modal__close" onClick={onClose} aria-label="Kapat">
                    <X size={18} />
                </button>
                <div className="pm-modal__img-wrap">
                    {urun.gorsel ? (
                        <img src={proxyImageUrl(urun.gorsel)} alt={urun.ad} className="pm-modal__img" />
                    ) : (
                        <div className="pm-modal__img-placeholder">🍮</div>
                    )}
                </div>
                <div className="pm-modal__body">
                    {urun.etiket?.length > 0 && (
                        <div className="pm-modal__tags">
                            {urun.etiket.map((e) => (
                                <span key={e} className="pm-modal__tag">{etiketKisaAd(e)}</span>
                            ))}
                        </div>
                    )}
                    <h3 className="pm-modal__name">{urun.ad}</h3>
                    {urun.aciklama && <p className="pm-modal__desc">{urun.aciklama}</p>}
                    <div className="pm-modal__price">
                        {fiyatYaz(urun.fiyat)}₺
                        {urun.miktar && <span className="pm-modal__miktar"> / {urun.miktar}{urun.birim === 'g' ? 'gr' : urun.birim}</span>}
                        {urun.kalori != null && <span className="pm-modal__kalori"> · {urun.kalori} kcal</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─── Main Page ─── */
export default function MenuPage() {
    const { subeSlug } = useParams();
    const [sube, setSube] = useState(null);
    const [kategoriler, setKategoriler] = useState([]);
    const [urunlerByKategori, setUrunlerByKategori] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeKat, setActiveKat] = useState(null);   // scroll-spy: görünümdeki kategori
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedUrun, setSelectedUrun] = useState(null);
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [showGeriBildirim, setShowGeriBildirim] = useState(false);
    const [showIsBasvuru, setShowIsBasvuru] = useState(false);
    const [alerjenPdf, setAlerjenPdf] = useState(null);   // R2 key — yoksa buton çıkmaz
    const [fiyatTarihi, setFiyatTarihi] = useState(null); // 'YYYY-MM-DD' — yoksa satır çıkmaz
    const [bannerlar, setBannerlar] = useState([]);       // marka geneli duyuru görselleri
    const [showAlerjen, setShowAlerjen] = useState(false);

    const tabRefs = useRef({});      // { katId: <button> }
    const navScrollRef = useRef(null);
    // Şeridin uçlarında gidilecek yer var mı — okların etkin/sönük hâlini belirler.
    const [seritUc, setSeritUc] = useState({ sol: false, sag: false });
    const navbarRef = useRef(null);

    useEffect(() => {
        if (subeSlug) loadMenu();
    }, [subeSlug]);

    useEffect(() => {
        const handleScroll = () => setShowScrollTop(window.scrollY > 500);
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Sayfa başlığı — sekme + paylaşım için şube adı
    useEffect(() => {
        document.title = sube?.ad ? `${sube.ad} — Sütlüce Kadayıf Menü` : 'Sütlüce Kadayıf';
    }, [sube]);

    // Menü görüntülenme ölçümü. MENÜ GELDİKTEN SONRA: yüklenemeyen/olmayan
    // şube de sayılsaydı "görüntülenme" hatalı QR okutmalarını da içerirdi.
    // Şube bazında ayrılabilsin diye slug olay parametresi olarak gidiyor.
    useEffect(() => {
        if (sube?.slug || sube?.kod) {
            menuGoruntulendi({ slug: sube.slug || sube.kod, ad: sube.ad });
        }
    }, [sube]);

    // Global ayarlar (alerjen PDF'i + fiyat değiştirilme tarihi) — şube
    // menüsünden AYRI dosya. Menü JSON'una gömülmediler: her değişimde 88
    // şubelik JSON'ın yeniden üretilmesi gerekirdi. Dosya yoksa (404) ikisi de
    // hiç görünmez.
    useEffect(() => {
        fetch(proxyR2Url('https://pub-99104fd4f6324895b46545c23e61887f.r2.dev/menu/_ayarlar.json'))
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => {
                setAlerjenPdf(j?.alerjenPdf || null);
                setFiyatTarihi(j?.fiyatTarihi || null);
                setBannerlar(Array.isArray(j?.bannerlar) ? j.bannerlar.filter((b) => b?.key) : []);
            })
            .catch(() => {});
    }, []);

    async function loadMenu() {
        setLoading(true);
        setError(null);
        try {
            // Basılı QR kodlar WordPress'ten geliyor ve iki şubede slug tire ile
            // yazılmış (tuzla-aydinli / yahya-kaptan), bizde alt tire. Şube kodunu
            // değiştirmek FK'ları ve R2 dosya adlarını kırardı; onun yerine ilk
            // deneme tutmazsa tire↔alt tire çevrilip bir kez daha denenir.
            const adaylar = [subeSlug, subeSlug.replace(/-/g, '_'), subeSlug.replace(/_/g, '-')]
                .filter((s, i, d) => d.indexOf(s) === i);

            let data;
            for (const aday of adaylar) {
                try {
                    const r2Res = await fetch(proxyR2Url(`https://pub-99104fd4f6324895b46545c23e61887f.r2.dev/menu/${aday}.json`));
                    if (r2Res.ok) { data = await r2Res.json(); break; }
                } catch { /* R2'de yoksa API'ye düş */ }
            }

            if (!data) {
                for (const [i, aday] of adaylar.entries()) {
                    try {
                        data = (await api.get(`/menu/${aday}`)).data;
                        break;
                    } catch (err) {
                        if (i === adaylar.length - 1) throw err;
                    }
                }
            }

            setSube(data.sube);
            setKategoriler(data.kategoriler);
            setUrunlerByKategori(data.urunlerByKategori);
            const visible = data.kategoriler.filter(k => (data.urunlerByKategori[k.id] || []).length > 0);
            if (visible.length > 0) setActiveKat(visible[0].id);
        } catch (err) {
            console.error('Menü yüklenemedi:', err);
            setError(err.response?.status === 404 ? 'Şube bulunamadı' : 'Menü yüklenirken hata oluştu');
        }
        setLoading(false);
    }

    const visibleKategoriler = useMemo(
        () => kategoriler.filter(k => (urunlerByKategori[k.id] || []).length > 0),
        [kategoriler, urunlerByKategori]
    );

    const tumUrunler = useMemo(
        () => visibleKategoriler.flatMap(k => urunlerByKategori[k.id] || []),
        [visibleKategoriler, urunlerByKategori]
    );

    // Arama, kategori gezinmesinden AYRI bir mod: arama sırasında kategori rayı
    // gizlenir, yerine düz sonuç listesi gelir.
    const aramaModu = !!searchQuery.trim();

    // Arama sonuçları (etiketle süzme kaldırıldı — etiketler yalnızca ürün
    // kartında rozet olarak görünür, filtre kontrolü yok)
    const aramaSonuclari = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return [];
        return tumUrunler.filter(u => u.ad.toLowerCase().includes(q) || u.aciklama?.toLowerCase().includes(q));
    }, [searchQuery, tumUrunler]);

    // Kategori şeridinin sağa devam ettiği fark edilmiyordu. Oklar bunu
    // gösteriyor; hangi yönde gerçekten içerik olduğu buradan hesaplanıyor.
    // (Kenar solması da denendi, oklarla birlikte fazla geldi ve kaldırıldı.)
    useEffect(() => {
        const bar = navScrollRef.current;
        if (!bar) return;
        const olc = () => setSeritUc({
            sol: bar.scrollLeft > 2,
            sag: bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 2,
        });
        olc();
        bar.addEventListener('scroll', olc, { passive: true });
        window.addEventListener('resize', olc);
        return () => {
            bar.removeEventListener('scroll', olc);
            window.removeEventListener('resize', olc);
        };
    }, [visibleKategoriler]);

    // Oklarla kaydırma: parmakla kaydırmaya mecbur kalmamak için.
    const seridiKaydir = (yon) => {
        const bar = navScrollRef.current;
        if (!bar) return;
        bar.scrollBy({ left: yon * bar.clientWidth * 0.7, behavior: 'smooth' });
    };

    // Aktif sekmeyi yatay barda ortala (sayfayı kaydırmadan)
    useEffect(() => {
        const tab = tabRefs.current[activeKat];
        const bar = navScrollRef.current;
        if (tab && bar) {
            const target = tab.offsetLeft - bar.clientWidth / 2 + tab.clientWidth / 2;
            bar.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
        }
    }, [activeKat]);

    // Kategori seç → yalnızca o kategoriyi göster + menü başına kaydır (sayfa kısa kalsın)
    const selectKat = (id) => {
        setActiveKat(id);
        requestAnimationFrame(() => navbarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };

    if (loading) return <SkeletonLoading />;

    // Kapanan şube: 404 DEĞİL, açık bir bilgi ekranı. Basılı QR kodlar dışarıda
    // ve taranmaya devam ediyor; müşteriyi hata sayfasıyla karşılamak yerine
    // ne olduğunu söyleyip diğer şubelere yönlendiriyoruz.
    if (sube?.kapanmaTarihi) {
        return (
            <div className="pm">
                <div className="pm-error">
                    <span style={{ fontSize: 48 }}>🏪</span>
                    <p><strong>{sube.ad}</strong> şubemiz kapanmıştır.</p>
                    <p style={{ fontSize: 14, opacity: 0.7 }}>
                        Size en yakın diğer Sütlüce Kadayıf şubelerini web sitemizden bulabilirsiniz.
                    </p>
                    <a href="https://sutlucekadayif.com" className="pm-footer__btn" style={{ marginTop: 12 }}>
                        Şubelerimiz
                    </a>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="pm">
                <div className="pm-error">
                    <span style={{ fontSize: 48 }}>😕</span>
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    // Gezinme modunda gösterilecek tek kategori
    const activeKatObj = visibleKategoriler.find(k => k.id === activeKat);
    const activeProducts = urunlerByKategori[activeKat] || [];

    return (
        <div className="pm">
            {/* ─── Header ─── */}
            <header className="pm-header">
                <div className="pm-header__glass">
                    <div className="pm-header__top">
                        <a href="https://www.instagram.com/sutlucekadayif/" target="_blank" rel="noopener noreferrer" className="pm-header__link">
                            <Instagram size={13} /> Instagram
                        </a>
                        <span className="pm-header__divider" />
                        <div className="pm-header__branch">
                            <span className="pm-header__branch-name">{sube?.ad || subeSlug}</span>
                        </div>
                        <span className="pm-header__divider" />
                        <button type="button" className="pm-header__link" onClick={() => setShowGeriBildirim(true)}>
                            <MessageCircle size={13} /> İletişim
                        </button>
                    </div>
                    <div className="pm-header__brand">
                        <img
                            /* Logo projede duruyor (public/Varlik-1.png) — eskiden WordPress'ten
                               çekiliyordu; o site kapanınca tüm şubelerde logo kaybolurdu.
                               Yerel dosya ayrıca proxy turunu da ortadan kaldırır. */
                            src="/Varlik-1.png"
                            alt="Sütlüce Kadayıf"
                            className="pm-header__logo"
                            onError={e => { e.target.style.display = 'none'; }}
                        />
                    </div>
                </div>
            </header>

            <main className="pm-main">
                {/* Banner şeridi, eskiden burada duran "İmza Lezzetler"
                    tanıtım bloğunun YERİNE geçti: aynı alanda iki blok
                    üst üste menüyü ekranın çok aşağısına itiyordu. */}
                <BannerSeridi bannerlar={bannerlar} />

                {/* ─── Arama ─── */}
                {/* Etiket filtreleri buradan kategori rayına taşındı: arama altında
                    iki ayrı ama birbirine benzeyen pill sırası vardı, hangisinin ne
                    yaptığı anlaşılmıyordu. Artık tek sıra. */}
                <section className="pm-filter-section">
                    <div className="pm-header__search">
                        <Search size={17} className="pm-header__search-icon" />
                        <input
                            type="text"
                            placeholder="Tüm menüde ara..."
                            className="pm-header__search-input"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button className="pm-header__search-clear" onClick={() => setSearchQuery('')} aria-label="Temizle">
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    {alerjenPdf && (
                        <button
                            type="button"
                            className="pm-alerjen-btn"
                            onClick={() => setShowAlerjen(true)}
                        >
                            <FileText size={14} /> Alerjen Bilgileri
                        </button>
                    )}
                    {fiyatTarihi && (
                        <p className="pm-fiyat-tarihi">
                            Fiyat Değiştirilme Tarihi:{' '}
                            {new Date(fiyatTarihi).toLocaleDateString('tr-TR')}
                        </p>
                    )}
                </section>

                {aramaModu ? (
                    /* ═══ FİLTRE MODU — düz sonuç listesi ═══ */
                    <>
                        <section className="pm-section-header">
                            <div>
                                <span className="pm-section-header__eyebrow">Arama sonuçları</span>
                                <h3 className="pm-section-header__title">“{searchQuery.trim()}”</h3>
                            </div>
                            <span className="pm-section-header__count">{aramaSonuclari.length} ürün</span>
                        </section>
                        <section className="pm-grid-section">
                            {aramaSonuclari.length === 0 ? (
                                <div className="pm-empty">
                                    <span style={{ fontSize: 40 }}>🔍</span>
                                    <p>Sonuç bulunamadı</p>
                                </div>
                            ) : (
                                <div className="pm-grid">
                                    {aramaSonuclari.map((urun, index) => (
                                        <ProductCard key={urun.id} urun={urun} index={index} onClick={() => setSelectedUrun(urun)} />
                                    ))}
                                </div>
                            )}
                        </section>
                    </>
                ) : (
                    /* ═══ GEZİNME MODU — yapışkan bar + TEK kategori (sayfa kısa kalır) ═══ */
                    <>
                        <nav className="pm-navbar" ref={navbarRef}>
                            {/* OK DÜĞMELERİ şeridin ÜSTÜNDE değil YANINDA duruyor:
                                üstte dururken kenardaki sekmeyi örtüyorlardı. İkisi de
                                her zaman çiziliyor, gidilecek yer yoksa `disabled` —
                                görünüp kaybolsalardı şerit her seferinde enini
                                değiştirip zıplardı. */
                            }
                            <button
                                type="button"
                                className="pm-navok"
                                onClick={() => seridiKaydir(-1)}
                                disabled={!seritUc.sol}
                                aria-label="Önceki kategoriler"
                            >
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </button>
                            <div className="pm-navbar__scroll" ref={navScrollRef}>
                                {visibleKategoriler.map((kat) => (
                                    <button
                                        key={kat.id}
                                        ref={(el) => { tabRefs.current[kat.id] = el; }}
                                        className={`pm-navtab ${activeKat === kat.id ? 'pm-navtab--active' : ''}`}
                                        onClick={() => selectKat(kat.id)}
                                    >
                                        {kat.ad}
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                className="pm-navok"
                                onClick={() => seridiKaydir(1)}
                                disabled={!seritUc.sag}
                                aria-label="Sonraki kategoriler"
                            >
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </button>
                        </nav>

                        <section className="pm-section-header">
                            <div>
                                <span className="pm-section-header__eyebrow">Kategori</span>
                                <h3 className="pm-section-header__title">{activeKatObj?.ad || 'Menü'}</h3>
                            </div>
                            <span className="pm-section-header__count">{activeProducts.length} ürün</span>
                        </section>
                        <section className="pm-grid-section">
                            <div className="pm-grid">
                                {activeProducts.map((urun, index) => (
                                    <ProductCard key={urun.id} urun={urun} index={index} onClick={() => setSelectedUrun(urun)} />
                                ))}
                            </div>
                        </section>
                    </>
                )}
            </main>

            {/* ─── Footer ─── */}
            <footer className="pm-footer">
                {/* Değerlendirme adresi ŞUBEYE ÖZEL (menü JSON'ında gelir).
                    Eskiden koda gömülü tek bir kısa link vardı; o link Google'da
                    yoktu ve tıklayan müşteri google.com'a düşüyordu. Ayrıca tek
                    link olduğu için 90 şube aynı işletmeyi değerlendiriyordu.
                    Linki olmayan şubede bölüm HİÇ gösterilmez. */}
                {sube?.degerlendirmeLink && (
                    <div className="pm-footer__review">
                        {/* Beş yıldız başlığın ÜSTÜNDE: bölümün ne istediği okumadan
                            anlaşılsın. Google'ın kendi renkleriyle gradient denenmedi —
                            marka paletiyle çakışıyor ve Google onayı izlenimi veriyor. */}
                        <div className="pm-footer__stars" aria-hidden="true">
                            {[0, 1, 2, 3, 4].map((i) => (
                                <svg key={i} viewBox="0 0 24 24" className="pm-footer__star">
                                    <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.44l-5.81 3.06 1.11-6.47L2.6 9.45l6.5-.95L12 2.6z" />
                                </svg>
                            ))}
                        </div>
                        <h2 className="pm-footer__title">Google'da bizi değerlendirin</h2>
                        <p className="pm-footer__desc">Yorumlarınız, hem bizi mutlu ediyor hem de yeni misafirlerimize ilham veriyor.</p>
                        <a href={sube.degerlendirmeLink} target="_blank" rel="noopener noreferrer" className="pm-footer__btn">
                            Bizi Değerlendirin
                        </a>
                    </div>
                )}
                {/* SIRA VE VURGU FRANCHISE'TA: iş başvurusu yeşil kartla önde,
                    franchise arkada duruyordu. Menüyü okuyan müşteri için
                    öncelik franchise; ikisi hem yer hem vurgu değiştirdi. */}
                <div className="pm-footer__card">
                    <h3 className="pm-footer__card-title">Franchise Fırsatlarıyla Sütlüce Ailesine Katılın</h3>
                    <p className="pm-footer__card-subtitle">Kendi Sütlüce Kadayıf şubenizi açmak ister misiniz?</p>
                    <p className="pm-footer__card-desc">Güçlü marka yapısı ve özgün ürün konseptiyle sürdürülebilir bir iş modeli.</p>
                    <a href="https://www.sutlucekadayif.com/franchise-basvurusu/" target="_blank" rel="noopener noreferrer" className="pm-footer__card-btn">
                        Franchise Başvurusu Yap
                    </a>
                </div>
                <div className="pm-footer__franchise">
                    <h2 className="pm-footer__title">Ekibimize katılın</h2>
                    <p className="pm-footer__desc">Sütlüce Kadayıf şubelerinde çalışmak isterseniz başvuru formunu doldurabilirsiniz.</p>
                    <button type="button" className="pm-footer__btn" onClick={() => setShowIsBasvuru(true)}>
                        İş Başvurusu Yap
                    </button>
                </div>
                <div className="pm-footer__bottom">
                    <a href="tel:08503049722" className="pm-footer__phone">0850 304 9722</a>
                    <small>©2026 <a href="https://sutlucekadayif.com.tr" target="_blank" rel="noopener noreferrer">Sütlüce Kadayıf</a></small>
                </div>
            </footer>

            {/* ─── Product Detail Modal ─── */}
            {selectedUrun && <ProductModal urun={selectedUrun} onClose={() => setSelectedUrun(null)} />}

            {/* ─── Şikayet & Geri Bildirim Formu ─── */}
            {showGeriBildirim && (
                <GeriBildirimModal
                    subeSlug={subeSlug}
                    subeAd={sube?.ad}
                    onClose={() => setShowGeriBildirim(false)}
                />
            )}

            {/* ─── İş Başvurusu Formu ─── */}
            {showAlerjen && alerjenPdf && (
                <AlerjenModal
                    url={proxyKeyUrl(alerjenPdf)}
                    onClose={() => setShowAlerjen(false)}
                />
            )}

            {showIsBasvuru && (
                <IsBasvuruModal
                    subeSlug={subeSlug}
                    subeAd={sube?.ad}
                    onClose={() => setShowIsBasvuru(false)}
                />
            )}

            {/* ─── Scroll to Top ─── */}
            {showScrollTop && (
                <button className="pm-scroll-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                    <ChevronUp size={20} />
                </button>
            )}
        </div>
    );
}
