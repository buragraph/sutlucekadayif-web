-- 0008_auth_dal_log.sql — GEÇİCİ: hangi doğrulama dalı kullanılıyor (Söküm/D2)
--
-- Çift doğrulayıcı haftasının ampirik kapısı: Firebase dalına düşen istek
-- SIFIR olmalı. Sayaç loga değil tabloya yazılıyor çünkü Cloud Functions çok
-- örnekli çalışıyor; süreç içi sayaç örnek başına kaybolur, tablo birleştirir.
--
-- Yazım şekli (middleware/auth.js):
--   dal='firebase' → HER isteğe bir satır (beklenen: hiç satır olmaması)
--   dal='supabase' → örnek başına en fazla dakikada bir ÖZET satır (adet = o
--                    pencerede doğrulanan istek sayısı) — trafik olduğunun kanıtı
--
-- S2'de (Firebase dalı silinirken) bu tablo da DROP edilir.

create table auth_dal_log (
  id       bigserial primary key,
  dal      text not null,
  adet     integer not null default 1,
  ayrinti  text,
  zaman    timestamptz not null default now()
);

create index auth_dal_log_zaman_idx on auth_dal_log (zaman desc);

alter table auth_dal_log enable row level security;
