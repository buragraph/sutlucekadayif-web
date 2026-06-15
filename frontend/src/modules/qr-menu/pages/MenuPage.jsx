import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../../services/api';
import { Search, ChevronRight, ChevronUp, Instagram, MessageCircle } from 'lucide-react';
import { proxyImageUrl, proxyR2Url } from '../../../utils/imageProxy';

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

/* ─── Product Card ─── */
function ProductCard({ urun, index }) {
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
        >
            <div className="pm-card__img-wrap">
                {urun.gorsel ? (
                    <img src={proxyImageUrl(urun.gorsel)} alt={urun.ad} className="pm-card__img" loading="lazy" />
                ) : (
                    <div className="pm-card__img-placeholder">🍮</div>
                )}
            </div>
            <div className="pm-card__body">
                <h4 className="pm-card__name">{urun.ad}</h4>
                {urun.aciklama && <p className="pm-card__desc">{urun.aciklama}</p>}
                <div className="pm-card__meta">
                    <span className="pm-card__price">
                        {Math.round(urun.fiyat)}₺
                        {urun.miktar && <span className="pm-card__miktar"> / {urun.miktar}{urun.birim === 'g' ? 'gr' : urun.birim}</span>}
                    </span>
                    {urun.etiket?.length > 0 && (
                        <span className="pm-card__tag pm-card__tag--inline">
                            {(() => {
                                const tagMap = {
                                    en_cok_satan: 'Çok Satan',
                                    yeni: 'Yeni',
                                    onerilen: 'Önerilen',
                                    vegan: 'Vegan',
                                    acili: 'Acılı',
                                };
                                return tagMap[urun.etiket[0]] || urun.etiket[0];
                            })()}
                        </span>
                    )}
                </div>
            </div>
        </article>
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
    const [activeKat, setActiveKat] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showScrollTop, setShowScrollTop] = useState(false);
    const chipsRef = useRef(null);

    useEffect(() => {
        if (subeSlug) loadMenu();
    }, [subeSlug]);

    useEffect(() => {
        const handleScroll = () => setShowScrollTop(window.scrollY > 400);
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);


    async function loadMenu() {
        setLoading(true);
        setError(null);
        try {
            let data;

            // 1. R2 JSON cache'ten dene (CDN — hızlı)
            try {
                // r2.dev doğrudan erişilemediği için proxy üzerinden (görsellerle aynı yol)
                const r2Res = await fetch(proxyR2Url(`https://pub-99104fd4f6324895b46545c23e61887f.r2.dev/menu/${subeSlug}.json`));
                if (r2Res.ok) {
                    data = await r2Res.json();
                }
            } catch (e) { /* R2'de yoksa API'ye düş */ }

            // 2. R2'de yoksa API'den çek (fallback)
            if (!data) {
                const res = await api.get(`/menu/${subeSlug}`);
                data = res.data;
            }

            setSube(data.sube);
            setKategoriler(data.kategoriler);
            setUrunlerByKategori(data.urunlerByKategori);
            // Set first visible category as active
            const visible = data.kategoriler.filter(k => (data.urunlerByKategori[k.id] || []).length > 0);
            if (visible.length > 0) setActiveKat(visible[0].id);
        } catch (err) {
            console.error('Menü yüklenemedi:', err);
            setError(err.response?.status === 404 ? 'Şube bulunamadı' : 'Menü yüklenirken hata oluştu');
        }
        setLoading(false);
    }

    if (loading) return <SkeletonLoading />;
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

    const visibleKategoriler = kategoriler.filter(k => (urunlerByKategori[k.id] || []).length > 0);

    // Get products to display based on active category and search
    const getDisplayProducts = () => {
        let products = [];
        if (activeKat) {
            products = urunlerByKategori[activeKat] || [];
        } else {
            // Show all
            visibleKategoriler.forEach(k => {
                products = [...products, ...(urunlerByKategori[k.id] || [])];
            });
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            products = products.filter(u =>
                u.ad.toLowerCase().includes(q) ||
                u.aciklama?.toLowerCase().includes(q)
            );
        }
        return products;
    };

    const displayProducts = getDisplayProducts();
    const activeKatObj = visibleKategoriler.find(k => k.id === activeKat);

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
                        <a href="#" className="pm-header__link">
                            <MessageCircle size={13} /> Şikayet
                        </a>
                    </div>

                    <div className="pm-header__brand">
                        <img
                            src={proxyImageUrl('https://qr.sutlucekadayif.com/wp-content/uploads/2025/09/Varlik-1.png')}
                            alt="Sütlüce Kadayıf"
                            className="pm-header__logo"
                            onError={e => { e.target.style.display = 'none'; }}
                        />
                    </div>
                </div>
            </header>

            <main className="pm-main">
                {/* ─── Hero Banner ─── */}
                <section className="pm-hero">
                        <div className="pm-hero__glow pm-hero__glow--1" />
                        <div className="pm-hero__glow pm-hero__glow--2" />
                        <div className="pm-hero__content">
                            <span className="pm-hero__eyebrow">İmza Lezzetler</span>
                            <h2 className="pm-hero__heading">Geleneksel kadayıfın<br />premium deneyimi.</h2>
                            <p className="pm-hero__desc">Özenle seçilmiş malzemeler, ustalıkla hazırlanan lezzetler ve göz alıcı sunumlarla tatlının ötesinde bir deneyim.</p>
                            <div className="pm-hero__actions">
                                <button
                                    className="pm-hero__btn pm-hero__btn--primary"
                                    onClick={() => {
                                        const best = visibleKategoriler.find(k =>
                                            (urunlerByKategori[k.id] || []).some(u => u.etiket?.includes('en_cok_satan'))
                                        );
                                        if (best) setActiveKat(best.id);
                                    }}
                                >
                                    En Çok Satanlar
                                </button>
                            </div>
                        </div>
                </section>

                {/* ─── Category Chips + Search ─── */}
                <section className="pm-chips-section" ref={chipsRef}>
                    <div className="pm-chips">
                        <button
                            className={`pm-chip ${!activeKat ? 'pm-chip--active' : ''}`}
                            onClick={() => setActiveKat(null)}
                        >
                            Tümü
                        </button>
                        {visibleKategoriler.map((kat, i) => (
                            <button
                                key={kat.id}
                                className={`pm-chip pm-chip--img ${activeKat === kat.id ? 'pm-chip--active' : ''}`}
                                onClick={() => setActiveKat(kat.id)}
                            >
                                {kat.gorsel && (
                                    <img src={proxyImageUrl(kat.gorsel)} alt="" className="pm-chip__bg" />
                                )}
                                <span className="pm-chip__text">{kat.ad}</span>
                            </button>
                        ))}
                    </div>
                    <div className="pm-header__search">
                        <Search size={16} className="pm-header__search-icon" />
                        <input
                            type="text"
                            placeholder="Menüde ara..."
                            className="pm-header__search-input"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </section>
                {/* ─── Section Title ─── */}
                <section className="pm-section-header">
                    <div>
                        <span className="pm-section-header__eyebrow">
                            {searchQuery ? 'Arama sonuçları' : (activeKatObj ? 'Kategori' : 'Tüm Ürünler')}
                        </span>
                        <h3 className="pm-section-header__title">
                            {searchQuery ? `"${searchQuery}"` : (activeKatObj?.ad || 'Menü')}
                        </h3>
                    </div>
                    <span className="pm-section-header__count">{displayProducts.length} ürün</span>
                </section>

                {/* ─── Product Grid ─── */}
                <section className="pm-grid-section">
                    {displayProducts.length === 0 ? (
                        <div className="pm-empty">
                            <span style={{ fontSize: 40 }}>🔍</span>
                            <p>Sonuç bulunamadı</p>
                        </div>
                    ) : (
                        <div className="pm-grid">
                            {displayProducts.map((urun, index) => (
                                <ProductCard key={urun.id} urun={urun} index={index} />
                            ))}
                        </div>
                    )}
                </section>
            </main>

            {/* ─── Footer ─── */}
            <footer className="pm-footer">
                <div className="pm-footer__review">
                    <h2 className="pm-footer__title">Google'da bizi değerlendirin</h2>
                    <p className="pm-footer__desc">Yorumlarınız, hem bizi mutlu ediyor hem de yeni misafirlerimize ilham veriyor.</p>
                    <a href="https://g.page/r/sutlucekadayif/review" target="_blank" rel="noopener noreferrer" className="pm-footer__btn">
                        Bizi Değerlendirin
                    </a>
                </div>

                <div className="pm-footer__card">
                    <h3 className="pm-footer__card-title">İş başvurusu için:</h3>
                    <p className="pm-footer__card-subtitle">Sütlüce Kadayıf şubelerinde çalışmak ister misiniz?</p>
                    <p className="pm-footer__card-desc">Ekibimize katılmak için başvuru formunu doldurabilirsiniz.</p>
                    <a href="https://qr.sutlucekadayif.com/is-basvurusu/" target="_blank" rel="noopener noreferrer" className="pm-footer__card-btn">
                        İş Başvurusu Yap
                    </a>
                </div>

                <div className="pm-footer__franchise">
                    <h2 className="pm-footer__title">Franchise Fırsatlarıyla Sütlüce Ailesine Katılın</h2>
                    <p className="pm-footer__desc">Sütlüce Kadayıf, güçlü marka yapısı ve özgün ürün konseptiyle sürdürülebilir bir iş modeli sunar.</p>
                    <a href="https://www.sutlucekadayif.com/franchise-basvurusu/" target="_blank" rel="noopener noreferrer" className="pm-footer__btn">
                        Franchise Başvurusu Yap
                    </a>
                </div>

                <div className="pm-footer__bottom">
                    <a href="tel:08503049722" className="pm-footer__phone">0850 304 9722</a>
                    <small>©2026 <a href="https://sutlucekadayif.com.tr" target="_blank" rel="noopener noreferrer">Sütlüce Kadayıf</a></small>
                </div>
            </footer>

            {/* ─── Scroll to Top ─── */}
            {showScrollTop && (
                <button
                    className="pm-scroll-top"
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                >
                    <ChevronUp size={20} />
                </button>
            )}
        </div>
    );
}
