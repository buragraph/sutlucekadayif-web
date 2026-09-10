# Güvenlik Değerlendirmesi — Nihai Rapor

**Proje**: Sütlüce Kadayıf Web (QR Menü + Raporlama + Akademi) — Express/Firebase Functions + React/Vite + Firestore + Cloudflare R2
**Oluşturulma**: 2026-07-13
**Tamamlanan taramalar**: idor, missingauth, fileupload, pathtraversal, businesslogic, xss, ssrf, rce, hardcodedsecrets, sqli, xxe, graphql, ssti, jwt

> Not: Birden çok tarama aynı kök nedeni farklı açılardan raporladı. Bu rapor bu bulguları
> **tek bulguda** birleştirir ve en yüksek önem seviyesine göre sıralar. Her birleşik bulguda
> katkı sağlayan tarama(lar) "Kaynak tarama" alanında listelenir.

---

## Yönetici Özeti

| Önem | Adet |
|----------|-------|
| Kritik | 0 |
| Yüksek | 4 |
| Orta | 7 |
| Düşük | 11 |
| **Toplam doğrulanmış/olası bulgu** | **22** |

**Önem dağılımı yorumu:** Kritik (RCE/SSTI/webshell/auth-SQLi) sınıfı yok — mimari bu
sınıfları büyük ölçüde dışlıyor (Firestore, SQL yok; R2 nesne deposu kod çalıştırmaz;
JWT'yi Firebase SDK yönetir). Asıl risk **erişim kontrolü + bilgi ifşası** ekseninde
yoğunlaşıyor: kimliksiz PII sızıntısı ve çapraz-şube veri erişimi/silme.

**En acil 3 aksiyon:**
1. **`GET /api/upload/proxy/*`'i allow-list'e al + menü cache JSON'unu whitelist'le**
   (Bulgu #1). Bugün kimlik doğrulaması olmadan tüm şubelerin VKN/fatura/telefon PII'si
   dökülebiliyor — internete açık, doğrulanmış en yüksek gizlilik etkisi.
2. **`GET /api/branches`'e rol bazlı filtre ekle** (Bulgu #2, kardeş `konumlar` desenini
   kopyala). Her şube sahibi şu an tüm şubelerin PII'sini okuyor.
3. **R2 silme/yazma yollarını sertleştir** — `urlToKey`'i prefix-zorunlu yap, pozitif
   prefix allow-list'i tek yardımcıya çıkar (Bulgu #3 ve #8). `DELETE /api/upload/image`
   çapraz-şube menü/görsel silmesine izin veriyor.

**Çarpan not:** `backend/middleware/auth.js:26` fail-open varsayılan rolü (`role` claim'i
yoksa `sube_sahibi`) tek başına Orta bir bulgu (#7) ama #1 hariç tüm auth-gated bulguların
etkisini büyüten bir çarpan — claim'siz herhangi bir geçerli token'ı ayrıcalıklı şube
sahibine dönüştürüyor.

Doğrulanmış açık **bulunmayan** taramalar: rce, hardcodedsecrets, sqli, xxe, graphql,
ssti, jwt (detay için rapor sonundaki "Uygulanamaz Sınıflar" bölümü).
Elle inceleme gerektiren bulgu: 0.

---

## Bulgu İndeksi

| # | Başlık | Tür | Önem | Uç / Dosya |
|---|-------|------|----------|----------------|
| 1 | Kimliksiz R2 nesne proxy'si → çapraz-şube PII sızıntısı (menü cache tam doküman) | Missing Auth / IDOR / Path Traversal | Yüksek | `GET /api/upload/proxy/*` |
| 2 | `GET /api/branches` — her şube sahibi tüm şubelerin PII'sini okuyor | Missing Auth (fonksiyon-seviyesi) | Yüksek | `GET /api/branches` |
| 3 | Görsel/dosya silme — sahiplik yok, çapraz-şube keyfi R2 silme | IDOR / Path Traversal | Yüksek | `DELETE /api/upload/image` |
| 4 | Şube kendi bütçesini menü-dışı `secilen_bakiye` + doğrulamasız tutarla şişiriyor | Business Logic | Yüksek | `POST /api/reports/butce-gonder/:kampanyaId` |
| 5 | `butce-durum` — subeSlug null non-admin'de tüm şube bütçesi sızıyor | IDOR / Missing Auth | Orta | `GET /api/reports/butce-durum` |
| 6 | Google OAuth callback — auth/state yok (CSRF, hesap enjeksiyonu) | Missing Auth | Orta | `GET /api/reports/auth/google/callback` |
| 7 | `auth.js` fail-open varsayılan rol `sube_sahibi` | Missing Auth (tasarım) | Orta | `backend/middleware/auth.js:26` |
| 8 | `urlToKey` doğrulamasız + tutarsız silme guard'ları → keyfi R2 silme (admin-gated) | Path Traversal | Orta | academy/media silme uçları |
| 9 | Dekont yükleme — saldırgan-kontrollü `Content-Type` → admin'e stored XSS | File Upload / XSS | Orta | `POST /api/reports/butce-gonder/:kampanyaId` |
| 10 | `MAX_KAMPANYA` tavan yarışı (TOCTOU) → tavan aşımı + dekont kaybı | Business Logic | Orta | `POST /api/reports/butce-kampanya` |
| 11 | Academy: keyfi/var olmayan dersi "tamamlandı" işaretleyerek istatistik şişirme | Business Logic | Orta | `POST /api/academy/progress/:courseId/:lessonId` |
| 12 | Ürün görseli yükleme — `folder` prefix'i sanitize edilmiyor (key injection) | File Upload / Path Traversal | Düşük | `POST /api/upload/image` |
| 13 | Academy dosya yükleme — uzantı dosya adından, içerik doğrulanmıyor, MIME spoof | File Upload | Düşük | `POST /api/academy/upload/file` |
| 14 | PDF şablonu kaçışsız `sube.ad` → latent stored XSS (admin self) + kör SSRF | XSS / SSRF | Düşük | `backend/modules/reports/services/report-template.js:379` |
| 15 | Admin-tarafı tutar doğrulama boşlukları (override tip + `merkezDestegi`) | Business Logic | Düşük | `PUT .../overrides`, `POST .../onayla/:subeKod` |
| 16 | `devret`/tekrar-onay durum kapısı ve denetim izi yok | Business Logic | Düşük | `POST .../devret/:subeKod`, `.../onayla/:subeKod` |
| 17 | Bütçe yeniden gönderimi kaydı eziyor, denetim izi yok | Business Logic | Düşük | `POST .../butce-gonder/:kampanyaId` |
| 18 | Şube gönderimi ↔ admin toplu onayı arasında yarış (TOCTOU) | Business Logic | Düşük | `POST .../onayla` vs `.../butce-gonder` |
| 19 | Academy sınav gönderimi — görünürlük/yayın kapısı yok | Business Logic / Missing Auth | Düşük | `POST .../quiz/:courseId/:lessonId/submit` |
| 20 | `kdv_dahil_tutar` aralık/ilişki doğrulaması yok | Business Logic | Düşük | `POST .../butce-gonder/:kampanyaId` |
| 21 | Tarih alanları (`son_tarih` vb.) format doğrulaması yok | Business Logic | Düşük | kampanya oluşturma / gönderim |
| 22 | `passingScore: 0` yanlış yapılandırması herkesi geçiriyor | Business Logic | Düşük | `POST .../quiz/:courseId/:lessonId/submit` |

---

## Bulgular

### Yüksek

#### 1. Kimliksiz R2 nesne proxy'si → çapraz-şube PII sızıntısı — Missing Auth / IDOR / Path Traversal

- **Kaynak tarama**: `sast/missingauth-results.md`, `sast/idor-results.md`, `sast/pathtraversal-results.md` (Sink #1)
- **Sınıflandırma**: Doğrulandı (CONFIRMED)
- **Uç / Dosya**: `GET /api/upload/proxy/*` — **auth YOK** — `backend/routes/upload.js:42-87` (key `:45`, tek guard `:50-52`, sink `:62-65`); PII zinciri: `backend/modules/qr-menu/services/menu-cache.js:23,54,58`
- **Önem gerekçesi**: Kimlik doğrulaması olmadan, internete açık, çok-kiracılı PII toplu ifşası. Şube slug'ları public menüden öğrenilebildiği için gizlilik etkisi en yüksek; bu yüzden Yüksek. (Menü JSON içeriği zaten büyük ölçüde public olsa da asıl etki R2 cache JSON'unun **tam şube dokümanını** barındırması.)
- **Sorun**: R2 anahtarı doğrudan `req.params[0]`'dan ham alınır; tek koruma `key.startsWith('dekontlar/')` reddidir. Bu "tek-önek reddi" kalıbı etkisizdir — `dekontlar/` dışındaki HERHANGİ bir bucket nesnesi (menü JSON cache, gated akademi medyası, gelecekte eklenecek hassas prefix'ler) anahtarı bilen/tahmin eden herkese açıktır. Pozitif prefix allow-list yoktur.
- **PII sızıntı zinciri (onaylı)**: Menü cache servisi her şube için `menu/{subeSlug}.json` yazar ve içine `sube = { id, ...subeDoc.data() }` yani **tam şube dokümanını** koyar. Şube dokümanı hassas PII içerir: `vkn` (vergi kimlik no), `fatura_adresi`, `yetkili_adi`, `telefon`, `adres`, `sirket_tipi`. Public `/api/menu/:subeSlug` bu alanları whitelist ile gizler AMA R2'deki JSON tam dokümanı barındırır.
- **Etki**: Tüm şubelerin ticari/PII verisi anonim olarak dökülebilir. Ek yüzey (academy PDF/video, ürün görselleri) UUID adlı olduğundan enumerasyona kapalı ama key ele geçirilirse yine auth'suz servis edilir.
- **`dekontlar/` bypass değerlendirmesi**: `startsWith` decode edilmiş key üzerinde çalışır ve R2 anahtarları case-sensitive saklanır; `%64ekontlar`, `Dekontlar/`, baştaki `/` denemeleri ya decode sonrası yakalanır ya da saklı anahtarla eşleşmez → dekont sızıntısı YOK. Asıl açık dekont dışı tüm içeriğin auth'suz okunması.
- **Proof**:
  ```
  key = req.params[0]                       # upload.js:45 — ham, kullanıcı kontrollü
  if (key.startsWith('dekontlar/')) 403     # :50-52 — tek koruma (blacklist)
  GetObjectCommand({ Bucket, Key: key })    # :62-65 → stream res'e pipe :79
  # menu-cache.js:54 → sube = { id, ...subeDoc.data() }  (tam doküman, PII dahil)
  ```
- **Düzeltme**:
  (a) Menü cache JSON'una tam şube dokümanı yerine yalnızca public whitelist alanlarını yaz (public menü ile aynı projeksiyon).
  (b) Proxy'de blacklist yerine pozitif prefix allow-list:
  ```js
  const ALLOWED = ['urunler/', 'menu/', 'academy/public/'];
  if (!ALLOWED.some(p => key.startsWith(p)))
    return res.status(403).json({ error: 'Bu kaynağa erişim yetkiniz yok' });
  ```
  Şube-kapsamlı içerik (menü JSON PII barındırdığı sürece) için `verifyToken` + key'den türetilen şube ile `req.user.subeSlug`/admin karşılaştırması iste. `\0`, baştaki `/`, `..` içeren anahtarları reddet.
- **Dynamic Test**:
  ```bash
  curl -s "https://<HOST>/api/upload/proxy/menu/<HERHANGI_SUBE_SLUG>.json"   # token YOK
  # Açık varsa: 200 + tam şube dokümanı (vkn, fatura_adresi, yetkili_adi, telefon...)
  curl -i "https://<HOST>/api/upload/proxy/dekontlar/HERHANGI/x.pdf"          # 403 (tek koruma)
  ```

#### 2. `GET /api/branches` — her şube sahibi tüm şubelerin PII'sini okuyor — Missing Auth (fonksiyon-seviyesi)

- **Kaynak tarama**: `sast/missingauth-results.md`
- **Sınıflandırma**: Doğrulandı (CONFIRMED)
- **Uç / Dosya**: `GET /api/branches` — `backend/routes/branches.js:35-52` (özellikle 40-44)
- **Önem gerekçesi**: Düşük yetkili (yalnızca kendi şubesini görmesi gereken) `sube_sahibi` rolüne tüm şubelerin merkezi/hassas PII'si açılıyor → dikey yetki ihlali + toplu PII ifşası. Confidentiality etkisi yüksek.
- **Sorun**: Handler `subeler` koleksiyonunun tamamını okuyup her dokümanı `...d.data()` ile **hiçbir şube/rol filtresi olmadan** döndürüyor. `requirePermission('branches.view')` var ama izin `['admin','sube_sahibi']` olduğundan her şube sahibi geçer.
- **Etki**: Herhangi bir `sube_sahibi`, kendi token'ıyla tüm şubelerin `vkn`, `fatura_adresi`, `yetkili_adi`, `telefon`, `adres`, `sirket_tipi` verilerini okur.
- **Proof**:
  ```js
  const snap = await db.collection('subeler').get();
  ... return { id: d.id, slug: d.id, urunSayisi, ...d.data() }; // vkn, fatura_adresi, ...
  ```
  Karşılaştırma: kardeş `GET /api/branches/konumlar` (`branches.js:61-80`) doğru deseni gösteriyor — `role==='admin' → hepsi`, `sube_sahibi → subeSlug eşleşeni`, `diğer → []`.
- **Düzeltme**: `konumlar` ile aynı rol bazlı filtrelemeyi uygula; `sube_sahibi` için sonucu `d.id === req.user.subeSlug` ile kısıtla, admin'e tümünü ver.
- **Dynamic Test**:
  ```bash
  curl -s -H "Authorization: Bearer <SUBE_SAHIBI_TOKEN>" "https://<HOST>/api/branches"
  # Açık varsa: çağıranın şubesi dışındaki şubelerin PII'sini de içeren dizi.
  ```

#### 3. Görsel/dosya silme — sahiplik kontrolü yok, çapraz-şube keyfi R2 silme — IDOR / Path Traversal

- **Kaynak tarama**: `sast/idor-results.md`, `sast/pathtraversal-results.md` (Sink #4)
- **Sınıflandırma**: Doğrulandı (CONFIRMED)
- **Uç / Dosya**: `DELETE /api/upload/image` — `backend/routes/upload.js:158-175` (url `:163`, `urlToKey` `:166` → `backend/config/r2.js:51-54`, guard `:168`, sink `:171`)
- **Önem gerekçesi**: Çapraz-şube bütünlük/erişilebilirlik kaybı (kalıcı silme). `products.edit = ['admin','sube_sahibi']` olduğundan her şube sahibi tetikleyebilir; yatay ayrıcalık ihlali + yıkıcı etki → Yüksek.
- **Sorun**: `key = urlToKey(url)` saf string kırpmadır (sahiplik taşımaz). Tek kontrol `if (key.startsWith('dekontlar/')) 403`; ardından `deleteFile(key)`. `key` hiçbir yerde `req.user.subeSlug` ile ilişkilendirilmiyor. `dekontlar/` dışındaki her önek serbest: `menu/*.json`, başka şubelerin `urunler/*.webp` görselleri, `academy/*`.
- **Etki**: Şube A sahibi, şube B'nin canlı QR menüsünü (`menu/{subeSlug}.json`, tahmin edilebilir) veya bilinen bir ürün görselini R2'den siler → müşteri menüsü çöker, veri kaybı.
- **Proof**:
  ```
  req.body.url → urlToKey(url) [prefix yoksa değişmeden geçer] (:166)
  if (key.startsWith('dekontlar/')) 403  (:168, tek koruma)
  else deleteFile(key) → DeleteObjectCommand  (:171, r2.js:39-44)
  ```
- **Düzeltme**: (1) Blacklist yerine pozitif allow-list: key `urunler/` (veya çağıranın şube önekine ait yol) ile başlamıyorsa 403. (2) Silinen görselin çağıranın şubesine ait olduğunu Firestore ürün kaydından doğrula. (3) `urlToKey`'i prefix-zorunlu yap (bkz. Bulgu #8).
- **Dynamic Test**:
  ```bash
  curl -s -X DELETE "https://<HOST>/api/upload/image" \
    -H "Authorization: Bearer <SUBE_A_TOKEN>" -H "Content-Type: application/json" \
    -d '{"url":"<PUBLIC_URL>/menu/<SUBE_B_SLUG>.json"}'
  curl -s -o /dev/null -w "%{http_code}" "https://<HOST>/api/upload/proxy/menu/<SUBE_B_SLUG>.json"
  # Açık varsa: DELETE {"success":true} + takip GET 404 (şube B menüsü yok edildi).
  ```

#### 4. Şube kendi bütçesini menü-dışı `secilen_bakiye` + doğrulamasız tutarla şişiriyor — Business Logic

- **Kaynak tarama**: `sast/businesslogic-results.md` (Bulgu 1 + 2)
- **Sınıflandırma**: Doğrulandı (CONFIRMED)
- **Uç / Dosya**: `POST /api/reports/butce-gonder/:kampanyaId` — `backend/modules/reports/budget-routes.js:792-803` (gönderim), `:351-362` (toplu onay tüketimi), `:634-658` (aggregate), `backend/modules/reports/db.js:146-162,219-225`
- **Önem gerekçesi**: `budget.submit` yetkili şube sahibi, finansal raporlamanın bütünlüğünü kendi kontrolündeki uydurma değerle bozabiliyor; denormalize `donem_ozetleri` merkezî bütçe kararlarının dayanağı → integrity etkisi Yüksek.
- **Sorun (iki kök birleşik)**:
  1. **Whitelist yok**: Gönderim handler'ı yalnızca değerin varlığını (`:794`) ve sayı olduğunu (`isNaN`, `:801`) kontrol eder. `kampanya.bakiye_secenekleri` hiç okunmaz — üyelik kontrolü yoktur. Seçilen değer aynen saklanır; toplu onayda `planlanan_butce`'ye yazılır.
  2. **İşaret/aralık yok**: `req.body` multipart olduğu için değerler string; `!"-100"`→false, `!"0"`→false, `isNaN(Number("-100"))`→false — negatif, sıfır ve dev değerler geçer. `butce-durum`'da `if (toplamButce > 0)` (`:644`) negatif toplamı sessizce aşım sayımından düşürür → gerçek aşımı gizler.
- **Etki**: Şube `secilen_bakiye=999999999` ya da negatif gönderir; admin "tümünü onayla" derse şube planlanan bütçesi keyfi değere set olur, aşım/uyarı panosu çarpıtılır ya da şube panodan görünmez olur.
- **Proof**: `:792-803` içinde `bakiye_secenekleri` referansı yok; `:351-362` onayda yeniden doğrulama yok; `db.js:151` `planlanan_butce: merged.planlanan_butce || 0` yalnızca falsy koruması.
- **Düzeltme**: Gönderimde `Number(secilen_bakiye)`'nin `kampanya.bakiye_secenekleri` içinde olduğunu doğrula (kayan nokta için tolerans); ayrıca `Number.isFinite(x) && x > 0 && x <= TAVAN` kontrolünü hem gönderim hem onay hem override yolunda uygula; aksi halde 400.
- **Dynamic Test**:
  ```bash
  curl -X POST https://<host>/api/reports/butce-gonder/<kampanyaId> \
    -H "Authorization: Bearer <SUBE_TOKEN>" \
    -F "secilen_bakiye=999999999" -F "kdv_dahil_tutar=100" -F "dekont=@x.png"
  # Açık: 200 success (menüde olmayan tutar kabul). Onay sonrası butce-durum → toplamButce=999999999
  # Negatif varyant: -F "secilen_bakiye=-50000" → onay sonrası şube aşım listesinden düşer.
  ```

---

### Orta

#### 5. `butce-durum` — subeSlug null non-admin'de tüm şube bütçesi sızıyor — IDOR / Missing Auth

- **Kaynak tarama**: `sast/idor-results.md`, `sast/missingauth-results.md`
- **Sınıflandırma**: ⚠ Olası (PLAUSIBLE)
- **Uç / Dosya**: `GET /api/reports/butce-durum?since&until&subeKod` — `backend/modules/reports/budget-routes.js:584-699` (kritik `:597-620`)
- **Önem gerekçesi**: Tüm şubelerin finansal/bütçe verisinin çapraz-tenant salt-okunması; ama sömürü **null/eksik-subeSlug** bir non-admin principal'ın varlığına bağlı → Orta. `auth.js:26` fail-open varsayılanı (Bulgu #7) bunu teorik değil makul kılar.
- **Sorun**: Guard yalnızca non-admin'in **başka bir şubeyi açıkça adlandırdığı** durumu engeller (`:598`). `subeKod` hiç gönderilmezse `hedefKod = req.user.subeSlug`; bu claim null/boş ise `hedefKod` null olur, `else` dalı `getAllSubeler()` çağırıp **her şubenin** bütçe özetini + global özeti döner.
- **Proof**:
  ```js
  if (subeKod && !isAdmin && subeKod !== req.user.subeSlug) return 403;   // subeKod falsy ise atlanır
  const hedefKod = subeKod || (!isAdmin ? req.user.subeSlug : null);
  if (hedefKod) subeler = [await getSubeByKod(hedefKod)];
  else subeler = await getAllSubeler();   // <-- TÜM şubeler
  ```
  Kardeş `butce-gonder`/`butce-bekleyen` (`:713-716`, `:787-790`) bu durumu subeSlug eksikse reddederek kapatıyor; `butce-durum` kapatmıyor.
- **Düzeltme**: `hedefKod` hesaplandıktan sonra `if (!isAdmin && !hedefKod) return res.status(403)...`. Yalnız admin `getAllSubeler()` dalına ulaşabilmeli. Ayrıca `auth.js`'te role varsayılanını `sube_sahibi` yapmaktan kaçın (kök neden).
- **Dynamic Test**:
  ```bash
  curl -H "Authorization: Bearer <SUBESLUG_BOS_TOKEN>" \
    "https://<HOST>/api/reports/butce-durum?since=2025-01-01&until=2025-01-31"
  # Açık varsa: yanıtta çok sayıda şube + kapsamsız ozet.
  ```

#### 6. Google OAuth callback — auth/state yok (CSRF, hesap enjeksiyonu) — Missing Auth

- **Kaynak tarama**: `sast/missingauth-results.md`
- **Sınıflandırma**: Doğrulandı (missing-auth CONFIRMED; sömürü PLAUSIBLE)
- **Uç / Dosya**: `GET /api/reports/auth/google/callback` — **auth YOK** — `backend/modules/reports/routes.js:97-105`; token yazımı `backend/modules/reports/services/google-business.js:64-70`
- **Önem gerekçesi**: Sabit `redirect_uri` + `client_secret` gerekliliği exploiti zorlaştırır (bu yüzden Orta), ancak auth+state eksikliği tasarımsal olarak doğrulanmıştır ve merkezî entegrasyonun ele geçirilmesi/DoS'una yol açabilir.
- **Sorun**: Callback `req.query.code`'u `oauth2Client.getToken(code)` ile takas edip sonucu **merkezî/tekil** `reports/google_token` dokümanına yazar. Ne kimlik doğrulama ne `state` (CSRF nonce) kontrolü var.
- **Etki**: (1) Saldırgan kendi Google Business hesabı üzerinden `code` elde edip callback'i tetikler → uygulamanın entegrasyonu saldırgan hesabına bağlanır ya da meşru token ezilerek entegrasyon bozulur (DoS).
- **Düzeltme**: OAuth başlatırken (`getGoogleAuthUrl`) rastgele `state` üret, kısa ömürlü sakla; callback'te birebir doğrula, eşleşmezse reddet. Mümkünse callback'i yalnızca admin oturumu bağlamında kabul et.
- **Dynamic Test**: `.../auth/google/callback?code=<saldırgan_code>&state=<yok/yanlış>` tetikle; token dokümanının ezildiğini / saldırgan hesabına bağlandığını gözlemle.

#### 7. `auth.js` fail-open varsayılan rol `sube_sahibi` — Missing Auth (tasarım)

- **Kaynak tarama**: `sast/missingauth-results.md`, `sast/idor-results.md`, `sast/jwt-results.md` (not)
- **Sınıflandırma**: ⚠ Olası (PLAUSIBLE)
- **Uç / Dosya**: `backend/middleware/auth.js:26` — `role: decodedToken.role || 'sube_sahibi'` (ayrıca `routes/users.js:155` claim yazımında aynı varsayılan)
- **Önem gerekçesi**: Tek başına fail-open bir tasarım kusuru (Orta), ama **#1 hariç tüm auth-gated bulguların etkisini büyüten çarpan** — özellikle #2 (branches) ve #5 (butce-durum) ile birleşince claim'siz bir token'ı tüm şube PII/bütçesine erişebilen principal'a dönüştürür.
- **Sorun**: Bu Firebase projesine ait geçerli ama `role` custom claim'i olmayan herhangi bir kullanıcı sessizce `sube_sahibi` muamelesi görür (en düşük `calisan`'a değil, ayrıcalıklı role düşer).
- **Etki**: Aynı Firebase projesinde self-signup / claim'siz hesap oluşturulabiliyorsa, saldırgan `sube_sahibi` olup Bulgu #2 ile tüm şube PII'sini okur. Exploit edilebilirlik token edinme yoluna bağlı → PLAUSIBLE.
- **Düzeltme**: Varsayılanı en düşük yetkiye çek (`|| 'calisan'`) veya claim yoksa `kullanici_sube` dokümanından rolü doğrula / erişimi reddet. `users.js:155` fallback'ini de `|| 'calisan'` yap.

#### 8. `urlToKey` doğrulamasız + tutarsız silme guard'ları → keyfi R2 silme (admin-gated) — Path Traversal

- **Kaynak tarama**: `sast/pathtraversal-results.md` (Sink #6, #7, #8, #13, #14)
- **Sınıflandırma**: ⚠ Olası (LIKELY VULNERABLE)
- **Ortak kök neden**: `backend/config/r2.js:51-54` `urlToKey(url) = url.replace(`${PUBLIC_URL}/`, '')` — saf string strip. Girdi `PUBLIC_URL` öneki içermiyorsa **değişmeden anahtar olarak döner** (doğrulama/allowlist yok). Silme uçlarında ya tek-prefix blacklist ya da hiçbir guard yok — `upload.js:168`'deki `dekontlar/` reddi diğer yollara taşınmamış (tutarsızlık).
- **Önem gerekçesi**: Etkilenen silme uçlarının hepsi **admin-only** izinlerle korunuyor (`academy.manage`, `categories.delete` = yalnızca admin); mevcut sürümde güven sınırı aşan yükseltme değil, **savunma-derinliği / insider / CSRF / stored-value** senaryosu → Orta. Ancak keyfi-anahtar silme yeteneği gerçektir ve ilgili create izni gevşetilirse tam sömürülebilir olur.
- **Alt-maddeler (aynı kök, ayrı uçlar)**:
  - **Sink #6 — `DELETE /api/academy/upload/file`** (`academy/routes/upload.js:64-77`): `dekontlar/` guard'ı bile YOK; `if (key) deleteFile(key)`. `academy.manage` bir kullanıcı bucket'taki HERHANGİ bir nesneyi (dekontlar dahil) silebilir.
  - **Sink #7 — `DELETE /api/academy/courses/:id`** (`courses.js:167-182`): Kurs silinirken her dersin `videoUrl||pdfUrl`'ünden `urlToKey` ile key türetip siler. Bu alanlar ders create/update gövdesinden (`lessons.js:102-103,172`) ham/prefix-doğrulamasız yazılır → second-order keyfi silme.
  - **Sink #8 — `DELETE /api/academy/lessons/:courseId/:lessonId`** (`lessons.js:40-50,205`): #7 ile aynı kök; `deleteLessonFile(data)` tekil nesne siler.
  - **Sink #13 — `POST /api/media/bulk-delete`** (`media.js:220-248`): `medya/{id}.url` → `urlToKey` → `deleteFile`, prefix guard yok. `url` create'te (`POST /api/media`, `:281-299`) doğrulanmadan saklanır → keyfi `url`'li doküman oluşturup toplu silerek `dekontlar/*` banka makbuzları ve `menu/*.json` yayın menüleri kalıcı silinebilir.
  - **Sink #14 — `DELETE /api/media/:id`** (`media.js:341-366`): #13 ile aynı; ek olarak `:id`'de ownership/şube kontrolü yok.
- **Etki**: Bucket genelinde yıkıcı silme — mali dekontlar, tüm QR menüleri, ürün görselleri geri dönüşsüz silinebilir; menü servisi bozulur, dekont kanıtları yok edilir.
- **Düzeltme**:
  1. `urlToKey`'i prefix-zorunlu yap (`PUBLIC_URL` ile başlamayan URL'de `null` dön).
  2. `dekontlar/`+`menu/` reddi ve pozitif prefix allow-list'i **tek ortak yardımcıya** çıkar; `upload.js` (#4), `academy/routes/upload.js` (#6), `media.js` (#13/#14) ve akademi cascade (#7/#8) silme yollarında uygula.
  3. Yazma-anı doğrulama: ders `videoUrl`/`pdfUrl` (#7/#8) ve medya `url` (#13/#14) alanlarını `${PUBLIC_URL}/<beklenen-prefix>` kalıbına karşı doğrula; tercihen silinecek dosyayı Firestore kaydından çöz, `req.body.url`'e güvenme.
- **Dynamic Test**:
  ```bash
  curl -X DELETE https://<host>/api/academy/upload/file \
    -H "Authorization: Bearer <ACADEMY_MANAGE_TOKEN>" -H "Content-Type: application/json" \
    -d '{"url":"dekontlar/2026-01/kurban-sube-dekont.pdf"}'   # savunmasız: {"success":true}
  # Media yolu:
  DOC=$(curl -s -X POST https://<host>/api/media -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" -d '{"ad":"x","url":"menu/sube-01.json"}' | jq -r '.id')
  curl -s -X DELETE "https://<host>/api/media/$DOC" -H "Authorization: Bearer $ADMIN_TOKEN"
  curl -s -o /dev/null -w "%{http_code}" "https://<host>/api/upload/proxy/menu/sube-01.json"  # 404 = silinmiş
  ```

#### 9. Dekont yükleme — saldırgan-kontrollü `Content-Type` → dekontu inceleyen admin'e stored XSS — File Upload / XSS

- **Kaynak tarama**: `sast/fileupload-results.md`
- **Sınıflandırma**: ⚠ Olası (PLAUSIBLE)
- **Uç / Dosya**: `POST /api/reports/butce-gonder/:kampanyaId` — `backend/modules/reports/budget-routes.js:19-29` (filter), `:828-838` (yazma); sunum `backend/routes/upload.js:96-124` (`res.set('Content-Type', result.ContentType)` `:114`)
- **Önem gerekçesi**: Dekontu görüntüleyen admin/şube kullanıcısına karşı stored XSS vektörü; `helmet` `nosniff` aktif olduğundan tarayıcı depolanan `Content-Type`'a uyar. Şube sahibi → admin çapraz-kullanıcı etkisi → Orta.
- **Sorun**: Multer filter yalnızca uzantıyı doğrular (`.pdf/.jpg/.jpeg/.png`). Ancak `req.file.mimetype` hiç doğrulanmaz ve depolanan `ContentType` olarak aynen kullanılır (`uploadFile(req.file.buffer, key, req.file.mimetype)`, `:833`); içerik yeniden kodlanmaz / magic-byte doğrulaması yok. Saldırgan `Content-Type: text/html` + `<script>` içerikli dosyayı `dekont.pdf` adıyla (uzantı filtresini geçer) yükler.
- **Etki**: R2'de `ContentType: text/html` saklanır; dekont `/api/upload/dekont/*` (auth + şube) üzerinden sunulunca proxy `text/html` döner ve `nosniff` nedeniyle tarayıcı HTML/JS'i render eder → dekontu açan admin bağlamında script çalışır. (Public `/proxy/*` `dekontlar/` reddettiği için yol yalnızca authed `/dekont/*`.)
- **Düzeltme**: (a) `mimetype`'ı uzantıyla tutarlı allow-list'e göre doğrula veya depolanan `ContentType`'ı uzantıdan **sunucu tarafında türet** (`.pdf`→`application/pdf`). (b) Görselleri `sharp` ile yeniden kodla / PDF magic-byte doğrula. (c) `/dekont/*` sunumunda `Content-Disposition: attachment` ve sabit güvenli `Content-Type` düşün.
- **Dynamic Test**:
  ```bash
  curl -X POST https://<host>/api/reports/butce-gonder/<kampanyaId> \
    -H "Authorization: Bearer <budget.submit token>" \
    -F "secilen_bakiye=1000" -F "kdv_dahil_tutar=1180" \
    -F "dekont=@xss.html;type=text/html;filename=dekont.pdf"
  # R2'de ContentType: text/html; admin /api/upload/dekont/... açtığında HTML/JS çalışır.
  ```

#### 10. `MAX_KAMPANYA` tavan yarışı (TOCTOU) → tavan aşımı + dekont kaybı — Business Logic

- **Kaynak tarama**: `sast/businesslogic-results.md` (Bulgu 9)
- **Sınıflandırma**: Doğrulandı (CONFIRMED)
- **Uç / Dosya**: `POST /api/reports/butce-kampanya` — `backend/modules/reports/budget-routes.js:94-140`
- **Önem gerekçesi**: Veri kaybı (başka kampanyanın dekontları geri dönüşsüz) + invaryant ihlali; kötü niyet gerektirmez (çift tık/paralel istek yeterli). Admin yolu olduğu için Orta.
- **Sorun**: Tavan, `kampanyalar` bir kez okunup (`:95`), yeni kampanya yazılıp (`:128`), ardından yalnızca ön-okuma sayısı `>= MAX_KAMPANYA` ise en eski silinerek (`:132-140`) uygulanır — hiçbiri tek transaction'da değil. İki eşzamanlı oluşturma aynı sayıyı okur, ikisi de yazar, doküman tavanı aşabilir veya yanlış "en eski" silinebilir. Silme `deleteDekontlar` ile R2 dekont dosyalarını da temizler → başka kampanyanın makbupları kaybolabilir.
- **Düzeltme**: Okuma + yazma + en-eskiyi-silmeyi tek `runTransaction` içinde `butce` dokümanı üzerinde yap.
- **Dynamic Test**:
  ```bash
  # 5 kampanya varken iki isteği eşzamanlı gönder:
  for i in 1 2; do curl -X POST .../butce-kampanya -H "Authorization: Bearer <ADMIN>" \
    -H "Content-Type: application/json" \
    -d '{"baslik":"c'$i'","donem_baslangic":"2026-0'$i'-01","donem_bitis":"2026-0'$i'-28","son_tarih":"2026-0'$i'-20","bakiye_secenekleri":[1000]}' & done; wait
  # Açık: kampanya sayısı 6'yı geçer veya yanlış kampanya + dekontları silinir.
  ```

#### 11. Academy: keyfi/var olmayan dersi "tamamlandı" işaretleyerek istatistik şişirme — Business Logic

- **Kaynak tarama**: `sast/businesslogic-results.md` (Bulgu 11)
- **Sınıflandırma**: Doğrulandı (CONFIRMED)
- **Uç / Dosya**: `POST /api/academy/progress/:courseId/:lessonId` — `backend/modules/academy/routes/progress.js:311-335` (yazan), `:80-165` (`/admin/stats` tüketici)
- **Önem gerekçesi**: Herhangi bir kimliği doğrulanmış kullanıcı (`calisan`/`sube_sahibi`) eğitim-tamamlama metriklerini sahte tamamlamayla kirletebilir; yazma self-scoped (yatay/dikey yükseltme yok, cevaplar sızmaz) → Orta.
- **Sorun**: Handler `courseId`/`lessonId`'yi doğrudan URL'den alır; dersi yalnızca quiz tipini engellemek için okur (`:317-321`). Ders **yoksa** (`lessonSnap.exists` false) bu kapı atlanır ve keyfi string'ler için `completedLessons/{lessonId} = { courseId, completedAt }` yazılır (`:330`). Dersin kursa ait olduğu, yayınlandığı, `courseVisibleToUser` döndüğü hiç doğrulanmaz.
- **Etki**: Kullanıcı uydurma `courseId`/`lessonId` ile `totalCompleted`/`byCourse` sayaçlarını şişirir; adminler bunu `GET /admin/stats`'ta tamamlama kanıtı olarak okur.
- **Düzeltme**: Yazmadan önce dersin var olduğunu, `courseId`'ye ait olduğunu, kursun yayınlandığını ve `courseVisibleToUser(course, req.user)` döndüğünü doğrula.
- **Dynamic Test**:
  ```bash
  curl -X POST .../academy/progress/UYDURMA_KURS/UYDURMA_DERS -H "Authorization: Bearer <CALISAN_TOKEN>"
  # Açık: 200 success; GET /admin/stats totalCompleted artar.
  ```

---

### Düşük

#### 12. Ürün görseli yükleme — `folder` prefix'i sanitize edilmiyor (key injection) — File Upload / Path Traversal

- **Kaynak tarama**: `sast/fileupload-results.md`, `sast/pathtraversal-results.md` (Sink #3)
- **Sınıflandırma**: ⚠ Olası (LIKELY VULNERABLE)
- **Uç / Dosya**: `POST /api/upload/image` — `backend/routes/upload.js:130-151` (`:142-143`, sink `:145`)
- **Önem gerekçesi**: Basename daima sunucu-üretimi `${uuid}.webp` ve içerik `sharp` ile `image/webp`'e zorlanır → mevcut nesnenin üzerine yazma yok; etki "keyfi prefix'e yazma + rastgele basename" (depolama kirliliği / korumalı isim uzayına yazım) ile sınırlı → Düşük.
- **Sorun**: `const folder = req.body.folder || 'urunler';` ardından `fileName = `${folder}/${crypto.randomUUID()}.webp``. `folder` kullanıcı girdisi ve hiç sanitize edilmiyor — `dekontlar/xyz`, `menu`, `../../herhangi` gibi değerler R2 key prefix'ine girer.
- **Düzeltme**:
  ```js
  const ALLOWED_FOLDERS = new Set(['urunler', 'kategoriler', 'sube']);
  const folder = ALLOWED_FOLDERS.has(req.body.folder) ? req.body.folder : 'urunler';
  ```
  Alternatif: slug regex (`/^[a-z0-9_-]+$/`), `/`, `.`, `..` içerenleri reddet.
- **Dynamic Test**:
  ```bash
  curl -i -H "Authorization: Bearer <SUBE_TOKEN>" \
    -F "folder=dekontlar/INJECT" -F "image=@test.png;type=image/png" "https://<HOST>/api/upload/image"
  # Yanıttaki key = dekontlar/INJECT/<uuid>.webp ise write-side traversal doğrulanır.
  ```

#### 13. Academy dosya yükleme — uzantı dosya adından, içerik doğrulanmıyor, MIME spoof — File Upload

- **Kaynak tarama**: `sast/fileupload-results.md`
- **Sınıflandırma**: ⚠ Olası (PLAUSIBLE)
- **Uç / Dosya**: `POST /api/academy/upload/file` — `backend/modules/academy/routes/upload.js:31-58` (filter `:11-25`, uzantı `:41`, yazma `:46`)
- **Önem gerekçesi**: `academy.manage` = yalnızca admin; RCE yok (R2 execute etmez) ve depolanan `ContentType` mimetype allow-list'iyle `application/pdf`/`video/*`'e sınırlı olduğundan `text/html` render'ı engellenir → Düşük. Kalan risk uzantı/içerik/tip uyuşmazlığı ve içerik doğrulamasının hiç yapılmaması (bozuk/polyglot dosyalar).
- **Sorun**: (1) Uzantı doğrudan `req.file.originalname.split('.').pop()` ile türetilir, allow-list'e karşı doğrulanmaz — `shell.html`, `x.svg` geçer. (2) Tek doğrulama `file.mimetype` allow-list'i, ama bu multipart başlığından gelir ve tamamen saldırgan kontrolündedir. (3) İçerik hiç yeniden kodlanmaz / magic-byte yok — ham buffer R2'ye yazılır.
- **Düzeltme**: (a) Uzantıyı sunucu tarafında sabit allow-list'e göre ata (video→`.mp4`, pdf→`.pdf`); `originalname` uzantısını key'e koyma. (b) İçeriği magic-byte ile doğrula (PDF `%PDF`, mp4 `ftyp`). (c) `mimetype`'ı güvenlik kontrolü olarak kullanma.
- **Dynamic Test**:
  ```bash
  curl -X POST https://<host>/api/academy/upload/file -H "Authorization: Bearer <academy.manage token>" \
    -F "file=@payload.html;type=application/pdf;filename=evil.html"
  # → R2 key: academy/pdfs/<uuid>.html, depolanan ContentType: application/pdf
  ```

#### 14. PDF şablonu kaçışsız `sube.ad` → latent stored XSS (admin self) + kör SSRF — XSS / SSRF

- **Kaynak tarama**: `sast/xss-results.md`, `sast/ssrf-results.md`
- **Sınıflandırma**: ⚠ Olası (latent; bugün admin→admin, exploit edilebilir ayrıcalık sınırı yok)
- **Uç / Dosya**: `backend/modules/reports/services/report-template.js:379` → `generateReportHtml` → `POST /api/reports/preview` (`res.type('html').send`) ve `generate-pdf` (Puppeteer `page.setContent`, `generate-pdf.js:31`, `networkidle0`)
- **Önem gerekçesi**: `sube.ad`'yi yazan tüm yollar admin-only (`branches.create/edit`, `reports.manage`); onboarding `ad`'yi yazamıyor. Yazan da okuyan da admin → gerçek anlamda self-XSS, ayrıcalık sınırı geçilmiyor → Düşük. Ancak escape'in tümüyle yokluğu latent bir risk: şube adını `sube_sahibi` düzenlemesine açan gelecekteki bir değişiklik bunu doğrudan stored XSS'e çevirir.
- **Sorun**: `<span class="branch">${sube.ad.replace(/Sütlüce Kadayıf\s*/i,'') || sube.kod}</span>` — `sube.ad` HTML escape edilmeden basılır; dosyada hiçbir escape helper yok. Puppeteer `networkidle0` ile render ederken, bir alana `<img src="http://169.254.169.254/...">` gibi HTML enjekte edilebilseydi Chromium bu iç adrese istek atardı → kör SSRF / cloud metadata denemesi (Firebase Functions ortamında metadata erişilebilir olabilir).
- **Taint izi**: `subeler/{kod}.ad` (Firestore) → `getSubeByKod` → `buildReportData` → `result.sube.ad` (report-data.js:122) → satır 379 ham interpolasyon → `res.send` / `setContent`.
- **Düzeltme**: Şablonun başına `escapeHtml(s)` helper ekleyip (`& < > " '` → HTML entity) `sube.ad`'yi ve ileride kullanıcı-kaynaklı olabilecek her serbest-metin alanını sarmala (bu ayrıca kör SSRF'i de kapatır). Ek olarak branch write handler'larında `ad` için `<>` reddeden basit doğrulama; Puppeteer'ı `setRequestInterception` ile yalnız `data:`/allowlist host'lara izin verecek şekilde çalıştır, fontu data-URI ile göm.
- **Dynamic Test**: Admin olarak `PUT /api/reports/sube/istanbul {"ad":"Sütlüce Kadayıf <img src=x onerror=alert(1)>"}` → `POST /api/reports/preview {"subeKod":"istanbul",...}` yanıtındaki HTML'de payload ham çıkar. SSRF için `sube.ad`'ye `<img src="http://<dinleyici>/pdf-ssrf">` yazıp PDF üret, dinleyicide isteği gözlemle.

#### 15. Admin-tarafı tutar doğrulama boşlukları (override tip + `merkezDestegi`) — Business Logic

- **Kaynak tarama**: `sast/businesslogic-results.md` (Bulgu 4 + 14)
- **Sınıflandırma**: Doğrulandı (CONFIRMED)
- **Uç / Dosya**: `PUT /api/reports/sube/:kod/donem/overrides` (`routes.js:702-716`), `POST .../onayla/:subeKod` (`budget-routes.js:440-464`); aggregate `budget-routes.js:636-637`, `db.js:151-153`
- **Önem gerekçesi**: Yalnızca admin (`reports.manage`/`budget.manage`) tetikler → düşük öncelik; ancak finansal aggregate'e giren doğrulanmamış tutar gerçek bir bütünlük boşluğu.
- **Sorun**: (1) Override handler `overrides.planlananButce/.devredilenMiktar/.merkezDestegi`'yi hiçbir `Number()` dönüşümü/tip kontrolü olmadan kopyalar (`:704`); JSON string (`"1e9"`), boolean/object ham saklanır, downstream `toplamButce = planlanan + devredilen + merkez` string-concat/`NaN` üretir. (2) `merkez` tekil onayda çıplak `Number(merkez)` (`:442`), aralık/işaret doğrulaması yok; negatif değer aşım/uyarı hesabını çarpıtır.
- **Düzeltme**: Her override/onay tutar alanını `Number.isFinite(x) && x >= 0` ile doğrula, aksi halde 400.
- **Dynamic Test**:
  ```bash
  curl -X PUT .../sube/<kod>/donem/overrides -H "Authorization: Bearer <ADMIN>" \
    -H "Content-Type: application/json" \
    -d '{"baslangic":"2026-07-01","bitis":"2026-07-31","overrides":{"planlananButce":"1e9"}}'
  # butce-durum'da toplamButce string-concat/NaN olur.
  ```

#### 16. `devret`/tekrar-onay durum kapısı ve denetim izi yok — Business Logic

- **Kaynak tarama**: `sast/businesslogic-results.md` (Bulgu 8)
- **Sınıflandırma**: Doğrulandı (CONFIRMED)
- **Uç / Dosya**: `POST .../onayla/:subeKod` (`:446-464`), `POST .../devret/:subeKod` (`:503-539`)
- **Önem gerekçesi**: Admin yolu; iş akışı bütünlüğü/denetlenebilirlik açığı → Düşük.
- **Sorun**: `onayla/:subeKod` zaten `onaylandi` bir şubede tekrar çağrılabilir (`:447`) ve `upsertButce`'yi yeniden çalıştırır. `devret`'in hiçbir durum kapısı yok — onaydan önce/sonra/yerine çağrılabilir; `devredilen_miktar`'ı yeniden yazar (`:526-533`). Onaydan sonra `devret`, şubenin toplam bütçesini ve `kalan`'ı yeniden onay/bildirim olmadan sessizce değiştirir; kim/ne zaman yaptığı kaydedilmez.
- **Düzeltme**: `devret`'i yalnızca ilgili durum(lar)da kabul et; onaylı bütçeyi değiştiren her işlem için aktör/zaman logla ve yeniden-onay şartı koy.

#### 17. Bütçe yeniden gönderimi kaydı eziyor, denetim izi yok — Business Logic

- **Kaynak tarama**: `sast/businesslogic-results.md` (Bulgu 6)
- **Sınıflandırma**: ⚠ Olası (PLAUSIBLE)
- **Uç / Dosya**: `POST /api/reports/butce-gonder/:kampanyaId` — `budget-routes.js:820-854`
- **Önem gerekçesi**: Onay öncesi düzenlemeye izin kısmen kasıtlı olabilir; denetim izi yokluğu Bulgu #4 ile birleşince "admin'e makul değer gösterip sonra değiştirme" riskini artırır → Düşük.
- **Sorun**: Şube, onaya kadar sınırsız yeniden gönderebilir (yalnızca `mevcutYanit?.durum === 'onaylandi'` engeller, `:822`). Her gönderim `secilen_bakiye`/`kdv_dahil_tutar`/`notlar`/`gonderim_tarihi`'ni tamamen yeniden yazar; önceki gönderimlerin değişmez kaydı yok.
- **Düzeltme**: Gönderimi ilk gönderimden sonra dondur ya da append-only geçmiş tut.

#### 18. Şube gönderimi ↔ admin toplu onayı arasında yarış (TOCTOU) — Business Logic

- **Kaynak tarama**: `sast/businesslogic-results.md` (Bulgu 7)
- **Sınıflandırma**: ⚠ Olası (PLAUSIBLE)
- **Uç / Dosya**: `POST .../onayla` (`:326-392` toplu, `:426-495` tekil) vs `POST .../butce-gonder/:kampanyaId`
- **Önem gerekçesi**: Pencere dar, onay admin tetiklemesi; ancak eşzamanlı gönderim şube kontrolünde olduğundan otomatik araçla kışkırtılabilir → Düşük.
- **Sorun**: Toplu onay `butce` dokümanını okur (`:328`), `gonderildi` yanıtları filtreler (`:340`), ayrı `Promise.allSettled` içinde `secilen_bakiye`'yi dönem dokümanına yazar (`:351-362`) ve ancak sonra yanıt durumlarını günceller (`:384`). Okuma→onay→durum'u kapsayan transaction yok; eşzamanlı gönderen bir şubenin yeni değeri dokümanda kalırken onay eski değeri yazabilir (veya tersi).
- **Düzeltme**: Onayı `runTransaction` içinde yanıt okuma + bütçe yazma + durum güncellemeyi atomik yaparak uygula (veya iyimser sürüm kontrolü).

#### 19. Academy sınav gönderimi — görünürlük/yayın kapısı yok — Business Logic / Missing Auth

- **Kaynak tarama**: `sast/businesslogic-results.md` (Bulgu 12), `sast/missingauth-results.md`
- **Sınıflandırma**: ⚠ Olası (PLAUSIBLE)
- **Uç / Dosya**: `POST /api/academy/progress/quiz/:courseId/:lessonId/submit` — `progress.js:218-281`; karşılaştırma `courses.js:64-85`, `utils.js:21-27`
- **Önem gerekçesi**: Bulgu #11'den dar — geçerli id'ler + doğru cevaplarla geçer not gerekir (cevaplar `stripQuizAnswers` ile gizli, normal sınavı zorla geçmek mümkün değil); self-scoped, gizlilik etkisi minimal → Düşük.
- **Sorun**: Sınav notlandırması dersi yükleyip sunucu tarafında puanlar (cevap sızmaz) ama `course.isPublished` ya da `courseVisibleToUser`'ı hiç kontrol etmez — kardeş okuma uçlarındaki 404 kapısı (`courses.js:72`, `lessons.js:65`) burada yok. Kullanıcı rolüne/şubesine atanmamış bir kursta geçer not kaydedebilir. Aynı boşluk `POST /:courseId/:lessonId` (`:311`) ve `GET /:courseId` (`:289`) tamamlama uçlarında da var.
- **Düzeltme**: Ders okumadan önce (admin değilse) `courseVisibleToUser` + `isPublished` kapısını ekle; üç uçta tutarlı uygula.

#### 20. `kdv_dahil_tutar` aralık/ilişki doğrulaması yok — Business Logic

- **Kaynak tarama**: `sast/businesslogic-results.md` (Bulgu 3)
- **Sınıflandırma**: ⚠ Olası (PLAUSIBLE)
- **Uç / Dosya**: `POST /api/reports/butce-gonder/:kampanyaId` (`:792-799, 841-850`), `POST .../onayla/:subeKod` (`:440-472`)
- **Önem gerekçesi**: `kdv_dahil_tutar` bütçe aggregate'lerine beslenmiyor (yalnız gösterim/mutabakat) → sistemik etki Bulgu #4'ten düşük → Düşük.
- **Sorun**: İlişki ve aralık kontrolü olmadan olduğu gibi saklanır; şube küçük `kdv_dahil_tutar` beyan edip büyük `secilen_bakiye` seçebilir, makbuz toplamı ile onaylanan bütçe ayrışır.
- **Düzeltme**: `kdv_dahil_tutar` için pozitif sayı kontrolü; iş kuralı gereğiyse `secilen_bakiye`/dekont ile mutabakat.

#### 21. Tarih alanları (`son_tarih` vb.) format doğrulaması yok — Business Logic

- **Kaynak tarama**: `sast/businesslogic-results.md` (Bulgu 5, ayrıca 10 hardening)
- **Sınıflandırma**: ⚠ Olası (PLAUSIBLE)
- **Uç / Dosya**: `POST /api/reports/butce-kampanya` (`:88-92`), gönderim kapısı `:815-818`, listeler `:724-753`
- **Önem gerekçesi**: Kampanyaları yalnızca admin oluşturur, UI iyi biçimli ISO gönderirse karşılaştırma doğru çalışır; sömürü bozuk formatta veri saklanmasına bağlı → Düşük.
- **Sorun**: Gönderim kapısı `kampanya.son_tarih < bugun` **sözlüksel string karşılaştırması**; oluşturma `son_tarih`/`donem_baslangic`/`donem_bitis`'in iyi biçimli `YYYY-MM-DD` olduğunu doğrulamaz (yalnız varlık). Başka formatta (`13/07/2026`) saklanırsa sözlüksel karşılaştırma yanlış davranır: deadline sonrası gönderimi süresiz açık tutabilir veya kalıcı bloklayabilir. Ayrıca `donem_baslangic <= donem_bitis` doğrulaması yok.
- **Düzeltme**: Oluşturma/güncellemede tüm tarih alanlarını katı `^\d{4}-\d{2}-\d{2}$` + geçerli tarih + `baslangic <= bitis` olarak doğrula; karşılaştırmayı gerçek tarih nesnesiyle yap.

#### 22. `passingScore: 0` yanlış yapılandırması herkesi geçiriyor — Business Logic

- **Kaynak tarama**: `sast/businesslogic-results.md` (Bulgu 13)
- **Sınıflandırma**: ⚠ Olası (PLAUSIBLE)
- **Uç / Dosya**: `POST .../quiz/:courseId/:lessonId/submit` — `progress.js:236-251`; ders oluşturma `lessons.js:88-90`
- **Önem gerekçesi**: Saldırgan-kontrollü yol değil (`correctOptionId` görünmediğinden sınavı zorla geçemez); yanlış yazılmış sınav sessizce herkese tamamlama verir → yapılandırma sertleştirme notu, Düşük.
- **Sorun**: Puanlama `Math.round(correctCount/questions.length*100)`, `passingScore` varsayılan 70. Oluşturma `passingScore` 0-100 ve `questions.length >= 1`'i doğrular; ancak `passingScore: 0` yapılandırılmış sınav herhangi bir gönderimi otomatik geçirir (skor `>= 0`).
- **Düzeltme**: Minimum geçer not zorla / 0'da uyar; `answers` anahtarlarını soru id'leriyle doğrula.

---

## Uygulanamaz Sınıflar (Temiz — neden)

Aşağıdaki 7 açık sınıfı bu kod tabanında **uygulanamaz** ya da doğrulanmış açık içermiyor:

| Sınıf | Durum | Neden |
|------|-------|-------|
| **RCE** (komut enjeksiyonu / eval / deserializasyon) | Temiz | `child_process`/`exec`/`spawn`, `eval`/`new Function`/`vm`, `node-serialize`/`yaml.load` — kod tabanında 0 kullanım. Tüm dinamik `import()` sabit string modül adı. Deserializasyon yalnız `JSON.parse`. `sharp`/`puppeteer`/`archiver`'a giden kullanıcı girdisi shell/eval içermiyor. |
| **SSTI** (sunucu template injection) | Uygulanamaz | Sunucu template engine yok (`ejs/pug/handlebars/nunjucks`, `res.render` yok). `report-template.js` düz JS template literal'i — şablon dili derlenmiyor. İlgili gerçek risk XSS (Bulgu #14). |
| **SQLi** | Uygulanamaz | Tek veri deposu Firestore (Admin SDK); SQL veritabanı/ORM/sorgu dili yok. Girdi→doküman-yolu riski IDOR/missingauth kapsamında (Bulgu #1). |
| **XXE** | Uygulanamaz | XML ayrıştırma yok; tüm veri değişimi JSON (REST). XML bağımlılığı/parser yok, DTD/entity çözümü yapılmıyor. |
| **GraphQL injection** | Uygulanamaz | Proje GraphQL kullanmıyor; API tamamen REST. `graphql`/`apollo`/`gql`/`/graphql` — 0 eşleşme, 0 bağımlılık. |
| **JWT** (algoritma karışıklığı, imza atlama) | Uygulanamaz | Elle JWT üretimi/doğrulaması yok; token yaşam döngüsünü Firebase Auth (Admin SDK, `verifyIdToken`) yönetir. `jsonwebtoken`/`jose` yok. Custom claim fail-open varsayılanı ayrı bir tasarım notu olarak Bulgu #7'de ele alındı (JWT kripto zafiyeti değil). |
| **Hardcoded secrets** | Temiz | Public/client koda sızmış gerçek sunucu sırrı yok. Client'taki Firebase web `apiKey` tasarımca public (sır değil). Tüm sunucu sırları `process.env`/Firestore'dan; yüksek-güven regex taraması (`AKIA/AIza/ghp_/GOCSPX-/sk-ant-/PRIVATE KEY`...) yalnız normal Firebase apiKey'i buldu. `AD_ACCOUNT_ID` sır değil, tanımlayıcı. |

---

## Ek: Tarama Kapsamı

| Tarama | Sonuç Dosyası | Durum |
|------|-------------|-------|
| IDOR | `sast/idor-results.md` | Tamamlandı |
| SQLi | `sast/sqli-results.md` | Tamamlandı (uygulanamaz) |
| SSRF | `sast/ssrf-results.md` | Tamamlandı |
| XSS | `sast/xss-results.md` | Tamamlandı |
| RCE | `sast/rce-results.md` | Tamamlandı (temiz) |
| XXE | `sast/xxe-results.md` | Tamamlandı (uygulanamaz) |
| File Upload | `sast/fileupload-results.md` | Tamamlandı |
| Path Traversal | `sast/pathtraversal-results.md` | Tamamlandı |
| SSTI | `sast/ssti-results.md` | Tamamlandı (uygulanamaz) |
| JWT | `sast/jwt-results.md` | Tamamlandı (uygulanamaz) |
| Missing Auth | `sast/missingauth-results.md` | Tamamlandı |
| Business Logic | `sast/businesslogic-results.md` | Tamamlandı |
| GraphQL injection | `sast/graphql-results.md` | Tamamlandı (uygulanamaz) |
