-- 0011_ilerleme_devir.sql — WordPress akademisinden devralınan, sahibi henüz
-- sistemde olmayan ilerleme kayıtları.
--
-- NEDEN: WordPress kapatılıyor. Oradaki 238 kurs kaydının / 110 tamamlamanın
-- sahibi 180 e-posta; bunların yalnızca 37'sinin bizde hesabı var (76 şube
-- sahibi açıldı, çalışanlar açılmadı — bir kısmı da artık çalışmıyor).
-- Kalan ~143 kişinin ilerlemesini hesap açılmadığı için atmak, WordPress
-- kapandığında veriyi kalıcı olarak kaybetmek demekti.
--
-- Bu tablo o kayıtları E-POSTA anahtarıyla bekletir. `ilerleme` ile aynı
-- şekli taşır, tek farkı `uid` yerine `eposta`. Kullanıcı ne zaman açılırsa
-- (panelden ya da betikle) satırlar `ilerleme`ye taşınır ve buradan silinir —
-- bkz. modules/academy/devir.js `ilerlemeDevral`.
--
-- completed_at HAKKINDA: WordPress ders bazında tamamlanma ZAMANI tutmuyor;
-- REST'ten yalnız 0/1 geliyor. Bu yüzden kullanıcının o kursa KAYIT zamanı
-- (wp_stm_lms_user_courses.start_time) yazılıyor — gerçek tamamlanma bundan
-- sonradır, yani alt sınır. `kaynak` alanı bunu kalıcı olarak işaretler ki
-- sonradan bakan biri tarihi gerçek sanmasın. Aynı not `ilerleme` tarafına
-- taşınan satırlar için de geçerli.

create table ilerleme_devir (
  eposta       text not null,
  ders_id      text not null references dersler(id) on delete cascade,
  kurs_id      text not null references kurslar(id) on delete cascade,
  score        numeric,                       -- WP sınav puanları çekilemedi: hep null
  completed_at timestamptz not null,
  kaynak       text not null default 'wordpress',
  primary key (eposta, ders_id)
);

create index ilerleme_devir_eposta_idx on ilerleme_devir (eposta);

alter table ilerleme_devir enable row level security;

-- Taşınmış kayıtlar `ilerleme`de de işaretli kalsın.
alter table ilerleme add column if not exists kaynak text;
