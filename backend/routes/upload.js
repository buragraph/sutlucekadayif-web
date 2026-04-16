import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
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

        try {
            const result = await r2.send(new GetObjectCommand({
                Bucket: BUCKET,
                Key: key,
            }));

            res.set('Content-Type', result.ContentType || 'image/webp');
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
            res.set('Access-Control-Allow-Origin', '*');

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
        if (key) await deleteFile(key);

        res.json({ success: true });
    })
);

export default router;
