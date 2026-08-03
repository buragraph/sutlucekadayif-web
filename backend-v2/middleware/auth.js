import { createRemoteJWKSet, jwtVerify } from 'jose';
import { hasPermission } from '../shared/permissions.js';

// Kimlik: Supabase Auth (Faz 2). Firebase dalı S2'de söküldü — geçiş haftasının
// çift doğrulayıcısı, D2 sayacı ve uid_eslesme çevirisi artık yok.
// Token asimetrik imzalı (ES256); anahtarlar JWKS'ten çekilip cache'lenir.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ISS = `${SUPABASE_URL}/auth/v1`;
const jwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

/**
 * Token doğrulama middleware'i.
 * Authorization header'daki Bearer token'ı doğrular, req.user'ı yazar:
 * { uid, email, role, subeSlug } — rota gövdeleri bu şekle bağlı.
 */
export const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Yetkilendirme token\'ı bulunamadı' });
        }

        const token = authHeader.split('Bearer ')[1];
        const { payload } = await jwtVerify(token, jwks, { issuer: SUPABASE_ISS });

        // Rol ve şube app_metadata'da (Firebase custom claim'lerinin karşılığı).
        // DİKKAT: app_metadata'da null anahtar saklanmaz → yokluk `|| null` ile normalize edilir.
        req.user = {
            uid: payload.sub,
            email: payload.email,
            subeSlug: payload.app_metadata?.subeSlug || null,
            role: payload.app_metadata?.role || 'calisan',
        };

        next();
    } catch (error) {
        console.error('Token doğrulama hatası:', error);
        return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });
    }
};

/**
 * Yetki kontrolü middleware'i — shared/permissions.js kullanır.
 * @param {string} permission — Yetki key'i (ör: 'products.toggleAvailability')
 */
export const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Önce giriş yapmalısınız' });
        }
        if (!hasPermission(req.user.role, permission)) {
            return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
        }
        next();
    };
};
