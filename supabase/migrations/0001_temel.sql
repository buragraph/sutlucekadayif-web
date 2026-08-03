-- 0001_temel.sql — Firestore → Postgres çekirdek şema (G2)
--
-- Alan listeleri canlı Firestore'dan çıkarıldı (2026-08-01, tüm dokümanlar
-- taranarak). Firestore doküman id'leri KORUNUR (text PK): URL'ler, R2 dosya
-- adları ve frontend state'i bu id'lere bağlı.
--
-- Görev dosyasındaki listeye göre eklenen alanlar (canlıda var, listede yoktu):
--   subeler       → fatura_adresi, sirket_tipi, vkn, yetkili_adi, lat, lng
--   kullanici_sube→ telefon, onboarded, onboarded_at
-- Bilinçli TAŞINMAYANLAR: subeler.donem_ozetleri / toplam_* / son_donem /
--   donem_sayisi (view'lardan gelir), kategoriler.urunSayisi (sorguyla sayılır),
--   ayarlar/qr_menu_version + reports/adsets_cache (Postgres'te gereksiz).

-- ── Temel ──────────────────────────────────────────────────────────────────
create table subeler (
  kod           text primary key,           -- slug: 'kayseri'
  ad            text not null,
  il            text,
  ilce          text,
  adres         text default '',
  link          text default '',
  telefon       text default '',
  -- Fatura/şirket bilgileri (onboarding ekranı doldurur; şubelerin ~1/4'ünde dolu)
  fatura_adresi text,
  sirket_tipi   text,
  vkn           text,
  yetkili_adi   text,
  lat           numeric,
  lng           numeric,
  olusturma     timestamptz not null default now()
);
-- konumlar tek-doküman deseni ve konum-store.js transaction'ı ÖLÜR:
-- il/ilce artık şube satırının kolonu, eşzamanlı yazma sorunu yapısal olarak yok.

create table kategoriler (
  id      text primary key,
  ad      text not null,
  sira    int  not null default 0,
  tur     text not null default 'ortak' check (tur in ('ortak','sube_ozel')),
  renk    text,
  gorsel  text default '',
  kilitli boolean not null default false
);

-- ── QR menü ────────────────────────────────────────────────────────────────
create table urunler (
  id          text primary key,
  ad          text not null,
  fiyat       numeric not null,
  kategori_id text references kategoriler(id),
  aciklama    text default '',
  etiket      text[] not null default '{}',
  gorsel      text default '',
  miktar      numeric,
  birim       text default '',
  kalori      numeric,
  tur         text not null default 'ortak' check (tur in ('ortak','sube_ozel')),
  sube_kod    text references subeler(kod),   -- yalnız sube_ozel dolu
  kilitli     boolean,                        -- null = kategoriden miras
  silinme     timestamptz,                    -- soft delete (deletedAt)
  olusturma   timestamptz not null default now(),
  check (tur = 'sube_ozel' or sube_kod is null)
);

-- Beş şube-bazlı dizinin (menude_subeler, gizli_subeler, mevcut_degil,
-- fiyat_override, fiyat_serbest) relasyonel karşılığı — TEK tablo:
create table urun_sube (
  urun_id        text not null references urunler(id) on delete cascade,
  sube_kod       text not null references subeler(kod) on delete cascade,
  menude         boolean not null default false,   -- opt-in
  gizli          boolean not null default false,   -- merkez yasağı
  mevcut_degil   boolean not null default false,   -- şube stok kapatması
  fiyat_override numeric,
  fiyat_serbest  boolean not null default false,
  primary key (urun_id, sube_kod)
);
-- Satır yoksa = varsayılanlar (menüde değil, gizli değil...). Kural sırası
-- (gizli → menude → mevcut_degil → fiyat_override) tek WHERE'e iner:
--   select u.*, coalesce(us.fiyat_override, u.fiyat) as etkin_fiyat
--   from urunler u join urun_sube us on us.urun_id = u.id
--   where us.sube_kod = $1 and us.menude and not us.gizli
--     and not us.mevcut_degil and u.silinme is null;

create index urun_sube_menu_idx on urun_sube (sube_kod) where menude;
create index urunler_kategori_idx on urunler (kategori_id) where silinme is null;

-- ── Raporlar ───────────────────────────────────────────────────────────────
create table donemler (
  id        bigint generated always as identity primary key,
  sube_kod  text not null references subeler(kod) on delete cascade,
  baslangic date not null,                   -- kaynak: donem_baslangic (ISO string)
  bitis     date not null,                   -- kaynak: donem_bitis
  -- Otomatik çekilen metrikler — Meta:
  harcama numeric, erisim numeric, gosterim numeric, tiklama numeric,
  tiklama_tumu numeric, mesaj numeric, paylasim numeric, sonuc numeric,
  yorum numeric,
  -- Otomatik çekilen metrikler — Google:
  google_arama numeric, google_harita numeric, google_menu_tiklama numeric,
  google_telefon numeric, google_web_tiklama numeric, google_yol_tarifi numeric,
  -- Yalnızca elle girilen bütçe alanları (eski veri_overrides'ın çözülmüş hâli):
  planlanan_butce numeric, devredilen_miktar numeric, merkez_destegi numeric,
  guncelleme timestamptz not null default now(),   -- kaynak: updatedAt
  unique (sube_kod, baslangic, bitis)
);
-- Eski API'deki dönem id'si "{baslangic}_{bitis}" (ör. 2026-05-24_2026-06-22)
-- biçiminde deterministik; rota katmanı id'yi bu iki tarihe ayırıp unique
-- anahtardan bulur — sözleşme değişmez, ayrı kolon gerekmez.
--
-- Override semantiği artık YAPISAL: çekim yalnızca metrik kolonlarını UPDATE
-- eder, bütçe kolonlarına hiç dokunmaz. "Donmuş override" sınıfı ölür.
-- applyDonemWrite + recalcSubeAggregates + donem_ozetleri denormalizasyonu ölür.

create view sube_toplamlari
  with (security_invoker = on) as
  select sube_kod,
         sum(harcama)  as toplam_harcama,
         sum(erisim)   as toplam_erisim,
         sum(gosterim) as toplam_gosterim,
         sum(tiklama)  as toplam_tiklama,
         sum(sonuc)    as toplam_sonuc,
         count(*)      as donem_sayisi,
         max(bitis)    as son_donem_bitis
  from donemler
  group by sube_kod;

create table kampanyalar (
  id                 text primary key,
  baslik             text,
  donem_baslangic    date,
  donem_bitis        date,
  durum              text,
  alici_adi          text,
  iban               text,
  odeme_notu         text,
  son_tarih          date,
  bakiye_secenekleri jsonb,
  yanitlar           jsonb,           -- şube-anahtarlı obje; ilk geçişte normalize EDİLMEZ
  olusturma          timestamptz
);

-- adset_mappings (636) / campaign_mappings (46) / google_mappings (78) /
-- meta_mappings (3) tek tabloda:
create table eslesmeler (
  tur     text not null check (tur in ('adset','campaign','google','meta')),
  anahtar text not null,
  deger   jsonb not null,
  primary key (tur, anahtar)
);

-- ── Diğer ──────────────────────────────────────────────────────────────────
create table ayarlar (          -- menu_cache duraklatma bayrağı, settings, google_token
  anahtar    text primary key,
  deger      jsonb not null,
  guncelleme timestamptz not null default now()
);

create table medya (
  id        text primary key,
  url       text not null,
  klasor    text,
  ad        text,
  boyut     int,
  arama     text[] not null default '{}',
  olusturma timestamptz          -- kaynak: createdAt (Firestore Timestamp, ISO değil)
);
create index medya_klasor_idx on medya (klasor);

-- ── Akademi ────────────────────────────────────────────────────────────────
-- DİKKAT: alan adları İngilizce KALIR (API sözleşmesi). JS tarafı camelCase
-- bekler (orderIndex, thumbnailUrl...) — dönüşüm backend-v2 veri katmanında
-- tek yardımcıda yapılır, rota gövdelerinde değil.
create table kurslar (
  id             text primary key,
  title          text,
  description    text,
  thumbnail_url  text,
  is_published   boolean not null default false,
  order_index    int,
  target_roles   text[],
  target_subeler text[],
  olusturma      timestamptz,
  guncelleme     timestamptz
);

create table dersler (
  id            text primary key,
  kurs_id       text not null references kurslar(id) on delete cascade,
  title         text,
  description   text,
  lesson_type   text,
  video_url     text,
  pdf_url       text,
  order_index   int,
  passing_score numeric,
  questions     jsonb,
  olusturma     timestamptz
);
create index dersler_kurs_idx on dersler (kurs_id, order_index);

create table kullanici_sube (
  uid          text primary key,
  role         text,
  sube_slug    text references subeler(kod),
  telefon      text,
  onboarded    boolean not null default false,
  onboarded_at timestamptz
);

-- ── RLS: her tabloda açık, policy YOK = deny-all ───────────────────────────
-- service_role (backend-v2) RLS'i baypas eder; anon/authenticated hiçbir şey göremez.
alter table subeler        enable row level security;
alter table kategoriler    enable row level security;
alter table urunler        enable row level security;
alter table urun_sube      enable row level security;
alter table donemler       enable row level security;
alter table kampanyalar    enable row level security;
alter table eslesmeler     enable row level security;
alter table ayarlar        enable row level security;
alter table medya          enable row level security;
alter table kurslar        enable row level security;
alter table dersler        enable row level security;
alter table kullanici_sube enable row level security;
