-- 0000_saglik.sql — bağlantı sağlık kontrolü (G1)
-- backend-v2 `GET /api/health` ucu bunu çağırır; supabase-js ham SQL çalıştıramadığı
-- için `select 1` bu fonksiyon üzerinden yapılır.

create or replace function public.saglik()
returns integer
language sql
stable
set search_path = ''       -- sabitlenmezse arayan rolün search_path'i geçerli olur (linter uyarısı)
as $$ select 1 $$;

-- Yalnızca sunucu (service_role) çağırabilsin; anonim/oturumlu istemcilere kapalı.
revoke execute on function public.saglik() from public;
revoke execute on function public.saglik() from anon;
revoke execute on function public.saglik() from authenticated;
grant execute on function public.saglik() to service_role;
