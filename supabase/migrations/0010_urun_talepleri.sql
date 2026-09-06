-- 0010_urun_talepleri.sql — şube ürün talebi + merkez onayı (kullanıcı onaylı)
--
-- NEDEN: `products.create` yalnız admin'de (bkz. shared/permissions.js) ve
-- katalogda tek bir `sube_ozel` ürün yok — şube kendi sattığı yerel ürünü
-- sisteme hiç giremiyor. WordPress QR menüsü kapanınca bu şubelerin menüsü
-- fiilen küçülürdü: aktif 63 şubede 264 kalem "şube satıyor, sistemde yok".
--
-- Talep akışı bu boşluğu kapatır ama ürün oluşturma yetkisini merkezde tutar;
-- asıl duplikasyon önleme onay aşamasında DEĞİL, talep yazılırken yapılan
-- normalize edilmiş ad kontrolüyle olur (bkz. routes/urun-talepleri.js).
--
-- `eslesen_urun_id`: admin "yeni ürün açma, şu mevcut ürünü kullan" dediğinde
-- hangi ürüne bağlandığı burada durur — karar geçmişi kaybolmasın.
--
-- Şube silinirse talepleri de gider (cascade): karar geçmişi şubeye bağlı,
-- geri_bildirimler'deki gibi denormalize şube adı tutmaya gerek yok.

create table urun_talepleri (
  id              text primary key,
  sube_kod        text not null references subeler(kod) on delete cascade,
  ad              text not null,
  kategori_id     text references kategoriler(id),
  fiyat           numeric,                       -- şubenin önerdiği; admin değiştirebilir
  aciklama        text default '',
  gorsel          text default '',
  durum           text not null default 'bekliyor'
                    check (durum in ('bekliyor', 'onaylandi', 'reddedildi')),
  eslesen_urun_id text references urunler(id) on delete set null,
  admin_notu      text default '',
  olusturan       text,                          -- Supabase Auth uid
  olusturma       timestamptz not null default now(),
  karar_veren     text,
  karar_zamani    timestamptz
);

-- Admin gelen kutusu: bekleyenler en yeniden eskiye
create index urun_talepleri_bekleyen_idx
  on urun_talepleri (olusturma desc) where durum = 'bekliyor';

-- Şube kendi taleplerini listeler
create index urun_talepleri_sube_idx on urun_talepleri (sube_kod, olusturma desc);

-- Aynı şube aynı adı bekleyen talep olarak iki kez açamasın; karara bağlanmış
-- olanlar tekrar talep edilebilir (reddedilen ürün sonradan satışa girebilir).
create unique index urun_talepleri_bekleyen_tekil_idx
  on urun_talepleri (sube_kod, lower(ad)) where durum = 'bekliyor';
