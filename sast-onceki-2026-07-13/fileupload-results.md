# Güvensiz Dosya Yükleme Analizi: Sütlüce Kadayıf Web

> SAST Faz 2 — insecure file upload. Bağlam: `sast/architecture.md`.
> Analiz eden: sast-fileupload skill (3 depolama sitesi + 1 in-memory parse).

## Önemli mimari not (önem seviyesini belirler)

Yüklenen dosyalar **Cloudflare R2 nesne deposuna** (S3-uyumlu) yazılır ve `GET /api/upload/proxy/*`
veya `/api/upload/dekont/*` üzerinden bir **Node proxy** ile byte-byte stream edilir. R2 bir
web sunucusu değildir; yüklenen dosya sunucu tarafında **çalıştırılmaz** (PHP/JSP/Node execution yok,
`require`/`include` edilmez). Dolayısıyla klasik **web-shell → RCE** senaryosu bu mimaride
**gerçekleşmez**. Bu skill kapsamındaki bulgular bu yüzden RCE değil; içerik doğrulama zayıflığı,
kullanıcı kontrollü R2 key prefix'i (key/prefix injection) ve saldırgan kontrollü `Content-Type`'ın
sunum yoluna ulaşması etrafında toplanır. Bu nedenle azami önem **Orta**'dır.

Ek olarak: `helmet` global olarak `X-Content-Type-Options: nosniff` gönderir
(`backend/server.js:36`), yani tarayıcı MIME-sniff yapmaz — sunulan `Content-Type` neyse ona uyar.
Bu, depolanan `Content-Type`'ı doğrudan güvenlik açısından belirleyici kılar.

## Executive Summary
- İncelenen yükleme sitesi: 4 (3 R2 depolama + 1 in-memory CSV)
- Vulnerable (CONFIRMED): 0 (RCE anlamında)
- Plausible / kayda değer zayıflık: 3
- Not Vulnerable: 1
- Needs Manual Review: 0

---

## Bulgular

### [PLAUSIBLE] Academy dosya yükleme — uzantı kullanıcı dosya adından, içerik yeniden kodlanmıyor, MIME spoofable
- **Dosya**: `backend/modules/academy/routes/upload.js:31-58` (multer filter `:11-25`)
- **Endpoint**: `POST /api/academy/upload/file` (auth: `verifyToken` + `requirePermission('academy.manage')`)
- **Sorun**:
  1. Uzantı doğrudan kullanıcı dosya adından türetiliyor ve **allowlist'e karşı doğrulanmıyor**:
     `const ext = req.file.originalname.split('.').pop().toLowerCase();` (satır 41) →
     `academy/${videos|pdfs}/${uuid}.${ext}` (satır 44). `ext` üzerinde hiçbir kısıt yok;
     `shell.html`, `x.svg`, `y.xml`, uzantısız isim (`ext` = tüm ad) hepsi geçer.
  2. Tek doğrulama `file.mimetype` allowlist'i (`video/mp4|webm|quicktime`, `application/pdf`).
     Ancak `file.mimetype` multipart part'ın `Content-Type` başlığından gelir ve **tamamen saldırgan
     kontrolündedir** — güvenlik kontrolü olarak kullanılamaz.
  3. İçerik **hiç yeniden kodlanmıyor / magic-byte doğrulaması yok**. Ham buffer aynen R2'ye yazılıyor
     (`uploadFile(req.file.buffer, fileName, req.file.mimetype)`, satır 46). Ürün görselindeki `sharp`
     WebP yeniden kodlaması burada yok.
- **Bypass vektörü**: `academy.manage` yetkili bir kullanıcı, multipart part'ta `Content-Type: application/pdf`
  gönderip dosya adını `evil.html` (veya `.svg`) yaparak istediği içeriği `academy/pdfs/{uuid}.html`
  anahtarıyla R2'ye yazabilir. Depolanan `ContentType` yine de `application/pdf` (mimetype allowlist'i
  bunu `application/pdf`/`video/*` ile sınırlar), dolayısıyla proxy sunumunda dosya `application/pdf`
  olarak sunulur — bu, `text/html` olarak render edilmeyi engeller ve saldırıyı sınırlar. Asıl kalıcı
  risk uzantı/içerik/tip uyuşmazlığı ve içerik doğrulamasının hiç yapılmamasıdır (bozuk/kötücül PDF,
  polyglot dosyalar). RCE'ye yol yok (R2 execute etmez).
- **Depolama yolu**: R2 `academy/videos/*` ve `academy/pdfs/*`. Sunum: dosyalar YouTube/PDF olarak
  frontend'de link edilir; PDF'ler muhtemelen `/api/upload/proxy/*` (auth'suz) üzerinden sunulabilir.
- **Etki**: RCE yok. Uzantı allowlist'inin ve içerik doğrulamasının olmaması nedeniyle beklenmeyen
  dosya türleri R2'ye yazılır; mimetype tabanlı filtre spoof edilebilir. Orta-düşük.
- **Öneri**: (a) Uzantıyı `file.mimetype`'a değil, **sunucu tarafında sabit bir allowlist'e** göre
  belirle (video→`.mp4`, pdf→`.pdf`); kullanıcı `originalname` uzantısını key'e koyma. (b) İçeriği
  magic-byte ile doğrula (ör. `file-type` paketi ile ilk byte'ları oku, PDF için `%PDF`, mp4 için
  ftyp box). (c) mimetype'ı güvenlik kontrolü olarak kullanma.
- **Dynamic Test**:
  ```
  curl -X POST https://<host>/api/academy/upload/file \
    -H "Authorization: Bearer <academy.manage token>" \
    -F "file=@payload.html;type=application/pdf;filename=evil.html"
  # → R2 key: academy/pdfs/<uuid>.html, depolanan ContentType: application/pdf
  ```

---

### [PLAUSIBLE] Ürün görseli yükleme — `folder` (req.body) sanitizasyonsuz R2 key prefix'ine giriyor
- **Dosya**: `backend/routes/upload.js:130-151` (özellikle `:142-143`)
- **Endpoint**: `POST /api/upload/image` (auth: `verifyToken` + `requirePermission('products.edit')`)
- **Sorun**: `const folder = req.body.folder || 'urunler';` ardından
  `const fileName = \`${folder}/${crypto.randomUUID()}.webp\`;` (satır 142-143). `folder` kullanıcı
  girdisi ve **hiç sanitize edilmiyor** — R2 nesne anahtarının prefix'ini doğrudan belirliyor.
  `folder` = `"dekontlar/xyz"`, `"menu"`, `"../../herhangi"` gibi değerler kabul edilir.
- **Bypass vektörü**: Saldırgan `folder` = `dekontlar/999` göndererek görseli
  `dekontlar/999/{uuid}.webp` anahtarıyla R2'ye yazabilir; yani `products.edit` yetkisiyle normalde
  yalnızca dekont-yazma alanı olan `dekontlar/` prefix'ine nesne enjekte edilebilir. İçerik `sharp`
  ile WebP'ye yeniden kodlandığı ve dosya adı rastgele UUID olduğu için (a) mevcut bir dekontu
  (`dekontlar/{kampanyaId}/{subeKod}.ext`) **üzerine yazma** ya da (b) menü JSON'unu
  (`menu/{subeSlug}.json`) geçerli içerikle **zehirleme** mümkün değil — bu iki faktör etkiyi
  sınırlar. Kalan risk: keyfi prefix altında nesne birikmesi (depolama kirlenmesi) ve `dekontlar/`
  gibi mantıksal olarak korunması gereken alana yetkisiz yazma.
- **Depolama yolu**: R2, kullanıcı-belirlemeli prefix. Sunum `/api/upload/proxy/*` (auth'suz),
  ancak proxy `dekontlar/` prefix'ini okumada 403 verir (satır 50-52) — yani `dekontlar/`'a yazılan
  görsel proxy'den okunamaz; yine de yazma gerçekleşir.
- **Etki**: Path/prefix injection; R2 key namespace'i kullanıcı kontrolünde. RCE veya doğrudan üzerine
  yazma yok. Orta-düşük.
- **Öneri**: `folder`'ı **sabit bir allowlist'e** kısıtla (ör. `['urunler','kategoriler','sube'].includes(folder) ? folder : 'urunler'`).
  Alternatif olarak slug regex ile temizle (`/^[a-z0-9_-]+$/`), `/`, `.`, `..` içeren değerleri reddet.
- **Dynamic Test**:
  ```
  curl -X POST https://<host>/api/upload/image \
    -H "Authorization: Bearer <products.edit token>" \
    -F "folder=dekontlar/attacker" \
    -F "image=@pic.png;type=image/png"
  # → R2 key: dekontlar/attacker/<uuid>.webp
  ```

---

### [PLAUSIBLE] Dekont yükleme — `Content-Type` (mimetype) doğrulanmıyor, sunumda saldırgan-kontrollü tip
- **Dosya**: `backend/modules/reports/budget-routes.js:19-29` (filter) ve `:828-838` (yazma)
- **Endpoint**: `POST /api/reports/butce-gonder/:kampanyaId` (auth: `verifyToken` + `requirePermission('budget.submit')`)
- **Sorun**: Multer filter **yalnızca uzantıyı** doğruluyor (`['.pdf','.jpg','.jpeg','.png']`, satır 24-26).
  Uzantı bu 4 değere kısıtlı (iyi), ancak:
  1. `req.file.mimetype` **hiç doğrulanmıyor** ve depolanan `ContentType` olarak aynen kullanılıyor:
     `uploadFile(req.file.buffer, key, req.file.mimetype)` (satır 833). Saldırgan `Content-Type: text/html`
     gönderebilir; dosya adı `dekont.pdf` (uzantı filtresini geçer).
  2. İçerik yeniden kodlanmıyor / magic-byte doğrulaması yok — ham buffer yazılıyor.
  3. Anahtar `dekontlar/${kampanyaId}/${subeKod}.${ext}` (satır 832): `subeKod` token'dan (güvenli),
     `kampanyaId` URL param ama var olan kampanyaya karşı doğrulanıyor (satır 806-810), `ext` uzantı
     filtresiyle 4 değere sınırlı — key injection riski düşük.
- **Bypass vektörü**: Şube sahibi (`budget.submit`) `dekont.pdf` adıyla ama `Content-Type: text/html`
  ve içerikte `<script>` ile dosya yükler. R2'de `ContentType: text/html` saklanır. Dekont
  `/api/upload/dekont/*` (auth + şube sahipliği kontrolü) üzerinden sunulduğunda proxy
  `res.set('Content-Type', result.ContentType)` = `text/html` döner (`routes/upload.js:114`) ve
  `nosniff` aktif olduğundan tarayıcı HTML olarak render eder → **dekontu inceleyen admin'e karşı
  stored XSS**. Not: Stored-XSS bu skill'in birincil kapsamı değil (xss skill'i kapsar), ancak kök
  neden burada bir **dosya yükleme içerik/tip doğrulama eksikliğidir**, bu yüzden kaydedilir.
  `/api/upload/proxy/*` `dekontlar/` prefix'ini reddettiği için (auth'suz) yol bu değil; yalnızca
  authed `/dekont/*` sunar.
- **Depolama yolu**: R2 `dekontlar/{kampanyaId}/{subeKod}.{ext}`. Sunum: `/api/upload/dekont/*`
  (auth + şube/rol kontrolü) — public proxy reddediyor.
- **Etki**: Saldırgan-kontrollü `Content-Type` + doğrulanmamış içerik → dekontu görüntüleyen
  admin/şube kullanıcısına karşı stored XSS vektörü. RCE yok. Orta.
- **Öneri**: (a) `mimetype`'ı da uzantıyla tutarlı bir **allowlist'e** göre doğrula veya depolanan
  `ContentType`'ı uzantıdan **sunucu tarafında türet** (`.pdf`→`application/pdf`, `.jpg`→`image/jpeg`),
  saldırgan başlığını kullanma. (b) Görselleri (`sharp` gibi) yeniden kodla / PDF magic-byte doğrula.
  (c) `/dekont/*` sunumunda `Content-Disposition: attachment` ve sabit güvenli `Content-Type` düşün.
- **Dynamic Test**:
  ```
  curl -X POST https://<host>/api/reports/butce-gonder/<kampanyaId> \
    -H "Authorization: Bearer <budget.submit token>" \
    -F "secilen_bakiye=1000" -F "kdv_dahil_tutar=1180" \
    -F "dekont=@xss.html;type=text/html;filename=dekont.pdf"
  # → R2'de dekontlar/<kampanyaId>/<subeKod>.pdf, ContentType: text/html
  # Admin /api/upload/dekont/... açtığında HTML/JS çalışır.
  ```

---

### [NOT VULNERABLE] CSV içe aktarma yükleme (in-memory parse, depolanmıyor)
- **Dosya**: `backend/modules/reports/routes.js:340-377`
- **Endpoint**: `POST /api/reports/upload` (auth: `verifyToken` + `requirePermission('reports.manage')`)
- **Neden güvenli (bu skill kapsamında)**: Dosya `memoryStorage` ile alınıp `req.file.buffer` olarak
  **doğrudan CSV parser'a** veriliyor (`importMetaCsv`/`importGoogleCsv`); R2'ye veya diske **asla
  yazılmıyor**, sunulmuyor, çalıştırılmıyor. Uzantı `.csv` allowlist'i mevcut (satır 343). Depolama/
  sunum yolu olmadığından insecure-file-upload (execution/serve) yüzeyi yok. Not: `originalname`
  `importGoogleCsv`'e parametre olarak geçiyor (satır 367-369) — CSV içerik ayrıştırma/injection ayrı
  bir konudur, bu skill kapsamı dışı.

---

## Genel öneriler (tüm yükleme siteleri)
1. **mimetype'ı güvenlik kontrolü olarak kullanma** — multipart `Content-Type` tamamen istemci
   kontrolündedir. Academy ve dekont filtreleri bu yüzden zayıf.
2. **Uzantıyı kullanıcı dosya adından türetme** — sunucu tarafında sabit/allowlist uzantı ata
   (academy ve dekont anahtarlarında `originalname` uzantısı kullanılıyor).
3. **Depolanan `Content-Type`'ı sunucuda belirle**, saldırgan başlığından kopyalama (dekont satır 833).
4. **`folder`/prefix gibi key-parçası kullanıcı girdilerini allowlist/regex ile sanitize et**
   (ürün upload satır 142).
5. **İçeriği yeniden kodla veya magic-byte doğrula** — görseller `sharp` ile (ürün upload'ta zaten var),
   video/PDF için ilk byte imzası doğrula (academy/dekont'ta yok).
