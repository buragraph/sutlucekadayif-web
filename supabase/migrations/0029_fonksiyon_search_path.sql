-- Fonksiyonlarda search_path sabitlensin.
--
-- NEDEN: `search_path` sabit değilse fonksiyon çağıranın arama yoluna bağlı
-- kalır; çağıran kendi şemasında `subeler` adında sahte bir tablo tanımlayıp
-- fonksiyonu ona yönlendirebilir. Bu ikisi SECURITY DEFINER olmadığı ve RLS
-- deny-all olduğu için bugün sömürülebilir değil, ama projenin 0000/0005'te
-- kurduğu kalıp bu (kampanya_yanit_yaz zaten böyle). Supabase denetçisi de
-- `function_search_path_mutable` diye uyarıyordu.
--
-- pg_catalog HER ZAMAN örtük aranır; count/coalesce/jsonb_array_elements gibi
-- yerleşikler nitelenmeden çalışır. Nitelenmesi gereken kendi tablolarımız.
create or replace function public.duyuru_okuma_sayilari()
returns table(duyuru_id text, adet integer, sube_adedi integer)
language sql
stable
set search_path = ''
as $$
  select o.duyuru_id,
         count(*)::int                   as adet,
         count(distinct o.sube_kod)::int as sube_adedi
    from public.duyuru_okuma o
   group by o.duyuru_id;
$$;

create or replace function public.sube_konum_yaz(veri jsonb, uzerine_yaz boolean default false)
returns integer
language sql
set search_path = ''
as $$
  with girdi as (
    select x->>'kod' as kod, x->>'il' as il, x->>'ilce' as ilce
      from jsonb_array_elements(veri) as x
  ), yazilan as (
    update public.subeler s
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

revoke execute on function public.duyuru_okuma_sayilari() from public, anon, authenticated;
revoke execute on function public.sube_konum_yaz(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.duyuru_okuma_sayilari() to service_role;
grant execute on function public.sube_konum_yaz(jsonb, boolean) to service_role;
