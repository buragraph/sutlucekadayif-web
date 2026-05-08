import { auth } from '../config/firebase.js';
import { db } from '../config/firebase.js';
import { hasPermission } from '../shared/permissions.js';

/**
 * Firebase ID Token doğrulama middleware'i.
 * Authorization header'dan Bearer token'ı alır ve doğrular.
 * Doğrulanmış kullanıcı bilgilerini req.user'a ekler.
 */
export const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Yetkilendirme token\'ı bulunamadı' });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await auth.verifyIdToken(token);

        // Custom claims üzerinden rol ve şube bilgisini al (veritabanı okuması iptal edildi)
        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            subeSlug: decodedToken.subeSlug || null,
            role: decodedToken.role || 'sube_sahibi',
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
