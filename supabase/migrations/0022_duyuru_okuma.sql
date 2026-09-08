-- Duyuru okundu işaretleri.
--
-- KULLANICI BAZLI, ŞUBE BAZLI DEĞİL: bir şubede birden fazla yetkili hesap
-- olabiliyor (bkz. kullanici_sube). "Şube okudu" demek, ikinci yetkilinin
-- duyuruyu hiç görmemesi demek olurdu. `sube_kod` yine de yazılıyor — merkez
-- "hangi şubeler okudu" özetini oradan çıkarıyor.
--
-- FK CASCADE: duyuru silinince okuma işaretleri de gider. menu_log'un aksine
-- burada işaretin tek başına bir anlamı yok — hangi duyurunun okunduğu
-- bilgisi duyuru olmadan okunamaz.
create table duyuru_okuma (
  duyuru_id        text not null references duyurular(id) on delete cascade,
  kullanici        uuid not null,
  kullanici_eposta text,
  sube_kod         text,
  zaman            timestamptz not null default now(),
  primary key (duyuru_id, kullanici)
);

create index duyuru_okuma_duyuru_idx on duyuru_okuma (duyuru_id);

alter table duyuru_okuma enable row level security;

-- Yönetim listesindeki "kaç kişi okudu" sayacı.
--
-- NEDEN SQL'DE: PostgREST'te duyuru başına ayrı count sorgusu demek, 20
-- duyuruda 20 alt-istek demekti (ücretsiz planda çağrı başına bütçe 50).
-- Tek RPC, tek alt-istek.
create or replace function duyuru_okuma_sayilari()
returns table (duyuru_id text, adet int, sube_adedi int)
language sql
stable
as $$
  select o.duyuru_id,
         count(*)::int                              as adet,
         count(distinct o.sube_kod)::int            as sube_adedi
    from duyuru_okuma o
   group by o.duyuru_id;
$$;
