-- 0007_uid_eslesme.sql — Firebase uid ↔ Supabase uid eşlemesi (Faz 2 / B1)
--
-- Firebase uid'leri 28 karakterlik kendi formatında; Supabase uuid veriyor.
-- ilerleme.uid ve kullanici_sube.uid bu tabloya bakılarak yeni değerlere çevrildi.
--
-- Tablo geçişten SONRA da durur: B2'deki çift doğrulayıcı haftasında ESKİ Firebase
-- token'ıyla gelen istekte uid'i UUID'ye çevirmek için okunur (yoksa eski oturumlar
-- kendi kayıtlarını bulamaz). Firebase dalı B5'te silinince bu tablo da düşer.
--
-- uid kolonları text olarak KALIYOR (uuid tipine çevrilmedi): PostgREST filtreleri
-- ve mevcut sorgular string'le çalışıyor, tip değişimi kazanç getirmiyor.
-- auth.users'a FK de YOK — kullanıcı silinince ilerleme kayıtlarının cascade
-- silinmesi mevcut davranışı değiştirirdi.

create table uid_eslesme (
  firebase_uid text primary key,
  supabase_uid uuid not null unique,
  eposta       text,
  olusturma    timestamptz not null default now()
);

alter table uid_eslesme enable row level security;
