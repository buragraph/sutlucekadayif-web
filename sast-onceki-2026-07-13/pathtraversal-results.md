# Path Traversal Analiz Sonuçları: Sütlüce Kadayıf Web

> **Model notu:** Bu uygulama dosya sistemi yerine Cloudflare R2 (S3-uyumlu) nesne
> deposu kullanır. Klasik dizin traversal (`../etc/passwd`) burada geçerli değildir —
> R2 anahtarı (key) düz bir string'dir ve `..` normalizasyonu yoktur; **anahtarın
> kendisi yoldur**. Dolayısıyla bu değerlendirmedeki "path traversal", kullanıcı
> kontrollü bir anahtar segmentinin saldırganı amaçlanan prefix/allowlist dışındaki
> bir bucket nesnesine (**keyfi bucket-içi okuma/yazma/silme**) ulaştırması anlamına
> gelir. Gerçek yerel dosya sistemi sink'i bulunmadı (multer memoryStorage, PDF
> `setContent`, sharp Buffer, `fs` yazımları sabit `os.tmpdir()` altında).
>
> **Ortak kök neden:** `backend/config/r2.js:51-54` `urlToKey(url)` =
> `url.replace(`${PUBLIC_URL}/`, '')` — saf string strip. Girdi `PUBLIC_URL` öneki
> içermiyorsa **hiç değişmeden anahtar olarak döner** (doğrulama/allowlist yok).
> `deleteFile`/`uploadFile` anahtarı doğrudan S3 komutuna geçirir. Silme uçlarında
> pozitif prefix allowlist yerine ya tek-prefix blacklist ya da hiçbir guard yoktur.

## Executive Summary
- Analiz edilen sink sayısı: **14**
- Vulnerable: **5** (#1, #4, #6, #7, #8)
- Likely Vulnerable: **3** (#3, #13, #14)
- Not Vulnerable: **6** (#2, #5, #9, #10, #11, #12)
- Needs Manual Review: **0**

**En kritik bulgu:** Sink #1 — `GET /api/upload/proxy/*` **kimlik doğrulaması olmadan**
keyfi R2 nesne okuması (yalnızca `dekontlar/` prefix reddi ile korunuyor). İnternete
açık, auth'suz gizlilik ihlali.

**Ortak düzeltme:** `urlToKey`'i prefix zorunlu yap (`PUBLIC_URL` ile başlamayan URL'de
`null` dön); tüm okuma/yazma/silme uçlarında **pozitif prefix allowlist**'i (tek-prefix
blacklist değil) FULL anahtar üzerinde uygula; hassas prefix reddini (`dekontlar/`,
`menu/`) ortak bir yardımcıya çıkar; ders/medya `url` alanlarını yazma anında doğrula.

---

## Findings

### [VULNERABLE] Sink #1 — Public görsel/dosya proxy (auth YOK) — keyfi R2 GetObject
- **File**: `backend/routes/upload.js:42-87` (anahtar `:45`, guard `:50-52`, sink `:62-65`)
- **Endpoint / function**: `GET /api/upload/proxy/*` — **auth middleware YOK**
- **Issue**: `key = req.params[0]` tamamen kullanıcı kontrollüdür ve doğrudan
  `GetObjectCommand.Key`'e verilir. Tek koruma `key.startsWith('dekontlar/')` ise 403.
  Bu, tek bir prefix'i reddedip geri kalan her şeye izin veren "single prefix-reject"
  kalıbıdır — etkisiz. Allowlist yoktur; `dekontlar/` dışındaki HERHANGİ bir bucket
  nesnesi (menü JSON cache, gated akademi medyası, gelecekte eklenecek hassas prefixler)
  kimlik doğrulaması olmadan okunabilir.
- **Taint trace**: `GET /api/upload/proxy/<KEY>` → Express joker → `req.params[0]` (`:45`)
  → `startsWith('dekontlar/')` (`:50`, sadece bu prefix'i eler) →
  `GetObjectCommand({ Key: key })` (`:62-65`) → stream `res`'e pipe (`:79`).
- **Missing mitigation**: Çözümlenen tam anahtar üzerinde pozitif prefix ALLOWLIST'i yok.
  Yetki, saldırganın verdiği anahtarın "dekont değil" olmasından çıkarsanıyor.
- **Bypass notu (dekont özelinde sağlam)**: Express param'ları decode ettiği için
  `%64ekontlar/` → `dekontlar/` yine 403; `//dekontlar/x` guard'ı geçse de S3 bunu farklı
  (baştaki slash'lı) bir nesne sayar, gerçek dekonta isabet etmez. Yani dekont sızıntısı
  YOK; asıl açık, dekont dışındaki tüm bucket içeriğinin auth'suz okunabilmesi.
- **Impact**: Kimlik doğrulaması olmayan, bucket genelinde keyfi nesne okuma (dekontlar
  hariç). Public olmayan her nesne (JSON cache, gated içerik) internete açılır. Gizlilik ihlali.
- **Remediation**:
  ```js
  const ALLOWED = ['urunler/', 'menu/', 'akademi/public/'];
  if (!ALLOWED.some(p => key.startsWith(p))) {
    return res.status(403).json({ error: 'Bu kaynağa erişim yetkiniz yok' });
  }
  ```
  Ayrıca `\0`, baştaki `/` ve `..` içeren anahtarları reddet.
- **Dynamic Test**:
  ```bash
  curl -i "https://<HOST>/api/upload/proxy/menu/merkez.json"          # 200 (auth'suz sızıntı)
  curl -i "https://<HOST>/api/upload/proxy/dekontlar/HERHANGI/x.pdf"  # 403 (tek koruma)
  curl -i "https://<HOST>/api/upload/proxy/akademi/gizli/rapor.webp"  # 200 (allowlist olsaydı 403)
  ```

---

### [VULNERABLE] Sink #4 — Ürün görseli silme: tek `dekontlar/` reddi yetersiz — keyfi DeleteObject
- **File**: `backend/routes/upload.js:158-175` (url `:163`, urlToKey `:166`, guard `:168`, sink `:171`)
- **Endpoint / function**: `DELETE /api/upload/image` — `verifyToken` + `requirePermission('products.edit')`
- **Issue**: `key = urlToKey(req.body.url)`, ardından yalnızca
  `if (key && key.startsWith('dekontlar/')) → 403`. Bu tek-önek reddi YALNIZCA dekontları
  korur. `dekontlar/` dışındaki her önek serbesttir: `menu/*.json`, `urunler/*.webp`
  (başka şubelerin ürün görselleri dâhil), `academy/videos/*`, `academy/pdfs/*` vb.
  `products.edit` (sube_sahibi dâhil) bir kullanıcı, kendi şubesi dışındaki tüm ürün
  görsellerini ve menüleri silebilir.
- **Taint trace**: `req.body.url` (`:163`) → `urlToKey(url)` [prefix yoksa değişmeden geçer]
  (`:166`) → `dekontlar/` kontrolü (`:168`) → aksi halde `deleteFile(key)` (`:171`) →
  `DeleteObjectCommand` (`r2.js:39-44`).
- **Missing mitigation**: Blacklist yerine pozitif allowlist gerekir; silinen görselin
  çağıranın şubesine ait olduğu doğrulanmıyor (şube izolasyonu yok).
- **Impact**: Yetkilendirmeyi aşan keyfi nesne SİLME (dekontlar hariç). Çapraz-şube ürün
  görseli ve menü JSON silme; erişilebilirlik/bütünlük kaybı.
- **Remediation**: (1) Allowlist: key `urunler/` (veya çağıranın şube önekine ait yol)
  ile başlamıyorsa 403. (2) Görselin çağıranın şubesine ait olduğunu Firestore ürün
  kaydından doğrula. (3) `urlToKey`'i prefix zorunlu hale getir.
- **Dynamic Test**:
  ```bash
  # products.edit token ile dekontlar dışında herhangi bir nesneyi sil
  curl -X DELETE https://<host>/api/upload/image \
    -H "Authorization: Bearer <PRODUCTS_EDIT_TOKEN>" -H "Content-Type: application/json" \
    -d '{"url":"menu/baska-sube.json"}'          # Beklenen (savunmasız): {"success":true}
  curl -X DELETE https://<host>/api/upload/image \
    -H "Authorization: Bearer <PRODUCTS_EDIT_TOKEN>" -H "Content-Type: application/json" \
    -d '{"url":"dekontlar/x.pdf"}'               # => 403 (kısmi koruma)
  ```

---

### [VULNERABLE] Sink #6 — Akademi dosya silme: `dekontlar` guard'ı YOK — keyfi DeleteObject
- **File**: `backend/modules/academy/routes/upload.js:64-77` (url `:69`, urlToKey `:72`, sink `:73`)
- **Endpoint / function**: `DELETE /api/academy/upload/file` — `verifyToken` + `requirePermission('academy.manage')`
- **Issue**: `url = req.body.url` tamamen kullanıcı kontrollü. `key = urlToKey(url)` → prefix
  yoksa girdi aynen döner. Ardından `if (key) await deleteFile(key)` — **hiçbir prefix/allowlist
  kontrolü yok** (Sink #4'teki `dekontlar/` reddi bile burada eksik). Bir `academy.manage`
  kullanıcısı bucket'taki HERHANGİ bir nesneyi silebilir: başka şubelerin dekont makbuzları
  (`dekontlar/...`), menü JSON'ları (`menu/*.json`), ürün görselleri (`urunler/*.webp`) vb.
- **Taint trace**: `req.body.url` (`:69`) → `urlToKey(url)` [prefix yoksa değişmez] (`:72`) →
  `deleteFile(key)` (`:73`) → `DeleteObjectCommand{Key: key}` (`r2.js:39-44`).
- **Missing mitigation**: Tam-anahtar/prefix allowlist yok; nesnenin `academy/` prefix'ine ait
  olduğu doğrulanmıyor; sunucu tarafı kayıttan anahtar türetme yok.
- **Impact**: Yetkilendirmeyi aşan keyfi nesne SİLME (bütünlük/erişilebilirlik kaybı). Tek bir
  `academy.manage` kullanıcısı bucket genelinde yıkıcı silme yapabilir — mali dekontlar, tüm
  QR menüleri, ürün görselleri geri dönüşsüz silinebilir. **Gating**: `academy.manage` =
  yalnızca `admin` (`permissions.js:47`); dolayısıyla mevcut sürümde güven sınırı aşan bir
  yükseltme değil, savunma-derinliği / kötü niyetli-veya-ele-geçirilmiş-admin / CSRF senaryosudur.
  Sink #4 ile aynı sınıf ama guard tamamen eksik olduğundan dekontlar da dahil.
- **Remediation**: (1) `urlToKey`'i prefix zorunlu yap. (2) Türetilen anahtarın
  `academy/videos/` veya `academy/pdfs/` ile başladığını FULL key üzerinde zorla. (3) Tercihen
  silinecek dosyayı Firestore akademi kaydından çöz, `req.body.url`'e güvenme.
- **Dynamic Test**:
  ```bash
  curl -X DELETE https://<host>/api/academy/upload/file \
    -H "Authorization: Bearer <ACADEMY_MANAGE_TOKEN>" -H "Content-Type: application/json" \
    -d '{"url":"dekontlar/2026-01/kurban-sube-dekont.pdf"}'   # savunmasız: {"success":true}
  curl -X DELETE https://<host>/api/academy/upload/file \
    -H "Authorization: Bearer <ACADEMY_MANAGE_TOKEN>" -H "Content-Type: application/json" \
    -d '{"url":"menu/baska-sube.json"}'
  ```

---

### [VULNERABLE] Sink #7 — Kurs silme: cascade DeleteObject, keyfi R2 nesne silme (admin-gated)
- **File**: `backend/modules/academy/routes/courses.js:167-182` (silme); taint kaynağı
  `backend/modules/academy/routes/lessons.js:82-114` (POST create), `:143-191` (PUT update)
- **Endpoint / function**: `DELETE /api/academy/courses/:id` — `verifyToken` + `academy.manage`
- **Issue**: Kurs silinirken alt koleksiyondaki her ders için
  `url = d.data().videoUrl || d.data().pdfUrl; key = urlToKey(url); deleteFile(key)` (`:176-181`).
  `videoUrl`/`pdfUrl` alanları ders oluşturma/güncelleme gövdesinden HAM olarak Firestore'a
  yazılır — hiçbir prefix/allowlist/format doğrulaması yok. Admin `videoUrl` alanına akademi
  prefix'i dışında keyfi bir string koyabildiğinden, silme keyfi R2 nesnesi silmeye dönüşür
  (second-order).
- **Taint trace**: (1) `POST /api/academy/lessons/:courseId` gövdesi → `videoUrl` (`lessons.js:84`).
  (2) `lessonData.videoUrl = lessonType === 'video' ? (videoUrl || '') : ''` (`lessons.js:102`)
  — doğrulanmadan Firestore'a yazılır (PUT de `:172`). (3) `DELETE .../courses/:id` →
  `urlToKey(videoUrl)` (`courses.js:179`), prefix taşımadığından key = `videoUrl`. (4)
  `deleteFile(key)` (`courses.js:180`) → `DeleteObjectCommand` (`r2.js:39-44`).
- **Missing mitigation**: FULL key üzerinde `academy/` prefix zorunluluğu yok; ne create
  anında (url'in `${PUBLIC_URL}/academy/...` kalıbına uyması) ne silme anında doğrulama var.
- **Impact**: Bucket içinde keyfi nesne SİLME (ör. `videoUrl = menu/amasya.json` veya
  `dekontlar/<sube>/<dosya>.pdf`; kurs silinince o nesne yok edilir). Yalnızca silme.
  **Gerçek istismar admin yetkisi gerektirir** (`academy.manage` = yalnızca admin) — güven
  sınırı aşan yükseltme değil; savunma-derinliği / insider / CSRF / stored-value senaryosu.
- **Remediation**: (1) Ders create/update'te `videoUrl`/`pdfUrl`'ün `${PUBLIC_URL}/academy/`
  ile başladığını doğrula (tercihen yalnızca akademi upload endpoint'inin döndürdüğü key'i
  sakla). (2) `deleteFile`'dan önce key'in `academy/` prefix'inde olduğunu kontrol et. (3)
  `urlToKey`'i prefix zorunlu yap.
- **Dynamic Test**:
  ```bash
  BASE=http://localhost:5001/api; TOKEN=<admin_id_token>; CID=<hedef_kurs_id>
  curl -s -X POST "$BASE/academy/lessons/$CID" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"title":"x","lessonType":"video","videoUrl":"menu/amasya.json"}'   # 201, doğrulama yok
  curl -s -X DELETE "$BASE/academy/courses/$CID" -H "Authorization: Bearer $TOKEN"
  # savunmasız: {"success":true}; menu/amasya.json R2'den silinir
  ```

---

### [VULNERABLE] Sink #8 — Ders silme: DeleteObject, keyfi R2 nesne silme (admin-gated)
- **File**: `backend/modules/academy/routes/lessons.js:40-50` (`deleteLessonFile`), çağrı `:205`
  (DELETE) ve dolaylı update akışı; taint kaynağı `:82-114` (create), `:143-191` (update)
- **Endpoint / function**: `DELETE /api/academy/lessons/:courseId/:lessonId` — `verifyToken` + `academy.manage`
- **Issue**: `deleteLessonFile(data)` → `url = data.videoUrl || data.pdfUrl; key = urlToKey(url);
  deleteFile(key)` (`:42-46`). #7 ile aynı kök neden: ders `videoUrl`/`pdfUrl` alanı
  oluşturma/güncellemede ham gövdeden prefix doğrulaması olmadan yazılır; silmede keyfi R2
  anahtarına dönüşür.
- **Taint trace**: (1) `POST .../lessons/:courseId` gövdesi → `pdfUrl` (`lessons.js:84`). (2)
  `lessonData.pdfUrl = lessonType === 'pdf' ? (pdfUrl || '') : ''` (`lessons.js:103`) —
  doğrulanmadan yazılır. (3) `DELETE .../lessons/:courseId/:lessonId` →
  `deleteLessonFile(doc.data())` (`:205`) → `urlToKey(pdfUrl)` (`:44`), key = `pdfUrl`. (4)
  `deleteFile(key)` (`:46`) → `DeleteObjectCommand`.
- **Missing mitigation**: #7 ile aynı — FULL key prefix allowlist yok; `urlToKey` prefix
  taşımayan girdiyi aynen geçiriyor.
- **Impact**: Tek ders silme ile bucket içinde keyfi nesne SİLME (#7'ye göre tek nesne, aynı
  sınıf). **Admin yetkisi gerektirir** (savunma-derinliği/insider). PUT güncelleme, ders tipi
  değiştiğinde eski dosyayı temizlemek için de aynı `deleteLessonFile`'ı çağırabilir.
- **Remediation**: #7 ile aynı üç madde.
- **Dynamic Test**:
  ```bash
  BASE=http://localhost:5001/api; TOKEN=<admin_id_token>; CID=<kurs_id>
  LID=$(curl -s -X POST "$BASE/academy/lessons/$CID" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"title":"x","lessonType":"pdf","pdfUrl":"dekontlar/baska-sube/2026-05.pdf"}' \
    | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  curl -s -X DELETE "$BASE/academy/lessons/$CID/$LID" -H "Authorization: Bearer $TOKEN"
  # savunmasız: {"success":true}; hedef dekont R2'den silinir
  ```

---

### [LIKELY VULNERABLE] Sink #3 — Ürün görseli yükleme: kullanıcı-kontrollü folder prefix — PutObject
- **File**: `backend/routes/upload.js:130-151` (folder `:142`, anahtar `:143`, sink `:145`)
- **Endpoint / function**: `POST /api/upload/image` — `verifyToken` + `requirePermission('products.edit')`
- **Issue**: `folder = req.body.folder || 'urunler'` doğrulanmadan
  `fileName = `${folder}/${crypto.randomUUID()}.webp`` içine konur ve PutObject anahtarı olur.
  `folder` üzerinde allowlist YOK. Yarı güvenilir bir şube sahibi `folder`'ı serbestçe seçerek
  bucket'ta herhangi bir prefix altına yazabilir (write-side traversal analogu). Örn.
  `folder = "dekontlar/CAMP"` → `dekontlar/CAMP/<uuid>.webp` yazılır; korumalı isim uzayına
  nesne enjekte edilir.
- **Taint trace**: `req.body.folder` (`:142`) → `fileName = `${folder}/<uuid>.webp`` (`:143`)
  → `uploadFile(..., fileName, ...)` (`:145`) → `PutObjectCommand({Key: fileName})` (`r2.js:26-30`).
- **Concern (neden LIKELY, VULNERABLE değil)**: Basename daima sunucu ürettiği `${uuid}.webp`;
  saldırgan tam anahtarı seçemez, dolayısıyla bilinen belirli bir nesnenin (ör. bir kurbanın
  `dekontlar/CAMP/victimSlug.pdf` dekontunun) ÜZERİNE YAZAMAZ. İçerik sharp ile `image/webp`'e
  zorlanır. Etki "keyfi prefix'e yazma + rastgele basename" ile sınırlı; keyfi tam-anahtar
  overwrite değil. Yine de prefix allowlist prensibi ihlal edilir ve hassas isim uzaylarına
  yazım (depolama kirliliği/çöp nesne) mümkündür.
- **Remediation**:
  ```js
  const ALLOWED_FOLDERS = new Set(['urunler', 'akademi', 'kategori']);
  const folder = ALLOWED_FOLDERS.has(req.body.folder) ? req.body.folder : 'urunler';
  ```
  Alternatif: `folder`'ı kaldırıp sabit `urunler/` kullan, ya da `/`, `..`, `\0` içerenleri reddet.
- **Dynamic Test**:
  ```bash
  curl -i -H "Authorization: Bearer <SUBE_TOKEN>" \
    -F "folder=dekontlar/INJECT" -F "image=@test.png;type=image/png" \
    "https://<HOST>/api/upload/image"
  # Yanıttaki "key" = dekontlar/INJECT/<uuid>.webp ise write-side traversal doğrulanır.
  ```

---

### [LIKELY VULNERABLE] Sink #13 — Media toplu silme: urlToKey ile keyfi DeleteObject (dekontlar guard'ı yok)
- **File**: `backend/routes/media.js:220-248` (kritik `:231-238`); taint kaynağı `POST /api/media`
  create `:281, :293-294, :299`
- **Endpoint / function**: `POST /api/media/bulk-delete` — `verifyToken` + `requirePermission('categories.delete')`
- **Issue**: `ids = req.body.ids`; her `id` için `medya/{id}` okunur, `key = urlToKey(d.data().url)`
  ve `deleteFile(key)` çağrılır (`:234-236`). Anahtarda prefix guard YOK; `url` alanı da (aşağıda)
  saldırgan kontrollü olabildiğinden anahtar `dekontlar/*` banka makbuzları, `menu/*.json` yayın
  menüleri dâhil HERHANGİ bir nesneyi gösterebilir.
- **Taint trace**: (1) `POST /api/media` gövdesi → `url` (`media.js:281`) → yalnızca boş-değil
  kontrolü (`:286-288`) → `docData.url = url.trim()` (`:293-294`) → `medya`'ya kaydedilir (`:299`).
  **url tamamen saldırgan kontrollü, prefix doğrulaması yok.** (2) `POST /api/media/bulk-delete`
  → `ids` (`:225`) → `medya/{id}.get()` (`:231`) → `d.data().url` → `urlToKey(url)` (`:234`,
  saf strip → prefix yoksa aynen anahtar) → `deleteFile(key)` (`:236`).
- **Missing mitigation**: Silmeden önce FULL anahtar üzerinde katı prefix allowlist yok;
  `dekontlar/`/`menu/` reddi yok (`upload.js:168` guard'ı buraya taşınmamış — tutarsızlık);
  create anında `url` biçim/prefix doğrulaması yok; medya global koleksiyon, ownership/şube
  filtresi yok.
- **Impact**: `categories.delete` (yalnızca admin) sahibi, keyfi `url`'li medya dokümanı
  oluşturup toplu silerek banka dekontlarını (`dekontlar/<kampanyaId>/<subeKod>.<ext>`) ve
  yayınlanmış menü JSON'larını (`menu/<subeSlug>.json`) R2'den kalıcı silebilir → veri kaybı,
  menü servisinin bozulması, dekont kanıtlarının yok edilmesi. **Hafifletici**: hem create
  (`categories.create`) hem delete (`categories.delete`) yalnızca admin (`permissions.js:36-37`)
  → mevcut sürümde yetki yükseltmesi değil, savunma-derinliği/tutarsızlık açığı; ancak keyfi-anahtar
  silme yeteneği gerçektir ve create izni gevşetilir/başka yol `medya`'ya yazarsa tam sömürülebilir.
- **Remediation**: (1) `deleteFile`'dan önce anahtarı katı allowlist ile doğrula (yalnızca
  `urunler/`, `medya/` vb.). (2) `dekontlar/`, `menu/` reddini ortak yardımcıya çıkarıp burada da
  kullan. (3) `POST /api/media` create'te `url`'in `PUBLIC_URL` + beklenen prefix'te olmasını zorunlu kıl.
- **Dynamic Test**:
  ```bash
  DOC=$(curl -s -X POST https://<host>/api/media -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" -d '{"ad":"x","url":"dekontlar/KAMPANYA123/SUBE01.pdf"}' | jq -r '.id')
  curl -s -X POST https://<host>/api/media/bulk-delete -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" -d "{\"ids\":[\"$DOC\"]}"
  # Doğrula: dekont artık erişilemez (404)
  ```

---

### [LIKELY VULNERABLE] Sink #14 — Media tekil silme: urlToKey ile keyfi DeleteObject (dekontlar guard'ı yok)
- **File**: `backend/routes/media.js:341-366` (kritik `:355-360`); taint kaynağı `POST /api/media` create
- **Endpoint / function**: `DELETE /api/media/:id` — `verifyToken` + `requirePermission('categories.delete')`
- **Issue**: `medya/{id}` okunur, `const { url } = doc.data(); key = urlToKey(url); deleteFile(key)`
  (`:355-359`). Sink #13 ile aynı: anahtarda prefix guard yok, `url` saklanma anında saldırgan kontrollü.
- **Taint trace**: (1) Saklama: `POST /api/media` gövdesi `url` (`:281`) → `docData.url` (`:293-294`)
  → `medya`'ya yazılır (`:299`), doğrulama yok. (2) Silme: `DELETE /api/media/:id` → `req.params.id`
  → `medya/{id}.get()` (`:348-349`) → `doc.data().url` (`:355`) → `urlToKey(url)` (`:357`) →
  `deleteFile(key)` (`:359`). Ek: `:id` üzerinde şube/sahiplik kontrolü yok (IDOR yüzeyi).
- **Missing mitigation**: Silme öncesi FULL anahtar prefix allowlist / hassas prefix reddi yok;
  create'te url doğrulaması yok; ownership kontrolü yok.
- **Impact**: Sink #13 ile aynı — admin, keyfi `url`'li tek medya dokümanı ile bucket'taki herhangi
  bir nesneyi kalıcı silebilir. Her iki uç admin-only olduğundan mevcut sürümde savunma-derinliği
  açığı; keyfi-anahtar silme yeteneği gerçek ve `upload.js`'teki korumayla tutarsız.
- **Remediation**: Sink #13 ile aynı — silme öncesi katı prefix allowlist + hassas prefix reddi
  (ortak yardımcı), create'te url prefix doğrulaması, medya için ownership/şube filtresi.
- **Dynamic Test**:
  ```bash
  DOC=$(curl -s -X POST https://<host>/api/media -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" -d '{"ad":"x","url":"menu/sube-01.json"}' | jq -r '.id')
  curl -s -X DELETE "https://<host>/api/media/$DOC" -H "Authorization: Bearer $ADMIN_TOKEN"
  curl -s -o /dev/null -w "%{http_code}" "https://<host>/api/upload/proxy/menu/sube-01.json"
  ```

---

### [NOT VULNERABLE] Sink #2 — Kimlik doğrulamalı dekont okuma
- **File**: `backend/routes/upload.js:96-124` (anahtar `:100`, prefix gate `:101`, yetki `:106-110`, sink `:113`)
- **Endpoint / function**: `GET /api/upload/dekont/*` — `verifyToken` + şube kontrolü
- **Reason**: `key = req.params[0]` kullanıcı kontrollü olsa da yetki, anahtarın 3. segmentine
  (`key.split('/')[2]`, uzantısı soyulmuş) bağlanır ve `req.user.subeSlug` ile TAM eşitlik aranır
  (`:108`). Dekont adlandırma konvansiyonu sunucuda zorlanır (`budget-routes.js:786,832` →
  `subeKod = req.user.subeSlug`, `key = dekontlar/${kampanyaId}/${subeKod}.${ext}`); her dekont
  daima tam 3 segmentlidir ve segment[2]'nin kökü kimlikten türetilen sahibin slug'ıdır. Cross-branch
  okuma: `dekontlar/CAMP/victimSlug.pdf` → segment[2]=`victimSlug` → 403. `..` ile kaçış: S3 normalize
  etmez, literal anahtarda nesne yok → 404. Segment kaydırma: `undefined`/`''` → 403. Slug'lar tam
  eşitlikle karşılaştırıldığından `sube1` vs `sube10` prefix karışması yok. Şube kontrolü etkili.

---

### [NOT VULNERABLE] Sink #5 — Akademi dosya yükleme: kullanıcı türevli uzantı segmenti
- **File**: `backend/modules/academy/routes/upload.js:41-46`
- **Endpoint / function**: `POST /api/academy/upload/file` — `verifyToken` + `academy.manage`
- **Reason**: `ext = req.file.originalname.split('.').pop().toLowerCase()` →
  `fileName = `${folder}/${uuid}.${ext}``. `folder` sabit (`academy/videos`|`academy/pdfs`),
  UUID sunucu üretimi. `ext` slash içerebilse de anahtar DAİMA sunucu-üretimi
  `academy/{videos,pdfs}/<uuid>.` önekiyle başlar; R2'de `..` normalizasyonu olmadığından önek
  kaçışı imkânsız ve tahmin edilemez UUID nedeniyle var olan nesnenin üzerine yazma yok. Kalan
  ext-sanitizasyon/MIME uyumsuzluğu path traversal değil, **file-upload** kapsamı (sast-fileupload'a bırakıldı).

---

### [NOT VULNERABLE] Sink #9 — Menü JSON cache yazımı: PutObject `menu/${subeSlug}.json`
- **File**: `backend/modules/qr-menu/services/menu-cache.js:58`
- **Endpoint / function**: `regenerateMenuJson(subeSlug)` (iç servis; çağıranlar menu.js:110,
  categories.js:88/128/187, products.js:179/193/388/425/501/528/564)
- **Reason**: `subeSlug` ya `subeler` koleksiyonunun Firestore doc id'lerinden (`regenerateAllMenuJsons`)
  ya da sunucuda bulunan ürün dokümanından (`found.subeSlug`) gelir; body'den geldiği tek yer
  `products.js:564` (toggle-availability) non-admin için ownership kontrolüyle (`:546`) kısıtlı.
  `regenerateMenuJson` `uploadFile`'dan ÖNCE `subeDoc.exists` kontrolü yapar (`:18-21`) → yazma yalnızca
  gerçek şubeye karşılık gelir. Key daima `menu/` prefix'i + `.json` suffix'i içinde kalır; Firestore
  doc id'si `/` içeremez → dizin kaçışı imkânsız. **Sertleştirme önerisi**: `branches.create`'te slug'a
  `^[a-z0-9-]+$` regex ekle (şu an sadece `trim().toLowerCase()`).

---

### [NOT VULNERABLE] Sink #10 — Dekont upload (PutObject)
- **File**: `backend/modules/reports/budget-routes.js:830-833` (route 777-862)
- **Endpoint / function**: `POST /butce-gonder/:kampanyaId` — `verifyToken` + `requirePermission('budget.submit')`
- **Reason**: `key = dekontlar/${kampanyaId}/${subeKod}.${ext}` — üç segment de güvenli: (1) `subeKod`
  = `req.user.subeSlug` (auth claim, `:786`), body'den değil → şube en fazla KENDİ dekontunu ezer.
  (2) `kampanyaId` key'de kullanılmadan var-olma doğrulamasından geçer (404, `:805-810`) ve yalnızca
  admin'in tarih-formatlı (`${donem_baslangic}_${donem_bitis}`) ID'leriyle sınırlı. (3) `ext` multer
  `fileFilter` (`:23-28`) ile `pdf/jpg/jpeg/png` allowlist'ine sabitlenmiş; `split('.').pop()` son
  segmenti alır, `x.pdf/../../victim` → `/victim` allowlist'te yok → reddedilir. Key
  `dekontlar/<kampanya>/<slug>.<ext>` prefix'inden çıkamaz.

---

### [NOT VULNERABLE] Sink #11 — Dekont replace (eski dosya DeleteObject)
- **File**: `backend/modules/reports/budget-routes.js:835-838`
- **Endpoint / function**: aynı `POST /butce-gonder/:kampanyaId`
- **Reason**: İkinci-derece: `eskiKey = urlToKey(mevcutYanit.dekont_url)`. `dekont_url` yalnızca
  sink #10'da sunucu tarafında yazılıyor (`:848`, `dekontUrl = uploadFile(...)` = `${PUBLIC_URL}/${güvenli-key}`).
  `grep -rn dekont_url backend/` ile bu alanı yazan tek yer teyit edildi; hiçbir request body atamıyor
  (`veri_overrides`/kampanya güncelleme/admin onay endpoint'leri dokunmuyor). `eskiKey !== key` guard'ı
  silmeyi kendi eski güvenli key'iyle sınırlar. Keyfi silme mümkün değil.

---

### [NOT VULNERABLE] Sink #12 — Kampanya silme cascade (dekont DeleteObject)
- **File**: `backend/modules/reports/budget-routes.js:64-74` (`deleteDekontlar`), çağrı `:139, :308`
- **Endpoint / function**: `DELETE /butce-kampanya/:id` — `verifyToken` + `requirePermission('budget.manage')` (admin-only)
- **Reason**: Sink #11 ile aynı ikinci-derece kaynak: her `yanit.dekont_url` yalnızca sink #10
  tarafından sunucu tarafında yazılmış güvenli key'li public URL. `deleteDekontlar` bunları iterasyonla
  siler; endpoint admin-only ve silinecek key'ler kampanyanın kendi yanıtlarındaki sunucu-üretimi
  URL'lerle sınırlı. Keyfi bucket nesnesi silme yolu yok.

---

## Öncelikli Aksiyon Sırası
1. **Sink #1** (kritik, auth'suz): `GET /api/upload/proxy/*` için pozitif prefix allowlist uygula.
2. **`urlToKey` sertleştirme** (`r2.js:51-54`): `PUBLIC_URL` ile başlamayan URL'de `null` dön —
   Sink #4/#6/#7/#8/#13/#14'ün ortak temeli.
3. **Ortak silme guard'ı**: `dekontlar/`+`menu/` reddi ve pozitif allowlist'i tek yardımcıya çıkar;
   `upload.js` (#4), `academy/routes/upload.js` (#6), `media.js` (#13/#14) ve akademi cascade
   (#7/#8) silme yollarında uygula.
4. **Yazma-anı doğrulama**: ders `videoUrl`/`pdfUrl` (#7/#8) ve medya `url` (#13/#14) alanlarını
   `${PUBLIC_URL}/<beklenen-prefix>` kalıbına karşı doğrula.
5. **Sink #3**: `folder` için allowlist.
6. **Sertleştirme**: `branches.create` slug regex (`^[a-z0-9-]+$`); medya için ownership/şube filtresi.
