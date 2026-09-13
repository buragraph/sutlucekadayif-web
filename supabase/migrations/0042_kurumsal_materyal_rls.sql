-- 0041 tabloyu RLS'siz oluşturmuştu; PostgREST'e açık olduğu için tarayıcıdaki
-- anon anahtarla (frontend'de gömülü) okunabilir ve yazılabilirdi.
alter table kurumsal_materyal enable row level security;
