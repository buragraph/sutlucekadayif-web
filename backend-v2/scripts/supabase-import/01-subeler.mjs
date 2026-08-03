// subeler — 88 kayıt.
// il/ilce/lat/lng şube dokümanlarının çoğunda YOK; eksikleri tek `reports/konumlar`
// dokümanındaki listeden doldururuz (konumlar ayrı tablo olarak taşınmıyor).
// Taşınmayanlar: donem_ozetleri, donem_sayisi, son_donem, toplam_* → view'lardan gelir.
import { db, upsert, rapor, metin, sayi, dogrudanMi } from './ortak.mjs';

export default async function calistir() {
    const [subeSnap, konumSnap] = await Promise.all([
        db.collection('subeler').get(),
        db.collection('reports').doc('konumlar').get(),
    ]);

    const konumlar = new Map();
    for (const k of konumSnap.data()?.liste || []) {
        if (k?.slug) konumlar.set(k.slug, k);
    }

    let konumdanIl = 0, konumdanKoordinat = 0;
    const satirlar = subeSnap.docs.map((doc) => {
        const v = doc.data();
        const k = konumlar.get(doc.id) || {};
        if (v.il == null && k.il) konumdanIl++;
        if (v.lat == null && k.lat != null) konumdanKoordinat++;
        return {
            kod: doc.id,
            ad: metin(v.ad ?? k.ad ?? doc.id),
            il: metin(v.il ?? k.il ?? null),
            ilce: metin(v.ilce ?? k.ilce ?? null),
            adres: metin(v.adres ?? ''),
            // Alan HİÇ yoksa null (57/88 şubede var): eski API o şubeyi `link`
            // anahtarı olmadan döndürüyordu — parite için ayrım korunur.
            link: v.link === undefined ? null : metin(v.link),
            telefon: metin(v.telefon ?? ''),
            fatura_adresi: metin(v.fatura_adresi ?? null),
            sirket_tipi: metin(v.sirket_tipi ?? null),
            vkn: metin(v.vkn ?? null),
            yetkili_adi: metin(v.yetkili_adi ?? null),
            lat: sayi(v.lat ?? k.lat),
            lng: sayi(v.lng ?? k.lng),
        };
    });

    await upsert('subeler', satirlar, 'kod');

    // NOT: il/ilçe iki kaynakta da eksik — şube dokümanlarının 21'inde alan var
    // (7'si dolu), konumlar listesinin de yalnızca 7 girdisinde il yazıyor.
    // Import kaybettirmiyor; veri zaten böyle. Koordinat tarafı konumlar
    // listesinden ciddi biçimde zenginleşiyor.
    const ilsiz = satirlar.filter((s) => !s.il).length;
    rapor('subeler', {
        'firestore dokümanı': subeSnap.size,
        'yazılan satır': satirlar.length,
        'il konumlar listesinden dolduruldu': konumdanIl,
        'lat/lng konumlar listesinden dolduruldu': konumdanKoordinat,
        'il bilgisi iki kaynakta da yok': ilsiz,
        'koordinatı olan şube': satirlar.filter((s) => s.lat != null).length,
    });
    return { yazilan: satirlar.length };
}

if (dogrudanMi(import.meta.url)) await calistir();
