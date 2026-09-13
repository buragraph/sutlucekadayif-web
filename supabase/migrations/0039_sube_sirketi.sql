-- Şubeyi işleten ŞİRKET. Merkezin şube listesinde ("ŞİRKET CARİ" sütunu) iki
-- şirket var ve raporlama/muhasebe bu ayrımı istiyor:
--   ums        → UMS GIDA İNŞAAT TURİZM OTOMOTİV SANAYİ TİCARET LTD ŞTİ
--   beylikduzu → SÜTLÜCE KADAYIF SANAYİ VE TİCARET LİMİTED ŞİRKETİ
--
-- `sirket_tipi` ile KARIŞTIRILMAMALI: o, şubenin kendi hukuki biçimi
-- (şahıs/ltd) ve faturada kullanılıyor. Bu alan şubenin hangi şirkete bağlı
-- işletildiğini söylüyor.
--
-- NULL serbest: merkez listesinde karşılığı olmayan şubeler var (İstanbul
-- Esenyurt, Kocaeli Darıca, Kocaeli Merkez, Sembol AVM); zorunlu yapmak
-- mevcut satırları uydurma bir değere itelerdi.
alter table subeler add column if not exists sirket text;

alter table subeler drop constraint if exists subeler_sirket_check;
alter table subeler add constraint subeler_sirket_check
  check (sirket is null or sirket in ('ums', 'beylikduzu'));

comment on column subeler.sirket is
  'Şubeyi işleten şirket: ums | beylikduzu. Kaynak: merkezin şube listesi (ŞİRKET CARİ).';
