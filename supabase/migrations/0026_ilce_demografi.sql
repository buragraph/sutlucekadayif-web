-- İlçe bazlı demografi — şube panelindeki "Bölgeniz" kartı.
--
-- KAYNAKLAR
--   SEGE: Sanayi ve Teknoloji Bakanlığı, İlçelerin Sosyo-Ekonomik Gelişmişlik
--         Sıralaması Araştırması 2022 (973 ilçe). Kademe 1 = en gelişmiş.
--         Kademe sınırları sıra bazında: 1, 68, 241, 416, 631, 853.
--   Yaş / eğitim: TÜİK ADNKS. Kolonlar açık ama BOŞ — veri henüz elimizde yok.
--
-- ÇEKİM YOK: ikisi de yılda bir yayımlanan statik veri. Cron'a, çekim
-- kuyruğuna, alt-istek bütçesine hiç dokunmuyor; tabloya bir kez yazılıp
-- yılda bir tazeleniyor.
--
-- ANAHTAR (il, ilce) AD ÜZERİNDEN: şube kaydında da aynı adlar duruyor ve
-- ikisi de aynı resmî listeden geliyor (frontend/src/data/tr-iller-ilceler.json
-- ve routes/branches.js#konum-doldur). Sayısal bir ilçe kodu taşımadığımız
-- için ad tek ortak anahtar.
create table ilce_demografi (
  il            text not null,
  ilce          text not null,
  sege_sira     integer,
  sege_skor     numeric,
  sege_kademe   smallint check (sege_kademe between 1 and 6),
  nufus         integer,
  yas_0_14      integer,
  yas_15_24     integer,
  yas_25_44     integer,
  yas_45_64     integer,
  yas_65_uzeri  integer,
  egitim_okuryazar_degil  integer,
  egitim_ilkokul          integer,
  egitim_ortaokul         integer,
  egitim_lise             integer,
  egitim_yuksekogretim    integer,
  kaynak_yili   integer,
  guncelleme    timestamptz not null default now(),
  primary key (il, ilce)
);

comment on table ilce_demografi is
  'İlçe bazlı demografi. SEGE: Sanayi ve Teknoloji Bakanlığı İlçe SEGE-2022 (973 ilçe). Yaş/eğitim kolonları TÜİK ADNKS için ayrılmış. Yılda bir güncellenen statik veri — cron yok.';
comment on column ilce_demografi.sege_kademe is
  '1 = en gelişmiş, 6 = en az gelişmiş. Kademe sınırları: 1, 68, 241, 416, 631, 853.';

alter table ilce_demografi enable row level security;

-- Veri yüklemesi migration'da DEĞİL: 973 satırlık SEGE tablosu resmî PDF'ten
-- çıkarılıp tek seferde yazıldı. Yeniden yüklemek gerekirse kaynak:
-- Kalkınma Ajansları Genel Müdürlüğü, İlçe SEGE-2022, Ek-1.
