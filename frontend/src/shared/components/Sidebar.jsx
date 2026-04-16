import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    LayoutDashboard,
    QrCode,
    Users,
    Building2,
    LogOut,
    ChevronDown,
    ChevronRight,
    UtensilsCrossed,
    FolderOpen,
    ImagePlus,
    GraduationCap,
    PieChart,
} from 'lucide-react';
import { createElement, useState, useRef, useEffect } from 'react';

function getNavGroups(can) {
    const groups = [
        {
            title: 'ANA MENÜ',
            items: [
                { path: '/admin', icon: LayoutDashboard, label: 'Genel Bakış', end: true },
                { path: '/admin/raporlar', icon: PieChart, label: 'Raporlar' },
                { path: '/admin/medya', icon: ImagePlus, label: 'Medya' },
                { path: '/admin/akademi', icon: GraduationCap, label: 'Akademi' },
                {
                    path: '/admin/qr-menu',
                    icon: QrCode,
                    label: 'QR Menü',
                    children: [
                        { path: '/admin/qr-menu', icon: UtensilsCrossed, label: 'Ürünler', end: true },
                        ...(can('categories.create')
                            ? [{ path: '/admin/qr-menu/kategoriler', icon: FolderOpen, label: 'Kategoriler' }]
                            : []),
                    ],
                },
            ],
        },
    ];

    if (can('users.view')) {
        groups.push({
            title: 'YÖNETİM',
            items: [
                { path: '/admin/kullanicilar', icon: Users, label: 'Kullanıcılar' },
                { path: '/admin/subeler', icon: Building2, label: 'Şubeler' },
            ],
        });
    }

    return groups;
}

export default function Sidebar() {
    const { user, subeSlug, role, logout, can } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [expandedItems, setExpandedItems] = useState({});
    const userMenuRef = useRef(null);

    // Auto-expand items whose children match current path
    useEffect(() => {
        const expanded = {};
        getNavGroups(can).forEach((group) => {
            group.items.forEach((item) => {
                if (item.children && location.pathname.startsWith(item.path)) {
                    expanded[item.path] = true;
                }
            });
        });
        setExpandedItems((prev) => ({ ...prev, ...expanded }));
    }, [location.pathname]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
                setShowUserMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = async () => {
        await logout();
        navigate('/giris');
    };

    const toggleExpand = (path) => {
        setExpandedItems((prev) => ({ ...prev, [path]: !prev[path] }));
    };

    const profileName = role === 'admin' ? 'Admin' : (subeSlug || 'Şube');
    const profileEmail = user?.email || '';
    const profileInitials = profileName
        .split(/[\s-_]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0].toUpperCase())
        .join('');

    return (
        <aside className="sidebar">
            <div className="sidebar__branding">
                <div className="sidebar__logo">SK</div>
                <span className="sidebar__app-name">Sütlüce Kadayıf</span>
            </div>

            <div className="sidebar__user-section" ref={userMenuRef}>
                <div
                    className={`sidebar__profile-card${showUserMenu ? ' sidebar__profile-card--active' : ''}`}
                    onClick={() => setShowUserMenu((prev) => !prev)}
                    style={{ cursor: 'pointer' }}
                >
                    <div className="sidebar__profile-avatar-wrap">
                        <div className="sidebar__profile-avatar">{profileInitials || '?'}</div>
                        <span className="sidebar__profile-status" />
                    </div>
                    <div className="sidebar__profile-content">
                        <span className="sidebar__profile-name">{profileName}</span>
                        <span className="sidebar__profile-email">{profileEmail}</span>
                    </div>
                    <ChevronDown
                        size={14}
                        className={`sidebar__profile-chevron${showUserMenu ? ' sidebar__profile-chevron--open' : ''}`}
                    />
                </div>

                {showUserMenu && (
                    <div className="sidebar__user-menu">
                        <div className="sidebar__user-menu-label">
                            Rol: {role === 'admin' ? 'Yönetici' : 'Şube Sahibi'}
                        </div>
                        <div className="sidebar__user-menu-divider" />
                        <button
                            className="sidebar__user-menu-item sidebar__user-menu-item--danger"
                            onClick={handleLogout}
                        >
                            <LogOut size={15} />
                            Çıkış Yap
                        </button>
                    </div>
                )}
            </div>

            <nav className="sidebar__nav">
                {getNavGroups(can).map((group) => (
                    <div key={group.title} className="sidebar__group">
                        <p className="sidebar__group-title">{group.title}</p>
                        <div className="sidebar__group-links">
                            {group.items.map((item) => {
                                if (item.children) {
                                    const isExpanded = expandedItems[item.path];
                                    const isActive = location.pathname.startsWith(item.path);
                                    return (
                                        <div key={item.path} className="sidebar__expandable">
                                            <button
                                                className={`sidebar__link sidebar__link--parent ${isActive ? 'sidebar__link--active' : ''}`}
                                                onClick={() => toggleExpand(item.path)}
                                            >
                                                {createElement(item.icon, { size: 18 })}
                                                <span>{item.label}</span>
                                                <ChevronRight
                                                    size={14}
                                                    className={`sidebar__expand-icon ${isExpanded ? 'sidebar__expand-icon--open' : ''}`}
                                                />
                                            </button>
                                            {isExpanded && (
                                                <div className="sidebar__sub-links">
                                                    {item.children.map((child) => (
                                                        <NavLink
                                                            key={child.path}
                                                            to={child.path}
                                                            end={child.end}
                                                            className={({ isActive }) =>
                                                                `sidebar__sub-link ${isActive ? 'sidebar__sub-link--active' : ''}`
                                                            }
                                                        >
                                                            {createElement(child.icon, { size: 15 })}
                                                            <span>{child.label}</span>
                                                        </NavLink>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                return (
                                    <NavLink
                                        key={item.path}
                                        to={item.path}
                                        end={item.end}
                                        className={({ isActive }) =>
                                            `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
                                        }
                                    >
                                        {createElement(item.icon, { size: 18 })}
                                        <span>{item.label}</span>
                                    </NavLink>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            <div className="sidebar__footer">
                <button className="sidebar__logout" onClick={handleLogout}>
                    <LogOut size={20} />
                    <span>Çıkış Yap</span>
                </button>
            </div>
        </aside>
    );
}
