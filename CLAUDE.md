# CLAUDE.md

Sütlüce Kadayıf yönetim paneli: QR menü, raporlama ve akademi modülleri.
Express uyumlu backend (`backend-v2/`, Cloudflare Workers üzerinde Hono köprüsüyle)
+ React/Vite frontend + **Supabase (Postgres)**.

## Çalıştırma

- Backend: `cd backend-v2 && npm run dev` (Express modu, port 5001)
- Frontend: `cd frontend && npm run dev` (Vite), lint: `npm run lint`
- Deploy — ikisi de Cloudflare Workers, `wrangler` ile:
  - API: `cd backend-v2 && npx wrangler deploy` → `sutlucekadayif-api`
  - Panel: `cd frontend && npx wrangler deploy` → `sutlucekadayif-cms`
  - Wrangler oturumu sık düşüyor; `Authentication error [code: 10000]` görürsen
    `npx wrangler login` gerekiyor (tarayıcı onayı ister).
- Zamanlanmış işler:
  - Meta/Google çekimi: Worker cron `0 4 * * *` (`wrangler.toml` → `[triggers]`,
    `CRON_AKTIF` ile açılıp kapanır; `worker.js` içindeki `scheduled`).
  - Gece yedeği: **GitHub Actions** (`.github/workflows/gece-yedegi.yml`, 00:00 UTC,
    `yedek/pg/` altına, son 14 gün). Worker'da yedek cron'u YOK.
- `api2` (Firebase Functions, `firebase.json` → codebase `v2`) yalnızca rollback
  hedefi olarak duruyor; cron'ları kapalı, trafiği yok.

## Yapı

- `backend-v2/modules/{qr-menu,reports,academy}` — modül bazlı route + servisler
- `backend-v2/routes/` — ortak rotalar (users, profil, media, upload, onboarding...)
- `backend-v2/shared/` — `router.js` (ortam bağımsız router + Express/Hono adaptörleri),
  `permissions.js`, `dosya.js` (multer yerine), `limit.js`
- `backend-v2/worker.js` — Cloudflare Workers girişi (Hono); `server.js` — Express girişi
- `supabase/migrations/` — şema geçmişi (numaralı SQL dosyaları)
- `frontend/src/modules/{qr-menu,reports,academy}` — backend modülleriyle aynı bölümleme
- `backend/` — ESKİ Firestore kod tabanı, SALT OKUNUR referans; `api` fonksiyonu silindi
- `next-shadcn-admin-dashboard/` (repo kökü) — UI tasarım referansı, SALT OKUNUR

## Kritik kurallar (bozması kolay, koddan görünmez)

1. **Router köprüsü:** Rota dosyaları `express`ten DEĞİL `backend-v2/shared/router.js`
   içindeki `Router`'dan alır. Aynı rota gövdesi hem Express (api2) hem Hono (Workers)
   üzerinde koşuyor. `req`/`res` yüzeyi köprünün desteklediğiyle sınırlı —
   yeni bir alan kullanacaksan önce köprüye eklenmeli. Express'in konumsal joker
   parametresi (`req.params[0]`) köprüde ayrıca ele alınıyor, bkz. `honoyaBagla`.
2. **Dönem yazma:** Dönem verisi `donemler` tablosuna `upsert` ile yazılır
   (`upsertButce`, `upsertMetaToplanlar`, `upsertGoogleToplanlar`). Firestore'daki
   `applyDonemWrite`/`recalcSubeAggregates` KALKTI: `donem_ozetleri` artık
   denormalize bir dizi değil, dönem satırlarından türetiliyor.
3. **Override semantiği:** `veri_overrides` dokümanı YOK. Bütçe alanları
   (`planlanan_butce`, `devredilen_miktar`, `merkez_destegi`) kendi kolonlarında;
   otomatik çekilen metrikler (harcama, erişim, google_*) ayrı kolonlarda. Yani
   "donmuş override" sorunu yapısal olarak çözülü — çekim bütçeye dokunmaz.
4. **Cache invalidation:** Rapor verisini değiştiren her endpoint sonrasında
   `invalidateReportCache(...)` + `invalidateCache('/reports')` çağır; bütçe
   tarafında ayrıca `butceDurumCache.clear()`. `bumpDataVersion`/`versionedCacheMiddleware`
   TAŞINMADI — Postgres'te veri versiyonu kavramı yok, düz TTL + invalidate yeterli.
5. **Auth:** Yönetim endpoint'leri `verifyToken` + `requirePermission('<izin>')`
   zinciriyle korunur. Kimlik **Supabase Auth** (ES256 JWT, JWKS ile doğrulanır);
   claim'ler `app_metadata` içinde. Şube sahibi rotalarında kullanıcının kendi şubesi
   dışına erişemediğini kontrol et.
6. **İzin dosyası ÜÇ yerde:** `shared/permissions.js`, `backend-v2/shared/permissions.js`
   ve `backend/shared/permissions.js`. Yeni izin eklerken hepsini güncelle; yoksa
   frontend'de sessizce `false` döner.
7. **Menü JSON'u:** Müşteri menüleri R2'de statik JSON olarak duruyor. Ürün/kategori
   değiştiren her yol sonunda ilgili şubelerin JSON'u yenilenmeli
   (`regenerateAffectedMenuJsons` / `regenerateMenuJsons`), yoksa QR menüde eski veri kalır.
8. **PDF üretimi tarayıcıda:** Sunucuda Chromium yok. Rapor ve bütçe çıktıları
   `frontend/src/modules/reports/utils/pdf-yazdir.js` ile üretilip doğrudan indirilir;
   yazdırma penceresi açılmaz. Geometri 480px × ölçülen yükseklik. Dosyanın başındaki
   yorumlar hangi tuzağın neden çözüldüğünü anlatıyor — dokunmadan önce oku.

## Frontend konvansiyonları

- UI: shadcn/radix + Tailwind; ikonlar lucide-react; bildirimler sonner (toast).
- State: zustand + @tanstack/react-query; tarih işleri date-fns; grafikler recharts.
- API çağrıları modülün kendi hook/api katmanından geçer (ör. reports →
  `modules/reports/hooks/useReports.js` içindeki `reportsApi`); component içinde
  çıplak fetch yazma.
- Tek şubeyi etkileyen değişiklik sonrası tam dashboard yenileme yerine
  `refreshBranch(kod)` gibi hedefli yenileme kullan.
- Dinamik `import()` kullanacaksan `shared/utils/parca-yukle.js` içindeki
  `parcaYukle` ile sar: yeni sürüm yayınlandığında eski sekmenin istediği hash'li
  parça sunucudan kalkıyor ve import "Failed to fetch dynamically imported module"
  ile patlıyor; sarmalayıcı bunu yakalayıp sayfayı bir kez yeniliyor.

## Genel

- Kod yorumları, commit mesajları ve UI metinleri Türkçe; mevcut adlandırma stiline uy
  (Türkçe alan adları: `sube`, `donem`, `butce`...).
- Yapılacak işler / bilinen iyileştirmeler: `SONRAKI-DUZENLEMELER.md`.
- **Kod grafiği (graphify):** `graphify-out/graph.json` kod tabanının çağrı/ilişki
  grafiğini tutar (gitignore'da, lokal). Bir fonksiyonu değiştirmeden önce etki alanını
  görmek için `graphify explain "<fonksiyon>"` veya `graphify path "A" "B"` kullan.
  Büyük refactor sonrası `graphify update .` ile tazele.
