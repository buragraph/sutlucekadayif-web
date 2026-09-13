/**
 * Merkezi Yetki Tanımları — Sütlüce Kadayıf
 * ── Tüm rol-yetki eşleştirmeleri bu dosyada tutulur ──
 *
 * Roller:
 *   - admin       → Genel yönetici (tüm şubeler)
 *   - sube_sahibi → Şube sahibi (kendi şubesi)
 *
 * Yeni bir yetki eklemek için:
 *   1. Bu dosyaya yeni key ekle
 *   2. İlgili rolleri diziye ekle
 *   3. Backend route'ta requirePermission('key') kullan
 *   4. Frontend'te can('key') kullan
 */

const PERMISSIONS = {
    // ── Menü ──
    'menu.view': ['admin', 'sube_sahibi'],

    // ── Ürün Yönetimi ──
    'products.view': ['admin', 'sube_sahibi'],
    // Ürünleri YALNIZCA merkez ekler. Şube ürün oluşturamaz; ortak katalogtan
    // gelen ürünlerde mevcut/mevcut değil yapar, izin verilmişse kendi fiyatını girer.
    'products.create': ['admin'],
    'products.edit': ['admin', 'sube_sahibi'],
    'products.delete': ['admin', 'sube_sahibi'],
    'products.toggleAvailability': ['admin', 'sube_sahibi'],
    // Ortak katalogtaki bir ürünü ŞUBENİN MENÜSÜNE ekleme / menüden çıkarma.
    // Ürün oluşturmak DEĞİLDİR: katalog merkez tarafından doldurulur, şube
    // yalnızca hangilerini sattığını seçer (bkz. menude_subeler).
    'products.toggleMenu': ['admin', 'sube_sahibi'],

    // ── Ürün Talepleri ──
    // Şube ürün OLUŞTURAMAZ (products.create admin'de); bunun yerine talep açar,
    // merkez onaylayınca ürün katalogda doğar ve yalnız talep eden şubenin
    // menüsünde açılır. Amaç mükerrer isimli ürünleri baştan engellemek.
    'urunTalep.create': ['sube_sahibi'],
    // Şube YALNIZCA kendi taleplerini görür — kapsam rota katmanında daraltılır.
    'urunTalep.view': ['admin', 'sube_sahibi'],
    'urunTalep.manage': ['admin'],

    // ── Şube Yönetimi ──
    'branches.view': ['admin', 'sube_sahibi'],
    'branches.create': ['admin'],
    'branches.edit': ['admin'],
    'branches.delete': ['admin'],

    // ── Kategori Yönetimi ──
    'categories.view': ['admin', 'sube_sahibi'],
    'categories.create': ['admin'],
    'categories.edit': ['admin'],
    'categories.delete': ['admin'],

    // ── Medya Kütüphanesi ──
    // Görseller merkez tarafından yönetilir; şubede medya arayüzü yok.
    // Daha önce kategori izinleri ödünç alınıyordu ve `categories.view` şube
    // sahibinde açık olduğu için şube, API'den tüm kütüphaneyi listeleyebiliyordu.
    'media.view': ['admin'],
    'media.manage': ['admin'],

    // ── Kullanıcı Yönetimi ──
    'users.view': ['admin', 'sube_sahibi'],
    'users.create': ['admin', 'sube_sahibi'],
    'users.assignRole': ['admin', 'sube_sahibi'],
    'users.resetOnboarding': ['admin'],

    // ── Akademi ──
    'academy.view': ['admin', 'sube_sahibi', 'calisan'],
    // Şube sahibi KENDİ çalışanlarının eğitim ilerlemesini görür (Çalışanlar
    // ekranında). Çalışanda YOK: kendi ilerlemesi zaten Akademi'de, arkadaşının
    // sınav notu onu ilgilendirmiyor. Merkezin ağ geneli ekranı ayrı
    // (academy.manage → /admin/akademi/yonetim).
    'academy.subeIlerleme': ['admin', 'sube_sahibi'],
    'academy.manage': ['admin'],

    // ── Bütçe Toplama ──
    'budget.manage': ['admin'],
    'budget.submit': ['admin', 'sube_sahibi'],
    'budget.view': ['admin', 'sube_sahibi'],

    // ── Raporlar / Reklam ──
    // view: kendi şube verisini görüntüleme (sube_sahibi yalnızca kendi şubesi)
    // manage: şube CRUD, veri içe aktarma, Meta/Google çekme, ayarlar (admin)
    'reports.view': ['admin', 'sube_sahibi'],
    'reports.manage': ['admin'],

    // ── Franchise Başvuruları ──
    // Pazarlama sitesinden gelen franchise talepleri şirket geneli veridir;
    // yalnızca admin görüntüler/yönetir (POST /basvurular herkese açıktır).
    'basvurular.view': ['admin'],
    'basvurular.manage': ['admin'],

    // Kurumsal materyal (logo, şablon, marka kılavuzu): merkez yükler, şube
    // indirir. Çalışanda YOK — bunlar şubenin dış dünyaya kullandığı marka
    // dosyaları, kararı şube sahibinde.
    'materyal.view': ['admin', 'sube_sahibi'],
    'materyal.manage': ['admin'],

    // ── Şikayet & Geri Bildirim (QR menüsü) ──
    // Şube sahibi YALNIZCA kendi şubesinin kayıtlarını görür/günceller (kapsam
    // backend'de token'daki subeSlug ile zorlanır). Silme yalnızca admin'de:
    // şube kendi hakkındaki şikayeti kaldıramamalı.
    'geribildirim.view': ['admin', 'sube_sahibi'],
    'geribildirim.manage': ['admin', 'sube_sahibi'],
    'geribildirim.delete': ['admin'],
    // Dış kaynaktan (Şikayetvar, telefon) gelen şikayeti masaya elle eklemek —
    // şube kendi hakkında kayıt açamaz.
    'geribildirim.create': ['admin'],
    // ŞUBE → MERKEZ yönü. `geribildirim.create` şubenin KENDİ HAKKINDA kayıt
    // açmasını engellemek için admin'e kapalı; bu ayrı anahtar ise şubenin
    // MERKEZE şikayet/talep iletmesi. Yön farklı olduğu için izin de ayrı.
    'subeSikayet.create': ['admin', 'sube_sahibi'],

    // ── İş Başvuruları (QR menüsü) ──
    // Başvuru hem ilgili şubeye hem merkeze düşer: şube sahibi kendi şubesine
    // gelenleri görür/yönetir, admin tümünü. Silme yalnızca admin'de.
    'isbasvuru.view': ['admin', 'sube_sahibi'],
    'isbasvuru.manage': ['admin', 'sube_sahibi'],
    'isbasvuru.delete': ['admin'],

    // ── Duyurular ──
    // Merkez yazar, şube okur. Şube sahibinde yazma YOK: duyuru merkezden
    // şubeye tek yönlü bir kanal, şubenin diğer şubelere duyuru geçmesi
    // (ya da kendi duyurusunu silmesi) istenmiyor.
    'duyuru.view': ['admin', 'sube_sahibi'],
    'duyuru.manage': ['admin'],
};

/**
 * Belirli bir rolün belirli bir yetkiye sahip olup olmadığını kontrol eder.
 * @param {string} role — Kullanıcının rolü (admin, sube_sahibi)
 * @param {string} permission — Yetki key'i (ör: 'products.toggleAvailability')
 * @returns {boolean}
 */
function hasPermission(role, permission) {
    const allowedRoles = PERMISSIONS[permission];
    if (!allowedRoles) {
        console.warn(`[Permissions] Bilinmeyen yetki: "${permission}"`);
        return false;
    }
    return allowedRoles.includes(role);
}

export { PERMISSIONS, hasPermission };
export default PERMISSIONS;
