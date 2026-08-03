// Cloudflare Workers girişi (Faz 3 / C1).
//
// Aynı rota dosyalarını server.js ile paylaşır; fark yalnızca burada:
//   • yönlendirme  → Hono (Express yerine)
//   • depolama     → R2 native binding (S3 API yerine)
//   • dosya alımı  → request.formData() (multer yerine)
//   • oran sınırı  → KOD İÇİNDE YOK; Cloudflare kenar kuralları üstlenir
//   • güvenlik başlıkları → helmet yerine elle (aynı değerler)
//   • zamanlanmış işler → cron triggers (onSchedule yerine)
import { Hono } from 'hono';
import { honoyaBagla } from './shared/router.js';
import { depoAyarla } from './config/r2.js';
import { depoS3 } from './config/depo-s3.js';   // bkz. wrangler.toml — hesap ayrımı notu
import { dosyaAyarla, dosyaYerlesik } from './shared/dosya.js';
import { limitAyarla, limitYok } from './shared/limit.js';
import { saglikKontrol } from './config/supabase.js';

import usersRouter from './routes/users.js';
import categoriesRouter from './routes/categories.js';
import branchesRouter from './routes/branches.js';
import onboardingRouter from './routes/onboarding.js';
import profilRouter from './routes/profil.js';
import basvurularRouter from './routes/basvurular.js';
import geribildirimRouter from './routes/geribildirim.js';
import isbasvuruRouter from './routes/isbasvuru.js';
import uploadRouter from './routes/upload.js';
import mediaRouter from './routes/media.js';
import aiRouter from './routes/ai.js';
import menuRouter from './modules/qr-menu/routes/menu.js';
import productsRouter from './modules/qr-menu/routes/products.js';
import academyCoursesRouter from './modules/academy/routes/courses.js';
import academyLessonsRouter from './modules/academy/routes/lessons.js';
import academyUploadRouter from './modules/academy/routes/upload.js';
import academyProgressRouter from './modules/academy/routes/progress.js';
import reportsRouter from './modules/reports/routes.js';

// Dosya alımı: gövde router köprüsünde zaten çözülüyor, burada yalnızca kural.
dosyaAyarla(dosyaYerlesik);
// Oran sınırı kodda YOK — Cloudflare kenar kuralları uyguluyor (C0 kararı).
limitAyarla(limitYok);

const app = new Hono();

// ─── CORS ───
// server.js'teki liste ve mantıkla BİREBİR aynı (kaynak allow-list + Pages/Workers
// alt alan adları). Hono middleware'i yerine elle: aynı başlıkları üretiyoruz.
const IZINLI = [
    'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175',
    'http://localhost:4321',
    'https://sutlucekadayif.com', 'https://www.sutlucekadayif.com',
];
function kaynakUygun(kaynak) {
    if (!kaynak) return true;
    if (IZINLI.includes(kaynak)) return true;
    return kaynak.endsWith('.sutlucekadayif.pages.dev')
        || kaynak.endsWith('.sutlucekadayif.workers.dev')
        || kaynak.endsWith('.dijitalreklam.workers.dev');
}

app.use('*', async (c, next) => {
    const kaynak = c.req.header('origin');
    if (c.req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: kaynakUygun(kaynak) ? {
                'Access-Control-Allow-Origin': kaynak || '*',
                'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Max-Age': '86400',
            } : {},
        });
    }
    await next();
    if (kaynak && kaynakUygun(kaynak)) {
        c.res.headers.set('Access-Control-Allow-Origin', kaynak);
        c.res.headers.set('Vary', 'Origin');
        c.res.headers.set('Access-Control-Expose-Headers',
            'Content-Disposition, Retry-After, RateLimit-Reset, RateLimit-Remaining');
    }
    // helmet karşılığı — sabit güvenlik başlıkları
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('Referrer-Policy', 'no-referrer');
    if (!c.res.headers.has('X-Frame-Options')) c.res.headers.set('X-Frame-Options', 'SAMEORIGIN');
});

// ─── Sağlık ───
app.get('/api/health', async (c) => {
    const govde = { status: 'ok', timestamp: new Date().toISOString() };
    try {
        await saglikKontrol();
        govde.supabase = 'ok';
    } catch (e) {
        govde.supabase = 'hata';
        govde.detay = e.message;
    }
    return c.json(govde);
});

// ─── Rotalar — mount yolları server.js ile AYNI SIRADA ───
const MOUNTLAR = [
    ['/api/users', usersRouter],
    ['/api/categories', categoriesRouter],
    ['/api/branches', branchesRouter],
    ['/api/onboarding', onboardingRouter],
    ['/api/profil', profilRouter],
    ['/api/basvurular', basvurularRouter],
    ['/api/geribildirim', geribildirimRouter],
    ['/api/isbasvuru', isbasvuruRouter],
    ['/api/upload', uploadRouter],
    ['/api/media', mediaRouter],
    ['/api/ai', aiRouter],
    ['/api/menu', menuRouter],
    ['/api/products', productsRouter],
    ['/api/academy/courses', academyCoursesRouter],
    ['/api/academy/lessons', academyLessonsRouter],
    ['/api/academy/upload', academyUploadRouter],
    ['/api/academy/progress', academyProgressRouter],
    ['/api/reports', reportsRouter],
];
for (const [onek, r] of MOUNTLAR) honoyaBagla(app, onek, r);

app.notFound((c) => c.json({ error: 'Endpoint bulunamadı' }, 404));
app.onError((err, c) => {
    console.error('[Worker]', err);
    return c.json({ error: err.message || 'Sunucu hatası oluştu' }, err.status || 500);
});

// Workers'ta env yalnızca handler içinde erişilebilir; modül düzeyinde okunan
// process.env değerleri (SUPABASE_URL vb.) nodejs_compat + wrangler vars/secrets
// üzerinden gelir. Depolama binding'i ise her istekte kaydedilir.
function ortamiKur(env) {
    // Kova başka bir Cloudflare hesabında olduğu için native binding yerine
    // S3 API. Worker kovanın hesabına taşınırsa depoBinding(env.DEPO) yeter.
    void env;
    depoAyarla(depoS3);
}

export default {
    async fetch(request, env, ctx) {
        ortamiKur(env);
        return app.fetch(request, env, ctx);
    },

    // Cron: 04:00 UTC = 07:00 TR çekim. Gece yedeği GitHub Actions'ta
    // (.github/workflows/gece-yedegi.yml) — gerekçe wrangler.toml'da.
    async scheduled(event, env, ctx) {
        ortamiKur(env);
        // PARALEL DÖNEM: CRON_AKTIF bu ortamın zamanlanmış işlerin SAHİBİ olup
        // olmadığını söyler. api2 hâlâ sahip olduğu için burada İKİSİ DE atlanır —
        // yoksa 03:00'te iki yedek birden koşar. C3 kesiminde Worker'da true,
        // api2'de false olur.
        const cronAktif = String(env.CRON_AKTIF) === 'true';
        if (!cronAktif) {
            console.log(`[Scheduled] CRON_AKTIF=false — Worker '${event.cron}' işini atladı (sahip api2).`);
            return;
        }
        if (event.cron === '0 4 * * *') {
            const { runScheduledFetch } = await import('./modules/reports/services/scheduled-fetch.js');
            const sonuc = await runScheduledFetch();
            console.log('[Scheduled] Otomatik çekim tamamlandı:', JSON.stringify(sonuc).slice(0, 800));
            if (sonuc.kritikHata) throw new Error(`Otomatik çekim: ${sonuc.kritikHata}`);
        }
    },
};
