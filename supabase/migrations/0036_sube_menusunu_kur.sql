-- Yeni şubenin menüsünü çekirdek katalogla kurar.
--
-- NEDEN GEREKLİ: menü bir OPT-IN listesi (urun_sube.menude) — katalog merkezde
-- durur, şube sattıklarını tek tek işaretler. Yeni şube bu yüzden BOŞ menüyle
-- açılıyor, birinin oturup ~95 ürünü elle eklemesi gerekiyordu. Bu oturumda
-- açılan üç şube hâlâ bu yüzden boş.
--
-- ÇEKİRDEK KATALOG NEDİR: katalogda silinmemiş 508 ortak ürün var ama dağılım
-- keskin biçimde iki kutuplu — 82 ürün 80'den fazla şubede, 411 ürün yalnızca
-- 1-9 şubede. İkinci grup zamanla ortak katalogda birikmiş yerel kalemler.
-- Hepsini eklemek yeni şubeyi, satmadığı 400 küsur ürünle QR menüde yayına
-- çıkarırdı. Bu yüzden ölçüt "şubelerin en az yarısında satılıyor".
--
-- EŞİK ORAN OLARAK TUTULUYOR, SAYI OLARAK DEĞİL: şube sayısı büyüdükçe sabit
-- bir sayı anlamını kaybederdi. Oran neredeyse duyarsız (ölçüldü: %30 → 93
-- ürün, %90 → 82), yani ayarı kurcalamaya gerek yok; yine de parametre.
--
-- KENDİSİ PAYDAYA GİRMEZ: şube kendi satırlarıyla eşiği etkilemesin (yeniden
-- çağrılırsa sonuç değişirdi).
--
-- ÇAKIŞMADA GÜNCELLER: kapatılmış bir şube yeniden açılıp fonksiyon tekrar
-- çağrılırsa satır zaten vardır; menüye geri alınır ve satışa açılır. Fiyat
-- özelleştirmesi (fiyat_override) ve şube etiketleri KORUNUR.
create or replace function public.sube_menusunu_kur(
    p_sube_kod  text,
    p_esik_oran numeric default 0.5
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_payda   integer;
    v_esik    integer;
    v_eklenen integer;
begin
    if p_sube_kod is null or p_sube_kod = '' then
        return 0;
    end if;

    -- Payda: menüsü kurulu şube sayısı (kendisi hariç)
    select count(distinct us.sube_kod) into v_payda
    from public.urun_sube us
    join public.urunler u on u.id = us.urun_id
    where us.menude and u.silinme is null and us.sube_kod <> p_sube_kod;

    -- Referans yoksa (ilk şube) kopyalanacak bir menü de yok.
    if coalesce(v_payda, 0) = 0 then
        return 0;
    end if;

    v_esik := ceil(p_esik_oran * v_payda);

    with cekirdek as (
        select us.urun_id
        from public.urun_sube us
        join public.urunler u on u.id = us.urun_id
        where us.menude
          and u.silinme is null
          and u.tur = 'ortak'
          and us.sube_kod <> p_sube_kod
        group by us.urun_id
        having count(distinct us.sube_kod) >= v_esik
    ),
    yazilan as (
        insert into public.urun_sube (urun_id, sube_kod, menude, gizli, mevcut_degil)
        select c.urun_id, p_sube_kod, true, false, false
        from cekirdek c
        on conflict (urun_id, sube_kod) do update
            set menude = true, mevcut_degil = false
        returning 1
    )
    select count(*) into v_eklenen from yazilan;

    return coalesce(v_eklenen, 0);
end;
$$;

grant execute on function public.sube_menusunu_kur(text, numeric) to service_role;
