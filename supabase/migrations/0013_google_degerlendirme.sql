-- 0013_google_degerlendirme.sql — şube başına Google değerlendirme adresi
--
-- NEDEN: QR menüdeki "Bizi Değerlendirin" butonu koda gömülü TEK bir adrese
-- gidiyordu (`g.page/r/sutlucekadayif/review`) ve o kısa link mevcut değil —
-- tıklayan müşteri Google ana sayfasına düşüyordu. Doğru çalışsa bile 90 şubenin
-- hepsi aynı işletmeyi değerlendirmiş olurdu; Google'da değerlendirme adresi
-- konum başına ayrıdır.
--
-- Adres Google'dan geliyor (`locations.metadata.newReviewUri`), elle girilmiyor;
-- şube-konum eşleşmesi zaten `eslesmeler` tablosunda (tur='google') duruyor.
-- Burada yalnızca menü JSON'ına gömülebilsin diye şube satırında saklanıyor —
-- müşteri menüsü Google API'sine çıkamaz.
--
-- Boş kalırsa buton HİÇ gösterilmez: bozuk bir linke göndermektense butonu
-- göstermemek doğru davranış.

alter table subeler
  add column if not exists google_degerlendirme_link text;
