import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../../services/api';
import { Search, ChevronUp, Instagram, MessageCircle, X } from 'lucide-react';
import { proxyImageUrl, proxyR2Url } from '../../../utils/imageProxy';

// Etiket etiketleri (kod → görünen ad)
const TAG_LABELS = {
    en_cok_satan: 'Çok Satan',
    yeni: 'Yeni',
    onerilen: 'Önerilen',
    vegan: 'Vegan',
    acili: 'Acılı',
};

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
                            {TAG_LABELS[urun.etiket[0]] || urun.etiket[0]}
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
                                <span key={e} className="pm-modal__tag">{TAG_LABELS[e] || e}</span>
                            ))}
                        </div>
                    )}
                    <h3 className="pm-modal__name">{urun.ad}</h3>
                    {urun.aciklama && <p className="pm-modal__desc">{urun.aciklama}</p>}
                    <div className="pm-modal__price">
                        {Math.round(urun.fiyat)}₺
                        {urun.miktar && <span className="pm-modal__miktar"> / {urun.miktar}{urun.birim === 'g' ? 'gr' : urun.birim}</span>}
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
    const [activeTag, setActiveTag] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedUrun, setSelectedUrun] = useState(null);
    const [showScrollTop, setShowScrollTop] = useState(false);

    const tabRefs = useRef({});      // { katId: <button> }
    const navScrollRef = useRef(null);
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

    async function loadMenu() {
        setLoading(true);
        setError(null);
        try {
            let data;
            try {
                const r2Res = await fetch(proxyR2Url(`https://pub-99104fd4f6324895b46545c23e61887f.r2.dev/menu/${subeSlug}.json`));
                if (r2Res.ok) data = await r2Res.json();
            } catch (e) { /* R2'de yoksa API'ye düş */ }

            if (!data) {
                const res = await api.get(`/menu/${subeSlug}`);
                data = res.data;
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

    const mevcutEtiketler = useMemo(() => {
        const set = new Set();
        tumUrunler.forEach(u => (u.etiket || []).forEach(e => set.add(e)));
        return [...set].filter(e => TAG_LABELS[e]);
    }, [tumUrunler]);

    const isFiltering = !!(searchQuery.trim() || activeTag);

    // Filtre modunda gösterilecek düz liste (arama > etiket)
    const filteredProducts = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (q) return tumUrunler.filter(u => u.ad.toLowerCase().includes(q) || u.aciklama?.toLowerCase().includes(q));
        if (activeTag) return tumUrunler.filter(u => u.etiket?.includes(activeTag));
        return [];
    }, [searchQuery, activeTag, tumUrunler]);

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
        setActiveTag(null);
        setActiveKat(id);
        requestAnimationFrame(() => navbarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };

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

    // Filtre başlığı
    const filtreBaslik = searchQuery ? `"${searchQuery}"` : (activeTag ? TAG_LABELS[activeTag] : '');

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
                        <a href="tel:08503049722" className="pm-header__link">
                            <MessageCircle size={13} /> İletişim
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
                        {mevcutEtiketler.includes('en_cok_satan') && (
                            <div className="pm-hero__actions">
                                <button
                                    className="pm-hero__btn pm-hero__btn--primary"
                                    onClick={() => { setActiveTag('en_cok_satan'); setSearchQuery(''); }}
                                >
                                    En Çok Satanlar
                                </button>
                            </div>
                        )}
                    </div>
                </section>

                {/* ─── Arama + Etiket filtreleri ─── */}
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
                    {mevcutEtiketler.length > 0 && (
                        <div className="pm-tags">
                            {mevcutEtiketler.map((tag) => (
                                <button
                                    key={tag}
                                    className={`pm-tag-filter ${activeTag === tag ? 'pm-tag-filter--active' : ''}`}
                                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                                >
                                    {TAG_LABELS[tag]}
                                </button>
                            ))}
                        </div>
                    )}
                </section>

                {isFiltering ? (
                    /* ═══ FİLTRE MODU — düz sonuç listesi ═══ */
                    <>
                        <section className="pm-section-header">
                            <div>
                                <span className="pm-section-header__eyebrow">{searchQuery ? 'Arama sonuçları' : 'Filtre'}</span>
                                <h3 className="pm-section-header__title">{filtreBaslik}</h3>
                            </div>
                            <span className="pm-section-header__count">{filteredProducts.length} ürün</span>
                        </section>
                        <section className="pm-grid-section">
                            {filteredProducts.length === 0 ? (
                                <div className="pm-empty">
                                    <span style={{ fontSize: 40 }}>🔍</span>
                                    <p>Sonuç bulunamadı</p>
                                </div>
                            ) : (
                                <div className="pm-grid">
                                    {filteredProducts.map((urun, index) => (
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

            {/* ─── Product Detail Modal ─── */}
            {selectedUrun && <ProductModal urun={selectedUrun} onClose={() => setSelectedUrun(null)} />}

            {/* ─── Scroll to Top ─── */}
            {showScrollTop && (
                <button className="pm-scroll-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                    <ChevronUp size={20} />
                </button>
            )}
        </div>
    );
}
