-- 1) Kategori bazlı "menüden çıkarılamaz"
--
-- NEDEN AYRI BİR BAYRAK: `kategoriler.kilitli` zaten var ama başka şey söylüyor
-- — "şube bu kategorideki ürünü DÜZENLEYEMEZ/SİLEMEZ". Menüden çıkarma ayrı bir
-- yetki: merkez, Soğuk Kadayıf gibi çekirdek kategorilerde şubenin ürünü
-- menüden tamamen kaldırmasını istemiyor; şube yalnızca "şu an satışta değil"
-- diyebilmeli (urun_sube.mevcut_degil). İkisini tek bayrağa bindirmek
-- düzenleme yetkisini de kapatırdı.
alter table kategoriler add column if not exists menuden_cikarilamaz boolean not null default false;

comment on column kategoriler.menuden_cikarilamaz is
  'true ise şube sahibi bu kategorideki ürünü menüden çıkaramaz; yalnızca "mevcut değil" işaretleyebilir. Admin etkilenmez.';

-- 2) Medya klasörünü şubelere açma
--
-- Şube sahibi ürün talebinde bulunurken fotoğraf SEÇEBİLSİN. Medya kütüphanesi
-- şubeye kapalı (media.view yalnız adminde) ve öyle kalmalı — dekont/arşiv de
-- orada. Bunun yerine merkez bir klasörü açık işaretler; şube yalnızca AÇIK
-- klasörlerdeki görselleri, salt okunur olarak görür.
alter table medya_klasorler add column if not exists subelere_acik boolean not null default false;

comment on column medya_klasorler.subelere_acik is
  'true ise klasördeki görseller şube sahibine ürün talebi ekranında seçilebilir olarak görünür (salt okunur).';
