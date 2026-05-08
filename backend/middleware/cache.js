import NodeCache from 'node-cache';

// stdTTL: varsayılan cache süresi (saniye)
// checkperiod: süresi dolmuş anahtarları temizleme aralığı
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

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
            // Cache-Control header ekle
            res.set('Cache-Control', `public, max-age=${ttl}`);
            res.set('X-Cache', 'HIT');
            return res.json(cached);
        }

        // Orijinal res.json'ı yakala, cache'e yaz
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
 * Belirli bir pattern'e uyan cache'leri temizle
 * @param {string} pattern - Temizlenecek URL pattern (ör: '/api/reports')
 */
export function invalidateCache(pattern) {
    const keys = cache.keys();
    for (const key of keys) {
        if (key.includes(pattern)) {
            cache.del(key);
        }
    }
}

/**
 * Tüm cache'i temizle
 */
export function flushCache() {
    cache.flushAll();
}

export default cache;
