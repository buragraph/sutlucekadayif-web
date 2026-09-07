/**
 * Geçerli ürün etiketi anahtarları — SUNUCU tarafı doğrulama listesi.
 *
 * Etiketin görünen adı/rengi/emojisi frontend'de
 * (frontend/src/modules/qr-menu/constants/etiketler.js) — burada YALNIZCA
 * anahtarlar var, sunucunun görünüme ihtiyacı yok.
 *
 * NEDEN SUNUCUDA DA VAR: şube sahibi kendi etiketlerini yazabiliyor
 * (PUT /products/:id/etiket). Doğrulanmasaydı serbest metin yazılabilir ve
 * müşteri menüsünde ham anahtar olarak görünürdü. Admin'in yazdığı
 * `urunler.etiket` bu listeye takılmaz — merkez zaten arayüzden seçiyor ve
 * geçmiş kayıtlar bozulmasın.
 *
 * DİKKAT: frontend listesine yeni etiket eklenirse buraya da eklenmeli, yoksa
 * şube o etiketi seçtiğinde sessizce düşer.
 */
export const ETIKET_ANAHTARLARI = [
    'en_cok_satan',
    'en_yeni',
    'en_cok_begenilen',
    'ayin_favorisi',
    'haftanin_tercihi',
    'gunun_tercihi',
    'ustanin_secimi',
    'storyye_atmalik',
];
