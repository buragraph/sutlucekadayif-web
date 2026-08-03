import './env.js';   // .env + .env.local (mutlak yol) — İLK yüklenmeli

// ─── Depolama katmanı — ortam bağımsız (Faz 3 / C1) ───
//
// Bu dosya artık S3 istemcisi KURMAZ; yalnızca sözleşmeyi tanımlar ve çalışma
// zamanında kayıtlanan bir uygulamaya devreder:
//   • Node/Functions  → config/depo-s3.js      (@aws-sdk/client-s3)
//   • Workers         → config/depo-binding.js (wrangler [[r2_buckets]])
// Böylece aws-sdk Worker paketine hiç girmiyor ve R2_ACCESS_KEY_ID/SECRET/
// ACCOUNT_ID gizli anahtarları Worker tarafında gereksizleşiyor.
//
// Kayıt giriş noktasında yapılır: server.js / worker.js ilk iş olarak
// `depoAyarla(...)` çağırır. Çağrılmazsa ilk kullanımda anlaşılır hata verir.

let depo = null;

/** Giriş noktası bir depolama uygulaması kaydeder. */
export function depoAyarla(uygulama) { depo = uygulama; }

function d() {
    if (!depo) throw new Error('Depolama katmanı kayıtlı değil — giriş noktasında depoAyarla() çağrılmalı');
    return depo;
}

const PUBLIC_URL = process.env.R2_PUBLIC_URL;
const BUCKET = process.env.R2_BUCKET_NAME;

/**
 * Dosya yükle
 * @param {Buffer|Uint8Array} buffer - Dosya içeriği
 * @param {string} key - R2'deki dosya yolu (ör: "urunler/abc123.webp")
 * @param {string} contentType - MIME type
 * @returns {string} Public URL
 */
export async function uploadFile(buffer, key, contentType) {
    await d().yaz(key, buffer, contentType);
    return `${PUBLIC_URL}/${key}`;
}

/**
 * Dosya sil
 * @param {string} key - R2'deki dosya yolu
 */
export async function deleteFile(key) {
    await d().sil(key);
}

/**
 * Dosya oku. Bulunamazsa null.
 * @returns {Promise<{govde: Uint8Array, tur: string|null, boyut: number|null}|null>}
 */
export async function getFile(key) {
    return await d().oku(key);
}

/**
 * Önekle eşleşen anahtarlar (yedek budama için).
 * @returns {Promise<{key: string, boyut: number, tarih: Date|null}[]>}
 */
export async function listFiles(prefix) {
    return await d().listele(prefix);
}

/**
 * URL'den key çıkar
 * URL, PUBLIC_URL öneki ile başlamıyorsa `null` döner — aksi halde
 * (öneksiz/yabancı URL) girdi olduğu gibi key sanılır ve allow-list'i
 * anlamsızlaştırabilirdi.
 * @param {string} url - Public URL
 * @returns {string|null} R2 key veya geçersizse null
 */
export function urlToKey(url) {
    if (!url || !PUBLIC_URL) return null;
    const prefix = `${PUBLIC_URL}/`;
    if (!url.startsWith(prefix)) return null;
    return url.slice(prefix.length);
}

/**
 * Bir R2 anahtarının genel okuma (proxy) veya silme işlemleri için izinli
 * olup olmadığını kontrol eden ORTAK güvenlik yardımcısı.
 *
 * Blacklist yerine pozitif allow-list uygular — `upload.js`, `media.js` ve
 * academy route'ları (`academy/routes/*.js`) bu fonksiyonu import edip
 * kendi silme/proxy uçlarında kullanmalı; her yerde ayrı ayrı prefix
 * kontrolü tekrarlanmamalı.
 *
 * Kurallar:
 * - key null/boş veya string değilse: false
 * - `\0` (null byte), `..` (üst dizin) veya baştaki `/` içeriyorsa: false
 * - `dekontlar/` önekiyle başlıyorsa: HER ZAMAN false — dekont (banka makbuzu)
 *   erişimi yalnızca kendi özel, yetkilendirmeli endpoint'inden
 *   (`GET /api/upload/dekont/*`) gider; genel proxy veya silme yollarından asla.
 * - Yukarıdakiler geçerse: yalnızca izinli önek listesindeki
 *   (`urunler/`, `menu/`, `academy/`) bir önekle başlıyorsa true.
 *
 * @param {string} key - Kontrol edilecek R2 anahtarı
 * @param {{forDelete?: boolean}} [opts] - forDelete: kontrolün bir silme
 *        işlemi için mi yapıldığını belirtir. Şu an okuma ve silme aynı
 *        kurallara tabi (dekontlar/ reddi + aynı allow-list); parametre,
 *        ileride silme için daha sıkı bir kural eklenmesi ihtimaline karşı
 *        imzada tutuluyor.
 * @returns {boolean}
 */
export function isKeyAllowed(key, { forDelete = false } = {}) {
    void forDelete; // şu an davranışı değiştirmiyor — bkz. yukarıdaki JSDoc
    if (!key || typeof key !== 'string') return false;
    if (key.includes('\0') || key.includes('..') || key.startsWith('/')) return false;

    // Dekontlar (banka makbuzları) bu genel yollardan ASLA okunamaz/silinemez.
    if (key.startsWith('dekontlar/')) return false;

    const ALLOWED_PREFIXES = ['urunler/', 'menu/', 'academy/'];
    return ALLOWED_PREFIXES.some((p) => key.startsWith(p));
}

export { BUCKET, PUBLIC_URL };
