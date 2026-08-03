-- 0003_formlar.sql — form kayıtları + şube notları (G2 ekleri, kullanıcı onaylı)
--
-- Görev dosyasının tablo listesinde yoktu ama canlıda/kodda var:
--   franchise_basvurulari  (routes/basvurular.js   — pazarlama sitesi formu)
--   geri_bildirimler       (routes/geribildirim.js — QR menü şikayet formu)
--   is_basvurulari         (routes/isbasvuru.js    — şube iş başvurusu formu)
--   sube_notlari           (modules/reports/db.js  — şube başına serbest not)
-- Son ikisi henüz hiç kayıt almadı (koleksiyon oluşmamış), tablo yine de gerekli.
--
-- ADLANDIRMA NOTU: API'deki `not` alanı burada `admin_notu`. `not` Postgres'te
-- ayrılmış sözcük ve PostgREST'in `not.` operatör önekiyle çakışıyor; dönüşüm
-- (admin_notu ↔ not, olusturma ↔ olusturmaZamani) veri katmanındaki tek
-- yardımcıda yapılır — rota gövdeleri değişmez.
--
-- Tarih alanları (dogum_tarihi, baslangic_tarihi, olay_tarihi) BİLİNÇLİ text:
-- formlar serbest metin kabul ediyor, date'e çevirmek round-trip'i bozar.
--
-- sube_slug FK'sı `on delete set null`: şube silinse de başvuru geçmişi durur;
-- yazıldığı andaki şube adı sube_ad'da denormalize duruyor.

create table franchise_basvurulari (
  id         text primary key,
  ad         text,
  soyad      text,
  email      text,
  telefon    text,
  il         text,
  ilce       text,
  mesaj      text,
  durum      text not null default 'yeni',
  admin_notu text default '',
  olusturma  timestamptz not null
);
create index franchise_basvurulari_olusturma_idx on franchise_basvurulari (olusturma desc);

create table geri_bildirimler (
  id           text primary key,
  sube_slug    text references subeler(kod) on delete set null,
  sube_ad      text,
  kategori     text,
  ad           text,
  soyad        text,
  email        text,
  telefon      text,
  mesaj        text,
  olay_tarihi  text,
  kvkk_onay    boolean not null default true,
  durum        text not null default 'yeni',
  admin_notu   text default '',
  olusturma    timestamptz not null
);
create index geri_bildirimler_sube_idx on geri_bildirimler (sube_slug, olusturma desc);

create table is_basvurulari (
  id                  text primary key,
  sube_slug           text references subeler(kod) on delete set null,
  sube_ad             text,
  ad                  text,
  soyad               text,
  dogum_tarihi        text,
  telefon             text,
  email               text,
  musaitlik           text,
  calisma_tipi        text,
  beceriler           text[] not null default '{}',
  gida_deneyimi       text,
  gida_deneyimi_detay text,
  marka_deneyimi      text,
  halen_calisiyor     text,
  baslangic_tarihi    text,
  referans            text,
  kvkk_onay           boolean not null default true,
  durum               text not null default 'yeni',
  admin_notu          text default '',
  olusturma           timestamptz not null
);
create index is_basvurulari_sube_idx on is_basvurulari (sube_slug, olusturma desc);

create table sube_notlari (
  sube_kod    text primary key references subeler(kod) on delete cascade,
  notu        text not null default '',      -- API'de "not"
  guncelleyen text,
  guncelleme  timestamptz                    -- API'de guncellemeZamani
);

alter table franchise_basvurulari enable row level security;
alter table geri_bildirimler      enable row level security;
alter table is_basvurulari        enable row level security;
alter table sube_notlari          enable row level security;
