-- Merkezin şubelere açtığı KURUMSAL MATERYAL: logo, tabela görseli, sosyal
-- medya şablonu, marka kılavuzu…
--
-- NEDEN `medya` TABLOSU DEĞİL: medya kütüphanesi ürün görselleri için ve
-- yalnızca merkeze açık; buranın izleyicisi şube sahibi. İkisini tek tabloda
-- tutmak "hangi dosya şubeye görünür" sorusunu her sorguya taşırdı.
--
-- DOSYANIN KENDİSİ R2'de (`kurumsal/` öneki); burada yalnızca künyesi duruyor.
create table if not exists kurumsal_materyal (
    id          text primary key,
    ad          text not null,
    aciklama    text default '',
    kategori    text not null default 'diger'
                check (kategori in ('logo', 'gorsel', 'sablon', 'dokuman', 'diger')),
    r2_key      text not null,
    dosya_adi   text not null,
    mime        text not null default '',
    boyut       bigint not null default 0,
    yukleyen    text default '',
    olusturma   timestamptz not null default now()
);

create index if not exists kurumsal_materyal_kategori_idx on kurumsal_materyal (kategori);
create index if not exists kurumsal_materyal_olusturma_idx on kurumsal_materyal (olusturma desc);

comment on table kurumsal_materyal is
  'Merkezin yüklediği, şube sahiplerinin indirdiği kurumsal dosyalar. Dosya R2 kurumsal/ önekinde.';

-- RLS AÇIK, POLİTİKA YOK — projedeki diğer tabloların deseni. Backend
-- `service_role` ile bağlanıp RLS'i atlıyor, tenant izolasyonu rota
-- gövdelerinde. Açık kalsaydı tablo, frontend'de gömülü anon anahtarla
-- doğrudan okunup yazılabilirdi. (Ayrıca 0042'de uygulandı.)
alter table kurumsal_materyal enable row level security;
