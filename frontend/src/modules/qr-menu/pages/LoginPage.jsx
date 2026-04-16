import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(email, password);
            navigate('/admin');
        } catch (err) {
            console.error('Giriş hatası:', err);
            if (
                err.code === 'auth/user-not-found' ||
                err.code === 'auth/wrong-password' ||
                err.code === 'auth/invalid-credential'
            ) {
                setError('E-posta veya şifre hatalı');
            } else if (err.code === 'auth/too-many-requests') {
                setError('Çok fazla deneme. Lütfen biraz bekleyin.');
            } else {
                setError('Giriş yapılamadı. Tekrar deneyin.');
            }
        }
        setLoading(false);
    }

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-card__header">
                    <div className="auth-card__logo">🍮</div>
                    <h1 className="auth-card__title">Sütlüce Kadayıf</h1>
                    <p className="auth-card__subtitle">Şube yönetim paneline giriş yapın</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && <div className="form-error">{error}</div>}

                    <div className="form-group">
                        <label className="form-label">
                            <Mail size={16} />
                            E-posta
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="sube@sutlucekadayif.com"
                            className="form-input"
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">
                            <Lock size={16} />
                            Şifre
                        </label>
                        <div className="form-input-wrapper">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="form-input"
                                required
                                autoComplete="current-password"
                            />
                            <button
                                type="button"
                                className="form-input-toggle"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    <button type="submit" className="btn btn--primary btn--full" disabled={loading}>
                        {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
                    </button>
                </form>

                <p className="auth-card__footer">Sütlüce Kadayıf Şube Yönetim Sistemi</p>
            </div>
        </div>
    );
}
