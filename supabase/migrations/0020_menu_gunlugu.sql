-- Menü günlüğü — "kim, hangi şubede, neyi değiştirdi".
--
-- NEDEN YENİ TABLO: `urun_sube` yalnızca SON DURUMU tutuyor. "Bu ürün bu
-- şubede kapalı" bilgisi vardı ama kimin ne zaman kapattığı hiçbir yerde
-- yoktu — satırda ne aktör ne de zaman kolonu var. Denetim ekranı bu yüzden
-- ancak "şu an ne farklı" diyebiliyordu; "ne oldu" sorusu cevapsızdı.
--
-- SNAPSHOT ALANLARI (kullanici_eposta, urun_ad) bilerek denormalize:
--   * Kullanıcılar Supabase Auth'ta (auth.users), PostgREST'ten join
--     edilemiyor; uid tek başına ekranda hiçbir şey ifade etmez.
--   * Ürün kalıcı silinirse günlük satırı okunabilir kalmalı — FK yok,
--     silme günlüğü götürmüyor ve silmeyi engellemiyor.
--
-- eski/yeni JSONB: her işlem türünün değeri farklı biçimde (boolean, sayı,
-- metin dizisi). Tür başına kolon açmak yerine tek alan; ekran işleme göre
-- biçimlendiriyor.
create table menu_log (
  id               bigint generated always as identity primary key,
  zaman            timestamptz not null default now(),
  kullanici        uuid,
  kullanici_eposta text,
  rol              text,
  sube_kod         text not null,           -- HANGİ şubenin menüsü değişti
  urun_id          text,
  urun_ad          text,
  islem            text not null,           -- mevcut_degil | etiket | fiyat | menuye_ekle | menuden_cikar
  eski             jsonb,
  yeni             jsonb
);

comment on table menu_log is
  'Şube menüsünü değiştiren işlemlerin günlüğü. Yalnızca EKLENİR; urun_sube''nin son durumunu değil, oraya nasıl gelindiğini tutar.';
comment on column menu_log.sube_kod is
  'Menüsü değişen şube. Admin bir şube adına işlem yaptığında da o şubenin kodu yazılır; işlemi kimin yaptığı kullanici/rol alanlarında.';

-- Ekranın üç sorgusu: son N kayıt, bir şubenin geçmişi, bir ürünün geçmişi.
create index menu_log_zaman_idx  on menu_log (zaman desc);
create index menu_log_sube_idx   on menu_log (sube_kod, zaman desc);
create index menu_log_urun_idx   on menu_log (urun_id, zaman desc);

alter table menu_log enable row level security;

-- ── Sapma özet fonksiyonları düşüyor ────────────────────────────────────
-- Tek tüketicileri "Şube Değişiklikleri" ekranıydı. O ekran kalktı: mevcut
-- DURUM artık Ürünler sayfasında şube seçilerek görülüyor (ve düzeltiliyor),
-- GEÇMİŞ ise bu tabloda. Aradaki üçüncü görünüm ikisini de tekrarlıyordu.
drop function if exists sube_sapma_urun_ozeti();
drop function if exists sube_sapma_sube_ozeti();
