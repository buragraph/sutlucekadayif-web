import { Router } from '../shared/router.js';
import { supabase } from '../config/supabase.js';
import { verifyToken } from '../middleware/auth.js';
import { hesapAlanlari, kullaniciGetir, kullaniciGuncelle } from '../shared/kullanici-dizini.js';
import asyncHandler from '../utils/asyncHandler.js';
import { veriYaDaHata } from '../utils/veri.js';
import { geocodeIlce } from './branches.js';

const router = Router();

// Düzenlenebilir şube alanları — şube ADI buradan değiştirilemez (merkezî yönetilir).
const SUBE_ALANLARI = ['il', 'ilce', 'adres', 'vkn', 'fatura_adresi', 'sirket_tipi'];

/**
 * GET /api/profil
 * Şube sahibinin kendi profil verisi — hesap + mağaza + fatura/vergi.
 */
router.get(
    '/',
    verifyToken,
    asyncHandler(async (req, res) => {
        const kayit = await kullaniciGetir(req.user.uid);
        const authUser = kayit ? hesapAlanlari(kayit) : null;

        // Şubeye atanmamış kullanıcı (ör. admin) → yalnızca hesap bilgisi.
        if (!req.user.subeSlug) {
            const { data: u } = await supabase
                .from('kullanici_sube').select('telefon').eq('uid', req.user.uid).maybeSingle();
            return res.json({
                hesap: {
                    ad_soyad: authUser?.displayName || '',
                    email: authUser?.email || '',
                    telefon: u?.telefon || '',
                },
                magaza: null,
                fatura: null,
            });
        }

        const [{ data: u }, { data: s }] = await Promise.all([
            supabase.from('kullanici_sube').select('telefon').eq('uid', req.user.uid).maybeSingle(),
            supabase.from('subeler').select('*').eq('kod', req.user.subeSlug).maybeSingle(),
        ]);

        res.json({
            hesap: {
                ad_soyad: authUser?.displayName || '',
                email: authUser?.email || '',
                telefon: u?.telefon || '',
            },
            magaza: {
                kod: req.user.subeSlug,
                ad: s?.ad || '',
                il: s?.il || '',
                ilce: s?.ilce || '',
                adres: s?.adres || '',
            },
            fatura: {
                vkn: s?.vkn || '',
                fatura_adresi: s?.fatura_adresi || '',
                sirket_tipi: s?.sirket_tipi || '',
            },
        });
    })
);

/**
 * PUT /api/profil
 * Profil alanlarını günceller (kısmi). Her veri ait olduğu kayda yazılır.
 * E-posta buradan değiştirilmez (hesap güvenliği).
 */
router.put(
    '/',
    verifyToken,
    asyncHandler(async (req, res) => {
        // Ad Soyad → Auth displayName
        if (req.body.ad_soyad !== undefined) {
            await kullaniciGuncelle(req.user.uid, { displayName: String(req.body.ad_soyad).trim() });
        }

        // Telefon → kullanici_sube
        if (req.body.telefon !== undefined) {
            veriYaDaHata(
                await supabase.from('kullanici_sube').upsert(
                    { uid: req.user.uid, telefon: String(req.body.telefon).trim() },
                    { onConflict: 'uid' }
                ),
                'telefon yazılamadı'
            );
        }

        // Şube alanları — yalnızca bir şubeye atanmış kullanıcı
        if (req.user.subeSlug) {
            const subeVeri = {};
            for (const k of SUBE_ALANLARI) {
                if (req.body[k] !== undefined) subeVeri[k] = String(req.body[k]).trim();
            }
            if (Object.keys(subeVeri).length > 0) {
                // İl/ilçe değiştiyse haritadaki konumu yeniden hesapla
                if (subeVeri.il !== undefined || subeVeri.ilce !== undefined) {
                    const { data: cur } = await supabase
                        .from('subeler').select('il, ilce').eq('kod', req.user.subeSlug).maybeSingle();
                    const il = subeVeri.il !== undefined ? subeVeri.il : cur?.il;
                    const ilce = subeVeri.ilce !== undefined ? subeVeri.ilce : cur?.ilce;
                    const konum = await geocodeIlce(il, ilce);
                    if (konum) { subeVeri.lat = konum.lat; subeVeri.lng = konum.lng; }
                }
                veriYaDaHata(
                    await supabase.from('subeler').update(subeVeri).eq('kod', req.user.subeSlug),
                    'şube bilgisi güncellenemedi'
                );
            }
        }

        res.json({ success: true });
    })
);

export default router;
