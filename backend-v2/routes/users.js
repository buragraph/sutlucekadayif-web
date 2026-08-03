import { Router } from '../shared/router.js';
import crypto from 'node:crypto';
import { supabase } from '../config/supabase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import {
    claimYaz,
    hesapAlanlari,
    kullaniciGuncelle,
    kullaniciSil,
    kullaniciYarat,
    tumKullanicilar,
} from '../shared/kullanici-dizini.js';
import asyncHandler from '../utils/asyncHandler.js';
import { veriYaDaHata } from '../utils/veri.js';

// Kimlik Faz 2'de Supabase Auth'ta; rol/şube eşlemesi kullanici_sube'de.
// Hesap alanlarının Firebase biçimine çevrilmesi shared/kullanici-dizini.js'te.

const router = Router();

/**
 * GET /api/users
 * Tüm kullanıcıları listele (Supabase Auth + kullanici_sube eşleştirmeleri)
 * Sadece admin erişebilir
 */
router.get(
    '/',
    verifyToken,
    requirePermission('users.view'),
    asyncHandler(async (req, res) => {
        const satirlar = veriYaDaHata(
            await supabase.from('kullanici_sube').select('uid, role, sube_slug, telefon'),
            'kullanici_sube okunamadı'
        );
        const subeMap = Object.fromEntries(satirlar.map((s) => [s.uid, s]));

        let users = (await tumKullanicilar()).map((user) => {
            const subeData = subeMap[user.id] || {};
            const hesap = hesapAlanlari(user);
            return {
                uid: hesap.uid,
                email: hesap.email,
                displayName: hesap.displayName,
                disabled: hesap.disabled,
                createdAt: hesap.createdAt,
                lastSignIn: hesap.lastSignIn,
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

        // Şifre gönderilmediyse rastgele güçlü bir şifre atanır; kullanıcıya
        // parolasını yönetici iletir (panelde "şifremi unuttum" akışı yok).
        const gecerliSifre =
            password && String(password).length >= 6
                ? password
                : `Gecici-${crypto.randomBytes(24).toString('base64url')}`;
        const yeni = await kullaniciYarat({
            email,
            password: gecerliSifre,
            displayName: displayName || null,
            role,
            subeSlug: subeSlug || null,
        });

        // Rol/şube eşleştirmesi — sube_slug FK'lı, boş string null'a düşer.
        // Yazılamazsa Auth kullanıcısı ortada kalmasın: geri al.
        try {
            veriYaDaHata(
                await supabase.from('kullanici_sube').upsert(
                    { uid: yeni.id, role, sube_slug: subeSlug || null },
                    { onConflict: 'uid' }
                ),
                'kullanıcı kaydı yazılamadı'
            );
        } catch (err) {
            await kullaniciSil(yeni.id).catch(() => {});
            throw err;
        }

        res.status(201).json({
            uid: yeni.id,
            email: yeni.email,
            // displayName verilmediyse anahtar hiç dönmez (Faz 1 davranışı)
            displayName: yeni.user_metadata?.displayName,
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
            const { data } = await supabase
                .from('kullanici_sube').select('role, sube_slug').eq('uid', uid).maybeSingle();
            if (!data || data.sube_slug !== req.user.subeSlug || data.role !== 'calisan') {
                return res.status(403).json({ error: 'Bu kullanıcıyı düzenleme yetkiniz yok' });
            }
            // Sube ve rol değiştirmesine izin verme
            subeSlug = undefined;
            role = undefined;
        }

        // Auth hesabını güncelle
        await kullaniciGuncelle(uid, {
            ...(email ? { email } : {}),
            ...(displayName !== undefined ? { displayName: displayName || null } : {}),
        });

        // Şube/rol güncelle
        if (subeSlug !== undefined || role !== undefined) {
            const yama = { uid };
            if (subeSlug !== undefined) yama.sube_slug = subeSlug || null;
            if (role !== undefined) yama.role = role;
            veriYaDaHata(
                await supabase.from('kullanici_sube').upsert(yama, { onConflict: 'uid' }),
                'kullanıcı kaydı güncellenemedi'
            );

            // Claim'leri yaz (tümünü ezdiği için veritabanından güncel hali okuyup atıyoruz)
            const { data } = await supabase
                .from('kullanici_sube').select('role, sube_slug').eq('uid', uid).maybeSingle();
            await claimYaz(uid, {
                role: data?.role || 'calisan',
                subeSlug: data?.sube_slug || null,
            });
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
            const { data } = await supabase
                .from('kullanici_sube').select('role, sube_slug').eq('uid', uid).maybeSingle();
            if (!data || data.sube_slug !== req.user.subeSlug || data.role !== 'calisan') {
                return res.status(403).json({ error: 'Bu kullanıcıyı silme yetkiniz yok' });
            }
        }

        // Auth hesabını sil
        await kullaniciSil(uid);

        // Eşleştirmeyi sil
        veriYaDaHata(
            await supabase.from('kullanici_sube').delete().eq('uid', uid),
            'kullanıcı kaydı silinemedi'
        );

        res.json({ success: true });
    })
);

export default router;
