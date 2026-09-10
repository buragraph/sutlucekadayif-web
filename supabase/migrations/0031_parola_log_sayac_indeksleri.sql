-- Parola belirleme sınırı bu tabloyu sayaç olarak kullanıyor (bkz.
-- routes/parola.js `sinirAsildiMi`). Her istekte son bir saatteki denemeler
-- e-posta ve IP'ye göre sayılıyor; indeks olmadan tablo büyüdükçe kimliksiz
-- bir uç her çağrıda tam tarama yapardı — sınırın kendisi DoS'a dönüşürdü.
create index if not exists parola_log_eposta_zaman_idx
    on public.parola_belirleme_log (eposta, zaman desc);
create index if not exists parola_log_ip_zaman_idx
    on public.parola_belirleme_log (ip, zaman desc);
