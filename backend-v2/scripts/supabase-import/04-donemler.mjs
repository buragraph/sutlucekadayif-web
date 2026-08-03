// donemler — collectionGroup ile 874 doküman, 4'ü öksüz (aşağıda), 870 satır yazılır.
//
// ALAN ÖNCELİĞİ: hem bütçe hem metrik kolonları `veri_overrides` varsa ORADAN,
// yoksa top-level alandan. Eski okuma yolu (report-data.js:58) da böyle
// davranıyordu — panelde görünen rakam bire bir korunsun diye kural aynen taşındı.
// Override kavramı burada BİTER: kolon tek doğru kaynak, sonraki çekimler onu
// serbestçe tazeler ("donmuş override" sınıfı yapısal olarak ölür).
import { db, upsert, rapor, uyari, sayi, tarih, zaman, subeKodlari, dogrudanMi } from './ortak.mjs';

/** veri_overrides anahtarı → Postgres kolonu */
export const ALAN_ESLEME = {
    // Bütçe (elle girilen)
    planlananButce: 'planlanan_butce',
    devredilenMiktar: 'devredilen_miktar',
    merkezDestegi: 'merkez_destegi',
    // Meta metrikleri
    toplamHarcama: 'harcama',
    toplamErisim: 'erisim',
    toplamGosterim: 'gosterim',
    toplamSonuc: 'sonuc',
    toplamTiklama: 'tiklama',
    toplamTiklamaTumu: 'tiklama_tumu',
    toplamMesaj: 'mesaj',
    toplamYorum: 'yorum',
    toplamPaylasim: 'paylasim',
    // Google metrikleri
    googleArama: 'google_arama',
    googleHarita: 'google_harita',
    googleTelefon: 'google_telefon',
    googleYolTarifi: 'google_yol_tarifi',
    googleWebTiklama: 'google_web_tiklama',
    googleMenuTiklama: 'google_menu_tiklama',
};

const KOLONLAR = [
    'harcama', 'erisim', 'gosterim', 'tiklama', 'tiklama_tumu', 'mesaj', 'paylasim',
    'sonuc', 'yorum', 'google_arama', 'google_harita', 'google_menu_tiklama',
    'google_telefon', 'google_web_tiklama', 'google_yol_tarifi',
    'planlanan_butce', 'devredilen_miktar', 'merkez_destegi',
];

// Eski slug kalıntısı: bu şubelerin dönemleri yeni slug altında zaten var,
// üst dokümanları subeler koleksiyonunda YOK. Atlanır ve raporlanır.
export const BEKLENEN_OKSUZ = ['ankaraeryaman', 'ankaraetimesgut', 'kocaeli', 'milletmah'];

/** Firestore dönem dokümanı → Supabase satırı (override ?? top-level). */
export function donemSatiri(subeKod, v) {
    const ov = v.veri_overrides || {};
    const satir = {
        sube_kod: subeKod,
        baslangic: tarih(v.donem_baslangic),
        bitis: tarih(v.donem_bitis),
        guncelleme: zaman(v.updatedAt) ?? new Date().toISOString(),
    };
    for (const kolon of KOLONLAR) satir[kolon] = null;
    for (const [ovAnahtar, kolon] of Object.entries(ALAN_ESLEME)) {
        satir[kolon] = sayi(ov[ovAnahtar] ?? v[kolon]);
    }
    return satir;
}

/** collectionGroup taraması: { satirlar, oksuzler } */
export async function donemleriTopla() {
    const [snap, subeler] = await Promise.all([db.collectionGroup('donemler').get(), subeKodlari()]);

    const satirlar = [];
    const oksuzler = [];
    for (const doc of snap.docs) {
        const subeKod = doc.ref.parent.parent?.id;
        if (!subeKod || !subeler.has(subeKod)) {
            oksuzler.push(`${subeKod}/${doc.id}`);
            continue;
        }
        satirlar.push(donemSatiri(subeKod, doc.data()));
    }
    return { toplamDokuman: snap.size, satirlar, oksuzler };
}

export default async function calistir() {
    const { toplamDokuman, satirlar, oksuzler } = await donemleriTopla();

    const oksuzSubeler = [...new Set(oksuzler.map((o) => o.split('/')[0]))].sort();
    const beklenen = [...BEKLENEN_OKSUZ].sort();
    if (JSON.stringify(oksuzSubeler) !== JSON.stringify(beklenen)) {
        uyari(`Öksüz şube listesi beklenenden farklı!\n   beklenen: ${beklenen.join(', ')}\n   bulunan : ${oksuzSubeler.join(', ') || '(yok)'}`);
    }

    // Aynı (sube_kod, baslangic, bitis) tek batch'te iki kez gelirse Postgres
    // "cannot affect row a second time" der — doküman id'si zaten bu üçlüden
    // türediği için beklenmiyor, yine de tekilleştirip raporluyoruz.
    const tekil = new Map(satirlar.map((s) => [`${s.sube_kod} ${s.baslangic} ${s.bitis}`, s]));
    const yazilacak = [...tekil.values()];

    await upsert('donemler', yazilacak, 'sube_kod,baslangic,bitis');

    rapor('donemler', {
        'collectionGroup dokümanı': toplamDokuman,
        'yazılan satır': yazilacak.length,
        'ATLANAN öksüz kayıt': `${oksuzler.length} → ${oksuzler.join(', ') || '(yok)'}`,
        'öksüz şubeler beklenenle aynı mı': JSON.stringify(oksuzSubeler) === JSON.stringify(beklenen) ? 'evet' : 'HAYIR — yukarı bak',
        'tekrar eden dönem anahtarı': satirlar.length - yazilacak.length,
        'harcama toplamı (yazılan)': yazilacak.reduce((t, s) => t + (s.harcama || 0), 0).toFixed(2),
    });
    return { yazilan: yazilacak.length, atlanan: oksuzler.length };
}

if (dogrudanMi(import.meta.url)) await calistir();
