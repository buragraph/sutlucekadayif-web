/**
 * Panel tanıtımının "görüldü" notu.
 *
 * SUNUCUDA DEĞİL, localStorage'da: bu bir tercih ya da kalıcı bir hesap alanı
 * değil, yalnızca "bu tarayıcıda bir kez gösterildi" notu. Kaybolursa en kötü
 * ihtimalle tanıtım bir kez daha çıkar — kolon eklemeye değmez.
 *
 * Her okuma/yazma try/catch içinde: gizli sekmede ve site verisi kapalıyken
 * localStorage'a ERİŞİMİN KENDİSİ hata atıyor.
 */
const anahtar = (uid) => `sk_tanitim_goruldu_${uid || 'anonim'}`;

export function tanitimGoruldu(uid) {
    try { return localStorage.getItem(anahtar(uid)) === '1'; } catch { return false; }
}

export function tanitimGorulduYaz(uid) {
    try { localStorage.setItem(anahtar(uid), '1'); } catch { /* önemsiz */ }
}
