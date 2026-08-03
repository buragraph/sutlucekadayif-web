import { Router } from '../shared/router.js';
import { supabase } from '../config/supabase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { yeniId, veriYaDaHata, isoZ, tumSatirlar } from '../utils/veri.js';
import { deleteFile, urlToKey, isKeyAllowed } from '../config/r2.js';

const router = Router();

const PAGE_SIZE = 60;
const SYSTEM_FOLDERS = ['Ürünler', 'Kategoriler'];

// İsim araması için Türkçe-duyarlı küçük harf
const adLower = (ad) => (ad || '').toLocaleLowerCase('tr');

// Kelime-bazlı prefix token'ları — her kelimenin baştan prefixleri.
// "Fıstıklı Kadayıf" → ["f","fı",...,"k","ka","kad",...,"kadayıf"]
// Postgres'te ilike ile de aranabilirdi ama `arama` dizisi zaten taşındı ve
// arama davranışı birebir aynı kalsın diye aynı token mantığı korunuyor.
function searchTokens(ad) {
    const kelimeler = adLower(ad).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const set = new Set();
    for (const k of kelimeler) {
        const maxLen = Math.min(k.length, 20); // aşırı uzun kelimeleri sınırla
        for (let i = 1; i <= maxLen; i++) set.add(k.slice(0, i));
    }
    return [...set];
}

/** Satır → eski API şekli (kolon adları birebir aynı; olusturma → createdAt). */
const yanit = (m) => {
    const o = {
        id: m.id,
        ad: m.ad,
        arama: m.arama,
        url: m.url,
        klasor: m.klasor ?? '',
        createdAt: isoZ(m.olusturma),
    };
    // boyut bir kayıtta hiç yazılmamış — null ise anahtar da olmamalı (0 ≠ yok)
    if (m.boyut !== null && m.boyut !== undefined) o.boyut = Number(m.boyut);
    return o;
};

/**
 * GET /api/media
 * Sayfalı medya listesi (cursor tabanlı).
 * Query: ?klasor=ad (belirli klasör) | ?genel=1 (klasörsüz) | (ikisi yoksa tümü)
 *        &cursor=<ISO createdAt> &limit=N
 */
router.get(
    '/',
    verifyToken,
    requirePermission('media.view'),
    asyncHandler(async (req, res) => {
        const { klasor, genel, cursor, q } = req.query;
        const limit = Math.min(Number(req.query.limit) || PAGE_SIZE, 200);

        // ── İsme göre arama (kelime-bazlı prefix token) ──
        if (q && q.trim()) {
            const ql = (adLower(q.trim()).split(/[^\p{L}\p{N}]+/u).filter(Boolean)[0]) || '';
            if (!ql) return res.json({ medyalar: [], nextCursor: null });
            const satirlar = veriYaDaHata(
                await supabase.from('medya').select('*').contains('arama', [ql]).limit(60),
                'medya araması başarısız'
            );
            return res.json({ medyalar: satirlar.map(yanit), nextCursor: null });
        }

        let sorgu = supabase.from('medya').select('*');
        if (genel === '1') sorgu = sorgu.eq('klasor', '');
        else if (klasor) sorgu = sorgu.eq('klasor', klasor);

        sorgu = sorgu.order('olusturma', { ascending: false });
        if (cursor) sorgu = sorgu.lt('olusturma', new Date(cursor).toISOString());
        sorgu = sorgu.limit(limit);

        const satirlar = veriYaDaHata(await sorgu, 'medya okunamadı');
        const medyalar = satirlar.map(yanit);

        // Tam sayfa döndüyse muhtemelen devamı var → son öğenin createdAt'i cursor
        const nextCursor = medyalar.length === limit ? medyalar[medyalar.length - 1].createdAt : null;

        res.json({ medyalar, nextCursor });
    })
);

/**
 * GET /api/media/klasorler
 * Klasörler + her birinin medya sayısı.
 */
router.get(
    '/klasorler',
    verifyToken,
    requirePermission('media.view'),
    asyncHandler(async (req, res) => {
        const klasorSatirlari = veriYaDaHata(
            await supabase.from('medya_klasorler').select('*').order('ad', { ascending: true }),
            'klasörler okunamadı'
        );

        // Tüm klasör değerlerini tek okumada say (eskiden klasör başına bir count sorgusuydu)
        const hepsi = await tumSatirlar(() => supabase.from('medya').select('klasor'),
            { sirala: 'id', baglam: 'medya sayıları' });
        const sayac = {};
        for (const m of hepsi) {
            const k = m.klasor ?? '';
            sayac[k] = (sayac[k] || 0) + 1;
        }

        const klasorler = klasorSatirlari.map((k) => ({
            id: k.id, ad: k.ad, createdAt: isoZ(k.olusturma), count: sayac[k.ad] || 0,
        }));
        const system = {};
        SYSTEM_FOLDERS.forEach((name) => { system[name] = sayac[name] || 0; });

        res.json({ klasorler, counts: { genel: sayac[''] || 0, total: hepsi.length, system } });
    })
);

/**
 * POST /api/media/klasorler
 * Yeni klasör oluştur — Body: { ad }
 */
router.post(
    '/klasorler',
    verifyToken,
    requirePermission('media.manage'),
    asyncHandler(async (req, res) => {
        const { ad } = req.body;

        if (!ad || !ad.trim()) {
            return res.status(400).json({ error: 'Klasör adı zorunludur' });
        }

        const { data: mevcut } = await supabase
            .from('medya_klasorler').select('id').eq('ad', ad.trim()).maybeSingle();
        if (mevcut) {
            return res.status(400).json({ error: 'Bu isimde bir klasör zaten var' });
        }

        const satir = { id: yeniId(), ad: ad.trim(), olusturma: new Date().toISOString() };
        veriYaDaHata(await supabase.from('medya_klasorler').insert(satir), 'klasör eklenemedi');

        res.status(201).json({ id: satir.id, ad: satir.ad, createdAt: isoZ(satir.olusturma) });
    })
);

/**
 * DELETE /api/media/klasorler/:id
 * Klasörü sil (içindeki görselleri "Genel"e taşır)
 */
router.delete(
    '/klasorler/:id',
    verifyToken,
    requirePermission('media.manage'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;

        const { data: klasor } = await supabase
            .from('medya_klasorler').select('ad').eq('id', id).maybeSingle();
        if (!klasor) {
            return res.status(404).json({ error: 'Klasör bulunamadı' });
        }

        // Bu klasördeki görselleri Genel'e taşı, sonra klasörü sil
        veriYaDaHata(
            await supabase.from('medya').update({ klasor: '' }).eq('klasor', klasor.ad),
            'görseller taşınamadı'
        );
        veriYaDaHata(
            await supabase.from('medya_klasorler').delete().eq('id', id),
            'klasör silinemedi'
        );

        res.json({ success: true });
    })
);

/**
 * PUT /api/media/bulk-move
 * NOT: /:id'den ÖNCE tanımlı olmalı (aksi halde "bulk-move" bir id sanılır).
 * Body: { ids: string[], klasor: string }
 */
router.put(
    '/bulk-move',
    verifyToken,
    requirePermission('media.manage'),
    asyncHandler(async (req, res) => {
        const { ids, klasor } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Taşınacak medya seçilmedi' });
        }
        const hedef = (klasor || '').trim();
        veriYaDaHata(
            await supabase.from('medya').update({ klasor: hedef }).in('id', ids),
            'medya taşınamadı'
        );
        res.json({ success: true, taşınan: ids.length });
    })
);

/**
 * POST /api/media/bulk-delete
 * Birden çok medyayı sil (R2 dosyaları + kayıtlar). Body: { ids: string[] }
 */
router.post(
    '/bulk-delete',
    verifyToken,
    requirePermission('media.manage'),
    asyncHandler(async (req, res) => {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Silinecek medya seçilmedi' });
        }

        // Önce R2 dosyalarını sil (best-effort). Pozitif allow-list: dekontlar/ ve
        // tanımsız önekler asla silinmez — `url` alanı doğrulanmadan yazıldığı için
        // keyfi bir "medya" kaydı üzerinden dekont/menu dosyaları toplu silinebilirdi.
        const satirlar = veriYaDaHata(
            await supabase.from('medya').select('url').in('id', ids),
            'medya okunamadı'
        );
        await Promise.all(satirlar.map(async (m) => {
            const key = urlToKey(m.url);
            if (key && isKeyAllowed(key, { forDelete: true })) {
                try { await deleteFile(key); } catch (e) { console.error('[Media] R2 silme hatası:', e.message); }
            }
        }));

        veriYaDaHata(await supabase.from('medya').delete().in('id', ids), 'medya silinemedi');
        res.json({ success: true, silinen: ids.length });
    })
);

/**
 * POST /api/media/backfill-search
 * 'arama' token'ı olmayan kayıtları doldurur — tek seferlik bakım ucu.
 */
router.post(
    '/backfill-search',
    verifyToken,
    requirePermission('media.manage'),
    asyncHandler(async (req, res) => {
        const hepsi = await tumSatirlar(() => supabase.from('medya').select('id, ad, arama'),
            { sirala: 'id', baglam: 'medya' });
        const eksik = hepsi.filter((m) => !m.arama || m.arama.length === 0);
        for (let i = 0; i < eksik.length; i += 50) {
            await Promise.all(eksik.slice(i, i + 50).map((m) =>
                supabase.from('medya').update({ arama: searchTokens(m.ad) }).eq('id', m.id)
                    .then((r) => veriYaDaHata(r, `arama token'ı yazılamadı (${m.id})`))
            ));
        }
        res.json({ success: true, guncellenen: eksik.length, toplam: hepsi.length });
    })
);

/**
 * POST /api/media
 * Yeni medya kaydı oluştur (upload sonrası) — Body: { ad, url, klasor? }
 */
router.post(
    '/',
    verifyToken,
    requirePermission('media.manage'),
    asyncHandler(async (req, res) => {
        const { ad, url, klasor, boyut } = req.body;

        if (!ad || !ad.trim()) {
            return res.status(400).json({ error: 'Görsel adı zorunludur' });
        }
        if (!url || !url.trim()) {
            return res.status(400).json({ error: 'Görsel URL zorunludur' });
        }

        const satir = {
            id: yeniId(),
            ad: ad.trim(),
            arama: searchTokens(ad.trim()),
            url: url.trim(),
            klasor: (klasor || '').trim(),
            boyut: boyut || 0,
            olusturma: new Date().toISOString(),
        };

        veriYaDaHata(await supabase.from('medya').insert(satir), 'medya kaydedilemedi');

        res.status(201).json(yanit(satir));
    })
);

/**
 * PUT /api/media/:id
 * Medya adını veya klasörünü güncelle — Body: { ad?, klasor? }
 */
router.put(
    '/:id',
    verifyToken,
    requirePermission('media.manage'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { ad, klasor } = req.body;

        const { data: mevcut } = await supabase.from('medya').select('id').eq('id', id).maybeSingle();
        if (!mevcut) {
            return res.status(404).json({ error: 'Medya bulunamadı' });
        }

        const updateData = {};
        if (ad !== undefined) { updateData.ad = ad.trim(); updateData.arama = searchTokens(ad.trim()); }
        if (klasor !== undefined) updateData.klasor = klasor.trim();

        if (Object.keys(updateData).length > 0) {
            veriYaDaHata(
                await supabase.from('medya').update(updateData).eq('id', id),
                'medya güncellenemedi'
            );
        }
        res.json({ success: true });
    })
);

/**
 * DELETE /api/media/:id
 * Medya kaydı sil
 */
router.delete(
    '/:id',
    verifyToken,
    requirePermission('media.manage'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;

        const { data: medya } = await supabase.from('medya').select('url').eq('id', id).maybeSingle();
        if (!medya) {
            return res.status(404).json({ error: 'Medya bulunamadı' });
        }

        // R2'den dosyayı sil — pozitif allow-list (dekontlar/ ve tanımsız
        // önekler asla silinmez, bkz. bulk-delete'teki gerekçe).
        if (medya.url) {
            const key = urlToKey(medya.url);
            if (key && isKeyAllowed(key, { forDelete: true })) {
                try { await deleteFile(key); } catch (err) { console.error('R2 silme hatası:', err.message); }
            }
        }

        veriYaDaHata(await supabase.from('medya').delete().eq('id', id), 'medya silinemedi');
        res.json({ success: true });
    })
);

export default router;
