import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { Mail, Lock, Eye, EyeOff, CakeSlice, Sparkles, Layers, Image as ImageIcon, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
            if (err.code === 'invalid_credentials' || err.status === 400) {
                setError('E-posta veya şifre hatalı');
            } else if (err.status === 429) {
                setError('Çok fazla deneme. Lütfen biraz bekleyin.');
            } else {
                setError('Giriş yapılamadı. Tekrar deneyin.');
            }
        }
        setLoading(false);
    }

    return (
        <div className="grid min-h-screen w-full lg:grid-cols-2">
            {/* SOL TARAF: Giriş Formu Bölümü */}
            <div className="flex items-center justify-center bg-muted/30 p-6 md:p-10">
                <Card className="w-full max-w-[420px] border-none bg-transparent shadow-none md:bg-card md:border md:shadow-lg md:p-4">
                    <CardHeader className="items-center space-y-3 pb-6">
                        <div className="flex items-center justify-center rounded-2xl bg-[#084529] p-3 text-[#F6F1E7] shadow-md shadow-[#084529]/10">
                            <CakeSlice className="size-6 animate-pulse" />
                        </div>
                        <div className="text-center space-y-1.5">
                            <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Montserrat, sans-serif' }}>Sütlüce Kadayıf</h1>
                            <p className="text-sm text-muted-foreground">Şube yönetim paneline güvenle giriş yapın</p>
                        </div>
                    </CardHeader>

                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <Alert variant="destructive" className="rounded-xl">
                                    <AlertDescription className="text-xs font-medium">{error}</AlertDescription>
                                </Alert>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="email" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    <Mail className="size-3.5" />
                                    E-posta Adresi
                                </Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="sube@sutlucekadayif.com"
                                    required
                                    autoComplete="email"
                                    className="h-10.5 rounded-xl border-muted-foreground/20 focus-visible:ring-1 focus-visible:ring-[#084529]/40 focus-visible:border-[#084529]"
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        <Lock className="size-3.5" />
                                        Şifre
                                    </Label>
                                </div>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        autoComplete="current-password"
                                        className="h-10.5 rounded-xl pr-10 border-muted-foreground/20 focus-visible:ring-1 focus-visible:ring-[#084529]/40 focus-visible:border-[#084529]"
                                    />
                                    <button
                                        type="button"
                                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                    </button>
                                </div>
                            </div>

                            <Button type="submit" className="w-full h-11 rounded-xl bg-[#084529] hover:bg-[#0c5936] text-[#F6F1E7] font-semibold transition-all shadow-md shadow-[#084529]/10 active:scale-[0.98]" disabled={loading}>
                                {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
                            </Button>
                        </form>
                    </CardContent>

                    <CardFooter className="justify-center border-t border-muted/50 mt-6 pt-4">
                        <p className="text-xs text-muted-foreground font-medium">Sütlüce Kadayıf Şube Yönetim Sistemi v2.0</p>
                    </CardFooter>
                </Card>
            </div>

            {/* SAĞ TARAF: Görsel ve Marka Tanıtım Bölümü (Masaüstü için) */}
            <div className="relative hidden order-2 h-full bg-gradient-to-br from-[#084529] via-[#042a18] to-[#01140b] lg:flex flex-col justify-between p-12 text-[#F6F1E7] overflow-hidden">
                {/* Glow Efektleri */}
                <div className="absolute -right-20 -top-20 size-80 rounded-full bg-emerald-500/10 blur-3xl" />
                <div className="absolute -left-20 -bottom-20 size-80 rounded-full bg-[#d8c7a3]/10 blur-3xl" />

                {/* Üst Bilgi / Logo */}
                <div className="relative z-10 flex items-center gap-2">
                    <div className="flex items-center justify-center rounded-xl bg-white/10 backdrop-blur-md p-2 border border-white/10">
                        <CakeSlice className="size-6 text-[#d8c7a3]" />
                    </div>
                    <div>
                        <span className="font-semibold tracking-wider text-xs uppercase text-[#d8c7a3]/80">Dijital Portal</span>
                        <h2 className="text-sm font-bold leading-none">SÜTLÜCE KADAYIF</h2>
                    </div>
                </div>

                {/* Ana İçerik */}
                <div className="relative z-10 space-y-8 my-auto">
                    <div className="space-y-4 max-w-[500px]">
                        <h1 className="text-4xl lg:text-5xl font-light tracking-tight leading-tight" style={{ fontFamily: 'Marcellus, serif' }}>
                            Geleneksel Lezzet, <br />
                            <span className="font-bold text-[#d8c7a3]">Dijital Deneyim.</span>
                        </h1>
                        <p className="text-sm text-[#F6F1E7]/70 leading-relaxed">
                            Müşterilerinize sunduğunuz benzersiz tatlı deneyimini dijitalleştirin. Bu panel ile tüm menünüzü, görsellerinizi ve şube eğitimlerinizi tek bir noktadan yönetebilirsiniz.
                        </p>
                    </div>

                    {/* Özellik Kartları */}
                    <div className="grid gap-4 max-w-[520px]">
                        <div className="flex items-start gap-3 rounded-2xl bg-white/5 backdrop-blur-sm p-4 border border-white/5 transition-all hover:bg-white/8">
                            <CheckCircle2 className="size-5 text-[#d8c7a3] shrink-0 mt-0.5" />
                            <div>
                                <h3 className="font-semibold text-sm">Hızlı Menü & Fiyat Yönetimi</h3>
                                <p className="text-xs text-[#F6F1E7]/60 mt-1">Ürünlerinizi, fiyatlarınızı ve kategorilerinizi saniyeler içinde güncelleyin ve QR menüde yayınlayın.</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 rounded-2xl bg-white/5 backdrop-blur-sm p-4 border border-white/5 transition-all hover:bg-white/8">
                            <Layers className="size-5 text-[#d8c7a3] shrink-0 mt-0.5" />
                            <div>
                                <h3 className="font-semibold text-sm">Çoklu Şube Koordinasyonu</h3>
                                <p className="text-xs text-[#F6F1E7]/60 mt-1">Şubelerinizin menü ayarlarını, aktif/pasif ürünlerini bağımsız ve güvenli bir şekilde yönetin.</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 rounded-2xl bg-white/5 backdrop-blur-sm p-4 border border-white/5 transition-all hover:bg-white/8">
                            <ImageIcon className="size-5 text-[#d8c7a3] shrink-0 mt-0.5" />
                            <div>
                                <h3 className="font-semibold text-sm">Merkezi Medya Kütüphanesi</h3>
                                <p className="text-xs text-[#F6F1E7]/60 mt-1">Görsellerinizi bir kere yükleyin, dilediğiniz şube ve kategoride anında yeniden kullanın.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Alt Bilgi */}
                <div className="relative z-10 flex justify-between items-center text-xs text-[#F6F1E7]/50 border-t border-white/10 pt-6">
                    <p>© 2026 Sütlüce Kadayıf. Tüm hakları saklıdır.</p>
                    <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                        <Sparkles className="size-3.5 text-[#d8c7a3]" />
                        <span>Sürüm 2.0</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
