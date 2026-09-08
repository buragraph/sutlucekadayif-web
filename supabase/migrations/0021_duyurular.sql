-- Merkez duyuruları — admin yazar, şube sahibi kendi dashboard'unda görür.
--
-- HEDEFLEME `hedef_subeler` ile: boş dizi = TÜM şubeler. Ayrı bir "herkese"
-- bayrağı tutmuyoruz, iki alanın çelişme ihtimali olmasın (ör. herkese=true
-- ama liste dolu). Aynı desen kategorilerdeki `gizli_subeler`de de var.
--
-- ZAMAN PENCERESİ: `baslangic` null = hemen yayında, `bitis` null = süresiz.
-- Böylece "15 Eylül'e kadar" duyurusunu admin'in elle kapatması gerekmiyor;
-- `yayinda` bayrağı ise pencereden bağımsız acil kapatma anahtarı.
create table duyurular (
  id            text primary key,
  baslik        text not null,
  icerik        text not null default '',
  -- Görsel vurgu: kart rengi ve ikon buna göre.
  onem          text not null default 'bilgi' check (onem in ('bilgi', 'uyari', 'onemli')),
  yayinda       boolean not null default true,
  baslangic     timestamptz,
  bitis         timestamptz,
  hedef_subeler text[] not null default '{}',
  -- Kim yazdı: auth.users PostgREST'ten join edilemiyor, e-posta snapshot.
  olusturan     text,
  olusturma     timestamptz not null default now(),
  guncelleme    timestamptz not null default now()
);

comment on column duyurular.hedef_subeler is
  'Duyurunun görüneceği şube kodları. BOŞ DİZİ = tüm şubeler.';

-- Şube panelindeki sorgu: yayında + tarih penceresi içinde, en yeni önce.
create index duyurular_yayin_idx on duyurular (yayinda, olusturma desc);

alter table duyurular enable row level security;
