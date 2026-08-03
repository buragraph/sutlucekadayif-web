import { Router } from '../shared/router.js';
import { oranSiniri } from '../shared/limit.js';
import { supabase } from '../config/supabase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { yeniId, temizNull, veriYaDaHata, isoZ } from '../utils/veri.js';

const router = Router();

// WordPress formundaki kategorilerle birebir
const KATEGORILER = ['urun_kalitesi', 'servis', 'temizlik', 'fiyat', 'diger'];
const DURUMLAR = ['yeni', 'inceleniyor', 'cozuldu', 'kapatildi'];

const LIMITLER = { ad: 80, soyad: 80, email: 120, telefon: 30, mesaj: 3000, olayTarihi: 30 };

const temizle = (v, max) => String(v ?? '').trim().slice(0, max);
const gecerliEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** Satır → eski API şekli */
const yanit = (b) => temizNull({
    id: b.id,
    subeSlug: b.sube_slug, subeAd: b.sube_ad, kategori: b.kategori,
    ad: b.ad, soyad: b.soyad, email: b.email, telefon: b.telefon,
    mesaj: b.mesaj, olayTarihi: b.olay_tarihi, kvkkOnay: b.kvkk_onay,
    durum: b.durum,
    not: b.admin_notu,
    olusturmaZamani: isoZ(b.olusturma),
    guncellemeZamani: isoZ(b.guncelleme),
});

// Herkese açık POST için sıkı limit — aynı IP saatte en fazla 10 bildirim
const bildirimLimiter = oranSiniri({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla gönderim yaptınız. Lütfen daha sonra tekrar deneyin.' },
    validate: { xForwardedForHeader: false, trustProxy: false },
});

/**
 * POST /api/geribildirim
 * QR menüsündeki şikayet/geri bildirim formundan gelen kaydı oluşturur.
 */
router.post(
    '/',
    bildirimLimiter,
    asyncHandler(async (req, res) => {
        // Honeypot — dolu ise bot; kaydetmeden başarı taklidi et
        if (temizle(req.body.website, 200)) {
            return res.json({ success: true });
        }

        const subeSlug = temizle(req.body.subeSlug, 60);
        const kategori = temizle(req.body.kategori, 40);
        const veri = {
            ad: temizle(req.body.ad, LIMITLER.ad),
            soyad: temizle(req.body.soyad, LIMITLER.soyad),
            email: temizle(req.body.email, LIMITLER.email),
            telefon: temizle(req.body.telefon, LIMITLER.telefon),
            mesaj: temizle(req.body.mesaj, LIMITLER.mesaj),
            olay_tarihi: temizle(req.body.olayTarihi, LIMITLER.olayTarihi),
        };

        const eksik = [];
        if (!subeSlug) eksik.push('subeSlug');
        for (const k of ['ad', 'soyad', 'email', 'telefon', 'mesaj']) {
            if (!veri[k]) eksik.push(k);
        }
        if (eksik.length > 0) {
            return res.status(400).json({ error: 'Lütfen zorunlu alanları doldurun.', eksik });
        }
        if (!KATEGORILER.includes(kategori)) {
            return res.status(400).json({ error: 'Lütfen bir konu seçin.' });
        }
        if (!gecerliEmail(veri.email)) {
            return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });
        }
        // KVKK aydınlatma onayı zorunlu — onaysız kişisel veri işlenmez
        if (req.body.kvkkOnay !== true) {
            return res.status(400).json({ error: 'Devam etmek için aydınlatma metnini onaylamanız gerekir.' });
        }

        // Şube gerçekten var mı — uydurma slug ile kayıt açılmasın
        const { data: sube } = await supabase.from('subeler').select('ad').eq('kod', subeSlug).maybeSingle();
        if (!sube) {
            return res.status(404).json({ error: 'Şube bulunamadı.' });
        }

        veriYaDaHata(
            await supabase.from('geri_bildirimler').insert({
                id: yeniId(),
                ...veri,
                sube_slug: subeSlug,
                sube_ad: sube.ad || subeSlug,
                kategori,
                kvkk_onay: true,
                durum: 'yeni',
                admin_notu: '',
                olusturma: new Date().toISOString(),
            }),
            'geri bildirim kaydedilemedi'
        );

        res.json({ success: true });
    })
);

/**
 * GET /api/geribildirim
 * Admin tümünü; şube sahibi YALNIZCA kendi şubesini (kapsam token'dan zorlanır).
 */
router.get(
    '/',
    verifyToken,
    requirePermission('geribildirim.view'),
    asyncHandler(async (req, res) => {
        let sorgu = supabase.from('geri_bildirimler').select('*');

        // Şube sahibi yalnızca kendi şubesi — kapsam sorgu parametresinden değil
        // token'daki subeSlug'dan gelir. (Firestore'daki bileşik indeks zorunluluğu
        // Postgres'te yok.)
        if (req.user.role !== 'admin') {
            if (!req.user.subeSlug) {
                return res.status(403).json({ error: 'Şubenize ait bir kayıt bulunamadı.' });
            }
            sorgu = sorgu.eq('sube_slug', req.user.subeSlug);
        }

        const satirlar = veriYaDaHata(
            await sorgu.order('olusturma', { ascending: false }).limit(5000),
            'geri bildirimler okunamadı'
        );
        const bildirimler = satirlar.map(yanit);

        const sayac = DURUMLAR.reduce((acc, d) => ({ ...acc, [d]: 0 }), {});
        for (const b of bildirimler) {
            if (b.durum in sayac) sayac[b.durum] += 1;
        }

        res.json({ bildirimler, sayac, toplam: bildirimler.length });
    })
);

/**
 * PATCH /api/geribildirim/:id
 * Durum ve/veya dahili not. Şube sahibi yalnızca kendi şubesinin kaydına dokunabilir.
 */
router.patch(
    '/:id',
    verifyToken,
    requirePermission('geribildirim.manage'),
    asyncHandler(async (req, res) => {
        const { data: mevcut } = await supabase
            .from('geri_bildirimler').select('id, sube_slug').eq('id', req.params.id).maybeSingle();
        if (!mevcut) {
            return res.status(404).json({ error: 'Kayıt bulunamadı.' });
        }
        // Şube sahibi başka şubenin kaydını güncelleyemez
        if (req.user.role !== 'admin' && mevcut.sube_slug !== req.user.subeSlug) {
            return res.status(403).json({ error: 'Bu kayıt sizin şubenize ait değil.' });
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
            await supabase.from('geri_bildirimler').update(guncelleme).eq('id', req.params.id),
            'geri bildirim güncellenemedi'
        );
        res.json({ success: true });
    })
);

/**
 * DELETE /api/geribildirim/:id
 * YALNIZCA admin — şube sahibi kendi hakkındaki şikayeti silememeli
 * (kayıt bütünlüğü). Bu yüzden ayrı bir izin anahtarı kullanılır.
 */
router.delete(
    '/:id',
    verifyToken,
    requirePermission('geribildirim.delete'),
    asyncHandler(async (req, res) => {
        veriYaDaHata(
            await supabase.from('geri_bildirimler').delete().eq('id', req.params.id),
            'geri bildirim silinemedi'
        );
        res.json({ success: true });
    })
);

export default router;
