// Formlar + şube notları — franchise_basvurulari (1), geri_bildirimler (0),
// is_basvurulari (0), sube_notlari (4). Son iki form koleksiyonu henüz hiç kayıt
// almadı; script yine de çalışır (0 satır) ki ilk gönderimden sonra tekrar
// koşulduğunda taşısın.
//
// API'deki `not` alanı kolonlarda admin_notu / notu (bkz. 0003_formlar.sql).
import { db, upsert, rapor, uyari, metin, zaman, dizi, bosNull, subeKodlari, dogrudanMi } from './ortak.mjs';

export default async function calistir() {
    const subeler = await subeKodlari();
    const kopuk = [];
    const subeAlani = (deger, nereden) => {
        const s = bosNull(deger);           // '' → null, yoksa FK patlar
        if (s && !subeler.has(s)) { kopuk.push(`${nereden}: ${s}`); return null; }
        return s;
    };

    // ── franchise_basvurulari ──
    const fbSnap = await db.collection('franchise_basvurulari').get();
    const franchise = fbSnap.docs.map((doc) => {
        const v = doc.data();
        return {
            id: doc.id,
            ad: metin(v.ad ?? null),
            soyad: metin(v.soyad ?? null),
            email: metin(v.email ?? null),
            telefon: metin(v.telefon ?? null),
            il: metin(v.il ?? null),
            ilce: metin(v.ilce ?? null),
            mesaj: metin(v.mesaj ?? null),
            durum: metin(v.durum ?? 'yeni'),
            admin_notu: metin(v.not ?? ''),
            olusturma: zaman(v.olusturmaZamani) ?? new Date().toISOString(),
        };
    });
    await upsert('franchise_basvurulari', franchise, 'id');

    // ── geri_bildirimler ──
    const gbSnap = await db.collection('geri_bildirimler').get();
    const geriBildirim = gbSnap.docs.map((doc) => {
        const v = doc.data();
        return {
            id: doc.id,
            sube_slug: subeAlani(v.subeSlug, `geri_bildirimler/${doc.id}`),
            sube_ad: metin(v.subeAd ?? null),
            kategori: metin(v.kategori ?? null),
            ad: metin(v.ad ?? null),
            soyad: metin(v.soyad ?? null),
            email: metin(v.email ?? null),
            telefon: metin(v.telefon ?? null),
            mesaj: metin(v.mesaj ?? null),
            olay_tarihi: metin(v.olayTarihi ?? null),
            kvkk_onay: v.kvkkOnay === true,
            durum: metin(v.durum ?? 'yeni'),
            admin_notu: metin(v.not ?? ''),
            olusturma: zaman(v.olusturmaZamani) ?? new Date().toISOString(),
        };
    });
    await upsert('geri_bildirimler', geriBildirim, 'id');

    // ── is_basvurulari ──
    const ibSnap = await db.collection('is_basvurulari').get();
    const isBasvuru = ibSnap.docs.map((doc) => {
        const v = doc.data();
        return {
            id: doc.id,
            sube_slug: subeAlani(v.subeSlug, `is_basvurulari/${doc.id}`),
            sube_ad: metin(v.subeAd ?? null),
            ad: metin(v.ad ?? null),
            soyad: metin(v.soyad ?? null),
            dogum_tarihi: metin(v.dogumTarihi ?? null),
            telefon: metin(v.telefon ?? null),
            email: metin(v.email ?? null),
            musaitlik: metin(v.musaitlik ?? null),
            calisma_tipi: metin(v.calismaTipi ?? null),
            beceriler: dizi(v.beceriler).map(String),
            gida_deneyimi: metin(v.gidaDeneyimi ?? null),
            gida_deneyimi_detay: metin(v.gidaDeneyimiDetay ?? null),
            marka_deneyimi: metin(v.markaDeneyimi ?? null),
            halen_calisiyor: metin(v.halenCalisiyor ?? null),
            baslangic_tarihi: metin(v.baslangicTarihi ?? null),
            referans: metin(v.referans ?? null),
            kvkk_onay: v.kvkkOnay === true,
            durum: metin(v.durum ?? 'yeni'),
            admin_notu: metin(v.not ?? ''),
            olusturma: zaman(v.olusturmaZamani) ?? new Date().toISOString(),
        };
    });
    await upsert('is_basvurulari', isBasvuru, 'id');

    // ── sube_notlari (doküman id'si = şube kodu) ──
    const snSnap = await db.collection('sube_notlari').get();
    const notlar = [];
    for (const doc of snSnap.docs) {
        if (!subeler.has(doc.id)) { kopuk.push(`sube_notlari/${doc.id}`); continue; }
        const v = doc.data();
        notlar.push({
            sube_kod: doc.id,
            notu: metin(v.not ?? ''),
            guncelleyen: metin(v.guncelleyen ?? null),
            guncelleme: zaman(v.guncellemeZamani),
        });
    }
    await upsert('sube_notlari', notlar, 'sube_kod');

    if (kopuk.length) uyari(`Formlar: subeler'de olmayan şube referansı → ${kopuk.join(', ')}`);

    rapor('formlar + şube notları', {
        'franchise_basvurulari': `${fbSnap.size} → ${franchise.length}`,
        'geri_bildirimler': `${gbSnap.size} → ${geriBildirim.length}`,
        'is_basvurulari': `${ibSnap.size} → ${isBasvuru.length}`,
        'sube_notlari': `${snSnap.size} → ${notlar.length}`,
        'atlanan kopuk şube referansı': kopuk.length,
    });
    return {
        franchise: franchise.length, geriBildirim: geriBildirim.length,
        isBasvuru: isBasvuru.length, notlar: notlar.length,
    };
}

if (dogrudanMi(import.meta.url)) await calistir();
