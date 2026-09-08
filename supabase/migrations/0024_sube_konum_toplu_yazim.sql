-- Şube il/ilçesini TOPLU yazan yardımcı.
--
-- NEDEN FONKSİYON: Google Business Profile'da eşleşmiş ~80 şubenin il/ilçesi
-- tek seferde yazılıyor. Tek tek güncellemek 80 alt-istek demek; Worker'ın
-- çağrı başına bütçesi 50. Tek RPC = tek alt-istek.
--
-- Upsert de kullanılabilirdi ama gövdede geçmeyen kolonlara (`ad` NOT NULL)
-- dokunma riski taşıyor; burada yalnızca iki kolon yazılıyor.
--
-- `uzerine_yaz` false iken YALNIZCA boş olanlar doldurulur: elle düzeltilmiş
-- bir ilçeyi Google'ın kaydı sessizce ezmesin.
create or replace function sube_konum_yaz(veri jsonb, uzerine_yaz boolean default false)
returns integer
language sql
as $$
  with girdi as (
    select x->>'kod' as kod, x->>'il' as il, x->>'ilce' as ilce
      from jsonb_array_elements(veri) as x
  ), yazilan as (
    update subeler s
       set il = g.il, ilce = g.ilce
      from girdi g
     where s.kod = g.kod
       and coalesce(g.il, '') <> '' and coalesce(g.ilce, '') <> ''
       and (uzerine_yaz or coalesce(s.il, '') = '' or coalesce(s.ilce, '') = '')
       and (s.il is distinct from g.il or s.ilce is distinct from g.ilce)
    returning 1
  )
  select count(*)::int from yazilan;
$$;

comment on function sube_konum_yaz(jsonb, boolean) is
  'Şube il/ilçesini toplu yazar. 80 şubeyi tek tek güncellemek 80 alt-istek ederdi, Worker bütçesi 50. uzerine_yaz=false iken yalnızca boş olanlar doldurulur.';
