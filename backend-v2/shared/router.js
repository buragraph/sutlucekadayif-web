// Ortam bağımsız mini router (Faz 3 / C1)
//
// Amaç: rota GÖVDELERİNE hiç dokunmadan aynı kodu iki yerde koşturmak —
//   • Functions/Express (api2, rollback hedefi)  → `expressRotasi()`
//   • Cloudflare Workers/Hono (yeni yayın)       → `honoyaBagla()`
//
// Rota dosyaları `express`ten değil buradan `Router` alır. Kayıt API'si
// express.Router'ın kullandığımız alt kümesiyle birebir: .get/.post/.put/
// .delete/.patch(yol, ...halkalar). `router.use()` hiçbir rota dosyasında
// kullanılmıyor, o yüzden desteklenmiyor (eklenirse burada da eklenmeli).
//
// Gövdelerin dokunduğu yüzey ölçüldü ve ikisinde de aynı:
//   req: user, body, params, query, file, headers, method, originalUrl
//   res: status, json, send, set, type, redirect, removeHeader

const YONTEMLER = ['get', 'post', 'put', 'delete', 'patch'];

/** '/reports' + '/butce' → '/reports/butce'; '/' parçaları yutulur. */
function yolBirlestir(onek, yol) {
    const a = onek === '/' ? '' : onek;
    const b = yol === '/' ? '' : yol;
    return (a + b) || '/';
}

export function Router() {
    const kayitlar = [];
    const r = { kayitlar };
    for (const y of YONTEMLER) {
        r[y] = (yol, ...halkalar) => {
            kayitlar.push({ yontem: y.toUpperCase(), yol, halkalar });
            return r;
        };
    }
    // Alt router bağlama (reports → budget-routes). Kayıtlar SIRA KORUNARAK
    // öneklenip eklenir; Express de eşleşmeyi kayıt sırasına göre yapıyor.
    r.use = (yol, alt) => {
        const [onek, altRouter] = typeof yol === 'string' ? [yol, alt] : ['/', yol];
        if (!altRouter?.kayitlar) {
            throw new Error('router.use yalnızca alt Router kabul eder (middleware desteklenmiyor)');
        }
        for (const k of altRouter.kayitlar) {
            kayitlar.push({ ...k, yol: yolBirlestir(onek, k.yol) });
        }
        return r;
    };
    return r;
}

// ── Express tarafı ────────────────────────────────────────────────────────
// Kayıtları gerçek bir express.Router'a aktarır. Halkalar zaten Express
// imzasında (req, res, next) olduğu için doğrudan geçilir.
export function expressRotasi(ExpressRouter, r) {
    const er = ExpressRouter();
    for (const k of r.kayitlar) er[k.yontem.toLowerCase()](k.yol, ...k.halkalar);
    return er;
}

// ── Workers/Hono tarafı ───────────────────────────────────────────────────

/** Hono Context → Express benzeri req. Gövde ilk erişimde çözülür. */
async function istekKur(c) {
    const url = new URL(c.req.url);
    const tur = c.req.header('content-type') || '';
    let govde = {};
    let dosya = null;
    let dosyalar = [];

    if (!['GET', 'HEAD'].includes(c.req.method)) {
        if (tur.includes('application/json')) {
            govde = await c.req.json().catch(() => ({}));
        } else if (tur.includes('multipart/form-data')) {
            // multer karşılığı: alanlar body'ye, dosyalar req.file/req.files'a
            const form = await c.req.formData();
            for (const [ad, deger] of form.entries()) {
                if (typeof deger === 'string') { govde[ad] = deger; continue; }
                const kayit = {
                    fieldname: ad,
                    originalname: deger.name,
                    mimetype: deger.type,
                    size: deger.size,
                    buffer: new Uint8Array(await deger.arrayBuffer()),
                };
                dosyalar.push(kayit);
                if (!dosya) dosya = kayit;
            }
        } else if (tur.includes('application/x-www-form-urlencoded')) {
            govde = Object.fromEntries((await c.req.formData()).entries());
        }
    }

    return {
        method: c.req.method,
        originalUrl: url.pathname + url.search,
        path: url.pathname,
        params: c.req.param(),
        query: Object.fromEntries(url.searchParams.entries()),
        headers: Object.fromEntries(c.req.raw.headers.entries()),
        body: govde,
        file: dosya,
        files: dosyalar,
        // req.user'ı verifyToken yazar
    };
}

/** Express benzeri res — sonuçta tek bir Response üretir. */
function yanitKur() {
    let kod = 200;
    const basliklar = {};
    let sonuc = null;   // { tur: 'json'|'metin'|'yonlendir', veri }
    // Yanıtın YAZILDIĞI an sinyali. Gerekli çünkü utils/asyncHandler.js
    // oluşturduğu sözü DÖNDÜRMÜYOR (Express'te gerek yok) — zincirin bittiğini
    // "middleware döndü" diye anlayamayız. Bkz. honoyaBagla().
    let yazildiCoz;
    const yazildi = new Promise((r) => { yazildiCoz = r; });
    const isaretle = () => yazildiCoz();
    const res = {
        yazildi,
        status(k) { kod = k; return res; },
        set(a, d) {
            if (typeof a === 'object') Object.assign(basliklar, a);
            else basliklar[a] = d;
            return res;
        },
        removeHeader(a) { delete basliklar[a]; return res; },
        type(t) {
            basliklar['Content-Type'] = t === 'html' ? 'text/html; charset=utf-8'
                : t === 'json' ? 'application/json' : t;
            return res;
        },
        json(v) { sonuc = { tur: 'json', veri: v }; isaretle(); return res; },
        send(v) { sonuc = { tur: 'metin', veri: v }; isaretle(); return res; },
        redirect(hedef) { sonuc = { tur: 'yonlendir', veri: hedef }; isaretle(); return res; },
        get bitti() { return sonuc !== null; },
        yanit() {
            if (sonuc?.tur === 'yonlendir') return Response.redirect(sonuc.veri, 302);
            if (sonuc?.tur === 'json') {
                return new Response(JSON.stringify(sonuc.veri), {
                    status: kod, headers: { 'Content-Type': 'application/json', ...basliklar },
                });
            }
            if (sonuc?.tur === 'metin') {
                const v = sonuc.veri;
                const govde = (typeof v === 'string' || v instanceof Uint8Array || v instanceof ArrayBuffer)
                    ? v : JSON.stringify(v);
                return new Response(govde, { status: kod, headers: basliklar });
            }
            return new Response(null, { status: kod, headers: basliklar });
        },
    };
    return res;
}

/**
 * Router kayıtlarını bir Hono uygulamasına bağlar.
 * @param {object} app   — Hono örneği
 * @param {string} onek  — ör. '/api/users'
 * @param {object} r     — Router()
 * @param {Function[]} [onHalkalar] — mount düzeyinde middleware (ör. authLimiter yerine geçen yok)
 */
export function honoyaBagla(app, onek, r, onHalkalar = []) {
    for (const k of r.kayitlar) {
        const yol = (onek + (k.yol === '/' ? '' : k.yol)) || '/';
        app.on(k.yontem, yol, async (c) => {
            const req = await istekKur(c);
            // Express wildcard uyumu: '/proxy/*' kalıbında Express yakalananı
            // req.params[0]'a koyar; Hono ise yıldızı param() içinde VERMEZ.
            // Kalıptaki yıldızın öncesi statik önek olduğundan, gerçek yolun o
            // uzunluktan sonrası yakalanan kısımdır. (upload proxy'si buna
            // dayanır — köprüde eksikti, panel/menü görselleri 400 dönüyordu.)
            const yildiz = yol.indexOf('*');
            if (yildiz !== -1 && req.params[0] === undefined) {
                req.params[0] = decodeURIComponent(c.req.path.slice(yildiz));
            }
            const res = yanitKur();
            const zincir = [...onHalkalar, ...k.halkalar];

            // DİKKAT: Express middleware'leri `next()`'i AWAIT ETMEZ (Express de
            // etmez). Bu yüzden zincirin bittiğini "middleware döndü" diye
            // anlayamayız — cacheMiddleware next()'i çağırıp hemen dönüyor ve
            // yanıt gövdesi boş kalıyordu. Çözüm: her halkanın sözünü biriktir,
            // dizi büyümeyi bırakana kadar hepsini bekle.
            let i = 0;
            let hata = null;
            let hataCoz;
            const hataOldu = new Promise((r) => { hataCoz = r; });
            const sozler = [];
            const ilerle = (e) => {
                if (e) { hata = e; hataCoz(); return Promise.resolve(); }
                const h = zincir[i++];
                if (!h || res.bitti) return Promise.resolve();
                const soz = (async () => h(req, res, ilerle))();
                sozler.push(soz);
                return soz;
            };
            await ilerle();
            for (let n = 0; n < sozler.length; n++) await sozler[n];

            // asyncHandler sözü yutuyor: zincir "döndü" ama yanıt henüz
            // yazılmamış olabilir. Yanıt yazılana ya da hata gelene kadar bekle.
            if (!res.bitti && !hata) {
                let zamanAsimi;
                await Promise.race([
                    res.yazildi,
                    hataOldu,
                    new Promise((r) => { zamanAsimi = setTimeout(r, 25_000); }),
                ]);
                clearTimeout(zamanAsimi);
            }

            if (hata) {
                console.error('[Worker]', hata);
                return c.json({ error: hata.message || 'Sunucu hatası oluştu' }, hata.status || 500);
            }
            return res.yanit();
        });
    }
}
