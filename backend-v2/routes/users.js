import { Router } from '../shared/router.js';
import { supabase } from '../config/supabase.js';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import {
    claimYaz,
    hesapAlanlari,
    kullaniciGuncelle,
    kullaniciSil,
    kullaniciYarat,
    tumKullanicilar,
} from '../shared/kullanici-dizini.js';
import { ilerlemeDevral } from '../modules/academy/devir.js';
import asyncHandler from '../utils/asyncHandler.js';
import { veriYaDaHata } from '../utils/veri.js';

// Kimlik Faz 2'de Supabase Auth'ta; rol/şube eşlemesi kullanici_sube'de.
// Hesap alanlarının Firebase biçimine çevrilmesi shared/kullanici-dizini.js'te.

const router = Router();

/**
 * GET /api/users
 * Tüm kullanıcıları listele (Supabase Auth + kullanici_sube eşleştirmeleri)
 * Sadece admin erişebilir
 */
router.get(
    '/',
    verifyToken,
    requirePermission('users.view'),
    asyncHandler(async (req, res) => {
        const satirlar = veriYaDaHata(
            await supabase.from('kullanici_sube').select('uid, role, sube_slug, telefon, onboarded'),
            'kullanici_sube okunamadı'
        );
        const subeMap = Object.fromEntries(satirlar.map((s) => [s.uid, s]));

        // SON HAREKET: `auth.users.last_sign_in_at` yalnızca PAROLAYLA girişte
        // güncelleniyor; panel oturumu yenileme tokeniyle haftalarca sürdüğü için
        // o alan "paneli en son kullandığı an"ı değil "en son parola girdiği an"ı
        // gösteriyordu. Gerçek erişim auth.sessions'ta; oraya PostgREST'ten
        // ulaşılamadığı için kullanici_son_hareket() fonksiyonundan okunuyor
        // (bkz. migration 0034). Fonksiyon düşerse liste yine dönsün diye
        // hata yutuluyor, alan last_sign_in_at'e geri düşüyor.
        const { data: hareketler } = await supabase.rpc('kullanici_son_hareket');
        const hareketMap = Object.fromEntries(
            (hareketler || []).map((h) => [h.uid, h.son_hareket])
        );

        let users = (await tumKullanicilar()).map((user) => {
            const subeData = subeMap[user.id] || {};
            const hesap = hesapAlanlari(user);
            return {
                uid: hesap.uid,
                email: hesap.email,
                displayName: hesap.displayName,
                disabled: hesap.disabled,
                createdAt: hesap.createdAt,
                lastSignIn: hareketMap[user.id]
                    ? new Date(hareketMap[user.id]).toUTCString()
                    : hesap.lastSignIn,
                subeSlug: subeData.sube_slug || null,
                role: subeData.role || null,
                telefon: subeData.telefon || null,
                // Listedeki "ilk giriş formunu sıfırla" düğmesi buna bakıyor:
                // form zaten sıfırsa düğme sönük olsun, ikinci kez basılmasın.
                onboarded: subeData.onboarded === true,
            };
        });

        // Eğer kullanıcı şube sahibiyse, sadece kendi şubesindeki çalışanları görebilir
        if (req.user.role === 'sube_sahibi') {
            users = users.filter(u => u.subeSlug === req.user.subeSlug && u.role === 'calisan');
        }

        res.json({ users });
    })
);

/**
 * POST /api/users/toplu
 * Listeden çok sayıda kullanıcı açar (şube sahibi devri, akademi hesapları).
 *
 * NEDEN AYRI UÇ: 88 hesabı tek tek açmak hem yavaş hem hataya açık; asıl
 * mesele her satırın ŞUBE EŞLEŞTİRMESİ. Uç, satır satır sonuç döndürür ve
 * hiçbir satır diğerini düşürmez — biri patlarsa kalanlar açılmaya devam eder.
 *
 * NEDEN SADECE ADMIN: `users.create` şube sahibinde de açık ama orada rol ve
 * şube zorla kendi şubesine çevriliyor (bkz. tekil uç). Toplu açmada gövdeden
 * serbest `subeSlug` geliyor, dolayısıyla izin değil ROL kontrolü yapılıyor.
 *
 * IDEMPOTENT DEĞİL AMA GÜVENLİ: var olan e-posta atlanır ('zaten_var'), yani
 * aynı liste iki kez gönderilse de kopya hesap doğmaz.
 */
const TOPLU_EN_FAZLA = 200;

router.post(
    '/toplu',
    verifyToken,
    requirePermission('users.create'),
    asyncHandler(async (req, res) => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Toplu kullanıcı açma yalnızca yöneticilere açıktır.' });
        }
        const kayitlar = Array.isArray(req.body?.kayitlar) ? req.body.kayitlar : null;
        if (!kayitlar || kayitlar.length === 0) {
            return res.status(400).json({ error: 'Kayıt listesi boş.' });
        }
        if (kayitlar.length > TOPLU_EN_FAZLA) {
            return res.status(400).json({ error: `Tek seferde en fazla ${TOPLU_EN_FAZLA} kayıt gönderilebilir.` });
        }

        // Var olan e-postalar tek seferde okunur; satır başına dizin taraması
        // 200 kayıtta 200 tam listeleme demekti.
        const mevcut = new Set((await tumKullanicilar()).map((u) => (u.email || '').toLowerCase()));

        const sonuclar = [];
        for (const [i, ham] of kayitlar.entries()) {
            const email = String(ham?.email ?? '').trim().toLowerCase();
            const parola = String(ham?.password ?? '');
            const adSoyad = String(ham?.ad_soyad ?? '').trim();
            const subeSlug = String(ham?.subeSlug ?? '').trim();
            const role = String(ham?.role ?? '').trim();
            const satir = { sira: i + 1, email };

            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                sonuclar.push({ ...satir, durum: 'hata', mesaj: 'Geçersiz e-posta' });
                continue;
            }
            if (!['admin', 'sube_sahibi', 'calisan'].includes(role)) {
                sonuclar.push({ ...satir, durum: 'hata', mesaj: 'Geçersiz rol' });
                continue;
            }
            if (role !== 'admin' && !subeSlug) {
                sonuclar.push({ ...satir, durum: 'hata', mesaj: 'Şube zorunlu' });
                continue;
            }
            if (mevcut.has(email)) {
                sonuclar.push({ ...satir, durum: 'zaten_var', mesaj: 'Bu e-posta ile hesap zaten var' });
                continue;
            }

            const parolaVerildi = !!parola && parola.length >= 6;
            let yeni = null;
            try {
                yeni = await kullaniciYarat({
                    email,
                    password: parolaVerildi ? parola : undefined,
                    displayName: adSoyad || null,
                    role,
                    subeSlug: subeSlug || null,
                });
                veriYaDaHata(
                    await supabase.from('kullanici_sube').upsert(
                        {
                            uid: yeni.id, role, sube_slug: subeSlug || null,
                            parola_kuruldu: parolaVerildi,
                            parola_degistir_gerekli: parolaVerildi,
                        },
                        { onConflict: 'uid' }
                    ),
                    'kullanıcı kaydı yazılamadı'
                );
                const devir = await ilerlemeDevral(yeni.id, email);
                mevcut.add(email);
                sonuclar.push({
                    ...satir, durum: 'olusturuldu', uid: yeni.id,
                    ilerlemeBaglandi: Number(devir) > 0 ? Number(devir) : 0,
                });
            } catch (err) {
                // Auth hesabı açıldıysa ortada kalmasın
                if (yeni?.id) await kullaniciSil(yeni.id).catch(() => {});
                sonuclar.push({ ...satir, durum: 'hata', mesaj: err.message || 'Açılamadı' });
            }
        }

        const ozet = sonuclar.reduce((a, s) => ({ ...a, [s.durum]: (a[s.durum] || 0) + 1 }), {});
        res.json({ ozet, sonuclar });
    })
);

/**
 * POST /api/users
 * Yeni kullanıcı oluştur
 * Body: { email, password, displayName?, subeSlug, role }
 */
router.post(
    '/',
    verifyToken,
    requirePermission('users.create'),
    asyncHandler(async (req, res) => {
        let { email, password, displayName, subeSlug, role } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'E-posta zorunludur' });
        }
        if (!role) {
            return res.status(400).json({ error: 'Rol zorunludur' });
        }
        if (role !== 'admin' && !subeSlug) {
            return res.status(400).json({ error: 'Şube yetkilisi veya çalışan için şube zorunludur' });
        }

        // Şube sahibi güvenliği: Sadece kendi şubesine çalışan ekleyebilir
        if (req.user.role === 'sube_sahibi') {
            role = 'calisan';
            subeSlug = req.user.subeSlug;
        }

        // Parola BOŞ bırakılabilir: hesap parolasız açılır ve kişi giriş
        // ekranına ilk yazdığı parolayı kendi parolası yapar (bkz. routes/parola.js).
        // Eskiden burada rastgele bir parola üretiliyordu ama hiçbir yerde
        // gösterilmediği için hesap kullanılamaz kalıyordu.
        const parolaVerildi = !!password && String(password).length >= 6;
        const yeni = await kullaniciYarat({
            email,
            password: parolaVerildi ? password : undefined,
            displayName: displayName || null,
            role,
            subeSlug: subeSlug || null,
        });

        // Rol/şube eşleştirmesi — sube_slug FK'lı, boş string null'a düşer.
        // Yazılamazsa Auth kullanıcısı ortada kalmasın: geri al.
        try {
            veriYaDaHata(
                await supabase.from('kullanici_sube').upsert(
                    {
                        uid: yeni.id, role, sube_slug: subeSlug || null,
                        parola_kuruldu: parolaVerildi,
                        // PAROLAYLA AÇILAN HESAP İLK GİRİŞTE DEĞİŞTİRMEK ZORUNDA.
                        // Merkezin belirlediği parola bir listede duruyor ve en az
                        // bir başka kişi tarafından biliniyor; kullanıcı kendi
                        // parolasını belirlemeden panele giremesin (bkz. 0033).
                        parola_degistir_gerekli: parolaVerildi,
                    },
                    { onConflict: 'uid' }
                ),
                'kullanıcı kaydı yazılamadı'
            );

            // WP'den devralınan ilerleme varsa bu hesaba bağla (sessiz, bkz. devir.js)
            await ilerlemeDevral(yeni.id, email);
        } catch (err) {
            await kullaniciSil(yeni.id).catch(() => {});
            throw err;
        }

        res.status(201).json({
            uid: yeni.id,
            email: yeni.email,
            // displayName verilmediyse anahtar hiç dönmez (Faz 1 davranışı)
            displayName: yeni.user_metadata?.displayName,
            subeSlug,
            role,
        });
    })
);

/**
 * PUT /api/users/:uid
 * Kullanıcı bilgilerini güncelle
 * Body: { email?, displayName?, subeSlug?, role? }
 */
router.put(
    '/:uid',
    verifyToken,
    requirePermission('users.assignRole'),
    asyncHandler(async (req, res) => {
        const { uid } = req.params;
        let { email, displayName, subeSlug, role, parolaSifirla } = req.body;

        // Şube sahibi güvenliği: Sadece kendi şubesindeki çalışanları düzenleyebilir
        if (req.user.role === 'sube_sahibi') {
            const { data } = await supabase
                .from('kullanici_sube').select('role, sube_slug').eq('uid', uid).maybeSingle();
            if (!data || data.sube_slug !== req.user.subeSlug || data.role !== 'calisan') {
                return res.status(403).json({ error: 'Bu kullanıcıyı düzenleme yetkiniz yok' });
            }
            // Şube ve rol değiştirmesine izin verme.
            subeSlug = undefined;
            role = undefined;
            // E-POSTA VE PAROLA SIFIRLAMA DA KAPALI. Bu ikisi süzülmüyordu ve
            // iki adımlık hesap devralma açıyordu: şube sahibi çalışanı için
            // `parolaSifirla: true` gönderip hesabı "ilk giriş" durumuna
            // düşürüyor, sonra kimliksiz POST /api/parola/belirle ile hesabı
            // sahipleniyordu. E-postayı kendi adresiyle değiştirmek de aynı
            // sonucu veriyordu. Parola sıfırlama artık yalnızca admin işi.
            email = undefined;
            parolaSifirla = undefined;
        }

        // Auth hesabını güncelle
        await kullaniciGuncelle(uid, {
            ...(email ? { email } : {}),
            ...(displayName !== undefined ? { displayName: displayName || null } : {}),
        });

        // Parola sıfırlama: yeni parola ATAMAYIZ, hesabı "ilk giriş" durumuna
        // döndürürüz — kişi giriş ekranında yeni parolasını kendi belirler
        // (bkz. routes/parola.js). Yönetici düz metin parola görmez/iletmez.
        if (parolaSifirla) {
            veriYaDaHata(
                await supabase.from('kullanici_sube')
                    .update({ parola_kuruldu: false }).eq('uid', uid),
                'parola sıfırlanamadı'
            );
            console.log(`🔑 ${uid}: parola sıfırlandı, ilk giriş bekleniyor`);
        }

        // Şube/rol güncelle
        if (subeSlug !== undefined || role !== undefined) {
            const yama = { uid };
            if (subeSlug !== undefined) yama.sube_slug = subeSlug || null;
            if (role !== undefined) yama.role = role;
            veriYaDaHata(
                await supabase.from('kullanici_sube').upsert(yama, { onConflict: 'uid' }),
                'kullanıcı kaydı güncellenemedi'
            );

            // Claim'leri yaz (tümünü ezdiği için veritabanından güncel hali okuyup atıyoruz)
            const { data } = await supabase
                .from('kullanici_sube').select('role, sube_slug').eq('uid', uid).maybeSingle();
            await claimYaz(uid, {
                role: data?.role || 'calisan',
                subeSlug: data?.sube_slug || null,
            });
        }

        res.json({ success: true });
    })
);

/**
 * DELETE /api/users/:uid
 * Kullanıcıyı sil
 */
router.delete(
    '/:uid',
    verifyToken,
    requirePermission('users.create'),
    asyncHandler(async (req, res) => {
        const { uid } = req.params;

        // Kendini silemesin
        if (uid === req.user.uid) {
            return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz' });
        }

        // Şube sahibi güvenliği: Sadece kendi şubesindeki çalışanları silebilir
        if (req.user.role === 'sube_sahibi') {
            const { data } = await supabase
                .from('kullanici_sube').select('role, sube_slug').eq('uid', uid).maybeSingle();
            if (!data || data.sube_slug !== req.user.subeSlug || data.role !== 'calisan') {
                return res.status(403).json({ error: 'Bu kullanıcıyı silme yetkiniz yok' });
            }
        }

        // Auth hesabını sil
        await kullaniciSil(uid);

        // Eşleştirmeyi sil
        veriYaDaHata(
            await supabase.from('kullanici_sube').delete().eq('uid', uid),
            'kullanıcı kaydı silinemedi'
        );

        res.json({ success: true });
    })
);

export default router;
