import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './shared/components/Toast';
import ProtectedRoute from './shared/components/ProtectedRoute';
import Layout from './shared/components/Layout';
import MenuPage from './modules/qr-menu/pages/MenuPage';
import LoginPage from './modules/qr-menu/pages/LoginPage';
import ProductsPage from './modules/qr-menu/pages/ProductsPage';
import Dashboard from './modules/qr-menu/pages/Dashboard';
import UsersPage from './modules/qr-menu/pages/UsersPage';
import BranchesPage from './modules/qr-menu/pages/BranchesPage';
import CategoriesPage from './modules/qr-menu/pages/CategoriesPage';
import PhotoLibraryPage from './modules/qr-menu/pages/PhotoLibraryPage';
import AcademyDashboard from './modules/academy/pages/AcademyDashboard';
import AcademyAdmin from './modules/academy/pages/AcademyAdmin';
import CourseDetail from './modules/academy/pages/CourseDetail';
import ReportsPage from './modules/reports/pages/ReportsPage';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Şube Sahibi Giriş */}
          <Route path="/giris" element={<LoginPage />} />

          {/* Korumalı Admin Bölümü — Sidebar Layout */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/admin" element={<Dashboard />} />
            <Route path="/admin/raporlar" element={<ReportsPage />} />
            <Route path="/admin/qr-menu" element={<ProductsPage />} />
            <Route path="/admin/kullanicilar" element={<UsersPage />} />
            <Route path="/admin/subeler" element={<BranchesPage />} />
            <Route path="/admin/qr-menu/kategoriler" element={<CategoriesPage />} />
            <Route path="/admin/medya" element={<PhotoLibraryPage />} />
            <Route path="/admin/akademi" element={<AcademyDashboard />} />
            <Route path="/admin/akademi/kurs/:courseId" element={<CourseDetail />} />
            <Route path="/admin/akademi/yonetim" element={<AcademyAdmin />} />
          </Route>

          {/* Müşteri Menü Sayfası - QR ile açılır */}
          <Route path="/:subeSlug" element={<MenuPage />} />

          {/* Ana sayfa */}
          <Route
            path="/"
            element={
              <div className="menu-landing">
                <div className="menu-landing__content">
                  <div className="menu-landing__icon">🍮</div>
                  <h2>Sütlüce Kadayıf</h2>
                  <p>
                    Menüyü görmek için QR kodu taratın
                    <br />
                    veya <a href="/giris">giriş yapın</a>
                  </p>
                </div>
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
