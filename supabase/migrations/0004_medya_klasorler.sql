-- 0004_medya_klasorler.sql — G5 sırasında ortaya çıkan iki eksik (rotalar kullanıyor,
-- tabloda karşılığı yoktu).
--
-- 1) medya_klasorler: kullanıcı tanımlı medya klasörleri (routes/media.js
--    GET/POST/DELETE /klasorler). Firestore'da koleksiyon henüz hiç oluşmamış
--    (kullanıcı klasörü yok), o yüzden alan taramasında görünmemişti — ama uç
--    canlı ve klasör oluşturma çalışıyor olmalı.
-- 2) Form tablolarında `guncelleme`: PATCH uçları `guncellemeZamani` yazıyor
--    (basvurular.js:148, geribildirim.js:178, isbasvuru.js:197).

create table medya_klasorler (
  id        text primary key,
  ad        text not null unique,
  olusturma timestamptz not null default now()
);
alter table medya_klasorler enable row level security;

alter table franchise_basvurulari add column guncelleme timestamptz;
alter table geri_bildirimler      add column guncelleme timestamptz;
alter table is_basvurulari        add column guncelleme timestamptz;
