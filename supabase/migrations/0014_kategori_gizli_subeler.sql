-- 0014_kategori_gizli_subeler.sql — kategoriyi şube bazında gizleme
--
-- NEDEN: Gizleme bugüne kadar YALNIZCA ürün seviyesindeydi (`urun_sube.gizli`).
-- Bir kategoriyi bir şubeden saklamak için o kategorideki her ürünü tek tek
-- işaretlemek gerekiyordu — Kahvaltılık/Börek/Diğer için bu 802 satırlık bir
-- betik oldu (bkz. scripts/gecis/kategori-sube-kisitla.mjs). Panelden elle
-- yapılabilir bir iş değildi ve kategoriye sonradan eklenen ürün kuralın
-- dışında kalıyordu.
--
-- Bu kolon kuralı kategoriye taşır: listedeki şubeler kategoriyi ve içindeki
-- TÜM ürünleri görmez — sonradan eklenen ürünler dahil. Ürün seviyesindeki
-- `urun_sube.gizli` kaldırılmadı; ikisi birlikte çalışır (biri yeterse gizli).
--
-- Şube kodları metin dizisi olarak tutuluyor: `urunler.gizli_subeler` zaten
-- aynı biçimde (urun_sube satırlarından türetilen dizi) taşınıyor, arayüz de
-- aynı `SubeCokluSecici` bileşenini kullanıyor.

alter table kategoriler
  add column if not exists gizli_subeler text[] not null default '{}';
