-- Geri bildirimi ŞİKAYET MASASINA çeviren alanlar.
--
-- Mevcut hâlde `geri_bildirimler` bir gelen kutusuydu: kayıt düşüyor, durumu
-- değişiyor, tek satırlık `admin_notu` üstüne yazılıyordu. Kimin ne zaman ne
-- yaptığı, müşteriye dönülüp dönülmediği, ne kadar beklediği hiçbir yerde
-- yoktu — `urun_sube`de yaşadığımız "yalnızca son durum" sorunu (bkz.
-- 0020_menu_gunlugu.sql).

-- ── A) Kayıt üstündeki yeni alanlar ─────────────────────────────────────
alter table geri_bildirimler
  add column takip_no   text,          -- müşterinin durum sorgulamada kullandığı kod
  add column kaynak     text not null default 'qr',   -- qr | sikayetvar | elle
  add column kaynak_url text,          -- dış kaynaktaki özgün adres
  add column kaynak_id  text,          -- dış kaynaktaki kimlik — tekilleştirme anahtarı
  add column ilk_yanit  timestamptz;   -- müşteriye İLK dönüş zamanı (SLA ölçüsü)

comment on column geri_bildirimler.takip_no is
  'Müşteriye verilen takip kodu. Tahmin edilemez olmalı: durum sorgulama ucu bunu bilen herkese açık (PII döndürmez).';
comment on column geri_bildirimler.ilk_yanit is
  'İlk MÜŞTERİ dönüşünün zamanı. Durum değişikliği tek başına dönüş sayılmaz — şube kaydı "inceleniyor" yapıp müşteriyi hiç aramamış olabilir.';

-- Takip kodu tekil; kod verilmemiş eski kayıtlar kısmi indeksin dışında.
create unique index geri_bildirimler_takip_no_idx
  on geri_bildirimler (takip_no) where takip_no is not null;

-- Dış kaynaktan aynı şikayet iki kez çekilmesin (Şikayetvar sayfası her gün
-- taranıyor, aynı kayıt her turda görünür).
create unique index geri_bildirimler_kaynak_idx
  on geri_bildirimler (kaynak, kaynak_id) where kaynak_id is not null;

-- "Bekleyenler en eskiden yeniye" — masanın ana sorgusu.
create index geri_bildirimler_durum_idx on geri_bildirimler (durum, olusturma);

-- ── B) Şikayet geçmişi ──────────────────────────────────────────────────
-- Üç tür kayıt tek tabloda: dahili not, müşteriye dönüş ve durum değişikliği.
-- Ayrı tablolara bölmek ekranda üç listeyi zaman sırasına göre birleştirmeyi
-- gerektirirdi; masada tek bir akış okunuyor.
--
-- CASCADE: şikayet silinince geçmişi de gider. menu_log'un aksine burada
-- kayıt merkezin kendi verisi, silme kararını merkez veriyor (şube silemez).
create table geri_bildirim_mesajlari (
  id               bigint generated always as identity primary key,
  bildirim_id      text not null references geri_bildirimler(id) on delete cascade,
  zaman            timestamptz not null default now(),
  kullanici        uuid,
  kullanici_eposta text,
  rol              text,
  tur              text not null check (tur in ('not', 'musteri', 'durum')),
  metin            text default '',
  eski_durum       text,
  yeni_durum       text
);

comment on column geri_bildirim_mesajlari.tur is
  'not = yalnızca ekip görür · musteri = müşteriye yapılan dönüş (telefon/e-posta) · durum = durum değişikliği kaydı';

create index geri_bildirim_mesajlari_idx
  on geri_bildirim_mesajlari (bildirim_id, zaman);

alter table geri_bildirim_mesajlari enable row level security;
