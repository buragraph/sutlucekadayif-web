-- 0006_kategori_null_ayrimi.sql — kategori alanlarında "yok" ile "boş" ayrımı (G9)
--
-- Firestore'da kategori alanları SEYREKTİ: gorsel 3/14, kilitli 2/14 dokümanda var.
-- NOT NULL + default, "alan yok" ile "alan boş" ayrımını siliyordu ve API yanıtı
-- eskisinden farklı anahtarlar taşıyordu (G9 parite kapısı yakaladı).
alter table kategoriler alter column gorsel drop default;
alter table kategoriler alter column kilitli drop not null;
alter table kategoriler alter column kilitli drop default;
