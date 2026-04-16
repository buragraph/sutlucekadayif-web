import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';

/**
 * Korumalı route bileşeni.
 * Giriş yapılmamışsa /login'e yönlendirir.
 * Opsiyonel yetki kontrolü yapabilir.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children — Korunan içerik
 * @param {string} [props.permission] — Opsiyonel yetki key'i
 */
export default function ProtectedRoute({ children, permission }) {
    const { user, loading, can } = useAuth();

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner" />
                <p className="loading-text">Yükleniyor...</p>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/giris" replace />;
    }

    if (permission && !can(permission)) {
        return (
            <div className="loading-container">
                <div className="empty-state">
                    <div className="icon">🔒</div>
                    <p>Bu sayfayı görüntüleme yetkiniz yok</p>
                </div>
            </div>
        );
    }

    return children;
}
