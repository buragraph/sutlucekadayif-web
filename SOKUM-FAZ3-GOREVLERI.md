# Söküm + Faz 3 — Sıkıştırılmış Paket (1 Ağustos, tek gün)

> Gözlem haftası "takvim → kanıt" takasıyla bugüne iniyor. Her seri bir kapı:
> önceki serinin TÜM doğrulamaları geçmeden sonraki başlamaz. Faz 1/2 çalışma
> kuralları aynen. Strateji: SUPABASE-GECIS-PLANI.md §4c; Workers ön-envanteri
> FAZ2-GOREVLERI.md sonunda.
>
> **Kritik güvence değişikliği:** Faz 3'ün rollback hedefi eski `api` DEĞİL,
> `api2`'dir. Worker canlıya alındıktan sonra api2 silinMEZ, en az birkaç gün
> yedek hedef olarak durur. Eski `api` ise D+S kapıları geçilince silinir —
> gerekirse git'ten yeniden deploy edilebilir (Node 20, 30 Ekim'e kadar).

## D — Kanıt turu (haftanın yerine geçen liste)

- **D1 (KULLANICI):** 5 geçici parola dağıtılır; 5 kullanıcının HEPSİ Supabase
  ile gerçekten giriş yapar. Doğrula: `auth.users.last_sign_in_at` 5/5 bugün.
  Eski sekmeler kapattırılır (Firebase oturumu kalmasın).
- **D2:** `middleware/auth.js`'e geçici sayaç/log: hangi dal doğruluyor.
  D1 sonrası 2 saat içinde Firebase dalına düşen istek **0** olmalı
  (B5'in ön koşulu; 0 değilse kim/neden bulunur).
- **D3 (KULLANICI):** Meta token panelden girilir → `ayarlar` tablosuna
  yazıldığı doğrulanır (settings yazma yolunun canlı testi).
- **D4:** Bir şube sahibi hesabıyla GERÇEK düzenleme: availability kapat/aç →
  R2'de o şubenin `menu/*.json`'ının tazelendiği damgayla doğrulanır
  (tam boru hattı kanıtı).
- **D5:** `geceYedegi` elle tetiklenir → `yedek/pg/` dosyası düşer;
  **geri yükleme tatbikatı** hemen yapılır (scratch şemaya yükle, satır
  sayıları doğrula, şemayı sil). `otomatikRaporCekimi` elle tetiklenir →
  "0 dönem" sessiz çıkış loglanır.

*Kapı: D2–D5 yeşil. **B5'in gerçek koşulu D2 = 0** (açık eski-bundle oturumu
kalmadığının ampirik kanıtı). D1'in 5/5 tamamlanması blokaj DEĞİL — henüz hiç
girmemiş kullanıcı yeni bundle'da zaten yalnızca Supabase'le karşılaşır, ne
zaman girerse girsin etkilenmez (2026-08-01: 2/5 girdi, kalan 3 sonradan
girecek; parola kaybında admin panelden yeni parola atar).*

### Uygulandı — D2/D3/D4/D5 (2026-08-01)

**D2 — sayaç kuruldu, pencere işliyor.** `0008_auth_dal_log` + `middleware/auth.js`
içinde geçici blok (S2'de sökülecek). Neden tabloya yazıyor: Functions çok
örnekli, süreç içi sayaç örnek başına kaybolur.
- `dal='firebase'` → HER isteğe bir satır (e-posta + yol ile)
- `dal='supabase'` → örnek başına dakikada bir ÖZET satır (`adet` = pencere sayısı);
  "0 firebase" sonucunun boş kümeden değil gerçek trafikten geldiğinin kanıtı
- Enstrümantasyon önce KANITLANDI: bilinçli tek Firebase isteği satır üretti
  (`id=1`, `brk.koc2@gmail.com · GET /api/categories`), satır sonra silindi.
  **T0 = 2026-08-01T17:41:10Z** — bu andan sonra tabloda görülen HER firebase
  satırı gerçek bir eski-bundle oturumudur.
- 17:55 itibarıyla: firebase **0 satır**, supabase 14 istek. Pencere ~19:41Z'de
  (22:41 TR) dolar.

**D3 — geçti.** Meta token panelden girildi, `ayarlar.settings`'e yazıldı
(16:40:10). Doğrulandı: kullanıcı token'ı, app `2536645383433753`, izin
`ads_read`, **bitiş 30 Eylül 2026 16:36 UTC**; `act_...3379` insights okuması
çalışıyor (son 7 gün 340.647,21 TL / 4.958.887 erişim). Veri boşluğu da kapandı:
`2026-07-01→07-31` dönemi 16:41'de, `2026-07-23→08-21` dönemi 17:23'te yazıldı.
**Takvime yaz: 30 Eylül'de token ölür** (kalıcı çözüm: sistem kullanıcısı token'ı).

**D4 — geçti (tam boru hattı).** Şube sahibi (`mgg1599@gmail.com` / denizli)
kendi token'ıyla gerçek düzenleme yaptı: "Portakal Kremalı Cups" availability
kapatıldı → `menu/denizli.json` LastModified `12:57:47Z` → `17:43:11Z`, ürün
sayısı 62 → 61, ürün menüden çıktı. Geri açıldı → `17:43:17Z`, 61 → 62, ürün
döndü, `urun_sube.mevcut_degil=false`. Panel → Postgres → R2 zinciri saniyeler
içinde çalışıyor.

**D5 — geçti.**
- Yedek elle koşturuldu: `yedek/pg/2026-08-01.json.gz` — **8.198 satır, 179 KB,
  4,4 sn**, 18 tablo. (Not: Cloud Scheduler tetiği elle çalıştırılamadı —
  gcloud kurulu değil — bu yüzden `yedekAl()` doğrudan çağrıldı; kodun ve R2
  yazımının kanıtı, zamanlayıcı bağlantısının ilk gerçek sınavı 2 Ağu 03:00.)
- **Geri yükleme tatbikatı yapıldı:** yedek R2'den indirildi, `public.<tablo>`
  şemasının birebir kopyası olan `tatbikat_*` tablolarına yüklendi. **18/18
  tabloda yedek = geri yüklenen = canlı satır sayısı** (urun_sube 5.470,
  donemler 926, eslesmeler 764, urunler 537…). Tablolar sonrasında DROP edildi.
- Çekim elle koşturuldu: `donemSayisi: 0`, hata yok — sessiz çıkış.
  **Sebebi ölçüldü:** pencere `kampanyalar` tablosundan sürülüyor ve 1–7 gün
  önce biten kampanya yok (açık kampanya 21 Ağu'da bitiyor, bir önceki 22 Tem'de
  bitmiş = 10 gün, GRACE_DAYS'in dışında). İlk gerçek zamanlanmış çekim
  **22 Ağustos**; Meta token'ı o tarihte geçerli (30 Eylül'e kadar).

## S — Söküm (her adım geri alınabilir)

- **S1:** Firestore TAM export → R2 `arsiv/firestore-2026-08-01/` (salt
  okuma; auth kullanıcı listesi dahil — `auth.export` JSON'u da eklenir).
- **S2 (B5):** Çift doğrulayıcıdan Firebase dalı silinir; `config/firebase.js`
  + `firebase-admin` bağımlılığı repo'dan çıkar; D2 sayacı da sökülür;
  api2 redeploy. Doğrula: 5 kullanıcı token'ıyla smoke, `npm ls firebase-admin`
  boş.
- **S3:** Firestore güvenlik kuralları deny-all. (Veri silinmez — arşiv +
  dondurulmuş hâlde durur.)
- **S4 (KULLANICI + uygulayıcı):** Google OAuth izinli URI listesine TEK
  seferde İKİ adres eklenir (Workers geçişi bugün olduğu için çift tur
  yapılmaz; Google çoklu URI destekler, eski URI de şimdilik silinmez):
  1. `https://europe-west1-sutlucekadayif-web.cloudfunctions.net/api2/api/reports/auth/google/callback` (rollback hedefi)
  2. `https://sutlucekadayif-api.dijitalreklam.workers.dev/api/reports/auth/google/callback` (C1'de sabitlenen Worker adı)
  Konsol tarafı kullanıcıda; `ayarlar.settings.googleRedirectUri` C3 kesiminde
  Worker adresine yazılır (o âna kadar api2 adresi durur), ReportsModals
  placeholder'ı da C1'de güncellenir. İleride custom domain'e geçilirse
  üçüncü URI o gün eklenir — ayrı iş.
- **S5:** Eski Functions `api` silinir. (Geri dönüş: git'ten deploy,
  ~5 dk, 30 Ekim'e kadar mümkün.)

*Kapı: panel + menüler S2 sonrası smoke'tan geçmiş olmalı; S5 en son.*

### Uygulandı — S1/S2/S3/S5 (2026-08-01)

**S1 — arşiv alındı ve doğrulandı.** `arsiv/firestore-2026-08-01/` altında
**14 dosya, 243 KB**: 11 kök koleksiyon (`academy_courses`, `academy_progress`,
`ayarlar`, `franchise_basvurulari`, `kategoriler`, `kullanici_sube`, `medya`,
`ortak_urunler`, `reports`, `sube_notlari`, `subeler`) + auth listesi + auth
hash export'u + `_uid-eslesme` + `manifest.json`. **Toplam 1.921 doküman**
(alt koleksiyonlar dahil; `subeler` 88 kök → 958 toplam). Timestamp/GeoPoint/
DocumentReference tipleri `__tur` etiketiyle korundu.
Doğrulama arşivi R2'den GERİ okuyup saydı: **11/11 koleksiyonda kök ve toplam
doküman sayısı birebir**, auth 6/6. Parola hash'leri
`firebase-tools auth:export` ile ayrıca alındı (6 hesap, 5'i hash taşıyor) —
`_auth-export-hash.json.gz`. **Bu dosya hassastır; `arsiv/` öneki public
açılmamalı** (R2 custom domain planı gündeme gelirse istisna listesine yazılacak).

**S2 — Firebase dalı söküldü.** `middleware/auth.js` yalnızca Supabase JWT
doğruluyor; çift doğrulayıcı, D2 sayacı ve `uid_eslesme` çevirisi kalktı.
`config/firebase.js` silindi, `firebase-admin` package.json'dan çıktı,
`0009_firebase_sokumu` ile `auth_dal_log` + `uid_eslesme` DROP edildi
(eşleme tablosu silinmeden önce arşive yazıldı).
**D2 kapısının son ölçümü:** T0=17:41:10Z → 18:14Z arası **firebase dalı 0 satır**,
supabase tarafı 3 özet satırda 28 istek. Yani "0" ölçüm boşluğundan değil.
*Not: `firebase-admin` doğrudan bağımlılık olarak YOK ama `firebase-functions`'ın
geçişli bağımlılığı olarak `node_modules`'te duruyor — C3'te Functions ölünce
o da gider. `npm ls firebase-admin` bu yüzden tamamen boş değil.*
Smoke: `/health` ok, **5 kullanıcının 5'i** kendi Supabase token'ıyla `/profil`'de
kendi hesabını gördü, Firebase biçimli token **401**.
Firebase'e bağımlı 7 script (`smoke`, `rapor-diff`, `akademi-diff`,
`parite/calistir`, `parite/faz2`, `gecis/b1-kullanici-tasi`, `gecis/s1-…`)
silinmedi ama başlarına "TARİHSEL — ARTIK ÇALIŞMAZ" notu düşüldü.

**S3 — zaten deny-all'dı.** `firestore.rules` istemci erişimini en baştan
kapatıyormuş (`allow read, write: if false`); kural dosyası yeniden yayınlanıp
canlı hâlin dosyayla aynı olduğu doğrulandı. Değişiklik gerekmedi — asıl erişim
Admin SDK üzerindendi, o da S2+S5 ile ortadan kalktı.

**S5 — eski `api` silindi.** `functions:delete api --region us-central1`.
Doğrulama: eski adres **404**, `api2` `/health` **ok**. `firebase.json`'dan
`default` codebase kaldırıldı (yanlışlıkla yeniden deploy edilmesin);
geri dönüş git geçmişinden, 30 Ekim'e kadar.
**S4 ÖNCESİ ÖNLEM:** `ayarlar.settings.googleRedirectUri` eski API'yi
gösteriyordu ve o adres artık ölü → **api2 adresine çevrildi**. Google Cloud
Console'daki izinli URI listesi hâlâ KULLANICIDA (S4); Google hesabı yeniden
bağlanmadıkça sorun çıkmaz, refresh_token ile yenileme etkilenmez.

## C — Faz 3: Cloudflare Workers (plan §4c)

- **C0:** Envanter kararları (FAZ2-GOREVLERI sonundaki listeye göre):
  - `sharp` (routes/upload.js): karar — yükleme dönüşümü **istemci tarafına**
    (tarayıcıda canvas/WebP) ya da Cloudflare Images; hangisi seçilirse
    upload ucu ona göre. Karar uygulayıcıda, gerekçesiyle dosyaya işlenir.
  - `multer` → Workers FormData; `express-rate-limit` → Cloudflare edge
    kuralı (dashboard) + koddan çıkar; `node-cache` → kaldır ya da Cache API.
- **C1:** **Hono portu** — Worker adı SABİT: `sutlucekadayif-api`
  (S4'teki OAuth URI bu ada göre şimdiden kaydedildi; ad değişirse S4 bozulur).
  Rota gövdeleri sözleşme korunarak taşınır;
  `supabase-js` + `jose` aynen (ikisi de fetch/WebCrypto tabanlı).
  R2: S3 API yerine **native binding** (`wrangler.toml [[r2_buckets]]`) —
  `R2_*` anahtarları ölür. Cron Triggers: `0 0 * * *` (03:00 TR yedek) +
  `0 4 * * *` (07:00 TR çekim); TR'de DST yok. Secrets: `wrangler secret`.
  CORS Hono middleware'i; limiter koda GİRMEZ.
- **C2:** **Üçüncü parite kapısı** — harness aynı: Functions `api2` vs Worker
  (workers.dev), admin + şube sahibi token'larıyla tüm GET'ler + yazma
  senaryoları + 2 şube menü üretimi diff. Rapor: `RAPOR-FAZ3.md`. Sıfır
  açıklanmamış fark şartı.
- **C3:** Kesim: frontend `VITE_API_URL` → Worker URL'i, wrangler deploy.
  Worker cron'ları aktif, api2 cron'ları kapatılır (`CRON_AKTIF=false` —
  fonksiyonlar silinmez!). Smoke. **api2 rollback hedefi olarak kalır.**

*Kapı: C2 raporu kullanıcıya gösterilir, onaysız C3 yok.*

### C0 — ölçülen envanter + kararlar (2026-08-01)

Ön-envanter (FAZ2-GOREVLERI sonu) **eksikmiş**. Tüm `backend-v2` tarandı;
Workers'ta çalışmayacak paketlerin GERÇEK listesi:

| Paket | Dosya | Durum |
|---|---|---|
| `sharp` | routes/upload.js | planlıydı |
| `multer` | upload, academy/upload, reports/routes, budget-routes, server | planlıydı |
| `express-rate-limit` | basvurular, isbasvuru, geribildirim, server | planlıydı |
| `node-cache` | middleware/cache.js, reports/services/report-data.js | planlıydı |
| **`puppeteer-core` + `@sparticuz/chromium`** | reports/services/generate-pdf.js | **PLANDA YOKTU** |
| **`archiver`** | reports/routes.js (toplu ZIP) | **PLANDA YOKTU** |
| **`googleapis`** | reports/services/google-business.js, report-template.js | **PLANDA YOKTU** |
| `@aws-sdk/client-s3` | upload, yedek, config/r2 | native binding'e geçecek |
| `express` | **19 rota dosyası** + server.js | Hono portu |

**Kararlar:**

1. **`sharp` → istemci tarafı dönüşüm.** Yükleme öncesi tarayıcıda canvas ile
   WebP'ye çevrilir; sunucu yalnızca hazır baytı R2'ye koyar. Gerekçe:
   Cloudflare Images aylık ücretli, dönüşüm zaten tek seferlik ve tarayıcı
   bunu bedavaya yapıyor; sunucu kodu da küçülüyor. (Alternatif — Cloudflare
   Images — ileride görsel varyantı/CDN dönüşümü istenirse gündeme gelir.)
2. **`multer` → Workers native `FormData`.** `request.formData()` + `File`;
   bellekte tutulan buffer aynı şekilde R2'ye gidiyor.
3. **`express-rate-limit` → koddan tamamen çıkar**, yerini Cloudflare dashboard
   kuralları alır (form uçları için IP başına oran). Kod tarafında karşılığı yok.
4. **`node-cache` → süreç içi `Map` + TTL.** Worker isolate'i zaten kısa ömürlü;
   Cache API'ye gerek yok, mevcut `kapsamliCacheMiddleware` sözleşmesi korunur.
5. **`googleapis` → düz `fetch` + `jose`.** Google Business Profile Performance
   API basit REST; OAuth yenilemesi `refresh_token` ile tek POST. `googleapis`
   paketi Node http/crypto'ya bağlı, Workers'ta taşınamaz.
6. **`archiver` → `fflate`.** Saf JS, Workers uyumlu, store/deflate yeterli.
7. **`puppeteer-core` + Chromium → PORTLANMIYOR.** Workers'ta headless Chromium
   yok; karşılığı **Browser Rendering API ve ÜCRETLİ Workers planı gerektiriyor**.
   Sözleşmeyi bozmamak için karar: **`POST /reports/generate-pdf` ve
   `/generate-pdf-bulk` api2'de KALIR**; Worker bu iki yolu api2'ye proxy'ler.
   Sonuç: GCP tamamen kapanmıyor, tek bir fonksiyon PDF için yaşıyor.
   Kullanıcının tercihine göre sonradan değişebilir:
   (a) ücretli plan + Browser Rendering, (b) PDF'in tamamen istemcide üretilmesi
   (rapor HTML'i zaten panelde var), (c) bu haliyle kalması.

**7 numaralı madde KULLANICI TARAFINDAN DEĞİŞTİRİLDİ (2026-08-01):** proxy iptal,
PDF üretimi tamamen tarayıcıya taşındı, iki uç backend'den silindi. Sonuç:
api2'nin rollback nöbeti bitince **GCP tamamen kapanabilir**.

### Uygulandı — PDF'in tarayıcıya taşınması (2026-08-02)

**Yapı:** `frontend/src/modules/reports/utils/pdf-yazdir.js` — gizli iframe →
`document.fonts.ready` → `.report` yüksekliğini ölç (prod'daki AYNI seçici) →
`@page { size: 480px <ölçülen>px; margin: 0 }` + `print-color-adjust: exact`
(eski `printBackground: true` karşılığı) → `print()`.

**BİLİNÇLİ SÖZLEŞME DEĞİŞİKLİĞİ 1 — şablonun yeri.** Şablon frontend'e
KOPYALANMADI; HTML `POST /reports/preview`den alınıyor. O uç silinenler
listesinde değil ve eski PDF ucunun kullandığı `generateReportHtml(reportData)`
çıktısının ta kendisini veriyor. Kopyalamak ikinci bir nüsha + `buildReportData`'nın
istemcide yeniden üretimi demekti; tasarım sapması riskini artırırdı.
**Kullanıcı onayladı** ("preview ucu daha doğru").

**BİLİNÇLİ SÖZLEŞME DEĞİŞİKLİĞİ 2 — toplu çıktı.** `/generate-pdf-bulk`
N ayrı PDF'i ZIP'te veriyordu; tarayıcıda ZIP ancak piksel sadakatinden ödün
vererek üretilebilirdi. Yerine **N sayfalı tek PDF** (her sayfa kendi boyutunda,
CSS adlandırılmış sayfa kuralları). Buton "Toplu ZIP" → "Toplu PDF".
**Kullanıcı onayladı.**

**Doğrulama (amasya, 2026-06-23→07-22):**
- Eski uçtan üretilen PDF: **MediaBox `0 0 360 1129.91992`** = 480×1506,6px, 1 sayfa, 348.176 B
- Yeni akıştan (lokal Chrome 150, `preferCSSPageSize`): **MediaBox birebir aynı**,
  1 sayfa, 347.150 B (%0,3 fark — yazı tipi alt kümeleme)
- Piksel karşılaştırması: kanalların **%0,99'u** farklı, ortalama sapma **1,5/255**,
  en büyük **5/255** → yalnızca kenar yumuşatma; yapısal fark yok.

**Ölçülen tek fark ve kararı:** Chrome 148'de aynı kod **1509px** ölçüyor
(Chrome 150'de 1506). DPR elendi (1×/2×/3× hepsinde 1506). Sebep Chrome
sürümleri arası satır yüksekliği yuvarlaması. Kâğıt her zaman O TARAYICININ
kendi ölçümüne eşitlendiği için kırpma/boş sayfa oluşmuyor; "1506" evrensel
sabit değil, prod Chromium'unun ürettiği sayıymış.
**Kullanıcı kararı: (a) kabul** — yükseklik ölçülen değer olarak kalır.

**Tarayıcı testinin yakaladığı gerçek hata:** iframe DOM'a eklenip sonra `srcdoc`
verilince `about:blank` için erken bir `load` olayı fırlıyor; ilk sürüm ona kanıp
BOŞ belgede ölçüm yapıyor ve 480×**100px** kâğıt üretiyordu. Düzeltildi (içerik
önce, DOM'a ekleme sonra + belge dolu mu kontrolü + 30 sn zaman aşımı).
Puppeteer testi bunu göremezdi.

**Söküm:** `services/generate-pdf.js` silindi, iki rota `routes.js`'ten kaldırıldı,
`puppeteer-core` + `@sparticuz/chromium` + `archiver` package.json'dan düştü.
Deploy edildi; canlıda **iki uç da 404**, `/preview` 200 ve şablon sağlam,
`/health` ok. Frontend version `7ace6eed`.

**S4 — TAMAM (kullanıcı, 2026-08-01):** Google Cloud Console'daki izinli URI
listesine iki adres eklendi (api2 ve Worker). `ayarlar.settings.googleRedirectUri`
şu an api2'yi gösteriyor; C3 kesiminde Worker adresine çevrilecek.

### Uygulandı — C1 + C2 (2026-08-02)

**Worker canlıda:** `https://sutlucekadayif-api.dijitalreklam.workers.dev`
(ad S4'teki OAuth kaydıyla aynı), sürüm `10a2ba41`, 370 KB gzip.
**C2 parite kapısı GEÇTİ — sıfır açıklanmamış fark.** Rapor:
`scripts/parite/RAPOR-FAZ3.md`.

**Yöntem — ortam bağımsız köprü.** Rota gövdelerine hiç dokunulmadı; 19 rota
dosyasında yalnızca `import { Router }` satırı değişti. Dört soyutlama:
- `shared/router.js` — mini router + Express ve Hono adaptörleri
- `config/r2.js` + `depo-s3.js` / `depo-binding.js` — depolama
- `shared/dosya.js` — multer ↔ `request.formData()`
- `shared/limit.js` — express-rate-limit ↔ kenar kuralları
Böylece `server.js` (api2, rollback hedefi) ve `worker.js` aynı kodu koşuyor.

**Köprünün yakaladığı iki gerçek hata (ikisi de sessizdi):**
1. Express middleware'leri `next()`'i await ETMİYOR (Express de etmiyor) —
   ilk sürüm zinciri "middleware döndü" diye bitmiş sayıyordu ve
   `cacheMiddleware` kullanan public menü ucu **200 ama boş gövde** dönüyordu.
   Çözüm: yanıt yazıldığında çözülen bir söz (`res.yazildi`) + zaman aşımı.
2. `config/env.js`'e top-level await koymak, env.js'i import ETMEYEN modüllerin
   (ör. `middleware/auth.js`) o await sırasında değerlendirilmesine yol açtı;
   JWKS URL'i `undefined/...` çıktı. TLA kaldırıldı, yerine ortam kontrolü.

**Diğer C1 kalemleri:** `googleapis` → düz `fetch` + `google-oauth.js`
(yetki URL'i, kod→token, refresh); `node-cache` → `utils/ttl-cache.js`;
`sharp` → tarayıcıda canvas (`frontend/.../qr-menu/utils/gorsel.js`, AYNI
parametreler: 800px, WebP q80) ve `/upload/image` artık WebP bekliyor.
package.json'dan düşenler: `puppeteer-core`, `@sparticuz/chromium`, `archiver`,
`googleapis`, `node-cache`, `sharp`.

**Cron sahipliği:** Worker'ın iki cron'u da `CRON_AKTIF` kapısının arkasında ve
şu an `false` — bu gece 03:00/07:00 işlerini **api2 koşacak** (kullanıcı isteği).
C3'te Worker'da `true`, api2'de `false` olacak.

**C2 ölçümleri:** gecikme api2 ortanca 112 ms / p95 282 ms, Worker 120 ms / 297 ms
(fark gürültü düzeyinde). CPU: ortanca 10 ms, **en yüksek 39 ms (`/products`)**;
hiçbir istek kesilmedi. Free-plan değerlendirmesi ve gece yedeği için GitHub
Actions alternatifi raporun 5. bölümünde.

**AÇIK KALEM (C3 öncesi):** R2 kovası başka Cloudflare hesabında olduğu için
native binding kullanılamadı; Worker S3 API'siyle konuşuyor ve
`@aws-sdk/client-s3`'ün **listeleme** çağrısı Workers'ta `DOMParser` olmadığı için
düşüyor → gece yedeğinin **budama** adımı çalışmıyor (yazma/okuma/silme sorunsuz,
veri kaybı yok). Çözüm: Worker'ı kovanın hesabına taşımak. Raporun 6. bölümü.


### C3 kesim listesi (sabah, ~5 dk — ONAY BEKLİYOR)

Sırayla:
1. **Frontend'i yeniden deploy et** — `VITE_API_URL` → Worker adresi.
   ZORUNLU: istemci tarafı WebP dönüşümü (`qr-menu/utils/gorsel.js`) henüz
   CANLIDA DEĞİL; Worker'ın `/upload/image` ucu WebP bekliyor. Bu adım
   atlanırsa görsel yükleme 400 döner.
2. `ayarlar.settings.googleRedirectUri` → Worker callback adresi
   (S4'te izinli URI listesine zaten eklendi).
3. Worker `CRON_AKTIF=true`, api2 `.env` `CRON_AKTIF=false` + api2 redeploy.
   (İki taraf aynı anda true olursa 03:00'te iki yedek, 07:00'de çift çekim.)
4. Smoke: giriş, dashboard, ürün düzenleme, menü JSON tazeliği, PDF yazdırma.
5. **api2 SİLİNMEZ** — birkaç gün rollback hedefi olarak durur.

Kesim ÖNCESİ karar bekleyen iki şey:
- R2 hesap ayrımı (yukarıdaki açık kalem) — Worker kovanın hesabına taşınacak mı?
- Gece yedeği Worker'da mı kalsın, GitHub Actions'a mı taşınsın?

### Uygulandı — C3 kesim (2026-08-03)

**Gece sınavı geçti (api2'de):** 2 Ağu 00:00 UTC yedeği 8.241 satır / 2,9 sn,
3 Ağu 00:00 UTC yedeği de düştü; 04:00 çekimi hatasız (kampanya penceresi boş).

**Kesim adımları:**
1. `frontend/.env` → `VITE_API_URL=https://sutlucekadayif-api.dijitalreklam.workers.dev/api`,
   build + deploy (sürüm `7232989c`). İstemci tarafı WebP dönüşümü bu deploy'la
   canlıya çıktı — Worker'ın `/upload/image` ucu WebP beklediği için şarttı.
2. `ayarlar.settings.googleRedirectUri` → Worker callback adresi
   (S4'te izinli URI listesine eklenmişti). Meta/Google anahtarları korundu.
3. Cron devri: Worker `CRON_AKTIF=true` + tek cron (`0 4 * * *`), api2 `.env`
   `CRON_AKTIF=false` + redeploy. api2'deki `geceYedegi` fonksiyonu SİLİNMEDİ,
   CRON_AKTIF kapısına alındı — rollback tek bayrak.
4. **Parite kapısı yeniden koşuldu** (api2 artık C1 refactor'lı kodu koşuyor):
   yine **sıfır açıklanmamış fark**. Böylece hem Express hem Hono yolu doğrulandı.
5. Canlı panel smoke: giriş ✓, Genel Bakış "5 il · 7 şube" ✓, Raporlar 88 şube ✓,
   konsolda hata yok ✓ — ve tarayıcı ağ kaydında **api2'ye giden istek 0**,
   hepsi Worker'a gidiyor. Test hesabı silindi (kalan 5 kullanıcı).

**Gece yedeği GitHub Actions'a taşındı:** `.github/workflows/gece-yedegi.yml`
(00:00 UTC = 03:00 TR, `workflow_dispatch` ile elle de tetiklenir) +
`backend-v2/scripts/gece-yedegi.mjs` (aynı `yedekAl()`, Node/S3 kaydıyla).
Lokal koşum doğrulandı: 8.280 satır, 181 KB, 3,7 sn, **budama çalışıyor**
(Workers'ta düşen liste çağrısı Node'da sorunsuz). Ek emniyet: yedek 1.000
satırdan azsa iş kırmızıya düşer — sessiz bozuk yedek en tehlikelisi.
Worker'ın yedek cron'u kaldırıldı (artık tek cron: 07:00 çekim).

**KULLANICIDA — workflow çalışmadan önce iki şart:**
1. `backend-v2/` ve `.github/` **git'e commit + push edilmeli** (şu an ikisi de
   izlenmiyor; 97 dosya). Actions repodaki koddan koşar. `.env` dosyaları
   gitignore'da — sızıntı yok.
2. Repo ayarlarından **7 secret** eklenmeli: `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`.
   Değerler `backend-v2/.env` içinde; sohbete yapıştırma.
3. Zamanlanmış workflow'lar YALNIZCA varsayılan daldan (main) koşar — dosya
   main'e girene kadar cron tetiklenmez. O ana kadar yedek almak için ya
   `workflow_dispatch` ya da api2'de `CRON_AKTIF=true`.

**Son durum:** panel + menüler Worker'da, api2 rollback hedefi olarak ayakta
(cron'suz), Firestore arşivde ve deny-all, Firebase yalnızca Auth kalıntısı
olmadan duruyor. GCP'de yaşayan tek şey api2 ve iki uykuda zamanlanmış fonksiyon.

## Bilinçli kabul edilen artık risk

Sıkıştırmayla vazgeçilen tek şey: "bir haftalık doğal kullanımda ortaya
çıkabilecek sinsi hata" kapsamı. Karşılıkları: her adım dakikalar içinde geri
alınabilir; yedek + arşiv bugünden var; ilk doğal ay-sonu sınavı (dönem
kapanışı + Meta çekimi) zaten 21-22 Ağustos'ta ve o gün loglara bakılacak.
