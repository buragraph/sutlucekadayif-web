import express from 'express';
import { expressRotasi } from './shared/router.js';
// Depolama uygulaması bu girişe özgü (Node/S3). Worker girişi kendi binding'ini kaydeder.
import { depoAyarla } from './config/r2.js';
import { depoS3 } from './config/depo-s3.js';

depoAyarla(depoS3);

// Dosya yükleme: Node tarafında multer (memoryStorage). Kurallar rota
// dosyalarındaki dosyaAl(...) seçeneklerinden gelir — iki ortamda da aynı.
import multer from 'multer';
import { dosyaAyarla } from './shared/dosya.js';

dosyaAyarla((alan, { tipler, uzantilar, enBoy, hataMesaji } = {}) => multer({
    storage: multer.memoryStorage(),
    limits: enBoy ? { fileSize: enBoy } : undefined,
    fileFilter: (_req, file, cb) => {
        if (tipler && !tipler.includes(file.mimetype)) return cb(new Error(hataMesaji || 'Dosya türü kabul edilmiyor'));
        if (uzantilar) {
            const uz = '.' + String(file.originalname || '').split('.').pop().toLowerCase();
            if (!uzantilar.includes(uz)) return cb(new Error(hataMesaji || 'Dosya türü kabul edilmiyor'));
        }
        cb(null, true);
    },
}).single(alan));
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { limitAyarla } from './shared/limit.js';

// Rota içi oran sınırları (herkese açık formlar) Node tarafında gerçek
// limitleyiciyle koşar; Worker tarafında Cloudflare kenar kuralları devralır.
limitAyarla((ayar) => rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, trustProxy: false },
    ...ayar,
}));
import dotenv from 'dotenv';
import { Readable } from 'node:stream';

import { saglikKontrol } from './config/supabase.js';

// Route imports — modüller taşındıkça açılır (G6: qr-menü, G7: akademi,
// G8: raporlar). Sıra ve mount yolları eski backend ile bire bir aynı kalmalı;
// API sözleşmesi değişmiyor.
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

// Rapor Modülü
import reportsRouter from './modules/reports/routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Cloud Run arkasında çalışırken proxy güvenini ayarla
app.set('trust proxy', 1);

// ─── Güvenlik ───
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ─── CORS ───
// DİKKAT: cors() rate limiter'dan ÖNCE gelmeli. Sonra gelirse limiter'ın
// döndüğü 429 yanıtında Access-Control-Allow-Origin başlığı olmuyor ve tarayıcı
// bunu "CORS policy" hatası olarak gösteriyor — gerçek sebep (kota doldu)
// kullanıcıya hiç ulaşmıyor. Ayrıca cors() preflight'ı burada sonlandırdığı
// için OPTIONS istekleri kotayı yemiyor (istek başına 2 yerine 1 sayılıyor).
app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = [
            process.env.FRONTEND_URL || 'http://localhost:5173',
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:5175',
            'http://localhost:4321', // Astro pazarlama sitesi (franchise formu)
            'https://sutlucekadayif.com',
            'https://www.sutlucekadayif.com',
        ];
        // Origin yoksa (server-to-server) veya listedeyse izin ver
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        // Cloudflare Pages/Workers deploy'ları
        } else if (origin.endsWith('.sutlucekadayif.pages.dev') || origin.endsWith('.sutlucekadayif.workers.dev') || origin.endsWith('.dijitalreklam.workers.dev')) {
            callback(null, true);
        } else {
            callback(new Error('CORS policy violation'));
        }
    },
    credentials: true,
    // RateLimit-* ve Retry-After CORS'ta güvenli liste dışında; açıkça
    // sunulmazsa tarayıcıdaki JS okuyamıyor ve arayüz kullanıcıya "ne kadar
    // beklemeli" diyemiyor.
    exposedHeaders: ['Content-Disposition', 'Retry-After', 'RateLimit-Reset', 'RateLimit-Remaining']
}));

// ─── Rate Limiting ───
// 1000/15dk: medya toplu yüklemesi görsel başına 2 istek atıyor (/upload/image
// + /media), yani ~500 görsellik alan bırakıyor. Kötüye kullanıma açık uçların
// kendi sıkı limitleri var (giriş 20/15dk, herkese açık formlar 5-10/saat),
// bu yüzden genel limit panel işini engellemeyecek kadar geniş tutulabiliyor.
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla istek. Lütfen biraz bekleyin.' },
    validate: { xForwardedForHeader: false, trustProxy: false },
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla giriş denemesi. Lütfen biraz bekleyin.' },
    validate: { xForwardedForHeader: false, trustProxy: false },
});

app.use(generalLimiter);

// ─── Middleware ───
app.use(express.json({ limit: '1mb' }));

// ─── Multipart shim (Firebase Functions) ───
// firebase-functions gelen isteğin gövdesini `req.rawBody`'ye okuyup akışı
// tüketiyor; multer/busboy sonradan tükenmiş `req` akışını okuyunca "Unexpected
// end of form" ile 500 veriyor (prod'da tüm dosya yüklemeleri bozuluyordu).
// multer içeride `req.pipe(busboy)` yaptığından, multipart isteklerde req.pipe'ı
// rawBody'den taze bir akışa yönlendiriyoruz. Lokal dev'de rawBody olmadığından
// (düz Express) bu shim devreye girmez; normal streaming çalışır.
app.use((req, res, next) => {
    const ctype = req.headers['content-type'] || '';
    if (req.rawBody && ctype.startsWith('multipart/form-data')) {
        // [req.rawBody] — Buffer'ı diziye sar: Readable.from(buffer) baytları tek
        // tek yayınlar; [buffer] tek parça olarak akıtır (busboy bunu bekler)
        req.pipe = (dest, opts) => Readable.from([req.rawBody]).pipe(dest, opts);
    }
    next();
});

// ─── Routes ───
// Genel
app.use('/api/users', authLimiter, expressRotasi(express.Router, usersRouter));
app.use('/api/categories', expressRotasi(express.Router, categoriesRouter));
app.use('/api/branches', expressRotasi(express.Router, branchesRouter));
app.use('/api/onboarding', expressRotasi(express.Router, onboardingRouter));
app.use('/api/profil', expressRotasi(express.Router, profilRouter));
app.use('/api/basvurular', expressRotasi(express.Router, basvurularRouter));
app.use('/api/geribildirim', expressRotasi(express.Router, geribildirimRouter));
app.use('/api/isbasvuru', expressRotasi(express.Router, isbasvuruRouter));
app.use('/api/upload', expressRotasi(express.Router, uploadRouter));
app.use('/api/media', expressRotasi(express.Router, mediaRouter));
app.use('/api/ai', expressRotasi(express.Router, aiRouter));

// QR Menü Modülü
app.use('/api/menu', expressRotasi(express.Router, menuRouter));
app.use('/api/products', expressRotasi(express.Router, productsRouter));

// Akademi Modülü
app.use('/api/academy/courses', expressRotasi(express.Router, academyCoursesRouter));
app.use('/api/academy/lessons', expressRotasi(express.Router, academyLessonsRouter));
app.use('/api/academy/upload', expressRotasi(express.Router, academyUploadRouter));
app.use('/api/academy/progress', expressRotasi(express.Router, academyProgressRouter));

// Rapor Modülü
app.use('/api/reports', expressRotasi(express.Router, reportsRouter));

// Health check — eski uçla aynı şekle ek olarak Supabase bağlantısını da ölçer
app.get('/api/health', async (req, res) => {
    const govde = { status: 'ok', timestamp: new Date().toISOString() };
    try {
        await saglikKontrol();
        govde.supabase = 'ok';
    } catch (err) {
        govde.status = 'degraded';
        govde.supabase = err.message;
        return res.status(503).json(govde);
    }
    res.json(govde);
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint bulunamadı' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Sunucu hatası:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Sunucu hatası oluştu',
    });
});

// Sadece lokalde (npm run dev) açıkça başlatıldığında port dinle.
if (process.env.LOCAL_DEV === 'true') {
    app.listen(PORT, () => {
        console.log(`🍮 Sütlüce Kadayıf Backend v2 (Supabase) — Port ${PORT} (Lokal Sunucu)`);
        console.log(`📡 API: http://localhost:${PORT}/api`);
    });
}

// ─── Firebase Functions Export (Gen 2) ───
// G10'da firebase.json'a ikinci codebase olarak eklenir (function adı `api2`).
import { onRequest } from 'firebase-functions/v2/https';

export const api2 = onRequest(
    {
        memory: "2GiB",
        timeoutSeconds: 120,
        cors: false,
        region: "europe-west1"
    },
    app
);

// ─── Zamanlanmış işler ───
import { onSchedule } from 'firebase-functions/v2/scheduler';

// v2 cron'u paralel yayın boyunca KAPALI başlar (CRON_AKTIF=false): eski backend
// hâlâ günlük çekimi yapıyor, ikisi birden koşarsa aynı dönem iki kez çekilir.
// Geçiş gecesinde (G11) eski cron kapatılıp burası açılır.
const CRON_AKTIF = process.env.CRON_AKTIF === 'true';

// Her gün 07:00 — son GRACE_DAYS (7) gün içinde BİTEN bütçe dönemlerinin
// Meta+Google verisini çeker (dönem içinde dokunmaz).
export const otomatikRaporCekimi = onSchedule(
    {
        schedule: "0 7 * * *",
        timeZone: "Europe/Istanbul",
        memory: "1GiB",
        timeoutSeconds: 540,
        region: "europe-west1",
        retryCount: 2,                  // çekimler upsert — tekrar güvenli
    },
    async () => {
        if (!CRON_AKTIF) {
            console.log('[Scheduled] CRON_AKTIF=false — v2 çekimi atlandı (eski backend çekiyor).');
            return;
        }
        const { runScheduledFetch } = await import('./modules/reports/services/scheduled-fetch.js');
        const sonuc = await runScheduledFetch();
        console.log('[Scheduled] Otomatik çekim tamamlandı:', JSON.stringify(sonuc).slice(0, 800));

        if (sonuc.tumHatalar?.length > 0) {
            console.error(`[Scheduled] ${sonuc.tumHatalar.length} hata:\n` + sonuc.tumHatalar.join('\n'));
        }
        if (sonuc.kritikHata) {
            throw new Error(`Otomatik çekim: ${sonuc.kritikHata}`);
        }
    }
);

// Gece yedeği — C3'ten SONRA bu işin sahibi GitHub Actions
// (.github/workflows/gece-yedegi.yml): Workers'ın CPU bütçesi 1,8 MB gzip için
// dar ve S3 listeleme (budama) Workers'ta çalışmıyor.
// Fonksiyon SİLİNMEDİ, CRON_AKTIF kapısına alındı: api2 rollback hedefi olarak
// duruyor ve gerekirse tek bayrakla (CRON_AKTIF=true) yedeğin sahibi yine olur.
// O senaryoda GitHub Actions workflow'u devre dışı bırakılmalı — ikisi birden
// koşarsa aynı anahtara iki kez yazılır (zararsız ama gereksiz).
export const geceYedegi = onSchedule(
    {
        schedule: "0 3 * * *",
        timeZone: "Europe/Istanbul",
        memory: "1GiB",
        timeoutSeconds: 540,
        region: "europe-west1",
        retryCount: 1,
    },
    async () => {
        if (!CRON_AKTIF) {
            console.log('[Yedek] CRON_AKTIF=false — api2 yedeği atlandı (sahip GitHub Actions).');
            return;
        }
        const { yedekAl } = await import('./modules/reports/services/yedek.js');
        const sonuc = await yedekAl();
        console.log('[Yedek] tamamlandı:', JSON.stringify({ key: sonuc.key, satirlar: sonuc.satirlar, boyut: sonuc.boyut }));
    }
);

// ─── Process Error Handlers ───
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️  Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('🔥 Uncaught Exception:', err);
});
