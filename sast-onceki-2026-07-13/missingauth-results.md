# Eksik Kimlik Doğrulama & Bozuk Fonksiyon-Seviyesi Yetkilendirme — Sonuçlar

Proje: Sütlüce Kadayıf Web (Express / Firebase Functions + Firebase Auth + Firestore + Cloudflare R2)
Kapsam: Unauthenticated erişim + dikey ayrıcalık yükseltme (regular user → admin / düşük yetki → yüksek yetki).
Kapsam DIŞI: IDOR / yatay erişim (ayrı skill), JWT kripto (Firebase SDK yönetiyor).

## Yönetici Özeti

- İncelenen endpoint: 110 (recon envanteri) — derinlemesine doğrulanan yüksek-riskli aday: 12
- **CONFIRMED (doğrulanmış açık): 3**
- **PLAUSIBLE (koşullu / savunma boşluğu): 4**
- NOT VULNERABLE (doğrulandı, güvenli): 5 (users CRUD, dekont proxy, butce-gonder, academy admin-stats/detail)

Sistemik gözlem: `verifyToken` global değil, her route kendi kapısını koyuyor; yetki tablosu (`shared/permissions.js`) bazı hassas anahtarları (`branches.view`, `users.create`, `users.assignRole`) `sube_sahibi`'ye de veriyor ve şube izolasyonu **imperatif handler içi** kontrollere bırakılmış. Bir handler bu kontrolü unutursa (bkz. `GET /api/branches`) doğrudan açık oluşuyor.

---

## CONFIRMED Bulgular

### [CONFIRMED — HIGH] GET /api/upload/proxy/* — Unauthenticated rastgele R2 nesne okuma → şube PII sızıntısı
- **Dosya**: `backend/routes/upload.js:42-87` (key türetimi 45; tek koruma 50-52)
- **Endpoint**: `GET /api/upload/proxy/*` — **auth YOK** (verifyToken uygulanmamış)
- **Sorun**: R2 anahtarı doğrudan `req.params[0]`'dan ham alınıyor (`const key = req.params[0]`), tek koruma `key.startsWith('dekontlar/')` reddi. Başka hiçbir prefix kısıtı yok → kimliği doğrulanmamış herkes `dekontlar/` dışındaki HERHANGİ bir bucket nesnesini okuyabilir.
- **Sömürü senaryosu (onaylı zincir)**: Menü cache servisi (`backend/modules/qr-menu/services/menu-cache.js:23,54,58`) her şube için `menu/{subeSlug}.json` yazıyor ve içine `sube = { id, ...subeDoc.data() }` yani **tam şube dokümanını** koyuyor. Şube dokümanı hassas PII içeriyor: `vkn` (vergi kimlik no), `fatura_adresi`, `yetkili_adi`, `telefon`, `adres`, `sirket_tipi`. Public menü endpoint'i (`/api/menu/:subeSlug`) bu alanları whitelist ile gizliyor AMA R2'deki JSON tam dokümanı barındırıyor. Saldırgan:
  ```
  curl 'https://<host>/api/upload/proxy/menu/amasya.json'   # token YOK
  → { "sube": { "vkn": "...", "fatura_adresi": "...", "yetkili_adi": "...", "telefon": "...", ... } }
  ```
  Şube slug'ları zaten public menüden (`/api/menu/subeler` veya QR menü URL'leri) öğrenilebilir → tüm şubelerin ticari/PII verisi anonim olarak dökülebilir.
- **Ek yüzey**: Academy yüklemeleri (`modules/academy/routes/upload.js` — video/PDF) ve ürün görselleri de bu proxy'den okunur; içerik-adresli (uuid) olduklarından tahmin zor, düşük risk. Asıl CONFIRMED etki `menu/*.json`.
- **`dekontlar/` bypass değerlendirmesi**: `startsWith` decode edilmiş key üzerinde çalışıyor (Express path'i decode eder) ve R2 anahtarları küçük harf/case-sensitive saklanıyor; `%64ekontlar`, `Dekontlar/`, baştaki `/` gibi denemeler ya decode sonrası yine yakalanır ya da saklı anahtarla eşleşmez. Pratikte dekont bypass'ı doğrulanamadı → dekont tarafı güvenli, sorun `menu/*.json`.
- **Önem**: HIGH — kimlik doğrulaması olmadan çok-kiracılı PII toplu ifşası.
- **Düzeltme**: (a) Menü cache JSON'una tam şube dokümanı yerine yalnızca public whitelist alanları yaz (public menü ile aynı projeksiyon); (b) proxy'de `dekontlar/` yerine allowlist mantığına geç (`menu/`, `urunler/`, `egitim/` gibi bilinen public prefix'ler dışını reddet); (c) key normalizasyonu ekle.

### [CONFIRMED — HIGH] GET /api/branches — Bozuk fonksiyon-seviyesi yetki: her şube sahibi tüm şubelerin PII'sini okuyor
- **Dosya**: `backend/routes/branches.js:35-52` (özellikle 40-44)
- **Endpoint**: `GET /api/branches` — auth VAR, `requirePermission('branches.view')` VAR ama izin `['admin','sube_sahibi']` (`shared/permissions.js`).
- **Sorun**: Handler `subeler` koleksiyonunun tamamını okuyup her dokümanı `...d.data()` ile **hiçbir şube/rol filtresi olmadan** döndürüyor:
  ```js
  const snap = await db.collection('subeler').get();
  ... return { id: d.id, slug: d.id, urunSayisi, ...d.data() }; // vkn, fatura_adresi, yetkili_adi, telefon...
  ```
- **Sömürü senaryosu**: Herhangi bir `sube_sahibi` (yalnızca kendi şubesini görmesi gereken düşük yetkili rol) kendi token'ıyla `GET /api/branches` çağırıp **tüm** şubelerin `vkn`, `fatura_adresi`, `yetkili_adi`, `telefon`, `adres`, `sirket_tipi` verilerini okur. Bu dikey yetki ihlali + toplu PII ifşasıdır.
- **Kanıt/karşılaştırma**: Kardeş endpoint `GET /api/branches/konumlar` (`branches.js:61-80`) doğru deseni gösteriyor — aynı izinle korunuyor ama `role === 'admin' → hepsi`, `sube_sahibi → subeSlug eşleşeni`, `diğer → []` filtreliyor. `GET /` bu filtreden yoksun.
- **Önem**: HIGH (düşük yetkili kimlik doğrulanmış kullanıcıya merkezi/tüm-şube hassas verisi).
- **Düzeltme**: `konumlar` ile aynı rol bazlı filtrelemeyi uygula; sube_sahibi için sonucu `d.id === req.user.subeSlug` ile kısıtla, admin'e tümünü ver.

### [CONFIRMED — MEDIUM] GET /api/reports/auth/google/callback — Unauthenticated OAuth callback, state/CSRF yok
- **Dosya**: `backend/modules/reports/routes.js:97-105`; token yazımı `backend/modules/reports/services/google-business.js:64-70` (`handleGoogleCallback` → `saveGoogleToken`)
- **Endpoint**: `GET /api/reports/auth/google/callback` — **auth YOK**, `state` parametresi doğrulanmıyor.
- **Sorun**: Callback `req.query.code`'u alıp `oauth2Client.getToken(code)` ile takas ediyor ve sonucu **merkezi/tekil** Google token dokümanına (`saveGoogleToken`, `reports/google_token`) yazıyor. Ne kimlik doğrulama ne `state` (CSRF nonce) kontrolü var.
- **Sömürü senaryosu (PLAUSIBLE exploit, CONFIRMED missing-auth)**:
  1. **OAuth hesap enjeksiyonu**: Saldırgan, uygulamanın client_id'siyle kendi Google Business hesabı üzerinden onay verip bir `code` elde eder, ardından `.../callback?code=<attacker_code>`'u tetikler → uygulamanın merkezi Google entegrasyonu **saldırganın hesabına** bağlanır; raporlar saldırgan kontrolündeki veriden çekilmeye başlar veya meşru token ezilerek entegrasyon bozulur (DoS).
  2. Sabit `redirect_uri` ve client_secret gerekliliği exploiti zorlaştırır (bu yüzden MEDIUM), ancak auth+state eksikliği tasarımsal olarak doğrulanmıştır.
- **Önem**: MEDIUM.
- **Düzeltme**: OAuth başlatırken (`getGoogleAuthUrl`) rastgele `state` üret, kısa ömürlü sakla; callback'te birebir doğrula ve eşleşmezse reddet. Mümkünse callback'i yalnızca admin oturumu bağlamında kabul et.

---

## PLAUSIBLE / Savunma Boşlukları

### [PLAUSIBLE — MEDIUM] auth.js — `role` claim yoksa varsayılan `sube_sahibi` (fail-open)
- **Dosya**: `backend/middleware/auth.js:26` — `role: decodedToken.role || 'sube_sahibi'`
- **Sorun**: Bu Firebase projesine ait GEÇERLİ bir ID token'ı olan ama `role` custom claim'i bulunmayan herhangi bir kullanıcı sessizce `sube_sahibi` (şube sahibi) muamelesi görür. `calisan`'a değil, ayrıcalıklı role düşüyor.
- **Sömürü senaryosu (koşullu)**: Aynı Firebase projesinde self-signup / Identity Toolkit `signUp` açıksa ya da claim'siz bir hesap oluşturulabiliyorsa, saldırgan `sube_sahibi` olur ve yukarıdaki **`GET /api/branches`** açığıyla birleşince tüm şube PII'sini okur (subeSlug null olsa da o endpoint filtre uygulamıyor). Exploit edilebilirlik token edinme yoluna bağlı → PLAUSIBLE.
- **Önem**: MEDIUM (fail-open varsayılan; diğer açıkların etkisini büyütür).
- **Düzeltme**: Varsayılanı en düşük yetkiye çek (`|| 'calisan'`) veya claim yoksa `kullanici_sube` dokümanından rolü doğrula / erişimi reddet.

### [PLAUSIBLE — LOW] POST /api/academy/progress/quiz/:courseId/:lessonId/submit — eksik görünürlük/yayın kontrolü
- **Dosya**: `backend/modules/academy/routes/progress.js:218-281` (özellikle 228-236, 253-267)
- **Endpoint**: `POST .../quiz/:courseId/:lessonId/submit` — yalnızca `verifyToken`, izin anahtarı yok.
- **Sorun**: Ders doğrudan okunup puanlanıyor; kardeş okuma endpoint'lerindeki `!isPublished || !courseVisibleToUser(course, req.user)` → 404 kapısı (bkz. `courses.js:72`, `lessons.js:65`) burada YOK. Kimliği doğrulanmış herhangi bir kullanıcı, kendi rolüne/şubesine hedeflenmemiş veya yayınlanmamış bir kursun quiz'ini courseId/lessonId biliniyorsa çözebilir.
- **Sömürü senaryosu**: Kullanıcı kendine atanmamış kursları "tamamlandı" göstererek `academy_progress/{uid}` ve admin istatistiklerini kirletir (progress inflation). Yazma self-scoped → yatay/dikey yükseltme YOK; cevaplar (`correctOptionId`) sızmıyor, yalnızca `score`/`passed` dönüyor.
- **Önem**: LOW (self-scoped, gizlilik etkisi minimal).
- **Not**: Aynı boşluk `POST /:courseId/:lessonId` (satır 311) ve `GET /:courseId` (satır 289) tamamlama endpoint'lerinde de var — tutarlılık için birlikte düzeltilmeli.
- **Düzeltme**: Ders okumadan önce (admin değilse) `courseVisibleToUser` + `isPublished` kapısını ekle.

### [PLAUSIBLE — LOW] GET /api/reports/butce-durum — subeSlug'sız non-admin edge'inde tüm şube bütçesi
- **Dosya**: `backend/modules/reports/budget-routes.js:584-699` (kapsam kararı 597-601, 615)
- **Sorun**: Asıl cross-branch senaryoları engelli (satır 598: başka slug geçme → 403; satır 601: subeKod atlanırsa kendi subeSlug'ına sabitlenir). ANCAK `subeSlug` claim'i olmayan bir non-admin için `hedefKod = undefined` → satır 615 `if (hedefKod)` false → `getAllSubeler()` çalışır ve **tüm şubelerin bütçe durumu** döner. Kardeş `butce-gonder`/`butce-bekleyen` bu durumu `if (!subeSlug) return 400` ile kapatıyor, `butce-durum` kapatmıyor.
- **Sömürü senaryosu**: Yalnızca hatalı/eksik claim'li (`sube_sahibi` ama `subeSlug` null) bir hesap subeKod'suz çağırınca tüm şubelerin özet bütçesini görür. Koşullu, düşük olasılıklı bilgi ifşası; dikey yükseltme yok.
- **Önem**: LOW.
- **Düzeltme**: Başa ekle: `if (!isAdmin && !req.user.subeSlug) return res.status(400)...`.

### [PLAUSIBLE — LOW/Design] users.create & users.assignRole izinlerinin sube_sahibi'de olması
- **Dosya**: `backend/shared/permissions.js` (`users.create`, `users.assignRole` → `['admin','sube_sahibi']`); handler `backend/routes/users.js:57-195`
- **Durum**: Bu göreve özel olarak istendi. **Şu an sömürülemiyor** — imperatif guard'lar sağlam ve doğru sırada:
  - `POST /api/users` (75-78): sube_sahibi için `role='calisan'` ve `subeSlug=req.user.subeSlug` zorlaması `createUser`(87) ve `setCustomUserClaims`(99) çağrılarından ÖNCE → crafted `role:'admin'` gövdesi ezilir.
  - `PUT /api/users/:uid` (125-134): mutasyondan önce `kullanici_sube/:uid` yeniden-okunuyor; hedef kendi şubesindeki `calisan` değilse 403; sonra `role/subeSlug=undefined`. Recon'un işaret ettiği "undefined → `'sube_sahibi'` clobber" (satır 155 fallback) sömürülebilir DEĞİL, çünkü satır 146 koşulu (`subeSlug !== undefined || role !== undefined`) sube_sahibi için tüm yazma+claim bloğunu atlıyor.
  - `DELETE /api/users/:uid` (179-185): aynı mülkiyet+rol kontrolü `deleteUser`(188) öncesi; ayrıca kendini silme engeli.
- **Neden yine de not ediliyor**: Ayrıcalık yükseltme koruması tamamen imperatif ve her handler'da tekrar ediyor; merkezi bir `requireOwnBranchEmployee` guard'ı yok. Gelecekteki bir endpoint (ör. toplu kullanıcı işlemi) aynı kontrolü unutursa doğrudan escalation doğar. Kırılgan tasarım riski.
- **Önem**: LOW (mevcut durumda açık değil; defense-in-depth).
- **Düzeltme**: Şube sahibi için ayrı dar izin (`users.createEmployee`) + merkezi ownership middleware; satır 155'te fallback'i `|| 'calisan'` yap.

---

## NOT VULNERABLE (doğrulandı, güvenli)

- **POST/PUT/DELETE /api/users/:uid** (`routes/users.js`) — imperatif escalation guard'ları airtight (yukarıda detay).
- **GET /api/upload/dekont/*** (`routes/upload.js:96-124`) — `verifyToken` + `admin || subeSlug===subeKod` kontrolü; key parse (`dekontlar/{kampanyaId}/{subeKod}.ext`) manipülasyonuyla bypass doğrulanamadı.
- **POST /api/reports/butce-gonder/:kampanyaId** (`budget-routes.js:778-862`) — `subeKod` tamamen server-derived (`req.user.subeSlug`), body/params'tan alınmıyor; deadline + `onaylandi` guard'ları sağlam.
- **GET /api/academy/progress/admin/stats** ve **.../:userId/detail** (`progress.js:80-165, 173-212`) — inline `if (req.user.role !== 'admin') return 403` handler başında, tüm veri erişiminden önce, doğru yönde.
- Reports/budget/academy/media/categories/branches-write endpoint'lerinin geneli — `verifyToken` + admin-only `requirePermission` (`reports.manage`/`budget.manage`/`academy.manage`/`categories.*`/`branches.create|edit|delete`) ile doğru korunuyor.

---

## Öncelikli Aksiyonlar

1. **Menü cache JSON'unu whitelist'le** + **`GET /api/upload/proxy/*` allowlist** → CONFIRMED HIGH PII sızıntısını kapat.
2. **`GET /api/branches`'e rol bazlı filtre** ekle (`konumlar` desenini kopyala) → CONFIRMED HIGH.
3. **Google OAuth callback'e `state` doğrulaması** → CONFIRMED MEDIUM.
4. **`auth.js` varsayılan rolünü** en düşük yetkiye çek → fail-open'ı kapat.
