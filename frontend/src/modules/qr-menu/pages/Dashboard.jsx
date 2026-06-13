import { useState, useEffect, lazy, Suspense } from 'react';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, UserCircle, QrCode, Sparkles, Layers, Image as ImageIcon, ClipboardList, ArrowUpRight, Map as MapIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

// MapLibre ağır bir paket — yalnızca harita gösterilince yüklensin (kod bölme)
const BranchMap = lazy(() => import('../components/BranchMap'));

export default function Dashboard() {
    const { subeSlug, role } = useAuth();
    const [konumlar, setKonumlar] = useState([]);
    // Harita admin (tüm şubeler) ve şube sahibi (kendi şubesi) için gösterilir
    const haritaGoster = role === 'admin' || role === 'sube_sahibi';
    // Yalnızca konumu (il) atanmış şubeler haritada görünür — çip de onları sayar
    const konumluSubeler = konumlar.filter((k) => k.il);
    const subeSayisi = konumluSubeler.length;
    const ilSayisi = new Set(konumluSubeler.map((k) => k.il)).size;

    // Konumları hafif endpoint'ten çek (admin: tümü, sube_sahibi: kendi şubesi)
    useEffect(() => {
        if (!haritaGoster) return;
        api.get('/branches/konumlar')
            .then(({ data }) => setKonumlar(data.konumlar || []))
            .catch(() => {});
    }, [haritaGoster]);

    return (
        <div className="space-y-6">
            {/* Sayfa Başlığı */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ana Menü</p>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground" style={{ fontFamily: 'Montserrat, sans-serif' }}>Genel Bakış</h1>
                </div>
                <div className="flex items-center gap-1.5 bg-muted/60 border px-3 py-1.5 rounded-xl text-xs font-medium text-muted-foreground">
                    <Sparkles className="size-3.5 text-yellow-600 dark:text-[#d8c7a3]" />
                    <span>Sistem Çevrimiçi</span>
                </div>
            </div>

            {/* Şube Haritası — tam genişlik, selamlama üstte overlay */}
            {haritaGoster ? (
                <div className="relative h-[520px] overflow-hidden rounded-3xl border">
                    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Harita yükleniyor…</div>}>
                        <BranchMap
                            branches={konumlar}
                            focusIl={role === 'sube_sahibi' ? (konumlar[0]?.il || null) : null}
                            focusCoord={role === 'sube_sahibi' && Number.isFinite(konumlar[0]?.lat) && Number.isFinite(konumlar[0]?.lng)
                                ? [konumlar[0].lng, konumlar[0].lat]
                                : null}
                            className="absolute inset-0 h-full w-full"
                            showFooter={false}
                        />
                    </Suspense>

                    {/* Selamlama overlay — haritanın üstünde */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-background/95 via-background/70 to-transparent p-5 md:p-7">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {role === 'admin' ? 'Şube Ağı' : 'Şubeniz'}
                        </p>
                        <h2 className="mt-1 text-2xl font-light leading-tight tracking-tight text-foreground md:text-3xl" style={{ fontFamily: 'Marcellus, serif' }}>
                            Merhaba, <span className="font-bold text-[#084529] dark:text-[#d8c7a3]">{role === 'admin' ? 'Yönetici' : (subeSlug || 'Şube Yetkilisi')}</span> 👋
                        </h2>
                        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border bg-background/85 px-3 py-1 text-xs font-medium text-foreground backdrop-blur">
                            <MapIcon className="size-3.5 text-[#084529] dark:text-[#d8c7a3]" />
                            {role === 'admin'
                                ? `${ilSayisi} il · ${subeSayisi} şube`
                                : (konumlar[0]?.il
                                    ? `${konumlar[0].il}${konumlar[0].ilce ? ' · ' + konumlar[0].ilce : ''}`
                                    : 'Konum atanmadı')}
                        </span>
                    </div>
                </div>
            ) : (
                <div className="rounded-3xl border bg-gradient-to-br from-[#084529] via-[#05321d] to-[#021b0f] p-6 text-[#F6F1E7] md:p-8">
                    <h2 className="text-3xl font-light leading-tight tracking-tight" style={{ fontFamily: 'Marcellus, serif' }}>
                        Merhaba, <span className="font-bold text-[#d8c7a3]">{subeSlug || 'Şube Yetkilisi'}</span> 👋
                    </h2>
                </div>
            )}

            {/* Metrik Kartlar Grubu */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Card className="bg-linear-to-t from-primary/5 to-card transition-all hover:border-muted-foreground/30 rounded-2xl">
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aktif Şube</p>
                            <CardTitle className="text-xl font-bold tracking-tight text-foreground mt-1">
                                {subeSlug ? (subeSlug.charAt(0).toUpperCase() + subeSlug.slice(1)) : 'Tüm Şubeler'}
                            </CardTitle>
                        </div>
                        <div className="flex size-9 items-center justify-center rounded-xl border bg-muted text-[#084529] dark:text-[#d8c7a3]">
                            <Building2 className="size-4.5" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Bağlantı Aktif
                        </span>
                    </CardContent>
                </Card>

                <Card className="bg-linear-to-t from-primary/5 to-card transition-all hover:border-muted-foreground/30 rounded-2xl">
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Yönetim Rolü</p>
                            <CardTitle className="text-xl font-bold tracking-tight text-foreground mt-1">
                                {role === 'admin' ? 'Genel Yönetici' : 'Şube Yetkilisi'}
                            </CardTitle>
                        </div>
                        <div className="flex size-9 items-center justify-center rounded-xl border bg-muted text-[#084529] dark:text-[#d8c7a3]">
                            <UserCircle className="size-4.5" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
                            {role === 'admin' ? 'Tam Yetkili Erişim' : 'Sınırlı Şube Erişimi'}
                        </span>
                    </CardContent>
                </Card>

                <Card className="bg-linear-to-t from-primary/5 to-card transition-all hover:border-muted-foreground/30 rounded-2xl">
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Müşteri Arayüzü</p>
                            <CardTitle className="text-xl font-bold tracking-tight text-[#084529] dark:text-[#d8c7a3] mt-1">
                                QR Menüyü Önizle
                            </CardTitle>
                        </div>
                        <div className="flex size-9 items-center justify-center rounded-xl border bg-muted text-[#084529] dark:text-[#d8c7a3]">
                            <QrCode className="size-4.5" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <a
                            href={subeSlug ? `/${subeSlug}` : '/'}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-[#084529]/10 hover:bg-[#084529]/15 text-[#084529] dark:bg-[#d8c7a3]/10 dark:hover:bg-[#d8c7a3]/15 dark:text-[#d8c7a3] px-3 py-1 text-xs font-bold transition-all group"
                        >
                            Menüyü Aç
                            <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </a>
                    </CardContent>
                </Card>
            </div>

            {/* Hızlı Eylemler Panel Kartı */}
            <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground px-1">Hızlı Eylemler</h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Link to="/admin/qr-menu" className="group">
                        <Card className="h-full bg-card hover:bg-muted/40 transition-all hover:border-[#084529]/30 rounded-2xl cursor-pointer">
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-3">
                                    <div className="flex size-8 items-center justify-center rounded-lg bg-[#084529]/10 text-[#084529] dark:bg-[#d8c7a3]/10 dark:text-[#d8c7a3]">
                                        <Layers className="size-4" />
                                    </div>
                                    <CardTitle className="text-sm font-semibold text-foreground group-hover:text-[#084529] dark:group-hover:text-[#d8c7a3] transition-colors">Menü & Ürünler</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-xs text-muted-foreground leading-normal">Kategorileri düzenleyin, ürün ekleyin, fiyatları ve stok durumlarını kontrol edin.</p>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link to="/admin/medya" className="group">
                        <Card className="h-full bg-card hover:bg-muted/40 transition-all hover:border-[#084529]/30 rounded-2xl cursor-pointer">
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-3">
                                    <div className="flex size-8 items-center justify-center rounded-lg bg-[#084529]/10 text-[#084529] dark:bg-[#d8c7a3]/10 dark:text-[#d8c7a3]">
                                        <ImageIcon className="size-4" />
                                    </div>
                                    <CardTitle className="text-sm font-semibold text-foreground group-hover:text-[#084529] dark:group-hover:text-[#d8c7a3] transition-colors">Medya Galerisi</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-xs text-muted-foreground leading-normal">Ürün tatlı görsellerini merkezi kütüphaneye yükleyin ve şubeler arası paylaşın.</p>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link to="/admin/raporlar" className="group">
                        <Card className="h-full bg-card hover:bg-muted/40 transition-all hover:border-[#084529]/30 rounded-2xl cursor-pointer">
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-3">
                                    <div className="flex size-8 items-center justify-center rounded-lg bg-[#084529]/10 text-[#084529] dark:bg-[#d8c7a3]/10 dark:text-[#d8c7a3]">
                                        <ClipboardList className="size-4" />
                                    </div>
                                    <CardTitle className="text-sm font-semibold text-[#084529] dark:text-[#d8c7a3] transition-colors">Raporlar & Analizler</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-xs text-muted-foreground leading-normal">Şubelerinizin QR kod okutma oranlarını ve popüler ürünleri inceleyin.</p>
                            </CardContent>
                        </Card>
                    </Link>
                </div>
            </div>
        </div>
    );
}
