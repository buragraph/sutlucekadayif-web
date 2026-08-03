import { Router } from '../shared/router.js';
import { supabase } from '../config/supabase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { hesapAlanlari, kullaniciGetir, kullaniciGuncelle } from '../shared/kullanici-dizini.js';
import asyncHandler from '../utils/asyncHandler.js';
import { veriYaDaHata } from '../utils/veri.js';
import { geocodeIlce } from './branches.js';

const router = Router();

/**
 * İlk giriş (onboarding) akışı — yalnızca şube sahipleri içindir.
 * Şube sahibi ilk girişte bilgilerini doldurana kadar zorunlu wizard görür.
 *
 * Veri ait olduğu yere yazılır:
 * - ad_soyad → Firebase Auth displayName (kullanıcı hesabı)
 * - telefon  → kullanici_sube satırı
 * - il/ilce/adres → subeler satırı (şubenin fiziksel konumu; harita bunu okur)
 * - onboarded bayrağı → kullanici_sube satırı
 */

// Kişiye ait alanlar (kullanici_sube) — ad_soyad ayrı (Auth displayName)
const KULLANICI_ALANLARI = ['telefon'];
// Şubeye ait alanlar (subeler)
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

        const { data: userData } = await supabase
            .from('kullanici_sube').select('*').eq('uid', req.user.uid).maybeSingle();
        const onboarded = userData?.onboarded === true;

        let prefill = {};
        if (!onboarded) {
            const { data: d } = await supabase
                .from('subeler').select('*').eq('kod', req.user.subeSlug).maybeSingle();
            let ad_soyad = '';
            try {
                const u = await kullaniciGetir(req.user.uid);
                ad_soyad = (u ? hesapAlanlari(u).displayName : '') || '';
            } catch { /* displayName yoksa boş */ }
            prefill = {
                ad_soyad,
                ...Object.fromEntries(KULLANICI_ALANLARI.map((k) => [k, userData?.[k] || ''])),
                ...Object.fromEntries(SUBE_ALANLARI.map((k) => [k, d?.[k] || ''])),
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

        const { data: sube } = await supabase
            .from('subeler').select('kod, ad').eq('kod', req.user.subeSlug).maybeSingle();
        if (!sube) {
            return res.status(404).json({ error: 'Şubeniz bulunamadı.' });
        }

        // İl/ilçe konumunu haritaya işle (best-effort, başarısızsa il merkezine düşer)
        const konum = await geocodeIlce(subeVeri.il, subeVeri.ilce);
        if (konum) {
            subeVeri.lat = konum.lat;
            subeVeri.lng = konum.lng;
        }

        // Şube verisi → subeler satırı (konum kolonları burada; ayrı konum dokümanı yok)
        veriYaDaHata(
            await supabase.from('subeler').update(subeVeri).eq('kod', req.user.subeSlug),
            'şube bilgisi yazılamadı'
        );
        // Ad Soyad → kullanıcı hesabı displayName (Kullanıcılar listesinde görünür)
        await kullaniciGuncelle(req.user.uid, { displayName: adSoyad });
        // Telefon + tamamlandı bayrağı → kullanici_sube satırı
        veriYaDaHata(
            await supabase.from('kullanici_sube').upsert(
                { uid: req.user.uid, ...kullaniciVeri, onboarded: true, onboarded_at: new Date().toISOString() },
                { onConflict: 'uid' }
            ),
            'kullanıcı kaydı yazılamadı'
        );

        res.json({ success: true });
    })
);

/**
 * POST /api/onboarding/reset/:uid
 * Admin bir kullanıcının ilk-giriş wizard'ını sıfırlar — onboarded bayrağını kaldırır.
 */
router.post(
    '/reset/:uid',
    verifyToken,
    requirePermission('users.resetOnboarding'),
    asyncHandler(async (req, res) => {
        const { uid } = req.params;
        const { data: mevcut } = await supabase
            .from('kullanici_sube').select('uid').eq('uid', uid).maybeSingle();
        if (!mevcut) {
            return res.status(404).json({ error: 'Kullanıcı kaydı bulunamadı.' });
        }
        veriYaDaHata(
            await supabase.from('kullanici_sube').update({ onboarded: false }).eq('uid', uid),
            'onboarding sıfırlanamadı'
        );
        res.json({ success: true });
    })
);

export default router;
