import { Router } from '../../../shared/router.js';
import { ETIKET_ANAHTARLARI } from '../constants/etiketler.js';
import { acikSubeler } from '../../../shared/sube.js';
import { supabase } from '../../../config/supabase.js';
import { verifyToken, requirePermission } from '../../../middleware/auth.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { yeniId, veriYaDaHata, isoZ, tumSatirlar } from '../../../utils/veri.js';
import {
    regenerateAffectedMenuJsons, regenerateMenuJsons, regenerateMenuJson, regenerateForAffected,
} from '../services/menu-cache.js';

// katalog-cache.js + bumpKatalogVersion middleware'i TAŞINMADI: ikisi de
// Firestore okuma maliyetini kısmak içindi (katalog 510 doküman = 510 okuma).
// Postgres'te katalog tek sorgu; sürüm damgası tutup instance'lar arası cache
// geçersizleştirmeye gerek yok.

const router = Router();

// ─────────────────────────── Veri katmanı ───────────────────────────
// urun_sube satırları ↔ eski Firestore dizileri arasındaki çeviri BURADA yapılır.
// Kural fonksiyonları (urunKilitliMi, urunGizliMi, menudeMi, yanitProjeksiyonu…)
// eski hâlleriyle korunuyor; onlar hâlâ dizi/harita gören nesnelerle çalışır.

/** Ürün satırı + (varsa) urun_sube satırları → eski API'deki ürün nesnesi. */
function urunNesnesi(satir, uyeler = []) {
    const menude_subeler = [], gizli_subeler = [], mevcut_degil = [], fiyat_serbest = [];
    const fiyat_override = {};
    // Şubenin KENDİ etiketleri (urun_sube.etiket) — merkezinkinden ayrı tutulur,
    // menüde birleştirilir (bkz. 0017_sube_etiketleri.sql).
    const sube_etiket = {};
    for (const u of uyeler) {
        if (u.menude) menude_subeler.push(u.sube_kod);
        if (u.gizli) gizli_subeler.push(u.sube_kod);
        if (u.mevcut_degil) mevcut_degil.push(u.sube_kod);
        if (u.fiyat_serbest) fiyat_serbest.push(u.sube_kod);
        if (u.fiyat_override !== null && u.fiyat_override !== undefined) {
            fiyat_override[u.sube_kod] = Number(u.fiyat_override);
        }
        if (Array.isArray(u.etiket) && u.etiket.length) sube_etiket[u.sube_kod] = u.etiket;
    }

    const urun = {
        id: satir.id,
        tur: satir.tur,
        ad: satir.ad,
        fiyat: Number(satir.fiyat),
        kategori: satir.kategori_id,
        aciklama: satir.aciklama ?? '',
        etiket: satir.etiket ?? [],
        gorsel: satir.gorsel ?? '',
        miktar: satir.miktar === null || satir.miktar === undefined ? null : Number(satir.miktar),
        birim: satir.birim ?? '',
        createdAt: isoZ(satir.olusturma),
    };
    // kalori Firestore'da yalnızca 19 üründe vardı — null ise anahtar YAZILMAZ.
    // (0 meşru bir değer: su/sade soda. Bu yüzden `!= null` ile bakılır.)
    if (satir.kalori !== null && satir.kalori !== undefined) urun.kalori = Number(satir.kalori);
    // Firestore'da olmayan alan yanıtta da görünmüyordu — şekli koru
    if (satir.sube_kod) urun.sube_slug = satir.sube_kod;
    if (satir.kilitli !== null && satir.kilitli !== undefined) urun.kilitli = satir.kilitli;
    if (satir.silinme) urun.deletedAt = isoZ(satir.silinme);
    if (satir.tur !== 'sube_ozel') {
        urun.menude_subeler = menude_subeler;
        urun.gizli_subeler = gizli_subeler;
        urun.mevcut_degil = mevcut_degil;
        urun.fiyat_serbest = fiyat_serbest;
        urun.fiyat_override = fiyat_override;
        urun.sube_etiket = sube_etiket;
    }
    return urun;
}

/**
 * Ürünlerin şube üyeliklerini getirir.
 * @param {string[]} urunIdler
 * @param {string|null} subeKod - doluysa yalnızca o şubenin satırları (şube
 *   sahibi yanıtında zaten başka şubenin verisi projeksiyonla siliniyor;
 *   baştan okumamak hem ucuz hem sızıntıya kapalı)
 */
async function uyelikleriGetir(urunIdler, subeKod = null) {
    const harita = new Map();
    if (urunIdler.length === 0) return harita;
    for (let i = 0; i < urunIdler.length; i += 300) {
        const parca = urunIdler.slice(i, i + 300);
        // 3.000+ satır dönebilir — sayfalanmalı (bkz. utils/veri.js#tumSatirlar)
        const satirlar = await tumSatirlar(() => {
            let s = supabase.from('urun_sube').select('*').in('urun_id', parca);
            if (subeKod) s = s.eq('sube_kod', subeKod);
            return s;
        }, { sirala: ['urun_id', 'sube_kod'], baglam: 'ürün-şube satırları' });
        for (const s of satirlar) {
            if (!harita.has(s.urun_id)) harita.set(s.urun_id, []);
            harita.get(s.urun_id).push(s);
        }
    }
    return harita;
}

/** Tek satırlık üyelik yaması (satır yoksa varsayılanlarla oluşur). */
async function uyelikYaz(urunId, subeKod, yama) {
    veriYaDaHata(
        await supabase.from('urun_sube').upsert(
            { urun_id: urunId, sube_kod: subeKod, ...yama },
            { onConflict: 'urun_id,sube_kod' }
        ),
        'ürün-şube satırı yazılamadı'
    );
}

/**
 * Boolean bir üyelik alanını (menude/gizli/mevcut_degil/fiyat_serbest) verilen
 * şube listesine EŞİTLER: listedekiler true, eskiden true olup listede olmayanlar false.
 */
async function uyelikDiziSenkron(urunId, alan, yeniSubeler) {
    const hedef = [...new Set(yeniSubeler)];
    const mevcut = veriYaDaHata(
        await supabase.from('urun_sube').select('sube_kod').eq('urun_id', urunId).eq(alan, true).range(0, 99999),
        'ürün-şube satırları okunamadı'
    ).map((s) => s.sube_kod);

    const eklenecek = hedef.filter((s) => !mevcut.includes(s));
    const kaldirilacak = mevcut.filter((s) => !hedef.includes(s));

    if (eklenecek.length > 0) {
        veriYaDaHata(
            await supabase.from('urun_sube').upsert(
                eklenecek.map((sube_kod) => ({ urun_id: urunId, sube_kod, [alan]: true })),
                { onConflict: 'urun_id,sube_kod' }
            ),
            'ürün-şube satırları yazılamadı'
        );
    }
    if (kaldirilacak.length > 0) {
        veriYaDaHata(
            await supabase.from('urun_sube').update({ [alan]: false })
                .eq('urun_id', urunId).in('sube_kod', kaldirilacak),
            'ürün-şube satırları güncellenemedi'
        );
    }
}

/**
 * Ürün dokümanını bul — id doğrudan birincil anahtar.
 *
 * collectionGroup fallback'i ÖLDÜ: tek tablo, tek sorgu. `subeSlug` yalnızca
 * kapsam kontrolü için kullanılır — şube sahibi başka şubenin özel ürününü
 * bulamasın diye (eski davranışta da bulamıyordu, 404 alıyordu).
 */
async function findProduct(id, subeSlug) {
    const { data: satir } = await supabase.from('urunler').select('*').eq('id', id).maybeSingle();
    if (!satir) return null;
    if (satir.tur === 'sube_ozel' && subeSlug && satir.sube_kod !== subeSlug) return null;

    const uyeler = satir.tur === 'sube_ozel' ? [] : (await uyelikleriGetir([id])).get(id) || [];
    return {
        satir,
        urun: urunNesnesi(satir, uyeler),
        source: satir.tur,
        subeSlug: satir.sube_kod || undefined,
    };
}

/**
 * Kategori bazlı gizleme haritası: kategoriId → gizlenen şube kodları.
 * Ürün seviyesindeki `gizli` ile BİRLİKTE çalışır; biri yeterse ürün gizlidir.
 */
/**
 * Kategori bazlı "menüden çıkarılamaz" haritası (kategoriId -> bool).
 * Admin için hiç okunmaz — kural yalnızca şube sahibini bağlar.
 */
/** Kullanıcının şubesinin bu üründeki kendi etiketleri. Admin için boş. */
function subeEtiketi(user, urun) {
    if (user.role === 'admin' || !user.subeSlug) return [];
    return urun.sube_etiket?.[user.subeSlug] || [];
}

async function katCikarmaKilidi(req) {
    if (req.user.role === 'admin') return {};
    const satirlar = veriYaDaHata(
        await supabase.from('kategoriler').select('id, menuden_cikarilamaz'),
        'kategoriler okunamadı'
    );
    const m = {};
    satirlar.forEach((k) => { m[k.id] = !!k.menuden_cikarilamaz; });
    return m;
}

async function katGizliHaritasi(req) {
    if (req.user.role === 'admin') return {};
    const satirlar = veriYaDaHata(
        await supabase.from('kategoriler').select('id, gizli_subeler'),
        'kategoriler okunamadı'
    );
    const m = {};
    satirlar.forEach((k) => { m[k.id] = new Set(k.gizli_subeler || []); });
    return m;
}

// ─────────────────────── Kural fonksiyonları (aynen) ───────────────────────

/**
 * Ürün, ilgili kullanıcı için kilitli mi? — KİLİT KURALININ TEK KAYNAĞI.
 *
 * - Admin: asla kilitli değil.
 * - Ortak ürün: HER ZAMAN kilitli. Tek kayıt olduğu için bir şubenin
 *   düzenlemesi tüm şubelerde değişirdi — yapısal kilit, bayrakla açılamaz.
 * - Şubeye özel ürün: ürünün kendi `kilitli` bayrağı; bayrak yoksa açık.
 *
 * KATEGORİ MİRASI KALKTI: `kategoriler.kilitli` panelden hiç ayarlanamıyordu
 * (form o alanı hiç göndermiyordu) ve yalnızca şubeye özel üründe okunuyordu —
 * öyle ürün de yok. Kolonla birlikte bu dal da silindi; her uçta bir Supabase
 * okuması eksildi (alt-istek bütçesi 50).
 */
function urunKilitliMi(user, urun) {
    if (user.role === 'admin') return false;
    if (urun.tur !== 'sube_ozel') return true;
    if (urun.sube_slug && urun.sube_slug !== user.subeSlug) return true;
    return typeof urun.kilitli === 'boolean' ? urun.kilitli : false;
}

/**
 * Ürün bu şubeden GİZLENMİŞ mi? — merkez kontrolündedir.
 *   gizli_subeler  → MERKEZ yasaklar. Şube ürünü panelde göremez, ekleyemez.
 *   menude_subeler → ŞUBE seçer. Sattığı ürünleri kataloğdan menüsüne ekler.
 *   mevcut_degil   → ŞUBE geçici kapatır (stok yok). Panelde durur, geri açar.
 */
function urunGizliMi(user, urun, katGizli = {}) {
    if (user.role === 'admin') return false;
    if ((urun.gizli_subeler || []).includes(user.subeSlug)) return true;
    // Kategorisi bu şubeden gizlenmişse ürün de gizlidir.
    return !!katGizli[urun.kategori]?.has(user.subeSlug);
}

/** Ortak ürün bu şubenin MENÜSÜNDE mi? (`menude_subeler` bir OPT-IN listesidir) */
function menudeMi(user, urun) {
    if (user.role === 'admin') return true;
    if (urun.tur === 'sube_ozel') return true;
    return (urun.menude_subeler || []).includes(user.subeSlug);
}

/**
 * YANIT PROJEKSİYONU — şube sahibine giden gövdeden merkeze ait yönetim
 * alanlarını çıkarır. TEK KAYNAK: ürün döndüren her yol buradan geçer.
 */
function yanitProjeksiyonu(user, urun) {
    if (user.role === 'admin') return urun;
    // `sube_etiket` TÜM şubelerin etiket haritası — şubeye sızmamalı; yerine
    // yalnızca kendi etiketleri düz bir alan olarak verilir.
    const { fiyat_override, gizli_subeler, fiyat_serbest, menude_subeler, sube_etiket, ...guvenli } = urun;
    return { ...guvenli, subeEtiket: sube_etiket?.[user.subeSlug] || [] };
}

/** Şube slug dizisini temizler (tekilleştirir, boşları atar). */
const subeDizisi = (v) => [...new Set(
    (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean)
)];

/**
 * Opsiyonel sayısal alan (kalori gibi): boş ya da geçersiz girdi `null` olur.
 * `v ? Number(v) : null` yazılmaz: 0'ı düşürür (su/sade sodanın kalorisi 0) ve
 * sayı olmayan girdiyi NaN olarak yazar.
 */
const opsiyonelSayi = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Tüm şube slug'ları — yeni ortak ürünün varsayılan `menude_subeler` değeri. */
async function tumSubeSluglari() {
    // Kapanan şube menü seçicilerine girmez — yeni ürün ona açılamaz.
    const satirlar = veriYaDaHata(
        await acikSubeler(supabase.from('subeler').select('kod')).range(0, 9999), 'şubeler okunamadı'
    );
    return satirlar.map((s) => s.kod);
}

/**
 * Şube bu ürünün fiyatını KENDİ şubesi için değiştirebilir mi?
 * Yazılan fiyat ortak ürünün `fiyat` alanını DEĞİL, `urun_sube.fiyat_override`
 * satırını günceller — aksi halde bir şubenin değişikliği 88 şubede geçerli olurdu.
 */
function fiyatDuzenlenebilirMi(user, urun, katGizli = {}) {
    if (user.role === 'admin') return true;
    if (urun.tur === 'sube_ozel') return false; // kendi ürününde `kilitli` kuralı geçerli
    if (urunGizliMi(user, urun, katGizli)) return false;
    return (urun.fiyat_serbest || []).includes(user.subeSlug);
}

/** Şubenin gördüğü etkin fiyat: kendi override'ı varsa o, yoksa merkez fiyatı. */
function etkinFiyat(user, urun) {
    if (user.role === 'admin' || !user.subeSlug) return urun.fiyat;
    const o = urun.fiyat_override?.[user.subeSlug];
    return typeof o === 'number' ? o : urun.fiyat;
}

/**
 * Şube sahibi yalnızca KENDİ şubesinin, kilitli OLMAYAN özel ürününü
 * değiştirebilir. Ortak ürünler ve diğer şubelerin ürünleri yalnızca admin.
 */
function canMutateProduct(req, found) {
    if (req.user.role === 'admin') return true;
    return !urunKilitliMi(req.user, found.urun);
}

// ─────────────────────────────── Rotalar ───────────────────────────────

/**
 * GET /api/products
 * Admin: tüm ürünler | Şube sahibi: YALNIZCA menüsündeki ürünler
 */
router.get(
    '/',
    verifyToken,
    requirePermission('products.view'),
    asyncHandler(async (req, res) => {
        const urunler = [];

        if (req.user.role === 'admin') {
            const requestedSube = req.query.sube || 'all';

            // Ortak katalog
            const ortak = await tumSatirlar(
                () => supabase.from('urunler').select('*').eq('tur', 'ortak').is('silinme', null),
                { sirala: 'id', baglam: 'ürünler' }
            );
            const uyelikler = await uyelikleriGetir(ortak.map((u) => u.id));
            ortak.forEach((u) => urunler.push(urunNesnesi(u, uyelikler.get(u.id) || [])));

            // Şubeye özel ürünler
            if (requestedSube === 'all') {
                const ozel = await tumSatirlar(
                    () => supabase.from('urunler').select('*').eq('tur', 'sube_ozel').is('silinme', null),
                    { sirala: 'id', baglam: 'şube ürünleri' }
                );
                ozel.forEach((u) => urunler.push(urunNesnesi(u)));
            } else if (requestedSube !== 'ortak') {
                const ozel = veriYaDaHata(
                    await supabase.from('urunler').select('*').eq('tur', 'sube_ozel')
                        .eq('sube_kod', requestedSube).is('silinme', null).range(0, 99999),
                    'şube ürünleri okunamadı'
                );
                ozel.forEach((u) => urunler.push(urunNesnesi(u)));
            }
            // requestedSube === 'ortak' ise ekstra ürün eklenmez
        } else if (req.user.subeSlug) {
            // Şube sahibi: menüsündeki ortak ürünler — katalogun tamamı okunmaz.
            const satirlar = await tumSatirlar(
                () => supabase.from('urun_sube')
                    .select('*, urunler!inner(*)')
                    .eq('sube_kod', req.user.subeSlug)
                    .eq('menude', true)
                    .is('urunler.silinme', null),
                { sirala: 'urun_id', baglam: 'menü ürünleri' }
            );
            for (const s of satirlar) {
                const { urunler: u, ...uye } = s;
                urunler.push(urunNesnesi(u, [{ ...uye, sube_kod: req.user.subeSlug }]));
            }

            // Kendi şubesinin özel ürünleri
            const ozel = veriYaDaHata(
                await supabase.from('urunler').select('*').eq('sube_kod', req.user.subeSlug)
                    .is('silinme', null).range(0, 9999),
                'şube ürünleri okunamadı'
            );
            ozel.forEach((u) => urunler.push(urunNesnesi(u)));
        }

        // Her ürüne, İSTEYEN KULLANICI için hesaplanmış yetki alanlarını ekle.
        // Arayüz kuralları yeniden hesaplamaz, bu alanları okur — kural tek yerde yaşar.
        const katGizli = await katGizliHaritasi(req);
        const cikti = urunler
            // Merkezin bu şubeden gizlediği ürünler panelde de görünmez
            // (ürünün kendi gizlisi VEYA kategorisinin gizlisi)
            .filter((u) => !urunGizliMi(req.user, u, katGizli))
            .map((u) => yanitProjeksiyonu(req.user, {
                ...u,
                duzenlenemez: urunKilitliMi(req.user, u),
                fiyatDuzenlenebilir: fiyatDuzenlenebilirMi(req.user, u, katGizli),
                etkinFiyat: etkinFiyat(req.user, u),
                menude: menudeMi(req.user, u),
            }));

        res.json({ urunler: cikti });
    })
);

/**
 * GET /api/products/katalog
 * Şubenin menüsüne EKLEYEBİLECEĞİ ortak ürünler ("Ürün Ekle" penceresi).
 * Menüdeki ürünler `GET /` yolundan gelir; burası yalnızca menüde OLMAYANLARI
 * döndürür, iki liste çakışmaz.
 *
 * NOT: '/:id'den ÖNCE tanımlı olmalı.
 */
router.get(
    '/katalog',
    verifyToken,
    requirePermission('products.view'),
    asyncHandler(async (req, res) => {
        const ortak = await tumSatirlar(
            () => supabase.from('urunler').select('*').eq('tur', 'ortak').is('silinme', null),
            { sirala: 'id', baglam: 'katalog' }
        );
        // Şube sahibinde yalnızca kendi üyelik satırları okunur; admin için katalog
        // zaten boş dönecek (menudeMi admin'de her zaman true).
        const uyelikler = req.user.role === 'admin'
            ? new Map()
            : await uyelikleriGetir(ortak.map((u) => u.id), req.user.subeSlug);
        const katGizli = await katGizliHaritasi(req);

        const cikti = [];
        for (const satir of ortak) {
            const u = urunNesnesi(satir, uyelikler.get(satir.id) || []);
            // Merkezin bu şubeden gizlediği ürün katalogda da görünmez
            if (urunGizliMi(req.user, u, katGizli)) continue;
            // Zaten menüde olanlar listede duruyor; katalog eklenebilecekleri gösterir
            if (menudeMi(req.user, u)) continue;
            cikti.push(yanitProjeksiyonu(req.user, {
                ...u,
                duzenlenemez: urunKilitliMi(req.user, u),
                fiyatDuzenlenebilir: fiyatDuzenlenebilirMi(req.user, u, katGizli),
                etkinFiyat: etkinFiyat(req.user, u),
                menude: false,
            }));
        }

        res.json({ urunler: cikti });
    })
);

/**
 * GET /api/products/trash
 * Çöp kutusundaki ürünleri listele
 * NOT: '/:id' yok ama '/:id/...' rotaları var; sıra yine de erken tutuluyor.
 */
router.get(
    '/trash',
    verifyToken,
    requirePermission('products.view'),
    asyncHandler(async (req, res) => {
        const urunler = [];

        if (req.user.role === 'admin') {
            // Ortak ürünlerin çöp kutusu YALNIZCA admin'e ait: şube ortak ürünü
            // silemiyor (bkz. urunKilitliMi), dolayısıyla geri de alamıyor.
            const silinmis = await tumSatirlar(
                () => supabase.from('urunler').select('*').not('silinme', 'is', null),
                { sirala: 'id', baglam: 'çöp kutusu' }
            );
            const ortakIdler = silinmis.filter((u) => u.tur !== 'sube_ozel').map((u) => u.id);
            const uyelikler = await uyelikleriGetir(ortakIdler);
            silinmis.forEach((u) => urunler.push(urunNesnesi(u, uyelikler.get(u.id) || [])));
        } else if (req.user.subeSlug) {
            const silinmis = veriYaDaHata(
                await supabase.from('urunler').select('*').eq('sube_kod', req.user.subeSlug)
                    .not('silinme', 'is', null).range(0, 9999),
                'çöp kutusu okunamadı'
            );
            silinmis.forEach((u) => urunler.push(urunNesnesi(u)));
        }

        // Hesaplanmış kilit alanı — arayüz "Geri Al"/"Sil" butonlarını buna göre gösterir.
        res.json({
            urunler: urunler.map((u) => yanitProjeksiyonu(req.user, {
                ...u, duzenlenemez: urunKilitliMi(req.user, u),
            })),
        });
    })
);

/**
 * POST /api/products
 * Yeni ürün oluştur — kategori türüne göre ortak veya şubeye özel
 */
router.post(
    '/',
    verifyToken,
    requirePermission('products.create'),
    asyncHandler(async (req, res) => {
        const { ad, fiyat, kategori, aciklama, etiket, sube_slug, gorsel, miktar, birim, kalori, kilitli,
            gizli_subeler, fiyat_serbest, menude_subeler } = req.body;

        if (!ad || !ad.trim()) {
            return res.status(400).json({ error: 'Ürün adı zorunludur' });
        }
        if (fiyat === undefined || fiyat === null) {
            return res.status(400).json({ error: 'Fiyat zorunludur' });
        }
        if (!kategori) {
            return res.status(400).json({ error: 'Kategori zorunludur' });
        }

        const { data: kat } = await supabase.from('kategoriler').select('tur').eq('id', kategori).maybeSingle();
        const katTur = kat?.tur || 'ortak';

        // Şube sahibi: yalnızca kendi şubesine özel ürün ekleyebilir.
        if (req.user.role !== 'admin') {
            if (katTur !== 'sube_ozel') {
                return res.status(403).json({ error: 'Ortak ürün ekleme yetkiniz yok' });
            }
            if (sube_slug && sube_slug !== req.user.subeSlug) {
                return res.status(403).json({ error: 'Yalnızca kendi şubenize ürün ekleyebilirsiniz' });
            }
        }

        const id = yeniId();
        const satir = {
            id,
            ad: ad.trim(),
            fiyat: Number(fiyat),
            kategori_id: kategori,
            aciklama: aciklama?.trim() || '',
            etiket: etiket || [],
            gorsel: gorsel || '',
            miktar: miktar ? Number(miktar) : null,
            birim: birim || '',
            kalori: opsiyonelSayi(kalori),
            olusturma: new Date().toISOString(),
        };

        // Ürün bazlı kilit YALNIZCA admin tarafından belirlenir — aksi halde şube
        // kendi ürününü kilitten çıkarırdı. Belirtilmezse null kalır ve kilit
        // kategoriden miras alınır.
        if (req.user.role === 'admin' && kilitli !== undefined) {
            satir.kilitli = Boolean(kilitli);
        }

        let menude = [];
        let gizli = [];
        let serbest = [];

        if (katTur === 'sube_ozel') {
            const slug = sube_slug || req.user.subeSlug;
            if (!slug) {
                return res.status(400).json({ error: 'Şubeye özel ürün için şube bilgisi gerekli' });
            }
            satir.tur = 'sube_ozel';
            satir.sube_kod = slug;
        } else {
            satir.tur = 'ortak';
            // Şube bazlı merkez ayarları YALNIZCA admin'den gelir.
            gizli = req.user.role === 'admin' ? subeDizisi(gizli_subeler) : [];
            serbest = req.user.role === 'admin' ? subeDizisi(fiyat_serbest) : [];
            // Menüde gösterilecek şubeler. Belirtilmezse TÜM şubeler: merkez yeni
            // ürün eklediğinde varsayılan "her şubede açık". Yasaklı şube menüde olamaz.
            const istenen = menude_subeler !== undefined ? subeDizisi(menude_subeler) : await tumSubeSluglari();
            menude = istenen.filter((s) => !gizli.includes(s));
        }

        veriYaDaHata(await supabase.from('urunler').insert(satir), 'ürün eklenemedi');

        // Üyelik satırları — tek upsert.
        // DİKKAT: toplu upsert'te satırların ANAHTAR KÜMESİ AYNI olmalı. PostgREST
        // kolon listesini satırların birleşiminden kurar ve eksik alanı DEFAULT
        // değil NULL yazar → `fiyat_serbest` gibi NOT NULL kolonlar patlar.
        if (satir.tur === 'ortak') {
            const uyeMap = new Map();
            const al = (s) => {
                if (!uyeMap.has(s)) {
                    uyeMap.set(s, {
                        urun_id: id, sube_kod: s,
                        menude: false, gizli: false, mevcut_degil: false, fiyat_serbest: false,
                    });
                }
                return uyeMap.get(s);
            };
            menude.forEach((s) => { al(s).menude = true; });
            gizli.forEach((s) => { al(s).gizli = true; });
            serbest.forEach((s) => { al(s).fiyat_serbest = true; });
            if (uyeMap.size > 0) {
                const { error } = await supabase.from('urun_sube')
                    .upsert([...uyeMap.values()], { onConflict: 'urun_id,sube_kod' });
                if (error) {
                    // Ürün satırı yazıldı ama üyelikler yazılamadı — yarım ürün
                    // bırakma, geri al (kataloğa şubesiz hayalet ürün düşmesin).
                    await supabase.from('urunler').delete().eq('id', id);
                    throw new Error(`ürün-şube satırları yazılamadı: ${error.message}`);
                }
            }
        }

        // Kategori sayacı YOK: urunSayisi denormalizasyonu öldü, canlı sayılıyor.

        // Menü JSON cache'ini güvenilir şekilde yenile (yanıttan önce — serverless'te
        // yanıt sonrası iş kesilebilir). Hata yutulur, yazma başarılı sayılır.
        await regenerateAffectedMenuJsons({ id, tur: satir.tur, sube_kod: satir.sube_kod }).catch(console.error);

        const { data: yazilan } = await supabase.from('urunler').select('*').eq('id', id).maybeSingle();
        const uyeler = satir.tur === 'ortak' ? (await uyelikleriGetir([id])).get(id) || [] : [];
        res.status(201).json(urunNesnesi(yazilan, uyeler));
    })
);

/**
 * PUT /api/products/bulk-price
 * Seçili ürünlerin fiyatını toplu güncelle.
 * NOT: /:id'den ÖNCE tanımlı olmalı.
 */
router.put(
    '/bulk-price',
    verifyToken,
    requirePermission('products.edit'),
    asyncHandler(async (req, res) => {
        const { items, mode, value } = req.body;
        if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Ürün seçilmedi' });
        const v = Number(value);
        if (!['set', 'inc_pct', 'dec_pct', 'inc_amt', 'dec_amt'].includes(mode) || !Number.isFinite(v)) {
            return res.status(400).json({ error: 'Geçersiz fiyat işlemi' });
        }

        const affected = [];
        let updated = 0;
        for (const it of items) {
            const lookupSlug = req.user.role === 'admin' ? it.sube_slug : req.user.subeSlug;
            const found = await findProduct(it.id, lookupSlug);
            if (!found || !canMutateProduct(req, found)) continue;

            const cur = Number(found.satir.fiyat) || 0;
            let np = cur;
            if (mode === 'set') np = v;
            else if (mode === 'inc_pct') np = cur * (1 + v / 100);
            else if (mode === 'dec_pct') np = cur * (1 - v / 100);
            else if (mode === 'inc_amt') np = cur + v;
            else if (mode === 'dec_amt') np = cur - v;
            np = Math.max(0, Math.round(np * 100) / 100);

            veriYaDaHata(
                await supabase.from('urunler').update({ fiyat: np }).eq('id', it.id),
                'fiyat yazılamadı'
            );
            affected.push({ id: found.satir.id, tur: found.source, sube_kod: found.subeSlug });
            updated++;
        }

        await regenerateForAffected(affected);
        res.json({ success: true, updated });
    })
);

/**
 * POST /api/products/bulk
 * Birden çok ürünü tek seferde oluştur.
 */
router.post(
    '/bulk',
    verifyToken,
    requirePermission('products.create'),
    asyncHandler(async (req, res) => {
        const { products } = req.body;
        if (!Array.isArray(products) || products.length === 0) return res.status(400).json({ error: 'Ürün listesi boş' });

        const katSatirlari = veriYaDaHata(
            await supabase.from('kategoriler').select('id, tur'), 'kategoriler okunamadı'
        );
        const katMap = Object.fromEntries(katSatirlari.map((k) => [k.id, k]));

        // Ortak ürünler varsayılan olarak tüm şubelerin menüsüne düşer (bkz. POST /).
        let tumSubeler = null;

        const satirlar = [];
        const uyeSatirlari = [];
        const affected = [];
        for (const p of products) {
            if (!p.ad || !p.ad.trim() || p.fiyat === undefined || p.fiyat === null || p.fiyat === '' || !p.kategori) continue;
            const katTur = katMap[p.kategori]?.tur || 'ortak';
            if (req.user.role !== 'admin' && katTur !== 'sube_ozel') continue; // şube ortak ürün ekleyemez

            const id = yeniId();
            const satir = {
                id,
                ad: p.ad.trim(),
                fiyat: Number(p.fiyat),
                kategori_id: p.kategori,
                aciklama: (p.aciklama || '').trim(),
                etiket: p.etiket || [],
                gorsel: p.gorsel || '',
                miktar: p.miktar ? Number(p.miktar) : null,
                birim: p.birim || '',
                kalori: opsiyonelSayi(p.kalori),
                olusturma: new Date().toISOString(),
            };

            if (katTur === 'sube_ozel') {
                const slug = req.user.role === 'admin' ? (p.sube_slug || req.user.subeSlug) : req.user.subeSlug;
                if (!slug) continue;
                satir.tur = 'sube_ozel';
                satir.sube_kod = slug;
            } else {
                if (tumSubeler === null) tumSubeler = await tumSubeSluglari();
                satir.tur = 'ortak';
                tumSubeler.forEach((s) => uyeSatirlari.push({ urun_id: id, sube_kod: s, menude: true }));
            }
            satirlar.push(satir);
            affected.push({ id, tur: satir.tur, sube_kod: satir.sube_kod });
        }

        if (satirlar.length > 0) {
            veriYaDaHata(await supabase.from('urunler').insert(satirlar), 'ürünler eklenemedi');
            for (let i = 0; i < uyeSatirlari.length; i += 500) {
                veriYaDaHata(
                    await supabase.from('urun_sube').upsert(uyeSatirlari.slice(i, i + 500), { onConflict: 'urun_id,sube_kod' }),
                    'ürün-şube satırları yazılamadı'
                );
            }
        }

        await regenerateForAffected(affected);
        res.status(201).json({ success: true, created: satirlar.length });
    })
);

/**
 * POST /api/products/bulk-delete
 * Seçili ürünleri toplu çöp kutusuna taşı (soft delete).
 */
router.post(
    '/bulk-delete',
    verifyToken,
    requirePermission('products.delete'),
    asyncHandler(async (req, res) => {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Ürün seçilmedi' });

        const affected = [];
        const silinecek = [];
        for (const it of items) {
            const lookupSlug = req.user.role === 'admin' ? it.sube_slug : req.user.subeSlug;
            const found = await findProduct(it.id, lookupSlug);
            if (!found || !canMutateProduct(req, found)) continue;
            silinecek.push(found.satir.id);
            affected.push({ id: found.satir.id, tur: found.source, sube_kod: found.subeSlug });
        }

        if (silinecek.length > 0) {
            veriYaDaHata(
                await supabase.from('urunler').update({ silinme: new Date().toISOString() }).in('id', silinecek),
                'ürünler silinemedi'
            );
        }

        await regenerateForAffected(affected);
        res.json({ success: true, deleted: silinecek.length });
    })
);

/**
 * POST /api/products/menu
 * Ortak katalogtaki ürünleri şubenin menüsüne EKLER / menüden ÇIKARIR.
 * Body: { subeSlug?, ids: string[], menude: boolean }
 */
router.post(
    '/menu',
    verifyToken,
    requirePermission('products.toggleMenu'),
    asyncHandler(async (req, res) => {
        const { ids, menude } = req.body;
        // Şube sahibi her zaman KENDİ şubesine yazar — gövdeden gelen slug'a güvenilmez.
        const slug = req.user.role === 'admin' ? req.body.subeSlug : req.user.subeSlug;

        if (!slug) return res.status(400).json({ error: 'Şube bilgisi gerekli' });
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Ürün seçilmedi' });
        if (ids.length > 400) return res.status(400).json({ error: 'Tek seferde en fazla 400 ürün' });
        if (typeof menude !== 'boolean') return res.status(400).json({ error: 'menude alanı boolean olmalı' });

        const temizIds = [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))];

        const satirlar = veriYaDaHata(
            await supabase.from('urunler').select('id, tur, silinme, kategori_id').in('id', temizIds).range(0, 999),
            'ürünler okunamadı'
        );
        const uyelikler = await uyelikleriGetir(temizIds, slug);
        // Merkez bazı kategorileri "menüden çıkarılamaz" işaretleyebiliyor:
        // şube o ürünleri menüden kaldıramaz, yalnızca "mevcut değil" yapabilir
        // (bkz. 0016_kategori_kilit_ve_medya_paylasim.sql). Kural yalnızca
        // ÇIKARMA yönünde: ekleme serbest kalmalı.
        const cikarmaKilidi = menude === false ? await katCikarmaKilidi(req) : {};
        const kilitliKategori = [];

        const yazilacak = [];
        for (const s of satirlar) {
            if (s.silinme) continue;
            if (s.tur === 'sube_ozel') continue;
            if (menude === false && cikarmaKilidi[s.kategori_id]) { kilitliKategori.push(s.id); continue; }
            // Merkezin yasakladığı ürün şube için yok hükmünde — sessizce atlanır,
            // yoksa şube gizli ürünü menüsüne ekleyebilirdi.
            const uye = (uyelikler.get(s.id) || [])[0];
            if (uye?.gizli) continue;
            yazilacak.push({ urun_id: s.id, sube_kod: slug, menude });
        }

        if (yazilacak.length > 0) {
            veriYaDaHata(
                await supabase.from('urun_sube').upsert(yazilacak, { onConflict: 'urun_id,sube_kod' }),
                'menü üyeliği yazılamadı'
            );
            // Yalnızca bu şubenin menüsü değişti (88 şubeyi yenilemek gereksiz).
            await regenerateMenuJson(slug).catch(console.error);
        }

        // Tamamı kilitliyse sessiz başarı yerine açık hata: arayüz butonu
        // gizliyor ama uç doğrudan da çağrılabilir.
        if (yazilacak.length === 0 && kilitliKategori.length > 0) {
            return res.status(403).json({
                error: 'Bu kategorideki ürünler menüden çıkarılamaz. Satmıyorsanız "Mevcut değil" olarak işaretleyin.',
            });
        }
        res.json({ success: true, islenen: yazilacak.length, menude, kilitliKategori: kilitliKategori.length });
    })
);

/**
 * PUT /api/products/:id
 * Ürün güncelle
 */
router.put(
    '/:id',
    verifyToken,
    requirePermission('products.edit'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { ad, fiyat, kategori, aciklama, etiket, sube_slug, gorsel, miktar, birim, kalori, kilitli,
            gizli_subeler, fiyat_serbest, menude_subeler } = req.body;

        // Şube sahibi yalnızca kendi şubesinde arar (başka şubeyi hedefleyemez)
        const lookupSlug = req.user.role === 'admin' ? (sube_slug || req.body._subeSlug) : req.user.subeSlug;
        const found = await findProduct(id, lookupSlug);
        const katGizli = await katGizliHaritasi(req);
        if (!found) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }
        const urunVerisi = found.urun;

        // Merkezin gizlediği ürün şube için yok hükmündedir — varlığını sızdırmamak
        // adına 403 değil 404 döner.
        if (urunGizliMi(req.user, urunVerisi, katGizli)) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }

        const tamYetki = canMutateProduct(req, found);
        // Şube ortak ürünü düzenleyemez AMA merkez izin verdiyse yalnızca kendi
        // fiyatını ayarlayabilir. Bu fiyat ortak ürünün `fiyat` alanına DEĞİL,
        // urun_sube satırının `fiyat_override` kolonuna yazılır.
        const yalnizcaFiyat = !tamYetki && fiyatDuzenlenebilirMi(req.user, urunVerisi, katGizli);

        if (!tamYetki && !yalnizcaFiyat) {
            return res.status(403).json({ error: 'Bu ürünü değiştirme yetkiniz yok' });
        }

        if (yalnizcaFiyat) {
            const yeni = Number(fiyat);
            if (fiyat === undefined || !Number.isFinite(yeni) || yeni < 0) {
                return res.status(400).json({ error: 'Geçerli bir fiyat girin' });
            }
            // Tek satırlık atomik güncelleme — Firestore'daki FieldPath/nokta-yolu
            // sorunu (tireli slug'lar) yapısal olarak yok.
            await uyelikYaz(id, req.user.subeSlug, { fiyat_override: yeni });
            // YALNIZCA bu şubenin menüsü değişti.
            await regenerateMenuJson(req.user.subeSlug).catch(console.error);

            const guncelFound = await findProduct(id, lookupSlug);
            // Ortak ürünün TAMAMI dönerse şube, diğer şubelerin override'ını ve
            // merkezin gizleme/menü listelerini görürdü.
            const guncelVeri = yanitProjeksiyonu(req.user, guncelFound.urun);
            return res.json({ success: true, urun: { ...guncelVeri, etkinFiyat: yeni } });
        }

        const updateData = {};
        if (ad !== undefined) updateData.ad = ad.trim();
        if (fiyat !== undefined) updateData.fiyat = Number(fiyat);
        if (kategori !== undefined) updateData.kategori_id = kategori;
        if (aciklama !== undefined) updateData.aciklama = aciklama.trim();
        if (etiket !== undefined) updateData.etiket = etiket;
        if (gorsel !== undefined) updateData.gorsel = gorsel;
        if (miktar !== undefined) updateData.miktar = miktar ? Number(miktar) : null;
        if (birim !== undefined) updateData.birim = birim;
        if (kalori !== undefined) updateData.kalori = opsiyonelSayi(kalori);
        // Kilit bayrağını yalnızca admin değiştirebilir (bkz. urunKilitliMi).
        // null gönderilirse bayrak kaldırılır → kilit yine kategoriden miras alınır.
        if (req.user.role === 'admin' && kilitli !== undefined) {
            updateData.kilitli = kilitli === null ? null : Boolean(kilitli);
        }

        // Şube bazlı merkez ayarları — YALNIZCA admin yazabilir. Yasaklı şube
        // (gizli) menüde kalamaz: menude listesi her durumda gizliye göre budanır.
        const adminYaziyor = req.user.role === 'admin';
        const eskiMenude = urunVerisi.menude_subeler || [];
        const yeniGizli = adminYaziyor && gizli_subeler !== undefined
            ? subeDizisi(gizli_subeler)
            : (urunVerisi.gizli_subeler || []);

        let yeniMenude = null;
        if (adminYaziyor && menude_subeler !== undefined) {
            yeniMenude = subeDizisi(menude_subeler).filter((s) => !yeniGizli.includes(s));
        } else if (adminYaziyor && gizli_subeler !== undefined) {
            // Menü listesi bu istekte gelmedi ama gizleme değişti — mevcut listeyi buda
            const budanmis = eskiMenude.filter((s) => !yeniGizli.includes(s));
            if (budanmis.length !== eskiMenude.length) yeniMenude = budanmis;
        }

        const uyelikDegisti = adminYaziyor && (gizli_subeler !== undefined || fiyat_serbest !== undefined || yeniMenude !== null);
        if (Object.keys(updateData).length === 0 && !uyelikDegisti) {
            return res.json({ success: true });
        }

        if (Object.keys(updateData).length > 0) {
            veriYaDaHata(
                await supabase.from('urunler').update(updateData).eq('id', id),
                'ürün güncellenemedi'
            );
        }

        if (adminYaziyor && gizli_subeler !== undefined) {
            await uyelikDiziSenkron(id, 'gizli', yeniGizli);
        }
        if (yeniMenude !== null) {
            await uyelikDiziSenkron(id, 'menude', yeniMenude);
        }
        if (adminYaziyor && fiyat_serbest !== undefined) {
            const serbest = subeDizisi(fiyat_serbest);
            await uyelikDiziSenkron(id, 'fiyat_serbest', serbest);
            // Yetkisi geri alınan şubenin fiyatı ortalıkta kalmasın: izin listesinden
            // çıkan şubelerin override'ı temizlenir, ürün merkez fiyatına döner.
            const overrideliSubeler = Object.keys(urunVerisi.fiyat_override || {});
            const temizlenecek = overrideliSubeler.filter((s) => !serbest.includes(s));
            if (temizlenecek.length > 0) {
                veriYaDaHata(
                    await supabase.from('urun_sube').update({ fiyat_override: null })
                        .eq('urun_id', id).in('sube_kod', temizlenecek),
                    'fiyat override temizlenemedi'
                );
            }
        }

        // Kategori sayacı YOK (urunSayisi denormalizasyonu öldü).

        const guncelFound = await findProduct(id, lookupSlug);

        // Eski menü listesi de hedefe eklenir: ürün bir şubeden ÇIKARILDIYSA
        // o şubenin menüsü de yenilenmeli, yoksa ürün orada asılı kalır.
        await regenerateAffectedMenuJsons(
            { id, tur: found.source, sube_kod: found.subeSlug }, eskiMenude
        ).catch(console.error);

        res.json({ success: true, urun: yanitProjeksiyonu(req.user, guncelFound.urun) });
    })
);

/**
 * DELETE /api/products/:id
 * Soft delete — çöp kutusuna taşı
 */
router.delete(
    '/:id',
    verifyToken,
    requirePermission('products.delete'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { subeSlug } = req.query;

        const lookupSlug = req.user.role === 'admin' ? subeSlug : req.user.subeSlug;
        const found = await findProduct(id, lookupSlug);
        if (!found) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }
        if (!canMutateProduct(req, found)) {
            return res.status(403).json({ error: 'Bu ürünü silme yetkiniz yok' });
        }

        veriYaDaHata(
            await supabase.from('urunler').update({ silinme: new Date().toISOString() }).eq('id', id),
            'ürün silinemedi'
        );

        await regenerateAffectedMenuJsons({ id, tur: found.source, sube_kod: found.subeSlug }).catch(console.error);
        res.json({ success: true });
    })
);

/**
 * PUT /api/products/:id/restore
 * Ürünü çöp kutusundan geri al
 */
router.put(
    '/:id/restore',
    verifyToken,
    requirePermission('products.edit'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { subeSlug } = req.query;

        const lookupSlug = req.user.role === 'admin' ? subeSlug : req.user.subeSlug;
        const found = await findProduct(id, lookupSlug);
        if (!found) return res.status(404).json({ error: 'Ürün bulunamadı' });
        if (!canMutateProduct(req, found)) {
            return res.status(403).json({ error: 'Bu ürünü geri alma yetkiniz yok' });
        }

        veriYaDaHata(
            await supabase.from('urunler').update({ silinme: null }).eq('id', id),
            'ürün geri alınamadı'
        );

        await regenerateAffectedMenuJsons({ id, tur: found.source, sube_kod: found.subeSlug }).catch(console.error);
        res.json({ success: true });
    })
);

/**
 * DELETE /api/products/:id/permanent
 * Kalıcı silme
 */
router.delete(
    '/:id/permanent',
    verifyToken,
    requirePermission('products.delete'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { subeSlug } = req.query;

        const lookupSlug = req.user.role === 'admin' ? subeSlug : req.user.subeSlug;
        const found = await findProduct(id, lookupSlug);
        if (!found) return res.status(404).json({ error: 'Ürün bulunamadı' });
        if (!canMutateProduct(req, found)) {
            return res.status(403).json({ error: 'Bu ürünü silme yetkiniz yok' });
        }

        // Etkilenen şubeler silmeden ÖNCE okunur (cascade satırları da götürür)
        const hedefler = found.urun.menude_subeler || [];

        veriYaDaHata(
            await supabase.from('urunler').delete().eq('id', id),
            'ürün silinemedi'
        );

        if (found.source === 'sube_ozel' && found.subeSlug) {
            await regenerateMenuJson(found.subeSlug).catch(console.error);
        } else if (hedefler.length > 0) {
            await regenerateMenuJsons(hedefler).catch(console.error);
        }
        res.json({ success: true });
    })
);

/**
 * GET /api/products/sube-sapmalari/ozet
 * Sapmaların ÖZETİ — düz listenin cevaplayamadığı iki soru için.
 *
 *   ürün: hangi ürün kaç şubede kapatılmış? "88 şubede menüde, 88'inde
 *         kapalı" olan bir ürün 88 ayrı şube kararı değildir — fiilen var
 *         olmayan bir üründür ve katalog kararı gerektirir.
 *   şube: şube menüsünün ne kadarını kapatmış? Oran ham sayıdan anlamlı
 *         (39/58 ile 39/300 aynı şey değil) ve ortalamayla kıyaslanınca
 *         aykırı şube görünür.
 *
 * Gruplama SQL tarafında (bkz. 0018_sube_sapma_ozetleri.sql): 8.300 satırı
 * Worker'a çekmek sayfa başına ~9 alt-istek demekti, bütçe 50.
 *
 * ADMIN'E ÖZEL — şubeler arası görünüm.
 */
router.get(
    '/sube-sapmalari/ozet',
    verifyToken,
    requirePermission('products.view'),
    asyncHandler(async (req, res) => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Bu görünüm yalnızca merkez içindir' });
        }

        const [urunSonuc, subeSonuc] = await Promise.all([
            supabase.rpc('sube_sapma_urun_ozeti'),
            supabase.rpc('sube_sapma_sube_ozeti'),
        ]);
        if (urunSonuc.error) throw new Error(urunSonuc.error.message);
        if (subeSonuc.error) throw new Error(subeSonuc.error.message);

        const urunler = (urunSonuc.data || [])
            .map((r) => ({
                urunId: r.urun_id, ad: r.ad, kategoriId: r.kategori_id,
                menude: r.menude, kapali: r.kapali, fiyatli: r.fiyatli, etiketli: r.etiketli,
                // Menüde olduğu HER şubede kapalı → ürün fiilen yok.
                tamamenKapali: r.menude > 0 && r.kapali >= r.menude,
            }))
            .sort((a, b) => b.kapali - a.kapali || b.fiyatli - a.fiyatli);

        const subeler = (subeSonuc.data || [])
            .map((r) => ({
                subeKod: r.sube_kod, ad: r.ad, kapali: r.kapali, menude: r.menude,
                fiyatli: r.fiyatli, etiketli: r.etiketli,
                kapaliOran: r.menude > 0 ? r.kapali / r.menude : 0,
                kapanmaTarihi: r.kapanma_tarihi || null,
            }))
            .sort((a, b) => b.kapaliOran - a.kapaliOran);

        // Ortalama TÜM şubeler üzerinden (sapması olmayanlar dahil), yoksa
        // aykırılık ölçüsü şişer.
        const toplamMenude = subeler.reduce((t, x) => t + x.menude, 0);
        const toplamKapali = subeler.reduce((t, x) => t + x.kapali, 0);

        res.json({
            urunler,
            subeler,
            ortalamaKapaliOran: toplamMenude > 0 ? toplamKapali / toplamMenude : 0,
        });
    })
);

/**
 * GET /api/products/sube-sapmalari
 * Şubelerin merkez kaydından SAPTIĞI yerler — admin denetimi için.
 *
 * Üç sapma türü tek listede: "mevcut değil" işaretleri, şubenin kendi
 * etiketleri ve şube fiyatları. Bunlar `urun_sube` satırında durduğu için
 * ürün listesinde görünmüyorlardı; merkez "hangi şube neyi kapatmış"
 * sorusunu ancak şube şube gezerek cevaplayabiliyordu.
 *
 * Query: ?tur=mevcut_degil|etiket|fiyat (boş = hepsi) &sube= &q= &sayfa= &limit=
 *
 * ADMIN'E ÖZEL: şubeler arası bir görünüm; şube sahibi başka şubenin
 * kararlarını görmemeli.
 */
router.get(
    '/sube-sapmalari',
    verifyToken,
    requirePermission('products.view'),
    asyncHandler(async (req, res) => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Bu görünüm yalnızca merkez içindir' });
        }
        const { tur, sube, q } = req.query;
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const sayfa = Math.max(Number(req.query.sayfa) || 1, 1);
        const bas = (sayfa - 1) * limit;

        let sorgu = supabase.from('urun_sube')
            .select(
                'sube_kod, mevcut_degil, etiket, fiyat_override, '
                + 'urunler!inner(id, ad, fiyat, kategori_id, silinme), subeler(ad)',
                { count: 'exact' }
            )
            .is('urunler.silinme', null);

        // Tür süzgeci; boşsa üçünden HERHANGİ biri.
        if (tur === 'mevcut_degil') sorgu = sorgu.is('mevcut_degil', true);
        else if (tur === 'fiyat') sorgu = sorgu.not('fiyat_override', 'is', null);
        else if (tur === 'etiket') sorgu = sorgu.neq('etiket', '{}');
        else sorgu = sorgu.or('mevcut_degil.is.true,fiyat_override.not.is.null,etiket.neq.{}');

        if (sube) sorgu = sorgu.eq('sube_kod', sube);
        if (q && q.trim()) sorgu = sorgu.ilike('urunler.ad', `%${q.trim()}%`);

        const { data, error, count } = await sorgu
            .order('sube_kod').order('urun_id').range(bas, bas + limit - 1);
        if (error) throw new Error(error.message);

        res.json({
            toplam: count ?? 0,
            sayfa,
            limit,
            satirlar: (data || []).map((r) => ({
                subeKod: r.sube_kod,
                subeAd: r.subeler?.ad || r.sube_kod,
                urunId: r.urunler.id,
                urunAd: r.urunler.ad,
                kategoriId: r.urunler.kategori_id,
                merkezFiyat: Number(r.urunler.fiyat),
                mevcutDegil: !!r.mevcut_degil,
                etiket: r.etiket || [],
                subeFiyat: r.fiyat_override == null ? null : Number(r.fiyat_override),
            })),
        });
    })
);

/**
 * PUT /api/products/:id/etiket
 * Şube, KENDİ menüsündeki ürüne kendi etiketlerini koyar.
 * Body: { etiket: string[] }
 *
 * Merkezin `urunler.etiket` alanına DOKUNMAZ: o kayıt tek ve tüm şubeleri
 * etkilerdi. Şubenin etiketi yalnızca kendi menüsünde görünür, merkezinkiyle
 * BİRLEŞTİRİLİR (bkz. menu-builder.js). Bu yüzden ürün "kilitli" olsa bile
 * (ortak ürün) bu uç çalışır — kilit ürünün kendisini korur, şubenin kendi
 * satırını değil; müsaitlik ucuyla aynı mantık.
 */
router.put(
    '/:id/etiket',
    verifyToken,
    requirePermission('products.toggleAvailability'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const subeSlug = req.user.role === 'admin' ? req.body.subeSlug : req.user.subeSlug;
        if (!subeSlug) return res.status(400).json({ error: 'Şube bilgisi gerekli' });
        if (req.user.role !== 'admin' && req.user.subeSlug !== subeSlug) {
            return res.status(403).json({ error: 'Sadece kendi şubenizin etiketlerini değiştirebilirsiniz' });
        }

        const gecerli = new Set(ETIKET_ANAHTARLARI);
        const etiket = [...new Set(
            (Array.isArray(req.body?.etiket) ? req.body.etiket : [])
                .map((x) => String(x).trim()).filter((x) => gecerli.has(x))
        )];

        const { data: urun } = await supabase
            .from('urunler').select('id, kategori_id').eq('id', id).is('silinme', null).maybeSingle();
        if (!urun) return res.status(404).json({ error: 'Ürün bulunamadı' });

        const { data: uye } = await supabase.from('urun_sube').select('menude, gizli')
            .eq('urun_id', id).eq('sube_kod', subeSlug).maybeSingle();

        // Merkezin gizlediği ürün şube için yok hükmünde (ürün bayrağı ya da kategori).
        const { data: kat } = await supabase.from('kategoriler')
            .select('gizli_subeler').eq('id', urun.kategori_id ?? '').maybeSingle();
        if (uye?.gizli || (kat?.gizli_subeler || []).includes(subeSlug)) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }
        if (!uye?.menude) return res.status(400).json({ error: 'Ürün menünüzde değil' });

        await uyelikYaz(id, subeSlug, { etiket });
        await regenerateMenuJson(subeSlug).catch(console.error);
        res.json({ success: true, etiket });
    })
);

/**
 * PUT /api/products/:id/availability
 * Ürün müsaitlik toggle (sadece ortak ürünlerde)
 * Body: { subeSlug: string, mevcut: boolean }
 */
router.put(
    '/:id/availability',
    verifyToken,
    requirePermission('products.toggleAvailability'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { subeSlug, mevcut } = req.body;

        if (req.user.role !== 'admin' && req.user.subeSlug !== subeSlug) {
            return res.status(403).json({ error: 'Sadece kendi şubenizin müsaitliğini değiştirebilirsiniz' });
        }

        // Availability toggle sadece ortak ürünlerde çalışır
        const { data: urun } = await supabase
            .from('urunler').select('id, tur').eq('id', id).eq('tur', 'ortak').maybeSingle();
        if (!urun) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }

        const { data: uye } = await supabase.from('urun_sube').select('*')
            .eq('urun_id', id).eq('sube_kod', subeSlug).maybeSingle();

        // Merkezin bu şubeden gizlediği ürün şube için yok hükmünde —
        // ürünün kendi bayrağı ya da kategorisinin gizli listesi.
        const { data: kat } = await supabase.from('kategoriler')
            .select('gizli_subeler').eq('id', urun.kategori_id ?? '').maybeSingle();
        if (uye?.gizli || (kat?.gizli_subeler || []).includes(subeSlug)) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }
        // Menüsünde olmayan ürünün stok durumu anlamsız — şube önce ürünü
        // kataloğdan menüsüne eklemeli (POST /products/menu).
        if (!uye?.menude) {
            return res.status(400).json({ error: 'Ürün menünüzde değil' });
        }

        await uyelikYaz(id, subeSlug, { mevcut_degil: !mevcut });

        // Sadece bu şubenin JSON'ını yenile (güvenilir — yanıttan önce)
        await regenerateMenuJson(subeSlug).catch(console.error);
        res.json({ success: true, mevcut });
    })
);

export default router;
