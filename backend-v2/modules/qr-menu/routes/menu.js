import { Router } from '../../../shared/router.js';
import { supabase } from '../../../config/supabase.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { cacheMiddleware } from '../../../middleware/cache.js';
import { verifyToken, requirePermission } from '../../../middleware/auth.js';
import { veriYaDaHata } from '../../../utils/veri.js';
import { buildMenuData } from '../services/menu-builder.js';

const router = Router();

/**
 * GET /api/menu/subeler
 * Tüm şubeleri listele (dropdown'lar için)
 */
router.get(
    '/subeler',
    verifyToken, // yalnızca giriş yapmış kullanıcılar (admin paneli dropdown'ları)
    asyncHandler(async (req, res) => {
        // Yalnızca güvenli alanlar — VKN, fatura adresi, yetkili adı gibi
        // hassas bilgiler bu public-ish listeye dahil edilmez.
        const satirlar = veriYaDaHata(
            await supabase.from('subeler').select('kod, ad, il, ilce').range(0, 9999),
            'şubeler okunamadı'
        );
        const subeler = satirlar.map((s) => ({
            slug: s.kod, ad: s.ad || s.kod, il: s.il || null, ilce: s.ilce || null,
        }));
        res.json({ subeler });
    })
);

/**
 * GET /api/menu/cache-durumu
 * Menü JSON yazımı duraklatılmış mı?
 * NOT: '/:subeSlug'dan ÖNCE tanımlı olmalı, yoksa şube slug'ı sanılır.
 */
router.get(
    '/cache-durumu',
    verifyToken,
    requirePermission('categories.edit'),
    asyncHandler(async (req, res) => {
        const { menuYazimiDurumu } = await import('../services/menu-cache.js');
        res.json(await menuYazimiDurumu());
    })
);

/**
 * GET /api/menu/:subeSlug
 * Public endpoint — müşteriler için şube menüsü
 * Auth gerektirmez, QR kod ile açılır
 */
router.get(
    '/:subeSlug',
    cacheMiddleware(60),
    asyncHandler(async (req, res) => {
        const { subeSlug } = req.params;

        // PUBLIC endpoint — güvenli alan projeksiyonu buildMenuData içinde yapılır
        // (R2 JSON cache'i ile TEK kaynak; bkz. services/menu-builder.js).
        const menu = await buildMenuData(subeSlug);

        if (!menu) {
            return res.status(404).json({ error: 'Şube bulunamadı' });
        }

        res.json(menu);
    })
);

/**
 * POST /api/menu/cache-durumu
 * Menü JSON yazımını duraklatır / sürdürür. Body: { duraklat: boolean, not?: string }
 *
 * SÜRDÜRÜRKEN tüm şubelerin JSON'ı bir kez yeniden üretilir — duraklatma
 * boyunca biriken bütün değişiklikler o anda yansır.
 */
router.post(
    '/cache-durumu',
    verifyToken,
    requirePermission('categories.edit'),
    asyncHandler(async (req, res) => {
        const { duraklat, not } = req.body;
        if (typeof duraklat !== 'boolean') {
            return res.status(400).json({ error: 'duraklat alanı boolean olmalı' });
        }
        const { menuYazimiDuraklat, regenerateAllMenuJsons } = await import('../services/menu-cache.js');
        await menuYazimiDuraklat(duraklat, not || '');

        if (duraklat) {
            return res.json({ duraklatildi: true, mesaj: 'Menü yazımı duraklatıldı. Müşteri menüleri güncellenmeyecek.' });
        }
        // Sürdürme: biriken değişiklikleri tek seferde yaz
        await regenerateAllMenuJsons();
        res.json({ duraklatildi: false, mesaj: 'Menü yazımı sürdürüldü, tüm şube menüleri yenilendi.' });
    })
);

/**
 * POST /api/menu/regenerate-cache
 * Tüm şubelerin menü JSON'larını yeniden oluştur
 */
router.post(
    '/regenerate-cache',
    verifyToken,
    requirePermission('categories.edit'),
    asyncHandler(async (req, res) => {
        const { regenerateAllMenuJsons } = await import('../services/menu-cache.js');
        await regenerateAllMenuJsons();
        res.json({ success: true, message: 'Tüm menü JSON cache\'leri yenilendi' });
    })
);

export default router;
