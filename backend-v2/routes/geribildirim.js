import { Router } from '../shared/router.js';
import { oranSiniri } from '../shared/limit.js';
import { supabase } from '../config/supabase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { yeniId, temizNull, veriYaDaHata, isoZ, tumSatirlar } from '../utils/veri.js';

const router = Router();

// WordPress formundaki kategorilerle birebir
const KATEGORILER = ['urun_kalitesi', 'servis', 'temizlik', 'fiyat', 'diger'];
const DURUMLAR = ['yeni', 'inceleniyor', 'cozuldu', 'kapatildi'];

const LIMITLER = { ad: 80, soyad: 80, email: 120, telefon: 30, mesaj: 3000, olayTarihi: 30 };

const KAYNAKLAR = ['qr', 'sikayetvar', 'elle'];

const temizle = (v, max) => String(v ?? '').trim().slice(0, max);
const gecerliEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Takip kodu: müşteriye verilen, durum sorgulamada kullanılan kısa kod.
// Alfabeden 0/O ve 1/I/L çıkarıldı — kod telefonda okunuyor, karıştırılmamalı.
// 6 karakter = 32^6 ≈ 1 milyar; kod TAHMİN EDİLEMEZ olmalı çünkü sorgu ucu
// kimlik doğrulamıyor (yine de PII döndürmüyor, yalnızca durum).
const KOD_ALFABE = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function takipKodu() {
    const b = crypto.getRandomValues(new Uint8Array(6));
    return 'SK-' + Array.from(b, (x) => KOD_ALFABE[x % KOD_ALFABE.length]).join('');
}

/**
 * Şikayet geçmişine satır yazar (dahili not / müşteri dönüşü / durum değişimi).
 * Hata YUTULMAZ: menü günlüğünün aksine burada kayıt işin kendisi —
 * "müşteriyi aradım" notu yazılamadıysa kullanıcı bunu bilmeli.
 */
async function gecmiseYaz(req, bildirimId, kayit) {
    veriYaDaHata(
        await supabase.from('geri_bildirim_mesajlari').insert({
            bildirim_id: bildirimId,
            kullanici: req.user?.uid || null,
            kullanici_eposta: req.user?.email || null,
            rol: req.user?.role || null,
            ...kayit,
        }),
        'şikayet geçmişi yazılamadı'
    );
}

/** Satır → eski API şekli */
const yanit = (b) => temizNull({
    id: b.id,
    subeSlug: b.sube_slug, subeAd: b.sube_ad, kategori: b.kategori,
    ad: b.ad, soyad: b.soyad, email: b.email, telefon: b.telefon,
    mesaj: b.mesaj, olayTarihi: b.olay_tarihi, kvkkOnay: b.kvkk_onay,
    durum: b.durum,
    takipNo: b.takip_no,
    kaynak: b.kaynak || 'qr',
    kaynakUrl: b.kaynak_url,
    ilkYanit: isoZ(b.ilk_yanit),
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
        const { data: sube } = await supabase.from('subeler')
            .select('ad, kapanma_tarihi').eq('kod', subeSlug).maybeSingle();
        if (!sube) {
            return res.status(404).json({ error: 'Şube bulunamadı.' });
        }
        // Kapanan şubenin QR'ı hâlâ taranıyor olabilir; kayıt açılmaz.
        if (sube.kapanma_tarihi) {
            return res.status(410).json({ error: 'Bu şube kapanmıştır.' });
        }

        // Takip kodu çakışırsa yeniden dene: kısmi tekil indeks 23505 döndürür.
        // Üç deneme 32^6'lık uzayda pratikte yeterli.
        let takipNo = null;
        for (let deneme = 0; deneme < 3; deneme++) {
            const aday = takipKodu();
            const { error } = await supabase.from('geri_bildirimler').insert({
                id: yeniId(),
                ...veri,
                sube_slug: subeSlug,
                sube_ad: sube.ad || subeSlug,
                kategori,
                kvkk_onay: true,
                durum: 'yeni',
                admin_notu: '',
                takip_no: aday,
                kaynak: 'qr',
                olusturma: new Date().toISOString(),
            });
            if (!error) { takipNo = aday; break; }
            if (error.code !== '23505') throw new Error(error.message);
        }
        if (!takipNo) return res.status(500).json({ error: 'Kayıt oluşturulamadı, lütfen tekrar deneyin.' });

        // Takip kodu YANITTA: müşteri formu kapattıktan sonra durumunu
        // sorabilmeli — e-posta gönderme altyapısı yok, kod ekranda kalıyor.
        res.json({ success: true, takipNo });
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
        // Şube sahibi yalnızca kendi şubesi — kapsam sorgu parametresinden değil
        // token'daki subeSlug'dan gelir. (Firestore'daki bileşik indeks zorunluluğu
        // Postgres'te yok.)
        if (req.user.role !== 'admin' && !req.user.subeSlug) {
            return res.status(403).json({ error: 'Şubenize ait bir kayıt bulunamadı.' });
        }

        // `.limit(5000)` YETMİYORDU: PostgREST'in satır tavanı 1000 ve fazlasını
        // SESSİZCE kırpıyor — kayıt sayısı bini geçtiği gün hata da uyarı da
        // olmadan şikayetler listeden düşerdi. tumSatirlar sayfa sayfa çekiyor.
        const satirlar = await tumSatirlar(
            () => {
                const s = supabase.from('geri_bildirimler').select('*');
                return req.user.role === 'admin' ? s : s.eq('sube_slug', req.user.subeSlug);
            },
            { sirala: 'id', baglam: 'geri bildirimler' }
        );
        // Sayfalama deterministik olsun diye id'ye göre çekiliyor; ekranın
        // beklediği sıra (yeniden eskiye) burada veriliyor.
        satirlar.sort((a, b) => String(b.olusturma || '').localeCompare(String(a.olusturma || '')));
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
            .from('geri_bildirimler').select('id, sube_slug, durum').eq('id', req.params.id).maybeSingle();
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

        // Durum değişikliği geçmişe düşer; not güncellemesi DÜŞMEZ — o alan
        // "son durum" niteliğinde, her tuşta satır üretmesi akışı boğardı.
        // (Kalıcı iz isteyen ekip üyesi geçmişe not olarak yazıyor.)
        if (guncelleme.durum && guncelleme.durum !== mevcut.durum) {
            await gecmiseYaz(req, req.params.id, {
                tur: 'durum', metin: '',
                eski_durum: mevcut.durum, yeni_durum: guncelleme.durum,
            });
        }
        res.json({ success: true });
    })
);

/**
 * GET /api/geribildirim/:id/gecmis
 * Şikayetin akışı: dahili notlar, müşteri dönüşleri ve durum değişiklikleri.
 */
router.get(
    '/:id/gecmis',
    verifyToken,
    requirePermission('geribildirim.view'),
    asyncHandler(async (req, res) => {
        const { data: kayit } = await supabase
            .from('geri_bildirimler').select('id, sube_slug').eq('id', req.params.id).maybeSingle();
        if (!kayit) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
        if (req.user.role !== 'admin' && kayit.sube_slug !== req.user.subeSlug) {
            return res.status(403).json({ error: 'Bu kayıt sizin şubenize ait değil.' });
        }

        const satirlar = veriYaDaHata(
            await supabase.from('geri_bildirim_mesajlari').select('*')
                .eq('bildirim_id', req.params.id).order('zaman').limit(500),
            'geçmiş okunamadı'
        );

        res.json({
            gecmis: satirlar.map((m) => ({
                id: m.id,
                zaman: isoZ(m.zaman),
                kim: m.kullanici_eposta || '—',
                rol: m.rol,
                tur: m.tur,
                metin: m.metin || '',
                eskiDurum: m.eski_durum,
                yeniDurum: m.yeni_durum,
            })),
        });
    })
);

/**
 * POST /api/geribildirim/:id/mesaj
 * Gövde: { tur: 'not' | 'musteri', metin }
 *
 * `musteri` = müşteriye yapılan dönüş (telefon/e-posta). E-posta gönderme
 * altyapısı YOK; bu kayıt "aradık, şunu konuştuk" izidir. İlk müşteri
 * dönüşü SLA saatini durdurur (`ilk_yanit`).
 */
router.post(
    '/:id/mesaj',
    verifyToken,
    requirePermission('geribildirim.manage'),
    asyncHandler(async (req, res) => {
        const tur = temizle(req.body?.tur, 20);
        if (!['not', 'musteri'].includes(tur)) {
            return res.status(400).json({ error: 'Geçersiz mesaj türü.' });
        }
        const metin = temizle(req.body?.metin, LIMITLER.mesaj);
        if (!metin) return res.status(400).json({ error: 'Mesaj boş olamaz.' });

        const { data: kayit } = await supabase.from('geri_bildirimler')
            .select('id, sube_slug, ilk_yanit').eq('id', req.params.id).maybeSingle();
        if (!kayit) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
        if (req.user.role !== 'admin' && kayit.sube_slug !== req.user.subeSlug) {
            return res.status(403).json({ error: 'Bu kayıt sizin şubenize ait değil.' });
        }

        await gecmiseYaz(req, req.params.id, { tur, metin });

        // İlk MÜŞTERİ dönüşü SLA ölçüsü; dahili not saati durdurmaz.
        const guncelleme = { guncelleme: new Date().toISOString() };
        if (tur === 'musteri' && !kayit.ilk_yanit) guncelleme.ilk_yanit = guncelleme.guncelleme;
        veriYaDaHata(
            await supabase.from('geri_bildirimler').update(guncelleme).eq('id', req.params.id),
            'kayıt güncellenemedi'
        );

        res.json({ success: true });
    })
);

/**
 * POST /api/geribildirim/elle
 * Dış kaynaktan (Şikayetvar, telefon, sosyal medya) gelen şikayeti masaya
 * ELLE ekler. Herkese açık POST / ile aynı tabloya yazar: şikayet nereden
 * gelirse gelsin tek gelen kutusunda yönetilsin.
 *
 * ADMIN'E ÖZEL: şube kendi hakkında kayıt açamaz/kapatamaz.
 */
router.post(
    '/elle',
    verifyToken,
    requirePermission('geribildirim.create'),
    asyncHandler(async (req, res) => {
        const subeSlug = temizle(req.body?.subeSlug, 60);
        const kategori = temizle(req.body?.kategori, 40);
        const kaynak = temizle(req.body?.kaynak, 20) || 'elle';
        if (!KATEGORILER.includes(kategori)) return res.status(400).json({ error: 'Geçersiz konu.' });
        if (!KAYNAKLAR.includes(kaynak)) return res.status(400).json({ error: 'Geçersiz kaynak.' });

        const mesaj = temizle(req.body?.mesaj, LIMITLER.mesaj);
        if (!mesaj) return res.status(400).json({ error: 'Şikayet metni zorunlu.' });

        let subeAd = null;
        if (subeSlug) {
            const { data: sube } = await supabase.from('subeler').select('ad').eq('kod', subeSlug).maybeSingle();
            if (!sube) return res.status(404).json({ error: 'Şube bulunamadı.' });
            subeAd = sube.ad;
        }

        const id = yeniId();
        const { error } = await supabase.from('geri_bildirimler').insert({
                id,
                sube_slug: subeSlug || null,
                sube_ad: subeAd,
                kategori,
                ad: temizle(req.body?.ad, LIMITLER.ad),
                soyad: temizle(req.body?.soyad, LIMITLER.soyad),
                email: temizle(req.body?.email, LIMITLER.email),
                telefon: temizle(req.body?.telefon, LIMITLER.telefon),
                mesaj,
                olay_tarihi: temizle(req.body?.olayTarihi, LIMITLER.olayTarihi),
                // KVKK onayı BURADA YOK: kaydı müşteri değil merkez açıyor,
                // form onayı taklit edilmemeli.
                kvkk_onay: false,
                durum: 'yeni',
                admin_notu: '',
                kaynak,
                kaynak_url: temizle(req.body?.kaynakUrl, 500) || null,
                kaynak_id: temizle(req.body?.kaynakId, 200) || null,
                olusturma: temizle(req.body?.olusturma, 40) || new Date().toISOString(),
        });
        // Aynı dış kayıt iki kez eklenemez (kaynak + kaynak_id tekil indeksi).
        // Ham kısıt mesajı 500 olarak dönüyordu; çekim betiği bunu "zaten var"
        // diye ayırt edebilmeli.
        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Bu şikayet zaten eklenmiş.' });
            }
            throw new Error(error.message);
        }

        res.status(201).json({ success: true, id });
    })
);

/**
 * GET /api/geribildirim/durum/:takipNo
 * HERKESE AÇIK durum sorgulama — müşteri şikayetinin nerede olduğunu görür.
 *
 * KİŞİSEL VERİ DÖNDÜRMEZ: kodu ele geçiren biri ad/telefon/e-posta ya da
 * şikayet metnini göremez, yalnızca durumu ve tarihleri görür. Kod tahmin
 * edilemez (32^6) ve sorgu oran sınırlı.
 */
router.get(
    '/durum/:takipNo',
    bildirimLimiter,
    asyncHandler(async (req, res) => {
        const kod = temizle(req.params.takipNo, 20).toUpperCase();
        const { data } = await supabase.from('geri_bildirimler')
            .select('takip_no, durum, kategori, sube_ad, olusturma, guncelleme, ilk_yanit')
            .eq('takip_no', kod).maybeSingle();
        if (!data) return res.status(404).json({ error: 'Bu takip kodu bulunamadı.' });

        res.json({
            takipNo: data.takip_no,
            durum: data.durum,
            kategori: data.kategori,
            subeAd: data.sube_ad,
            olusturmaZamani: isoZ(data.olusturma),
            guncellemeZamani: isoZ(data.guncelleme),
            donuldu: !!data.ilk_yanit,
        });
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
