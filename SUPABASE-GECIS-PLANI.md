# Supabase Geçiş Planı

> Karar: sistem topluca Supabase (Postgres) altyapısına geçecek; yeni backend ayrı
> klasörde (`backend-v2/`) inşa edilir, hazır olunca tek seferde geçilir.
> Tarih: 2026-08-01. Ölçülen veri hacmi: 88 şube, 874 dönem, 537 ürün, 14 kategori,
> 287 medya, 7 kurs + 86 ders, 5 kullanıcı-şube ≈ **1.900 satır** — tam aktarım
> saniyeler sürer; geçiş anının riski bu yüzden düşüktür.
>
> **Yol haritası üç fazdır ve sırası bilinçlidir:**
> **Faz 1** veri katmanı (Firestore → Postgres, A0–A6) ·
> **Faz 2** kimlik (Firebase Auth → Supabase Auth, B0–B3) ·
> **Faz 3** barındırma (Functions → Cloudflare Workers, C0–C2).
> Auth, Workers'tan ÖNCE taşınır: `firebase-admin` SDK Workers'ta çalışmaz
> (Node/gRPC); Faz 1 sonrası tek görevi auth doğrulamak olduğundan Faz 2 onu
> repo'dan tamamen siler ve Faz 3 saf bir barındırma değişikliğine iner.
> Nihai durum: **Cloudflare (Workers + R2 + statik) + Supabase (Postgres + Auth)**
> — Firebase/GCP tamamen kapanır.

## 0. Değişen / değişmeyen

| Katman | Karar |
|---|---|
| **Veritabanı** | Firestore → **Supabase Postgres** (Faz 1'in konusu yalnızca bu) |
| Auth | **Faz 1'de Firebase Auth KALIR** (custom claim'ler, `verifyIdToken` aynen — Faz 1'in risk yüzeyi büyümez). **Faz 2'de Supabase Auth'a taşınır** (§4b). |
| Backend framework | **Express KALIR**; Faz 1'de Functions ikinci codebase (`api2`), **Faz 3'te Cloudflare Workers'a taşınır** (§4c — Hono portu). Next.js yok (ayrıca değerlendirildi, gerekçesi çıkmadı). |
| Frontend | React/Vite KALIR. API sözleşmesi korunduğu için tek değişiklik `VITE_API_URL`. |
| Müşteri menüsü | R2'deki statik JSON boru hattı KALIR (0 okuma modeli). Sadece `menu-builder` verisini Postgres'ten alır. |
| Görseller / medya | R2 KALIR. |
| Tanıtım sitesi | Astro (`site/`) KALIR, hiç dokunulmaz. |
| Zamanlanmış iş | `onSchedule` 07:00 çekimi KALIR, v2 codebase'ine taşınır (tek-aktif bayrağıyla). |

**Sabit kural: API sözleşmesi bire bir korunur** — aynı yollar, aynı JSON şekilleri,
aynı hata kodları. Bu, (a) frontend'i değişimden muaf tutar, (b) eski/yeni yanıtları
otomatik diff'lemeyi mümkün kılar (bkz. §5).

## 1. Hedef mimari

```
Panel (React/Vite, Cloudflare)  ──►  api2 (Express, Functions europe-west1)
                                        │  supabase-js (service_role)
                                        ▼
                                     Supabase Postgres (eu-central-1 Frankfurt)
                                        │
Müşteri (QR) ──► R2 menu/{sube}.json ◄──┘ (menu-builder yazar)
Firebase Auth ──► ID token ──► verifyIdToken (değişmez)
Meta/Google API ──► cron (v2) ──► donemler tablosu
```

- **Bölge eşleşmesi:** DB Frankfurt (`eu-central-1`), Functions v2 `europe-west1`.
  Mevcut `us-central1`'da kalmak her sorguya ~100ms transatlantik gecikme eklerdi.
  URL zaten değişiyor (`api2`), frontend env flip'i bunu görünmez yapar.
- **Erişim modeli:** Postgres'e YALNIZCA backend erişir (`service_role` key, Functions
  secret'ı). Tüm tablolarda RLS açık + sıfır policy = dışarıdan her şey kapalı.
  `anon` key hiçbir yerde kullanılmaz; frontend Supabase'i hiç görmez.
- **Sürücü:** `supabase-js` (PostgREST/HTTP) — durumsuz, bağlantı havuzu derdi yok
  (Functions için kritik). Karmaşık sorgular view + `rpc` (SQL fonksiyonu) ile.
  Ham `pg` YALNIZCA gerekirse ve Supavisor transaction modu (6543) + `maxInstances`
  sınırıyla.
- Supabase MCP bağlı — proje kurulumu, migration uygulama ve SQL çalıştırma
  doğrudan buradan yapılabilir.

## 2. Klasör düzeni

```
backend-v2/
  config/supabase.js          # createClient(service_role) — tek nokta
  middleware/                 # auth.js AYNEN kopya (dokunulmaz), cache.js sadeleşir
  modules/{reports,qr-menu,academy}/
  routes/
  server.js                   # CORS→limiter sırası korunur, onSchedule buraya
supabase/
  migrations/*.sql            # şema, sürümlü (supabase CLI / MCP apply_migration)
scripts/supabase-import/      # Firestore→PG aktarım (tablo başına bir script, upsert)
scripts/parite/               # eski/yeni yanıt diff harness'ı (§5)
```

Aynı repo'da kalınır: `shared/permissions.js` ↔ `backend*/shared/permissions.js`
ikizliği, `firebase.json` çoklu-codebase desteği ve ortak scriptler bunu gerektirir.

## 3. Şema tasarımı (çekirdek DDL)

Firestore doküman id'leri **korunur** (text PK) — URL'ler, R2 dosya adları ve
frontend state'i id'lere bağlı; yeniden üretmek gereksiz kırılma yaratır.
Adlandırma Türkçe, mevcut alan adlarıyla uyumlu (`sube`, `donem`, `fiyat`).

```sql
-- ── Temel ──
create table subeler (
  kod        text primary key,          -- slug: 'kayseri'
  ad         text not null,
  il         text, ilce text,
  adres      text default '',
  link       text default '',
  olusturma  timestamptz not null default now()
);
-- konumlar tek-doküman deseni ve konum-store.js transaction'ı ÖLÜR:
-- il/ilce artık şube satırının kolonu, eşzamanlı yazma sorunu yapısal olarak yok.

create table kategoriler (
  id      text primary key,
  ad      text not null,
  sira    int  not null default 0,
  tur     text not null default 'ortak' check (tur in ('ortak','sube_ozel')),
  renk    text, gorsel text default '',
  kilitli boolean not null default false
);

-- ── QR menü ──
create table urunler (
  id        text primary key,
  ad        text not null,
  fiyat     numeric not null,
  kategori_id text references kategoriler(id),
  aciklama  text default '',
  etiket    text[] not null default '{}',
  gorsel    text default '',
  miktar    numeric, birim text default '', kalori numeric,
  tur       text not null default 'ortak' check (tur in ('ortak','sube_ozel')),
  sube_kod  text references subeler(kod),      -- yalnız sube_ozel dolu
  kilitli   boolean,                            -- null = kategoriden miras
  silinme   timestamptz,                        -- soft delete (deletedAt)
  olusturma timestamptz not null default now(),
  check (tur = 'sube_ozel' or sube_kod is null)
);

-- Beş şube-bazlı dizinin (menude_subeler, gizli_subeler, mevcut_degil,
-- fiyat_override, fiyat_serbest) relasyonel karşılığı — TEK tablo:
create table urun_sube (
  urun_id        text not null references urunler(id) on delete cascade,
  sube_kod       text not null references subeler(kod) on delete cascade,
  menude         boolean not null default false,   -- opt-in
  gizli          boolean not null default false,   -- merkez yasağı
  mevcut_degil   boolean not null default false,   -- şube stok kapatması
  fiyat_override numeric,
  fiyat_serbest  boolean not null default false,
  primary key (urun_id, sube_kod)
);
-- Satır yoksa = varsayılanlar (menüde değil, gizli değil...). Kural sırası
-- (gizli → menude → mevcut_degil → fiyat_override) tek WHERE'e iner:
--   select u.*, coalesce(us.fiyat_override, u.fiyat) as etkin_fiyat
--   from urunler u join urun_sube us on us.urun_id = u.id
--   where us.sube_kod = $1 and us.menude and not us.gizli
--     and not us.mevcut_degil and u.silinme is null;
-- Bu sorgu menu-builder'ın tamamıdır. PAYLASIM_ESIGI, katalog-cache,
-- array-contains stratejisi, mevcut_degil sızıntı riski: hepsi ÖLÜR.

-- ── Raporlar ──
create table donemler (
  id         bigint generated always as identity primary key,
  sube_kod   text not null references subeler(kod) on delete cascade,
  baslangic  date not null,
  bitis      date not null,
  -- Otomatik çekilen metrikler (Meta/Google). Kesin kolon listesi import
  -- scripti yazılırken reports/db.js'ten çıkarılır — dönem dokümanlarında
  -- bilinen ŞEMA KAYMASI var (2 farklı alan seti), import normalize eder.
  harcama numeric, erisim numeric, gosterim numeric,
  google_cagri numeric, google_yol_tarifi numeric, google_web_tiklama numeric,
  -- Yalnızca elle girilen bütçe alanları (eski veri_overrides'ın çözülmüş hâli):
  planlanan_butce numeric, devredilen_miktar numeric, merkez_destegi numeric,
  guncelleme timestamptz not null default now(),
  unique (sube_kod, baslangic, bitis)
);
-- Override semantiği artık YAPISAL: çekim yalnızca metrik kolonlarını
-- UPDATE eder, bütçe kolonlarına hiç dokunmaz. "Donmuş override" sınıfı ölür.
-- applyDonemWrite + recalcSubeAggregates + donem_ozetleri denormalizasyonu
-- ölür; aggregate'ler view olur:
create view sube_toplamlari as
  select sube_kod, sum(harcama) toplam_harcama, sum(erisim) toplam_erisim,
         count(*) donem_sayisi
  from donemler group by sube_kod;

create table kampanyalar (      -- reports/butce dokümanındaki map açılır
  id text primary key, ad text,
  donem_baslangic date, donem_bitis date
  -- bütçe alanları: import sırasında koddan çıkarılır
);
create table meta_eslesme  ( desen text primary key, sube_kod text references subeler(kod) );
create table google_konum  ( sube_kod text primary key references subeler(kod), location_id text );

-- ── Diğer ──
create table ayarlar (          -- menu_cache duraklatma bayrağı vb.
  anahtar text primary key, deger jsonb not null,
  guncelleme timestamptz not null default now()
);
create table medya (
  id text primary key, url text not null, klasor text, ad text,
  boyut int, olusturma timestamptz
);
create table kurslar   ( id text primary key, ad text, aciklama text, sira int,
                         hedef jsonb );
create table dersler   ( id text primary key, kurs_id text references kurslar(id)
                         on delete cascade, sira int, baslik text, icerik jsonb );
create table ilerleme  ( uid text, ders_id text references dersler(id) on delete cascade,
                         tamamlanma timestamptz, primary key (uid, ders_id) );
create table kullanici_sube ( uid text primary key, sube_kod text references subeler(kod),
                              rol text, ad text, email text );

-- Hepsi: alter table ... enable row level security;  (policy YOK = deny-all)
```

**Ölen karmaşıklıklar** (Firestore'a özgü, taşınmaz):
`applyDonemWrite` / `recalcSubeAggregates` / `donem_ozetleri`, `konum-store.js`,
`katalog-cache.js` + `bumpKatalogVersion` middleware'i, `PAYLASIM_ESIGI` çift okuma
stratejisi, `versionedCacheMiddleware` + `bumpDataVersion` (Postgres'te okuma bedava;
sıcak uçlara istenirse düz 60 sn TTL cache yeter), bileşik indeks tuzağı,
`findProduct` collectionGroup fallback'i.

## 4. Faz 1 — Veri katmanı (A0–A6)

Her aşamanın çıkış kriteri var; kriter sağlanmadan sonrakine geçilmez.

**A0 — Zemin.** Supabase projesi (Frankfurt, `eu-central-1`); plan: **free**
(karar 2026-08-01 güncellendi — sistem her gün kullanıldığı için uyuma koşulu
oluşmaz; free'nin yedek boşluğu gece `pg_dump` → R2 göreviyle kapatılır, bkz.
riskler). `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` Functions
secret'ına. `backend-v2/` iskeleti + `config/supabase.js` + health ucu.
*Çıkış: boş şema migration'la deploy edilmiş, iskelet lokalde 200 dönüyor.*

**A1 — Şema + veri aktarımı.** `supabase/migrations/` DDL'leri; tablo başına
tekrar-çalıştırılabilir (upsert) import scripti. Şema kayması burada normalize
edilir. Doğrulama scripti: satır sayıları, rastgele örneklem alan-alan
karşılaştırma, sayısal toplamlar (örn. `sum(harcama)` iki tarafta eşit).
*Çıkış: prod Firestore'un tam kopyası Supabase'de, doğrulama raporu sıfır fark.*

**A2 — backend-v2 inşası.** Express kopyalanır, veri katmanı modül modül değişir.
Sıra: **ortak rotalar → qr-menü → akademi → raporlar** (en karmaşık olan raporlar,
kalıplar oturduktan sonra). `middleware/auth.js` aynen; `server.js`'te CORS→limiter
sırası korunur; ürün rotalarında `/katalog` `/:id`'den önce kalır. R2 boru hattı
(menu-builder, regenerate tetikleri, duraklatma bayrağı) Postgres'ten okur.
*Çıkış: tüm rotalar lokalde çalışır, kalori dahil güncel özellikler eksiksiz.*

**A3 — Parite kapısı (asıl güvence).** `scripts/parite/`:
- **GET replay-diff:** admin + 3 farklı şube sahibi token'ıyla TÜM GET uçları eski
  ve yeni API'ye çağrılır, yanıtlar normalize edilir (dizi sıralama, alan sırası),
  JSON diff. Hedef: sıfır fark ya da tek tek açıklanıp onaylanmış farklar.
- **Yazma senaryoları:** ürün ekle/düzenle/sil, menüye al/çıkar, fiyat override,
  bütçe girişi, dönem çekimi (mock) → DB durumu + üretilen R2 JSON karşılaştırılır.
- **88 menü JSON'u** yeni backend'den `menu-v2/` prefix'ine üretilir, mevcutla
  normalize diff (bu oturumda aynı teknik byte-uyumlu doğrulanmıştı).
*Çıkış: diff raporu temiz. Bu kapı geçilmeden A4 yok.*

**A4 — Paralel yayın.** `firebase.json`'a ikinci codebase: `api2`
(`europe-west1`). v2'de cron **kapalı** (`CRON_AKTIF` bayrağı) — çift çekim ve
çift yazma olmaz. Lokal frontend `VITE_API_URL=api2` ile gerçek kullanım testi
(panel: ürün düzenle, bütçe gir, menü yenile).
*Çıkış: api2 prod'da, elle uçtan uca kullanım sorunsuz.*

**A5 — Geçiş (tek gece).** Sıra:
1. Menü yazımı duraklat + panele kısa bakım notu (yazma dondurması ~15 dk).
2. Son TAM import (1.900 satır — saniyeler) + doğrulama scripti.
3. Frontend `VITE_API_URL` flip + deploy (wrangler, ~30 sn).
4. Cron: eski codebase'te kapat, v2'de aç.
5. 88 menü JSON'u v2'den yeniden üret, 2-3 şube smoke test (bugünkü kontrol seti).
*Çıkış: panel + menüler + cron yeni altyapıda. Geri dönüş: env flip geri + eski
cron aç — dondurma penceresi kısa tutulduğu için kayıp yazma yok denecek kadar az.*

**A6 — Söküm.** 1–2 hafta gözlem (eski api dokunulmadan durur — geri dönüş
sigortası). Sonra: Firestore tam export → R2'ye arşiv, eski codebase silinir,
Firestore güvenlik kuralları deny-all'a çekilir. Faz 1 sonunda Firebase Auth
hâlâ yaşar; Firebase'den tam çıkış Faz 2–3'ün işidir.

## 4b. Faz 2 — Kimlik: Firebase Auth → Supabase Auth (B0–B3)

Faz 1 stabilize olduktan sonra başlar. Ölçülen envanter: **5 kullanıcı**
(3 admin, 1 şube sahibi, 1 claimsiz), hepsi e-posta/parola, UID'ler 28 karakterlik
Firebase formatı (UUID DEĞİL → remap şart). Bu ölçekte asıl iş kod, veri değil.

**Değişmeyen ilke:** Supabase Auth'a geçmek, frontend'in veritabanına doğrudan
erişmesi demek DEĞİLDİR. RLS deny-all kalır, tüm veri erişimi backend'den
(`service_role`) geçer; Supabase Auth yalnızca kimlik sağlayıcıdır. `req.user`
şekli de sabittir: `{ uid, email, role, subeSlug }` — bu sayede `requirePermission`
ve tüm rota gövdeleri hiç değişmez.

**B0 — Envanter.** Backend'de `admin.auth()` kullanan yerler (verifyToken,
users/onboarding rotaları — createUser, setCustomClaims, listUsers); frontend'de
`firebase/auth` geçen 4 dosya (login, token interceptor, oturum dinleyici).
*Çıkış: dokunulacak dosya listesi.*

**B1 — Kullanıcı taşıma + UID remap.** Supabase Auth'a kullanıcı aktarımı:
- Tercih: Firebase scrypt hash parametreleriyle (Console → Authentication →
  Password hash parameters) GoTrue'nun firebase-scrypt desteği üzerinden içe
  aktarım — parolalar korunur.
- Yedek plan: 5 kişilik ekip için koordineli parola sıfırlama (maliyeti sıfıra yakın).
- `role` + `subeSlug` → `app_metadata` (JWT'ye girer; admin API'siz değiştirilemez —
  custom claim'in birebir karşılığı).
- **UID eşleme tablosu** (`uid_eslesme: firebase_uid → auth.users.id`) ve
  `ilerleme.uid` + `kullanici_sube.uid` kolonlarının remap scripti. Bu atlanırsa
  akademi ilerlemesi ve şube atamaları yetim kalır.
*Çıkış: tüm kullanıcılar Supabase Auth'ta, claim'ler app_metadata'da, remap
doğrulaması temiz (her eski uid'in yeni karşılığı var, yetim satır 0).*

**B2 — Backend çift doğrulayıcı.** `verifyToken` iki token'ı da kabul eder:
önce Supabase JWT (jose ile; HS256 `SUPABASE_JWT_SECRET` ya da projenin JWKS'i),
düşerse Firebase (`verifyIdToken`). İkisi de aynı `req.user` şeklini üretir.
Bu, frontend geçişini kesintisiz yapar — panel kullanıcılarının oturumu düşmez.
*Çıkış: iki token türüyle de tüm rotalar çalışıyor (parite harness'ı iki
token'la koşulur).*

**B3 — Frontend geçişi + söküm.** `firebase/auth` → `supabase-js` auth
(signInWithPassword, onAuthStateChange, interceptor'da `session.access_token`).
Deploy sonrası herkes bir kez yeniden giriş yapar (5 kişi, koordine edilir).
1 hafta sonra Firebase doğrulama yolu silinir → `firebase-admin` ve `firebase`
client SDK repo'dan ÇIKAR. users/onboarding rotaları Supabase Admin API kullanır.
*Çıkış: repo'da hiçbir firebase importu kalmadı; Firebase projesi artık yalnızca
boş bir kabuk.*

## 4c. Faz 3 — Barındırma: Functions → Cloudflare Workers (C0–C2)

Faz 2 sayesinde bağımlılıklar Workers-uyumlu: `supabase-js` (fetch tabanlı),
`jose` (WebCrypto). Kalan iş Express'in kendisi ve Node'a özgü parçalar.

**C0 — Uyumluluk envanteri.** Workers'ta çalışmayanların denetimi:
- Görsel işleme (`sharp` vb. varsa) — Workers'ta native modül yok; çözüm:
  Cloudflare Images ya da yüklemede istemci tarafı dönüşüm. Envanter net çıkarır.
- `express-rate-limit` + `node-cache` — isolate belleği kalıcı değil; rate limit
  **Cloudflare edge kurallarına** taşınır (dashboard, kod silinir), cache ihtiyacı
  Postgres sonrası zaten minimal.
- `multer`/dosya yükleme → Workers native FormData.
*Çıkış: Workers'ta çalışmayan parça listesi + her biri için karar.*

**C1 — Port.** Express → **Hono** (Workers-yerlisi, Express'e çok yakın API;
rota gövdeleri mekanik taşınır, sözleşme aynı). Kazançlar:
- **R2 native binding** — S3 API ve `R2_*` anahtarları ÖLÜR (bugünkü "anahtar
  nerede" sorunu sınıf olarak biter).
- **Cron Triggers**: `0 4 * * *` UTC = 07:00 İstanbul (TR'de DST yok, sabit +3).
  `CRON_AKTIF` bayrağı Faz 1'deki gibi tek-aktif garantisi verir.
- Bölge sorunu biter (edge çalışır; DB'ye yakınlık için Smart Placement açılır).
- Secrets → `wrangler secret` (CMS ile aynı araç zinciri — tek deploy aleti).
*Çıkış: Worker lokalde (wrangler dev) tüm rotalarla çalışıyor.*

**C2 — Parite + geçiş + tam söküm.** A3 harness'ı aynen: eski (Functions) vs
yeni (Worker) diff. Paralel yayın → frontend env flip → gözlem → Functions
kapanır. Ardından: Firebase projesi (arşiv sonrası) ve GCP tamamen silinir.
*Çıkış: prod trafiği Worker'da; fatura ve yönetim iki sağlayıcıya indi:
Cloudflare + Supabase.*

## 5. Bekçi listesi — taşınırken kaybolmaması gereken kurallar

Bu sistemin pahalıya öğrenilmiş, koddan görünmeyen kuralları. v2'de her biri ya
yapısal olarak çözülmüş ya da bilinçli korunmuş olmalı; A3 kapısında tek tek işaretlenir:

- [ ] **Müşteri projeksiyonu whitelist** (`musteriAlanlari`) — R2 JSON auth'suz;
      yönetim alanı asla sızmaz. (Bu oturumda 3 kez sızdı, kural: tek kaynak.)
- [ ] **Rol bazlı yanıt projeksiyonu** (`yanitProjeksiyonu`) — şube sahibi
      `fiyat_override`/`gizli`/`menude`/`fiyat_serbest` görmez; SQL'de kolon
      listeleri + tek yardımcı fonksiyonla korunur. `mevcut_degil` şubeye özel
      boolean'a iner (açık iş — task_224f8ceb).
- [ ] **Katalog kural sırası** gizli → menude → mevcut_degil → override — artık
      tek WHERE; testi yine de yazılır.
- [ ] **Override semantiği** — çekim bütçe kolonlarına dokunmaz (yapısal oldu;
      import UPDATE kolon listesi test edilir).
- [ ] **İzin dosyası ikizliği** — `shared/` ↔ `backend-v2/shared/` aynı dosya.
- [ ] **CORS → rate limiter sırası** (429'un CORS hatasına dönüşmemesi).
      *(Faz 3'te limiter edge'e taşınınca bu bekçi kendiliğinden düşer.)*
- [ ] **`req.user` şekli sabittir** — `{ uid, email, role, subeSlug }`; Faz 2
      auth değişiminde de korunur, rota gövdeleri kimlik sağlayıcıyı bilmez.
- [ ] **UID remap bütünlüğü** (Faz 2) — `ilerleme` ve `kullanici_sube`'de yetim
      uid kalmadığı doğrulanır.
- [ ] **0 değeri "boş" değildir** — kalori 0, fiyat override kontrolleri
      `!= null` ile (opsiyonelSayi kalıbı).
- [ ] **Route sırası** — `/katalog`, `/cache-durumu` gibi sabit yollar `/:id`
      kalıplarından önce.
- [ ] **Cron tek-aktif** — aynı anda yalnızca bir codebase çekim yapar.
- [ ] **GRACE_DAYS penceresi** ve Meta token 190/463 hatasının alarma dönüşmesi
      (token 30 Tem'da doldu, yenilenecek — geçişten bağımsız açık iş).
- [ ] **Şube sahibi kendi şubesi dışına yazamaz** — her yazma ucunda
      `req.user.subeSlug` kontrolü (A3 yazma senaryolarında negatif testler).

## 6. Riskler

| Risk | Karşılık |
|---|---|
| **İki sistem sendromu** — paralel dönem uzar, ikisine birden bakım başlar | A4→A5 arası kısa tutulur; A4'te Firestore'a özellik EKLENMEZ (donma). Yeni özellik ihtiyacı çıkarsa ya bekler ya doğrudan v2'ye yazılır. |
| Şema kayması sürprizleri | A1 doğrulaması alan-alan örneklem + toplam karşılaştırması yapar; bilinmeyen alan görünce durur, sessizce atlamaz. |
| PostgREST'in yetmediği sorgu | View/`rpc` ile çözülür; ham `pg` son çare (Supavisor 6543 + maxInstances). |
| Bölge gecikmesi | Functions v2 `europe-west1` + DB Frankfurt (mimari kararı, §1). |
| Free tier uyuması | Uyuma koşulu (1 hafta sıfır istek) günlük cron + panel kullanımıyla fiilen oluşmaz; uyusa bile müşteri menüleri R2'den servis edildiği için etkilenmez, panel tek tıkla geri açılır. Pro'ya ancak bu bir kez yaşanırsa bakılır. |
| Free'de otomatik yedek yok | Gece cron'una `pg_dump` → R2 (son 14 gün) — G8 görevi. Veri ~1.900 satır, dump saniyeler. |
| Geçiş penceresinde kaybolan yazma | Yazma dondurması + duraklatma bayrağı; pencere ~15 dk. |
| R2 anahtarları / secrets | v2 secret seti A0'da kurulur; `serviceAccountKey.json` deploy paketine girmemeli (ignore listesi — mevcut açık iş). |
| **UID remap atlanırsa** (Faz 2) akademi ilerlemesi / şube ataması yetim kalır | `uid_eslesme` tablosu + remap scripti + yetim-satır doğrulaması B1 çıkış kriteri. |
| Scrypt hash içe aktarımı başarısız olursa | 5 kişilik ekip — koordineli parola sıfırlama, maliyeti dakikalar. |
| Çift doğrulayıcı penceresi uzarsa iki auth sistemine bakım başlar | B2→B3 arası 1 hafta ile sınırlı; sonra Firebase yolu silinir. |
| Workers'ta çalışmayan Node bağımlılığı (sharp, native modüller) | C0 envanteri geçiş ÖNCESİ çıkarır; çözümsüz parça varsa Faz 3 başlamaz. |
| Hono portunda davranış farkı (route sırası, middleware) | A3/C2 parite harness'ı aynı diff'i Worker'a karşı koşar; fark = geçiş yok. |

## 7. İlk somut adımlar

1. Supabase projesi aç (Frankfurt) — bağlı Supabase MCP ile yapılabilir.
2. `supabase/migrations/0001_temel.sql` — §3 DDL'inin tamamı.
3. `scripts/supabase-import/` — ilk script: `subeler` (en küçük, kalıbı kurar).
4. `backend-v2/` iskeleti: `config/supabase.js` + `server.js` + health ucu.
