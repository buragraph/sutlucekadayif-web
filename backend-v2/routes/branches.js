import { Router } from '../shared/router.js';
import { acikSubeler, subeSilinebilirMi } from '../shared/sube.js';
import { supabase } from '../config/supabase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { temizNull, veriYaDaHata } from '../utils/veri.js';
import { deleteMenuJson, regenerateMenuJsons } from '../modules/qr-menu/services/menu-cache.js';
import { acikKampanyalaraEkle } from '../modules/reports/services/kampanya-uyelik.js';
import { menuyuCekirdekKatalogdanKur } from '../modules/qr-menu/services/sube-menusu.js';

// konum-store.js KULLANILMIYOR: il/ilçe/lat/lng artık şube satırının kolonu,
// tek-doküman konum listesi ve transaction'ı yapısal olarak gereksiz.
// bumpDataVersion da yok (versionedCacheMiddleware ile birlikte ölüyor).

const router = Router();

/**
 * Şubeyi işleten şirket. Merkezin şube listesindeki "ŞİRKET CARİ" sütununun
 * karşılığı; `sirket_tipi` ile karıştırılmamalı — o, şubenin kendi hukuki
 * biçimi (şahıs/ltd) ve faturada kullanılıyor.
 *
 * Boş değer SERBEST: merkez listesinde karşılığı olmayan eski kayıtlar var
 * (bkz. migration 0039); zorunlu tutmak onları uydurma bir şirkete iterdi.
 */
const SIRKETLER = ['ums', 'beylikduzu'];
function sirketDegeri(ham) {
    const v = String(ham ?? '').trim();
    if (!v) return { deger: null, hata: null };
    if (!SIRKETLER.includes(v)) return { deger: null, hata: 'Geçersiz şirket.' };
    return { deger: v, hata: null };
}

/**
 * İl + ilçe metnini koordinata çevirir (OpenStreetMap Nominatim, ücretsiz/anahtarsız).
 * Harita işaretçisini ilçe seviyesinde konumlandırmak için kullanılır.
 * Best-effort: başarısız olursa null döner (harita il merkezine düşer).
 */
export async function geocodeIlce(il, ilce) {
    if (!il || !ilce) return null;
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&country=Turkey&state=${encodeURIComponent(il)}&county=${encodeURIComponent(ilce)}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'SutluceKadayifWeb/1.0 (sube konum)' } });
        if (!res.ok) return null;
        const arr = await res.json();
        if (!arr[0]) return null;
        const lat = parseFloat(arr[0].lat);
        const lng = parseFloat(arr[0].lon);
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    } catch {
        return null;
    }
}

/** Rol bazlı şube kapsamı — admin hepsi, şube sahibi yalnızca kendi şubesi. */
function kapsamUygula(sorgu, req) {
    if (req.user.role === 'admin') return sorgu;
    if (req.user.subeSlug) return sorgu.eq('kod', req.user.subeSlug);
    return sorgu.eq('kod', '__yok__');
}

/**
 * GET /api/branches/:slug/demografi
 * Şubenin bulunduğu İLÇENİN demografisi.
 *
 * Kaynak `ilce_demografi` (bkz. 0025_ilce_demografi.sql): SEGE-2022 tüm 973
 * ilçe için yüklü; yaş/eğitim kolonları TÜİK verisi geldiğinde dolacak.
 * Yılda bir güncellenen statik veri — çekim/cron yok.
 *
 * Şube sahibi yalnızca KENDİ şubesini sorgulayabilir.
 */
router.get(
    '/:slug/demografi',
    verifyToken,
    requirePermission('branches.view'),
    asyncHandler(async (req, res) => {
        const { slug } = req.params;
        if (req.user.role !== 'admin' && req.user.subeSlug !== slug) {
            return res.status(403).json({ error: 'Bu şubeye erişim yetkiniz yok' });
        }

        const { data: sube } = await supabase
            .from('subeler').select('kod, ad, il, ilce').eq('kod', slug).maybeSingle();
        if (!sube) return res.status(404).json({ error: 'Şube bulunamadı' });
        if (!sube.il || !sube.ilce) {
            // İlçe atanmamış şube: veri YOK demek yerine NEDENİNİ söylüyoruz,
            // yoksa "demografi çalışmıyor" diye aranıyor.
            return res.json({ il: null, ilce: null, demografi: null, sebep: 'ilce_yok' });
        }

        const { data, error } = await supabase
            .from('ilce_demografi').select('*')
            .eq('il', sube.il).eq('ilce', sube.ilce).maybeSingle();
        if (error) throw new Error(error.message);

        res.json({
            il: sube.il,
            ilce: sube.ilce,
            // Türkiye genelinde kaç ilçe var — "30. sıra" tek başına anlamsız.
            toplamIlce: 973,
            demografi: data || null,
            sebep: data ? null : 'ilce_verisi_yok',
        });
    })
);

/**
 * POST /api/branches/konum-doldur
 * Şubelerin il/ilçesini Google Business Profile kaydından doldurur.
 *
 * NEDEN GOOGLE: şubelerin çoğu zaten Google'da eşleşmiş ve Google adresi
 * YAPISAL tutuyor (administrativeArea = il, locality = ilçe). Adı ya da
 * serbest metin adresi yorumlamaya göre tahmin payı sıfır — elle
 * çıkarımda Kayseri'yi Melikgazi sanıp Talas'ı kaçırmak gibi hatalar oluyor.
 *
 * Varsayılan yalnızca BOŞ olanları doldurur; `uzerineYaz: true` gövdesi elle
 * girilmiş değerleri de Google'ınkiyle değiştirir.
 */
router.post(
    '/konum-doldur',
    verifyToken,
    requirePermission('branches.edit'),
    asyncHandler(async (req, res) => {
        const uzerineYaz = req.body?.uzerineYaz === true;

        const [{ listAccounts, loadGoogleMappings }] = await Promise.all([
            import('../modules/reports/services/google-business.js'),
        ]);
        const [konumlar, esleme] = await Promise.all([
            listAccounts().catch(() => []),
            loadGoogleMappings().catch(() => ({})),
        ]);
        if (!konumlar.length) {
            return res.status(400).json({ error: 'Google konumları alınamadı — bağlantıyı kontrol edin.' });
        }

        // Google adları karışık büyük/küçük harfle geliyor (ŞİŞLİ, altındağ).
        // İlçe adı sonradan demografi verisiyle eşleştirileceği için Türkçe
        // başlık biçimine çekiliyor.
        const baslik = (v) => String(v || '').trim().toLocaleLowerCase('tr')
            .replace(/\S+/g, (k) => k.charAt(0).toLocaleUpperCase('tr') + k.slice(1));

        const veri = [];
        const eksik = [];
        for (const k of konumlar) {
            const kod = esleme[k.name];
            if (!kod || kod === '__atla__') continue;
            if (!k.il || !k.ilce) { eksik.push(kod); continue; }
            veri.push({ kod, il: baslik(k.il), ilce: baslik(k.ilce) });
        }

        const { data, error } = await supabase.rpc('sube_konum_yaz', { veri, uzerine_yaz: uzerineYaz });
        if (error) throw new Error(error.message);

        res.json({
            success: true,
            eslesen: veri.length,
            yazilan: data ?? 0,
            adressiz: eksik,
        });
    })
);

/**
 * GET /api/branches
 * Tüm şubeleri listele
 */
router.get(
    '/',
    verifyToken,
    requirePermission('branches.view'),
    asyncHandler(async (req, res) => {
        const [satirlar, menuSayilari, ortakSonuc] = await Promise.all([
            kapsamUygula(supabase.from('subeler').select('*'), req)
                .then((r) => veriYaDaHata(r, 'şubeler okunamadı')),
            // MENÜDEKİ ürün sayısı — şubeye ÖZEL ürün sayısı DEĞİL. Eskiden
            // `urunler.sube_kod` sayılıyordu; katalogda şubeye özel ürün hiç
            // olmadığı için sütun 93 şubenin hepsinde 0 gösteriyordu. Gerçek
            // sayı urun_sube üyeliklerinde (11 binden fazla satır), o yüzden
            // toplama veritabanında yapılıyor: tek alt-istek, 93 satır.
            supabase.rpc('sube_menu_sayilari'),
            supabase.from('urunler').select('*', { count: 'exact', head: true }).eq('tur', 'ortak'),
        ]);

        const sayac = {};
        for (const r of (menuSayilari.data || [])) sayac[r.sube_kod] = Number(r.adet) || 0;

        // Eski yanıt Firestore doküman verisini yayıyordu: `kod` ve `olusturma`
        // alanları YOKTU (kod doküman id'siydi, olusturma hiç yazılmıyordu).
        const subeler = satirlar.map(({ kod, olusturma, ...s }) => temizNull({
            id: kod,
            slug: kod,
            urunSayisi: sayac[kod] || 0,
            ...s,
        }));

        res.json({ subeler, ortakUrunSayisi: ortakSonuc.count ?? 0 });
    })
);

/**
 * GET /api/branches/konumlar
 * Harita için hafif şube konum listesi. Eskiden tek denormalize dokümandan
 * okunuyordu (konum-store.js); artık doğrudan şube satırlarının kolonlarından —
 * senkron tutulacak ikinci bir kopya yok.
 */
router.get(
    '/konumlar',
    verifyToken,
    requirePermission('branches.view'),
    asyncHandler(async (req, res) => {
        const satirlar = veriYaDaHata(
            // Kapanan şube haritada pin göstermez.
            await acikSubeler(kapsamUygula(supabase.from('subeler').select('kod, ad, il, ilce, lat, lng'), req)),
            'konumlar okunamadı'
        );
        // Şekil eski `konumlar` dokümanıyla birebir: konum-store girdileri
        // `il: d.il || null` kalıbıyla yazıyordu — boş string null'a düşer ve
        // lat/lng anahtarları her zaman bulunur.
        const konumlar = satirlar.map((s) => ({
            slug: s.kod,
            ad: s.ad || s.kod,
            il: s.il || null,
            ilce: s.ilce || null,
            lat: s.lat === null || s.lat === undefined ? null : Number(s.lat),
            lng: s.lng === null || s.lng === undefined ? null : Number(s.lng),
        }));
        res.json({ konumlar });
    })
);

/**
 * POST /api/branches
 * Yeni şube oluştur
 * Body: { slug, ad, adres?, telefon? }
 */
router.post(
    '/',
    verifyToken,
    requirePermission('branches.create'),
    asyncHandler(async (req, res) => {
        const { slug, ad, adres, telefon, yetkili_adi, fatura_adresi, vkn, sirket_tipi, sirket, il, ilce } = req.body;
        const { deger: sirketVal, hata: sirketHata } = sirketDegeri(sirket);
        if (sirketHata) return res.status(400).json({ error: sirketHata });

        if (!slug || !slug.trim()) {
            return res.status(400).json({ error: 'Şube slug zorunludur (URL kısmı, örn: ankara)' });
        }
        if (!ad || !ad.trim()) {
            return res.status(400).json({ error: 'Şube adı zorunludur' });
        }

        const slugVal = slug.trim().toLowerCase();

        // Slug benzersiz olmalı
        const { data: mevcut } = await supabase.from('subeler').select('kod').eq('kod', slugVal).maybeSingle();
        if (mevcut) {
            return res.status(400).json({ error: 'Bu slug zaten kullanılıyor' });
        }

        const data = {
            kod: slugVal,
            ad: ad.trim(),
            adres: adres?.trim() || '',
            telefon: telefon?.trim() || '',
            yetkili_adi: yetkili_adi?.trim() || '',
            fatura_adresi: fatura_adresi?.trim() || '',
            vkn: vkn?.trim() || '',
            sirket_tipi: sirket_tipi?.trim() || '',
            sirket: sirketVal,
            il: il?.trim() || '',
            ilce: ilce?.trim() || '',
        };
        // İlçe seviyesinde harita konumu — best-effort geocode
        const konum = await geocodeIlce(data.il, data.ilce);
        if (konum) { data.lat = konum.lat; data.lng = konum.lng; }

        veriYaDaHata(await supabase.from('subeler').insert(data), 'şube eklenemedi');

        // Süren bütçe kampanyalarına dahil et. Kampanyanın şube listesi
        // açılışta donuyor; bu olmadan yeni şube o kampanyada hiç görünmüyor
        // ve merkez "Şube Ekle" ile elle eklemek zorunda kalıyordu.
        // Şube kaydı bu yüzden geri alınmaz — hata içeride loglanıyor.
        await acikKampanyalaraEkle(slugVal);

        // Menüyü çekirdek katalogla kur ve ürünleri satışta işaretle. Menü bir
        // opt-in listesi olduğu için yeni şube aksi hâlde bomboş açılıyordu.
        const menuAdedi = await menuyuCekirdekKatalogdanKur(slugVal);

        // Menü JSON'u ancak ürünler yazıldıktan SONRA üretilmeli, yoksa QR
        // menüde boş bir dosya kalır ve bir sonraki ürün değişikliğine kadar
        // öyle durur (bkz. CLAUDE.md kural 7).
        if (menuAdedi > 0) {
            await regenerateMenuJsons([slugVal]).catch(console.error);
        }

        res.status(201).json({ slug: slugVal, ad: ad.trim(), menuUrunSayisi: menuAdedi });
    })
);

/**
 * PUT /api/branches/:slug
 * Şube güncelle
 * Body: { ad?, adres?, telefon? }
 */
router.put(
    '/:slug',
    verifyToken,
    requirePermission('branches.edit'),
    asyncHandler(async (req, res) => {
        const { slug } = req.params;
        const {
            ad, adres, telefon, yetkili_adi, fatura_adresi, vkn, sirket_tipi, sirket, il, ilce,
            kapanma_tarihi, kapanma_notu,
        } = req.body;

        const { data: doc } = await supabase.from('subeler').select('*').eq('kod', slug).maybeSingle();
        if (!doc) {
            return res.status(404).json({ error: 'Şube bulunamadı' });
        }

        const updateData = {};
        if (ad !== undefined) updateData.ad = ad.trim();
        if (adres !== undefined) updateData.adres = adres.trim();
        if (telefon !== undefined) updateData.telefon = telefon.trim();
        if (yetkili_adi !== undefined) updateData.yetkili_adi = yetkili_adi.trim();
        if (fatura_adresi !== undefined) updateData.fatura_adresi = fatura_adresi.trim();
        if (vkn !== undefined) updateData.vkn = vkn.trim();
        if (sirket_tipi !== undefined) updateData.sirket_tipi = sirket_tipi.trim();
        if (sirket !== undefined) {
            const { deger, hata } = sirketDegeri(sirket);
            if (hata) return res.status(400).json({ error: hata });
            updateData.sirket = deger;   // boş gönderilirse atama kaldırılır
        }
        if (il !== undefined) updateData.il = il.trim();
        if (ilce !== undefined) updateData.ilce = ilce.trim();

        // Kapatma / yeniden açma. Silmenin yerine geçen işlem: şube geçmişiyle
        // birlikte durur, yalnızca operasyonel yüzeylerden çekilir
        // (bkz. shared/sube.js, 0015_sube_kapanma.sql).
        // '' ya da null göndermek şubeyi yeniden AÇAR.
        if (kapanma_tarihi !== undefined) {
            updateData.kapanma_tarihi = kapanma_tarihi || null;
            if (!updateData.kapanma_tarihi) updateData.kapanma_notu = null;
        }
        if (kapanma_notu !== undefined) updateData.kapanma_notu = (kapanma_notu || '').trim() || null;

        // İl/ilçe değiştiyse harita konumunu yeniden geocode et (best-effort)
        if (il !== undefined || ilce !== undefined) {
            const finalIl = updateData.il ?? doc.il;
            const finalIlce = updateData.ilce ?? doc.ilce;
            const konum = await geocodeIlce(finalIl, finalIlce);
            if (konum) { updateData.lat = konum.lat; updateData.lng = konum.lng; }
        }

        if (Object.keys(updateData).length > 0) {
            veriYaDaHata(
                await supabase.from('subeler').update(updateData).eq('kod', slug),
                'şube güncellenemedi'
            );
        }
        // Kapanma durumu menü JSON'una gömülü (sube.kapanmaTarihi); değiştiyse
        // o şubenin JSON'ı tazelenmeli, yoksa müşteri eski menüyü görmeye
        // devam eder. Toplu yenileme kapalı şubeyi hedeflemez, bu yüzden
        // TEK ŞUBE yenilemesi burada açıkça çağrılıyor.
        if (updateData.kapanma_tarihi !== undefined) {
            await regenerateMenuJsons([slug]).catch(console.error);
        }
        res.json({ success: true });
    })
);

/**
 * DELETE /api/branches/:slug
 * Şube sil
 */
router.delete(
    '/:slug',
    verifyToken,
    requirePermission('branches.delete'),
    asyncHandler(async (req, res) => {
        const { slug } = req.params;

        const { data: doc } = await supabase.from('subeler').select('kod').eq('kod', slug).maybeSingle();
        if (!doc) {
            return res.status(404).json({ error: 'Şube bulunamadı' });
        }

        // Kullanıcı ataması VE rapor geçmişi kontrolü tek yerde
        // (bkz. shared/sube.js). Geçmişi olan şube silinmez, KAPATILIR.
        // DİKKAT: eski sürüm `where('subeSlug','==',slug)` sorguluyordu ama alanın
        // gerçek adı `sube_slug` — koruma hiç devreye girmiyordu.
        const karar = await subeSilinebilirMi(slug);
        if (!karar.silinebilir) {
            return res.status(400).json({ error: karar.sebep });
        }

        // Buraya yalnızca hiç geçmişi olmayan şube gelir; kalan FK'lar
        // (urun_sube, sube_notlari) cascade ile temizlenir.
        veriYaDaHata(await supabase.from('subeler').delete().eq('kod', slug), 'şube silinemedi');

        // R2'deki menü JSON'ı da gitmeli; kalırsa /menu/{slug} silinmiş şubenin
        // menüsünü servis etmeye devam eder (public uç önce R2'ye bakıyor).
        await deleteMenuJson(slug).catch(console.error);
        res.json({ success: true });
    })
);

export default router;
