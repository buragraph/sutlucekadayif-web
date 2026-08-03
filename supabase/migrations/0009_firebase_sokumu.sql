-- 0009_firebase_sokumu.sql — geçiş dönemi tablolarının kaldırılması (Söküm/S2)
--
-- Firebase dalı `middleware/auth.js`'ten silindi; bu iki tablonun tek kullanıcısı
-- oydu:
--   auth_dal_log — D2 sayacı. Kapı sonucu: T0=2026-08-01T17:41:10Z'den itibaren
--                  firebase dalına DÜŞEN İSTEK YOK (0 satır), supabase tarafında
--                  28 istek kaydı var (yani ölçüm boş kümeden gelmiyor).
--   uid_eslesme  — Firebase uid → Supabase uuid çevirisi. Firebase token'ı artık
--                  kabul edilmediği için çeviriye gerek kalmadı.
--
-- uid_eslesme'nin içeriği SİLİNMEDEN ÖNCE arşive alındı:
--   R2 `arsiv/firestore-2026-08-01/_uid-eslesme.json.gz`
-- Firestore arşivindeki eski uid'leri bugünkü kullanıcılara bağlamak gerekirse
-- oradan okunur (e-posta da ikinci bir birleştirme anahtarı olarak duruyor).

drop table if exists auth_dal_log;
drop table if exists uid_eslesme;
