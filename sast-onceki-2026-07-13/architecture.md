# Architecture: Sütlüce Kadayıf Web (QR Menü + Raporlama + Akademi)

> SAST değerlendirmesinin 1. fazı — mimari/veri akışı keşfi. Spesifik açık iddiası
> içermez; sonraki faz skill'leri (sqli, xss, idor, ssrf, ...) bu belgeyi bağlam alır.

## Technology Stack

| Category | Details |
|---|---|
| Languages | JavaScript (ESM, Node 20), JSX (React 19) |
| Backend framework | Express 4 (Firebase Functions Gen2 `onRequest` üzerinde), tek `api` fonksiyonu tüm Express app'i sarar (`backend/server.js`) |
| Frontend | React 19 + Vite, Tailwind v4, shadcn/radix, zustand + @tanstack/react-query, recharts |
| Databases | Firestore (tek veri deposu, Admin SDK ile server-side) |
| Cache | node-cache (in-instance bellek), versiyon-anahtarlı cache middleware; R2'de menü JSON cache |
| Auth mechanism | Firebase Authentication (ID token + custom claims `role`, `subeSlug`); yetki merkezi `shared/permissions.js` tablosu + `requirePermission` middleware |
| Object storage | Cloudflare R2 (S3-uyumlu, `@aws-sdk/client-s3`) — görsel, video, PDF, dekont, menü JSON |
| PDF | puppeteer-core + @sparticuz/chromium (headless), HTML→PDF |
| Görsel işleme | sharp (yüklenen görseller WebP'ye yeniden kodlanır) |
| External services | Meta Graph API (v21.0, sabit host + hardcoded ad account `act_1095694041713379`), Google Business Profile API, OpenAI-uyumlu LLM (`AI_BASE_URL`, ürün açıklaması), OpenStreetMap Nominatim (geocode) |
| Infra | Firebase Functions (us-central1), Cloudflare Workers (frontend `sutlucekadayif-cms`), zamanlanmış iş `onSchedule` (07:00 Europe/Istanbul) |
| Secrets | `.env` + `serviceAccountKey.json` (ikisi de gitignore'da, repoda YOK); R2/Meta/Google/AI anahtarları `process.env`'den |

## Architecture Overview

**Monolit backend**, modül bazlı bölünmüş (`backend/modules/{qr-menu,reports,academy}` + ortak `routes/`). Tek Express app Firebase Functions'ta tek `api` fonksiyonu olarak deploy edilir. Frontend ayrı SPA (Cloudflare Workers'tan statik servis), backend'e `/api/*` üzerinden REST çağrısı yapar.

**Client Firestore'a doğrudan erişemez** — `firestore.rules` tüm client SDK erişimini kapatır (`allow read, write: if false`). Tüm veri erişimi backend Admin SDK üzerinden; Admin SDK kuralları bypass eder. Dolayısıyla **tüm yetkilendirme yükü backend kod katmanındadır**; Firestore kuralları savunma katmanı olarak yalnızca client'ı dışlar, backend mantığını denetlemez.

Modüller:
- **qr-menu**: Ürün/kategori yönetimi + PUBLIC müşteri menüsü (`/api/menu/:subeSlug`, auth yok). Kategoriler ve `ortak_urunler` global koleksiyon; şubeye özel ürünler `subeler/{slug}/urunler`.
- **reports**: Reklam raporlama, Meta/Google veri çekimi, bütçe kampanya akışı (şube bütçe bildirimi + dekont + admin onayı), PDF üretimi, zamanlanmış otomatik çekim.
- **academy**: Kurs/ders/sınav yönetimi, kullanıcı ilerleme takibi, video (YouTube)/PDF içerik.
- **ortak routes**: users (Firebase Auth + claims yönetimi), branches, categories, profil, onboarding, upload, media, ai.

## Data Flow

1. **Kimlik:** Frontend Firebase Auth ile giriş yapar; `auth.currentUser.getIdToken()` ile taze ID token alınıp her istekte `Authorization: Bearer` header'ında gönderilir. Token manuel saklanmaz (SDK yönetir).
2. **Token doğrulama:** `verifyToken` (`middleware/auth.js`) `verifyIdToken` ile doğrular; `req.user = { uid, email, role, subeSlug }` **doğrudan custom claims'ten** kurulur (DB okuması yok). `role` yoksa varsayılan `'sube_sahibi'`.
3. **Yetki:** `requirePermission('key')` → `PERMISSIONS[key].includes(req.user.role)`. Şube izolasyonu ayrıca handler içinde imperatif kontrollerle (`ensureBranchAccess`, `subeSlug` karşılaştırması, `canMutateProduct`, `canMutateProduct`).
4. **Veri:** Handler'lar Admin SDK ile Firestore okur/yazar; denormalize alanlar (`donem_ozetleri`, `konumlar`) ortak store'lardan güncellenir. Değişimlerde versiyon-anahtarlı cache invalidasyonu.
5. **Dosya:** multer memoryStorage → (görselse sharp/WebP) → R2 `uploadFile(buffer, key)`. Sunum `GET /api/upload/proxy/*` (auth yok) veya `/api/upload/dekont/*` (auth + şube kontrolü).
6. **Public menü:** `/api/menu/:subeSlug` auth'suz; şube dokümanından yalnızca whitelist alanlar (`id, slug, ad, il, ilce`) döner; ürünler tam döner (menü içeriği).

## Entry Points (özet)

| Bölge | Örnek endpoint | Auth | Not |
|---|---|---|---|
| Public menü | `GET /api/menu/:subeSlug` | **Yok** | Whitelist alan döner; tam koleksiyon okur (cache 60sn) |
| OAuth callback | `GET /api/reports/auth/google/callback` | **Yok** | Standart OAuth code exchange |
| Health | `GET /api/health` | Yok | — |
| Dosya proxy | `GET /api/upload/proxy/*` | **Yok** | R2 key = ham `req.params[0]`; koruma tek `dekontlar/` prefix reddi + CORS `*` |
| Users | `POST/PUT/DELETE /api/users[/:uid]` | verifyToken + `users.*` | `sube_sahibi` de create/assignRole/delete izinli; kısıt handler içi |
| Profil/Onboarding | `/api/profil`, `/api/onboarding/*` | verifyToken (requirePermission yok) | Kimlik hep token'dan; alan whitelist |
| Reports view | `/api/reports/sube/:kod/*`, `/dashboard*` | verifyToken + `reports.view` | `ensureBranchAccess` ile şube izolasyonu |
| Reports manage | `/api/reports/settings`, `/meta-*`, `/google-*`, override | verifyToken + `reports.manage` | admin-only |
| Bütçe (şube) | `POST /api/reports/butce-gonder/:kampanyaId` | verifyToken + `budget.submit` | subeKod token'dan; dekont kendi slug'ına |
| Bütçe (admin) | `/butce-kampanya*`, `/onayla*`, `/devret*` | verifyToken + `budget.manage` | admin-only |
| Akademi | `/api/academy/{courses,lessons,progress,upload}` | verifyToken + `academy.*` | Kurs görünürlüğü rol+şube hedefleme |
| Ürün/Kategori/Şube/Medya | `/api/products`, `/categories`, `/branches`, `/media` | verifyToken + `requirePermission` | Sahiplik `canMutateProduct` vb. |
| AI | `POST /api/ai/generate-description` | verifyToken + `products.edit` | Kullanıcı metni sabit LLM host'una |
| Zamanlanmış | `otomatikRaporCekimi` (onSchedule) | — (iç) | 07:00, kapanan dönemleri çeker |

## Trust Boundaries

- **Tarayıcı → Backend:** En kritik sınır. Tüm girdiler untrusted; kimlik yalnızca doğrulanmış ID token'ın custom claims'inden.
- **Public internet → PUBLIC endpoint'ler:** `/api/menu/:subeSlug`, `/api/upload/proxy/*`, `/auth/google/callback`, `/api/health` — auth yok, bilinen özel dikkat yüzeyi.
- **Backend → Firestore:** Admin SDK kuralları bypass eder; güvenlik tamamen kod katmanında.
- **Backend → R2:** Key üretimi handler'da; bazı yerlerde kullanıcı girdisi (`folder`, dosya uzantısı) key'e karışıyor.
- **Backend → Dış API'ler (Meta/Google/LLM/Nominatim):** Host'lar sabit; access token'lar admin ayarından/kullanıcıdan. SSRF için host kullanıcı kontrolünde değil.
- **Custom claims:** Rol/şube her istekte token'dan; claim doğruluğu tüm yetki + cache izolasyonunun temeli.

## Sensitive Data Inventory

| Data Type | Where Stored | How Accessed | Protection |
|---|---|---|---|
| Firebase service account key | `backend/serviceAccountKey.json` (lokal) / bulut default cred | Admin SDK init | gitignore'da; repoda yok |
| R2 erişim anahtarları | `process.env` (R2_ACCESS_KEY_ID/SECRET) | `config/r2.js` | .env gitignore'da |
| Meta API token | Firestore `reports/settings` | Sadece server okur; response'a konmaz | admin-only endpoint |
| Google OAuth token | Firestore `reports/google_token` | Server-side | admin-only |
| Şube PII (VKN, fatura adresi, yetkili, telefon) | Firestore `subeler/{slug}` | `branches.js` (auth'lu); public menü whitelist'ler | Canlı menü whitelist; **R2 menü cache JSON tam doküman yazıyor olabilir — doğrulanacak** |
| Dekont (banka makbuzu) | R2 `dekontlar/{kampanyaId}/{subeKod}.ext` | `/upload/dekont/*` (auth + şube), `/proxy/*` prefix reddi | Şube kontrolü key segmentine dayalı |
| Kullanıcı rol/şube | Firebase custom claims + Firestore `kullanici_sube/{uid}` | `verifyToken` claims'ten | — |
| Firebase web apiKey | Frontend bundle (`VITE_*`) | Client | Normal/public — sır değil |

## Faz 2 için öncelikli hedef bölgeler (keşiften)

- **missingauth / idor:** `/api/upload/proxy/*` auth'suz + ham key (yalnızca `dekontlar/` prefix reddi); `users.*` izinlerinin `sube_sahibi`'de geniş olması (kısıt handler içi, merkezi değil); `/auth/google/callback` auth'suz.
- **fileupload / pathtraversal:** Ürün upload'ında `folder` (`req.body.folder`) sanitize edilmeden R2 key prefix'ine giriyor; academy upload'ında uzantı kullanıcı dosya adından, içerik yeniden kodlanmıyor; `urlToKey` doğrulamasız string-replace (academy silmede `dekontlar/` koruması yok).
- **businesslogic:** Bütçe alanlarında (`planlananButce`, `secilen_bakiye`, `merkezDestegi`) sunucu tarafı aralık/tip/whitelist doğrulaması yok; `secilen_bakiye` sunulan `bakiye_secenekleri`'ne karşı doğrulanmıyor; tarih alanlarında format doğrulaması yok.
- **xss:** PDF şablonu (`report-template.js`) kaçışsız template literal; serbest-metin alanlar `sube.ad`/`donem.label` (kaynak Firestore, admin yönetimli). Frontend'te dangerouslySetInnerHTML kullanımı ayrıca taranmalı.
- **ssrf:** Düşük — Meta/Google/LLM host'ları sabit; Nominatim sabit host + encode. `since/until` Meta query'sine ham enterpole (sabit host, parametre enjeksiyonu notu).
- **hardcodedsecrets:** Client'a sızmış gerçek sunucu sırrı bulunmadı (yalnızca normal Firebase web apiKey). `AD_ACCOUNT_ID` backend'de hardcoded (sır değil, tanımlayıcı).
- **Bilgi ifşası:** `menu-cache.js` R2 JSON'ı tam şube dokümanı yazıyor olabilir (public erişilebilirse VKN/fatura sızıntısı) — doğrulanacak.
- **Uygulanamaz beklenen:** sqli (Firestore, SQL yok), xxe (XML parse yok), graphql (yok), ssti (server template engine yok — PDF şablonu düz JS literal), jwt (Firebase SDK yönetir, elle JWT doğrulama yok).
