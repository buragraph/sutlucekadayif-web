import { Router } from '../shared/router.js';
import { supabase } from '../config/supabase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { yeniId, veriYaDaHata, tumSatirlar } from '../utils/veri.js';
import { regenerateAllMenuJsons } from '../modules/qr-menu/services/menu-cache.js';

const router = Router();

/**
 * Kategori başına ürün sayısı.
 * Eskiden `urunSayisi` kategori dokümanında denormalize tutuluyordu (ve kaçınılmaz
 * olarak bayatlıyordu — bu yüzden bir de /sync-counts ucu vardı). Postgres'te
 * okuma ucuz: silinmemiş ürünlerin kategori kolonunu tek sorguda sayıyoruz.
 */
async function urunSayilari() {
    const satirlar = await tumSatirlar(
        () => supabase.from('urunler').select('kategori_id').is('silinme', null),
        { sirala: 'id', baglam: 'ürün sayıları' }
    );
    const sayac = {};
    for (const s of satirlar) {
        if (s.kategori_id) sayac[s.kategori_id] = (sayac[s.kategori_id] || 0) + 1;
    }
    return sayac;
}

/**
 * GET /api/categories
 * Tüm kategorileri listele (sıralı)
 */
router.get(
    '/',
    verifyToken,
    requirePermission('categories.view'),
    asyncHandler(async (req, res) => {
        const [satirlar, sayac] = await Promise.all([
            supabase.from('kategoriler').select('*').order('sira', { ascending: true })
                .then((r) => veriYaDaHata(r, 'kategoriler okunamadı')),
            urunSayilari(),
        ]);
        // Firestore'da alan YOKSA yanıtta da yoktu (gorsel 3/14, kilitli 2/14,
        // renk 3/14 dokümanda). Null kolonlar kırpılır; '' ve false KORUNUR.
        const kategoriler = satirlar.map((k) => {
            const c = { urunSayisi: sayac[k.id] || 0 };
            for (const [alan, deger] of Object.entries(k)) {
                if (deger !== null && deger !== undefined) c[alan] = deger;
            }
            return c;
        });
        res.json({ kategoriler });
    })
);

/**
 * PUT /api/categories/sira
 * Kategori sırasını topluca günceller. Body: { idler: [katId, ...] }
 * Dizideki konum sırayı belirler (ilk = 1). Menü kategorileri `sira` alanına
 * göre listeliyor (bkz. services/menu-builder.js).
 *
 * NOT: '/:id' rotasından ÖNCE tanımlı olmalı, yoksa "sira" bir kategori kimliği
 * sanılır.
 */
router.put(
    '/sira',
    verifyToken,
    requirePermission('categories.edit'),
    asyncHandler(async (req, res) => {
        const { idler } = req.body;
        if (!Array.isArray(idler) || idler.length === 0) {
            return res.status(400).json({ error: 'Sıralama listesi boş' });
        }
        const temiz = [...new Set(idler.map((x) => String(x).trim()).filter(Boolean))];
        if (temiz.length > 400) return res.status(400).json({ error: 'Tek seferde en fazla 400 kategori' });

        // Var olmayan kimlikleri süz (eskiden getAll ile yapılıyordu)
        const mevcut = veriYaDaHata(
            await supabase.from('kategoriler').select('id').in('id', temiz),
            'kategoriler okunamadı'
        );
        const mevcutSet = new Set(mevcut.map((k) => k.id));
        const sirali = temiz.filter((id) => mevcutSet.has(id));
        if (sirali.length === 0) return res.status(404).json({ error: 'Kategori bulunamadı' });

        // upsert kullanılamaz: kısmi satır INSERT yolunda `ad NOT NULL`a takılır.
        // Kategori sayısı düşük (~14), tek tek update maliyeti önemsiz.
        for (let i = 0; i < sirali.length; i += 50) {
            await Promise.all(sirali.slice(i, i + 50).map((id, j) =>
                supabase.from('kategoriler').update({ sira: i + j + 1 }).eq('id', id)
                    .then((r) => veriYaDaHata(r, `kategori sırası yazılamadı (${id})`))
            ));
        }

        await regenerateAllMenuJsons().catch(console.error);
        res.json({ success: true, guncellenen: sirali.length });
    })
);

/**
 * POST /api/categories/sync-counts
 * Eskiden denormalize `urunSayisi` alanını tazelerdi. Postgres'te sayaç canlı
 * hesaplandığı için yazacak bir şey yok — uç, sözleşme bozulmasın diye duruyor
 * ve aynı şekilde güncel sayaçları döndürüyor.
 */
router.post(
    '/sync-counts',
    verifyToken,
    requirePermission('categories.edit'),
    asyncHandler(async (req, res) => {
        res.json({ success: true, counts: await urunSayilari() });
    })
);

/**
 * POST /api/categories
 * Yeni kategori oluştur
 * Body: { ad, sira? }
 */
router.post(
    '/',
    verifyToken,
    requirePermission('categories.create'),
    asyncHandler(async (req, res) => {
        const { ad, sira, tur, renk, kilitli, gorsel } = req.body;

        if (!ad || !ad.trim()) {
            return res.status(400).json({ error: 'Kategori adı zorunludur' });
        }

        // Sıra belirtilmemişse en sona ekle
        let siraDeger = sira;
        if (siraDeger === undefined || siraDeger === null) {
            const enSon = veriYaDaHata(
                await supabase.from('kategoriler').select('sira').order('sira', { ascending: false }).limit(1),
                'kategori sırası okunamadı'
            );
            siraDeger = enSon.length === 0 ? 1 : (enSon[0].sira || 0) + 1;
        }

        const satir = {
            id: yeniId(),
            ad: ad.trim(),
            sira: siraDeger,
            tur: tur === 'sube_ozel' ? 'sube_ozel' : 'ortak',
        };
        if (renk) satir.renk = renk;
        if (kilitli !== undefined) satir.kilitli = Boolean(kilitli);
        if (gorsel !== undefined) satir.gorsel = gorsel;

        veriYaDaHata(await supabase.from('kategoriler').insert(satir), 'kategori eklenemedi');

        // Kategori eklendi — tüm şubelerin JSON'ını güvenilir şekilde yenile
        await regenerateAllMenuJsons().catch(console.error);

        res.status(201).json({
            id: satir.id,
            ad: ad.trim(),
            sira: siraDeger,
        });
    })
);

/**
 * PUT /api/categories/:id
 * Kategori güncelle
 * Body: { ad?, sira? }
 */
router.put(
    '/:id',
    verifyToken,
    requirePermission('categories.edit'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { ad, sira, tur, renk, kilitli, gorsel } = req.body;

        const { data: mevcut } = await supabase.from('kategoriler').select('id').eq('id', id).maybeSingle();
        if (!mevcut) {
            return res.status(404).json({ error: 'Kategori bulunamadı' });
        }

        const updateData = {};
        if (ad !== undefined) updateData.ad = ad.trim();
        if (sira !== undefined) updateData.sira = sira;
        if (tur !== undefined) updateData.tur = tur === 'sube_ozel' ? 'sube_ozel' : 'ortak';
        if (renk !== undefined) updateData.renk = renk;
        if (kilitli !== undefined) updateData.kilitli = Boolean(kilitli);
        if (gorsel !== undefined) updateData.gorsel = gorsel;

        if (Object.keys(updateData).length > 0) {
            veriYaDaHata(
                await supabase.from('kategoriler').update(updateData).eq('id', id),
                'kategori güncellenemedi'
            );
        }

        // Kategori güncellendi — tüm şubelerin JSON'ını güvenilir şekilde yenile
        await regenerateAllMenuJsons().catch(console.error);
        res.json({ success: true });
    })
);

/**
 * DELETE /api/categories/:id
 * Kategori sil
 */
router.delete(
    '/:id',
    verifyToken,
    requirePermission('categories.delete'),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { yeniKategori } = req.query;

        const { data: mevcut } = await supabase.from('kategoriler').select('id').eq('id', id).maybeSingle();
        if (!mevcut) {
            return res.status(404).json({ error: 'Kategori bulunamadı' });
        }

        // Kategoriye ait ürünler — ortak + şubeye özel HEPSİ tek tabloda.
        // (Eskiden ortak_urunler + collectionGroup('urunler') taraması gerekiyordu;
        // collectionGroup indeksi yoksa şube ürünleri sessizce atlanıyordu.)
        const { count: urunSayisi } = await supabase
            .from('urunler').select('*', { count: 'exact', head: true }).eq('kategori_id', id);

        if (urunSayisi > 0 && !yeniKategori) {
            return res.status(409).json({
                error: 'Bu kategoriye ait ürünler var.',
                urunSayisi,
                requiresReplacement: true,
            });
        }

        // Ürünleri yeni kategoriye taşı (tek UPDATE — batch parçalamaya gerek yok)
        if (urunSayisi > 0 && yeniKategori) {
            veriYaDaHata(
                await supabase.from('urunler').update({ kategori_id: yeniKategori }).eq('kategori_id', id),
                'ürünler taşınamadı'
            );
        }

        veriYaDaHata(await supabase.from('kategoriler').delete().eq('id', id), 'kategori silinemedi');

        // Kategori silindi — tüm şubelerin JSON'ını güvenilir şekilde yenile
        await regenerateAllMenuJsons().catch(console.error);
        res.json({ success: true, tasinanUrun: urunSayisi });
    })
);

export default router;
