-- 0002_ilerleme.sql — akademi ilerleme kayıtları (G3)
--
-- Kaynak: academy_progress/{uid}/completedLessons/{lessonId}
--   → { courseId, completedAt (ISO string), score (yalnız sınavlarda) }
-- Doküman id'si = ders id'si; sahibi = üst dokümanın id'si (uid).
--
-- academy_progress/{uid} ÜST dokümanındaki byCourse / totalCompleted /
-- lastActivity / statsMigrated alanları TAŞINMAZ: bunlar completedLessons'tan
-- türetilen sayaç cache'i (syncUserProgressStats). Postgres'te aggregate
-- ucuz — aşağıdaki view yerini alır, "statsMigrated" göçü kavramı ölür.
--
-- Alan adları akademi konvansiyonuna uyuyor (İngilizce payload + Türkçe FK),
-- dersler tablosuyla aynı kalıp.

create table ilerleme (
  uid          text not null,
  ders_id      text not null references dersler(id) on delete cascade,
  kurs_id      text not null references kurslar(id) on delete cascade,
  score        numeric,                       -- yalnız lesson_type='quiz'
  completed_at timestamptz not null,
  primary key (uid, ders_id)
);

create index ilerleme_kurs_idx on ilerleme (uid, kurs_id);

-- byCourse / totalCompleted / lastActivity karşılığı:
--   kurs kırılımı için: select kurs_id, count(*) ... group by kurs_id
create view ilerleme_ozeti
  with (security_invoker = on) as
  select uid,
         count(*)          as total_completed,
         max(completed_at) as last_activity
  from ilerleme
  group by uid;

alter table ilerleme enable row level security;
