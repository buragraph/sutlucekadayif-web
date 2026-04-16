import { useAuth } from '../../../context/AuthContext';

export default function Dashboard() {
    const { subeSlug, role } = useAuth();

    return (
        <div className="page-padding">
            <div className="page-header">
                <p className="page-header__crumb">Ana Menü</p>
                <h1 className="page-header__title">Genel Bakış</h1>
            </div>

            <div className="welcome-banner">
                <h2>Hoş geldiniz 👋</h2>
                <p>
                    {role === 'admin'
                        ? 'Tüm şubeleri bu panel üzerinden yönetebilirsiniz.'
                        : `${subeSlug || 'Şubeniz'} için menü ve ürün yönetimini buradan yapabilirsiniz.`}
                </p>
            </div>

            <div className="kpi-grid">
                <div className="kpi-card">
                    <p className="kpi-card__label">Şube</p>
                    <h3 className="kpi-card__value">{subeSlug || '—'}</h3>
                </div>
                <div className="kpi-card">
                    <p className="kpi-card__label">Rol</p>
                    <h3 className="kpi-card__value">
                        {role === 'admin' ? 'Yönetici' : 'Şube Sahibi'}
                    </h3>
                </div>
                <div className="kpi-card">
                    <p className="kpi-card__label">QR Menü</p>
                    <h3 className="kpi-card__value">
                        <a href={`/menu/${subeSlug}`} target="_blank" rel="noreferrer" className="kpi-link">
                            Menüyü Gör →
                        </a>
                    </h3>
                </div>
            </div>
        </div>
    );
}
