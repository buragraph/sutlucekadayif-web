import { Router } from 'express';
import { db } from '../../../config/firebase.js';
import { verifyToken, requirePermission } from '../../../middleware/auth.js';
import admin from 'firebase-admin';
import asyncHandler from '../../../utils/asyncHandler.js';
import { regenerateAffectedMenuJsons, regenerateMenuJsons, regenerateMenuJson } from '../services/menu-cache.js';
import { getKatalogUrunleri, bumpKatalogVersion } from '../services/katalog-cache.js';

const router = Router();

/**
 * Başarılı her mutasyondan sonra katalog sürümünü ilerletir.
 *
 * Tek tek route'lara `bumpKatalogVersion()` serpiştirmek yerine tek yerde
 * duruyor: bu dosyada ortak ürüne yazan 15'ten fazla nokta var ve unutulan bir
 * çağrı, katalogu tüm instance'larda bayat bırakır — kullanıcı eklediği ürünü
 * listede göremez. Fazladan sürüm artışı (ör. yalnızca şubeye özel ürün
 * değiştiğinde) zararsızdır; sadece bir sonraki katalog isteğinde yeniden
 * okunur.
 *
 * Sürüm, yanıt gönderilmeden ÖNCE yazılır. `res.on('finish')` daha ucuz olurdu
 * ama Cloud Run yanıttan sonra instance'ı dondurabilir ve yazma hiç gitmeyebilir.
 */
router.use((req, res, next) => {
    if (req.method === 'GET') return next();
    const orijinalJson = res.json.bind(res);
    res.json = (data) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            // Sürüm yazılamazsa istek yine de başarılı sayılır (bkz. bumpKatalogVersion)
            return bumpKatalogVersion().then(() => orijinalJson(data));
        }
        return orijinalJson(data);
    };
    next();
});

/**
 * Helper: Ürün dokümanını bul — önce urunler, sonra subeler/{slug}/urunler
 * @returns {{ docRef, doc, source: 'ortak'|'sube_ozel', subeSlug?: string }}
 */
async function findProduct(id, subeSlug) {
    // subeSlug varsa önce subcollection'da ara
    if (subeSlug) {
        const subeRef = db.collection('subeler').doc(subeSlug).collection('urunler').doc(id);
        const subeDoc = await subeRef.get();
        if (subeDoc.exists) return { docRef: subeRef, doc: subeDoc, source: 'sube_ozel', subeSlug };
    }
    // Ana collection'da ara
    const mainRef = db.collection('ortak_urunler').doc(id);
    const mainDoc = await mainRef.get();
    if (mainDoc.exists) return { docRef: mainRef, doc: mainDoc, source: 'ortak' };
    
    // subeSlug yoksa tüm şubelerde ara (fallback) — TEK koleksiyon-grubu sorgusu.
    // Önceden şube listesi okunup her şubede ayrı doküman get'i yapılıyordu:
    // 88 şube = 88 + 88 okuma, üstelik ürün bulunamasa bile. Şubeye özel ürünler
    // (geçmişten kalan birkaç kayıt) tek sorguda gelir; okuma dönen doküman
    // sayısı kadardır.
    if (!subeSlug) {
        const grupSnap = await db.collectionGroup('urunler').get();
        const hit = grupSnap.docs.find((d) => d.id === id && d.ref.parent.parent?.id);
        if (hit) {
            return {
                docRef: hit.ref, doc: hit, source: 'sube_ozel',
                subeSlug: hit.ref.parent.parent.id,
            };
        }
    }
    return null;
}

/**
 * Kategori kilit haritası — { kategoriId: true|false }.
 * Küçük koleksiyon (birkaç doküman), istek başına TEK okuma. Admin için hiç
 * okunmaz, çünkü admin zaten hiçbir zaman kilitli değildir.
 */
async function katKilitHaritasi(req) {
    if (req.user.role === 'admin') return {};
    const snap = await db.collection('kategoriler').get();
    const m = {};
    snap.forEach((d) => { m[d.id] = !!d.data().kilitli; });
    return m;
}

/**
 * Ürün, ilgili kullanıcı için kilitli mi? — KİLİT KURALININ TEK KAYNAĞI.
 *
 * Hem mutasyon kontrolleri hem GET yanıtı bunu kullanır; GET her ürüne
 * hesaplanmış `kilitli` alanını ekler, böylece arayüz kuralı YENİDEN YAZMAZ.
 * (Kuralın iki kopyası olsaydı biri güncellenip diğeri unutulduğunda arayüz
 * düzenlemeye izin verir, backend 403 dönerdi.)
 *
 * - Admin: asla kilitli değil.
 * - Ortak ürün: HER ZAMAN kilitli. Tek doküman olduğu için bir şubenin
 *   düzenlemesi tüm şubelerde değişirdi — yapısal kilit, bayrakla açılamaz.
 *   Şube bu ürünlerde yalnızca mevcut/mevcut değil yapabilir.
 * - Şubeye özel ürün: önce ürünün kendi `kilitli` bayrağı (ürün bazlı istisna),
 *   bayrak yoksa kategorinin `kilitli` değeri miras alınır.
 */
function urunKilitliMi(user, urun, katKilit) {
    if (user.role === 'admin') return false;
    if (urun.tur !== 'sube_ozel') return true;
    if (urun.sube_slug && urun.sube_slug !== user.subeSlug) return true;
    if (typeof urun.kilitli === 'boolean') return urun.kilitli;
    return !!katKilit[urun.kategori];
}

/**
 * Ürün bu şubeden GİZLENMİŞ mi? — merkez kontrolündedir.
 *
 * Üç kavram birbirine benziyor, karıştırılmamalı:
 *   gizli_subeler  → MERKEZ yasaklar. Şube ürünü panelde göremez, ekleyemez.
 *   menude_subeler → ŞUBE seçer. Sattığı ürünleri kataloğdan menüsüne ekler.
 *   mevcut_degil   → ŞUBE geçici kapatır (stok yok). Panelde durur, geri açar.
 */
function urunGizliMi(user, urun) {
    if (user.role === 'admin') return false;
    return (urun.gizli_subeler || []).includes(user.subeSlug);
}

/**
 * Ortak ürün bu şubenin MENÜSÜNDE mi?
 *
 * `menude_subeler` bir OPT-IN listesidir: merkez tüm ürünleri ortak kataloğa
 * ekler, şube hangilerini sattığını buradan işaretler. Listede olmayan ürün QR
 * menüsünde hiç görünmez — şube "Ürün Ekle" ile kendini listeye ekler
 * (POST /products/menu). Şubeye özel eski ürünler zaten tek şubeye ait.
 */
function menudeMi(user, urun) {
    if (user.role === 'admin') return true;
    if (urun.tur === 'sube_ozel') return true;
    return (urun.menude_subeler || []).includes(user.subeSlug);
}

/**
 * YANIT PROJEKSİYONU — şube sahibine giden gövdeden merkeze ait yönetim
 * alanlarını çıkarır. TEK KAYNAK: ürün döndüren her yol buradan geçer.
 *
 * Bu alanlar 92 şubenin fiyatını (`fiyat_override`), merkezin yasak listesini
 * (`gizli_subeler`), fiyat izinlerini (`fiyat_serbest`) ve hangi şubenin ürünü
 * sattığını (`menude_subeler`) taşır — hiçbiri tek bir şubeyi ilgilendirmez.
 *
 * Kopyalanmamalı: temizlik daha önce yalnızca GET /products'ta yapılıyordu,
 * /trash ve fiyat güncelleme yanıtı atlanmıştı ve ikisi de sessizce sızdırdı.
 */
function yanitProjeksiyonu(user, urun) {
    if (user.role === 'admin') return urun;
    const { fiyat_override, gizli_subeler, fiyat_serbest, menude_subeler, ...guvenli } = urun;
    return guvenli;
}

/**
 * Şube slug dizisini temizler (tekilleştirir, boşları atar).
 * Çoklu şube seçicisinden gelen tüm alanlar (gizli_subeler, fiyat_serbest,
 * menude_subeler) bundan geçer.
 */
const subeDizisi = (v) => [...new Set(
    (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean)
)];

/**
 * Opsiyonel sayısal alan (kalori gibi): boş ya da geçersiz girdi `null` olur.
 *
 * `v ? Number(v) : null` yazılmaz çünkü iki hata yapar: 0'ı boş sayıp düşürür
 * (su ve sade sodanın kalorisi gerçekten 0) ve sayı olmayan girdiyi NaN olarak
 * Firestore'a yazar — menüde "NaN kcal" görünür.
 */
const opsiyonelSayi = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Tüm şube slug'ları — yeni ortak ürünün varsayılan `menude_subeler` değeri.
 * `.select()` alan çekmez, yalnızca doküman kimliklerini getirir (ucuz okuma).
 */
async function tumSubeSluglari() {
    const snap = await db.collection('subeler').select().get();
    return snap.docs.map((d) => d.id);
}

/**
 * Şube bu ürünün fiyatını KENDİ şubesi için değiştirebilir mi?
 *
 * Yalnızca ortak ürünler için anlamlıdır ve merkez ürün bazında, şube şube
 * yetkilendirir (`fiyat_serbest` dizisi). Yazılan fiyat ortak dokümanın
 * `fiyat` alanını DEĞİL, `fiyat_override.{sube}` girdisini günceller — aksi
 * halde bir şubenin değişikliği 97 şubede birden geçerli olurdu.
 */
function fiyatDuzenlenebilirMi(user, urun) {
    if (user.role === 'admin') return true;
    if (urun.tur === 'sube_ozel') return false; // kendi ürününde zaten `kilitli` kuralı geçerli
    if (urunGizliMi(user, urun)) return false;
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
function canMutateProduct(req, found, katKilit) {
    if (req.user.role === 'admin') return true;
    const d = found.doc.data();
    return !urunKilitliMi(req.user, { tur: found.source, sube_slug: found.subeSlug, ...d }, katKilit);
}

/**
 * GET /api/products
 * Admin: tüm ürünler | Şube sahibi: YALNIZCA menüsündeki ürünler
 *
 * Şube sahibi için katalogun tamamı okunmaz. Eskiden bütün `ortak_urunler`
 * çekilip `menudeMi()` ile bellekte eleniyordu: 510 ürünlük katalogta şube
 * başına 510 okuma, 88 şube günde birer kez açsa 46 bin okuma — tek başına
 * Firestore'un günlük ücretsiz kotasını doldurmaya yetiyordu. `array-contains`
 * tek alanlık otomatik indeksi kullanır (bileşik indeks istemez) ve şube başına
 * ~44 okumaya iner.
 *
 * Katalogun tamamı ürün EKLEME ekranı için hâlâ gerekli; o artık ayrı ve
 * cache'li `GET /products/katalog` yolundan gelir (bkz. aşağısı).
 */
router.get(
    '/',
    verifyToken,
    requirePermission('products.view'),
    asyncHandler(async (req, res) => {
        let urunler = [];

        // Ortak ürünler — admin hepsini, şube yalnızca menüsündekileri okur
        // Admin katalogun tamamını görür → paylaşımlı bellek kopyası (sürüm başına
        // 1 okuma). Şube yalnızca menüsündekileri okur; şubesi atanmamış
        // kullanıcı için hiç sorgu atılmaz (boş sorgu da 1 okuma faturalanır).
        if (req.user.role === 'admin') {
            urunler.push(...await getKatalogUrunleri());
        } else if (req.user.subeSlug) {
            const snap = await db.collection('ortak_urunler')
                .where('menude_subeler', 'array-contains', req.user.subeSlug).get();
            snap.forEach((d) => {
                const data = d.data();
                if (!data.deletedAt) urunler.push({ id: d.id, tur: 'ortak', ...data });
            });
        }

        if (req.user.role === 'admin') {
            const requestedSube = req.query.sube || 'all';

            if (requestedSube === 'all') {
                // Şubeye özel ürünlerin TAMAMI tek koleksiyon-grubu sorgusuyla.
                // Önceden 88 ayrı subcollection sorgusu atılıyordu; Firestore boş
                // sorguya da 1 okuma faturaladığı için çoğu boş dönen bu sorgular
                // 88 okumayı boşa harcıyordu.
                const ozelSnap = await db.collectionGroup('urunler').get();
                ozelSnap.forEach((d) => {
                    const data = d.data();
                    const subeId = d.ref.parent.parent?.id;
                    if (!subeId || data.deletedAt) return;
                    urunler.push({ id: d.id, tur: 'sube_ozel', sube_slug: subeId, ...data });
                });
            } else if (requestedSube !== 'ortak') {
                // Sadece seçili şubenin özel ürünlerini getir
                const subeUrunSnap = await db.collection('subeler').doc(requestedSube).collection('urunler').get();
                subeUrunSnap.forEach((d) => {
                    const data = d.data();
                    if (!data.deletedAt) urunler.push({ id: d.id, tur: 'sube_ozel', sube_slug: requestedSube, ...data });
                });
            }
            // requestedSube === 'ortak' ise hiçbir ekstra ürün ekleme (zaten ortak_urunler eklendi)
        } else if (req.user.subeSlug) {
            // Şube sahibi: sadece kendi şubesinin özel ürünleri
            const subeUrunSnap = await db.collection('subeler').doc(req.user.subeSlug).collection('urunler').get();
            subeUrunSnap.forEach((d) => {
                const data = d.data();
                if (!data.deletedAt) urunler.push({ id: d.id, tur: 'sube_ozel', sube_slug: req.user.subeSlug, ...data });
            });
        }

        // Her ürüne, İSTEYEN KULLANICI için hesaplanmış yetki alanlarını ekle.
        // Arayüz kuralları yeniden hesaplamaz, bu alanları okur — kural tek yerde
        // yaşar. (İki kopya olsaydı biri güncellenip diğeri unutulduğunda arayüz
        // düzenlemeye izin verir, backend 403 dönerdi.)
        const katKilit = await katKilitHaritasi(req);
        const cikti = urunler
            // Merkezin bu şubeden gizlediği ürünler panelde de görünmez
            .filter((u) => !urunGizliMi(req.user, u))
            .map((u) => yanitProjeksiyonu(req.user, {
                    ...u,
                    duzenlenemez: urunKilitliMi(req.user, u, katKilit),
                    fiyatDuzenlenebilir: fiyatDuzenlenebilirMi(req.user, u),
                    // Şube kendi fiyatını görsün; merkez fiyatı `fiyat` alanında kalır
                    etkinFiyat: etkinFiyat(req.user, u),
                    // Ürün bu şubenin menüsünde mi? Arayüz listeyi buna göre ikiye
                    // ayırır: menüdekiler tabloda, menüde olmayanlar "Ürün Ekle"
                    // katalog penceresinde. Kural yine tek yerde (menudeMi) yaşar.
                    menude: menudeMi(req.user, u),
            }));

        res.json({ urunler: cikti });
    })
);

/**
 * GET /api/products/katalog
 * Şubenin menüsüne EKLEYEBİLECEĞİ ortak ürünler ("Ürün Ekle" penceresi).
 *
 * Bu liste tüm şubelerde aynı veriden üretilir, o yüzden tek cache 88 şubeye
 * birden yeter: katalog okuması "şube sayısı × katalog" yerine "sürüm başına
 * bir kez" olur. Cache'in doğruluğu TTL'e değil katalog sürümüne bağlıdır
 * (bkz. services/katalog-version.js) — ürün değişince tüm instance'larda
 * anında geçersizleşir.
 *
 * Menüdeki ürünler `GET /` yolundan gelir; burası yalnızca menüde OLMAYANLARI
 * döndürür, iki liste çakışmaz.
 */
router.get(
    '/katalog',
    verifyToken,
    requirePermission('products.view'),
    asyncHandler(async (req, res) => {
        // Paylaşımlı bellek kopyası — Firestore okuması sürüm başına bir kez
        const hepsi = await getKatalogUrunleri();
        const katKilit = await katKilitHaritasi(req);

        const cikti = [];
        for (const u of hepsi) {
            // Merkezin bu şubeden gizlediği ürün katalogda da görünmez
            if (urunGizliMi(req.user, u)) continue;
            // Zaten menüde olanlar listede duruyor; katalog eklenebilecekleri gösterir
            if (menudeMi(req.user, u)) continue;
            cikti.push(yanitProjeksiyonu(req.user, {
                ...u,
                duzenlenemez: urunKilitliMi(req.user, u, katKilit),
                fiyatDuzenlenebilir: fiyatDuzenlenebilirMi(req.user, u),
                etkinFiyat: etkinFiyat(req.user, u),
                menude: false,
            }));
        }

        res.json({ urunler: cikti });
    })
);

/**
 * POST /api/products
 * Yeni ürün oluştur — kategori türüne göre ortak veya şubeye özel
 * Body: { ad, fiyat, kategori, aciklama?, etiket?, sube_slug? }
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

        // Kategori türünü kontrol et
        const katDoc = await db.collection('kategoriler').doc(kategori).get();
        const katTur = katDoc.exists ? (katDoc.data().tur || 'ortak') : 'ortak';

        // Şube sahibi: yalnızca kendi şubesine özel ürün ekleyebilir.
        // Ortak (tüm şubeleri etkileyen) ürün oluşturmak admin'e özeldir.
        if (req.user.role !== 'admin') {
            if (katTur !== 'sube_ozel') {
                return res.status(403).json({ error: 'Ortak ürün ekleme yetkiniz yok' });
            }
            if (sube_slug && sube_slug !== req.user.subeSlug) {
                return res.status(403).json({ error: 'Yalnızca kendi şubenize ürün ekleyebilirsiniz' });
            }
        }

        const productData = {
            ad: ad.trim(),
            fiyat: Number(fiyat),
            kategori,
            aciklama: aciklama?.trim() || '',
            etiket: etiket || [],
            gorsel: gorsel || '',
            miktar: miktar ? Number(miktar) : null,
            birim: birim || '',
            kalori: opsiyonelSayi(kalori),
            createdAt: new Date().toISOString(),
        };

        // Ürün bazlı kilit YALNIZCA admin tarafından belirlenir — aksi halde şube
        // kendi ürününü kilitten çıkarırdı. Belirtilmezse alan hiç yazılmaz ve
        // kilit kategoriden miras alınır.
        if (req.user.role === 'admin' && kilitli !== undefined) {
            productData.kilitli = Boolean(kilitli);
        }

        let docRef;

        if (katTur === 'sube_ozel') {
            // Şubeye özel → subeler/{slug}/urunler subcollection'a yaz
            const slug = sube_slug || req.user.subeSlug;
            if (!slug) {
                return res.status(400).json({ error: 'Şubeye özel ürün için şube bilgisi gerekli' });
            }
            productData.tur = 'sube_ozel';
            productData.sube_slug = slug;
            docRef = await db.collection('subeler').doc(slug).collection('urunler').add(productData);
        } else {
            // Ortak → ana urunler collection'a yaz
            productData.tur = 'ortak';
            productData.mevcut_degil = [];
            // Şube bazlı merkez ayarları YALNIZCA admin'den gelir (bu rotaya zaten
            // admin dışında kimse giremiyor, yine de rolü açıkça kontrol ediyoruz).
            productData.gizli_subeler = req.user.role === 'admin' ? subeDizisi(gizli_subeler) : [];
            productData.fiyat_serbest = req.user.role === 'admin' ? subeDizisi(fiyat_serbest) : [];
            // Menüde gösterilecek şubeler. Belirtilmezse TÜM şubeler: merkez yeni
            // bir ürün eklediğinde varsayılan davranış "her şubede açık", şube
            // satmadığını kendi menüsünden çıkarır. Yasaklı şube menüde olamaz.
            const menude = menude_subeler !== undefined
                ? subeDizisi(menude_subeler)
                : await tumSubeSluglari();
            productData.menude_subeler = menude.filter((s) => !productData.gizli_subeler.includes(s));
            docRef = await db.collection('ortak_urunler').add(productData);
        }

        // Kategori ürün sayısını artır
        await db.collection('kategoriler').doc(kategori).update({
            urunSayisi: admin.firestore.FieldValue.increment(1)
        });

        // Menü JSON cache'ini güvenilir şekilde yenile (yanıttan önce — serverless'te
        // yanıt sonrası iş kesilebilir). Hata yutulur, yazma işlemi başarılı sayılır.
        await regenerateAffectedMenuJsons(productData).catch(console.error);

        res.status(201).json({
            id: docRef.id,
            ...productData,
        });
    })
);

// Toplu işlem sonrası etkilenen menü JSON'larını TEK seferde yeniler (dedupe).
// Ortak üründe artık tüm şubeler değil, yalnızca o ürünlerin bulunduğu şubeler
// yenilenir (`menude_subeler` birleşimi). Strateji seçimini regenerateMenuJsons
// şube sayısına göre kendisi yapar.
async function regenerateForAffected(affected) {
    const slugs = new Set();
    for (const a of affected) {
        if (a.tur === 'sube_ozel') { if (a.sube_slug) slugs.add(a.sube_slug); continue; }
        (a.menude_subeler || []).forEach((s) => slugs.add(s));
    }
    await regenerateMenuJsons([...slugs]).catch(console.error);
}

/**
 * PUT /api/products/bulk-price
 * Seçili ürünlerin fiyatını toplu güncelle.
 * NOT: /:id'den ÖNCE tanımlı olmalı.
 * Body: { items: [{id, sube_slug}], mode: 'set'|'inc_pct'|'dec_pct'|'inc_amt'|'dec_amt', value }
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
        const katKilit = await katKilitHaritasi(req); // döngü dışında tek okuma
        for (const it of items) {
            const lookupSlug = req.user.role === 'admin' ? it.sube_slug : req.user.subeSlug;
            const found = await findProduct(it.id, lookupSlug);
            if (!found || !canMutateProduct(req, found, katKilit)) continue;

            const cur = Number(found.doc.data().fiyat) || 0;
            let np = cur;
            if (mode === 'set') np = v;
            else if (mode === 'inc_pct') np = cur * (1 + v / 100);
            else if (mode === 'dec_pct') np = cur * (1 - v / 100);
            else if (mode === 'inc_amt') np = cur + v;
            else if (mode === 'dec_amt') np = cur - v;
            np = Math.max(0, Math.round(np * 100) / 100);

            await found.docRef.update({ fiyat: np });
            affected.push({ tur: found.source, sube_slug: found.subeSlug, menude_subeler: found.doc.data().menude_subeler || [] });
            updated++;
        }

        await regenerateForAffected(affected);
        res.json({ success: true, updated });
    })
);

/**
 * POST /api/products/bulk
 * Birden çok ürünü tek seferde oluştur.
 * Body: { products: [{ ad, fiyat, kategori, sube_slug?, aciklama?, etiket?, miktar?, birim?, gorsel? }] }
 */
router.post(
    '/bulk',
    verifyToken,
    requirePermission('products.create'),
    asyncHandler(async (req, res) => {
        const { products } = req.body;
        if (!Array.isArray(products) || products.length === 0) return res.status(400).json({ error: 'Ürün listesi boş' });

        const katSnap = await db.collection('kategoriler').get();
        const katMap = {};
        katSnap.forEach((d) => { katMap[d.id] = d.data(); });

        // Ortak ürünler varsayılan olarak tüm şubelerin menüsüne düşer (bkz. POST /).
        // Döngü dışında BİR KEZ okunur — satır başına okuma yapılmaz.
        let tumSubeler = null;

        const affected = [];
        const katInc = {};
        let created = 0;
        for (const p of products) {
            if (!p.ad || !p.ad.trim() || p.fiyat === undefined || p.fiyat === null || p.fiyat === '' || !p.kategori) continue;
            const katTur = katMap[p.kategori]?.tur || 'ortak';
            if (req.user.role !== 'admin' && katTur !== 'sube_ozel') continue; // şube sahibi ortak ürün ekleyemez

            const data = {
                ad: p.ad.trim(),
                fiyat: Number(p.fiyat),
                kategori: p.kategori,
                aciklama: (p.aciklama || '').trim(),
                etiket: p.etiket || [],
                gorsel: p.gorsel || '',
                miktar: p.miktar ? Number(p.miktar) : null,
                birim: p.birim || '',
                kalori: opsiyonelSayi(p.kalori),
                createdAt: new Date().toISOString(),
            };

            if (katTur === 'sube_ozel') {
                const slug = req.user.role === 'admin' ? (p.sube_slug || req.user.subeSlug) : req.user.subeSlug;
                if (!slug) continue;
                data.tur = 'sube_ozel'; data.sube_slug = slug;
                await db.collection('subeler').doc(slug).collection('urunler').add(data);
            } else {
                if (tumSubeler === null) tumSubeler = await tumSubeSluglari();
                data.tur = 'ortak'; data.mevcut_degil = [];
                data.gizli_subeler = []; data.fiyat_serbest = [];
                data.menude_subeler = tumSubeler;
                await db.collection('ortak_urunler').add(data);
            }
            katInc[p.kategori] = (katInc[p.kategori] || 0) + 1;
            affected.push({ tur: data.tur, sube_slug: data.sube_slug, menude_subeler: data.menude_subeler || [] });
            created++;
        }

        await Promise.all(Object.entries(katInc).map(([k, n]) =>
            db.collection('kategoriler').doc(k).update({ urunSayisi: admin.firestore.FieldValue.increment(n) }).catch(() => {})));
        await regenerateForAffected(affected);
        res.status(201).json({ success: true, created });
    })
);

/**
 * POST /api/products/bulk-delete
 * Seçili ürünleri toplu çöp kutusuna taşı (soft delete).
 * Body: { items: [{id, sube_slug}] }
 */
router.post(
    '/bulk-delete',
    verifyToken,
    requirePermission('products.delete'),
    asyncHandler(async (req, res) => {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Ürün seçilmedi' });

        const affected = [];
        const katDec = {};
        let deleted = 0;
        const katKilit = await katKilitHaritasi(req); // döngü dışında tek okuma
        for (const it of items) {
            const lookupSlug = req.user.role === 'admin' ? it.sube_slug : req.user.subeSlug;
            const found = await findProduct(it.id, lookupSlug);
            if (!found || !canMutateProduct(req, found, katKilit)) continue;

            await found.docRef.update({ deletedAt: new Date().toISOString() });
            const kat = found.doc.data().kategori;
            if (kat) katDec[kat] = (katDec[kat] || 0) + 1;
            affected.push({ tur: found.source, sube_slug: found.subeSlug, menude_subeler: found.doc.data().menude_subeler || [] });
            deleted++;
        }

        await Promise.all(Object.entries(katDec).map(([k, n]) =>
            db.collection('kategoriler').doc(k).update({ urunSayisi: admin.firestore.FieldValue.increment(-n) }).catch(() => {})));
        await regenerateForAffected(affected);
        res.json({ success: true, deleted });
    })
);

/**
 * POST /api/products/menu
 * Ortak katalogtaki ürünleri şubenin menüsüne EKLER / menüden ÇIKARIR.
 * Body: { subeSlug?, ids: string[], menude: boolean }
 *
 * Tekil işlem de çoklu seçim de bu tek yoldan geçer. Sebep maliyet: menü JSON
 * yenilemesi tüm ortak kataloğu + şube alt koleksiyonunu okuyup R2'ye yazıyor.
 * 20 ürünü tek tek eklemek 20 kat okuma + 20 R2 yazımı demek olurdu; burada
 * yazma tek batch, yenileme ise işlem başına BİR kez.
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
        // Firestore batch sınırı 500; tek istekte bunun altında kalıyoruz.
        if (ids.length > 400) return res.status(400).json({ error: 'Tek seferde en fazla 400 ürün' });
        if (typeof menude !== 'boolean') return res.status(400).json({ error: 'menude alanı boolean olmalı' });

        const temizIds = [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))];
        const refs = temizIds.map((id) => db.collection('ortak_urunler').doc(id));
        // Döngü içinde tekil get YOK — tek toplu okuma (bkz. CLAUDE.md, okuma maliyeti)
        const docs = await db.getAll(...refs);

        const batch = db.batch();
        let islenen = 0;
        for (const d of docs) {
            if (!d.exists) continue;
            const data = d.data();
            if (data.deletedAt) continue;
            // Merkezin yasakladığı ürün şube için yok hükmünde — sessizce atlanır,
            // yoksa şube gizli ürünü menüsüne ekleyebilirdi.
            if ((data.gizli_subeler || []).includes(slug)) continue;
            batch.update(d.ref, {
                menude_subeler: menude
                    ? admin.firestore.FieldValue.arrayUnion(slug)
                    : admin.firestore.FieldValue.arrayRemove(slug),
            });
            islenen++;
        }
        if (islenen > 0) {
            await batch.commit();
            // Yalnızca bu şubenin menüsü değişti (97 şubeyi yenilemek gereksiz).
            await regenerateMenuJson(slug).catch(console.error);
        }

        res.json({ success: true, islenen, menude });
    })
);

/**
 * PUT /api/products/:id
 * Ürün güncelle
 * Body: { ad?, fiyat?, kategori?, aciklama?, etiket?, sube_slug? }
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
        const katKilit = await katKilitHaritasi(req);
        if (!found) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }
        const { docRef, doc } = found;
        const urunVerisi = { tur: found.source, sube_slug: found.subeSlug, ...doc.data() };

        // Merkezin gizlediği ürün şube için yok hükmündedir — varlığını sızdırmamak
        // adına 403 değil 404 döner.
        if (urunGizliMi(req.user, urunVerisi)) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }

        const tamYetki = canMutateProduct(req, found, katKilit);
        // Şube ortak ürünü düzenleyemez AMA merkez izin verdiyse yalnızca kendi
        // fiyatını ayarlayabilir. Bu fiyat ortak dokümanın `fiyat` alanına DEĞİL,
        // `fiyat_override.{sube}` girdisine yazılır — yoksa 97 şubede birden değişirdi.
        const yalnizcaFiyat = !tamYetki && fiyatDuzenlenebilirMi(req.user, urunVerisi);

        if (!tamYetki && !yalnizcaFiyat) {
            return res.status(403).json({ error: 'Bu ürünü değiştirme yetkiniz yok' });
        }

        if (yalnizcaFiyat) {
            const yeni = Number(fiyat);
            if (fiyat === undefined || !Number.isFinite(yeni) || yeni < 0) {
                return res.status(400).json({ error: 'Geçerli bir fiyat girin' });
            }
            // Tek alanlık atomik güncelleme: FieldPath kullanılıyor çünkü şube
            // slug'ları tire içerebiliyor (kocaeli-merkez) ve noktalı string yol
            // bunları yanlış ayrıştırır. Ayrıca haritayı okuyup geri yazmadığımız
            // için eşzamanlı şube güncellemeleri birbirini ezmez.
            await docRef.update(
                new admin.firestore.FieldPath('fiyat_override', req.user.subeSlug),
                yeni
            );
            // YALNIZCA bu şubenin menüsü değişti. regenerateAffectedMenuJsons ortak
            // üründe 97 şubeyi birden yeniler — tek bir şube fiyatı için gereksiz
            // (97 R2 yazımı + yüzlerce Firestore okuması).
            await regenerateMenuJson(req.user.subeSlug).catch(console.error);
            const guncel = await docRef.get();
            // Ortak dokümanın TAMAMI dönerse şube, diğer 91 şubenin fiyat
            // override'ını ve merkezin gizleme/menü listelerini görürdü.
            const guncelVeri = yanitProjeksiyonu(req.user, {
                ...guncel.data(), tur: found.source, sube_slug: found.subeSlug,
            });
            return res.json({ success: true, urun: { id, ...guncelVeri, etkinFiyat: yeni } });
        }

        const updateData = {};
        if (ad !== undefined) updateData.ad = ad.trim();
        if (fiyat !== undefined) updateData.fiyat = Number(fiyat);
        if (kategori !== undefined) updateData.kategori = kategori;
        if (aciklama !== undefined) updateData.aciklama = aciklama.trim();
        if (etiket !== undefined) updateData.etiket = etiket;
        if (gorsel !== undefined) updateData.gorsel = gorsel;
        if (miktar !== undefined) updateData.miktar = miktar ? Number(miktar) : null;
        if (birim !== undefined) updateData.birim = birim;
        if (kalori !== undefined) updateData.kalori = opsiyonelSayi(kalori);
        // Kilit bayrağını yalnızca admin değiştirebilir (bkz. urunKilitliMi).
        // null gönderilirse bayrak kaldırılır → kilit yine kategoriden miras alınır.
        if (req.user.role === 'admin' && kilitli !== undefined) {
            updateData.kilitli = kilitli === null
                ? admin.firestore.FieldValue.delete()
                : Boolean(kilitli);
        }

        // Şube bazlı merkez ayarları — YALNIZCA admin yazabilir. Çoklu şube
        // seçimi olduğu için dizi olarak gelir; tekilleştirilip temizlenir.
        // Yasaklı şube (gizli_subeler) menüde kalamaz: iki listenin çelişmemesi
        // için menude_subeler her durumda gizli listesine göre budanır.
        const yeniGizli = req.user.role === 'admin' && gizli_subeler !== undefined
            ? subeDizisi(gizli_subeler)
            : (doc.data().gizli_subeler || []);
        if (req.user.role === 'admin' && gizli_subeler !== undefined) {
            updateData.gizli_subeler = yeniGizli;
        }
        if (req.user.role === 'admin' && menude_subeler !== undefined) {
            updateData.menude_subeler = subeDizisi(menude_subeler).filter((s) => !yeniGizli.includes(s));
        } else if (req.user.role === 'admin' && gizli_subeler !== undefined) {
            // Menü listesi bu istekte gelmedi ama gizleme değişti — mevcut listeyi buda
            const mevcutMenude = doc.data().menude_subeler || [];
            const budanmis = mevcutMenude.filter((s) => !yeniGizli.includes(s));
            if (budanmis.length !== mevcutMenude.length) updateData.menude_subeler = budanmis;
        }
        if (req.user.role === 'admin' && fiyat_serbest !== undefined) {
            const serbest = subeDizisi(fiyat_serbest);
            updateData.fiyat_serbest = serbest;
            // Yetkisi geri alınan şubenin fiyatı ortalıkta kalmasın: izin listesinden
            // çıkan şubelerin override'ı temizlenir, ürün merkez fiyatına döner.
            const mevcutOverride = doc.data().fiyat_override || {};
            const temizlenmis = Object.fromEntries(
                Object.entries(mevcutOverride).filter(([slug]) => serbest.includes(slug))
            );
            if (Object.keys(temizlenmis).length !== Object.keys(mevcutOverride).length) {
                updateData.fiyat_override = temizlenmis;
            }
        }

        if (Object.keys(updateData).length === 0) {
            return res.json({ success: true });
        }

        // Kategori değiştiğinde sayaç güncelle
        if (kategori !== undefined && kategori !== doc.data().kategori) {
            const oldKategori = doc.data().kategori;
            if (oldKategori) {
                await db.collection('kategoriler').doc(oldKategori).update({
                    urunSayisi: admin.firestore.FieldValue.increment(-1)
                });
            }
            await db.collection('kategoriler').doc(kategori).update({
                urunSayisi: admin.firestore.FieldValue.increment(1)
            });
        }

        await docRef.update(updateData);
        const updated = await docRef.get();
        const updatedData = { ...updated.data(), tur: found.source, sube_slug: found.subeSlug };

        // Eski menü listesi de hedefe eklenir: ürün bir şubeden ÇIKARILDIYSA
        // (menude_subeler daraldıysa) o şubenin menüsü de yenilenmeli, yoksa
        // ürün orada asılı kalır.
        await regenerateAffectedMenuJsons(updatedData, doc.data().menude_subeler || []).catch(console.error);
        res.json({ success: true, urun: yanitProjeksiyonu(req.user, { id, ...updatedData }) });
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
        const katKilit = await katKilitHaritasi(req);
        if (!found) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }
        if (!canMutateProduct(req, found, katKilit)) {
            return res.status(403).json({ error: 'Bu ürünü silme yetkiniz yok' });
        }

        await found.docRef.update({ deletedAt: new Date().toISOString() });

        // Kategori ürün sayısını azalt
        const urunData = { ...found.doc.data(), tur: found.source, sube_slug: found.subeSlug };
        const kategori = urunData.kategori;
        if (kategori) {
            await db.collection('kategoriler').doc(kategori).update({
                urunSayisi: admin.firestore.FieldValue.increment(-1)
            });
        }

        await regenerateAffectedMenuJsons(urunData).catch(console.error);
        res.json({ success: true });
    })
);

/**
 * GET /api/products/trash
 * Çöp kutusundaki ürünleri listele
 */
router.get(
    '/trash',
    verifyToken,
    requirePermission('products.view'),
    asyncHandler(async (req, res) => {
        const urunler = [];

        // Ortak ürünlerin çöp kutusu YALNIZCA admin'e ait. Şube ortak ürünü
        // silemiyor (bkz. urunKilitliMi), dolayısıyla geri de alamıyor: listede
        // görmesi hem çalışmayan "Geri Al"/"Sil" butonları demekti, hem de
        // `...data` ile merkezin gizleme/fiyat/menü listelerini sızdırıyordu.
        if (req.user.role === 'admin') {
            // Silinmiş ürünler katalog cache'inde YOK (orası deletedAt'i eler),
            // bu yüzden çöp kutusu doğrudan okur. Çöp kutusu seyrek açılır.
            const mainSnap = await db.collection('ortak_urunler').get();
            mainSnap.forEach((d) => {
                const data = d.data();
                if (data.deletedAt) urunler.push({ id: d.id, tur: 'ortak', ...data });
            });
        }

        // Şube subcollection'lardan silinen ürünler.
        if (req.user.role === 'admin') {
            // Tek koleksiyon-grubu sorgusu: önce şube listesi okunup her şubeye
            // ayrı sorgu atılıyordu (88 şube = 88 okuma + 88 boş sorgu, çünkü
            // Firestore boş sorguyu da faturalar).
            const ozelSnap = await db.collectionGroup('urunler').get();
            ozelSnap.forEach((d) => {
                const data = d.data();
                const subeId = d.ref.parent.parent?.id;
                if (subeId && data.deletedAt) {
                    urunler.push({ id: d.id, tur: 'sube_ozel', sube_slug: subeId, ...data });
                }
            });
        } else if (req.user.subeSlug) {
            const snap = await db.collection('subeler').doc(req.user.subeSlug)
                .collection('urunler').get();
            snap.forEach((d) => {
                const data = d.data();
                if (data.deletedAt) {
                    urunler.push({ id: d.id, tur: 'sube_ozel', sube_slug: req.user.subeSlug, ...data });
                }
            });
        }

        // Hesaplanmış kilit alanı — arayüz "Geri Al"/"Sil" butonlarını buna göre
        // gösterir. Kilitli kategorideki şube ürünü geri alınamıyor; kural burada
        // çözülmezse arayüz butonu gösterir, backend 403 döner.
        const katKilit = await katKilitHaritasi(req);
        res.json({
            urunler: urunler.map((u) => yanitProjeksiyonu(req.user, {
                ...u, duzenlenemez: urunKilitliMi(req.user, u, katKilit),
            })),
        });
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
        const katKilit = await katKilitHaritasi(req);
        if (!found) return res.status(404).json({ error: 'Ürün bulunamadı' });
        if (!canMutateProduct(req, found, katKilit)) {
            return res.status(403).json({ error: 'Bu ürünü geri alma yetkiniz yok' });
        }

        await found.docRef.update({ deletedAt: admin.firestore.FieldValue.delete() });

        // Kategori ürün sayısını artır
        const kategori = found.doc.data().kategori;
        if (kategori) {
            await db.collection('kategoriler').doc(kategori).update({
                urunSayisi: admin.firestore.FieldValue.increment(1)
            });
        }

        const urunData = { ...found.doc.data(), tur: found.source, sube_slug: found.subeSlug };
        await regenerateAffectedMenuJsons(urunData).catch(console.error);
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
        const katKilit = await katKilitHaritasi(req);
        if (!found) return res.status(404).json({ error: 'Ürün bulunamadı' });
        if (!canMutateProduct(req, found, katKilit)) {
            return res.status(403).json({ error: 'Bu ürünü silme yetkiniz yok' });
        }

        const urunData = { ...found.doc.data(), tur: found.source, sube_slug: found.subeSlug };
        await found.docRef.delete();

        await regenerateAffectedMenuJsons(urunData).catch(console.error);
        res.json({ success: true });
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
        const urunRef = db.collection('ortak_urunler').doc(id);

        // Merkezin bu şubeden gizlediği ürün şube için yok hükmünde: mevcut/mevcut
        // değil yapılamaz. (Aksi halde şube gizli ürünü menüsüne geri açabilirdi.)
        const urunDoc = await urunRef.get();
        if (!urunDoc.exists) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }
        if ((urunDoc.data().gizli_subeler || []).includes(subeSlug)) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }
        // Menüsünde olmayan ürünün stok durumu anlamsız — şube önce ürünü
        // kataloğdan menüsüne eklemeli (POST /products/menu).
        if (!(urunDoc.data().menude_subeler || []).includes(subeSlug)) {
            return res.status(400).json({ error: 'Ürün menünüzde değil' });
        }

        if (mevcut) {
            await urunRef.update({
                mevcut_degil: admin.firestore.FieldValue.arrayRemove(subeSlug),
            });
        } else {
            await urunRef.update({
                mevcut_degil: admin.firestore.FieldValue.arrayUnion(subeSlug),
            });
        }

        // Sadece bu şubenin JSON'ını yenile (güvenilir — yanıttan önce)
        await regenerateMenuJson(subeSlug).catch(console.error);
        res.json({ success: true, mevcut });
    })
);

export default router;
