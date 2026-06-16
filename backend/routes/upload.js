import { Router } from 'express';
import multer from 'multer';
import { uploadFile, deleteFile, urlToKey, r2, BUCKET, PUBLIC_URL } from '../config/r2.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import crypto from 'crypto';

const router = Router();

// Multer — memory storage, max 10MB
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Sadece JPEG, PNG, WebP ve GIF dosyaları yüklenebilir'));
        }
    },
});

/**
 * Görseli optimize et: max 800px genişlik, WebP, quality 80
 */
async function optimizeImage(buffer) {
    // sharp (native modül) cold start'ı şişirmemek için ilk kullanımda yüklenir
    const { default: sharp } = await import('sharp');
    return sharp(buffer)
        .resize(800, null, { withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
}

/**
 * GET /api/upload/proxy/*
 * R2'deki görseli doğrudan backend üzerinden sun
 * .r2.dev URL'si erişilemez olduğunda bile çalışır
 */
router.get(
    '/proxy/*',
    asyncHandler(async (req, res) => {
        const key = req.params[0];
        if (!key) return res.status(400).json({ error: 'Key gerekli' });

        // Hassas prefix'ler public proxy'den ASLA servis edilmez — dekontlar
        // (banka makbuzları) yetki gerektirir, /dekont/* endpoint'inden gider.
        if (key.startsWith('dekontlar/')) {
            return res.status(403).json({ error: 'Bu kaynağa erişim yetkiniz yok' });
        }

        // Helmet'in frame-ancestors 'self' / X-Frame-Options başlıkları PDF'in
        // farklı origin'deki (Pages) sayfaya <object>/<iframe> ile gömülmesini
        // engelliyor — bu public dosya proxy'si için gömmeye izin ver.
        res.removeHeader('X-Frame-Options');
        res.set('Content-Security-Policy', 'frame-ancestors *');
        res.set('Access-Control-Allow-Origin', '*');

        try {
            const result = await r2.send(new GetObjectCommand({
                Bucket: BUCKET,
                Key: key,
            }));

            const contentType = result.ContentType || 'image/webp';
            res.set('Content-Type', contentType);
            // JSON (ör. menü cache) sabit isimli ve değişken → kısa cache, taze kalsın.
            // Görsel/PDF içerik-adresli (uuid) → uzun süreli immutable cache.
            if (contentType.includes('application/json')) {
                res.set('Cache-Control', 'public, max-age=60');
            } else {
                res.set('Cache-Control', 'public, max-age=31536000, immutable');
            }

            // Stream R2 response to client
            const stream = result.Body;
            stream.pipe(res);
        } catch (err) {
            if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
                return res.status(404).json({ error: 'Görsel bulunamadı' });
            }
            throw err;
        }
    })
);



/**
 * GET /api/upload/dekont/*
 * Dekont (banka makbuzu) — kimlik doğrulamalı erişim. Yalnızca admin veya
 * dekontun ait olduğu şubenin sahibi görebilir. Anahtar: dekontlar/{kampanyaId}/{subeKod}.{ext}
 */
router.get(
    '/dekont/*',
    verifyToken,
    asyncHandler(async (req, res) => {
        const key = req.params[0] || '';
        if (!key.startsWith('dekontlar/')) {
            return res.status(400).json({ error: 'Geçersiz dekont yolu' });
        }

        // Erişim kontrolü: admin tümünü, şube sahibi yalnızca kendi şubesinin dekontunu
        const dosya = key.split('/')[2] || '';
        const subeKod = dosya.replace(/\.[^.]+$/, '');
        if (req.user.role !== 'admin' && req.user.subeSlug !== subeKod) {
            return res.status(403).json({ error: 'Bu dekonta erişim yetkiniz yok' });
        }

        try {
            const result = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
            res.set('Content-Type', result.ContentType || 'application/octet-stream');
            res.set('Cache-Control', 'private, no-store');
            result.Body.pipe(res);
        } catch (err) {
            if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
                return res.status(404).json({ error: 'Dekont bulunamadı' });
            }
            throw err;
        }
    })
);

/**
 * POST /api/upload/image
 * Tek resim yükle → optimize et → R2'ye kaydet, URL dön
 */
router.post(
    '/image',
    verifyToken,
    requirePermission('products.edit'),
    upload.single('image'),
    asyncHandler(async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'Dosya bulunamadı' });
        }

        const originalSize = req.file.buffer.length;
        const optimized = await optimizeImage(req.file.buffer);
        const folder = req.body.folder || 'urunler';
        const fileName = `${folder}/${crypto.randomUUID()}.webp`;

        const url = await uploadFile(optimized, fileName, 'image/webp');

        console.log(`📸 Görsel optimize: ${(originalSize / 1024).toFixed(0)}KB → ${(optimized.length / 1024).toFixed(0)}KB (${Math.round((1 - optimized.length / originalSize) * 100)}% küçültme)`);

        res.json({ url, key: fileName, originalSize, optimizedSize: optimized.length });
    })
);

/**
 * DELETE /api/upload/image
 * R2'den resim sil
 * Body: { url: string }
 */
router.delete(
    '/image',
    verifyToken,
    requirePermission('products.edit'),
    asyncHandler(async (req, res) => {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL gerekli' });

        const key = urlToKey(url);
        // Hassas dosyalar (dekontlar) ürün-görseli silme yolundan silinemez
        if (key && key.startsWith('dekontlar/')) {
            return res.status(403).json({ error: 'Bu dosya bu işlemle silinemez' });
        }
        if (key) await deleteFile(key);

        res.json({ success: true });
    })
);

export default router;
