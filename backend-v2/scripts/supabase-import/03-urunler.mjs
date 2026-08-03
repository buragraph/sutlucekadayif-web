// urunler + urun_sube — 537 ürün, beş şube dizisi tek tabloya iner.
//
// menude_subeler → menude=true, gizli_subeler → gizli=true,
// mevcut_degil → mevcut_degil=true, fiyat_override[sube] → kolon,
// fiyat_serbest (dizi) → boolean. Bir şube birden çok dizide geçebildiği için
// satırlar (urun_id, sube_kod) anahtarında BİRLEŞTİRİLİR — tek upsert.
//
// Satır üreticileri dışa açık: dogrula.mjs aynı dönüşümü kullanıp karşılaştırıyor
// (kural iki yerde ayrı yazılırsa zamanla ayrışır).
import { db, upsert, rapor, uyari, metin, sayi, zaman, dizi, bosNull, subeKodlari, dogrudanMi } from './ortak.mjs';

/** Firestore ürün dokümanı → urunler satırı */
export function urunSatiri(id, v) {
    return {
        id,
        ad: metin(v.ad ?? ''),
        fiyat: sayi(v.fiyat) ?? 0,
        kategori_id: metin(v.kategori ?? null),
        aciklama: metin(v.aciklama ?? ''),
        etiket: dizi(v.etiket).map(String),
        gorsel: metin(v.gorsel ?? ''),
        miktar: sayi(v.miktar),
        birim: metin(v.birim ?? ''),
        kalori: sayi(v.kalori),
        tur: metin(v.tur ?? 'ortak'),
        sube_kod: v.tur === 'sube_ozel' ? bosNull(v.sube_kod ?? v.sube) : null,
        kilitli: typeof v.kilitli === 'boolean' ? v.kilitli : null,
        silinme: zaman(v.deletedAt),
        olusturma: zaman(v.createdAt),
    };
}

/**
 * Ürün dokümanlarındaki beş diziyi (urun_id, sube_kod) anahtarında birleştirir.
 * @returns {{ satirlar: object[], bilinmeyenSubeler: Set<string> }}
 */
export function uyelikSatirlari(docs, subeler) {
    const uyeMap = new Map();
    const bilinmeyenSubeler = new Set();

    const uye = (urunId, subeKod) => {
        if (!subeler.has(subeKod)) { bilinmeyenSubeler.add(subeKod); return null; }
        const anahtar = `${urunId} ${subeKod}`;
        let s = uyeMap.get(anahtar);
        if (!s) {
            s = {
                urun_id: urunId, sube_kod: subeKod,
                menude: false, gizli: false, mevcut_degil: false,
                fiyat_override: null, fiyat_serbest: false,
            };
            uyeMap.set(anahtar, s);
        }
        return s;
    };

    for (const doc of docs) {
        const v = doc.data();
        for (const s of dizi(v.menude_subeler)) { const r = uye(doc.id, s); if (r) r.menude = true; }
        for (const s of dizi(v.gizli_subeler)) { const r = uye(doc.id, s); if (r) r.gizli = true; }
        for (const s of dizi(v.mevcut_degil)) { const r = uye(doc.id, s); if (r) r.mevcut_degil = true; }
        for (const s of dizi(v.fiyat_serbest)) { const r = uye(doc.id, s); if (r) r.fiyat_serbest = true; }
        for (const [s, fiyat] of Object.entries(v.fiyat_override || {})) {
            const r = uye(doc.id, s);
            if (r) r.fiyat_override = sayi(fiyat);
        }
    }

    return { satirlar: [...uyeMap.values()], bilinmeyenSubeler };
}

export default async function calistir() {
    const [snap, subeler] = await Promise.all([db.collection('ortak_urunler').get(), subeKodlari()]);

    const urunler = snap.docs.map((doc) => urunSatiri(doc.id, doc.data()));
    const { satirlar: uyeler, bilinmeyenSubeler } = uyelikSatirlari(snap.docs, subeler);

    // Kategori FK'sı: kaynakta olmayan kategoriye işaret eden ürün varsa upsert
    // patlar — önce tespit edip raporla, kategori_id'yi null'a düşür.
    const katIds = new Set((await db.collection('kategoriler').select().get()).docs.map((d) => d.id));
    let kopukKategori = 0;
    for (const u of urunler) {
        if (u.kategori_id && !katIds.has(u.kategori_id)) { u.kategori_id = null; kopukKategori++; }
        // olusturma NOT NULL — kaynakta createdAt yoksa import anı yazılır.
        if (!u.olusturma) u.olusturma = new Date().toISOString();
    }

    await upsert('urunler', urunler, 'id');
    await upsert('urun_sube', uyeler, 'urun_id,sube_kod');

    if (bilinmeyenSubeler.size) uyari(`Dizilerde subeler'de olmayan şube kodu: ${[...bilinmeyenSubeler].join(', ')}`);

    rapor('urunler + urun_sube', {
        'firestore dokümanı': snap.size,
        'yazılan ürün': urunler.length,
        'soft-delete (silinme dolu)': urunler.filter((u) => u.silinme).length,
        'yazılan urun_sube satırı': uyeler.length,
        '  menude': uyeler.filter((u) => u.menude).length,
        '  gizli': uyeler.filter((u) => u.gizli).length,
        '  mevcut_degil': uyeler.filter((u) => u.mevcut_degil).length,
        '  fiyat_override': uyeler.filter((u) => u.fiyat_override != null).length,
        '  fiyat_serbest': uyeler.filter((u) => u.fiyat_serbest).length,
        'atlanan bilinmeyen şube': bilinmeyenSubeler.size,
        'kategorisi kopuk ürün (null yapıldı)': kopukKategori,
    });
    return { yazilan: urunler.length, uyeSatiri: uyeler.length };
}

if (dogrudanMi(import.meta.url)) await calistir();
