-- Şube başına MENÜDEKİ ürün sayısı.
--
-- SORUN: Şubeler ekranındaki "Ürün Sayısı" sütunu `urunler.sube_kod` üzerinden
-- sayıyordu, yani şubeye ÖZEL ürünleri. Katalogda öyle ürün hiç yok (842 ürünün
-- tamamı 'ortak'), bu yüzden sütun 93 şubenin hepsinde 0 gösteriyordu. Gerçek
-- menü büyüklüğü urun_sube üyelik tablosunda (şube kataloğun hangi ürünlerini
-- sattığını seçiyor). Aynı hata Ürünler sayfasındaki şube seçicisinde de vardı,
-- orada istemci tarafında düzeltilmişti.
--
-- NEDEN FONKSİYON: urun_sube 11 binden fazla satır; PostgREST'ten çekip
-- uygulamada saymak sayfa başına bir alt-istek demek (Workers'ta bütçe 50).
-- Toplama veritabanında yapılıp 93 satır dönüyor — tek alt-istek.
--
-- SİLİNEN ÜRÜN SAYILMAZ: çöp kutusundaki ürün menüde görünmüyor, sayıda da
-- görünmemeli.
--
-- `menude` FİLTRESİ ŞART: urun_sube satırının VARLIĞI ürünün menüde olduğu
-- anlamına gelmiyor — satır `menude=false` ile de duruyor (şube menüsünden
-- çıkardığında bayrak düşüyor, satır kalıyor). Filtresiz sayım 11.078 satırın
-- 2.506'sını fazladan sayıyordu.
create or replace function public.sube_menu_sayilari()
returns table (sube_kod text, adet bigint)
language sql
stable
security invoker
set search_path = ''
as $$
    select us.sube_kod, count(*)
    from public.urun_sube us
    join public.urunler u on u.id = us.urun_id
    where u.silinme is null and us.menude
    group by us.sube_kod;
$$;

grant execute on function public.sube_menu_sayilari() to service_role;
