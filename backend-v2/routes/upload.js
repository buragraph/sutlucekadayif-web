import { Router, akisGonder } from '../shared/router.js';
import { uploadFile, deleteFile, getFile, getFileStream, urlToKey, isKeyAllowed } from '../config/r2.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { dosyaAl } from '../shared/dosya.js';
import asyncHandler from '../utils/asyncHandler.js';
import crypto from 'crypto';

// R2 tarafı eski dosyayla birebir aynı; yalnızca sahiplik kontrolündeki
// Firestore sorgusu supabase'e çevrildi.

// POST /api/upload/image için izinli R2 klasör önekleri. Yalnızca mevcut
// çağıranların gönderdiği ('urunler') değer whitelist'te — bilinmeyen/keyfi
// değer (ör. "dekontlar/x", "../../y") sanitize edilip varsayılana düşer.
// 'academy': kurs kapak görselleri (bkz. AcademyAdmin kurs modalı).
const ALLOWED_UPLOAD_FOLDERS = new Set(['urunler', 'academy', 'banner']);

// Eski QR menüsünden (WordPress) görsel aktarımı YALNIZCA bu alan adlarından.
// Sunucunun istediğimiz adrese istek atması SSRF'tir; kilit tek savunma.
// Aktarım geçici değil kalıcı bir ihtiyaç: ürün görselleri de orada 790px,
// bizde 300px duruyor (bkz. gorsel.js — kaynak dosyalar zaten küçük gelmiş).
const WP_AKTARIM_HOSTLARI = new Set(['qr.sutlucekadayif.com', 'www.sutlucekadayif.com', 'sutlucekadayif.com']);
const WP_AKTARIM_EN_BUYUK = 8 * 1024 * 1024;

// GET /api/upload/dekont/* sunumunda depolanan (yükleme anında saldırgan
// tarafından ayarlanabilen) ContentType'a GÜVENİLMEZ — uzantıdan sabit,
// güvenli bir tip türetilir. Böylece stored `text/html` ContentType ile
// tarayıcının `nosniff` altında HTML/JS render etmesi (stored XSS) engellenir.
const SAFE_DEKONT_CONTENT_TYPES = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
};

const router = Router();

// Görsel yükleme kuralı — ortam bağımsız (bkz. shared/dosya.js)
const GORSEL_AL = dosyaAl('image', {
    tipler: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    enBoy: 10 * 1024 * 1024,
    hataMesaji: 'Sadece JPEG, PNG, WebP ve GIF dosyaları yüklenebilir',
});

// Görsel optimizasyonu (max 800px genişlik, WebP q80) Faz 3'te İSTEMCİYE taşındı:
// `sharp` yerel (native) bir modül, Cloudflare Workers'ta çalışmıyor. Tarayıcı
// aynı işi canvas ile bedavaya yapıyor (frontend: modules/qr-menu/utils/gorsel.js),
// sunucu yalnızca hazır baytı R2'ye koyuyor. Bu uç artık WebP BEKLER.

/**
 * GET /api/upload/proxy/*
 * R2'deki dosyayı doğrudan backend üzerinden sun (r2.dev erişilemiyor).
 *
 * Gövde AKIŞLA geçirilir, belleğe alınmaz: akademi videoları 100 MB'ı aşıyor
 * ve eski `getFile` sürümü Worker'ın bellek sınırını patlatıp "error code:
 * 1102" döndürüyordu. Range istekleri de karşılanır — videoda ileri sarma
 * ve Safari'de oynatma buna bağlı.
 */
router.get(
    '/proxy/*',
    asyncHandler(async (req, res) => {
        const key = req.params[0];
        if (!key) return res.status(400).json({ error: 'Key gerekli' });

        // Pozitif allow-list — yalnızca izinli önekler (urunler/, menu/, academy/)
        // servis edilir; dekontlar/ ve tanımsız her şey reddedilir (bkz. r2.js isKeyAllowed).
        if (!isKeyAllowed(key)) {
            return res.status(403).json({ error: 'Bu kaynağa erişim yetkiniz yok' });
        }

        // Helmet'in frame-ancestors 'self' / X-Frame-Options başlıkları PDF'in
        // farklı origin'deki (Pages) sayfaya <object>/<iframe> ile gömülmesini
        // engelliyor — bu public dosya proxy'si için gömmeye izin ver.
        res.removeHeader('X-Frame-Options');
        res.set('Content-Security-Policy', 'frame-ancestors *');
        res.set('Access-Control-Allow-Origin', '*');

        try {
            const aralik = req.headers?.range || req.headers?.Range || undefined;
            const result = await getFileStream(key, aralik);
            if (!result) return res.status(404).json({ error: 'Dosya bulunamadı' });

            const contentType = result.tur || 'image/webp';
            res.set('Content-Type', contentType);
            // JSON (ör. menü cache) sabit isimli ve değişken → kısa cache, taze kalsın.
            // Görsel/PDF içerik-adresli (uuid) → uzun süreli immutable cache.
            if (contentType.includes('application/json')) {
                res.set('Cache-Control', 'public, max-age=60');
            } else {
                res.set('Cache-Control', 'public, max-age=31536000, immutable');
            }
            // Range desteğini duyur; yoksa tarayıcı videoda ileri saramaz.
            res.set('Accept-Ranges', 'bytes');
            if (result.boyut != null) res.set('Content-Length', String(result.boyut));
            if (result.aralikBasligi) {
                res.set('Content-Range', result.aralikBasligi);
                res.status(206);
            }

            akisGonder(res, result.akis);
        } catch (err) {
            if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
                return res.status(404).json({ error: 'Görsel bulunamadı' });
            }
            throw err;
        }
    })
);

/**
 * GET /api/upload/dekont/*
 * Dekont (banka makbuzu) — kimlik doğrulamalı erişim. Yalnızca admin veya
 * dekontun ait olduğu şubenin sahibi görebilir. Anahtar: dekontlar/{kampanyaId}/{subeKod}.{ext}
 */
router.get(
    '/dekont/*',
    verifyToken,
    asyncHandler(async (req, res) => {
        const key = req.params[0] || '';
        if (!key.startsWith('dekontlar/')) {
            return res.status(400).json({ error: 'Geçersiz dekont yolu' });
        }

        // Erişim kontrolü: admin tümünü, şube sahibi yalnızca kendi şubesinin dekontunu
        const dosya = key.split('/')[2] || '';
        const subeKod = dosya.replace(/\.[^.]+$/, '');
        if (req.user.role !== 'admin' && req.user.subeSlug !== subeKod) {
            return res.status(403).json({ error: 'Bu dekonta erişim yetkiniz yok' });
        }

        try {
            const result = await getFile(key);
            if (!result) return res.status(404).json({ error: 'Dekont bulunamadı' });

            // Depolanan ContentType yükleme sırasında saldırgan tarafından
            // ayarlanmış olabilir — güvenmek yerine uzantıdan sabit tip türet.
            const ext = (dosya.match(/\.[^.]+$/)?.[0] || '').toLowerCase();
            const safeContentType = SAFE_DEKONT_CONTENT_TYPES[ext] || 'application/octet-stream';
            res.set('Content-Type', safeContentType);
            // Tarayıcı hiçbir koşulda içeriği inline render etmesin (HTML/JS dahil).
            const safeFilename = dosya.replace(/["\r\n]/g, '');
            res.set('Content-Disposition', `attachment; filename="${safeFilename}"`);
            res.set('X-Content-Type-Options', 'nosniff');
            res.set('Cache-Control', 'private, no-store');
            res.send(result.govde);
        } catch (err) {
            if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
                return res.status(404).json({ error: 'Dekont bulunamadı' });
            }
            throw err;
        }
    })
);

/**
 * POST /api/upload/wp-aktar
 * Eski WordPress kurulumundaki bir görseli R2'ye kopyalar.
 * Body: { url, klasor? }
 *
 * NEDEN SUNUCUDA: WordPress CORS başlığı vermiyor, tarayıcıdan çekilemiyor.
 * NEDEN GÜVENLİ: alan adı beyaz listede, yalnızca https, yönlendirme sonrası
 * ADRES TEKRAR denetleniyor, içerik tipi görsel olmak zorunda ve boyut
 * sınırlı. Dönüşüm yok — dosya olduğu gibi kopyalanıyor ki kaynaktaki
 * çözünürlük korunsun.
 */
router.post(
    '/wp-aktar',
    verifyToken,
    requirePermission('media.manage'),
    asyncHandler(async (req, res) => {
        const { url, klasor } = req.body || {};
        let hedef;
        try { hedef = new URL(String(url)); } catch { return res.status(400).json({ error: 'Geçersiz adres' }); }
        if (hedef.protocol !== 'https:' || !WP_AKTARIM_HOSTLARI.has(hedef.hostname)) {
            return res.status(400).json({ error: 'Bu adresten aktarım yapılamaz' });
        }

        const yanit = await fetch(hedef.toString());
        if (!yanit.ok) return res.status(400).json({ error: `Kaynak okunamadı (${yanit.status})` });
        // Yönlendirme başka bir hosta çıkmış olabilir — son adresi de denetle.
        try {
            const son = new URL(yanit.url);
            if (!WP_AKTARIM_HOSTLARI.has(son.hostname)) {
                return res.status(400).json({ error: 'Yönlendirme izinli alan adı dışına çıktı' });
            }
        } catch { /* yanit.url boşsa özgün adres geçerli */ }

        const tip = (yanit.headers.get('content-type') || '').split(';')[0].trim();
        const uzanti = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[tip];
        if (!uzanti) return res.status(400).json({ error: `Desteklenmeyen içerik tipi: ${tip || 'bilinmiyor'}` });

        const veri = Buffer.from(await yanit.arrayBuffer());
        if (veri.length > WP_AKTARIM_EN_BUYUK) {
            return res.status(400).json({ error: 'Dosya çok büyük' });
        }

        const folder = ALLOWED_UPLOAD_FOLDERS.has(klasor) ? klasor : 'urunler';
        const fileName = `${folder}/${crypto.randomUUID()}${uzanti}`;
        const r2Url = await uploadFile(veri, fileName, tip);
        console.log(`📥 WP aktarım: ${hedef.pathname} → ${fileName} (${(veri.length / 1024).toFixed(0)}KB)`);

        res.json({ url: r2Url, key: fileName, boyut: veri.length, tip });
    })
);

/**
 * POST /api/upload/image
 * Tek resim yükle → optimize et → R2'ye kaydet, URL dön
 */
router.post(
    '/image',
    verifyToken,
    // Yükleme merkeze ait: bu ucu çağıran üç ekran da (Ürün formu, Kategoriler,
    // Medya) şube sahibine kapalı. (DELETE /image kendi şube-sahiplik kontrolünü
    // koruyor — orada products.edit yerinde.)
    requirePermission('media.manage'),
    GORSEL_AL,
    asyncHandler(async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'Dosya bulunamadı' });
        }

        const originalSize = req.file.buffer.length;
        if (req.file.mimetype !== 'image/webp') {
            return res.status(400).json({
                error: 'Görsel WebP olarak gönderilmeli (dönüşüm tarayıcıda yapılır).',
            });
        }
        const optimized = req.file.buffer;
        // Sanitize: yalnızca izinli sabit klasör adları kabul edilir — aksi halde
        // req.body.folder doğrudan R2 key prefix'ine girip key injection'a
        // (ör. "dekontlar/..", "../../..") yol açardı.
        const requestedFolder = req.body.folder;
        const folder = ALLOWED_UPLOAD_FOLDERS.has(requestedFolder) ? requestedFolder : 'urunler';
        const fileName = `${folder}/${crypto.randomUUID()}.webp`;

        const url = await uploadFile(optimized, fileName, 'image/webp');

        console.log(`📸 Görsel yüklendi: ${(optimized.length / 1024).toFixed(0)}KB (dönüşüm istemcide)`);

        res.json({ url, key: fileName, originalSize, optimizedSize: optimized.length });
    })
);

/**
 * DELETE /api/upload/image
 * R2'den resim sil — Body: { url: string }
 */
router.delete(
    '/image',
    verifyToken,
    requirePermission('products.edit'),
    asyncHandler(async (req, res) => {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL gerekli' });

        // urlToKey PUBLIC_URL öneki yoksa null döner — bilinmeyen domain/URL şekli
        // key sanılıp silinemez.
        const key = urlToKey(url);
        if (!key) return res.status(400).json({ error: 'Geçersiz görsel URL\'i' });

        // Pozitif allow-list: dekontlar/ HER ZAMAN reddedilir.
        if (!isKeyAllowed(key, { forDelete: true })) {
            return res.status(403).json({ error: 'Bu dosya bu işlemle silinemez' });
        }

        // Admin olmayanlar (sube_sahibi) yalnızca KENDİ şubelerinin ürün
        // görsellerini silebilir. `urunler/{uuid}.webp` key şablonu şube bilgisi
        // taşımadığından, sahiplik çağıranın kendi şube-özel ürünlerinde bu
        // görsele referans olup olmadığına bakılarak doğrulanır.
        if (req.user.role !== 'admin') {
            if (!key.startsWith('urunler/') || !req.user.subeSlug) {
                return res.status(403).json({ error: 'Bu dosyayı silme yetkiniz yok' });
            }
            const { count } = await supabase
                .from('urunler').select('*', { count: 'exact', head: true })
                .eq('sube_kod', req.user.subeSlug).eq('gorsel', url);
            if (!count) {
                return res.status(403).json({ error: 'Bu dosyayı silme yetkiniz yok' });
            }
        }

        await deleteFile(key);

        res.json({ success: true });
    })
);

export default router;
