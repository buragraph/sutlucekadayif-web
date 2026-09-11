import { useState, useEffect, lazy, Suspense } from 'react';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Building2, UserCircle, QrCode, Layers, Image as ImageIcon, ClipboardList, ArrowUpRight, Map as MapIcon,
    UtensilsCrossed, Megaphone, GraduationCap, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { parcaYukle } from '../../../shared/utils/parca-yukle';
import DuyuruKartlari from '../components/DuyuruKartlari';
import SikayetUyarisi from '../components/SikayetUyarisi';
import SubeMetrikleri from '../components/SubeMetrikleri';
import BolgeKarti from '../components/BolgeKarti';

// MapLibre ağır bir paket — yalnızca harita gösterilince yüklensin (kod bölme).
// parcaYukle ŞART: yeni sürüm yayınlanınca eski hash'li parça sunucudan kalkıyor,
// açık sekme onu isteyince SPA yedeği index.html döndürüyor ("Expected a
// JavaScript-or-Wasm module script but the server responded with text/html").
// Çıplak lazy'de bu hata Suspense sınırını aşıp SAYFAYI KOMPLE BEYAZ bırakıyordu;
// sarmalayıcı hatayı tanıyıp sayfayı bir kez yeniliyor.
const BranchMap = lazy(() => parcaYukle(() => import('../components/BranchMap'), 'Harita'));

/**
 * Hızlı eylemler ROLE GÖRE. Şube sahibinin listesi eskiden merkezinkiyle
 * aynıydı: "Medya Galerisi" ona kapalı bir sayfaya gidiyor, "Menü & Ürünler"
 * açıklaması ise yetkisi olmayan işleri anlatıyordu (kategori düzenleme, ürün
 * ekleme merkezde). Metinler artık şubenin gerçekten yapabildiği işi anlatıyor.
 */
const SUBE_EYLEMLER = [
    {
        Ikon: UtensilsCrossed,
        baslik: 'Ürünler',
        metin: 'Şubenizde satılan ürünleri seçin, tükeneni kapatın, serbest fiyatlı ürünlerde fiyatınızı girin.',
        yol: '/admin/qr-menu',
    },
    {
        Ikon: Megaphone,
        baslik: 'Reklam',
        metin: 'Dönemsel reklam harcamanız, erişiminiz ve Google performansınız; bütçe kampanyası bildirimi.',
        yol: '/admin/reklam',
    },
    {
        Ikon: GraduationCap,
        baslik: 'Akademi',
        metin: 'Ürün hazırlama, servis ve hijyen eğitimlerini izleyin, sınavlarınızı tamamlayın.',
        yol: '/admin/akademi',
    },
    {
        Ikon: MessageSquare,
        baslik: 'Şikayet ve Geri Bildirim',
        metin: 'Müşteri şikayetlerini yanıtlayın; merkeze kendi şikayet ve talebinizi iletin.',
        yol: '/admin/geri-bildirim',
    },
    {
        Ikon: QrCode,
        baslik: 'QR Menünüz',
        metin: 'Müşterinizin telefonunda gördüğü menüyü yeni sekmede açın.',
        dis: true,   // hedef şubeye göre değişiyor, kartta kuruluyor
    },
    {
        Ikon: UserCircle,
        baslik: 'Profiliniz',
        metin: 'İletişim bilgilerinizi, fatura ve vergi bilgilerinizi güncelleyin.',
        yol: '/admin/profil',
    },
];

const ADMIN_EYLEMLER = [
    {
        Ikon: Layers,
        baslik: 'Menü & Ürünler',
        metin: 'Kategorileri düzenleyin, ürün ekleyin, fiyatları ve şube menülerini yönetin.',
        yol: '/admin/qr-menu',
    },
    {
        Ikon: ImageIcon,
        baslik: 'Medya Galerisi',
        metin: 'Ürün görsellerini merkezi kütüphaneye yükleyin, şubeler arasında paylaşın.',
        yol: '/admin/medya',
    },
    {
        Ikon: ClipboardList,
        baslik: 'Raporlar',
        metin: 'Şubelerin dönemsel reklam harcaması, erişimi ve Google metriklerini inceleyin.',
        yol: '/admin/raporlar',
    },
    {
        Ikon: MessageSquare,
        baslik: 'Şikayet ve Geri Bildirim',
        metin: 'Müşteri şikayetleri ve şubelerin merkeze ilettiği talepler tek masada.',
        yol: '/admin/geri-bildirim',
    },
];

export default function Dashboard() {
    const { subeSlug, role } = useAuth();
    const [konumlar, setKonumlar] = useState([]);
    const bugun = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    // Harita admin (tüm şubeler) ve şube sahibi (kendi şubesi) için gösterilir
    const haritaGoster = role === 'admin' || role === 'sube_sahibi';
    // Yalnızca konumu (il) atanmış şubeler haritada görünür — çip de onları sayar
    const konumluSubeler = konumlar.filter((k) => k.il);
    const subeSayisi = konumluSubeler.length;
    const ilSayisi = new Set(konumluSubeler.map((k) => k.il)).size;
    // Şube sahibi modunda (admin simülasyonu dahil) odaklanılacak şube: subeSlug'a eşleşen.
    // Admin simülasyonunda backend tüm şubeleri döndürür; bu yüzden konumlar[0] değil subeSlug eşleşmesi alınır.
    const kendiSube = role === 'sube_sahibi'
        ? (konumlar.find((k) => k.slug === subeSlug) || null)
        : null;
    // Haritaya verilecek şubeler: şube sahibi modunda yalnızca kendi şubesi
    const haritaSubeler = role === 'sube_sahibi' ? (kendiSube ? [kendiSube] : []) : konumlar;
    // Grafik alanı: şube sahibinde, yüklenirken VEYA veri varken ayrılır → harita ile
    // yan yana, baştan 2 sütun. Yüklenirken iskelet gösterilir, sıçrama olmaz.

    // Konumları hafif endpoint'ten çek (admin: tümü, sube_sahibi: kendi şubesi)
    useEffect(() => {
        if (!haritaGoster) return;
        api.get('/branches/konumlar')
            .then(({ data }) => setKonumlar(data.konumlar || []))
            .catch(() => {});
        // subeSlug bağımlılığı: kullanıcının şubesi değişince harita konumları tazelensin
    }, [haritaGoster, subeSlug]);

    return (
        <div className="flex flex-col gap-6">
            {/* Sayfa Başlığı — referans "Store Overview" stili */}
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl leading-none tracking-tight text-foreground">Genel Bakış</h1>
                <p className="text-sm text-muted-foreground">{bugun}</p>
            </div>

            {/* ÜST SATIR: harita + bölge paneli.
                Şube sahibinde harita 2 sütun, TÜİK/SEGE verisi yanında 1 sütun.
                Eskiden bölge bilgisi sayfanın altında dört kartlık ayrı bir
                şerittı; şube konumuyla ilgili olduğu için haritanın yanı doğru
                yeri. Admin'de bölge paneli yok (tek ilçe bilgisi ağ genelinde
                anlamsız), harita tam genişlik. */}
            <div className={role === 'sube_sahibi' ? 'grid gap-4 lg:grid-cols-3' : ''}>
                {haritaGoster ? (
                    <div className={`relative ${role === 'sube_sahibi' ? 'h-[380px] lg:col-span-2' : 'h-[440px]'} overflow-hidden rounded-3xl border`}>
                        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Harita yükleniyor…</div>}>
                            <BranchMap
                                branches={haritaSubeler}
                                focusIl={role === 'sube_sahibi' ? (kendiSube?.il || null) : null}
                                focusCoord={role === 'sube_sahibi' && Number.isFinite(kendiSube?.lat) && Number.isFinite(kendiSube?.lng)
                                    ? [kendiSube.lng, kendiSube.lat]
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
                                Merhaba, <span className="font-bold text-[#084529] dark:text-[#d8c7a3]">{role === 'admin' ? 'Yönetici' : (kendiSube?.ad || subeSlug || 'Şube Yetkilisi')}</span> 👋
                            </h2>
                            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border bg-background/85 px-3 py-1 text-xs font-medium text-foreground backdrop-blur">
                                <MapIcon className="size-3.5 text-[#084529] dark:text-[#d8c7a3]" />
                                {role === 'admin'
                                    ? `${ilSayisi} il · ${subeSayisi} şube`
                                    : (kendiSube?.il
                                        ? `${kendiSube.il}${kendiSube.ilce ? ' · ' + kendiSube.ilce : ''}`
                                        : 'Konum atanmadı')}
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-3xl border bg-gradient-to-br from-[#084529] via-[#05321d] to-[#021b0f] p-6 text-[#F6F1E7] md:p-8 lg:col-span-2">
                        <h2 className="text-3xl font-light leading-tight tracking-tight" style={{ fontFamily: 'Marcellus, serif' }}>
                            Merhaba, <span className="font-bold text-[#d8c7a3]">{subeSlug || 'Şube Yetkilisi'}</span> 👋
                        </h2>
                    </div>
                )}

                {role === 'sube_sahibi' && <BolgeKarti subeSlug={subeSlug} dikey />}
            </div>

            {/* Bekleyen şikayet uyarısı — ince bir şerit; bekleyen yoksa hiç çizmiyor. */}
            <SikayetUyarisi />

            {/* Son dönem rapor sayıları — yalnızca şube sahibinde. Admin'in
                dashboard'u şube ağı geneline bakıyor. */}
            {role === 'sube_sahibi' && <SubeMetrikleri subeSlug={subeSlug} />}

            {/* HARCAMA ÖZETİ GRAFİĞİ KALDIRILDI: dönemsel harcama zaten Reklam
                bölümünün konusu; panoda ayrıca durması hem tekrar hem de şube
                sahibinin ilk ekranını para konuşan bir grafikle açıyordu.
                (Grafiğin kendisi duruyor — HarcamaGrafik bileşeni Reklam
                sayfasında kullanılıyor.) */}
            <DuyuruKartlari />

            {/* ── Alt bölüm ROLE GÖRE ──
                Şube sahibinde eski "Aktif Şube / Yönetim Rolü / Müşteri Arayüzü"
                kartları kaldırıldı: ikisi bilgi vermiyordu (şube adı zaten
                haritanın üstünde, "Sınırlı Şube Erişimi" rozeti ise kullanıcıya
                ne yapabileceğini değil ne yapamayacağını söylüyordu). Hızlı
                eylemler de yanlıştı — "Medya Galerisi" şubeye kapalı bir sayfaya,
                "Kategorileri düzenleyin, ürün ekleyin" ise şubenin yetkisi
                olmayan işlere götürüyordu. */}
            {role === 'admin' && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <OzetKart
                        etiket="Kapsam"
                        baslik={kendiSube?.ad || (subeSlug ? subeSlug : 'Tüm Şubeler')}
                        Ikon={Building2}
                    >
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                            {subeSayisi} şube · {ilSayisi} il
                        </span>
                    </OzetKart>

                    <OzetKart etiket="Yönetim Rolü" baslik="Genel Yönetici" Ikon={UserCircle}>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
                            Tam Yetkili Erişim
                        </span>
                    </OzetKart>

                    <OzetKart etiket="Müşteri Arayüzü" baslik="QR Menüyü Önizle" Ikon={QrCode} vurgulu>
                        <a
                            href={subeSlug ? `/${subeSlug}` : '/'}
                            target="_blank"
                            rel="noreferrer"
                            className="group inline-flex items-center gap-1 rounded-lg bg-[#084529]/10 px-3 py-1 text-xs font-bold text-[#084529] transition-all hover:bg-[#084529]/15 dark:bg-[#d8c7a3]/10 dark:text-[#d8c7a3] dark:hover:bg-[#d8c7a3]/15"
                        >
                            Menüyü Aç
                            <ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </a>
                    </OzetKart>
                </div>
            )}

            <div className="space-y-3">
                <h3 className="px-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Hızlı Eylemler
                </h3>
                {/* Sütun sayısı öğe sayısına göre: şubede 6 kart (3+3),
                    merkezde 4 kart tek sırada. Tek başına sarkan kart kalmasın. */}
                <div className={`grid gap-4 sm:grid-cols-2 ${role === 'admin' ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
                    {(role === 'admin' ? ADMIN_EYLEMLER : SUBE_EYLEMLER).map((e) => (
                        <EylemKarti
                            key={e.baslik}
                            {...e}
                            dis={e.dis ? (subeSlug ? `/${subeSlug}` : '/') : undefined}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

/**
 * Üstteki özet kartların ortak kabuğu — yalnızca merkez panelinde kullanılıyor.
 *
 * PROPS TEK NESNE OLARAK OKUNUYOR: projenin eslint kurulumunda
 * `react/jsx-uses-vars` yok, yani YALNIZCA JSX'te kullanılan bir parametre
 * "hiç kullanılmamış" sayılıyor. `props.Ikon` üye erişimi olduğu için sorun
 * çıkmıyor (aynı kalıp components/layout/nav-main.jsx'te de var).
 */
function OzetKart(props) {
    const { etiket, baslik, vurgulu = false, children } = props;
    return (
        <Card className="rounded-2xl bg-linear-to-t from-primary/5 to-card transition-all hover:border-muted-foreground/30">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{etiket}</p>
                    <CardTitle className={`mt-1 text-xl font-bold tracking-tight ${vurgulu ? 'text-[#084529] dark:text-[#d8c7a3]' : 'text-foreground'}`}>
                        {baslik}
                    </CardTitle>
                </div>
                <div className="flex size-9 items-center justify-center rounded-xl border bg-muted text-[#084529] dark:text-[#d8c7a3]">
                    <props.Ikon className="size-4.5" />
                </div>
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    );
}

/**
 * Hızlı eylem kartı. `dis` verilirse yeni sekmede açılan dış bağlantı
 * (QR menü müşteri tarafı), yoksa panel içi yönlendirme.
 */
function EylemKarti(props) {
    const { baslik, metin, yol, dis } = props;
    const govde = (
        <Card className="h-full cursor-pointer rounded-2xl bg-card transition-all hover:border-[#084529]/30 hover:bg-muted/40">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-[#084529]/10 text-[#084529] dark:bg-[#d8c7a3]/10 dark:text-[#d8c7a3]">
                        <props.Ikon className="size-4" />
                    </div>
                    <CardTitle className="text-sm font-semibold text-foreground transition-colors group-hover:text-[#084529] dark:group-hover:text-[#d8c7a3]">
                        {baslik}
                    </CardTitle>
                    {dis && <ArrowUpRight className="ml-auto size-3.5 text-muted-foreground" />}
                </div>
            </CardHeader>
            <CardContent>
                <p className="text-xs leading-normal text-muted-foreground">{metin}</p>
            </CardContent>
        </Card>
    );
    return dis
        ? <a href={dis} target="_blank" rel="noreferrer" className="group">{govde}</a>
        : <Link to={yol} className="group">{govde}</Link>;
}
