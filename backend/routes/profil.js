import { Router } from 'express';
import { db, auth } from '../config/firebase.js';
import { verifyToken } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { geocodeIlce } from './branches.js';
import { bumpDataVersion } from '../modules/reports/db.js';
import { upsertKonum } from '../shared/konum-store.js';

const router = Router();

// Düzenlenebilir şube alanları — şube ADI buradan değiştirilemez (merkezî yönetilir).
const SUBE_ALANLARI = ['il', 'ilce', 'adres', 'vkn', 'fatura_adresi', 'sirket_tipi'];
// konum dokümanını ilgilendiren (haritada görünen) alanlar
const KONUM_ALANLARI = ['il', 'ilce', 'lat', 'lng'];

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
        const authUser = await auth.getUser(req.user.uid).catch(() => null);

        // Şubeye atanmamış kullanıcı (ör. admin) → yalnızca hesap bilgisi.
        // Profil tüm rollerde erişilebilir; mağaza/fatura yalnızca şubesi olanlarda.
        if (!req.user.subeSlug) {
            const uDoc = await db.collection('kullanici_sube').doc(req.user.uid).get();
            return res.json({
                hesap: {
                    ad_soyad: authUser?.displayName || '',
                    email: authUser?.email || '',
                    telefon: (uDoc.exists ? uDoc.data().telefon : '') || '',
                },
                magaza: null,
                fatura: null,
            });
        }

        const [userDoc, subeDoc] = await Promise.all([
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

/**
 * PUT /api/profil
 * Profil alanlarını günceller (kısmi). Her veri ait olduğu kayda yazılır:
 * - ad_soyad → Auth displayName
 * - telefon  → kullanici_sube
 * - şube alanları (ad/il/ilce/adres/vkn/fatura_adresi/sirket_tipi) → subeler
 *   (il/ilçe değişince yeniden geocode + konum dokümanı senkron)
 * E-posta buradan değiştirilmez (hesap güvenliği).
 */
router.put(
    '/',
    verifyToken,
    asyncHandler(async (req, res) => {
        // Ad Soyad → Auth displayName
        if (req.body.ad_soyad !== undefined) {
            await auth.updateUser(req.user.uid, { displayName: String(req.body.ad_soyad).trim() });
        }

        // Telefon → kullanici_sube
        if (req.body.telefon !== undefined) {
            await db.collection('kullanici_sube').doc(req.user.uid).set(
                { telefon: String(req.body.telefon).trim() },
                { merge: true }
            );
        }

        // Şube alanları — yalnızca bir şubeye atanmış kullanıcı
        if (req.user.subeSlug) {
            const subeVeri = {};
            for (const k of SUBE_ALANLARI) {
                if (req.body[k] !== undefined) subeVeri[k] = String(req.body[k]).trim();
            }
            if (Object.keys(subeVeri).length > 0) {
                const subeRef = db.collection('subeler').doc(req.user.subeSlug);
                // İl/ilçe değiştiyse haritadaki konumu yeniden hesapla
                if (subeVeri.il !== undefined || subeVeri.ilce !== undefined) {
                    const cur = (await subeRef.get()).data() || {};
                    const il = subeVeri.il !== undefined ? subeVeri.il : cur.il;
                    const ilce = subeVeri.ilce !== undefined ? subeVeri.ilce : cur.ilce;
                    const konum = await geocodeIlce(il, ilce);
                    if (konum) { subeVeri.lat = konum.lat; subeVeri.lng = konum.lng; }
                }
                await subeRef.update(subeVeri);
                await bumpDataVersion(); // rapor cache'leri

                // Konum dokümanını yalnızca harita-ilgili alan değiştiyse güncelle
                const konumPatch = {};
                for (const k of KONUM_ALANLARI) if (subeVeri[k] !== undefined) konumPatch[k] = subeVeri[k];
                if (Object.keys(konumPatch).length > 0) await upsertKonum(req.user.subeSlug, konumPatch);
            }
        }

        res.json({ success: true });
    })
);

export default router;
