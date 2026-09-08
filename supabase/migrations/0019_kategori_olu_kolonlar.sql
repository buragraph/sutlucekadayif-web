-- Kategoriden ölü kolonlar düşürüldü.
--
-- tur      : ortak / şubeye özel ayrımı. Şube ayrımı ürün ve kategori bazlı
--            gizlemeye taşındı (urunler.gizli_subeler, kategoriler.gizli_subeler).
--            Düşürülürken 14 kategorinin HEPSİ 'ortak', şubeye özel ürün 0.
-- renk     : müşteri menüsü hiç okumuyordu, yalnızca panel avatarının arkasındaydı.
-- gorsel   : aynı şekilde menüde kullanılmıyordu; 14 kategoriden 1'inde vardı.
-- kilitli  : İKİ YÖNDEN DE ÖLÜ — panel formu bu alanı hiç göndermiyordu, yani
--            ayarlanamıyordu; okunduğu tek yer `urunKilitliMi`in yalnızca ŞUBEYE
--            ÖZEL üründe çalışan dalıydı, öyle ürün de yok. Kolonla birlikte o
--            miras dalı da kalktı; kategori kilit haritası 9 uçtan silindiği için
--            her birinde bir Supabase okuması eksildi (alt-istek bütçesi 50).
--
-- Ürün seviyesindeki `urunler.kilitli` DURUYOR — o ayrı bir kolon ve kullanılıyor.
alter table kategoriler drop column if exists tur;
alter table kategoriler drop column if exists renk;
alter table kategoriler drop column if exists gorsel;
alter table kategoriler drop column if exists kilitli;
