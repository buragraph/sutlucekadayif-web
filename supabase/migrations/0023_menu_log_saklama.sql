-- Menü günlüğü saklama kuralı — 12 ay.
--
-- NEDEN GEREKLİ: `menu_log` sonsuza kadar büyüyen tek tablomuz. Ölçüm:
-- satır başına ~191 bayt veri, indekslerle ~0,3 kB. 90 şube günde ortalama
-- 5 değişiklik yaparsa ~450 satır/gün ≈ 55 MB/yıl. Tek başına yıkıcı değil
-- ama hiç silinmezse tavanı yok.
--
-- NEDEN 12 AY: günlüğün işi "bu ay bu ürünü kim kapattı" sorusuna cevap
-- vermek. Bir yıl öncesine kimse bakmıyor; menü zaten defalarca değişmiş
-- oluyor. Bu sınırla tablo ~55 MB'da sabitleniyor.
--
-- NEDEN WORKER CRON'U DEĞİL: Worker'ın çağrı başına 50 alt-istek bütçesi
-- var ve gecelik Meta/Google çekimi orada zaten sıkışık (bkz.
-- scheduled-fetch.js). Temizlik veritabanının içinde, o bütçeye hiç
-- dokunmadan çalışıyor.
create extension if not exists pg_cron;

-- Ayın 1'i, 03:00 UTC (Türkiye'de 06:00) — trafiğin en düşük olduğu saat.
-- Aynı adla yeniden zamanlamak eskisini değiştirir; migration tekrar
-- çalıştırılabilir kalsın diye önce siliniyor.
select cron.unschedule('menu-log-temizlik')
where exists (select 1 from cron.job where jobname = 'menu-log-temizlik');

select cron.schedule(
    'menu-log-temizlik',
    '0 3 1 * *',
    $$delete from menu_log where zaman < now() - interval '12 months'$$
);
