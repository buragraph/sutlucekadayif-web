/**
 * Parola kuralları ve geçici parola üretimi.
 *
 * AKIŞ: hesapları merkez açıyor ve geçici bir parola belirliyor. Kişi o parolayla
 * girer, `parola_degistir_gerekli` bayrağı yüzünden panele girer girmez
 * ParolaDegistirKapisi karşısına çıkar ve kendi parolasını belirlemeden ilerleyemez
 * (bkz. routes/profil.js → POST /api/profil/parola).
 *
 * ESKİ AKIŞ KALDIRILDI: hesaplar parolasız açılıp kişinin giriş ekranına yazdığı
 * ilk parola kalıcı yapılıyordu (routes/parola.js). Doğrulaması olmadığı için
 * e-postayı bilen herkes kurulmamış bir hesabı sahiplenebiliyordu; merkez de
 * "parola nedir" sorusuna cevap veremiyordu. Artık parolayı merkez belirliyor.
 */
export const EN_AZ_PAROLA = 8;

// Karıştırılabilir karakterler (0/O, 1/l/I) DIŞARIDA: bu parola telefonda
// okunup elle yazılıyor, "sıfır mı O mu" sorusu doğrudan destek çağrısı demek.
const HARF = 'abcdefghijkmnopqrstuvwxyz';
const BUYUK = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const RAKAM = '23456789';

/**
 * Okunabilir geçici parola üretir (ör. "Kavun-7342").
 * Rastgelelik `crypto.getRandomValues` ile — Math.random() parola üretimi için
 * uygun değil ve Workers'ta da bu API mevcut.
 */
export function geciciParolaUret() {
    const havuz = BUYUK + HARF + RAKAM;
    const bayt = new Uint32Array(12);
    crypto.getRandomValues(bayt);
    // İlk karakter büyük harf, son dördü rakam: her zaman EN_AZ_PAROLA'yı aşar
    // ve "en az bir büyük harf/rakam" isteyen dış kurallara da takılmaz.
    let s = BUYUK[bayt[0] % BUYUK.length];
    for (let i = 1; i < 8; i++) s += havuz[bayt[i] % havuz.length];
    for (let i = 8; i < 12; i++) s += RAKAM[bayt[i] % RAKAM.length];
    return s;
}
