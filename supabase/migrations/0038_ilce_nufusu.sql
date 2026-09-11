-- İlçe nüfusu — "Bölgeniz" kartındaki boş alan.
--
-- 0026 tabloyu açarken nüfus/yaş/eğitim kolonlarını TÜİK ADNKS için ayırmıştı
-- ama veri hiç yüklenmemişti; kart yalnızca SEGE sırasını gösteriyor, sağ yarısı
-- boş duruyordu.
--
-- KAYNAK RESMÎ TÜİK YAYINI DEĞİL: açık veri derlemesi (turkiyeapi.dev, 973
-- ilçe). Rakamlar TÜİK ADNKS'den türemiş görünüyor (Türkiye toplamı 86,1 milyon)
-- ama YAYIN YILI DOĞRULANAMADI. Bu yüzden ekrandaki etiket "TÜİK" demiyor,
-- "açık veri derlemesi" diyor — kartın altındaki kaynak satırı şube sahibinin
-- "bu sayı nereden geliyor" sorusunu doğru cevaplamalı. Resmî ADNKS tablosu
-- elimize geçtiğinde üzerine yazılıp etiket düzeltilecek.
--
-- YAŞ VE EĞİTİM HÂLÂ BOŞ: derlemede yok. O kolonlar 0026'daki gibi bekliyor.

-- İki ilçe adı SEGE tablosunda resmî listeden FARKLI yazılmış. Ad tek ortak
-- anahtar olduğu için (bkz. 0026) bu iki ilçede demografi araması sessizce
-- boş dönüyordu; oraya şube açılsa "bölge bilgisi yok" derdi.
update public.ilce_demografi set ilce = 'Bahşılı'
  where il = 'Kırıkkale' and ilce = 'Bahşili';
update public.ilce_demografi set ilce = '19 Mayıs'
  where il = 'Samsun' and ilce = 'Ondokuzmayıs';

comment on column public.ilce_demografi.nufus is
  'İlçe nüfusu. Kaynak: açık veri derlemesi (turkiyeapi.dev), TÜİK ADNKS türevi; yayın yılı doğrulanmadı. Resmî ADNKS tablosu geldiğinde güncellenecek.';
