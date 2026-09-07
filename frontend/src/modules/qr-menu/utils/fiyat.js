/**
 * Fiyat gösterimi — küsuratlı fiyatlar için tek kaynak.
 *
 * SORUN: fiyat her yerde `Math.round()` ile basılıyordu. Veritabanı (numeric)
 * ve backend küsuratı zaten taşıyordu, yani 12,5 kaydediliyor ama ekranda 13
 * görünüyordu — kullanıcı "küsurat girilemiyor" sanıyordu.
 *
 * Kural: küsurat VARSA göster, yoksa gösterme. 170 → "170", 12.5 → "12,5".
 * Türkçe yerelleştirme ondalık ayırıcıyı virgül, binlik ayırıcıyı nokta yapar
 * (1500 → "1.500").
 */
export function fiyatYaz(deger) {
    const n = Number(deger);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Sayı input'una konacak ham değer. `fiyatYaz` KULLANILMAZ: <input type=number>
 * virgüllü/binlik ayırıcılı metni kabul etmez, alan boş görünür.
 */
export function fiyatGirdi(deger) {
    const n = Number(deger);
    return Number.isFinite(n) ? String(n) : '';
}
