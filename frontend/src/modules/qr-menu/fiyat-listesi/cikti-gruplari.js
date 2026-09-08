/**
 * Çıktı grubu: kategori → "tatlı" mı "diğer" mi.
 *
 * LED, pleksi ve A5 çıktıları iki ayrı kâğıda basılıyor (ön yüz tatlılar,
 * arka yüz içecekler/diğer); çizim motoru ürünü bu gruba göre süzüyor.
 * A4'te kullanılmaz — orada hepsi tek sayfada.
 *
 * NEDEN VERİTABANI KOLONU DEĞİL: 14 kategori var, ayrım tartışmasız
 * ("Şerbetli Baklavalar" tatlı, "Soğuk İçecekler" değil) ve yılda bir bile
 * değişmiyor. Kolon açmak, migration + Kategoriler ekranına bir alan +
 * merkezin her yeni kategoride doğru seçmesi demekti; kazancı yok.
 *
 * BEDELİ ŞU: merkez YENİ bir kategori açarsa burada karşılığı olmadığı için
 * "diğer"e düşer ve kimse fark etmez. Kategori eklerken bu liste de
 * güncellenmeli. Kategoriler ekranındaki grup rozeti bunu görünür kılıyor —
 * yeni kategori orada "Diğer" olarak durur.
 *
 * Eşleme AD üzerinden, id üzerinden değil: id'ler rastgele dizeler, listeyi
 * insan okuyup düzeltebilmeli. Karşılaştırma Türkçe küçük harfle yapılır
 * (I/İ tuzağı).
 */
const TATLI_KATEGORILER = [
    'Soğuk Kadayıf',
    'Şerbetli Kadayıf',
    'Soğuk Baklava',
    'Şerbetli Baklavalar',
    'Dondurmalar',
    'Cup Tatlılar',
    'San Sebastian',
    'Magnum',
    'Çikolatalar',
];

const anahtar = (ad) => String(ad || '').trim().toLocaleLowerCase('tr');

const TATLI = new Set(TATLI_KATEGORILER.map(anahtar));

/**
 * @param {string} kategoriAdi
 * @returns {'dessert' | 'other'} — motorun beklediği değerler
 */
export function ciktiGrubu(kategoriAdi) {
    return TATLI.has(anahtar(kategoriAdi)) ? 'dessert' : 'other';
}

/** Ekranda göstermek için Türkçe etiket. */
export function ciktiGrubuAdi(kategoriAdi) {
    return ciktiGrubu(kategoriAdi) === 'dessert' ? 'Tatlı' : 'Diğer';
}
