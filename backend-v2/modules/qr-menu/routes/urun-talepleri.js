import crypto from 'node:crypto';
import { Router } from '../../../shared/router.js';
import { supabase } from '../../../config/supabase.js';
import { uploadFile } from '../../../config/r2.js';
import { dosyaAl } from '../../../shared/dosya.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { verifyToken, requirePermission } from '../../../middleware/auth.js';
import { yeniId, temizNull, veriYaDaHata, isoZ } from '../../../utils/veri.js';
import { regenerateAffectedMenuJsons } from '../services/menu-cache.js';

const router = Router();

/**
 * Talep görseli yükleme — AYRI UÇ, bilerek.
 *
 * `POST /api/upload/image` `media.manage` istiyor ve o izin yalnızca admin'de;
 * şube sahibine medya kütüphanesini açmamak için oraya dokunulmadı. Burada
 * yalnızca `urunTalep.create` (yani şube sahibi) yetkisi aranır ve dosya sabit
 * `talep/` önekine yazılır — klasör istemciden GELMEZ, dolayısıyla anahtar
 * enjeksiyonu mümkün değil.
 *
 * Optimizasyon (max 800px, WebP q80) tarayıcıda yapılır (sunucuda sharp yok,
 * bkz. routes/upload.js'teki not); bu yüzden burada WebP dayatılır.
 */
const TALEP_GORSELI = dosyaAl('image', {
    tipler: ['image/webp'],
    enBoy: 5 * 1024 * 1024,
    hataMesaji: 'Görsel WebP olarak gönderilmeli',
});

router.post('/gorsel', verifyToken, requirePermission('urunTalep.create'), TALEP_GORSELI,
    asyncHandler(async (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'Dosya bulunamadı' });
        if (req.file.mimetype !== 'image/webp') {
            return res.status(400).json({ error: 'Görsel WebP olarak gönderilmeli (dönüşüm tarayıcıda yapılır).' });
        }
        const key = `talep/${crypto.randomUUID()}.webp`;
        const url = await uploadFile(req.file.buffer, key, 'image/webp');
        console.log(`📸 Talep görseli yüklendi: ${(req.file.buffer.length / 1024).toFixed(0)}KB`);
        res.json({ url, key });
    }));

/**
 * GET /api/urun-talepleri/gorseller
 * Şube sahibinin talepte SEÇEBİLECEĞİ hazır görseller.
 *
 * NEDEN AYRI UÇ: medya kütüphanesi şubeye kapalı (media.view yalnız adminde) ve
 * öyle kalmalı — dekont/arşiv de aynı tabloda. Genel /api/media ucunu şubeye
 * açıp filtreyle daraltmak, ileride bir parametre kaçağında her şeyi açardı.
 * Burada kapsam yapısal: yalnızca `subelere_acik` klasörler okunur, klasör
 * adı bile istemciden gelmez.
 */
router.get('/gorseller', verifyToken, requirePermission('urunTalep.create'),
    asyncHandler(async (req, res) => {
        const klasorler = veriYaDaHata(
            await supabase.from('medya_klasorler').select('ad').eq('subelere_acik', true),
            'klasörler okunamadı'
        );
        const adlar = klasorler.map((k) => k.ad);
        if (adlar.length === 0) return res.json({ gorseller: [], klasorler: [] });

        const satirlar = veriYaDaHata(
            await supabase.from('medya').select('id, url, ad, klasor')
                .in('klasor', adlar).order('ad', { ascending: true }).range(0, 499),
            'görseller okunamadı'
        );
        res.json({
            gorseller: satirlar.map((m) => ({ id: m.id, url: m.url, ad: m.ad || '', klasor: m.klasor })),
            klasorler: adlar,
        });
    }));

const DURUMLAR = ['bekliyor', 'onaylandi', 'reddedildi'];
const LIMITLER = { ad: 120, aciklama: 500, adminNotu: 500 };
const temizle = (v, max) => String(v ?? '').trim().slice(0, max);

/**
 * Ad normalleştirme — mükerrer ürün tespitinin TAMAMI buna dayanıyor.
 *
 * Katalogdaki kirliliğin kaynağı yazım farkıydı: aynı ürün `Iced Latte` /
 * `Ice Latte` / `ICE LATTE`, `Cappuccino` / `Cappucino`, `250 gram` / `250 Gr`
 * diye defalarca girilmişti. Onay ekranında admin bunları gözle ayıramaz;
 * o yüzden çakışma talep YAZILIRKEN yakalanır.
 *
 * Türkçe harfler ASCII'ye indirilir (İ/ı ayrımı kaybolsun — tam da yazım
 * hatasının çıktığı yer), birim yazımı tekilleşir, kelime sırası yutulur:
 * "250 Gr Sade Dondurma" ile "Sade Dondurma 250 gram" aynı anahtara düşer.
 */
export function adAnahtari(ad) {
    let s = String(ad ?? '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
    s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    s = s.replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
         .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
    s = s.replace(/&amp;/g, '&');
    s = s.replace(/[^a-z0-9]+/g, ' ').trim();
    // Birim ve dil eşanlamlıları tek yazıma iner: "250 gram" = "250 gr",
    // "Iced Latte" = "Ice Latte", "Buzlu Americano" = "Iced Americano".
    const ESANLAM = {
        gram: 'gr', gramme: 'gr', kilo: 'kg', litre: 'lt', l: 'lt',
        iced: 'ice', buzlu: 'ice', soguk: 'ice',
        cikolatali: 'cikolata', cikolatal: 'cikolata',
    };
    const kelimeler = [...new Set(
        s.split(' ').filter(Boolean).map((w) => ESANLAM[w] || w)
    )].sort();
    return kelimeler.join(' ');
}

/** İki anahtar arasındaki düzenleme mesafesi (Levenshtein). */
function mesafe(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 3) return 99;
    let onceki = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const simdi = [i];
        for (let j = 1; j <= n; j++) {
            simdi[j] = Math.min(
                onceki[j] + 1,
                simdi[j - 1] + 1,
                onceki[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
        onceki = simdi;
    }
    return onceki[n];
}

/** Yazım hatası payı — kısa adlarda 1, uzunlarda 2 harf. */
const yakinMi = (a, b) => mesafe(a, b) <= (Math.max(a.length, b.length) <= 8 ? 1 : 2);

/**
 * Katalogdaki canlı ürünler içinde eşleşenleri iki kovaya ayırır:
 *   tam   — anahtarı birebir aynı; talebi ENGELLER (kesin mükerrer)
 *   yakin — 1-2 harf farkı; yalnızca UYARIR (`Cappucino` ↔ `Cappuccino`)
 * Yakın eşleşme engellemez: "Cevizli Burma" ile "Cevizli Basma" da 2 harf
 * uzakta ve gerçekten farklı ürünler.
 */
async function benzerUrunler(ad) {
    const anahtar = adAnahtari(ad);
    if (!anahtar) return { tam: [], yakin: [] };
    const satirlar = veriYaDaHata(
        await supabase.from('urunler').select('id, ad, fiyat, kategori_id, tur, sube_kod')
            .is('silinme', null).range(0, 9999),
        'ürünler okunamadı'
    );
    const tam = [], yakin = [];
    for (const u of satirlar) {
        const k = adAnahtari(u.ad);
        if (k === anahtar) tam.push(u);
        else if (yakinMi(k, anahtar)) yakin.push(u);
    }
    return { tam, yakin };
}

const yanit = (t) => temizNull({
    id: t.id,
    subeSlug: t.sube_kod,
    ad: t.ad,
    kategoriId: t.kategori_id,
    fiyat: t.fiyat,
    aciklama: t.aciklama,
    gorsel: t.gorsel,
    durum: t.durum,
    eslesenUrunId: t.eslesen_urun_id,
    not: t.admin_notu,
    olusturan: t.olusturan,
    olusturmaZamani: isoZ(t.olusturma),
    kararVeren: t.karar_veren,
    kararZamani: isoZ(t.karar_zamani),
});

/**
 * GET /api/urun-talepleri/benzer?ad=...
 * Talep formu yazarken çağrılır — katalogda aynı ürün varsa şube talep açmak
 * yerine doğrudan menüsüne ekleyebilsin.
 */
router.get(
    '/benzer',
    verifyToken,
    requirePermission('urunTalep.view'),
    asyncHandler(async (req, res) => {
        const ad = temizle(req.query?.ad, LIMITLER.ad);
        if (ad.length < 2) return res.json({ benzerler: [] });
        const { tam, yakin } = await benzerUrunler(ad);
        const kisalt = (u) => ({ id: u.id, ad: u.ad, fiyat: u.fiyat, kategoriId: u.kategori_id });
        res.json({ benzerler: tam.map(kisalt), yakinlar: yakin.map(kisalt) });
    })
);

/**
 * GET /api/urun-talepleri?durum=bekliyor
 * Admin hepsini görür; şube sahibi YALNIZCA kendi şubesininkini.
 */
router.get(
    '/',
    verifyToken,
    requirePermission('urunTalep.view'),
    asyncHandler(async (req, res) => {
        let sorgu = supabase.from('urun_talepleri').select('*')
            .order('olusturma', { ascending: false }).range(0, 999);

        const durum = temizle(req.query?.durum, 20);
        if (durum && DURUMLAR.includes(durum)) sorgu = sorgu.eq('durum', durum);

        // Kapsam daraltma yetki dosyasında DEĞİL burada: 'urunTalep.view'
        // iki role de açık, şubenin başkasının talebini görmemesi bu satıra bağlı.
        if (req.user.role !== 'admin') {
            if (!req.user.subeSlug) return res.json({ talepler: [] });
            sorgu = sorgu.eq('sube_kod', req.user.subeSlug);
        }

        const satirlar = veriYaDaHata(await sorgu, 'ürün talepleri okunamadı');
        res.json({ talepler: satirlar.map(yanit) });
    })
);

/**
 * POST /api/urun-talepleri
 * Şube yeni ürün talebi açar. Gövde: { ad, kategoriId?, fiyat?, aciklama?, zorla? }
 *
 * Katalogda aynı ada düşen ürün varsa 409 + benzerler döner; şube "yine de
 * talep et" derse `zorla: true` ile tekrar gönderilir (ör. aynı ada sahip ama
 * gerçekten farklı bir ürün).
 */
router.post(
    '/',
    verifyToken,
    requirePermission('urunTalep.create'),
    asyncHandler(async (req, res) => {
        const subeKod = req.user.subeSlug;
        if (!subeKod) return res.status(400).json({ error: 'Kullanıcının şubesi tanımlı değil' });

        const ad = temizle(req.body?.ad, LIMITLER.ad);
        if (!ad) return res.status(400).json({ error: 'Ürün adı zorunludur' });

        if (!req.body?.zorla) {
            const { tam, yakin } = await benzerUrunler(ad);
            if (tam.length > 0 || yakin.length > 0) {
                return res.status(409).json({
                    error: tam.length
                        ? 'Bu ürün katalogda zaten var'
                        : 'Katalogda çok benzer bir ürün var — yazım hatası olabilir',
                    benzerler: tam.map((u) => ({ id: u.id, ad: u.ad, fiyat: u.fiyat })),
                    yakinlar: yakin.map((u) => ({ id: u.id, ad: u.ad, fiyat: u.fiyat })),
                });
            }
        }

        const fiyatHam = req.body?.fiyat;
        const fiyat = fiyatHam === '' || fiyatHam == null ? null : Number(fiyatHam);
        if (fiyat != null && !Number.isFinite(fiyat)) {
            return res.status(400).json({ error: 'Fiyat sayı olmalı' });
        }

        const kayit = {
            id: yeniId(),
            sube_kod: subeKod,
            ad,
            kategori_id: temizle(req.body?.kategoriId, 60) || null,
            fiyat,
            aciklama: temizle(req.body?.aciklama, LIMITLER.aciklama),
            gorsel: temizle(req.body?.gorsel, 500),
            olusturan: req.user.uid || null,
        };

        const { data, error } = await supabase
            .from('urun_talepleri').insert(kayit).select().single();
        if (error) {
            // Kısmi tekil indeks: aynı şubenin BEKLEYEN aynı adlı talebi
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Bu ürün için bekleyen bir talebiniz zaten var' });
            }
            throw new Error(error.message);
        }
        res.status(201).json({ talep: yanit(data) });
    })
);

/**
 * PATCH /api/urun-talepleri/:id/onayla
 * Gövde: { urunId? } | { ad?, fiyat?, kategoriId?, aciklama?, gorsel?, etiket?,
 *          miktar?, birim?, kalori?, not? }
 *   urunId verilirse MEVCUT ürün talep eden şubede açılır (mükerrer açılmaz).
 *   verilmezse yeni `ortak` ürün oluşturulur.
 *
 * Merkez talebi OLDUĞU GİBİ kabul etmek zorunda değil: ürünün tüm içeriğini
 * onaylamadan önce düzeltebilir. Verilmeyen alan talepteki değerinde kalır.
 */
router.patch(
    '/:id/onayla',
    verifyToken,
    requirePermission('urunTalep.manage'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const talep = veriYaDaHata(
            await supabase.from('urun_talepleri').select('*').eq('id', id).maybeSingle(),
            'talep okunamadı'
        );
        if (!talep) return res.status(404).json({ error: 'Talep bulunamadı' });
        if (talep.durum !== 'bekliyor') {
            return res.status(409).json({ error: 'Talep zaten karara bağlanmış' });
        }

        let urunId = temizle(req.body?.urunId, 60) || null;

        if (!urunId) {
            const kategoriId = temizle(req.body?.kategoriId, 60) || talep.kategori_id;
            if (!kategoriId) return res.status(400).json({ error: 'Kategori zorunludur' });

            const ad = temizle(req.body?.ad, LIMITLER.ad) || talep.ad;
            if (!ad) return res.status(400).json({ error: 'Ürün adı zorunludur' });

            const fiyatHam = req.body?.fiyat ?? talep.fiyat;
            const fiyat = Number(fiyatHam);
            if (!Number.isFinite(fiyat) || fiyat < 0) {
                return res.status(400).json({ error: 'Geçerli bir fiyat girin' });
            }

            // Merkezin düzelttiği alanlar; gönderilmeyen alan talepteki hâlinde kalır.
            const satir = {
                id: yeniId(), ad, fiyat, kategori_id: kategoriId, tur: 'ortak',
                gorsel: req.body?.gorsel !== undefined ? temizle(req.body.gorsel, 500) : (talep.gorsel || ''),
                aciklama: req.body?.aciklama !== undefined
                    ? temizle(req.body.aciklama, LIMITLER.aciklama)
                    : (talep.aciklama || ''),
            };
            if (Array.isArray(req.body?.etiket)) {
                satir.etiket = req.body.etiket.filter((x) => typeof x === 'string' && x.trim()).slice(0, 12);
            }
            // Sayısal alanlar: boş/geçersiz gelirse hiç yazılmaz (null kalır).
            const sayi = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : undefined; };
            if (sayi(req.body?.miktar) !== undefined) satir.miktar = sayi(req.body.miktar);
            if (sayi(req.body?.kalori) !== undefined) satir.kalori = sayi(req.body.kalori);
            if (req.body?.birim !== undefined) satir.birim = temizle(req.body.birim, 10);

            urunId = satir.id;
            veriYaDaHata(await supabase.from('urunler').insert(satir), 'ürün oluşturulamadı');
        }

        // Ürün YALNIZCA talep eden şubede açılır; diğer şubeler isterse kendi
        // panelinden ekler (ortak katalog mantığı, bkz. products.toggleMenu).
        veriYaDaHata(
            await supabase.from('urun_sube').upsert(
                { urun_id: urunId, sube_kod: talep.sube_kod, menude: true, mevcut_degil: false },
                { onConflict: 'urun_id,sube_kod' }
            ),
            'ürün şubede açılamadı'
        );

        veriYaDaHata(
            await supabase.from('urun_talepleri').update({
                durum: 'onaylandi',
                eslesen_urun_id: urunId,
                admin_notu: temizle(req.body?.not, LIMITLER.adminNotu) || talep.admin_notu,
                karar_veren: req.user.uid || null,
                karar_zamani: new Date().toISOString(),
            }).eq('id', id),
            'talep güncellenemedi'
        );

        // Menü JSON'u SON adımda: üsttekiler patlarsa yayında yarım ürün olmasın.
        await regenerateAffectedMenuJsons({ id: urunId, tur: 'ortak', sube_kod: null })
            .catch((e) => console.error('[ÜrünTalep] menü yenilenemedi:', e.message));

        res.json({ success: true, urunId });
    })
);

/**
 * PATCH /api/urun-talepleri/:id/reddet
 * Gövde: { not? } — şube gerekçeyi kendi listesinde görür.
 */
router.patch(
    '/:id/reddet',
    verifyToken,
    requirePermission('urunTalep.manage'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const talep = veriYaDaHata(
            await supabase.from('urun_talepleri').select('durum').eq('id', id).maybeSingle(),
            'talep okunamadı'
        );
        if (!talep) return res.status(404).json({ error: 'Talep bulunamadı' });
        if (talep.durum !== 'bekliyor') {
            return res.status(409).json({ error: 'Talep zaten karara bağlanmış' });
        }

        veriYaDaHata(
            await supabase.from('urun_talepleri').update({
                durum: 'reddedildi',
                admin_notu: temizle(req.body?.not, LIMITLER.adminNotu),
                karar_veren: req.user.uid || null,
                karar_zamani: new Date().toISOString(),
            }).eq('id', id),
            'talep güncellenemedi'
        );
        res.json({ success: true });
    })
);

export default router;
