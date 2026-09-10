-- Ortam bağımsız oran sınırı sayacı.
--
-- NEDEN VERİTABANI: süreç-içi sayaç (express-rate-limit) Workers'ta anlamsız —
-- her isolate ayrı bellek. `worker.js` bu yüzden `limitAyarla(limitYok)`
-- kaydediyor ve `oranSiniri()` üretimde no-op oluyordu; kodda "oran sınırlı"
-- diyen her yorum canlıda geçersizdi. Kenar (WAF) kuralı da kodda görünmüyor.
--
-- YAZIM SINIRA TAKILINCA DURUR: önce sayılır, sınır aşıldıysa satır YAZILMADAN
-- reddedilir. Böylece anahtar başına pencerede en fazla `max` satır yazılır ve
-- sayacın kendisi bir yazma amplifikasyonu hâline gelmez.
create table if not exists public.oran_sayaci (
    id      bigint generated always as identity primary key,
    anahtar text        not null,
    zaman   timestamptz not null default now()
);

create index if not exists oran_sayaci_anahtar_zaman_idx
    on public.oran_sayaci (anahtar, zaman desc);

alter table public.oran_sayaci enable row level security;

select cron.unschedule('oran-sayaci-temizlik')
where exists (select 1 from cron.job where jobname = 'oran-sayaci-temizlik');

select cron.schedule(
    'oran-sayaci-temizlik',
    '17 3 * * *',
    $$delete from public.oran_sayaci where zaman < now() - interval '1 day'$$
);
