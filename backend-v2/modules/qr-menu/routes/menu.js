import crypto from 'node:crypto';
import { Router } from '../../../shared/router.js';
import { supabase } from '../../../config/supabase.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { cacheMiddleware } from '../../../middleware/cache.js';
import { verifyToken, requirePermission } from '../../../middleware/auth.js';
import { veriYaDaHata } from '../../../utils/veri.js';
import { uploadFile, deleteFile } from '../../../config/r2.js';
import { dosyaAl } from '../../../shared/dosya.js';
import { buildMenuData } from '../services/menu-builder.js';

const router = Router();

// ─── Alerjen PDF'i ───
// Tek global dosya; şube menü JSON'larına GİRMEZ — girseydi her PDF değişimi
// 88 şubelik JSON fan-out'u gerektirirdi. Bunun yerine küçük `menu/ayarlar.json`
// yazılır, müşteri menüsü onu ayrıca okur (60 sn cache, bkz. upload proxy).
// PDF anahtarı her yüklemede yeni (uuid'li) olmalı: proxy PDF'leri 1 yıl
// immutable cache'lediği için sabit isim tarayıcıda bayat kalırdı.
const ALERJEN_ANAHTARI = 'alerjen_pdf';

const PDF_AL = dosyaAl('pdf', {
    tipler: ['application/pdf'],
    enBoy: 20 * 1024 * 1024,
    hataMesaji: 'Sadece PDF dosyası yüklenebilir',
});

async function alerjenAyarOku() {
    const { data } = await supabase
        .from('ayarlar').select('deger').eq('anahtar', ALERJEN_ANAHTARI).maybeSingle();
    return data?.deger || null;
}

/** Müşteri menüsünün okuduğu global ayar JSON'ını R2'ye yazar.
 *  Alt çizgili ad bilinçli: şube JSON'ları `menu/{kod}.json` yazdığından,
 *  "ayarlar" kodlu bir şube açılırsa çakışmasın. */
async function alerjenAyarJsonYaz(key) {
    await uploadFile(
        Buffer.from(JSON.stringify({ alerjenPdf: key || null })),
        'menu/_ayarlar.json',
        'application/json'
    );
}

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
 * GET /api/menu/alerjen-pdf
 * Yüklü alerjen PDF'inin meta bilgisi (CMS için).
 * NOT: '/:subeSlug'dan ÖNCE tanımlı olmalı (bkz. cache-durumu notu).
 */
router.get(
    '/alerjen-pdf',
    verifyToken,
    requirePermission('categories.edit'),
    asyncHandler(async (req, res) => {
        res.json({ pdf: await alerjenAyarOku() });
    })
);

/**
 * POST /api/menu/alerjen-pdf
 * Alerjen PDF'ini yükle/değiştir. Form alanı: pdf (application/pdf, ≤20MB)
 */
router.post(
    '/alerjen-pdf',
    verifyToken,
    requirePermission('categories.edit'),
    PDF_AL,
    asyncHandler(async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'PDF dosyası bulunamadı' });
        }
        const eski = await alerjenAyarOku();

        const key = `menu/alerjenler-${crypto.randomUUID()}.pdf`;
        await uploadFile(req.file.buffer, key, 'application/pdf');

        const deger = {
            key,
            ad: req.file.originalname || 'alerjenler.pdf',
            boyut: req.file.size ?? req.file.buffer.length,
            zaman: new Date().toISOString(),
        };
        veriYaDaHata(
            await supabase.from('ayarlar').upsert(
                { anahtar: ALERJEN_ANAHTARI, deger, guncelleme: new Date().toISOString() },
                { onConflict: 'anahtar' }
            ),
            'alerjen ayarı yazılamadı'
        );
        await alerjenAyarJsonYaz(key);

        // Eski dosya EN SONDA silinir: üstteki adımlardan biri patlarsa
        // yayındaki PDF çalışır kalır. Silme hatası işlemi geri döndürmez.
        if (eski?.key && eski.key !== key) {
            await deleteFile(eski.key).catch((e) =>
                console.error('[Alerjen] eski PDF silinemedi:', e.message));
        }

        res.json({ pdf: deger });
    })
);

/**
 * DELETE /api/menu/alerjen-pdf
 * Alerjen PDF'ini kaldır — menüdeki buton kaybolur.
 */
router.delete(
    '/alerjen-pdf',
    verifyToken,
    requirePermission('categories.edit'),
    asyncHandler(async (req, res) => {
        const eski = await alerjenAyarOku();
        await alerjenAyarJsonYaz(null);
        veriYaDaHata(
            await supabase.from('ayarlar').delete().eq('anahtar', ALERJEN_ANAHTARI),
            'alerjen ayarı silinemedi'
        );
        if (eski?.key) {
            await deleteFile(eski.key).catch((e) =>
                console.error('[Alerjen] PDF silinemedi:', e.message));
        }
        res.json({ success: true });
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
