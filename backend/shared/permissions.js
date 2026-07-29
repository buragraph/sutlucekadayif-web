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

    // ── Kullanıcı Yönetimi ──
    'users.view': ['admin', 'sube_sahibi'],
    'users.create': ['admin', 'sube_sahibi'],
    'users.assignRole': ['admin', 'sube_sahibi'],
    'users.resetOnboarding': ['admin'],

    // ── Akademi ──
    'academy.view': ['admin', 'sube_sahibi', 'calisan'],
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

    // ── Şikayet & Geri Bildirim (QR menüsü) ──
    // Şube sahibi YALNIZCA kendi şubesinin kayıtlarını görür/günceller (kapsam
    // backend'de token'daki subeSlug ile zorlanır). Silme yalnızca admin'de:
    // şube kendi hakkındaki şikayeti kaldıramamalı.
    'geribildirim.view': ['admin', 'sube_sahibi'],
    'geribildirim.manage': ['admin', 'sube_sahibi'],
    'geribildirim.delete': ['admin'],

    // ── İş Başvuruları (QR menüsü) ──
    // Başvuru hem ilgili şubeye hem merkeze düşer: şube sahibi kendi şubesine
    // gelenleri görür/yönetir, admin tümünü. Silme yalnızca admin'de.
    'isbasvuru.view': ['admin', 'sube_sahibi'],
    'isbasvuru.manage': ['admin', 'sube_sahibi'],
    'isbasvuru.delete': ['admin'],
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
