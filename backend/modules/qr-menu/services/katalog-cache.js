import { db } from '../../../config/firebase.js';
import admin from 'firebase-admin';

/**
 * Ortak ürün katalogunun sürümlü bellek cache'i.
 *
 * Katalog TÜM şubeler için aynı veriden üretilir; farklılaşma yalnızca sunum
 * katmanındadır (hangi ürün o şubenin menüsünde, hangisi gizli, fiyatı ne).
 * Bu yüzden Firestore'dan bir kez okunur, kullanıcıya özel filtre ve projeksiyon
 * bellekteki kopya üzerinde uygulanır.
 *
 * HTTP yanıtını cache'lemek burada İŞE YARAMAZ: versionedCacheMiddleware cache
 * anahtarına şube slug'ını katar (farklı şubeye farklı yanıt gittiği için doğru
 * davranış), dolayısıyla her şube kendi kaydını doldurur ve okuma 88 kez tekrar
 * ederdi. Kazanç ancak VERİYİ paylaşmakla gelir.
 *
 * Doğruluk TTL'e değil sürüme bağlıdır: katalogu değiştiren her yazma
 * `bumpKatalogVersion()` çağırır, sürüm artar, tüm instance'ların kopyası aynı
 * anda geçersizleşir. Cloud Run çok instance çalıştırdığı için instance-lokal
 * TTL tek başına bayat veri bırakırdı.
 */
const VERSION_REF = db.collection('ayarlar').doc('qr_menu_version');

// Sürüm okuması da bir Firestore okumasıdır; mikro-cache olmasa her istek
// 1 okuma ederdi. 10 sn bayatlık katalogda hissedilmez.
const VERSION_TTL_MS = 10_000;
let versionCache = { v: null, t: 0 };

export async function getKatalogVersion() {
    if (versionCache.v !== null && Date.now() - versionCache.t < VERSION_TTL_MS) {
        return versionCache.v;
    }
    const doc = await VERSION_REF.get();
    const v = doc.exists ? (doc.data().v || 0) : 0;
    versionCache = { v, t: Date.now() };
    return v;
}

/** Katalogu değiştiren her yazma sonrası çağrılır (ürün ekle/düzenle/sil/menü). */
export async function bumpKatalogVersion() {
    try {
        await VERSION_REF.set({ v: admin.firestore.FieldValue.increment(1) }, { merge: true });
        versionCache = { v: null, t: 0 };   // bu instance kendi yazdığını hemen görsün
        katalogCache = { v: null, urunler: null };
    } catch (err) {
        // Sürüm artırılamazsa cache bayat kalır ama veri bozulmaz; istek başarısız sayılmaz
        console.error('[KatalogCache] Sürüm artırılamadı:', err.message);
    }
}

let katalogCache = { v: null, urunler: null };

/**
 * Silinmemiş ortak ürünlerin tamamı — ham hâliyle, projeksiyon UYGULANMADAN.
 *
 * DİKKAT: Dönen nesneler `fiyat_override`, `gizli_subeler`, `menude_subeler`
 * gibi yönetim alanlarını taşır. Çağıran taraf istemciye vermeden önce
 * `yanitProjeksiyonu()`'ndan geçirmek zorundadır.
 */
export async function getKatalogUrunleri() {
    const v = await getKatalogVersion();
    if (katalogCache.v === v && katalogCache.urunler) return katalogCache.urunler;

    const snap = await db.collection('ortak_urunler').get();
    const urunler = snap.docs
        .map((d) => ({ id: d.id, tur: 'ortak', ...d.data() }))
        .filter((u) => !u.deletedAt);

    katalogCache = { v, urunler };
    console.log(`[KatalogCache] katalog okundu: ${urunler.length} ürün (sürüm ${v})`);
    return urunler;
}
