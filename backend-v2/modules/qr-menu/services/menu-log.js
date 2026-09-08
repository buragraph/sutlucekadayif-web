import { supabase } from '../../../config/supabase.js';

/**
 * Menü günlüğü yazımı — "kim, hangi şubede, neyi değiştirdi".
 *
 * TASARIM KARARLARI
 * - TEK INSERT: kaç ürün değişirse değişsin bir alt-istek. Ücretsiz planda
 *   çağrı başına 50 alt-istek var; toplu menü işlemi 400 ürüne kadar
 *   çıkabiliyor, satır başına yazsak bütçe tek başına buraya giderdi.
 * - HATA YUTULUR: günlük yazılamadı diye asıl işlem geri alınmaz ve kullanıcı
 *   hata görmez. Günlük ikincil kayıt; şubenin ürünü kapatmasını
 *   engellemesi kabul edilebilir bir bedel değil. (Konsola düşer.)
 * - AKTÖR ≠ ŞUBE: `sube_kod` menüsü DEĞİŞEN şube, `kullanici`/`rol` işlemi
 *   YAPAN kişi. Admin bir şube adına işlem yapabildiği için ikisi ayrı
 *   (bkz. Ürünler sayfasındaki şube seçici).
 *
 * @param {object} req       — aktör `req.user`dan okunur
 * @param {string|null} subeKod — menüsü değişen şube; tek işlem tek şubeyi
 *   etkilediğinde buradan verilir. Bir işlem birden çok şubeyi etkiliyorsa
 *   (ör. bir ürünün tüm şube fiyatlarını sıfırlamak) null geçilir ve şube
 *   kaydın kendi `sube_kod` alanından gelir.
 * @param {Array}  kayitlar  — { urun_id, urun_ad, islem, eski, yeni, sube_kod? }
 */
export async function menuLogYaz(req, subeKod, kayitlar) {
    if (!Array.isArray(kayitlar) || kayitlar.length === 0) return;
    const u = req?.user || {};
    const satirlar = kayitlar.map((k) => ({
        kullanici: u.uid || null,
        kullanici_eposta: u.email || null,
        rol: u.role || null,
        sube_kod: k.sube_kod || subeKod,
        urun_id: k.urun_id ?? null,
        urun_ad: k.urun_ad ?? null,
        islem: k.islem,
        // undefined JSON'a girmiyor; "değer yoktu" ile "alan yok" ayrımı için null.
        eski: k.eski === undefined ? null : k.eski,
        yeni: k.yeni === undefined ? null : k.yeni,
    }));
    // Şubesi olmayan kayıt yazılmaz: sube_kod NOT NULL, tek eksik satır
    // insert'in TAMAMINI düşürür ve o işlemin günlüğü büsbütün kaybolurdu.
    const gecerli = satirlar.filter((x) => x.sube_kod);
    if (gecerli.length === 0) return;
    const { error } = await supabase.from('menu_log').insert(gecerli);
    if (error) console.error('menu_log yazılamadı:', error.message);
}
