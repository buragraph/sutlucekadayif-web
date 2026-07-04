# CLAUDE.md

Sütlüce Kadayıf yönetim paneli: QR menü, raporlama ve akademi modülleri.
Express backend (Firebase Functions üzerinde, Node 20) + React/Vite frontend + Firestore.

## Çalıştırma

- Backend: `cd backend && npm run dev` (LOCAL_DEV=true, port 5001, `--watch`)
- Frontend: `cd frontend && npm run dev` (Vite), lint: `npm run lint`
- Deploy: Firebase Functions (`firebase.json` → source: backend). Zamanlanmış iş
  `server.js` sonunda `onSchedule` ile tanımlı (her gün 07:00 Europe/Istanbul,
  `runScheduledFetch` — kapanan dönemleri GRACE_DAYS boyunca yeniden çeker).

## Yapı

- `backend/modules/{qr-menu,reports,academy}` — modül bazlı route + servisler
- `backend/routes/` — ortak rotalar (users, profil, media, upload, onboarding...)
- `backend/shared/` — `konum-store.js`, `permissions.js`
- `backend/middleware/` — `auth.js` (verifyToken, requirePermission), `cache.js`
- `frontend/src/modules/{qr-menu,reports,academy}` — backend modülleriyle aynı bölümleme
- `next-shadcn-admin-dashboard/` (repo kökü) — UI tasarım referansı, SALT OKUNUR; koduna dokunma, sadece örnek al

## Kritik kurallar (bozması kolay, koddan görünmez)

1. **Dönem yazma kuralı:** Dönem (`subeler/{kod}/donemler/{id}`) dokümanına yazan HER yol
   `backend/modules/reports/db.js` içindeki `applyDonemWrite` / `recalcSubeAggregates`
   üzerinden geçmeli (veya onları çağıran `upsertButce`/`upsertGoogleToplanlar` gibi
   mevcut helper'lar kullanılmalı). Doğrudan `docRef.set/update` yazma — şube
   dokümanındaki `donem_ozetleri` denormalizasyonu ve toplam aggregate'ler bozulur.
2. **Override semantiği:** `veri_overrides` YALNIZCA bütçe alanlarını tutar
   (`planlananButce`, `devredilenMiktar`, `merkezDestegi`). Otomatik çekilen metrikler
   (harcama, erişim, google_* ...) override'a asla yazılmaz — yazılırsa Meta/Google
   yeniden çekimi o değerleri tazeleyemez ("donmuş override" sorunu).
   `updateOverrides` alanı bütünüyle değiştirir; kısmi güncellemede mevcut bütçe
   alanlarını koruma sorumluluğu handler'dadır (routes.js'teki mevcut örneğe uy).
3. **Cache invalidation:** Rapor verisini değiştiren her endpoint sonrasında
   `invalidateReportCache(...)` + `invalidateCache('/reports')` çağır ve veri
   versiyonunu ilerlet (`bumpDataVersion` — `versionedCacheMiddleware` buna bakar).
   Bütçe tarafında ayrıca `butceDurumCache.clear()`.
4. **Firestore okuma maliyeti:** Okumalar para. Döngü içinde tekil `get` yapma —
   `db.getAll(...refs)` veya tek toplu sorgu kullan; mümkünse mevcut denormalize
   veriden (donem_ozetleri, konum listesi) oku. Tam koleksiyon taramasını yalnızca
   gerçekten gerekiyorsa yap.
5. **Auth:** Yönetim endpoint'leri `verifyToken` + `requirePermission('<izin>')`
   zinciriyle korunur (izin anahtarları `backend/shared/permissions.js`). Yeni endpoint
   eklerken bu ikisini atlama; şube sahibi rotalarında kullanıcının kendi şubesi
   dışına erişemediğini kontrol et.
6. **Konum verisi:** Şube konum/ad bilgisi tek `konumlar` dokümanında tutulur ve
   yalnızca `backend/shared/konum-store.js` (`upsertKonum`/`removeKonum`, transaction'lı)
   üzerinden yazılır. Doğrudan yazma, eşzamanlı güncellemede veri kaybettirir.
7. **Veritabanı kararı:** Firestore'da kalınıyor (SQL alternatifleri değerlendirildi,
   ertelendi). Yeni özellikte "SQL olsa kolaydı" durumunda şemayı denormalizasyonla çöz.

## Frontend konvansiyonları

- UI: shadcn/radix + Tailwind; ikonlar lucide-react; bildirimler sonner (toast).
- State: zustand + @tanstack/react-query; tarih işleri date-fns; grafikler recharts.
- API çağrıları modülün kendi hook/api katmanından geçer (ör. reports →
  `modules/reports/hooks/useReports.js` içindeki `reportsApi`); component içinde
  çıplak fetch yazma.
- Tek şubeyi etkileyen değişiklik sonrası tam dashboard yenileme yerine
  `refreshBranch(kod)` gibi hedefli yenileme kullan (read tasarrufu).

## Genel

- Kod yorumları, commit mesajları ve UI metinleri Türkçe; mevcut adlandırma stiline uy
  (Türkçe alan adları: `sube`, `donem`, `butce`...).
- Yapılacak işler / bilinen iyileştirmeler: `SONRAKI-DUZENLEMELER.md`.
- **Kod grafiği (graphify):** `graphify-out/graph.json` kod tabanının çağrı/ilişki
  grafiğini tutar (gitignore'da, lokal). Bir fonksiyonu değiştirmeden önce etki alanını
  görmek için `graphify explain "<fonksiyon>"` veya `graphify path "A" "B"` kullan.
  Büyük refactor sonrası `graphify update .` ile tazele.
