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
 * Versiyon doğrulamalı cache middleware'i — multi-instance (Cloud Run) güvenli.
 *
 * Normal cacheMiddleware instance-lokal olduğu için bir instance'ta yapılan
 * güncelleme diğerlerinin cache'ini temizleyemez (bayat veri bug'ı).
 * Bu middleware her istekte Firestore'daki versiyon dokümanını okur (1 read)
 * ve cache'i yalnızca versiyon eşleşiyorsa servis eder. Veri değiştiğinde
 * versiyon arttığı için tüm instance'ların cache'i otomatik geçersizleşir.
 *
 * @param {number} ttl - Cache süresi (saniye) — sadece bellek temizliği için,
 *   doğruluk versiyondan gelir
 * @param {Function} getVersion - Güncel veri versiyonunu döndüren async fonksiyon
 */
export function versionedCacheMiddleware(ttl, getVersion) {
    return async (req, res, next) => {
        if (req.method !== 'GET') return next();

        let version;
        try {
            version = await getVersion();
        } catch {
            return next(); // Versiyon okunamazsa cache'siz devam et
        }

        // Kapsam ayracı: admin tüm şubeleri görür (paylaşımlı cache), sube_sahibi
        // yalnızca kendi şubesini görür (şubeye özel cache). Aynı URL'nin farklı
        // rollere farklı veri döndürdüğü yerlerde cache karışmasını önler.
        const scope = req.user?.role === 'admin' ? 'all' : (req.user?.subeSlug || 'none');
        const key = `__vcache__${req.originalUrl}@v${version}#${scope}`;
        const cached = cache.get(key);

        if (cached !== undefined) {
            // Tarayıcı cache'lememeli — bayatlık kontrolü sunucuda yapılıyor
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
