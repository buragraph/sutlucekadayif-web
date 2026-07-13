import { Router } from 'express';
import multer from 'multer';
import { uploadFile, deleteFile, urlToKey, isKeyAllowed } from '../../../config/r2.js';
import { verifyToken, requirePermission } from '../../../middleware/auth.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import crypto from 'crypto';

const router = Router();

// Multer — memory storage, max 100MB (video/PDF)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = [
            'video/mp4', 'video/webm', 'video/quicktime',
            'application/pdf',
        ];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Sadece MP4, WebM, MOV video ve PDF dosyaları yüklenebilir'));
        }
    },
});

/**
 * POST /api/academy/upload/file
 * Video veya PDF yükle → R2'ye kaydet, URL dön
 */
router.post(
    '/file',
    verifyToken,
    requirePermission('academy.manage'),
    upload.single('file'),
    asyncHandler(async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'Dosya bulunamadı' });
        }

        const ext = req.file.originalname.split('.').pop().toLowerCase();
        const isVideo = req.file.mimetype.startsWith('video/');
        const folder = isVideo ? 'academy/videos' : 'academy/pdfs';
        const fileName = `${folder}/${crypto.randomUUID()}.${ext}`;

        const url = await uploadFile(req.file.buffer, fileName, req.file.mimetype);

        console.log(`📚 Akademi dosya yüklendi: ${req.file.originalname} (${(req.file.buffer.length / (1024 * 1024)).toFixed(1)}MB)`);

        res.json({
            url,
            key: fileName,
            originalName: req.file.originalname,
            size: req.file.buffer.length,
            mimeType: req.file.mimetype,
        });
    })
);

/**
 * DELETE /api/academy/upload/file
 * R2'den dosya sil
 */
router.delete(
    '/file',
    verifyToken,
    requirePermission('academy.manage'),
    asyncHandler(async (req, res) => {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL gerekli' });

        // Pozitif allow-list (urunler/, menu/, academy/) dışına ve dekontlar/'a
        // asla izin verme — bkz. backend/config/r2.js isKeyAllowed
        const key = urlToKey(url);
        if (!key) return res.status(400).json({ error: 'Geçersiz dosya URL\'i' });
        if (!isKeyAllowed(key, { forDelete: true })) {
            return res.status(403).json({ error: 'Bu dosyayı silme yetkiniz yok' });
        }
        await deleteFile(key);

        res.json({ success: true });
    })
);

export default router;
