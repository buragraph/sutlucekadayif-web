-- RLS'i açık kalan iki tabloya da uygula.
--
-- NEDEN ACİL: Supabase varsayılan olarak `anon` ve `authenticated` rollerine
-- public şemadaki tüm tablolar üzerinde SELECT/INSERT/UPDATE/DELETE/TRUNCATE
-- yetkisi verir; bu yetkiyi frenleyen tek şey RLS'tir. Bu iki tabloda RLS
-- kapalı olduğu için, frontend bundle'ında zaten bulunan publishable anahtarla
-- PostgREST üzerinden okunabiliyor VE silinebiliyorlardı. Supabase'in güvenlik
-- denetçisi de bunu ERROR seviyesinde `rls_disabled_in_public` diye raporluyordu.
--
-- POLİTİKA YAZILMIYOR: diğer 26 tabloyla aynı duruş — RLS açık, politika yok,
-- yani anon/authenticated için deny-all. Uygulama veritabanına service_role
-- ile bağlanıyor ve RLS'i bypass ediyor; arka uçta hiçbir şey değişmez.
-- (bkz. frontend/src/supabase.js — istemci Supabase'i yalnızca auth için
-- kullanır, tabloya doğrudan gitmez.)
alter table public.urun_talepleri enable row level security;
alter table public._yedek_urun_etiket_20260908 enable row level security;
