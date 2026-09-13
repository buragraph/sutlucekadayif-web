-- Başvurunun GELİŞ KANALI.
--   web     → sitedeki franchise formu (herkese açık uç)
--   telefon → merkezi arayan kişinin kaydı, panelden elle giriliyor
--
-- Mevcut satırların hepsi web: elle giriş bu sürümde açıldı, öncesinde
-- başvurunun tek yolu formdu. Bu yüzden geriye dönük 'web' yazılıyor ve kolon
-- NOT NULL + varsayılan 'web' oluyor — kaynağı boş bir başvuru, listede
-- "hangi kanaldan geldi" sorusunu cevapsız bırakırdı.
alter table franchise_basvurulari
  add column if not exists kaynak text not null default 'web';

update franchise_basvurulari set kaynak = 'web' where kaynak is null or kaynak = '';

alter table franchise_basvurulari drop constraint if exists franchise_basvurulari_kaynak_check;
alter table franchise_basvurulari add constraint franchise_basvurulari_kaynak_check
  check (kaynak in ('web', 'telefon'));

comment on column franchise_basvurulari.kaynak is
  'Başvurunun geliş kanalı: web (site formu) | telefon (panelden elle giriş).';
