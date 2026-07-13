import { Router } from 'express';
import crypto from 'node:crypto';
import { db, auth } from '../config/firebase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

/**
 * GET /api/users
 * Tüm kullanıcıları listele (Firebase Auth + Firestore eşleştirmeleri)
 * Sadece admin erişebilir
 */
router.get(
    '/',
    verifyToken,
    requirePermission('users.view'),
    asyncHandler(async (req, res) => {
        // Firestore'daki tüm kullanıcı-şube eşleştirmelerini al
        const subeSnap = await db.collection('kullanici_sube').get();
        const subeMap = {};
        subeSnap.forEach((doc) => {
            subeMap[doc.id] = doc.data();
        });

        // Firebase Auth'dan kullanıcıları al
        const listResult = await auth.listUsers(1000);
        let users = listResult.users.map((user) => {
            const subeData = subeMap[user.uid] || {};
            return {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || null,
                disabled: user.disabled,
                createdAt: user.metadata.creationTime,
                lastSignIn: user.metadata.lastSignInTime,
                subeSlug: subeData.sube_slug || null,
                role: subeData.role || null,
                telefon: subeData.telefon || null,
            };
        });

        // Eğer kullanıcı şube sahibiyse, sadece kendi şubesindeki çalışanları görebilir
        if (req.user.role === 'sube_sahibi') {
            users = users.filter(u => u.subeSlug === req.user.subeSlug && u.role === 'calisan');
        }

        res.json({ users });
    })
);

/**
 * POST /api/users
 * Yeni kullanıcı oluştur
 * Body: { email, password, displayName?, subeSlug, role }
 */
router.post(
    '/',
    verifyToken,
    requirePermission('users.create'),
    asyncHandler(async (req, res) => {
        let { email, password, displayName, subeSlug, role } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'E-posta zorunludur' });
        }
        if (!role) {
            return res.status(400).json({ error: 'Rol zorunludur' });
        }
        if (role !== 'admin' && !subeSlug) {
            return res.status(400).json({ error: 'Şube yetkilisi veya çalışan için şube zorunludur' });
        }

        // Şube sahibi güvenliği: Sadece kendi şubesine çalışan ekleyebilir
        if (req.user.role === 'sube_sahibi') {
            role = 'calisan';
            subeSlug = req.user.subeSlug;
        }

        // Firebase Auth'da kullanıcı oluştur.
        // Şifre gönderilmediyse rastgele güçlü bir şifre atanır; kullanıcı kendi
        // şifresini e-postasına gelen "şifre belirleme" bağlantısıyla oluşturur.
        const gecerliSifre =
            password && String(password).length >= 6
                ? password
                : `Gecici-${crypto.randomBytes(24).toString('base64url')}`;
        const userRecord = await auth.createUser({
            email,
            password: gecerliSifre,
            displayName: displayName || null,
        });

        // Firestore'da şube eşleştirmesi yap
        const subeData = { role };
        if (subeSlug) subeData.sube_slug = subeSlug;
        await db.collection('kullanici_sube').doc(userRecord.uid).set(subeData);

        // Custom claims ata
        await auth.setCustomUserClaims(userRecord.uid, { role, subeSlug: subeSlug || null });

        res.status(201).json({
            uid: userRecord.uid,
            email: userRecord.email,
            displayName: userRecord.displayName,
            subeSlug,
            role,
        });
    })
);

/**
 * PUT /api/users/:uid
 * Kullanıcı bilgilerini güncelle
 * Body: { email?, displayName?, subeSlug?, role? }
 */
router.put(
    '/:uid',
    verifyToken,
    requirePermission('users.assignRole'),
    asyncHandler(async (req, res) => {
        const { uid } = req.params;
        let { email, displayName, subeSlug, role } = req.body;

        // Şube sahibi güvenliği: Sadece kendi şubesindeki çalışanları düzenleyebilir
        if (req.user.role === 'sube_sahibi') {
            const doc = await db.collection('kullanici_sube').doc(uid).get();
            const data = doc.data() || {};
            if (data.sube_slug !== req.user.subeSlug || data.role !== 'calisan') {
                return res.status(403).json({ error: 'Bu kullanıcıyı düzenleme yetkiniz yok' });
            }
            // Sube ve rol değiştirmesine izin verme
            subeSlug = undefined;
            role = undefined;
        }

        // Firebase Auth güncelle
        const updateData = {};
        if (email) updateData.email = email;
        if (displayName !== undefined) updateData.displayName = displayName || null;

        if (Object.keys(updateData).length > 0) {
            await auth.updateUser(uid, updateData);
        }

        // Firestore şube/rol güncelle
        if (subeSlug !== undefined || role !== undefined) {
            const subeUpdate = {};
            if (subeSlug !== undefined) subeUpdate.sube_slug = subeSlug;
            if (role !== undefined) subeUpdate.role = role;
            await db.collection('kullanici_sube').doc(uid).set(subeUpdate, { merge: true });

            // Custom claims ata (tümünü ezdiği için veritabanından güncel hali okuyup atıyoruz)
            const doc = await db.collection('kullanici_sube').doc(uid).get();
            const data = doc.data() || {};
            await auth.setCustomUserClaims(uid, { role: data.role || 'calisan', subeSlug: data.sube_slug || null });
        }

        res.json({ success: true });
    })
);

/**
 * DELETE /api/users/:uid
 * Kullanıcıyı sil
 */
router.delete(
    '/:uid',
    verifyToken,
    requirePermission('users.create'),
    asyncHandler(async (req, res) => {
        const { uid } = req.params;

        // Kendini silemesin
        if (uid === req.user.uid) {
            return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz' });
        }

        // Şube sahibi güvenliği: Sadece kendi şubesindeki çalışanları silebilir
        if (req.user.role === 'sube_sahibi') {
            const doc = await db.collection('kullanici_sube').doc(uid).get();
            const data = doc.data() || {};
            if (data.sube_slug !== req.user.subeSlug || data.role !== 'calisan') {
                return res.status(403).json({ error: 'Bu kullanıcıyı silme yetkiniz yok' });
            }
        }

        // Firebase Auth'dan sil
        await auth.deleteUser(uid);

        // Firestore eşleştirmesini sil
        await db.collection('kullanici_sube').doc(uid).delete();

        res.json({ success: true });
    })
);

export default router;
