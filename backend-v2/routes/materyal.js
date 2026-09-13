import { Router, akisGonder } from '../shared/router.js';
import { uploadFile, deleteFile, getFileStream } from '../config/r2.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { dosyaAl } from '../shared/dosya.js';
import asyncHandler from '../utils/asyncHandler.js';
import { yeniId, veriYaDaHata, isoZ } from '../utils/veri.js';
import crypto from 'crypto';

const router = Router();

/**
 * Kurumsal materyal — merkezin yüklediği, şubenin indirdiği marka dosyaları.
 *
 * İNDİRME YOLU AYRI BİR UÇ: genel R2 proxy'si yalnızca sabit önekleri
 * (urunler/, menu/, academy/…) servis ediyor ve KİMLİKSİZ — QR menüsü oradan
 * okuyor. Kurumsal dosyalar ise girişli kullanıcıya ait; `kurumsal/` önekini
 * o allow-list'e eklemek dosyaları herkese açardı. Bu yüzden indirme burada,
 * `materyal.view` arkasında ve anahtar KAYITTAN okunuyor — istemcinin
 * gönderdiği key'e hiç güvenilmiyor.
 */
const KATEGORILER = ['logo', 'gorsel', 'sablon', 'dokuman', 'diger'];

// Marka dosyaları: görsel, vektör, PDF ve arşiv. 50 MB — tabela görselleri ve
// çok sayfalı kılavuzlar 10 MB'ı rahat aşıyor.
const MATERYAL_AL = dosyaAl('dosya', {
    tipler: [
        'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
        'application/pdf', 'application/zip', 'application/x-zip-compressed',
        'application/postscript',                       // .ai / .eps
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    enBoy: 50 * 1024 * 1024,
    hataMesaji: 'PNG, JPG, WebP, SVG, PDF, ZIP, AI/EPS, DOCX ve PPTX yüklenebilir (en fazla 50 MB).',
});

const temizle = (v, n) => String(v ?? '').trim().slice(0, n);

const yanit = (m) => ({
    id: m.id,
    ad: m.ad,
    aciklama: m.aciklama || '',
    kategori: m.kategori,
    dosyaAdi: m.dosya_adi,
    mime: m.mime,
    boyut: Number(m.boyut) || 0,
    yukleyen: m.yukleyen || '',
    olusturmaZamani: isoZ(m.olusturma),
});

/** GET /api/materyal — liste (merkez + şube sahibi). */
router.get(
    '/',
    verifyToken,
    requirePermission('materyal.view'),
    asyncHandler(async (req, res) => {
        const satirlar = veriYaDaHata(
            await supabase.from('kurumsal_materyal').select('*')
                .order('olusturma', { ascending: false }).limit(1000),
            'materyaller okunamadı'
        );
        res.json({ materyaller: satirlar.map(yanit) });
    })
);

/** POST /api/materyal — yeni dosya (yalnızca merkez). */
router.post(
    '/',
    verifyToken,
    requirePermission('materyal.manage'),
    MATERYAL_AL,
    asyncHandler(async (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'Dosya bulunamadı.' });

        const ad = temizle(req.body?.ad, 120) || temizle(req.file.originalname, 120);
        if (!ad) return res.status(400).json({ error: 'Materyal adı zorunlu.' });
        const kategori = KATEGORILER.includes(req.body?.kategori) ? req.body.kategori : 'diger';

        // Uzantı DOSYA ADINDAN alınıyor ama key UUID: özgün ad key'e girseydi
        // Türkçe karakter/boşluk/".." gibi şeyler anahtarı bozardı. Özgün ad
        // kayıtta duruyor, indirme onunla yapılıyor.
        const uzanti = String(req.file.originalname || '').includes('.')
            ? '.' + String(req.file.originalname).split('.').pop().toLowerCase().slice(0, 8)
            : '';
        const key = `kurumsal/${crypto.randomUUID()}${uzanti}`;
        await uploadFile(req.file.buffer, key, req.file.mimetype || 'application/octet-stream');

        const id = yeniId();
        veriYaDaHata(
            await supabase.from('kurumsal_materyal').insert({
                id,
                ad,
                aciklama: temizle(req.body?.aciklama, 500),
                kategori,
                r2_key: key,
                dosya_adi: temizle(req.file.originalname, 200) || ad,
                mime: req.file.mimetype || '',
                boyut: req.file.size || req.file.buffer.length || 0,
                yukleyen: req.user.email || req.user.uid,
                olusturma: new Date().toISOString(),
            }),
            'materyal kaydedilemedi'
        );

        res.status(201).json({ success: true, id });
    })
);

/**
 * GET /api/materyal/:id/indir
 * Dosyayı akışla verir. Anahtar KAYITTAN okunuyor; istemci key gönderemiyor.
 */
router.get(
    '/:id/indir',
    verifyToken,
    requirePermission('materyal.view'),
    asyncHandler(async (req, res) => {
        const { data: kayit } = await supabase
            .from('kurumsal_materyal').select('*').eq('id', req.params.id).maybeSingle();
        if (!kayit) return res.status(404).json({ error: 'Materyal bulunamadı.' });

        const sonuc = await getFileStream(kayit.r2_key);
        if (!sonuc) return res.status(404).json({ error: 'Dosya bulunamadı.' });

        res.set('Content-Type', sonuc.tur || kayit.mime || 'application/octet-stream');
        // Tarayıcıda açmak yerine İNDİRME: logo/şablon dosyası ekranda
        // gösterilmek için değil, kullanılmak için duruyor. Dosya adı özgün
        // hâliyle geri veriliyor (kayıtta saklanıyor, bkz. POST).
        res.set('Content-Disposition',
            `attachment; filename*=UTF-8''${encodeURIComponent(kayit.dosya_adi)}`);
        if (sonuc.boyut != null) res.set('Content-Length', String(sonuc.boyut));
        return akisGonder(res, sonuc.akis);
    })
);

/** DELETE /api/materyal/:id — kayıt + R2 nesnesi (yalnızca merkez). */
router.delete(
    '/:id',
    verifyToken,
    requirePermission('materyal.manage'),
    asyncHandler(async (req, res) => {
        const { data: kayit } = await supabase
            .from('kurumsal_materyal').select('*').eq('id', req.params.id).maybeSingle();
        if (!kayit) return res.status(404).json({ error: 'Materyal bulunamadı.' });

        // Önce kayıt, sonra dosya: ters sırada dosya silinip kayıt kalırsa
        // listede indirilemeyen bir satır kalıyor. Dosya silinemezse yetim
        // nesne kalır — o sessiz, bu değil.
        veriYaDaHata(
            await supabase.from('kurumsal_materyal').delete().eq('id', kayit.id),
            'materyal silinemedi'
        );
        try { await deleteFile(kayit.r2_key); } catch (err) {
            console.error('[materyal] R2 nesnesi silinemedi:', kayit.r2_key, err.message);
        }
        res.json({ success: true });
    })
);

export default router;
