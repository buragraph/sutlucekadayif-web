-- Şube sapmalarının ÖZET görünümleri (merkez denetim ekranı).
--
-- NEDEN VERİTABANINDA: özet, 8.300+ satırlık `urun_sube` üzerinde gruplama
-- istiyor. Worker'da yapmak için tabloyu sayfa sayfa çekmek gerekirdi
-- (PostgREST tek istekte 1000 satır veriyor) — her sayfa açılışında ~9
-- alt-istek, üstelik ücretsiz plandaki 50'lik bütçeden. SQL tarafında tek
-- çağrı, tek alt-istek.
--
-- `stable`: aynı işlemde aynı sonucu verir, yan etkisi yok — planlayıcı
-- önbellekleyebilir.

-- ── A) Ürüne göre: hangi ürün kaç şubede kapatılmış ──────────────────────
-- Asıl soruyu bu cevaplıyor: "88 şubede menüde, 88'inde kapalı" olan ürün
-- 88 ayrı şube kararı değil, fiilen var olmayan bir üründür.
create or replace function sube_sapma_urun_ozeti()
returns table (
  urun_id text, ad text, kategori_id text,
  menude int, kapali int, fiyatli int, etiketli int
)
language sql
stable
as $$
  select u.id, u.ad, u.kategori_id,
         count(*) filter (where us.menude)::int                          as menude,
         count(*) filter (where us.mevcut_degil)::int                    as kapali,
         count(*) filter (where us.fiyat_override is not null)::int      as fiyatli,
         count(*) filter (where coalesce(array_length(us.etiket, 1), 0) > 0)::int as etiketli
    from urun_sube us
    join urunler u on u.id = us.urun_id
   where u.silinme is null
   group by u.id, u.ad, u.kategori_id
  having count(*) filter (where us.mevcut_degil) > 0
      or count(*) filter (where us.fiyat_override is not null) > 0
      or count(*) filter (where coalesce(array_length(us.etiket, 1), 0) > 0) > 0;
$$;

-- ── B) Şubeye göre: menüsünün ne kadarını kapatmış ───────────────────────
-- Oran ham sayıdan anlamlı: 39 kapalı ürün, 58 ürünlük menüde başka bir şey
-- söyler 300 ürünlük menüde başka. Sapması olmayan şubeler de dönüyor —
-- ortalama onlarla birlikte hesaplanmalı, yoksa aykırılık ölçüsü şişer.
create or replace function sube_sapma_sube_ozeti()
returns table (
  sube_kod text, ad text, kapanma_tarihi date,
  menude int, kapali int, fiyatli int, etiketli int
)
language sql
stable
as $$
  select s.kod, s.ad, s.kapanma_tarihi,
         count(*) filter (where us.menude)::int                          as menude,
         count(*) filter (where us.mevcut_degil)::int                    as kapali,
         count(*) filter (where us.fiyat_override is not null)::int      as fiyatli,
         count(*) filter (where coalesce(array_length(us.etiket, 1), 0) > 0)::int as etiketli
    from subeler s
    left join urun_sube us on us.sube_kod = s.kod
    left join urunler u on u.id = us.urun_id and u.silinme is null
   where u.id is not null
   group by s.kod, s.ad, s.kapanma_tarihi;
$$;
