import { Search, Bell, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const BREADCRUMB_MAP = {
    '/admin': [{ label: 'Genel Bakış' }],
    '/admin/qr-menu': [{ label: 'QR Menü' }, { label: 'Ürünler' }],
    '/admin/qr-menu/kategoriler': [{ label: 'QR Menü' }, { label: 'Kategoriler' }],
    '/admin/kullanicilar': [{ label: 'Yönetim' }, { label: 'Kullanıcılar' }],
    '/admin/subeler': [{ label: 'Yönetim' }, { label: 'Şubeler' }],
};

export default function Header() {
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const [showNotifications, setShowNotifications] = useState(false);
    const searchInputRef = useRef(null);
    const location = useLocation();

    useEffect(() => {
        if (searchOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [searchOpen]);

    const crumbs = BREADCRUMB_MAP[location.pathname] || [{ label: 'Genel Bakış' }];

    return (
        <header className="topbar">
            <div className="topbar__left">
                <nav className="topbar__breadcrumb">
                    {crumbs.map((crumb, i) => (
                        <span key={i} className="topbar__breadcrumb-item">
                            {i > 0 && <span className="topbar__breadcrumb-sep">›</span>}
                            <span className={i === crumbs.length - 1 ? 'topbar__breadcrumb-current' : 'topbar__breadcrumb-parent'}>
                                {crumb.label}
                            </span>
                        </span>
                    ))}
                </nav>
            </div>

            <div className="topbar__actions">
                {searchOpen ? (
                    <div className="topbar__search topbar__search--open">
                        <Search size={16} className="topbar__search-icon" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            className="topbar__search-input"
                            placeholder="Ara..."
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                        />
                        <button className="topbar__search-close" onClick={() => { setSearchOpen(false); setSearchValue(''); }}>
                            <X size={14} />
                        </button>
                    </div>
                ) : (
                    <button className="topbar__icon-btn" onClick={() => setSearchOpen(true)} title="Ara">
                        <Search size={18} />
                    </button>
                )}

                <div className="topbar__notif-wrap">
                    <button
                        className="topbar__icon-btn"
                        onClick={() => setShowNotifications(!showNotifications)}
                    >
                        <Bell size={18} />
                        <span className="topbar__notif-badge">3</span>
                    </button>

                    {showNotifications && (
                        <div className="topbar__notif-dropdown">
                            <div className="topbar__notif-header">Bildirimler</div>
                            <div className="topbar__notif-item">
                                <div className="topbar__notif-dot" />
                                <div>
                                    <p className="topbar__notif-text">Yeni ürün eklendi</p>
                                    <span className="topbar__notif-time">2 dk önce</span>
                                </div>
                            </div>
                            <div className="topbar__notif-item">
                                <div className="topbar__notif-dot" />
                                <div>
                                    <p className="topbar__notif-text">Ankara şubesi güncellendi</p>
                                    <span className="topbar__notif-time">1 saat önce</span>
                                </div>
                            </div>
                            <div className="topbar__notif-item topbar__notif-item--read">
                                <div className="topbar__notif-dot" />
                                <div>
                                    <p className="topbar__notif-text">Yeni kullanıcı eklendi</p>
                                    <span className="topbar__notif-time">3 saat önce</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
