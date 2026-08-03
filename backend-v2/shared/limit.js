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
