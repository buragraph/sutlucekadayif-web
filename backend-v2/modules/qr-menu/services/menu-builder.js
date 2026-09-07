import { supabase } from '../../../config/supabase.js';
import { veriYaDaHata } from '../../../utils/veri.js';

/**
 * Menü verisi üretimi — TEK KAYNAK.
 *
 * Hem public `GET /api/menu/:subeSlug` (routes/menu.js) hem de R2 JSON cache
 * üretimi (services/menu-cache.js) bu fonksiyonu kullanır. Menü şeması
 * değişecekse YALNIZCA burası değiştirilir.
 *
 * Firestore sürümündeki dört ayrı şube-bazlı kural (gizli_subeler →
 * menude_subeler → mevcut_degil → fiyat_override) artık TEK sorgunun WHERE'i:
 *   urun_sube.menude AND NOT gizli AND NOT mevcut_degil AND urunler.silinme IS NULL
 * `coalesce(fiyat_override, fiyat)` de aynı sorguda çözülür.
 *
 * GÜVENLİK: Dönen veri auth'suz servis edilir (public endpoint + R2'deki JSON).
 * Şube satırından yalnızca aşağıdaki güvenli alanlar alınır; vkn, fatura_adresi,
 * yetkili_adi, telefon gibi PII ve reklam-performans verisi BURAYA ASLA EKLENMEZ.
 *
 * @param {string} subeSlug — Şube slug'ı (ör: "amasya")
 * @param {object|null} paylasilan — toplu üretimde bir kez okunan ortak veri
 * @returns {Promise<{sube: object, kategoriler: object[], urunlerByKategori: object}|null>}
 */
export async function buildMenuData(subeSlug, paylasilan = null) {
    const [subeSatiri, kategoriler, menuUrunleri, ozelUrunler] = await Promise.all([
        paylasilan?.subeler?.get(subeSlug) ?? supabase
            .from('subeler').select('kod, ad, il, ilce, google_degerlendirme_link, kapanma_tarihi').eq('kod', subeSlug).maybeSingle()
            .then((r) => r.data),
        paylasilan?.kategoriler ?? supabase
            .from('kategoriler').select('*').order('sira', { ascending: true })
            .then((r) => veriYaDaHata(r, 'kategoriler okunamadı')),
        // ── Menünün tamamı: tek JOIN ──
        supabase.from('urun_sube')
            .select('fiyat_override, etiket, urunler!inner(id, ad, fiyat, aciklama, etiket, gorsel, miktar, birim, kalori, kategori_id, silinme)')
            .eq('sube_kod', subeSlug)
            .eq('menude', true)
            .eq('gizli', false)
            .eq('mevcut_degil', false)
            .is('urunler.silinme', null)
            .range(0, 9999)
            .then((r) => veriYaDaHata(r, 'menü ürünleri okunamadı')),
        // Şubeye özel eski ürünler (şubeler artık ürün ekleyemiyor; kalan kayıtlar
        // için). Toplu üretimde hepsi bir kez okunup şubeye göre gruplanır.
        paylasilan?.ozelByShube
            ? Promise.resolve(paylasilan.ozelByShube.get(subeSlug) || [])
            : supabase.from('urunler').select('*').eq('sube_kod', subeSlug).is('silinme', null)
                .then((r) => veriYaDaHata(r, 'şube ürünleri okunamadı')),
    ]);

    if (!subeSatiri) return null;

    const sube = {
        id: subeSatiri.kod,
        slug: subeSatiri.kod,
        ad: subeSatiri.ad || subeSatiri.kod,
        il: subeSatiri.il || null,
        ilce: subeSatiri.ilce || null,
        // Google değerlendirme adresi şube başına ayrı (Google'dan gelir, bkz.
        // scripts/gecis/google-degerlendirme-link.mjs). Yoksa null — menüdeki
        // "Bizi Değerlendirin" butonu o şubede hiç gösterilmez.
        degerlendirmeLink: subeSatiri.google_degerlendirme_link || null,
        // Kapanan şubenin menüsü 404 OLMAZ: basılı QR kodlar dışarıda ve
        // taranmaya devam ediyor. JSON üretilmeye devam eder, müşteri
        // tarafında "bu şube kapandı" bilgisi gösterilir (bkz. MenuPage).
        kapanmaTarihi: subeSatiri.kapanma_tarihi || null,
    };

    // PUBLIC projeksiyon — müşteri menüsünde gösterilen alanlar SADECE bunlar.
    // Şube bazlı yönetim verisi (fiyat_override, gizli, menude, fiyat_serbest)
    // dışarı SIZDIRILMAZ: bu JSON R2'de auth'suz servis ediliyor.
    // Kategori nesnesi: Firestore'da alan YOKSA JSON'da da yoktu. Postgres her
    // kolonu döndürdüğü için boş değerleri kırpıyoruz — public JSON hem eskiyle
    // aynı şekli korur hem gereksiz büyümez. (`urunSayisi` bilinçli olarak yok:
    // denormalize sayaç öldü, menü sayfası zaten yalnızca id + ad okuyor.)
    const kategoriYanit = (k) => {
        const cikti = {};
        for (const [alan, deger] of Object.entries(k)) {
            if (deger === null || deger === undefined) continue;   // '' ve false KORUNUR
            cikti[alan] = deger;
        }
        return cikti;
    };

    /**
     * @param {string[]} subeEtiketi - şubenin KENDİ etiketleri (urun_sube.etiket).
     *   Merkezinkiyle BİRLEŞTİRİLİR, üzerine yazmaz: merkezin etiketi her şubede
     *   durur, şubeninki yalnızca kendi menüsünde görünür
     *   (bkz. 0017_sube_etiketleri.sql). Sıra korunur, tekrar edenler atılır.
     */
    const musteriAlanlari = (urun, fiyat, subeEtiketi = []) => ({
        id: urun.id,
        ad: urun.ad,
        fiyat,
        aciklama: urun.aciklama || '',
        etiket: [...new Set([...(urun.etiket || []), ...subeEtiketi])],
        gorsel: urun.gorsel || '',
        miktar: urun.miktar ?? null,
        birim: urun.birim || '',
        kalori: urun.kalori ?? null,
        kategori: urun.kategori_id || 'diger',
    });

    const tumUrunler = [];

    // Kategori bazlı gizleme: merkez bir kategoriyi bu şubeden sakladıysa
    // içindeki ürünler menüye HİÇ girmez (bkz. 0014_kategori_gizli_subeler.sql).
    // Ürün seviyesindeki `urun_sube.gizli` sorguda zaten eleniyor.
    const gizliKategoriler = new Set(
        kategoriler.filter((k) => (k.gizli_subeler || []).includes(subeSlug)).map((k) => k.id)
    );
    const kategoriGizliMi = (u) => gizliKategoriler.has(u.kategori_id);

    for (const satir of menuUrunleri) {
        const u = satir.urunler;
        if (kategoriGizliMi(u)) continue;
        const fiyat = satir.fiyat_override ?? u.fiyat;
        tumUrunler.push(musteriAlanlari(u, Number(fiyat), satir.etiket || []));
    }

    for (const u of ozelUrunler) {
        if (kategoriGizliMi(u)) continue;
        tumUrunler.push(musteriAlanlari(u, Number(u.fiyat)));
    }

    // Kategoriye göre grupla
    const urunlerByKategori = {};
    tumUrunler.forEach((urun) => {
        const kat = urun.kategori || 'diger';
        if (!urunlerByKategori[kat]) urunlerByKategori[kat] = [];
        urunlerByKategori[kat].push(urun);
    });

    return {
        sube,
        // Gizlenen kategori sekmesi menüde hiç görünmesin
        kategoriler: kategoriler.filter((k) => !gizliKategoriler.has(k.id)).map(kategoriYanit),
        urunlerByKategori,
    };
}

/**
 * Toplu üretim için ortak veriyi bir kez okur.
 * (Firestore'daki PAYLASIM_ESIGI seçimi öldü: Postgres'te "hepsini bir kez oku"
 * her zaman ucuz, eşik hesabı yapmaya gerek yok.)
 */
export async function paylasilanVeriOku() {
    const [subeSatirlari, kategoriler, ozelUrunler] = await Promise.all([
        supabase.from('subeler').select('kod, ad, il, ilce, google_degerlendirme_link, kapanma_tarihi').range(0, 9999)
            .then((r) => veriYaDaHata(r, 'şubeler okunamadı')),
        supabase.from('kategoriler').select('*').order('sira', { ascending: true })
            .then((r) => veriYaDaHata(r, 'kategoriler okunamadı')),
        supabase.from('urunler').select('*').not('sube_kod', 'is', null).is('silinme', null)
            .range(0, 9999)
            .then((r) => veriYaDaHata(r, 'şubeye özel ürünler okunamadı')),
    ]);

    const ozelByShube = new Map();
    for (const u of ozelUrunler) {
        if (!ozelByShube.has(u.sube_kod)) ozelByShube.set(u.sube_kod, []);
        ozelByShube.get(u.sube_kod).push(u);
    }

    return {
        subeler: new Map(subeSatirlari.map((s) => [s.kod, s])),
        kategoriler,
        ozelByShube,
        // `tumSluglar` TOPLU YENİLEME hedefidir; kapanan şube buraya girmez.
        // Şubenin JSON'ı R2'de kapanış bilgisiyle duruyor, tekrar üretilmesine
        // gerek yok. Tek şube yenilemesi (regenerateMenuJsons([slug])) hâlâ
        // çalışır — kapatma anında JSON'u tazelemek için gerekli.
        tumSluglar: subeSatirlari.filter((s) => !s.kapanma_tarihi).map((s) => s.kod),
    };
}
