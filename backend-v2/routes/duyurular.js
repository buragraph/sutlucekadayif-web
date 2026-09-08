import { Router } from '../shared/router.js';
import { supabase } from '../config/supabase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { yeniId, veriYaDaHata, isoZ } from '../utils/veri.js';

const router = Router();

const ONEMLER = ['bilgi', 'uyari', 'onemli'];
const LIMITLER = { baslik: 160, icerik: 4000 };

const temizle = (v, max) => String(v ?? '').trim().slice(0, max);

/** ISO tarih ya da null — geçersiz girdi sessizce null olur, kayıt düşmez. */
const tarih = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const yanit = (d) => ({
    id: d.id,
    baslik: d.baslik,
    icerik: d.icerik,
    onem: d.onem,
    yayinda: d.yayinda,
    baslangic: isoZ(d.baslangic),
    bitis: isoZ(d.bitis),
    hedefSubeler: d.hedef_subeler || [],
    olusturan: d.olusturan,
    olusturma: isoZ(d.olusturma),
    guncelleme: isoZ(d.guncelleme),
});

/** Gövdeden yazılabilir alanlar. `kismi` true ise yalnızca gelenler döner. */
function govdedenAl(req, kismi = false) {
    const g = req.body || {};
    const veri = {};
    if (!kismi || g.baslik !== undefined) veri.baslik = temizle(g.baslik, LIMITLER.baslik);
    if (!kismi || g.icerik !== undefined) veri.icerik = temizle(g.icerik, LIMITLER.icerik);
    if (!kismi || g.onem !== undefined) veri.onem = ONEMLER.includes(g.onem) ? g.onem : 'bilgi';
    if (!kismi || g.yayinda !== undefined) veri.yayinda = g.yayinda !== false;
    if (!kismi || g.baslangic !== undefined) veri.baslangic = tarih(g.baslangic);
    if (!kismi || g.bitis !== undefined) veri.bitis = tarih(g.bitis);
    if (!kismi || g.hedefSubeler !== undefined) {
        veri.hedef_subeler = Array.isArray(g.hedefSubeler)
            ? [...new Set(g.hedefSubeler.map((x) => temizle(x, 60)).filter(Boolean))]
            : [];
    }
    return veri;
}

/**
 * GET /api/duyurular/aktif
 * Kullanıcının ŞU AN görmesi gereken duyurular (dashboard kartı).
 *
 * Tarih penceresi ve hedef şube süzgeci SUNUCUDA: şube sahibine başka şubenin
 * duyurusu, yayından kaldırılmış ya da süresi geçmiş bir kayıt hiç gitmemeli —
 * istemcide gizlemek veriyi yine de yollamak olurdu.
 */
router.get(
    '/aktif',
    verifyToken,
    requirePermission('duyuru.view'),
    asyncHandler(async (req, res) => {
        const simdi = new Date().toISOString();
        const { data, error } = await supabase
            .from('duyurular')
            .select('*')
            .eq('yayinda', true)
            .or(`baslangic.is.null,baslangic.lte.${simdi}`)
            .or(`bitis.is.null,bitis.gte.${simdi}`)
            .order('olusturma', { ascending: false })
            .limit(20);
        if (error) throw new Error(error.message);

        // Hedefleme burada: boş dizi = herkes. Admin hepsini görür (yayındakini
        // şubenin gözünden kontrol edebilmesi için).
        const sube = req.user.subeSlug;
        const gorunen = (data || []).filter((d) => {
            const hedef = d.hedef_subeler || [];
            if (hedef.length === 0) return true;
            if (req.user.role === 'admin') return true;
            return sube ? hedef.includes(sube) : false;
        });

        res.json({ duyurular: gorunen.map(yanit) });
    })
);

/**
 * GET /api/duyurular
 * Yönetim listesi — yayından kalkmış ve süresi geçmiş olanlar dahil.
 */
router.get(
    '/',
    verifyToken,
    requirePermission('duyuru.manage'),
    asyncHandler(async (req, res) => {
        const { data, error } = await supabase
            .from('duyurular').select('*').order('olusturma', { ascending: false }).limit(200);
        if (error) throw new Error(error.message);
        res.json({ duyurular: (data || []).map(yanit) });
    })
);

/**
 * POST /api/duyurular
 * Body: { baslik, icerik?, onem?, yayinda?, baslangic?, bitis?, hedefSubeler? }
 */
router.post(
    '/',
    verifyToken,
    requirePermission('duyuru.manage'),
    asyncHandler(async (req, res) => {
        const veri = govdedenAl(req);
        if (!veri.baslik) return res.status(400).json({ error: 'Başlık gerekli' });
        if (veri.baslangic && veri.bitis && veri.bitis < veri.baslangic) {
            return res.status(400).json({ error: 'Bitiş tarihi başlangıçtan önce olamaz' });
        }

        const satir = veriYaDaHata(
            await supabase.from('duyurular').insert({
                id: yeniId(),
                ...veri,
                olusturan: req.user.email || null,
            }).select().single(),
            'duyuru oluşturulamadı'
        );
        res.status(201).json({ duyuru: yanit(satir) });
    })
);

/**
 * PUT /api/duyurular/:id
 * Kısmi güncelleme: yalnızca gövdede GELEN alanlar yazılır. Böylece "yayından
 * kaldır" düğmesi tek alan gönderip diğerlerini sıfırlamaz.
 */
router.put(
    '/:id',
    verifyToken,
    requirePermission('duyuru.manage'),
    asyncHandler(async (req, res) => {
        const veri = govdedenAl(req, true);
        if (veri.baslik !== undefined && !veri.baslik) {
            return res.status(400).json({ error: 'Başlık boş olamaz' });
        }
        if (Object.keys(veri).length === 0) {
            return res.status(400).json({ error: 'Güncellenecek alan yok' });
        }

        const { data, error } = await supabase.from('duyurular')
            .update({ ...veri, guncelleme: new Date().toISOString() })
            .eq('id', req.params.id).select().maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return res.status(404).json({ error: 'Duyuru bulunamadı' });

        res.json({ duyuru: yanit(data) });
    })
);

/**
 * DELETE /api/duyurular/:id
 * Kalıcı siler — duyuru geçmişi tutulmuyor, yayından kaldırmak için `yayinda`
 * bayrağı var.
 */
router.delete(
    '/:id',
    verifyToken,
    requirePermission('duyuru.manage'),
    asyncHandler(async (req, res) => {
        veriYaDaHata(
            await supabase.from('duyurular').delete().eq('id', req.params.id),
            'duyuru silinemedi'
        );
        res.json({ success: true });
    })
);

export default router;
