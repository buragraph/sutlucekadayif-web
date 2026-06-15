import { Router } from 'express';
import { db, auth } from '../config/firebase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { geocodeIlce } from './branches.js';
import { bumpDataVersion } from '../modules/reports/db.js';
import { upsertKonum } from '../shared/konum-store.js';

const router = Router();

/**
 * İlk giriş (onboarding) akışı — yalnızca şube sahipleri içindir.
 * Şube sahibi ilk girişte bilgilerini doldurana kadar zorunlu wizard görür.
 *
 * Veri ait olduğu yere yazılır:
 * - ad_soyad → Firebase Auth displayName (kullanıcı hesabı)
 * - telefon  → kullanici_sube dokümanı (kullanıcı kaydı)
 * - il/ilce/adres → subeler dokümanı (şubenin fiziksel konumu; harita bunu okur)
 * - onboarded bayrağı → kullanici_sube dokümanı
 */

// Kişiye ait alanlar (kullanici_sube dokümanına) — ad_soyad ayrı (Auth displayName)
const KULLANICI_ALANLARI = ['telefon'];
// Şubeye ait alanlar (subeler dokümanına)
const SUBE_ALANLARI = ['il', 'ilce', 'adres'];

/**
 * GET /api/onboarding/status
 * Onboarding gerekli mi + mevcut değerlerle ön-doldurma verisi döner.
 */
router.get(
    '/status',
    verifyToken,
    asyncHandler(async (req, res) => {
        // Yalnızca şubeye bağlı şube sahipleri onboarding'e tabidir
        if (req.user.role !== 'sube_sahibi' || !req.user.subeSlug) {
            return res.json({ gerekli: false, onboarded: true, prefill: {} });
        }

        const userDoc = await db.collection('kullanici_sube').doc(req.user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const onboarded = userData.onboarded === true;

        let prefill = {};
        if (!onboarded) {
            const subeDoc = await db.collection('subeler').doc(req.user.subeSlug).get();
            const d = subeDoc.exists ? subeDoc.data() : {};
            let ad_soyad = '';
            try {
                const u = await auth.getUser(req.user.uid);
                ad_soyad = u.displayName || '';
            } catch { /* displayName yoksa boş */ }
            prefill = {
                ad_soyad,
                ...Object.fromEntries(KULLANICI_ALANLARI.map((k) => [k, userData[k] || ''])),
                ...Object.fromEntries(SUBE_ALANLARI.map((k) => [k, d[k] || ''])),
            };
        }

        res.json({ gerekli: !onboarded, onboarded, prefill });
    })
);

/**
 * POST /api/onboarding/complete
 * Her veriyi ait olduğu kayda yazar, tamamlandı bayrağını set eder.
 */
router.post(
    '/complete',
    verifyToken,
    asyncHandler(async (req, res) => {
        if (req.user.role !== 'sube_sahibi' || !req.user.subeSlug) {
            return res.status(403).json({ error: 'Bu işlem yalnızca şube sahipleri içindir.' });
        }

        const adSoyad = (req.body.ad_soyad || '').trim();
        const kullaniciVeri = Object.fromEntries(KULLANICI_ALANLARI.map((k) => [k, (req.body[k] || '').trim()]));
        const subeVeri = Object.fromEntries(SUBE_ALANLARI.map((k) => [k, (req.body[k] || '').trim()]));

        // Temel doğrulama — tüm alanlar zorunlu (akış zorunlu olduğu için)
        const eksik = [];
        if (!adSoyad) eksik.push('ad_soyad');
        for (const [k, v] of [...Object.entries(kullaniciVeri), ...Object.entries(subeVeri)]) {
            if (!v) eksik.push(k);
        }
        if (eksik.length > 0) {
            return res.status(400).json({ error: 'Tüm alanlar zorunludur.', eksik });
        }

        const subeRef = db.collection('subeler').doc(req.user.subeSlug);
        const subeDoc = await subeRef.get();
        if (!subeDoc.exists) {
            return res.status(404).json({ error: 'Şubeniz bulunamadı.' });
        }

        // İl/ilçe konumunu haritaya işle (best-effort, başarısızsa il merkezine düşer)
        const konum = await geocodeIlce(subeVeri.il, subeVeri.ilce);
        if (konum) {
            subeVeri.lat = konum.lat;
            subeVeri.lng = konum.lng;
        }

        // Şube verisi → subeler dokümanı
        await subeRef.update(subeVeri);
        await bumpDataVersion(); // rapor cache'leri
        // Harita konum dokümanını güncelle (il/ilçe/konum değişti)
        await upsertKonum(req.user.subeSlug, { ad: subeDoc.data().ad, ...subeVeri });
        // Ad Soyad → kullanıcı hesabı displayName (Kullanıcılar listesinde görünür)
        await auth.updateUser(req.user.uid, { displayName: adSoyad });
        // Telefon + tamamlandı bayrağı → kullanici_sube dokümanı (kullanıcı kaydı)
        await db.collection('kullanici_sube').doc(req.user.uid).set(
            { ...kullaniciVeri, onboarded: true, onboardedAt: new Date().toISOString() },
            { merge: true }
        );

        res.json({ success: true });
    })
);

/**
 * POST /api/onboarding/reset/:uid
 * Admin bir kullanıcının ilk-giriş wizard'ını sıfırlar — onboarded bayrağını kaldırır.
 * Kullanıcı bir sonraki girişinde (veya sayfa yenilemesinde) wizard'ı tekrar görür.
 */
router.post(
    '/reset/:uid',
    verifyToken,
    requirePermission('users.resetOnboarding'),
    asyncHandler(async (req, res) => {
        const { uid } = req.params;
        const userDoc = await db.collection('kullanici_sube').doc(uid).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'Kullanıcı kaydı bulunamadı.' });
        }
        await db.collection('kullanici_sube').doc(uid).set({ onboarded: false }, { merge: true });
        res.json({ success: true });
    })
);

export default router;
