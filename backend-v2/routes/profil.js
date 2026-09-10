import { Router } from '../shared/router.js';
import { supabase } from '../config/supabase.js';
import { verifyToken } from '../middleware/auth.js';
import { ilIlceDogrula } from '../shared/iller.js';
import { hesapAlanlari, kullaniciGetir, kullaniciGuncelle } from '../shared/kullanici-dizini.js';
import asyncHandler from '../utils/asyncHandler.js';
import { veriYaDaHata } from '../utils/veri.js';
import { geocodeIlce } from './branches.js';

const router = Router();

// Düzenlenebilir şube alanları — şube ADI buradan değiştirilemez (merkezî yönetilir).
const SUBE_ALANLARI = ['il', 'ilce', 'adres', 'vkn', 'fatura_adresi', 'sirket_tipi'];

/**
 * GET /api/profil
 * Şube sahibinin kendi profil verisi — hesap + mağaza + fatura/vergi.
 */
router.get(
    '/',
    verifyToken,
    asyncHandler(async (req, res) => {
        const kayit = await kullaniciGetir(req.user.uid);
        const authUser = kayit ? hesapAlanlari(kayit) : null;

        // ŞUBE BLOKLARI ÇALIŞANA KAPALI — yazma gibi OKUMA da.
        //
        // Bu uçta izin halkası yok ve `fatura` bloğu şubeye atanmış HERKESE
        // dönüyordu: kasiyer hesabı şubenin VKN'sini, fatura adresini ve şirket
        // tipini okuyabiliyordu. Aynı alanları veren resmî uç (/api/branches)
        // `branches.view` istiyor ve o izin çalışanda YOK — yani buradan
        // dolaşılıyordu. `magaza` da kapatıldı: yazma zaten engelli olduğu için
        // çalışana düzenlenebilir görünmesi sessiz bir "kaydedildi" yalanıydı.
        const subeBloklari = req.user.role === 'admin' || req.user.role === 'sube_sahibi';

        // Şubeye atanmamış kullanıcı (ör. admin) → yalnızca hesap bilgisi.
        if (!req.user.subeSlug || !subeBloklari) {
            const [{ data: u }, { data: s }] = await Promise.all([
                supabase.from('kullanici_sube').select('telefon').eq('uid', req.user.uid).maybeSingle(),
                req.user.subeSlug
                    ? supabase.from('subeler').select('ad').eq('kod', req.user.subeSlug).maybeSingle()
                    : Promise.resolve({ data: null }),
            ]);
            return res.json({
                hesap: {
                    ad_soyad: authUser?.displayName || '',
                    email: authUser?.email || '',
                    telefon: u?.telefon || '',
                    // Çalışan hangi şubede olduğunu görsün — ad dışında şube
                    // verisi almıyor.
                    sube_adi: s?.ad || '',
                },
                magaza: null,
                fatura: null,
            });
        }

        const [{ data: u }, { data: s }] = await Promise.all([
            supabase.from('kullanici_sube').select('telefon').eq('uid', req.user.uid).maybeSingle(),
            supabase.from('subeler').select('*').eq('kod', req.user.subeSlug).maybeSingle(),
        ]);

        res.json({
            hesap: {
                ad_soyad: authUser?.displayName || '',
                email: authUser?.email || '',
                telefon: u?.telefon || '',
            },
            magaza: {
                kod: req.user.subeSlug,
                ad: s?.ad || '',
                il: s?.il || '',
                ilce: s?.ilce || '',
                adres: s?.adres || '',
            },
            fatura: {
                vkn: s?.vkn || '',
                fatura_adresi: s?.fatura_adresi || '',
                sirket_tipi: s?.sirket_tipi || '',
            },
        });
    })
);

/**
 * PUT /api/profil
 * Profil alanlarını günceller (kısmi). Her veri ait olduğu kayda yazılır.
 * E-posta buradan değiştirilmez (hesap güvenliği).
 */
router.put(
    '/',
    verifyToken,
    asyncHandler(async (req, res) => {
        // Ad Soyad → Auth displayName
        if (req.body.ad_soyad !== undefined) {
            await kullaniciGuncelle(req.user.uid, { displayName: String(req.body.ad_soyad).trim() });
        }

        // Telefon → kullanici_sube
        if (req.body.telefon !== undefined) {
            veriYaDaHata(
                await supabase.from('kullanici_sube').upsert(
                    { uid: req.user.uid, telefon: String(req.body.telefon).trim() },
                    { onConflict: 'uid' }
                ),
                'telefon yazılamadı'
            );
        }

        // ŞUBE ALANLARI ÇALIŞANA KAPALI. Bu uçta izin halkası yoktu ve şubeye
        // atanmış HERKES (çalışan dahil) şubenin vergi/fatura/konum bilgisini
        // yazabiliyordu — aynı alanları yazan resmî uç (PUT /api/branches/:slug)
        // admin'e kapalıyken. Onboarding akışı da zaten yalnızca şube sahibine
        // açık (bkz. routes/onboarding.js).
        const subeAlaniYazabilir = req.user.role === 'admin' || req.user.role === 'sube_sahibi';
        if (req.user.subeSlug && subeAlaniYazabilir) {
            const subeVeri = {};
            for (const k of SUBE_ALANLARI) {
                if (req.body[k] !== undefined) subeVeri[k] = String(req.body[k]).trim();
            }

            // İL/İLÇE SERBEST METİN DEĞİL. Tek denetim istemcideki açılır
            // listeydi; sunucu her şeyi kabul ettiği için bu alanlara HTML
            // yerleştirilip admin panelinde çalıştırılabiliyordu. Artık resmî
            // listeye karşı doğrulanıyor ve KANONİK yazımıyla kaydediliyor.
            if (subeVeri.il !== undefined || subeVeri.ilce !== undefined) {
                const { data: mevcut } = await supabase
                    .from('subeler').select('il, ilce').eq('kod', req.user.subeSlug).maybeSingle();
                const ilAday = subeVeri.il !== undefined ? subeVeri.il : (mevcut?.il || '');
                const ilceAday = subeVeri.ilce !== undefined ? subeVeri.ilce : (mevcut?.ilce || '');
                const dogru = ilIlceDogrula(ilAday, ilceAday);
                if (!dogru.gecerli) {
                    return res.status(400).json({ error: 'Geçersiz il/ilçe.' });
                }
                if (subeVeri.il !== undefined) subeVeri.il = dogru.il;
                if (subeVeri.ilce !== undefined) subeVeri.ilce = dogru.ilce;
            }

            if (Object.keys(subeVeri).length > 0) {
                // İl/ilçe değiştiyse haritadaki konumu yeniden hesapla
                if (subeVeri.il !== undefined || subeVeri.ilce !== undefined) {
                    const konum = await geocodeIlce(subeVeri.il, subeVeri.ilce);
                    if (konum) { subeVeri.lat = konum.lat; subeVeri.lng = konum.lng; }
                }
                veriYaDaHata(
                    await supabase.from('subeler').update(subeVeri).eq('kod', req.user.subeSlug),
                    'şube bilgisi güncellenemedi'
                );
            }
        }

        res.json({ success: true });
    })
);

/**
 * POST /api/profil/parola
 * Kullanıcı kendi parolasını değiştirir.
 *
 * NEDEN SUNUCUDA: istemci `supabase.auth.updateUser` ile de değiştirebilir,
 * ama zorunlu değişim bayrağını (`parola_degistir_gerekli`) yalnızca sunucu
 * düşürmeli. İstemciye bırakılsaydı bayrak parolayı hiç değiştirmeden
 * temizlenebilir, zorunluluk da kâğıt üstünde kalırdı. Değişim ve bayrak
 * aynı istekte, aynı yerde yapılıyor.
 */
const EN_AZ_PAROLA = 8;   // ProfilePage ve parola.js ile aynı kural

router.post(
    '/parola',
    verifyToken,
    asyncHandler(async (req, res) => {
        const yeni = String(req.body?.yeniParola ?? '');
        if (yeni.length < EN_AZ_PAROLA) {
            return res.status(400).json({ error: `Parola en az ${EN_AZ_PAROLA} karakter olmalıdır.` });
        }

        await kullaniciGuncelle(req.user.uid, { password: yeni });

        // Bayrak yazılamazsa hata DÖNDÜR: parola değişti ama zorunluluk
        // sürüyorsa kullanıcı kapıda kalır; sessizce geçmek yerine görünsün.
        veriYaDaHata(
            await supabase.from('kullanici_sube')
                .update({ parola_degistir_gerekli: false, parola_kuruldu: true })
                .eq('uid', req.user.uid),
            'parola durumu güncellenemedi'
        );

        res.json({ success: true });
    })
);

export default router;
