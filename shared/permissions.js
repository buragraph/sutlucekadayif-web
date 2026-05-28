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
    'products.create': ['admin', 'sube_sahibi'],
    'products.edit': ['admin', 'sube_sahibi'],
    'products.delete': ['admin', 'sube_sahibi'],
    'products.toggleAvailability': ['admin', 'sube_sahibi'],

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

    // ── Akademi ──
    'academy.view': ['admin', 'sube_sahibi', 'calisan'],
    'academy.manage': ['admin'],
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
