-- Sınav denemeleri — bir sınav BİR KEZ çözülür.
--
-- ÖNCESİ: yalnızca GEÇEN deneme `ilerleme` tablosuna yazılıyordu. Kalan
-- denemenin hiçbir izi kalmadığı için kişi sınavı istediği kadar tekrar
-- çözebiliyor, soruları ezberleyip geçebiliyordu. Ayrıca hangi soruyu yanlış
-- yaptığı da kaydedilmediği için sonuç ekranı "%66 aldınız" demekten öteye
-- gidemiyordu.
--
-- (uid, ders_id) BİRİNCİL ANAHTAR: tekrar çözmeyi veritabanı engelliyor,
-- uygulama katmanındaki bir kontrole güvenilmiyor.
--
-- `cevaplar`: soru id → seçilen şık. Sonuç ekranı yanlışları ve doğru şıkları
-- bunun üzerinden gösteriyor; sorular ders kaydında durduğu için burada
-- yalnızca kişinin verdiği cevaplar tutuluyor.
create table sinav_denemeleri (
  uid        text not null,
  ders_id    text not null references dersler(id) on delete cascade,
  kurs_id    text not null references kurslar(id) on delete cascade,
  cevaplar   jsonb not null default '{}'::jsonb,
  score      numeric not null,
  gecti      boolean not null,
  baraj      numeric not null,
  zaman      timestamptz not null default now(),
  primary key (uid, ders_id)
);

comment on table sinav_denemeleri is
  'Sınav denemesi. Kişi başına ders başına TEK satır — sınav bir kez çözülür. Merkez gerekirse satırı silip yeniden hak tanır.';

create index sinav_denemeleri_kurs_idx on sinav_denemeleri (uid, kurs_id);

alter table sinav_denemeleri enable row level security;
