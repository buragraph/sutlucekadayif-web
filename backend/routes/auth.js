import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

/**
 * GET /api/auth/me
 * Token ile giriş yapan kullanıcının bilgilerini döner
 */
router.get(
    '/me',
    verifyToken,
    asyncHandler(async (req, res) => {
        res.json({
            uid: req.user.uid,
            email: req.user.email,
            role: req.user.role,
            subeSlug: req.user.subeSlug,
        });
    })
);

export default router;
