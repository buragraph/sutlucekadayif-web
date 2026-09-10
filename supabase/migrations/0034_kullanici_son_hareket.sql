-- Kullanıcının panele en son NE ZAMAN eriştiği.
--
-- SORUN: paneldeki "Son Giriş" sütunu `auth.users.last_sign_in_at` gösteriyordu.
-- Supabase o kolonu YALNIZCA parolayla oturum açıldığında güncelliyor; oturum
-- yenileme tokeni ile ayakta kaldığı sürece dokunmuyor. Panelde oturum haftalarca
-- yenilenerek sürdüğü için kolon, kişinin paneli en son kullandığı anı değil, en
-- son parola girdiği anı gösteriyordu — her gün panele giren kullanıcı "24 Ağustos"
-- görünüyordu.
--
-- ÇÖZÜM: gerçek erişim `auth.sessions.updated_at` (her token yenilemesinde
-- güncelleniyor). Oturum kapanınca/süresi dolunca satır siliniyor, o yüzden
-- `last_sign_in_at` ile GREATEST alınıyor (GREATEST NULL'ları yok sayar).
--
-- NEDEN FONKSİYON: `auth` şeması PostgREST'e açık değil, backend oradan doğrudan
-- okuyamıyor. SECURITY DEFINER ile yalnızca bu iki alan dışarı veriliyor;
-- yürütme hakkı service_role'a kısıtlı, anon/authenticated'a kapalı.
create or replace function public.kullanici_son_hareket()
returns table (uid uuid, son_hareket timestamptz)
language sql
security definer
set search_path = ''
as $$
    select u.id,
           greatest(
               u.last_sign_in_at,
               (select max(s.updated_at) from auth.sessions s where s.user_id = u.id)
           )
    from auth.users u;
$$;

revoke all on function public.kullanici_son_hareket() from public;
revoke all on function public.kullanici_son_hareket() from anon;
revoke all on function public.kullanici_son_hareket() from authenticated;
grant execute on function public.kullanici_son_hareket() to service_role;
