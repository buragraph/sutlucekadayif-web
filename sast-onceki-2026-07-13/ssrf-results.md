# SSRF Analiz Sonuçları: Sütlüce Kadayıf Web

## Yönetici Özeti

- İncelenen giden ağ çağrısı bölgesi: **8** (backend'deki tüm outbound HTTP/SDK çağrıları)
- **CONFIRMED (doğrulanmış SSRF):** 0
- **PLAUSIBLE (koşullu / makul risk):** 1
- Not Vulnerable (sömürülemez): 7
- Needs Manual Review: 0

**Genel sonuç:** Klasik anlamda SSRF **yok**. Tüm giden isteklerin hedef host'u koddaki
sabit literal'lerden gelir; kullanıcı ne host, ne şema, ne port kontrol edebiliyor.
Kullanıcı girdisi yalnızca sabit host'lu URL'lerin sorgu/parametre kısmına giriyor
(çoğu `encodeURIComponent`'li) — bu SSRF değil. Tek dikkat gereken yüzey, PDF üretiminde
puppeteer'ın `networkidle0` ile HTML içi dış kaynakları çekmesi; ancak şablonda dinamik
URL yok ve bu ancak HTML enjeksiyonu ile tetiklenebilir (aşağıda PLAUSIBLE).

Mimari dokümandaki "SSRF için host kullanıcı kontrolünde değil" tespiti **doğrulandı**.

---

## Bulgular

### [PLAUSIBLE] Puppeteer PDF üretimi — HTML içi dış kaynakların çekilmesi (blind SSRF benzeri)

- **Dosya:** `backend/modules/reports/services/generate-pdf.js:31-34`
  (`page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 })`)
- **HTML kaynağı:** `backend/modules/reports/services/report-template.js`
  (`generateReportHtml(data)` → `modules/reports/routes.js:208,237,288`)
- **Çağrı türü:** Headless Chromium sayfa render'ı; `networkidle0` sayfadaki tüm
  `<img>`, `<link>`, `@import`, `background:url(...)`, `<iframe>` vb. dış kaynakları
  **sunucu tarafında (Chromium içinden) çeker.**
- **Durum:** Şablonda **kullanıcı kontrolünde dinamik URL yok.** Tek dış kaynak sabit
  bir Google Fonts import'u (`report-template.js:27`,
  `@import url('https://fonts.googleapis.com/...')`). Metin alanları (`sube.ad`,
  `donem.label`, sayılar) düz metin olarak enterpole ediliyor; `src`/`url()` alanına
  kullanıcı verisi girmiyor.
- **Neden PLAUSIBLE (sıfır değil):** `report-template.js` alanları kaçışsız template
  literal ile gömüyor (mimaride XSS notu olarak da geçiyor). Eğer bir alana
  (`sube.ad` / `donem.label`) `<img src="http://169.254.169.254/...">` gibi HTML
  enjekte edilebilirse, `networkidle0` bu isteği Chromium'dan (sunucu ağından)
  yaptırır → kör SSRF / iç ağ tarama. Ancak bu alanların kaynağı Firestore ve
  **admin/şube-yönetimi tarafından yazılan** veriler; doğrudan anonim kullanıcı girdisi
  değil. Bu yüzden gerçek risk, bu alanlara HTML enjekte edebilen ayrı bir yazma yolu
  (ör. onboarding/branches yazma) bulunmasına bağlı — tek başına doğrulanmış SSRF değil.
- **Önem:** Düşük (koşullu; HTML enjeksiyonuna ve enjekte edenin yetkisine bağlı).
- **Sömürü senaryosu:** Şube adı / dönem etiketi alanına
  `X<img src="http://169.254.169.254/latest/meta-data/iam/security-credentials/">`
  yazılabilirse, PDF üretildiğinde Chromium bu iç adrese istek atar. Yanıt PDF'e
  yansımadığı için kör (blind) SSRF olur; iç servis tarama / cloud metadata denemesi
  için kullanılabilir. Firebase Functions ortamında metadata sunucusu (169.254.169.254)
  erişilebilir olabileceğinden etki potansiyeli göz ardı edilmemeli.
- **Öneri:** (1) `report-template.js`'te tüm serbest-metin alanlarını HTML-escape et
  (bu ayrıca XSS'i de kapatır). (2) Puppeteer'ı dış ağ erişimi olmadan çalıştırmayı
  değerlendir: fontu yerelden/data-URI ile göm, `page.setRequestInterception(true)`
  ile yalnızca `data:`/allowlist host'lara izin ver, gerisini `request.abort()` et.
- **Dinamik test:** Kontrollü ortamda `sube.ad` alanına
  `<img src="http://<dinleyici-host>/pdf-ssrf">` yaz, ilgili şubenin PDF raporunu
  üret; dinleyicide (ör. `nc -lvnp 80` / Burp Collaborator) gelen isteği gözlemle.

---

### [NOT VULNERABLE] Meta Graph API çağrıları

- **Dosya:** `backend/modules/reports/services/meta-api.js:64, 77, 108, 300, 332, 385`
  (`fetch(url)`); URL kurulumu `:63, 75, 106` ve devam sayfaları `url = json.paging?.next`.
- **Fonksiyon/endpoint:** `fetchAccountLevelReach`, `fetchCampaignLevelReach`,
  `fetchMetaInsights` vb. (admin-only `reports.manage` uçlarından tetiklenir).
- **Neden güvenli:** Host **sabit** — `BASE_URL = https://graph.facebook.com/v21.0`
  (`:10`) ve `AD_ACCOUNT_ID = 'act_1095694041713379'` (`:11`) koddaki literal'ler.
  Kullanıcı girdisi yalnızca sorgu parametresi olan `since`/`until` (tarih) ve
  `accessToken` (admin ayarından). Bunlar host'u/şemayı değiştiremez.
- **Not (SSRF değil, ayrı sınıf):** `since`/`until` URL'ye **ham** enterpole ediliyor
  (`time_range={"since":"${since}",...}`, encode yok). Sabit host içinde parametre
  enjeksiyonu riski var (ör. ek query param eklemek); ancak bu SSRF değildir, host
  değişmez. Yine de girdi doğrulaması (tarih formatı) önerilir — bu businesslogic
  raporunun kapsamı.
- **Devam URL'si (`paging.next`):** Meta'nın kendi döndürdüğü URL; yine
  `graph.facebook.com` host'lu, kullanıcı üretmiyor. SSRF değil.

### [NOT VULNERABLE] Google Business Profile REST + SDK çağrıları

- **Dosya:** `backend/modules/reports/services/google-business.js:98, 109, 134, 148`
  (`fetch(...)`) ve `:66, 89, 175, 188` (googleapis SDK).
- **Neden güvenli:** Tüm host'lar sabit literal — `mybusiness.googleapis.com`,
  `mybusinessaccountmanagement.googleapis.com`, `mybusinessbusinessinformation.googleapis.com`.
  `account.name` ve `loc.name` gibi path parçaları **Google'ın kendi API yanıtından**
  gelir (listAccounts → Google), kullanıcı girdisi değil. OAuth `code`
  (`handleGoogleCallback`) Google'ın token endpoint'ine (googleapis SDK'sında sabit)
  gider — URL değil, yetki kodu. `redirectUri` admin ayarından ama sadece OAuth istemci
  yapılandırmasında kullanılır, bir fetch hedefi değildir.
- **Sonuç:** Kullanıcı hiçbir giden isteğin host'unu kontrol edemez. SSRF yok.

### [NOT VULNERABLE] LLM (ürün açıklaması) çağrısı

- **Dosya:** `backend/routes/ai.js:47` (`fetch(\`${AI_BASE_URL}/chat/completions\`)`).
- **Neden güvenli:** `AI_BASE_URL` **ortam değişkeninden** gelir (`:7`,
  `process.env.AI_BASE_URL || 'http://127.0.0.1:8045/v1'`) — kullanıcı kontrolünde
  değil. Kullanıcı girdisi (`ad`, `kategori`, `miktar`) yalnızca istek gövdesindeki
  prompt metnine giriyor, hedefe değil. SSRF yok.

### [NOT VULNERABLE] Nominatim geocode çağrısı

- **Dosya:** `backend/routes/branches.js:18-19`
  (`fetch(\`https://nominatim.openstreetmap.org/search?...&state=${encodeURIComponent(il)}&county=${encodeURIComponent(ilce)}\`)`).
- **Neden güvenli:** Host **sabit** (`nominatim.openstreetmap.org`). Kullanıcı girdisi
  `il`/`ilce` yalnızca sorgu parametresi ve **`encodeURIComponent`** ile kodlanmış —
  host'a/şemaya taşamaz, param enjeksiyonu da engellenmiş. SSRF yok.

### [NOT VULNERABLE] Cloud Logging (googleapis)

- **Dosya:** `backend/logs.js:11, 26` (`google.logging(...).entries.list(...)`).
- **Neden güvenli:** Google Cloud Logging endpoint'i SDK içinde sabit; `filter`,
  `resourceNames` koddaki sabit string'ler/proje kimliğinden (`:23, 28`). Kullanıcı
  girdisi hedefe girmiyor. SSRF yok.

### [NOT VULNERABLE] R2 sil/indir işlemleri (delete-by-url)

- **Dosya:** `backend/routes/upload.js:163` (DELETE /image), `:43` (proxy),
  `backend/modules/academy/routes/upload.js:69` (DELETE /file).
- **Neden güvenli:** Bunlar HTTP fetch değil — S3-uyumlu R2 çağrıları
  (`@aws-sdk/client-s3`), endpoint sabit (`config/r2.js:8`,
  `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`). `req.body.url` → `urlToKey()`
  ile R2 anahtarına çevrilip `deleteFile(key)`/`GetObject`'e veriliyor; giden istek
  **her zaman sabit R2 host'una** gider. Kullanıcının anahtar kontrolü SSRF değil
  (path/IDOR yüzeyi — ilgili raporlarda). `media.js:281` yalnızca `url` string'ini
  Firestore'a **saklar**, hiçbir giden istek yapmaz.

### [NOT VULNERABLE] Academy video/YouTube URL işleme

- **Dosya:** `backend/modules/academy/routes/lessons.js:84-172`,
  `backend/modules/academy/routes/courses.js:176`.
- **Neden güvenli:** `videoUrl`/`pdfUrl` yalnızca Firestore'a **yazılır** ve
  frontend'e **döndürülür**; backend bu URL'lere sunucu tarafında **hiçbir istek
  yapmaz** (fetch/head/embed yok). Video gömme işi tamamen tarayıcıda (frontend
  iframe/embed). Dolayısıyla bu bir SSRF yüzeyi değil. (Kullanıcı `videoUrl`'ü
  doğrulanmadan saklanıyor — potansiyel frontend XSS/`javascript:`/embed sorunu
  olabilir; bu SSRF değil, xss raporunun kapsamı.)

---

## Kapsam / Metodoloji notu

Backend'deki tüm giden ağ çağrısı desenleri tarandı (`fetch`, `axios`, `http(s).get/request`,
googleapis SDK, puppeteer, S3 SDK, DNS/socket). DNS/socket/raw TCP veya kullanıcı URL'si
fetch eden bir "import-from-URL / webhook / screenshot / image-proxy" özelliği **bulunmadı**.
Frontend değerlendirme dışıdır (client tarafı, SSRF sunucu tarafı bir sınıftır).
