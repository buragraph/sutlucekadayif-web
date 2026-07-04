import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Route imports
import menuRouter from './modules/qr-menu/routes/menu.js';
import productsRouter from './modules/qr-menu/routes/products.js';
// import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import categoriesRouter from './routes/categories.js';
import branchesRouter from './routes/branches.js';
import onboardingRouter from './routes/onboarding.js';
import profilRouter from './routes/profil.js';
import uploadRouter from './routes/upload.js';
import mediaRouter from './routes/media.js';
import aiRouter from './routes/ai.js';
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

// ─── Rate Limiting ───
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: 500,
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
app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = [
            process.env.FRONTEND_URL || 'http://localhost:5173',
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:5175',
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
    exposedHeaders: ['Content-Disposition']
}));
app.use(express.json({ limit: '1mb' }));

// ─── Routes ───
// Genel
// app.use('/api/auth', authLimiter, authRouter);
app.use('/api/users', authLimiter, usersRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/branches', branchesRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/profil', profilRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/media', mediaRouter);
app.use('/api/ai', aiRouter);

// QR Menü Modülü
app.use('/api/menu', menuRouter);
app.use('/api/products', productsRouter);

// Akademi Modülü
app.use('/api/academy/courses', academyCoursesRouter);
app.use('/api/academy/lessons', academyLessonsRouter);
app.use('/api/academy/upload', academyUploadRouter);
app.use('/api/academy/progress', academyProgressRouter);

// Rapor Modülü
app.use('/api/reports', reportsRouter);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
        console.log(`🍮 Sütlüce Kadayıf Backend — Port ${PORT} (Lokal Sunucu)`);
        console.log(`📡 API: http://localhost:${PORT}/api`);
    });
}

// ─── Firebase Functions Export (Gen 2) ───
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

export const api = onRequest(
    {
        memory: "2GiB",
        timeoutSeconds: 120,
        cors: false,
        region: "us-central1"
    },
    app
);

// ─── Otomatik Rapor Çekimi (dönem bitince) ───
// Her gün çalışır; SON 3 gün içinde BİTEN bütçe dönemlerinin Meta+Google verisini
// otomatik çeker (dönem içinde dokunmaz). Böylece dönem kapanınca gecikmeli harcama
// dahil son rakam manuel müdahale olmadan gelir.
export const otomatikRaporCekimi = onSchedule(
    {
        schedule: "0 7 * * *",          // her gün 07:00
        timeZone: "Europe/Istanbul",
        memory: "1GiB",
        timeoutSeconds: 540,
        region: "us-central1",
    },
    async () => {
        const { runScheduledFetch } = await import('./modules/reports/services/scheduled-fetch.js');
        const sonuc = await runScheduledFetch();
        console.log('[Scheduled] Otomatik çekim tamamlandı:', JSON.stringify(sonuc).slice(0, 800));
    }
);

// ─── Process Error Handlers ───
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️  Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('🔥 Uncaught Exception:', err);
});
