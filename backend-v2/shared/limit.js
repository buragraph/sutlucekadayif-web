// Oran sınırı — ortam bağımsız (Faz 3 / C1).
//
// express-rate-limit Node'a özgü: MemoryStore modül yüklenirken setInterval
// kuruyor, Workers'ta "Disallowed operation called within global scope" ile
// patlıyor. Ayrıca Workers'ta süreç içi sayaç zaten anlamsız (her isolate ayrı).
//
// Bu yüzden: Node/Functions tarafı gerçek limitleyiciyi kaydeder, Worker tarafı
// no-op kaydeder ve sınır Cloudflare kenar kurallarına devredilir (C0 kararı).
// Rota dosyaları yalnızca `oranSiniri({...})` çağırır; hangi ortamda olduklarını
// bilmezler.

let uygulama = null;

/** Giriş noktası bir uygulama kaydeder (server.js → express-rate-limit, worker.js → no-op). */
export function limitAyarla(u) { uygulama = u; }

/**
 * @param {{windowMs: number, max: number, message?: object}} ayar
 * @returns {Function} (req, res, next) middleware
 */
export function oranSiniri(ayar) {
    let mw = null;
    return (req, res, next) => {
        if (!uygulama) return next();          // kayıt yoksa sınırsız (yalnızca test)
        if (!mw) mw = uygulama(ayar);
        return mw(req, res, next);
    };
}

/** Workers tarafı: sınır kenarda uygulanıyor, kodda geç. */
export const limitYok = () => (req, res, next) => next();

// ── Veritabanı tabanlı sınır (ortam bağımsız) ──
//
// Yukarıdaki `oranSiniri` Workers'ta no-op. Gerçekten koruma gereken kimliksiz
// uçlar bunun yerine `dbSinir()` kullanır: sayaç `oran_sayaci` tablosunda
// (bkz. 0032), yani her isolate aynı sayacı görür.
//
// SIRALAMA ÖNEMLİ: önce sayılır, sınır aşıldıysa satır YAZILMADAN reddedilir.
// Aksi hâlde saldırgan istek başına bir satır yazdırıp sayacı yazma
// amplifikasyonuna çevirirdi.
//
// SAYAÇ OKUNAMAZSA GEÇİRİR: meşru kullanıcıyı kapıda bırakmak, sınırı bir
// istek boyu kaçırmaktan kötü. (parola.js'teki aynı gerekçe.)
import { supabase } from '../config/supabase.js';

/**
 * @param {string} anahtar  sayaç kimliği, ör. `basvuru:1.2.3.4`
 * @param {number} max      pencere içinde izin verilen istek
 * @param {number} pencereDk pencere uzunluğu (dakika)
 * @returns {Promise<boolean>} true → sınır aşıldı, isteği reddet
 */
export async function dbSinir(anahtar, max, pencereDk) {
    if (!anahtar) return false;
    const esik = new Date(Date.now() - pencereDk * 60 * 1000).toISOString();
    try {
        const { count } = await supabase
            .from('oran_sayaci').select('*', { count: 'exact', head: true })
            .eq('anahtar', anahtar).gte('zaman', esik);
        if ((count || 0) >= max) return true;
        await supabase.from('oran_sayaci').insert({ anahtar });
    } catch (err) {
        console.error('[limit] sayaç okunamadı:', err.message);
    }
    return false;
}

/** İstekten sınır anahtarı üretir: `<ad>:<ip>`. IP yoksa sınır uygulanmaz. */
export function ipAnahtari(req, ad) {
    const ip = req.headers?.['cf-connecting-ip'] || req.headers?.['x-forwarded-for'] || null;
    return ip ? `${ad}:${String(ip).split(',')[0].trim()}` : null;
}
