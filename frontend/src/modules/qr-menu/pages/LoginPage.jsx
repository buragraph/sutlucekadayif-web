import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../services/api';
import { Mail, Lock, Eye, EyeOff, Sparkles, Layers, Image as ImageIcon, UtensilsCrossed, ArrowRight, TriangleAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

// Marka paleti tek yerde: sayfa boyunca on beş kez tekrar eden hex'ler
// birbirinden kayıyordu (#084529 / #0c5936 / #042a18 elle yazılıyordu).
// Marka: yeşil #084529, krem #F6F1E7, altın #d8c7a3. Tailwind köşeli parantez
// değeri değişken kabul etmediği için sınıflarda hex'in kendisi yazılıyor.
const YIL = new Date().getFullYear();   // render sırasında saat okumak saf değil

const OZELLIKLER = [
    {
        Ikon: UtensilsCrossed,
        baslik: 'Hızlı menü ve fiyat yönetimi',
        metin: 'Ürünlerinizi, fiyatlarınızı ve kategorilerinizi saniyeler içinde güncelleyin, QR menüde anında yayınlayın.',
    },
    {
        Ikon: Layers,
        baslik: 'Çoklu şube koordinasyonu',
        metin: 'Her şubenin menüsünü, satıştaki ürünlerini ve kendi fiyatlarını bağımsız yönetin.',
    },
    {
        Ikon: ImageIcon,
        baslik: 'Merkezi medya kütüphanesi',
        metin: 'Görselleri bir kez yükleyin, dilediğiniz şubede ve kategoride yeniden kullanın.',
    },
];

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    /**
     * İLK GİRİŞ: hesaplar parolasız açılıyor; kişinin ilk yazdığı parola kalıcı
     * oluyor. Supabase parolasız hesapta da "invalid_credentials" döndüğü için
     * "parola yanlış" ile "parola henüz kurulmamış" istemciden ayırt edilemez —
     * bu yüzden başarısız girişte bir kez /parola/belirle denenir, tutarsa aynı
     * bilgilerle giriş tekrarlanır. Tutmazsa kullanıcı farkı görmez.
     */
    async function ilkGirisDene() {
        await api.post('/parola/belirle', { email: email.trim(), password });
        await login(email, password);
    }

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
                try {
                    await ilkGirisDene();
                    navigate('/admin');
                    return;
                } catch (belirleHatasi) {
                    const durum = belirleHatasi.response?.status;
                    const mesaj = belirleHatasi.response?.data?.error || '';
                    // Parola uzunluğu hatası girdiye dairdir, aynen gösterilir.
                    // Diğer her durumda hesabın var olup olmadığını sızdırmamak
                    // için tek tip mesaj.
                    if (durum === 429) setError('Çok fazla deneme. Lütfen biraz bekleyin.');
                    else if (durum === 400 && mesaj.includes('karakter')) setError(mesaj);
                    else setError('E-posta veya şifre hatalı');
                }
            } else if (err.status === 429) {
                setError('Çok fazla deneme. Lütfen biraz bekleyin.');
            } else {
                setError('Giriş yapılamadı. Tekrar deneyin.');
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="grid min-h-screen w-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            {/* ─────────── SOL: giriş formu ───────────
                Zemin krem (menü sayfasıyla aynı ton): eski gri `bg-muted/30`
                sağdaki koyu yeşille aynı markadan değilmiş gibi duruyordu.
                Karanlık modda krem gözü yakacağı için nötr koyu zemine düşer. */}
            <div className="relative flex flex-col justify-center bg-[#F6F1E7] px-6 py-10 dark:bg-neutral-950 sm:px-10 lg:px-14">
                {/* Sıcak ışık lekesi — düz krem alan çok yayvan duruyordu */}
                <div className="pointer-events-none absolute -left-24 top-1/4 size-96 rounded-full bg-[#084529]/[0.06] blur-3xl dark:bg-[#084529]/20" />

                <div className="relative mx-auto w-full max-w-[400px]">
                    {/* Logo METİN DEĞİL görsel: markanın el yazısı işareti
                        Montserrat başlıkla temsil edilemiyordu. Koyu konturlu
                        olduğu için açık zemine ait — sağ paneldeki koyu yeşile
                        konulmuyor. */}
                    <img
                        src="/Varlik-1.png"
                        alt="Sütlüce Kadayıf"
                        className="mb-8 h-14 w-auto dark:brightness-0 dark:invert"
                    />

                    <h1
                        className="text-3xl leading-tight tracking-tight text-[#084529] dark:text-[#d8c7a3]"
                        style={{ fontFamily: 'Marcellus, serif' }}
                    >
                        Hoş geldiniz
                    </h1>
                    <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                        Şube yönetim paneline giriş yapın.
                    </p>

                    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                        {error && (
                            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs font-medium text-destructive">
                                <TriangleAlert className="mt-px size-3.5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label htmlFor="email" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                                E-posta adresi
                            </Label>
                            {/* İkon alanın İÇİNDE: etiketin yanındayken iki ayrı
                                hizada iki küçük ikon vardı, satır kalabalıktı. */}
                            <div className="relative">
                                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="sube@sutlucekadayif.com"
                                    required
                                    autoComplete="email"
                                    className="h-11 rounded-xl border-neutral-300 bg-white pl-9 text-sm shadow-sm focus-visible:border-[#084529] focus-visible:ring-2 focus-visible:ring-[#084529]/15 dark:border-neutral-800 dark:bg-neutral-900"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="password" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                                Şifre
                            </Label>
                            <div className="relative">
                                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    autoComplete="current-password"
                                    className="h-11 rounded-xl border-neutral-300 bg-white pl-9 pr-10 text-sm shadow-sm focus-visible:border-[#084529] focus-visible:ring-2 focus-visible:ring-[#084529]/15 dark:border-neutral-800 dark:bg-neutral-900"
                                />
                                <button
                                    type="button"
                                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
                                    onClick={() => setShowPassword(!showPassword)}
                                    tabIndex={-1}
                                    aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                                >
                                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                </button>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={loading}
                            className="group h-11 w-full rounded-xl bg-[#084529] text-[#F6F1E7] shadow-lg shadow-[#084529]/20 transition-all hover:bg-[#0c5936] hover:shadow-[#084529]/30 active:scale-[0.99] disabled:opacity-70"
                        >
                            {loading ? (
                                <><Spinner className="size-4" /> Giriş yapılıyor…</>
                            ) : (
                                <>Giriş Yap <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></>
                            )}
                        </Button>
                    </form>

                    {/* İLK GİRİŞ kuralı burada yazılı: hesaplar parolasız
                        açılıyor ve kişi ilk yazdığı parolayı kalıcı yapıyor.
                        Kimse bunu bilmiyorsa "parolam yok" diye merkezi arıyor. */}
                    <p className="mt-6 rounded-xl border border-[#084529]/15 bg-[#084529]/[0.04] px-3 py-2.5 text-[11px] leading-relaxed text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
                        <strong className="font-semibold text-[#084529] dark:text-[#d8c7a3]">İlk kez giriyorsanız:</strong>{' '}
                        şifre alanına belirlediğiniz şifreyi yazın — o şifre hesabınıza kaydedilir.
                    </p>

                    <p className="mt-8 text-center text-[11px] text-neutral-400">
                        Sütlüce Kadayıf Şube Yönetim Sistemi · v2.0
                    </p>
                </div>
            </div>

            {/* ─────────── SAĞ: marka paneli (yalnızca masaüstü) ───────────
                Mobilde gizli: telefonda ekranın tamamı forma ait olmalı. */}
            <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#0a5230] via-[#042a18] to-[#01140b] p-12 text-[#F6F1E7] lg:flex lg:flex-col lg:justify-between">
                <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-emerald-400/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-[#d8c7a3]/10 blur-3xl" />

                <div className="relative z-10 flex items-center gap-2.5">
                    <div className="rounded-xl border border-white/10 bg-white/10 p-2 backdrop-blur-md">
                        <Sparkles className="size-5 text-[#d8c7a3]" />
                    </div>
                    <div className="leading-tight">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d8c7a3]/80">Dijital Portal</span>
                        <h2 className="text-sm font-bold tracking-wide">SÜTLÜCE KADAYIF</h2>
                    </div>
                </div>

                <div className="relative z-10 my-auto max-w-[520px] py-10">
                    <h3
                        className="text-4xl leading-[1.15] tracking-tight xl:text-5xl"
                        style={{ fontFamily: 'Marcellus, serif' }}
                    >
                        Geleneksel lezzet,
                        <br />
                        <span className="text-[#d8c7a3]">dijital deneyim.</span>
                    </h3>
                    <p className="mt-5 text-sm leading-relaxed text-[#F6F1E7]/70">
                        Menünüzü, görsellerinizi ve şube eğitimlerinizi tek bir noktadan yönetin.
                    </p>

                    {/* Kutulu kartlar yerine ince çizgili liste: üç ayrı cam
                        panel sayfayı ağırlaştırıyor, başlıkla yarışıyordu. */}
                    <ul className="mt-10 space-y-px">
                        {OZELLIKLER.map((o) => (
                            <li key={o.baslik} className="flex items-start gap-4 border-t border-white/10 py-5 last:border-b">
                                <o.Ikon className="mt-0.5 size-5 shrink-0 text-[#d8c7a3]" />
                                <div>
                                    <h4 className="text-sm font-semibold">{o.baslik}</h4>
                                    <p className="mt-1 text-xs leading-relaxed text-[#F6F1E7]/60">{o.metin}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="relative z-10 flex items-center justify-between text-[11px] text-[#F6F1E7]/50">
                    <p>© {YIL} Sütlüce Kadayıf</p>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">Sürüm 2.0</span>
                </div>
            </div>
        </div>
    );
}
