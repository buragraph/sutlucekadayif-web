/**
 * Ürün etiketleri — TEK KAYNAK.
 *
 * Hem yönetim paneli (ProductsPage: seçim çipleri + tablo rozetleri) hem müşteri
 * menüsü (MenuPage: kart rozeti + ürün penceresi) buradan okur. Daha önce liste
 * iki dosyada ayrı ayrı tanımlıydı; biri güncellenip diğeri unutulduğunda menüde
 * etiketin ham anahtarı ("en_cok_satan") görünüyordu.
 *
 * Set, WordPress QR menüsünden aktarılan 8 etiketle birebir aynıdır.
 *
 * - `ad`      : panelde ve ürün penceresinde görünen tam ad
 * - `kisa`    : menü kartındaki dar rozet için kısaltma (kart tek satır)
 * - `wp`      : WordPress'teki karşılığı — aktarım eşlemesi buradan okunur,
 *               ayrı bir eşleme tablosu tutulmaz (ikisi ayrışmasın)
 */
export const ETIKETLER = [
    { key: 'en_cok_satan',     ad: 'En Çok Satan',                    kisa: 'Çok Satan',        emoji: '🔥',  color: '#ef4444', wp: 'En Çok Satan' },
    { key: 'en_yeni',          ad: 'En Yeni',                         kisa: 'Yeni',             emoji: '✨',  color: '#8b5cf6', wp: 'En Yeni' },
    { key: 'en_cok_begenilen', ad: 'En Çok Beğenilen',                kisa: 'Çok Beğenilen',    emoji: '❤️',  color: '#ec4899', wp: 'En Çok Beğenilen' },
    { key: 'ayin_favorisi',    ad: 'Bu Ayın Favorisi',                kisa: 'Ayın Favorisi',    emoji: '⭐',  color: '#f59e0b', wp: 'Bu Ayın Favorisi' },
    { key: 'haftanin_tercihi', ad: 'Haftanın En Çok Tercih Edileni',  kisa: 'Haftanın Tercihi', emoji: '📅',  color: '#0ea5e9', wp: 'Haftanın En Çok Tercih Edileni' },
    { key: 'gunun_tercihi',    ad: 'Bugünün En Çok Tercih Edileni',   kisa: 'Günün Tercihi',    emoji: '☀️',  color: '#eab308', wp: 'Bugünün En Çok Tercih Edileni' },
    { key: 'ustanin_secimi',   ad: 'Ustamızın En Çok Beğendiği',      kisa: 'Ustanın Seçimi',   emoji: '👨‍🍳', color: '#16a34a', wp: 'Ustamızın En Çok Beğendiği' },
    { key: 'storyye_atmalik',  ad: "Story'ye Atmalık!",               kisa: "Story'lik",        emoji: '📸',  color: '#a855f7', wp: "Story’ye Atmalık!" },
];

/** Menü kartı/penceresi için kısa ad; bilinmeyen anahtarda anahtarın kendisi. */
export const etiketKisaAd = (key) => ETIKETLER.find((t) => t.key === key)?.kisa || key;

export default ETIKETLER;
