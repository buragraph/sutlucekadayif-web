import { Router } from '../shared/router.js';
import { oranSiniri } from '../shared/limit.js';
import { supabase } from '../config/supabase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { yeniId, temizNull, veriYaDaHata, isoZ } from '../utils/veri.js';

const router = Router();

// Başvuru yaşam döngüsü durumları — PATCH yalnızca bu değerleri kabul eder
const DURUMLAR = ['yeni', 'inceleniyor', 'gorusuldu', 'olumlu', 'olumsuz'];

// Metin alanları için üst sınırlar (kötüye kullanım / şişkin kayıt engeli)
const LIMITLER = { ad: 80, soyad: 80, email: 120, telefon: 30, il: 40, ilce: 60, mesaj: 2000 };

const temizle = (v, max) => String(v ?? '').trim().slice(0, max);
const gecerliEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** Satır → eski API şekli (kolon adları: not→admin_notu, olusturmaZamani→olusturma) */
const yanit = (b) => temizNull({
    id: b.id,
    ad: b.ad, soyad: b.soyad, email: b.email, telefon: b.telefon,
    il: b.il, ilce: b.ilce, mesaj: b.mesaj,
    durum: b.durum,
    not: b.admin_notu,
    olusturmaZamani: isoZ(b.olusturma),
    guncellemeZamani: isoZ(b.guncelleme),
});

// Herkese açık POST için ayrı, sıkı limit (genel limiter'a ek). Aynı IP saatte
// en fazla 8 başvuru gönderebilir — spam / form bombardımanı engeli.
const basvuruLimiter = oranSiniri({
    windowMs: 60 * 60 * 1000, // 1 saat
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla başvuru gönderdiniz. Lütfen daha sonra tekrar deneyin.' },
    validate: { xForwardedForHeader: false, trustProxy: false },
});

/**
 * POST /api/basvurular
 * Pazarlama sitesindeki franchise formundan gelen başvuruyu kaydeder.
 * Auth GEREKMEZ (herkese açık). Honeypot + doğrulama + rate limit ile korunur.
 */
router.post(
    '/',
    basvuruLimiter,
    asyncHandler(async (req, res) => {
        // Honeypot: gizli `website` alanı doluysa bot — kaydetmeden başarı taklidi et
        if (temizle(req.body.website, 200)) {
            return res.json({ success: true });
        }

        const veri = {
            ad: temizle(req.body.ad, LIMITLER.ad),
            soyad: temizle(req.body.soyad, LIMITLER.soyad),
            email: temizle(req.body.email, LIMITLER.email),
            telefon: temizle(req.body.telefon, LIMITLER.telefon),
            il: temizle(req.body.il, LIMITLER.il),
            ilce: temizle(req.body.ilce, LIMITLER.ilce),
            mesaj: temizle(req.body.mesaj, LIMITLER.mesaj),
        };

        // Zorunlu alanlar
        const eksik = [];
        for (const k of ['ad', 'soyad', 'email', 'telefon', 'il']) {
            if (!veri[k]) eksik.push(k);
        }
        if (eksik.length > 0) {
            return res.status(400).json({ error: 'Lütfen zorunlu alanları doldurun.', eksik });
        }
        if (!gecerliEmail(veri.email)) {
            return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });
        }

        veriYaDaHata(
            await supabase.from('franchise_basvurulari').insert({
                id: yeniId(),
                ...veri,
                durum: 'yeni',
                admin_notu: '',
                olusturma: new Date().toISOString(),
            }),
            'başvuru kaydedilemedi'
        );

        res.json({ success: true });
    })
);

/**
 * GET /api/basvurular
 * Başvuru listesi (en yeni önce).
 */
router.get(
    '/',
    verifyToken,
    requirePermission('basvurular.view'),
    asyncHandler(async (req, res) => {
        // Durum filtresi bilinçli olarak sunucuda YOK: ekran zaten tüm kayıtları
        // çekip tarayıcıda filtreliyor (sayaçlar da oradan).
        const satirlar = veriYaDaHata(
            await supabase.from('franchise_basvurulari').select('*')
                .order('olusturma', { ascending: false }).limit(5000),
            'başvurular okunamadı'
        );
        const basvurular = satirlar.map(yanit);

        // Özet sayaç (durum rozetleri için) — tek sorgudan türetilir
        const sayac = DURUMLAR.reduce((acc, d) => ({ ...acc, [d]: 0 }), {});
        for (const b of basvurular) {
            if (b.durum in sayac) sayac[b.durum] += 1;
        }

        res.json({ basvurular, sayac, toplam: basvurular.length });
    })
);

/**
 * PATCH /api/basvurular/:id
 * Durum ve/veya dahili not günceller (yalnızca bu iki alan yazılabilir).
 */
router.patch(
    '/:id',
    verifyToken,
    requirePermission('basvurular.manage'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { data: mevcut } = await supabase
            .from('franchise_basvurulari').select('id').eq('id', id).maybeSingle();
        if (!mevcut) {
            return res.status(404).json({ error: 'Başvuru bulunamadı.' });
        }

        const guncelleme = {};
        if (req.body.durum !== undefined) {
            if (!DURUMLAR.includes(req.body.durum)) {
                return res.status(400).json({ error: 'Geçersiz durum.' });
            }
            guncelleme.durum = req.body.durum;
        }
        if (req.body.not !== undefined) {
            guncelleme.admin_notu = temizle(req.body.not, LIMITLER.mesaj);
        }
        if (Object.keys(guncelleme).length === 0) {
            return res.status(400).json({ error: 'Güncellenecek alan yok.' });
        }
        guncelleme.guncelleme = new Date().toISOString();

        veriYaDaHata(
            await supabase.from('franchise_basvurulari').update(guncelleme).eq('id', id),
            'başvuru güncellenemedi'
        );
        res.json({ success: true });
    })
);

/**
 * DELETE /api/basvurular/:id
 * Başvuruyu kalıcı olarak siler.
 */
router.delete(
    '/:id',
    verifyToken,
    requirePermission('basvurular.manage'),
    asyncHandler(async (req, res) => {
        veriYaDaHata(
            await supabase.from('franchise_basvurulari').delete().eq('id', req.params.id),
            'başvuru silinemedi'
        );
        res.json({ success: true });
    })
);

export default router;
