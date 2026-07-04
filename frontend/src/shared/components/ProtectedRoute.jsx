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
 * @param {string} [props.role] — Opsiyonel rol kısıtı (ör: 'admin')
 */
export default function ProtectedRoute({ children, permission, role: requiredRole }) {
    const { user, loading, can, role } = useAuth();

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

    if ((requiredRole && role !== requiredRole) || (permission && !can(permission))) {
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
