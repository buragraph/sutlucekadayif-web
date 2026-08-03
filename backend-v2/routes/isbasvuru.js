import { Router } from '../shared/router.js';
import { oranSiniri } from '../shared/limit.js';
import { supabase } from '../config/supabase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { yeniId, temizNull, veriYaDaHata, isoZ } from '../utils/veri.js';

const router = Router();

const CALISMA_TIPLERI = ['tam_zamanli', 'yari_zamanli', 'donemsel'];
const BECERILER = [
    'kasa', 'pos', 'servis', 'tezgahtarlik',
    'paketleme', 'hijyen', 'ekip', 'yogun_tempo',
];
const EVET_HAYIR = ['evet', 'hayir'];
const DURUMLAR = ['yeni', 'degerlendiriliyor', 'gorusme', 'olumlu', 'olumsuz'];

const LIMITLER = {
    ad: 80, soyad: 80, email: 120, telefon: 30, tarih: 30,
    musaitlik: 500, detay: 1000, referans: 500, not: 3000,
};

const temizle = (v, max) => String(v ?? '').trim().slice(0, max);
const gecerliEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** Satır → eski API şekli */
const yanit = (b) => temizNull({
    id: b.id,
    subeSlug: b.sube_slug, subeAd: b.sube_ad,
    ad: b.ad, soyad: b.soyad, dogumTarihi: b.dogum_tarihi,
    telefon: b.telefon, email: b.email, musaitlik: b.musaitlik,
    calismaTipi: b.calisma_tipi, beceriler: b.beceriler,
    gidaDeneyimi: b.gida_deneyimi, gidaDeneyimiDetay: b.gida_deneyimi_detay,
    markaDeneyimi: b.marka_deneyimi, halenCalisiyor: b.halen_calisiyor,
    baslangicTarihi: b.baslangic_tarihi, referans: b.referans,
    kvkkOnay: b.kvkk_onay,
    durum: b.durum,
    not: b.admin_notu,
    olusturmaZamani: isoZ(b.olusturma),
    guncellemeZamani: isoZ(b.guncelleme),
});

// Herkese açık POST için sıkı limit — aynı IP saatte en fazla 5 başvuru
const basvuruLimiter = oranSiniri({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla başvuru gönderdiniz. Lütfen daha sonra tekrar deneyin.' },
    validate: { xForwardedForHeader: false, trustProxy: false },
});

/**
 * POST /api/isbasvuru
 */
router.post(
    '/',
    basvuruLimiter,
    asyncHandler(async (req, res) => {
        if (temizle(req.body.website, 200)) {
            return res.json({ success: true }); // honeypot — bot
        }

        const subeSlug = temizle(req.body.subeSlug, 60);
        const calismaTipi = temizle(req.body.calismaTipi, 30);
        const gidaDeneyimi = temizle(req.body.gidaDeneyimi, 10);
        const halenCalisiyor = temizle(req.body.halenCalisiyor, 10);
        // Yalnızca tanımlı beceri anahtarlarını al — uydurma değer sızmasın
        const beceriler = Array.isArray(req.body.beceriler)
            ? [...new Set(req.body.beceriler.filter((b) => BECERILER.includes(b)))]
            : [];

        const veri = {
            ad: temizle(req.body.ad, LIMITLER.ad),
            soyad: temizle(req.body.soyad, LIMITLER.soyad),
            dogum_tarihi: temizle(req.body.dogumTarihi, LIMITLER.tarih),
            telefon: temizle(req.body.telefon, LIMITLER.telefon),
            email: temizle(req.body.email, LIMITLER.email),
            musaitlik: temizle(req.body.musaitlik, LIMITLER.musaitlik),
            gida_deneyimi_detay: temizle(req.body.gidaDeneyimiDetay, LIMITLER.detay),
            marka_deneyimi: temizle(req.body.markaDeneyimi, LIMITLER.detay),
            baslangic_tarihi: temizle(req.body.baslangicTarihi, LIMITLER.tarih),
            referans: temizle(req.body.referans, LIMITLER.referans),
        };

        const eksik = [];
        if (!subeSlug) eksik.push('subeSlug');
        for (const [alan, kolon] of [['ad', 'ad'], ['soyad', 'soyad'], ['dogumTarihi', 'dogum_tarihi'],
            ['telefon', 'telefon'], ['email', 'email'], ['musaitlik', 'musaitlik']]) {
            if (!veri[kolon]) eksik.push(alan);
        }
        if (eksik.length > 0) {
            return res.status(400).json({ error: 'Lütfen zorunlu alanları doldurun.', eksik });
        }
        if (!gecerliEmail(veri.email)) {
            return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });
        }
        if (!CALISMA_TIPLERI.includes(calismaTipi)) {
            return res.status(400).json({ error: 'Lütfen çalışma tipini seçin.' });
        }
        if (beceriler.length === 0) {
            return res.status(400).json({ error: 'Lütfen en az bir beceri seçin.' });
        }
        if (!EVET_HAYIR.includes(gidaDeneyimi) || !EVET_HAYIR.includes(halenCalisiyor)) {
            return res.status(400).json({ error: 'Lütfen evet/hayır sorularını yanıtlayın.' });
        }
        if (req.body.kvkkOnay !== true) {
            return res.status(400).json({ error: 'Devam etmek için aydınlatma metnini onaylamanız gerekir.' });
        }

        const { data: sube } = await supabase.from('subeler').select('ad').eq('kod', subeSlug).maybeSingle();
        if (!sube) {
            return res.status(404).json({ error: 'Şube bulunamadı.' });
        }

        veriYaDaHata(
            await supabase.from('is_basvurulari').insert({
                id: yeniId(),
                ...veri,
                sube_slug: subeSlug,
                sube_ad: sube.ad || subeSlug,
                calisma_tipi: calismaTipi,
                beceriler,
                gida_deneyimi: gidaDeneyimi,
                halen_calisiyor: halenCalisiyor,
                kvkk_onay: true,
                durum: 'yeni',
                admin_notu: '',
                olusturma: new Date().toISOString(),
            }),
            'iş başvurusu kaydedilemedi'
        );

        res.json({ success: true });
    })
);

/**
 * GET /api/isbasvuru
 * Admin tümünü; şube sahibi YALNIZCA kendi şubesini (kapsam token'dan zorlanır).
 */
router.get(
    '/',
    verifyToken,
    requirePermission('isbasvuru.view'),
    asyncHandler(async (req, res) => {
        let sorgu = supabase.from('is_basvurulari').select('*');

        if (req.user.role !== 'admin') {
            if (!req.user.subeSlug) {
                return res.status(403).json({ error: 'Şubenize ait bir kayıt bulunamadı.' });
            }
            sorgu = sorgu.eq('sube_slug', req.user.subeSlug);
        }

        const satirlar = veriYaDaHata(
            await sorgu.order('olusturma', { ascending: false }).limit(5000),
            'iş başvuruları okunamadı'
        );
        const basvurular = satirlar.map(yanit);

        const sayac = DURUMLAR.reduce((acc, d) => ({ ...acc, [d]: 0 }), {});
        for (const b of basvurular) {
            if (b.durum in sayac) sayac[b.durum] += 1;
        }

        res.json({ basvurular, sayac, toplam: basvurular.length });
    })
);

/**
 * PATCH /api/isbasvuru/:id
 */
router.patch(
    '/:id',
    verifyToken,
    requirePermission('isbasvuru.manage'),
    asyncHandler(async (req, res) => {
        const { data: mevcut } = await supabase
            .from('is_basvurulari').select('id, sube_slug').eq('id', req.params.id).maybeSingle();
        if (!mevcut) {
            return res.status(404).json({ error: 'Başvuru bulunamadı.' });
        }
        if (req.user.role !== 'admin' && mevcut.sube_slug !== req.user.subeSlug) {
            return res.status(403).json({ error: 'Bu başvuru sizin şubenize ait değil.' });
        }

        const guncelleme = {};
        if (req.body.durum !== undefined) {
            if (!DURUMLAR.includes(req.body.durum)) {
                return res.status(400).json({ error: 'Geçersiz durum.' });
            }
            guncelleme.durum = req.body.durum;
        }
        if (req.body.not !== undefined) {
            guncelleme.admin_notu = temizle(req.body.not, LIMITLER.not);
        }
        if (Object.keys(guncelleme).length === 0) {
            return res.status(400).json({ error: 'Güncellenecek alan yok.' });
        }
        guncelleme.guncelleme = new Date().toISOString();

        veriYaDaHata(
            await supabase.from('is_basvurulari').update(guncelleme).eq('id', req.params.id),
            'başvuru güncellenemedi'
        );
        res.json({ success: true });
    })
);

/**
 * DELETE /api/isbasvuru/:id — yalnızca admin
 */
router.delete(
    '/:id',
    verifyToken,
    requirePermission('isbasvuru.delete'),
    asyncHandler(async (req, res) => {
        veriYaDaHata(
            await supabase.from('is_basvurulari').delete().eq('id', req.params.id),
            'başvuru silinemedi'
        );
        res.json({ success: true });
    })
);

export default router;
