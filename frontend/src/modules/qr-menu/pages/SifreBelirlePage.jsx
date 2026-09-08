import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../supabase';
import { Lock, Eye, EyeOff, TriangleAlert, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/**
 * Şifre sıfırlama bağlantısının açtığı sayfa.
 *
 * AKIŞ: giriş ekranından istek → Supabase e-posta gönderir → bağlantı buraya
 * döner ve oturumu URL parçasında taşır (#access_token…&type=recovery).
 * `detectSessionInUrl: true` (bkz. src/supabase.js) sayesinde kütüphane bunu
 * çözüp geçici bir oturum kuruyor; biz yalnızca yeni parolayı yazıyoruz.
 *
 * OTURUM BEKLENİYOR: sayfa açıldığı anda oturum HENÜZ kurulmamış olabilir
 * (kütüphane hash'i asenkron işliyor). Bu yüzden önce onAuthStateChange
 * dinleniyor, sonra kısa bir süre sonunda hâlâ oturum yoksa bağlantı geçersiz
 * sayılıyor — aksi hâlde geçerli bağlantıda bile "süresi dolmuş" yazardı.
 *
 * E-POSTA GÖNDERİMİ Supabase'in SMTP ayarına bağlı. Resend proje SMTP'si
 * olarak tanımlandığında bu akışta değişecek bir şey yok; Supabase panelinde
 * dönüş adresi (Authentication → URL Configuration → Redirect URLs) bu
 * sayfanın adresini içermeli.
 */
const ASGARI_UZUNLUK = 8;

export default function SifreBelirlePage() {
    const navigate = useNavigate();
    const [durum, setDurum] = useState('bekliyor');   // bekliyor | hazir | gecersiz | tamam
    const [sifre, setSifre] = useState('');
    const [tekrar, setTekrar] = useState('');
    const [goster, setGoster] = useState(false);
    const [hata, setHata] = useState('');
    const [kaydediliyor, setKaydediliyor] = useState(false);

    useEffect(() => {
        let bitti = false;
        const bitir = (d) => { if (!bitti) { bitti = true; setDurum(d); } };

        // KURTARMA BAĞLANTISI ŞART: yalnızca "oturum var mı" diye bakmak
        // yetmez — panelde açık oturumu olan biri bu adrese girdiğinde de
        // oturum bulunur ve sayfa ona sebepsiz bir "yeni şifre belirle"
        // formu açardı. Bağlantının izi URL parçasında (type=recovery);
        // kütüphane hash'i tükettiği için mount anında yakalanıyor.
        const kurtarmaBaglantisi = window.location.hash.includes('type=recovery');

        const { data: { subscription } } = supabase.auth.onAuthStateChange((olay, session) => {
            if (olay === 'PASSWORD_RECOVERY' || (kurtarmaBaglantisi && session)) bitir('hazir');
        });

        if (!kurtarmaBaglantisi) {
            bitir('gecersiz');
        } else {
            // Hash sayfa çizilmeden işlenmiş olabilir; olay kaçmışsa oturumu sor.
            supabase.auth.getSession().then(({ data: { session } }) => {
                if (session) bitir('hazir');
            });
        }

        const zamanAsimi = setTimeout(() => bitir('gecersiz'), 2500);

        return () => { subscription.unsubscribe(); clearTimeout(zamanAsimi); };
    }, []);

    async function kaydet(e) {
        e.preventDefault();
        setHata('');
        if (sifre.length < ASGARI_UZUNLUK) {
            return setHata(`Şifre en az ${ASGARI_UZUNLUK} karakter olmalı.`);
        }
        if (sifre !== tekrar) return setHata('Şifreler birbiriyle eşleşmiyor.');

        setKaydediliyor(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: sifre });
            if (error) throw error;
            setDurum('tamam');
            // Kurtarma oturumu zaten geçerli bir oturum: kullanıcıyı tekrar
            // giriş ekranına yollamak gereksiz, doğrudan panele alıyoruz.
            setTimeout(() => navigate('/admin'), 1500);
        } catch (err) {
            console.error('Şifre belirlenemedi:', err);
            setHata(err.message?.includes('should be at least')
                ? `Şifre en az ${ASGARI_UZUNLUK} karakter olmalı.`
                : 'Şifre kaydedilemedi. Bağlantının süresi dolmuş olabilir.');
        }
        setKaydediliyor(false);
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#F6F1E7] px-6 py-10 dark:bg-neutral-950">
            <div className="w-full max-w-[400px]">
                <img
                    src="/Varlik-1.png"
                    alt="Sütlüce Kadayıf"
                    className="mb-8 h-12 w-auto dark:brightness-0 dark:invert"
                />

                {durum === 'bekliyor' && (
                    <div className="flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-400">
                        <Spinner className="size-5" /> Bağlantı doğrulanıyor…
                    </div>
                )}

                {durum === 'gecersiz' && (
                    <>
                        <h1 className="text-2xl text-[#084529] dark:text-[#d8c7a3]" style={{ fontFamily: 'Marcellus, serif' }}>
                            Bağlantı geçersiz
                        </h1>
                        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                            Şifre sıfırlama bağlantısının süresi dolmuş ya da daha önce kullanılmış.
                            Giriş ekranından yeni bir bağlantı isteyebilirsiniz.
                        </p>
                        <Button
                            onClick={() => navigate('/giris')}
                            className="mt-6 h-11 w-full rounded-xl bg-[#084529] text-[#F6F1E7] hover:bg-[#0c5936]"
                        >
                            Giriş ekranına dön
                        </Button>
                    </>
                )}

                {durum === 'tamam' && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-[#084529]/20 bg-[#084529]/[0.04] px-3.5 py-3 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#084529] dark:text-[#d8c7a3]" />
                        <p>Şifreniz güncellendi. Panele yönlendiriliyorsunuz…</p>
                    </div>
                )}

                {durum === 'hazir' && (
                    <>
                        <h1 className="text-3xl text-[#084529] dark:text-[#d8c7a3]" style={{ fontFamily: 'Marcellus, serif' }}>
                            Yeni şifre belirleyin
                        </h1>
                        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                            En az {ASGARI_UZUNLUK} karakter olmalı.
                        </p>

                        <form onSubmit={kaydet} className="mt-8 space-y-4">
                            {hata && (
                                <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs font-medium text-destructive">
                                    <TriangleAlert className="mt-px size-3.5 shrink-0" />
                                    <span>{hata}</span>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <Label htmlFor="yeni-sifre" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                                    Yeni şifre
                                </Label>
                                <div className="relative">
                                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
                                    <Input
                                        id="yeni-sifre"
                                        type={goster ? 'text' : 'password'}
                                        value={sifre}
                                        onChange={(e) => setSifre(e.target.value)}
                                        autoComplete="new-password"
                                        required
                                        className="h-11 rounded-xl border-neutral-300 bg-white pl-9 pr-10 text-sm shadow-sm focus-visible:border-[#084529] focus-visible:ring-2 focus-visible:ring-[#084529]/15 dark:border-neutral-800 dark:bg-neutral-900"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setGoster(!goster)}
                                        tabIndex={-1}
                                        aria-label={goster ? 'Şifreyi gizle' : 'Şifreyi göster'}
                                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                                    >
                                        {goster ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="yeni-sifre-tekrar" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                                    Yeni şifre (tekrar)
                                </Label>
                                <div className="relative">
                                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
                                    <Input
                                        id="yeni-sifre-tekrar"
                                        type={goster ? 'text' : 'password'}
                                        value={tekrar}
                                        onChange={(e) => setTekrar(e.target.value)}
                                        autoComplete="new-password"
                                        required
                                        className="h-11 rounded-xl border-neutral-300 bg-white pl-9 text-sm shadow-sm focus-visible:border-[#084529] focus-visible:ring-2 focus-visible:ring-[#084529]/15 dark:border-neutral-800 dark:bg-neutral-900"
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={kaydediliyor}
                                className="h-11 w-full rounded-xl bg-[#084529] text-[#F6F1E7] shadow-lg shadow-[#084529]/20 transition-all hover:bg-[#0c5936] active:scale-[0.99] disabled:opacity-70"
                            >
                                {kaydediliyor ? <><Spinner className="size-4" /> Kaydediliyor…</> : 'Şifreyi kaydet'}
                            </Button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}
