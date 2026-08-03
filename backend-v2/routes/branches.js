import { Router } from '../shared/router.js';
import { supabase } from '../config/supabase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { temizNull, veriYaDaHata, tumSatirlar } from '../utils/veri.js';
import { deleteMenuJson } from '../modules/qr-menu/services/menu-cache.js';

// konum-store.js KULLANILMIYOR: il/ilçe/lat/lng artık şube satırının kolonu,
// tek-doküman konum listesi ve transaction'ı yapısal olarak gereksiz.
// bumpDataVersion da yok (versionedCacheMiddleware ile birlikte ölüyor).

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

/** Rol bazlı şube kapsamı — admin hepsi, şube sahibi yalnızca kendi şubesi. */
function kapsamUygula(sorgu, req) {
    if (req.user.role === 'admin') return sorgu;
    if (req.user.subeSlug) return sorgu.eq('kod', req.user.subeSlug);
    return sorgu.eq('kod', '__yok__');
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
        const [satirlar, subeOzelUrunler, ortakSonuc] = await Promise.all([
            kapsamUygula(supabase.from('subeler').select('*'), req)
                .then((r) => veriYaDaHata(r, 'şubeler okunamadı')),
            // Şubeye özel ürün sayıları — eskiden şube başına bir count() sorgusuydu
            // (88 şubede 88 sorgu), şimdi tek okumada.
            tumSatirlar(() => supabase.from('urunler').select('sube_kod').not('sube_kod', 'is', null),
                { sirala: 'id', baglam: 'şube ürünleri' }),
            supabase.from('urunler').select('*', { count: 'exact', head: true }).eq('tur', 'ortak'),
        ]);

        const sayac = {};
        for (const u of subeOzelUrunler) sayac[u.sube_kod] = (sayac[u.sube_kod] || 0) + 1;

        // Eski yanıt Firestore doküman verisini yayıyordu: `kod` ve `olusturma`
        // alanları YOKTU (kod doküman id'siydi, olusturma hiç yazılmıyordu).
        const subeler = satirlar.map(({ kod, olusturma, ...s }) => temizNull({
            id: kod,
            slug: kod,
            urunSayisi: sayac[kod] || 0,
            ...s,
        }));

        res.json({ subeler, ortakUrunSayisi: ortakSonuc.count ?? 0 });
    })
);

/**
 * GET /api/branches/konumlar
 * Harita için hafif şube konum listesi. Eskiden tek denormalize dokümandan
 * okunuyordu (konum-store.js); artık doğrudan şube satırlarının kolonlarından —
 * senkron tutulacak ikinci bir kopya yok.
 */
router.get(
    '/konumlar',
    verifyToken,
    requirePermission('branches.view'),
    asyncHandler(async (req, res) => {
        const satirlar = veriYaDaHata(
            await kapsamUygula(supabase.from('subeler').select('kod, ad, il, ilce, lat, lng'), req),
            'konumlar okunamadı'
        );
        // Şekil eski `konumlar` dokümanıyla birebir: konum-store girdileri
        // `il: d.il || null` kalıbıyla yazıyordu — boş string null'a düşer ve
        // lat/lng anahtarları her zaman bulunur.
        const konumlar = satirlar.map((s) => ({
            slug: s.kod,
            ad: s.ad || s.kod,
            il: s.il || null,
            ilce: s.ilce || null,
            lat: s.lat === null || s.lat === undefined ? null : Number(s.lat),
            lng: s.lng === null || s.lng === undefined ? null : Number(s.lng),
        }));
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

        const slugVal = slug.trim().toLowerCase();

        // Slug benzersiz olmalı
        const { data: mevcut } = await supabase.from('subeler').select('kod').eq('kod', slugVal).maybeSingle();
        if (mevcut) {
            return res.status(400).json({ error: 'Bu slug zaten kullanılıyor' });
        }

        const data = {
            kod: slugVal,
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

        veriYaDaHata(await supabase.from('subeler').insert(data), 'şube eklenemedi');

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

        const { data: doc } = await supabase.from('subeler').select('*').eq('kod', slug).maybeSingle();
        if (!doc) {
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
            const finalIl = updateData.il ?? doc.il;
            const finalIlce = updateData.ilce ?? doc.ilce;
            const konum = await geocodeIlce(finalIl, finalIlce);
            if (konum) { updateData.lat = konum.lat; updateData.lng = konum.lng; }
        }

        if (Object.keys(updateData).length > 0) {
            veriYaDaHata(
                await supabase.from('subeler').update(updateData).eq('kod', slug),
                'şube güncellenemedi'
            );
        }
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

        const { data: doc } = await supabase.from('subeler').select('kod').eq('kod', slug).maybeSingle();
        if (!doc) {
            return res.status(404).json({ error: 'Şube bulunamadı' });
        }

        // Şubeye atanmış kullanıcı var mı?
        // DİKKAT: eski sürüm `where('subeSlug','==',slug)` sorguluyordu ama alanın
        // gerçek adı `sube_slug` — koruma hiç devreye girmiyordu. Burada doğru
        // kolonla çalışıyor (bilinçli davranış düzeltmesi).
        const { count: kullaniciSayisi } = await supabase
            .from('kullanici_sube').select('*', { count: 'exact', head: true }).eq('sube_slug', slug);
        if (kullaniciSayisi > 0) {
            return res.status(400).json({ error: 'Bu şubeye atanmış kullanıcılar var. Önce kullanıcıları başka şubeye taşıyın.' });
        }

        // Dönemler ve şubeye özel ürünler FK'da `on delete cascade` — Firestore'daki
        // "alt koleksiyonlar öksüz kalır" sorunu yapısal olarak yok.
        veriYaDaHata(await supabase.from('subeler').delete().eq('kod', slug), 'şube silinemedi');

        // R2'deki menü JSON'ı da gitmeli; kalırsa /menu/{slug} silinmiş şubenin
        // menüsünü servis etmeye devam eder (public uç önce R2'ye bakıyor).
        await deleteMenuJson(slug).catch(console.error);
        res.json({ success: true });
    })
);

export default router;
