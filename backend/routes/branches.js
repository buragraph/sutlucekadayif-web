import { Router } from 'express';
import { db } from '../config/firebase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

/**
 * İl + ilçe metnini koordinata çevirir (OpenStreetMap Nominatim, ücretsiz/anahtarsız).
 * Harita işaretçisini ilçe seviyesinde konumlandırmak için kullanılır.
 * Best-effort: başarısız olursa null döner (harita il merkezine düşer).
 */
async function geocodeIlce(il, ilce) {
    if (!il || !ilce) return null;
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&country=Turkey&state=${encodeURIComponent(il)}&county=${encodeURIComponent(ilce)}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'SutluceKadayifWeb/1.0 (sube konum)' } });
        if (!res.ok) return null;
        const arr = await res.json();
        if (!arr[0]) return null;
        const lat = parseFloat(arr[0].lat);
        const lng = parseFloat(arr[0].lon);
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    } catch {
        return null;
    }
}

/**
 * GET /api/branches
 * Tüm şubeleri listele
 */
router.get(
    '/',
    verifyToken,
    requirePermission('branches.view'),
    asyncHandler(async (req, res) => {
        const snap = await db.collection('subeler').get();
        const promises = snap.docs.map(async (d) => {
            const countSnap = await d.ref.collection('urunler').count().get();
            return { id: d.id, slug: d.id, urunSayisi: countSnap.data().count, ...d.data() };
        });
        const subeler = await Promise.all(promises);

        const ortakCountSnap = await db.collection('ortak_urunler').count().get();
        const ortakUrunSayisi = ortakCountSnap.data().count;

        res.json({ subeler, ortakUrunSayisi });
    })
);

/**
 * GET /api/branches/konumlar
 * Harita için hafif şube konum listesi — sadece ad + il + ilçe.
 * Ürün sayım sorguları (N ek read) yapılmaz. Cache yok: şube/il-ilçe
 * güncellemesi sonrası multi-instance bayatlık olmasın diye hep taze okunur
 * (admin'e özel, seyrek çağrı — N read kabul edilebilir).
 */
router.get(
    '/konumlar',
    verifyToken,
    requirePermission('branches.view'),
    asyncHandler(async (req, res) => {
        const toKonum = (id, data) => ({
            slug: id, ad: data.ad || id, il: data.il || null, ilce: data.ilce || null,
            lat: data.lat ?? null, lng: data.lng ?? null,
        });

        // Admin tüm şubeleri görür; sube_sahibi yalnızca kendi şubesini (1 read)
        let konumlar;
        if (req.user.role === 'admin') {
            const snap = await db.collection('subeler').get();
            konumlar = snap.docs.map((d) => toKonum(d.id, d.data()));
        } else if (req.user.subeSlug) {
            const doc = await db.collection('subeler').doc(req.user.subeSlug).get();
            konumlar = doc.exists ? [toKonum(doc.id, doc.data())] : [];
        } else {
            konumlar = [];
        }
        res.json({ konumlar });
    })
);

/**
 * POST /api/branches
 * Yeni şube oluştur
 * Body: { slug, ad, adres?, telefon? }
 */
router.post(
    '/',
    verifyToken,
    requirePermission('branches.create'),
    asyncHandler(async (req, res) => {
        const { slug, ad, adres, telefon, yetkili_adi, fatura_adresi, vkn, sirket_tipi, il, ilce } = req.body;

        if (!slug || !slug.trim()) {
            return res.status(400).json({ error: 'Şube slug zorunludur (URL kısmı, örn: ankara)' });
        }
        if (!ad || !ad.trim()) {
            return res.status(400).json({ error: 'Şube adı zorunludur' });
        }

        // Slug benzersiz olmalı
        const existing = await db.collection('subeler').doc(slug.trim().toLowerCase()).get();
        if (existing.exists) {
            return res.status(400).json({ error: 'Bu slug zaten kullanılıyor' });
        }

        const slugVal = slug.trim().toLowerCase();
        const data = {
            ad: ad.trim(),
            adres: adres?.trim() || '',
            telefon: telefon?.trim() || '',
            yetkili_adi: yetkili_adi?.trim() || '',
            fatura_adresi: fatura_adresi?.trim() || '',
            vkn: vkn?.trim() || '',
            sirket_tipi: sirket_tipi?.trim() || '',
            il: il?.trim() || '',
            ilce: ilce?.trim() || '',
        };
        // İlçe seviyesinde harita konumu — best-effort geocode
        const konum = await geocodeIlce(data.il, data.ilce);
        if (konum) { data.lat = konum.lat; data.lng = konum.lng; }
        await db.collection('subeler').doc(slugVal).set(data);

        res.status(201).json({ slug: slugVal, ad: ad.trim() });
    })
);

/**
 * PUT /api/branches/:slug
 * Şube güncelle
 * Body: { ad?, adres?, telefon? }
 */
router.put(
    '/:slug',
    verifyToken,
    requirePermission('branches.edit'),
    asyncHandler(async (req, res) => {
        const { slug } = req.params;
        const { ad, adres, telefon, yetkili_adi, fatura_adresi, vkn, sirket_tipi, il, ilce } = req.body;

        const docRef = db.collection('subeler').doc(slug);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Şube bulunamadı' });
        }

        const updateData = {};
        if (ad !== undefined) updateData.ad = ad.trim();
        if (adres !== undefined) updateData.adres = adres.trim();
        if (telefon !== undefined) updateData.telefon = telefon.trim();
        if (yetkili_adi !== undefined) updateData.yetkili_adi = yetkili_adi.trim();
        if (fatura_adresi !== undefined) updateData.fatura_adresi = fatura_adresi.trim();
        if (vkn !== undefined) updateData.vkn = vkn.trim();
        if (sirket_tipi !== undefined) updateData.sirket_tipi = sirket_tipi.trim();
        if (il !== undefined) updateData.il = il.trim();
        if (ilce !== undefined) updateData.ilce = ilce.trim();

        // İl/ilçe değiştiyse harita konumunu yeniden geocode et (best-effort)
        if (il !== undefined || ilce !== undefined) {
            const finalIl = updateData.il ?? doc.data().il;
            const finalIlce = updateData.ilce ?? doc.data().ilce;
            const konum = await geocodeIlce(finalIl, finalIlce);
            if (konum) { updateData.lat = konum.lat; updateData.lng = konum.lng; }
        }

        await docRef.update(updateData);
        res.json({ success: true });
    })
);

/**
 * DELETE /api/branches/:slug
 * Şube sil
 */
router.delete(
    '/:slug',
    verifyToken,
    requirePermission('branches.delete'),
    asyncHandler(async (req, res) => {
        const { slug } = req.params;

        const docRef = db.collection('subeler').doc(slug);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Şube bulunamadı' });
        }

        // Şubeye atanmış kullanıcı var mı kontrol et
        const userSnap = await db.collection('kullanici_sube').where('subeSlug', '==', slug).limit(1).get();
        if (!userSnap.empty) {
            return res.status(400).json({ error: 'Bu şubeye atanmış kullanıcılar var. Önce kullanıcıları başka şubeye taşıyın.' });
        }

        await docRef.delete();
        res.json({ success: true });
    })
);

export default router;
