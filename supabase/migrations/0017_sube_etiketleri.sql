-- Şube bazlı ürün etiketi.
--
-- `urunler.etiket` MERKEZİN etiketi: tek kayıt olduğu için bir şubenin
-- değiştirmesi tüm şubelerde değişirdi. Şube "bizde en çok satan bu" diyebilmeli
-- ama bu bilgi yalnızca KENDİ menüsünde görünmeli — o yüzden ayrı kolon.
--
-- BİRLEŞTİRME, ÜZERİNE YAZMA DEĞİL: menüde merkezin etiketleri + şubenin
-- etiketleri birlikte gösterilir (tekilleştirilerek). Şube merkezin koyduğu
-- etiketi kaldıramaz; koyduğu etiket de başka şubeyi etkilemez.
alter table urun_sube add column if not exists etiket text[] not null default '{}';

comment on column urun_sube.etiket is
  'Şubenin kendi menüsüne özel ürün etiketleri. Müşteri menüsünde urunler.etiket ile BİRLEŞTİRİLİR; başka şubeyi etkilemez.';
