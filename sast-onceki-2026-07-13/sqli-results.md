# SQL Injection (SQLi) — Sonuç

**Durum: UYGULANAMAZ** (not applicable)

## Neden

Proje tek veri deposu olarak Firestore (Firebase Admin SDK) kullanır. Klasik SQL
veritabanı, ORM veya sorgu dili yoktur.

## Doğrulama

- `grep -rniE "\b(SELECT|INSERT INTO|DELETE FROM)\b|knex|sequelize|pg|mysql|sqlite3|typeorm|prisma"`
  → backend'de **hiç eşleşme yok**.
- `backend/package.json` bağımlılıklarında SQL sürücüsü / ORM **yok** (`pg`, `mysql`,
  `sequelize`, `knex`, `prisma` vb. bulunmuyor).
- Tüm veri erişimi Admin SDK sorgularıyla (`db.collection(...).where(...)`,
  `db.doc(...).get()`, `db.getAll(...)`) yapılıyor — parametreler değer olarak
  bağlanır, string birleştirmeyle sorgu dili üretilmez.

## Firestore-özel enjeksiyon değerlendirmesi (düşük risk)

Firestore'da SQLi karşılığı, kullanıcı girdisinin doküman yoluna (doc id / koleksiyon
adı) doğrudan girmesidir (path/doc-id lookup). Buradaki risk düşük:
- Doc id enjeksiyonu Firestore'da rastgele veri okuma/yazmaya değil, en fazla farklı
  bir dokümana erişime yol açar — bu bir **IDOR/yetkilendirme** konusudur, SQLi değil.
- Bu yüzey `sast/idor-results.md` ve `missingauth` kapsamında değerlendirilmelidir
  (ör. `/api/upload/proxy/*` ham key, `subeSlug`/`kod` parametreleri).

## Sonuç

SQL yüzeyi olmadığından SQLi sınıfı bu kod tabanı için uygulanamaz. Girdi→doküman-yolu
riski ayrı sınıflarda (IDOR/missingauth) ele alınıyor.
