import { Router } from '../shared/router.js';
import { oranSiniri } from '../shared/limit.js';
import { supabase } from '../config/supabase.js';
import { tumKullanicilar, kullaniciGuncelle } from '../shared/kullanici-dizini.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * İlk girişte parola belirleme — PUBLIC uç.
 *
 * AKIŞ: Yönetici hesabı parolasız açar (bkz. routes/users.js POST). Kişi giriş
 * ekranına e-postasını ve istediği parolayı yazar; hesabın parolası henüz
 * kurulmamışsa burada kalıcı olarak yazılır ve istemci normal girişi tekrar dener.
 *
 * DOĞRULAMA YOK — bilinçli karar (bkz. 0012_ilk_giris_parolasi.sql). E-postayı
 * bilen biri kurulmamış bir hesabı sahiplenebilir. Bunu telafi etmek için:
 *   • her deneme sonucuyla birlikte loglanır
 *   • yanıtlar hesabın var olup olmadığını SIZDIRMAZ: başarısız her durum aynı
 *     mesajı döner, yalnızca parola uzunluğu hatası ayrışır (o girdiye dair,
 *     hesaba dair değil)
 */
const router = Router();

const EN_AZ = 8;   // ProfilePage'deki parola değiştirme kuralıyla aynı

// Express (yerel/rollback) tarafındaki süreç-içi sınır. ÜRETİMDE ÇALIŞMAZ:
// Workers girişi `limitAyarla(limitYok)` kaydediyor (bkz. shared/limit.js), yani
// bu middleware canlıda no-op. Gerçek koruma aşağıdaki veritabanı sayacı.
const parolaLimiti = oranSiniri({
    windowMs: 60 * 60 * 1000,
    max: 20,
    message: { error: 'Çok fazla deneme yapıldı, bir süre sonra tekrar deneyin' },
});

// VERİTABANI TABANLI SINIR — ortam bağımsız.
//
// Süreç-içi sayaç Workers'ta anlamsız (her isolate ayrı) ve kenar kuralı
// koda görünmüyor. Zaten yazdığımız `parola_belirleme_log` tablosu sayaç
// olarak kullanılıyor: son bir saatteki deneme sayısına bakılıyor.
//
// E-POSTA BAZLI SINIR ASIL OLAN: hedefli devralma tek bir hesaba yönelir.
// IP sınırı ise numaralandırmayı yavaşlatır.
//
// `sonuc = 'limit'` kayıtları SAYILMAZ: sayılsaydı sınıra takılan her istek
// pencereyi kendi kendine uzatır, saldırgan da meşru kullanıcıyı süresiz
// kilitleyebilirdi.
const PENCERE_DK = 60;
const EPOSTA_SINIR = 5;
const IP_SINIR = 20;

async function sinirAsildiMi(eposta, ip) {
    const esik = new Date(Date.now() - PENCERE_DK * 60 * 1000).toISOString();
    try {
        const { count: epostaAdet } = await supabase
            .from('parola_belirleme_log').select('*', { count: 'exact', head: true })
            .eq('eposta', eposta).neq('sonuc', 'limit').gte('zaman', esik);
        if ((epostaAdet || 0) >= EPOSTA_SINIR) return true;

        if (ip) {
            const { count: ipAdet } = await supabase
                .from('parola_belirleme_log').select('*', { count: 'exact', head: true })
                .eq('ip', ip).neq('sonuc', 'limit').gte('zaman', esik);
            if ((ipAdet || 0) >= IP_SINIR) return true;
        }
    } catch (err) {
        // Sayaç okunamazsa akışı DURDURMA: meşru kişinin girişini engellemek,
        // sınırı bir istek boyu kaçırmaktan daha kötü.
        console.error('[parola] sınır sayacı okunamadı:', err.message);
    }
    return false;
}

async function logla(kayit) {
    // Log yazılamazsa akış DURMAZ: kişinin girişini engellemek log'dan önemli.
    try {
        await supabase.from('parola_belirleme_log').insert(kayit);
    } catch (err) {
        console.error('[parola] log yazılamadı:', err.message);
    }
}

router.post('/belirle', parolaLimiti, asyncHandler(async (req, res) => {
    const eposta = String(req.body?.email ?? '').trim().toLowerCase();
    const parola = String(req.body?.password ?? '');
    const ip = req.headers?.['cf-connecting-ip'] || req.headers?.['x-forwarded-for'] || null;

    // Girdiye dair hata — hesabın varlığı hakkında bilgi vermez.
    if (!eposta || !parola) return res.status(400).json({ error: 'E-posta ve parola zorunludur' });
    if (parola.length < EN_AZ) {
        return res.status(400).json({ error: `Parola en az ${EN_AZ} karakter olmalıdır` });
    }

    const GENEL = { error: 'Parola belirlenemedi' };

    // Sınır kontrolü PAHALI İŞLERDEN ÖNCE: tumKullanicilar() tüm dizini çekiyor.
    if (await sinirAsildiMi(eposta, ip)) {
        await logla({ eposta, uid: null, sonuc: 'limit', ip });
        return res.status(429).json({ error: 'Çok fazla deneme yapıldı, bir süre sonra tekrar deneyin' });
    }

    const kullanici = (await tumKullanicilar()).find((u) => (u.email || '').toLowerCase() === eposta);
    if (!kullanici) {
        await logla({ eposta, uid: null, sonuc: 'hesap_yok', ip });
        return res.status(400).json(GENEL);
    }

    const { data: kayit, error } = await supabase
        .from('kullanici_sube').select('parola_kuruldu').eq('uid', kullanici.id).maybeSingle();
    if (error) throw new Error(`kullanıcı kaydı okunamadı: ${error.message}`);

    // Kaydı olmayan (eski/eksik) hesaplar sahiplenilemez — varsayılan "kurulu".
    if (!kayit || kayit.parola_kuruldu !== false) {
        await logla({ eposta, uid: kullanici.id, sonuc: 'zaten_kurulu', ip });
        return res.status(400).json(GENEL);
    }

    await kullaniciGuncelle(kullanici.id, { password: parola });

    const { error: bayrakHatasi } = await supabase.from('kullanici_sube')
        .update({ parola_kuruldu: true }).eq('uid', kullanici.id);
    if (bayrakHatasi) {
        // Parola yazıldı ama bayrak yazılamadı: hesap ikinci kez sahiplenilebilir
        // kalır. Sessiz geçmek yerine gürültü çıkar.
        console.error(`[parola] BAYRAK YAZILAMADI ${eposta}: ${bayrakHatasi.message}`);
    }

    await logla({ eposta, uid: kullanici.id, sonuc: 'belirlendi', ip });
    console.log(`🔑 ${eposta}: ilk giriş parolası belirlendi`);
    res.json({ belirlendi: true });
}));

export default router;
