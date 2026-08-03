# Faz 2 — Firebase Auth → Supabase Auth (Uygulama Görevleri)

> Uygulayıcı oturum içindir. Strateji: `SUPABASE-GECIS-PLANI.md` §4b.
> Faz 1 çalışma kuralları AYNEN geçerli (GECIS-GOREVLERI.md başı): dar okuma,
> doğrula-geç, sözleşme korunur, uzun çıktılar dosyaya.
> Envanter 2026-08-01 akşamı canlıdan çıkarıldı — yeniden keşif GEREKMEZ.

## Değişmez ilkeler

1. **`req.user` şekli sabit:** `{ uid, email, role, subeSlug }`. Rota gövdeleri
   kimlik sağlayıcıyı bilmez; değişen YALNIZCA `verifyToken`'ın içi ve admin
   kullanıcı yönetimi çağrıları.
2. **RLS deny-all KALIR.** Frontend'e giren publishable/anon key yalnızca
   Auth uçlarına yarar; veritabanına frontend'den erişim yine imkânsız.
3. **Firebase kullanıcıları SİLİNMEZ.** Rollback sigortası: eski bundle + eski
   API + Firebase Auth üçlüsü söküme kadar çalışır durumda kalır.
4. **Geçiş kesintisiz:** önce backend iki token'ı da kabul eder (B2), sonra
   frontend döner (B3). Oturumu düşen olmaz; herkes bir sonraki girişte
   Supabase'le girer.

## Envanter (sabit — tekrar arama)

**Kullanıcılar (5):** 3 admin, 1 `sube_sahibi` (denizli), 1 claimsiz
(`sube_slug` null'a çevrilmişti). Hepsi email+parola. UID'ler 28 karakter
Firebase formatı → Supabase UUID verecek → **remap şart**.

**Backend (backend-v2) dokunulacak dosyalar:**
- `middleware/auth.js:19` — `verifyIdToken` (tek doğrulama noktası)
- `routes/users.js` — `listUsers:30, createUser:90, setCustomUserClaims:106+165,
  updateUser:149, deleteUser:201`
- `routes/onboarding.js:109`, `routes/profil.js:77` — `updateUser(displayName)`
- `config/firebase.js` — Faz 2 sonunda yalnızca bunlar kalana kadar küçülür;
  tam silme B5'te (söküm).

**Frontend dokunulacak dosyalar:**
- `src/firebase.js` — auth init → supabase client'a döner
- `src/context/AuthContext.jsx` — 9 çağrı (signIn, onAuthStateChanged, signOut...)
- `src/services/api.js` — interceptor `getIdToken` → `session.access_token`
- `src/modules/reports/hooks/useReports.js` — 1 `getIdToken`

**Remap edilecek tablolar:** `ilerleme.uid` (4 satır), `kullanici_sube.uid`
(5 satır). Başka uid taşıyan tablo yok (formlar anonim).

## B0 — Supabase Auth yapılandırması

**Yap:** MCP ile proje auth ayarlarını kontrol et/ayarla:
- Email provider açık; **public signup KAPALI** (kullanıcıyı yalnızca admin
  API yaratır) — kapatılamıyorsa signup'ı engelleyen not düş, panelde signup
  akışı zaten yok.
- Email confirmation admin-yaratımlı kullanıcılar için kapalı
  (`email_confirm: true` ile yaratılır).
- Token doğrulama malzemesi: yeni projelerde asimetrik imza anahtarları →
  JWKS URL (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`); `jose` +
  `createRemoteJWKSet` (cache'li). Proje hâlâ HS256 (legacy secret) ise
  `SUPABASE_JWT_SECRET` ile HS256 doğrula. Hangisi olduğunu MCP'den bak,
  seçimi görev dosyasına işle.
- Frontend için publishable/anon key'i al → `frontend/.env`'e
  `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (B3'te kullanılacak).

**Doğrula:** admin API ile geçici kullanıcı yarat → şifreyle token al →
JWKS/secret ile lokal doğrula → sil.

### Uygulandı — B0 (2026-08-01)

Proje: `igccwznomzgtltrxpwrd` (sutlucekadayif, eu-central-1, Postgres 17.6).

**İmza yöntemi kesinleşti: asimetrik ES256 + JWKS.** HS256/legacy secret yolu
KULLANILMAYACAK. Doğrulama malzemesi:
`https://igccwznomzgtltrxpwrd.supabase.co/auth/v1/.well-known/jwks.json`,
tek anahtar `kid=598d7efc-723f-4795-9dab-9d2991d27580`, `alg=ES256`.
`jose@^6.2.6` backend-v2'ye doğrudan bağımlılık olarak eklendi (önceden yalnızca
googleapis'in geçişli kopyası vardı — ona güvenilmez).

**GoTrue ayarları (`/auth/v1/settings`):** `email: true` ✓,
`mailer_autoconfirm: false` (admin yaratımında `email_confirm: true` şart —
yapıldı), diğer tüm sağlayıcılar kapalı, `anonymous_users: false`.
**`disable_signup: false` — public signup AÇIK. KAPATILMALI.** MCP'de auth
config YAZAN tool yok, CLI de kurulu değil → panelden: Authentication →
Sign In / Providers → Email → "Allow new users to sign up" kapat.
Kapatılmazsa: publishable key B3'te bundle'a gireceği için herkes hesap
açabilir. RLS deny-all olduğu için veritabanına ulaşamaz ve claim'siz kullanıcı
`requirePermission`'dan geçemez, ama kullanıcı tablosu kirlenir + mail kotası
harcanır. B3 deploy'undan ÖNCE kapat.

**KRİTİK BULGU — `app_metadata`'da null anahtar saklanmıyor.**
`createUser({ app_metadata: { role: 'calisan', subeSlug: null } })` çağrısı
`{"provider":"email","providers":["email"],"role":"calisan"}` döndürdü —
`subeSlug` anahtarı YOK (jsonb merge'de null = anahtarı sil).
Sonuçları: (a) B1'de şubesiz kullanıcıda `subeSlug` anahtarı hiç olmayacak,
doğrulama scripti bunu "eksik" saymamalı; (b) B2'de okuma
`subeSlug: payload.app_metadata?.subeSlug ?? null` diye normalize edilmeli;
(c) B2'de "şubeyi kaldır" güncellemesi null göndererek yapılır (anahtar silinir,
istenen davranış).

**Doğrulama koşusu (geçici kullanıcı, koşu sonunda silindi — kalan: 0 kullanıcı):**
yaratma ✓ (`email_confirm` → `email_confirmed_at` dolu), parolayla
`grant_type=password` ✓ (`expires_in=3600`, refresh_token var), JWKS ile lokal
imza doğrulaması ✓ (`sub` = user.id, `iss=<url>/auth/v1`, `aud=authenticated`),
tek karakteri bozulmuş token reddedildi ✓, `user_metadata.displayName` token'a
düşüyor ✓. JWT kökündeki `role` claim'i Postgres rolü (`authenticated`) —
bizim rolümüz `app_metadata.role`, çakışma yok.

**Frontend:** `frontend/.env`'e `VITE_SUPABASE_URL` +
`VITE_SUPABASE_ANON_KEY` (modern publishable key `sb_publishable_…`, legacy
anon JWT değil) eklendi; `.env.example` de güncellendi. Eski .env yedeği
scratchpad'de `frontend-env-yedek-b0`.

## B1 — Kullanıcı taşıma + UID remap

**Yap:**
1. `0007_uid_eslesme.sql`: `uid_eslesme (firebase_uid text primary key,
   supabase_uid uuid not null)` + RLS.
2. Parola stratejisi — İKİ YOL, kullanıcıya sor (AskUserQuestion):
   - **A (tercih):** Firebase scrypt hash import. Parametreler Firebase
     Console → Authentication → ⋮ → "Password hash parameters" (signer key,
     salt separator, rounds, mem cost) — KULLANICIDAN iste; sonra
     `auth.admin.createUser` yerine GoTrue admin API'nin hash alanlarıyla
     import. Parolalar korunur, kimse sıfırlamaz.
   - **B (yedek):** 5 kullanıcı geçici güçlü parolalarla yaratılır, liste
     kullanıcıya DM'lenmez — panelde zaten "şifremi unuttum" yok; kullanıcı
     5 kişiye yeni parolaları kendi iletir. (5 kişilik ekip, koordinasyonu
     kullanıcı üstlendi.)
3. Her kullanıcı: `app_metadata: { role, subeSlug }` (Firebase custom
   claim'lerin birebir kopyası; claimsiz kullanıcı → role 'calisan', subeSlug
   null). `email_confirm: true`.
4. `uid_eslesme` doldur → `ilerleme.uid` ve `kullanici_sube.uid` remap
   (tek transaction'lık SQL, MCP `execute_sql`).

**Doğrula:** 5 Supabase kullanıcısı; her Firebase uid'in eşi var; `ilerleme`
ve `kullanici_sube`'de eski formatlı (28 karakter) uid KALMADI; app_metadata
alanları Firebase claim'leriyle birebir (script karşılaştırsın).

### Uygulandı — B1 (2026-08-01)

**Parola yolu: B (geçici parolalar).** Sebep: Supabase yalnızca bcrypt/argon2
hash'i import ediyor, Firebase'in scrypt'ini KABUL ETMİYOR (doğrulandı:
supabase.com/docs → "Migrate from Firebase Auth"; topluluk aracı da parolayı
korumak için ayrı bir doğrulayıcı sunucu bileşeni gerektiriyor). Görev
dosyasındaki A seçeneği ("GoTrue admin API'nin hash alanlarıyla import") bu
haliyle mümkün değil. 5 kullanıcı için tek makul yol B.

**Şema:** `0007_uid_eslesme` uygulandı. uid kolonları `text` KALDI (uuid tipine
çevrilmedi) ve `auth.users`'a FK konmadı — gerekçe migration başlığında.
Ayrıca Faz 1'de MCP'den uygulanıp dosyası yazılmamış olan `0006` geri yazıldı
(`supabase/migrations/0006_kategori_null_ayrimi.sql`) — dizin artık şemayı
sıfırdan kurabilir.

**Taşıma:** `scripts/gecis/b1-kullanici-tasi.mjs` (kuru koşu varsayılan,
`--uygula` ile yazar; parolalar yalnızca 0600 dosyaya, stdout'a asla).
5 kullanıcı yaratıldı, `uid_eslesme` doldu, tek CTE'lik SQL ile remap:
`ilerleme` 4 satır, `kullanici_sube` 4 satır güncellendi.

**ENVANTER DÜZELTMESİ — Firebase'de 5 değil 6 kullanıcı var.**
- `34ffOpf5DJZNMJP1evrrHi9VnFm2` — **e-postasız, sağlayıcısız**, 1 Ağu 09:05'te
  yaratılmış. Bunu Faz 1'deki `scripts/gecis/admin-token.mjs` YARATTI:
  `kullanici_sube`'deki ilk admin satırını seçip custom token bastı, Firebase de
  var olmayan uid için hesabı o an materyalize etti. `kullanici_sube` satırı ise
  Firestore `users` koleksiyonundan gelen eski bir kalıntı. Kimse bu hesapla
  giremez (parola/e-posta yok). İlke 3 gereği Firebase kullanıcıları silinmiyor;
  bu hesap B5/G12'de Firebase projesiyle birlikte gider.
- `destek@sutlucekadayif.com` — gerçek parola hesabı, hiç giriş yapmamış,
  claim'i ve `kullanici_sube` satırı yok. Taşındı (rolsüz).

**SAPMA — claimsiz kullanıcıya 'calisan' rolü VERİLMEDİ.** `permissions.js`'te
yalnızca `admin` ve `sube_sahibi` var; 'calisan' hiçbir izne bağlı değil, uydurma
bir rol yazmak sözleşmeyi bozar. Rolsüz kullanıcının `app_metadata`'sı boş
bırakıldı → `req.user.role` bugünkü Firebase davranışıyla aynı (undefined).

**Doğrulama (hepsi geçti):** 5 Supabase kullanıcısı; her e-postalı Firebase
uid'inin eşi var; `role`/`subeSlug`/`displayName` Firebase claim'leriyle birebir;
`email_confirmed_at` dolu; **5 kullanıcının 5'i de üretilen parolayla gerçekten
giriş yaptı** ve token'daki `sub` = `uid_eslesme.supabase_uid`, token'daki
`app_metadata` = Firebase claim'leri.

**İki hayalet kayıt silindi (kullanıcı onayıyla):** `kullanici_sube` →
`34ffOpf5…` (yukarıdaki e-postasız hesabın admin/denizli satırı),
`ilerleme` → `VfEGpghLGNREpDP21zaDOomiuPf2` (1 satır; bu uid ne Firebase'de ne
`kullanici_sube`'de vardı — silinmiş bir kullanıcının artığı).
Son durum: `kullanici_sube` 4 satır, `ilerleme` 4 satır, **ikisinde de
eski-format uid 0**, `uid_eslesme` 5 satır.

**Sonraki adım için not:** `scripts/gecis/admin-token.mjs` artık Firebase custom
token basıyor ve hayalet hesabı diriltiyor — B2'de Supabase token'ı basacak
şekilde yeniden yazılmalı, yoksa aynı hesap tekrar oluşur.

## B2 — Backend çift doğrulayıcı + admin API portu

**Yap:**
- `middleware/auth.js`: önce Supabase JWT dene (jose; `sub` → supabase_uid,
  `email`, `app_metadata.role/subeSlug`); geçmezse Firebase `verifyIdToken`
  (mevcut yol AYNEN — silme!). İkisi de aynı `req.user`'ı üretir. DİKKAT:
  Firebase yolunda uid = eski format; Supabase yolunda uid = UUID.
  `kullanici_sube` artık UUID'li olduğu için Firebase-token'lı istekte uid'i
  `uid_eslesme`'den UUID'ye çevir — yoksa çift-doğrulayıcı haftasında eski
  oturumlar kendi kayıtlarını bulamaz.
- `routes/users.js` → `supabase.auth.admin.*`: `listUsers`, `createUser`
  (app_metadata + email_confirm), `updateUserById` (parola/displayName/
  claim güncelleme), `deleteUser`. Yanıt şekilleri sözleşmeyle aynı
  (`uid`, `email`, `displayName`, `role`, `subeSlug` — dönüşüm tek yardımcıda).
- `onboarding.js` + `profil.js`: displayName → `updateUserById({ user_metadata:
  { displayName } })`; okuma tarafı da aynı alandan.
- api2 redeploy.

**Doğrula:** lokalde üç tur — (1) Supabase token'ıyla 6-8 örnek uç (admin +
şube sahibi, pozitif + 403 negatif), (2) ESKİ Firebase token'ıyla aynı uçlar
(hâlâ çalışmalı), (3) users CRUD turu: yarat → claim değiştir → parola
güncelle → sil (test kullanıcısıyla, iz bırakma). Sonra deploy + canlıda smoke.

### Uygulandı — B2 (2026-08-01) — DEPLOY EDİLDİ, CANLI SMOKE GEÇTİ

**Yeni katman: `shared/kullanici-dizini.js`.** Supabase Auth admin API'sinin
üstünde ince bir çeviri katmanı; Firebase UserRecord'un API'ye yansıyan alan
adlarını ve **değer biçimlerini** koruyor:
- `createdAt`/`lastSignIn` → Firebase `toUTCString()` basıyordu
  ("Sat, 01 Aug 2026 14:05:20 GMT"); Supabase ISO veriyor, katman eski biçime
  çeviriyor. Hiç giriş yapmamışta `lastSignIn: null`.
- `displayName` → `user_metadata.displayName`
- `disabled` → `banned_until` (geçmiş tarih = etkisiz) üzerinden boolean
- rol/şube claim'leri → `app_metadata.{role,subeSlug}`
- `listUsers` varsayılanı 50 satır ve sessizce kesiyor → katman sayfalıyor
  (Faz 1'deki PostgREST 1000 satır tuzağının Auth karşılığı).

**`middleware/auth.js` — çift doğrulayıcı.** Token'ın `iss` alanı imzasız okunup
doğru dala yönlendiriliyor (yönlendirme güven değil; her iki dal da tam doğrular):
Supabase dalı `jose` + `createRemoteJWKSet` (ES256), Firebase dalı eski
`verifyIdToken` AYNEN. Firebase dalında uid `uid_eslesme`'den UUID'ye çevriliyor
(süreç içi cache, ıskada dakikada bir tazeleme) — çevrilmezse eski oturum kendi
kayıtlarını bulamaz. Kullanılmayan `db` importu düştü.

**KEŞİF — envanterde olmayan 4. çağrı yeri:**
`modules/academy/routes/progress.js:117` `auth.getUsers(...)` ile ilerleme
raporundaki ad/e-postayı çekiyordu. Remap sonrası `ilerleme.uid` UUID olduğu
için bu çağrı HİÇBİR kullanıcıyı bulamaz, rapordaki bütün isimler null'a
düşerdi. Portlandı (tek listeleme + filtre).

**Rolsüz kullanıcı:** `verifyToken` zaten `role || 'calisan'` varsayılanını
uyguluyor — B1'de app_metadata'ya rol yazmamış olmak davranışı değiştirmiyor,
her iki dalda da aynı sonucu veriyor.

**Diğer portlar:** `routes/users.js` (liste/yarat/güncelle/sil → Supabase admin
API; yaratmada kullanici_sube yazımı başarısız olursa Auth kullanıcısı geri
alınıyor — Faz 1'deki "öksüz ürün" hatasının tekrarı olmasın),
`routes/profil.js` (getUser + updateUser), `routes/onboarding.js` (aynı ikisi).

**Sözleşme notu:** PUT /api/users parola alanı ZATEN kabul etmiyordu (yalnızca
email/displayName/subeSlug/role) — görev metnindeki "parola güncelle" turu bu
yüzden uygulanmadı; sözleşmeye alan eklemek Faz 2'nin işi değil.

**Doğrulama — üçü de geçti (lokal, port 5002, canlı Supabase):**
1+2) 10 uç × 2 kimlik (admin, şube sahibi): Supabase token'lı ve ESKİ Firebase
token'lı yanıtlar **byte düzeyinde aynı** (durum kodu + gövde). Şube sahibinde
`/media`, `/reports/settings`, `/academy/progress/admin/stats` → 403 (ikisinde de).
`/profil` iki token'da da doğru hesabı döndürdü → uid remap kanıtlandı.
Ek negatif: şube sahibi PUT /users/<admin> → 403.
3) CRUD: POST 201 (displayName verilmediğinde yanıtta anahtar YOK — Faz 1
davranışı), listede `createdAt` Firebase biçiminde + `lastSignIn: null`,
PUT ile role=admin + şube kaldırma (`subeSlug` anahtarı app_metadata'dan silindi),
DELETE sonrası hem Auth hem `kullanici_sube` temiz, kendini silme 400.

**Araç değişimi:** `scripts/gecis/admin-token.mjs` SİLİNDİ (Firebase custom token
basıyor ve hayalet hesap yaratıyordu), yerine `scripts/gecis/supabase-token.mjs`
geldi: admin API ile magic-link üretir (e-posta GÖNDERMEZ), oturuma çevirir,
access token basar. Kullanım: `TOKEN=$(node scripts/gecis/supabase-token.mjs admin)`.
**B4'te parite harness'ı da bu yolla token almalı** — `parite/calistir.mjs:39`
hâlâ `createCustomToken` kullanıyor ve artık UUID'lerle çağrılırsa Firebase'de
yeni hayalet hesaplar açar.

**Deploy:** `npx firebase-tools deploy --only functions:v2` (firebase CLI global
kurulu DEĞİL, npx cache'inden çalışıyor) — api2 + geceYedegi +
otomatikRaporCekimi güncellendi, Node 22 / europe-west1.
**Canlı smoke geçti:** api2'de 10 uç × 2 kimlik, Supabase ve ESKİ Firebase
token'ları birebir aynı yanıtı verdi; şube sahibinde üç 403 yerinde;
`/profil` iki yolda da doğru hesabı döndürdü. `/health` → `supabase: ok`.

**B2→B3 arası bilinçli boşluk:** deploy anından itibaren panelden yaratılan yeni
kullanıcı yalnızca Supabase Auth'ta var; frontend hâlâ Firebase'le giriş yaptığı
için B3 çıkana kadar giremez. Aralık kısa tutulmalı.

## B3 — Frontend geçişi

**Yap:**
- `src/firebase.js` → `src/supabase.js` (createClient, publishable key;
  yalnızca auth için).
- `AuthContext.jsx`: `signInWithPassword`, `onAuthStateChange`,
  `signOut`, oturum yenileme supabase-js'e devredilir. Kullanıcı nesnesi
  şekli korunur (`uid` alanına `session.user.id`, `role`/`subeSlug`
  `app_metadata`'dan).
- `api.js` + `useReports.js`: `Authorization: Bearer ${session.access_token}`.
- Build + wrangler deploy. Firebase client SDK importları kalksın (paket
  package.json'dan da düşer — bundle küçülür).

**Doğrula:** canlıda kullanıcının kendi hesabıyla giriş (kullanıcı yapar),
panel smoke: dashboard + ürünler + bütçe + akademi; şube sahibi hesabıyla
da bir giriş (parola yolu hangisiyse). `X-Cache`/yanıt sürelerinde anormallik yok.

**Not:** Deploy anından itibaren açık oturumlar ilk API isteğinde 401 alıp
girişe düşer — 5 kişiye "yeniden girin" demek yeterli; veri kaybı yok.

### Uygulandı — B3 (2026-08-01) — DEPLOY EDİLDİ, CANLIDA DOĞRULANDI

**Dosyalar:** `src/firebase.js` SİLİNDİ → `src/supabase.js` (yalnızca auth;
persistSession + autoRefreshToken açık, detectSessionInUrl kapalı).
`AuthContext.jsx` (signInWithPassword / onAuthStateChange / signOut /
refreshSession), `services/api.js` + `modules/reports/hooks/useReports.js`
(`getSession().access_token`; getSession süresi dolmuş token'ı kendi yeniler),
`LoginPage.jsx` (hata eşlemesi `auth/invalid-credential` → `invalid_credentials`
+ 429). `firebase` paketi package.json'dan düştü, `@supabase/supabase-js` girdi.

**PLANDA OLMAYAN İŞ — e-postayla parola sıfırlama.** Panelde İKİ yerde
kullanılıyordu: kullanıcı yaratılınca "şifre belirle" maili (UsersPage) ve
Profil sayfasındaki "Şifre Sıfırla" (ProfilePage). Firebase bunu kendi barındırdığı
sayfayla ücretsiz yapıyordu; Supabase'de SMTP + ayrı bir "parola belirle" sayfası
gerekiyor (ücretsiz planda yerleşik SMTP saatte 2 mail ve üretim için önerilmiyor).
**Karar (kullanıcı): e-posta hiç kullanılmayacak.**
- ProfilePage → "yeni parola" alanı + `supabase.auth.updateUser({ password })`
- UsersPage → yaratımda tarayıcıda güçlü parola üretilip POST'a konuyor, sonra
  tek seferlik bir diyalogda e-posta+parola gösteriliyor (kopyala düğmesiyle)
- `AuthContext.resetPassword` kaldırıldı, yerine `parolaDegistir` geldi

**Dokunulmayan mevcut hata:** `UsersPage.jsx` `currentUser?.role` okuyor ama
`user` nesnesinde rol yok (Firebase'de de yoktu) → `isSubeSahibi` her zaman false.
Davranışı korumak için `user` nesnesine `role` EKLENMEDİ; düzeltmek ayrı iş.
Sunucu tarafı kısıt zaten yerinde (şube sahibi başkasını düzenleyemiyor, B2'de test edildi).

**Doğrulama (lokal vite + CANLI api2):** giriş ✓ (rol app_metadata'dan
"Genel Yönetici" olarak okundu), Genel Bakış "5 il · 7 şube" ✓, Kullanıcılar
listesi Supabase hesaplarını doğru rol/şube ile gösteriyor ✓, **profilden parola
değiştirme uçtan uca** (eski parola artık reddediliyor, yeni parola giriş yapıyor) ✓,
**kullanıcı yaratma** → geçici parola diyaloğu ✓ → aynı kullanıcıyı listeden
**silme** ✓ (Auth + kullanici_sube temiz). Test hesapları silindi; son durum
5 kullanıcı / 4 kullanici_sube satırı. `npm run build` ✓ (lint'te yalnızca
önceden var olan uyarılar).

**DİKKAT:** CORS listesi yalnızca localhost:5173/5174/5175/4321'e izin veriyor.
Vite başka porta düşerse (preview autoPort) tüm istekler "Network Error" olur —
kod hatası sanılmasın.

**Deploy:** `npx wrangler deploy` (frontend/) → sutlucekadayif-cms,
Version ID `93384b29-60a4-4433-9c96-3df5ab1da8d5`.
**Canlı doğrulama** (workers.dev adresinde, tek kullanımlık admin hesabıyla —
gerçek kullanıcıların parolaları kullanılmadı, hesap sonrasında silindi):
giriş ✓, Genel Bakış "5 il · 7 şube" ✓, Raporlar 88 şube ✓, konsolda hata yok ✓.
Faz 2 kimlik geçişi CANLIDA. Kalan: 5 kişiye geçici parolaları ilet + Supabase
panelinden signup'ı kapat.

## B4 — Doğrulama kapısı

Faz 1 parite harness'ı mini koşum: Supabase token'lı admin + 1 şube sahibi
ile tüm GET uçları (yanıtlar Faz 1 çıktısıyla aynı olmalı — kimlik değişti,
veri değişmedi). Bekçi: `req.user` şekli, UID remap bütünlüğü (artık ✅),
şube sahibi kapsamı. Sonuç `scripts/parite/RAPOR-FAZ2.md`.

### Uygulandı — B4 (2026-08-01) — KAPI GEÇİLDİ

**Yeni script: `scripts/parite/faz2.mjs`** (canlı api2'ye koşar, `[taban]`
argümanıyla lokale çevrilebilir).

**Karşılaştırma ekseni bilinçli olarak değişti.** Faz 1 kapısı "eski API vs v2"
idi; orada soru VERİ pariteliğiydi. Faz 2'de veri hiç değişmedi, KİMLİK değişti —
ve eski API'yle karşılaştırma artık gürültü üretirdi (kesim sonrası yazımlar
yalnızca Supabase'e gidiyor, `/users` eski tarafta Firebase Auth'u okuyor).
Bu yüzden **aynı sunucuya aynı uç iki kez** soruluyor: (a) yeni Supabase access
token'ı, (b) Faz 1'in Firebase ID token'ı. İkisi de aynı `req.user`'ı üretmek
zorunda; gövdeler normalize edilip diff'leniyor.

**Sonuç: 72 istek çifti (2 kimlik × 36 uç), SIFIR FARK.** Şube sahibinde
403/404 dönen uçlar da iki dalda birebir aynı kod ve gövdeyi verdi.

**Bekçiler — 11/11 geçti:** `req.user` şekli (iki dalda da `/profil` doğru
hesabı döndürdü), UID remap bütünlüğü (eski-format uid 0, Auth karşılığı
olmayan `kullanici_sube` satırı 0), `uid_eslesme` tutarlılığı, şube sahibi
kapsamı (rapor paketinde denizli dışında şube kodu yok), rol bazlı yanıt
projeksiyonu (ürün listesinde merkez alanları yok), yönetim uçlarında 403 ×4,
token'sız istek 401, Firebase dalının ayakta olması (rollback sigortası),
**yeni hayalet Firebase hesabı üretilmemesi** (6 hesap / 1 e-postasız — Faz 1'den
kalan), izin dosyası ikizliği, frontend'de firebase paketinin kalmaması.

**`scripts/parite/calistir.mjs` KİLİTLENDİ.** Token'ları
`createCustomToken(kullanici_sube.uid)` ile basıyordu; o kolon artık UUID tutuyor
ve Firebase karşılığı olmayan bir uid için custom token basmak hayalet hesap
yaratıyor. Script artık `FAZ1_PARITE_ONAY` olmadan çalışmayı reddediyor ve
faz2.mjs'e yönlendiriyor.

## B5 — Firebase yolunun sökümü (1 hafta SONRA, kullanıcı onayıyla)

Çift doğrulayıcıdan Firebase dalı silinir; `config/firebase.js` ve
`firebase-admin` bağımlılığı repo'dan çıkar; frontend'te firebase paketi
zaten B3'te çıktı. Bu, G12 sökümüyle birlikte yapılır (Firestore arşivi +
eski codebase + Google OAuth redirect taşıma + Firebase projesinin kapanışı).
B5 sonrası Faz 3 (Workers) görev dosyası yazılır.

---

## Faz 3 ön-envanteri (C0 için hazır veri — 2026-08-01)

Workers'ta çalışmayacaklar, backend-v2'de:
- `sharp` — 1 dosya: `routes/upload.js:52` (dinamik import, görsel→webp).
  Çözüm adayı: Cloudflare Images ya da istemci tarafı dönüşüm; C0'da karar.
- `multer` — 5 dosya (upload, academy/upload, reports/routes, budget-routes…)
  → Workers native FormData.
- `express-rate-limit` — 4 dosya → Cloudflare edge kuralları.
- `node-cache` — 2 dosya → Cache API ya da tamamen kaldırma (okuma ucuz).
- `firebase-admin` — 1 dosya (config) → B5'te zaten ölüyor.
