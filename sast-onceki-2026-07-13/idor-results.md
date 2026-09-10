# IDOR Analiz Sonuçları: Sütlüce Kadayıf Web

> SAST 2. faz — IDOR / yatay yetkilendirme atlama (kullanıcı kaynaklı identifier'larda
> sahiplik/şube kontrolü eksikliği). Odak: **yatay** yetki yükseltme (şube sahibi A →
> şube B verisi / başka kullanıcı). Dikey (kullanıcı → admin) açıklar `missingauth`
> kapsamına aittir.

## Yönetici Özeti

- Recon'da tespit edilen aday endpoint: **34** (bkz. faz-1 recon)
- Verify aşamasında derinlemesine doğrulanan aday grubu: **12** (yatay potansiyeli olan
  tüm ⚠️/❌ + kritik ✅ endpoint'ler; salt-admin dikey mutasyonlar kapsam dışı bırakıldı)
- **Vulnerable (CONFIRMED): 2**
- **Likely Vulnerable (PLAUSIBLE): 1**
- **Not Vulnerable: 9 grup**
- **Needs Manual Review: 0** (biri dikey/missing-auth notu olarak aktarıldı)

**Kritik kök nedenler (birden çok bulguda ortak):**
1. R2 nesne erişiminde **sahiplik kontrolü yok, yalnızca `dekontlar/` prefix kara-listesi**
   var → yeni/hassas prefix'ler varsayılan olarak açık kalıyor.
2. `verifyToken` içinde **`role` yoksa `sube_sahibi`, `subeSlug` yoksa `null`** varsayılanı
   (`backend/middleware/auth.js:26`) → claim'i eksik bir token, şubesiz ama yazma yetkili
   bir şube sahibi gibi davranıyor. Bu, C bulgusunun (butce-durum) tetikleyicisi.

---

## Bulgular

### [VULNERABLE — CONFIRMED] Görsel/dosya silme — sahiplik kontrolü yok (yatay, yıkıcı)

- **Dosya**: `backend/routes/upload.js:158-175` (yardımcı `urlToKey` → `backend/config/r2.js:51-54`)
- **Endpoint**: `DELETE /api/upload/image`
- **Yetki zinciri**: `verifyToken` + `requirePermission('products.edit')`. `products.edit`
  rolleri = `['admin','sube_sahibi']` (`backend/shared/permissions.js:23`) → her şube sahibi geçer.
- **Sorun**: Handler `key = urlToKey(url)` = `url.replace(`${PUBLIC_URL}/`,'')` (saf string
  kırpma, sahiplik bilgisi taşımaz) hesaplar; yalnızca `if (key.startsWith('dekontlar/')) 403`
  kontrolü var; ardından `deleteFile(key)` → `DeleteObjectCommand`. `key` **hiçbir yerde
  `req.user.subeSlug` ile ilişkilendirilmiyor**. `requirePermission` yalnızca dikey (rol)
  kontrolü yapar; hangi nesnenin hedeflendiğini sınırlamaz.
- **Somut sömürü senaryosu**: Şube A sahibi, şube B'nin canlı QR menüsünü siler. Menü JSON
  anahtarı tahmin edilebilir (`menu/{subeSlug}.json`, `modules/qr-menu/services/menu-cache.js:58`):
  ```
  DELETE /api/upload/image
  Authorization: Bearer <SUBE_A_TOKEN>
  {"url":"<PUBLIC_URL>/menu/<SUBE_B_SLUG>.json"}
  ```
  → `{"success":true}`; şube B'nin menüsü R2'den silinir, müşteri menüsü çöker. Anahtarı/URL'i
  bilinen herhangi bir akademi medyası veya ürün görseli de aynı şekilde silinebilir.
- **Önem**: **Yüksek** (çapraz-şube bütünlük/erişilebilirlik kaybı, kalıcı silme).
- **Onarım**: Silmeden önce nesne sahipliğini zorunlu kıl. Silinebilir key'leri çağıranın kendi
  kapsamına daralt (key şube-sahipli bir prefix altında olmalı ve `req.user.role==='admin' ||
  key şubeye ait` doğrulanmalı) veya referans veren ürün/kayıt kaydından şube sahipliğini teyit et.
  `dekontlar/` kara-listesine güvenme; allow-list kullan. `urlToKey` eşleşmezse (yabancı/mutlak
  URL) reddet.
- **Doğrulama testi**:
  ```
  curl -s -X DELETE "https://<HOST>/api/upload/image" \
    -H "Authorization: Bearer <SUBE_A_TOKEN>" -H "Content-Type: application/json" \
    -d '{"url":"<PUBLIC_URL>/menu/<SUBE_B_SLUG>.json"}'
  curl -s -o /dev/null -w "%{http_code}" "https://<HOST>/api/upload/proxy/menu/<SUBE_B_SLUG>.json"
  # Beklenen (açık varsa): DELETE {"success":true} + takip GET 404 (şube B menüsü yok edildi).
  ```

---

### [VULNERABLE — CONFIRMED] Public dosya proxy — auth yok, deny-list ile çapraz-şube okuma

- **Dosya**: `backend/routes/upload.js:42-87`
- **Endpoint**: `GET /api/upload/proxy/*` (auth **yok**)
- **Sorun**: `verifyToken` yok; nesne başı yetkilendirme yok. Tek koruma prefix kara-listesi:
  `if (key.startsWith('dekontlar/')) 403` (satır ~50). Kullanıcı kaynaklı `key = req.params[0]`
  doğrudan `GetObjectCommand({Bucket, Key:key})`'e verilip stream edilir. `dekontlar/` dışındaki
  her nesne, key'i bilen/tahmin eden herkese açık.
- **Somut sömürü senaryosu**: Menü JSON key'leri şube slug'ından **tam tahmin edilebilir**
  (`menu/{subeSlug}.json`). Kimliksiz saldırgan slug'ları deneyerek her şubenin tam menü JSON'unu
  çeker:
  ```
  curl -s "https://<HOST>/api/upload/proxy/menu/<SUBE_SLUG>.json"
  ```
  → HTTP 200 + o şubenin R2 menü JSON gövdesi. (Not: public `/api/menu/:subeSlug` endpoint'i alan
  whitelist'i uygularken, R2'deki cache JSON tam şube dokümanını içeriyorsa — mimaride "doğrulanacak"
  olarak işaretli — VKN/fatura gibi PII sızıntısı buradan gerçekleşir; bu ayrıca info-disclosure
  konusudur.) Akademi PDF/video ve ürün görselleri UUID adlı olduğundan enumerasyona kapalı ama key'i
  ele geçirilirse yine auth'suz servis edilir.
- **Sınıf notu**: Endpoint tamamen kimliksiz olduğundan **birincil sınıfı missing-auth**'tur;
  IDOR raporuna, çapraz-şube nesne okumasını somut biçimde mümkün kıldığı için dahil edildi. Tam
  değerlendirme `missingauth`/`hardcodedsecrets`/info-disclosure paslarıyla örtüşür.
- **Önem**: **Orta** (menü JSON içeriği zaten büyük ölçüde public; asıl risk R2 JSON'unun tam
  doküman PII barındırması ve deny-list'e yeni prefix eklenmeden hassas nesne açığa çıkması).
- **Onarım**: Servis edilebilir prefix'ler için allow-list kullan (yalnız `urunler/`, `academy/`
  gibi gerçekten public/uuid içerik). Şube-kapsamlı içerik (menü JSON) için `verifyToken` + key'den
  türetilen şube ile `req.user.subeSlug`/admin karşılaştırması iste. R2 menü cache JSON'unun tam şube
  dokümanı yerine yalnız public alanları içerdiğinden emin ol.
- **Doğrulama testi**:
  ```
  curl -s "https://<HOST>/api/upload/proxy/menu/<HERHANGI_SUBE_SLUG>.json"
  # Beklenen (açık varsa): 200 + menü JSON, kimliksiz. 401/403 = düzeltilmiş.
  ```

---

### [LIKELY VULNERABLE — PLAUSIBLE] Bütçe durumu — subeSlug null olduğunda tüm şubeler sızıyor

- **Dosya**: `backend/modules/reports/budget-routes.js:584-699` (kritik satırlar ~597-620)
- **Endpoint**: `GET /api/reports/butce-durum?since&until&subeKod`
- **Yetki**: `budget.view` = `['admin','sube_sahibi']` → şube sahibi erişebilir.
- **Sorun**: Guard yalnızca non-admin'in **başka bir şubeyi açıkça adlandırdığı** durumu engeller:
  ```js
  if (subeKod && !isAdmin && subeKod !== req.user.subeSlug) return res.status(403)...;
  const hedefKod = subeKod || (!isAdmin ? req.user.subeSlug : null);
  ...
  if (hedefKod) { subeler = [await getSubeByKod(hedefKod)]; }
  else { subeler = await getAllSubeler(); }   // <-- TÜM şubeler
  ```
  Non-admin `subeKod`'u **hiç göndermezse**, `hedefKod = req.user.subeSlug`. Bu claim **null/boş**
  ise `hedefKod` null olur, `else` dalı `getAllSubeler()` çağırır ve **her şubenin** bütçe özetini
  (planlananButce, devredilen, merkezDestegi, toplamButce, harcama, kalan, kullanımOranı) + global
  özeti döner. Guard (satır ~598) `subeKod` falsy olduğu için atlanır, çağıranı kendi şubesine
  daraltmaz.
- **Somut sömürü senaryosu**: `role` claim'i olmayan (→ `sube_sahibi` varsayılır) veya `subeSlug`
  claim'i boş bir token ile:
  ```
  curl -H "Authorization: Bearer <SUBESLUG_BOS_TOKEN>" \
    "https://<HOST>/api/reports/butce-durum?since=2025-01-01&until=2025-01-31"
  ```
  → `subeler[]` içinde **birden çok** şube kodu (tüm şubeler) + kapsamsız `ozet`. Doğru
  sağlanmış (subeSlug dolu) bir şube sahibi kendi şubesine sabitlenir ve bunu istismar edemez;
  açık, özellikle **null/eksik-subeSlug non-admin** principal'a bağlıdır. `auth.js:26` izin verici
  varsayılanları bunu teorik değil makul kılar → bu yüzden **PLAUSIBLE** (deployment'ta böyle bir
  principal var mı doğrulanmalı).
- **Önem**: **Orta-Yüksek** (tüm şubelerin finansal/bütçe verisinin çapraz-tenant okunması; salt
  okuma).
- **Onarım**: `hedefKod` hesaplandıktan sonra, şubesi çözülemeyen non-admin'i reddet:
  ```js
  if (!isAdmin && !hedefKod) return res.status(403).json({ error: 'Şube bilgisi bulunamadı.' });
  ```
  (Aynı dosyadaki `budget.submit` handler'ları `:713-716` ve `:787-790` zaten subeSlug eksikse
  reddediyor.) Yalnız admin `getAllSubeler()` dalına ulaşabilmeli. Ayrıca `auth.js`'te role
  varsayılanını `sube_sahibi` yapmaktan kaçınmak kök nedeni giderir.
- **Doğrulama testi**:
  ```
  # Normal sahip (subeSlug dolu) → yalnız kendi şubesi:
  curl -H "Authorization: Bearer <SUBE_A_TOKEN>" \
    "https://<HOST>/api/reports/butce-durum?since=2025-01-01&until=2025-01-31"
  # Exploit (subeSlug boş, role sube_sahibi):
  curl -H "Authorization: Bearer <SUBESLUG_BOS_TOKEN>" \
    "https://<HOST>/api/reports/butce-durum?since=2025-01-01&until=2025-01-31"
  # Açık varsa: ikinci yanıtta çok sayıda şube + kapsamsız ozet.
  ```

---

### [NOT VULNERABLE] Dekont proxy — şube kontrolü sağlam

- **Dosya**: `backend/routes/upload.js:96-124`
- **Endpoint**: `GET /api/upload/dekont/*`
- **Koruma**: `verifyToken` + key'den şube türetip token ile karşılaştırma. `key` `dekontlar/`
  ile başlamalı; `subeKod = key.split('/')[2].replace(/\.[^.]+$/,'')`; `if (role!=='admin' &&
  subeSlug!==subeKod) 403`. Fetch edilen nesne birebir `key`'dir; gerçek dekontlar daima
  `dekontlar/{kampanyaId}/{subeKod}.{ext}` (`budget-routes.js:832`) olduğundan `[2]` segmenti hep
  gerçek sahibi kodlar. Traversal (`.../..//...`) payload'ları `[2]`'yi saldırganın slug'ına
  çevirse de R2 key'leri literal işler (`..` çözülmez) → var olmayan nesne (404), veri yok.
- **Not**: Bağımsız sahip lookup'ı yerine key şekline dayandığı için kırılgan (hardening: sahibi
  Firestore kampanya/dekont kaydından türet). Mevcut halde açık değil.

### [NOT VULNERABLE] Kullanıcı güncelle/sil/oluştur — `PUT/DELETE/POST /api/users[/:uid]`

- **Dosya**: `backend/routes/users.js` (PUT 116-160, DELETE 166-195, POST 57-109)
- **Koruma**: `sube_sahibi` bu izinleri taşısa da in-handler guard yeterli. PUT/DELETE:
  `data.sube_slug === req.user.subeSlug && data.role === 'calisan'` değilse 403 (satır 128/182);
  başka şube/admin/peer-owner/doküman-yok hepsi reddedilir; PUT `subeSlug`/`role`'ü strip eder
  (mass-assign yok), yalnız `email`/`displayName` değişir (password alınmaz); DELETE self-delete'i
  engeller. POST: `sube_sahibi` için `role='calisan'` ve `subeSlug=req.user.subeSlug` zorla ezilir.
- **Alan-adı doğrulaması**: Recon'daki `sube_slug` vs `subeSlug` tutarsızlığı bu modüle
  **ulaşmıyor** — yazma (`users.js:95`) ve guard okuması (`:128/:182`) ikisi de `sube_slug`
  kullanıyor, tutarlı. (`branches.js:194`'teki `subeSlug` sorgusu ayrı bir konu; IDOR değil.)
- **Kalıntı not (IDOR değil)**: Şube sahibi kendi şubesindeki `calisan`'ın email'ini değiştirip
  reset-link ile hesabını ele geçirebilir — kendi yönetim kapsamında, çapraz-tenant değil.

### [NOT VULNERABLE] Rapor şube-kapsamlı okumalar — `ensureBranchAccess`

- **Dosya**: `backend/modules/reports/routes.js` (yardımcı 40-45; endpoint'ler 188-214, 217-254,
  534-557, 561-582, 643-682)
- **Endpoint'ler**: `POST /preview`, `POST /generate-pdf`, `GET /sube/:kod`,
  `GET /sube/:kod/donemler`, `GET /sube/:kod/donem/veriler`
- **Koruma**: `ensureBranchAccess` katı allow-list: admin → true; aksi halde `kod && kod ===
  req.user.subeSlug` gerekli. Falsy `kod` `&&` ile kısa devre yaptığından `undefined===undefined`
  geçişi yok; null/boş subeSlug'lı non-admin her şeyden reddedilir. 5 endpoint'in hepsinde guard
  Firestore okumasından **önce** çağrılıyor (191<192, 220<221, 537<539, 564<565, 647<649).

### [NOT VULNERABLE] Dönem bütçe override — `PUT /api/reports/sube/:kod/donem/overrides`

- **Dosya**: `backend/modules/reports/routes.js:684-726`
- **Koruma**: `ensureBranchAccess` yok ama `requirePermission('reports.manage')` var ve
  `reports.manage = ['admin']` (`permissions.js:58`). Çapraz-şube `:kod` bilinçli admin yeteneği =
  dikey, IDOR değil. **Gelecek riski**: `sube_sahibi` ileride `reports.manage` alırsa bu endpoint
  yazma-IDOR'una döner; o durumda `ensureBranchAccess` eklenmeli.

### [NOT VULNERABLE] Akademi kurs/ders okuma — `GET /courses/:id`, `GET /lessons/:courseId`

- **Dosya**: `backend/modules/academy/routes/courses.js:64-85`, `lessons.js:56-76`
- **Koruma**: Non-admin `course.isPublished && courseVisibleToUser(course, req.user)` (rol +
  `targetSubeler` hedefleme) değilse 404 (courses.js:72; lessons.js:62-68 parent kursu çekip aynı
  kontrolü uygular). `stripQuizAnswers` non-admin için `correctOptionId`'yi siler
  (`utils.js:6-14`). `role`/`subeSlug` doğrulanmış claim'lerden, spoof edilemez.

### [NOT VULNERABLE] Akademi ilerleme — quiz submit / tamamla / oku (self-scoped)

- **Dosya**: `backend/modules/academy/routes/progress.js` (quiz submit 218-281, GET /:courseId
  289-305, POST/DELETE /:courseId/:lessonId 311-357)
- **Koruma**: Tüm okuma/yazma `userId = req.user.uid`'e bağlı; path param'lar yalnız
  `courseId`/`lessonId`, hedef kullanıcı id'si yok → başka kullanıcının ilerlemesine erişilemez.
  Quiz submit yanıtı yalnız `{passed,score,correctCount,totalQuestions,passingScore}` döner; soru
  metni/`correctOptionId` sızmaz. **Düşük öncelikli hardening**: bu handler'larda `courseVisibleToUser`
  kapısı yok — kullanıcı kendi izleyici-dışı bir kursta ilerleme kaydedebilir (yalnız kendi
  dokümanına yazar; IDOR değil). (Ayrıca `correctCount` bir cevap-oracle'ı olabilir → businesslogic
  pası için not.)

### [NOT VULNERABLE] Akademi admin ilerleme istatistikleri — `GET /admin/stats[/:userId/detail]`

- **Dosya**: `backend/modules/academy/routes/progress.js:80-165`, `:173-212`
- **Koruma**: `:userId` ile başka kullanıcının `academy_progress/{userId}` verisi okunur ama her iki
  route'un ilk satırı inline `if (req.user.role !== 'admin') return 403` (satır 81-83 ve 174-176).
  `req.user.role` doğrulanmış custom claim'den, forge edilemez. Statik `/admin/stats...` route'ları
  (80, 173) `/:courseId` param route'undan (289) önce tanımlı → shadowing yok. `:userId` okuması
  gerçekten admin-only.

---

## Faz-2'de kapsam dışı bırakılanlar (salt dikey / admin-only)

Aşağıdaki mutasyonlar `sube_sahibi`'de olmayan `reports.manage`/`budget.manage`/`categories.*`/
`branches.*`/`academy.manage`/`users.resetOnboarding` izinleriyle korunuyor; `:kod`/`:id`/`:slug`
tanımlayıcısı nesneyi seçse de çağıran zaten admin olmak zorunda → **yatay IDOR değil, dikey**.
`missingauth` pasında rol regresyonu açısından ayrıca değerlendirilmeli:
`POST/PUT/DELETE /reports/sube[/:kod]`, `POST /reports/google-fetch`, `butce-kampanya*` yönetim
akışı (`/onayla`, `/devret`, `/sube/:subeKod`), `categories`/`media`/`branches` CRUD,
`academy` kurs/ders/upload CRUD, `POST /onboarding/reset/:uid`.
