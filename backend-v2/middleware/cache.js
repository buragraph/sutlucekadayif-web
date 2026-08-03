import TtlCache from '../utils/ttl-cache.js';

// stdTTL: varsayılan cache süresi (saniye)
// checkperiod: süresi dolmuş anahtarları temizleme aralığı
const cache = new TtlCache({ stdTTL: 300, checkperiod: 60 });

// versionedCacheMiddleware + bumpDataVersion TAŞINMADI: Firestore'da her istekte
// versiyon dokümanı okumak bir maliyet çözümüydü. Postgres'te okuma ucuz, sıcak
// uçlarda düz TTL yeterli.

/**
 * Express middleware: GET isteklerini cache'ler
 * @param {number} ttl - Cache süresi (saniye), varsayılan 300 (5dk)
 */
export function cacheMiddleware(ttl = 300) {
    return (req, res, next) => {
        // Sadece GET isteklerini cache'le
        if (req.method !== 'GET') return next();

        const key = `__cache__${req.originalUrl}`;
        const cached = cache.get(key);

        if (cached) {
            res.set('Cache-Control', `public, max-age=${ttl}`);
            res.set('X-Cache', 'HIT');
            return res.json(cached);
        }

        const originalJson = res.json.bind(res);
        res.json = (data) => {
            cache.set(key, data, ttl);
            res.set('Cache-Control', `public, max-age=${ttl}`);
            res.set('X-Cache', 'MISS');
            return originalJson(data);
        };

        next();
    };
}

/**
 * Rol/şube kapsamına duyarlı cache — aynı URL'nin farklı rollere FARKLI veri
 * döndürdüğü uçlar için (dashboard, dashboard-bundle, ayarlar, eşleşmeler...).
 *
 * DİKKAT: düz `cacheMiddleware` anahtarı yalnızca URL'den kurar ve yanıta
 * `Cache-Control: public` yazar. Rol bazlı bir uçta bu, admin yanıtının şube
 * sahibine servis edilmesi demektir (merkez eşleştirmeleri + ayarlar sızar).
 * Buradaki anahtar kapsam ayracı taşır ve yanıt `no-store` işaretlenir —
 * bayatlık kontrolü sunucuda yapılır, tarayıcı hiç saklamaz.
 */
export function kapsamliCacheMiddleware(ttl = 60) {
    return (req, res, next) => {
        if (req.method !== 'GET') return next();

        const scope = req.user?.role === 'admin' ? 'all' : (req.user?.subeSlug || 'none');
        const key = `__kcache__${req.originalUrl}#${scope}`;
        const cached = cache.get(key);

        if (cached !== undefined) {
            res.set('Cache-Control', 'no-store');
            res.set('X-Cache', 'HIT');
            return res.json(cached);
        }

        const originalJson = res.json.bind(res);
        res.json = (data) => {
            if (res.statusCode === 200) cache.set(key, data, ttl);
            res.set('Cache-Control', 'no-store');
            res.set('X-Cache', 'MISS');
            return originalJson(data);
        };

        next();
    };
}

/** Anahtarında `pattern` geçen tüm cache girdilerini düşürür. */
export function invalidateCache(pattern) {
    const silinecek = cache.keys().filter((k) => k.includes(pattern));
    cache.del(silinecek);
    return silinecek.length;
}

export default cache;
