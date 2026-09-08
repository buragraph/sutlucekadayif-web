import illerIlceler from '@/data/tr-iller-ilceler.json';

/**
 * Serbest metin adresten il ve ilçeyi çıkarır.
 *
 * NEDEN TAHMİN DEĞİL EŞLEŞTİRME: elimizde 81 ilin resmî ilçe listesi zaten var
 * (`tr-iller-ilceler.json`, aynı dosya form seçicilerini de besliyor). Metinde
 * bu adları arıyoruz; uydurma bir ayrıştırma yok, sonuç ya listedeki gerçek bir
 * ilçedir ya da boştur.
 *
 * SONA YAKIN OLAN KAZANIR: Türkçe adres "mahalle → cadde → ilçe → il" diye
 * daralır, yani il en sonda geçer. "Sanayi Mahallesi ... İzmit Kocaeli"de hem
 * "Sanayi" hem "İzmit" geçiyor; sondan bakmak doğru olanı seçiyor.
 *
 * TUZAK — İÇ İÇE ADLAR: "Antalya" hem il hem (Muratpaşa'nın içinde) yaygın bir
 * kelime; "Merkez" ise 40'tan fazla ilde ilçe adı. Bu yüzden ilçe YALNIZCA
 * bulunan ilin kendi listesinde aranıyor.
 */

// Türkçe karşılaştırma: harf/rakam dışındaki her şey boşluğa çevrilir ki
// "No:32/A Altındağ/Ankara" ile "Altındağ Ankara" aynı biçime insin.
const sadelestir = (s) => ` ${String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/[^a-zçğıöşü0-9]+/gi, ' ')
    .trim()} `;

/** `metin` içinde `ad` tam sözcük olarak geçiyorsa son geçtiği konum, yoksa -1. */
function sonKonum(metin, ad) {
    const hedef = ` ${sadelestir(ad).trim()} `;
    return metin.lastIndexOf(hedef);
}

/**
 * @param {string} adres
 * @returns {{ il: string, ilce: string, guven: 'yuksek'|'dusuk'|'yok' }}
 *   guven: il+ilçe birlikte bulunduysa 'yuksek', yalnız il bulunduysa 'dusuk'.
 */
export function adrestenIlIlce(adres) {
    const metin = sadelestir(adres);
    if (metin.trim().length < 4) return { il: '', ilce: '', guven: 'yok' };

    let il = '';
    let ilKonum = -1;
    for (const aday of Object.keys(illerIlceler)) {
        const k = sonKonum(metin, aday);
        if (k > ilKonum) { il = aday; ilKonum = k; }
    }
    if (!il) return { il: '', ilce: '', guven: 'yok' };

    let ilce = '';
    let ilceKonum = -1;
    for (const aday of illerIlceler[il] || []) {
        const k = sonKonum(metin, aday);
        // İlçe adı ilin KENDİSİNDEN önce geçmeli; "Kocaeli" yazan yerde
        // "Kocaeli" ilçesi yok ama il adı ilçe listesinde geçen iller var.
        if (k > ilceKonum && k < ilKonum) { ilce = aday; ilceKonum = k; }
    }

    // İlçe il adından SONRA yazılmışsa (ör. "İstanbul Kadıköy") yukarıdaki
    // konum kuralı eler; bu kez sıra gözetmeden ara.
    if (!ilce) {
        for (const aday of illerIlceler[il] || []) {
            const k = sonKonum(metin, aday);
            if (k > ilceKonum) { ilce = aday; ilceKonum = k; }
        }
    }

    return { il, ilce, guven: ilce ? 'yuksek' : 'dusuk' };
}
