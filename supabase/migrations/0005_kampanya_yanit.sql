-- 0005_kampanya_yanit.sql — kampanya yanıtlarına atomik yazma (G8)
--
-- `kampanyalar.yanitlar` şube-anahtarlı bir jsonb. Uygulama tarafında
-- oku-değiştir-yaz yapılırsa iki eşzamanlı şube gönderimi birbirini ezer
-- (Firestore sürümünde bu yüzden transaction + dot-path update kullanılıyordu).
-- Bu fonksiyon satırı kilitleyip yalnızca ilgili şubenin anahtarını günceller.
--
-- p_beklenen_durum verilirse (toplu onay akışı) yanıtın durumu hâlâ o değilse
-- HİÇBİR ŞEY yazılmaz ve null döner — "okuma ile yazma arasında şube yeniden
-- gönderdi" durumunda eski değerin donmasını engelleyen guard budur.

create or replace function public.kampanya_yanit_yaz(
  p_id text,
  p_sube text,
  p_yama jsonb,
  p_beklenen_durum text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_yanitlar jsonb;
  v_mevcut   jsonb;
begin
  select coalesce(k.yanitlar, '{}'::jsonb) into v_yanitlar
  from public.kampanyalar k where k.id = p_id for update;

  if not found then
    return null;
  end if;

  v_mevcut := coalesce(v_yanitlar -> p_sube, '{}'::jsonb);

  if p_beklenen_durum is not null and coalesce(v_mevcut ->> 'durum', '') <> p_beklenen_durum then
    return null;   -- durum eşzamanlı işlemle değişmiş → atla
  end if;

  v_yanitlar := jsonb_set(v_yanitlar, array[p_sube], v_mevcut || p_yama, true);
  update public.kampanyalar set yanitlar = v_yanitlar where id = p_id;

  return v_yanitlar -> p_sube;
end
$$;

revoke execute on function public.kampanya_yanit_yaz(text, text, jsonb, text) from public;
revoke execute on function public.kampanya_yanit_yaz(text, text, jsonb, text) from anon;
revoke execute on function public.kampanya_yanit_yaz(text, text, jsonb, text) from authenticated;
grant execute on function public.kampanya_yanit_yaz(text, text, jsonb, text) to service_role;
