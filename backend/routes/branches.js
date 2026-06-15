import { Router } from 'express';
import { db } from '../config/firebase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { bumpDataVersion } from '../modules/reports/db.js';
import { getKonumListe, syncAllKonumlar, upsertKonum, removeKonum } from '../shared/konum-store.js';

const router = Router();

/**
 * İl + ilçe metnini koordinata çevirir (OpenStreetMap Nominatim, ücretsiz/anahtarsız).
 * Harita işaretçisini ilçe seviyesinde konumlandırmak için kullanılır.
 * Best-effort: başarısız olursa null döner (harita il merkezine düşer).
 */
export async function geocodeIlce(il, ilce) {
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
 * Harita için hafif şube konum listesi. Tek bir denormalize dokümandan okunur →
 * admin'de bile 73 ayrı şube okuması yerine **1 read**. Liste şube yazımlarında
 * incremental güncellenir (shared/konum-store.js). İlk çağrıda doküman yoksa
 * tek seferlik subeler'den kurulur (lazy init).
 */
router.get(
    '/konumlar',
    verifyToken,
    requirePermission('branches.view'),
    asyncHandler(async (req, res) => {
        let liste = await getKonumListe();        // 1 read
        if (liste === null) liste = await syncAllKonumlar(); // ilk kez: tek seferlik kur

        // Admin tüm şubeleri görür; sube_sahibi yalnızca kendi şubesini
        let konumlar;
        if (req.user.role === 'admin') {
            konumlar = liste;
        } else if (req.user.subeSlug) {
            konumlar = liste.filter((k) => k.slug === req.user.subeSlug);
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
        await bumpDataVersion();        // rapor cache'leri (şube adı raporlarda görünür)
        await upsertKonum(slugVal, data); // harita konum dokümanı

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
        await bumpDataVersion(); // rapor cache'leri (şube adı değişebilir)
        // Harita konum dokümanını güncel şube durumuyla (eski + değişiklikler) güncelle
        await upsertKonum(slug, { ...doc.data(), ...updateData });
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
        await bumpDataVersion();   // rapor cache'leri
        await removeKonum(slug);   // harita konum dokümanından çıkar
        res.json({ success: true });
    })
);

export default router;
