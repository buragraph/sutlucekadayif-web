-- Kapanan şubeler: SİLİNMEZ, kapatılır.
--
-- NEDEN: `subeler` satırına 8 tablo bağlı ve `donemler` (rapor/bütçe geçmişi)
-- FK'sı `on delete cascade` idi. Yani bir şubeyi silmek o şubenin tüm harcama,
-- erişim, Google metriği ve bütçe geçmişini SESSİZCE götürüyordu — üstelik
-- geçmiş ayların merkez toplamlarını da geriye dönük değiştirerek.
--
-- Çözüm iki parçalı:
--   1) `kapanma_tarihi` ile yumuşak kapatma. Veri yerinde kalır; şube yalnızca
--      operasyonel yüzeylerden (menü, seçiciler, cron, formlar) çekilir.
--   2) `donemler` FK'sı `restrict`e çevrilir: dönem geçmişi olan bir şube artık
--      veritabanı seviyesinde silinemez. Kaza payı kalmasın diye.
--      Hiç dönemi olmayan (yanlışlıkla açılmış) şube hâlâ silinebilir.

alter table subeler add column if not exists kapanma_tarihi date;
alter table subeler add column if not exists kapanma_notu  text;

comment on column subeler.kapanma_tarihi is
  'Dolu ise şube kapanmıştır: geçmişi durur, operasyonel yüzeylerden çıkar. NULL = açık.';
comment on column subeler.kapanma_notu is 'Kapanma gerekçesi (serbest metin, opsiyonel).';

-- Açık şube sorguları (`kapanma_tarihi is null`) her listede geçiyor.
create index if not exists subeler_acik_idx on subeler (kod) where kapanma_tarihi is null;

alter table donemler drop constraint if exists donemler_sube_kod_fkey;
alter table donemler add constraint donemler_sube_kod_fkey
  foreign key (sube_kod) references subeler(kod) on delete restrict;
