import { Router } from 'express';
import { db, auth } from '../config/firebase.js';
import { verifyToken } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

/**
 * GET /api/profil
 * Şube sahibinin kendi profil verisi — hesap + mağaza + fatura/vergi.
 * Veriler ait oldukları kayıtlardan derlenir:
 * - hesap: Auth (ad soyad, e-posta) + kullanici_sube (telefon)
 * - mağaza: subeler (ad, il, ilçe, adres)
 * - fatura/vergi: subeler (vkn, fatura adresi, şirket tipi)
 */
router.get(
    '/',
    verifyToken,
    asyncHandler(async (req, res) => {
        // Profil = atanmış olunan şube. Şube sahibi kendi şubesini görür; admin de
        // (simülasyon dahil) bir şubeye atanmışsa o şubenin profilini görebilir.
        if (!req.user.subeSlug) {
            return res.status(403).json({ error: 'Profil için bir şubeye atanmış olmanız gerekir.' });
        }

        const [authUser, userDoc, subeDoc] = await Promise.all([
            auth.getUser(req.user.uid).catch(() => null),
            db.collection('kullanici_sube').doc(req.user.uid).get(),
            db.collection('subeler').doc(req.user.subeSlug).get(),
        ]);

        const u = userDoc.exists ? userDoc.data() : {};
        const s = subeDoc.exists ? subeDoc.data() : {};

        res.json({
            hesap: {
                ad_soyad: authUser?.displayName || '',
                email: authUser?.email || '',
                telefon: u.telefon || '',
            },
            magaza: {
                kod: req.user.subeSlug,
                ad: s.ad || '',
                il: s.il || '',
                ilce: s.ilce || '',
                adres: s.adres || '',
            },
            fatura: {
                vkn: s.vkn || '',
                fatura_adresi: s.fatura_adresi || '',
                sirket_tipi: s.sirket_tipi || '',
            },
        });
    })
);

export default router;
