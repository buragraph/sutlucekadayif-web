# Faz 3 Parite Raporu (C2)

Koşum: 2026-08-03T06:41:02.342Z
api2  : `https://europe-west1-sutlucekadayif-web.cloudfunctions.net/api2/api`
worker: `https://sutlucekadayif-api.dijitalreklam.workers.dev/api`

**Sonuç: ✅ SIFIR AÇIKLANMAMIŞ FARK**

## Bilinçli sözleşme değişiklikleri (kullanıcı onaylı)

1. **PDF üretimi tarayıcıya taşındı.** `POST /reports/generate-pdf` ve
   `POST /reports/generate-pdf-bulk` KALDIRILDI (iki tarafta da 404). Panel
   `POST /reports/preview` HTML'ini alıp `@page` ile yazdırıyor; tasarım ve
   geometri birebir doğrulandı (MediaBox `0 0 360 1129.91992`).
2. **Toplu çıktı ZIP değil tek PDF.** N ayrı PDF yerine her raporu kendi
   boyutunda sayfa olarak taşıyan tek belge.

## 1. GET uçları

| Kimlik | Uç | HTTP (api2/worker) | ms (api2→worker) | Fark |
|---|---|---|---|---|
| admin | `GET /users` | 200/200 | 639→620 | 0 |
| admin | `GET /categories` | 200/200 | 461→119 | 0 |
| admin | `GET /branches` | 200/200 | 276→176 | 0 |
| admin | `GET /branches/konumlar` | 200/200 | 316→100 | 0 |
| admin | `GET /media` | 200/200 | 149→119 | 0 |
| admin | `GET /media/klasorler` | 200/200 | 153→119 | 0 |
| admin | `GET /profil` | 200/200 | 162→131 | 0 |
| admin | `GET /onboarding/status` | 200/200 | 109→74 | 0 |
| admin | `GET /basvurular` | 200/200 | 107→111 | 0 |
| admin | `GET /geribildirim` | 200/200 | 113→368 | 0 |
| admin | `GET /isbasvuru` | 200/200 | 104→168 | 0 |
| admin | `GET /menu/subeler` | 200/200 | 205→109 | 0 |
| admin | `GET /menu/cache-durumu` | 200/200 | 308→100 | 0 |
| admin | `GET /products` | 200/200 | 953→1046 | 0 |
| admin | `GET /products/katalog` | 200/200 | 139→426 | 0 |
| admin | `GET /products/trash` | 200/200 | 141→209 | 0 |
| admin | `GET /academy/courses` | 200/200 | 158→103 | 0 |
| admin | `GET /academy/courses/:id` | 200/200 | 135→125 | 0 |
| admin | `GET /academy/lessons/:courseId` | 200/200 | 105→109 | 0 |
| admin | `GET /academy/progress/:courseId` | 200/200 | 110→101 | 0 |
| admin | `GET /academy/progress/all/summary` | 200/200 | 103→106 | 0 |
| admin | `GET /academy/progress/admin/stats` | 200/200 | 221→193 | 0 |
| admin | `GET /reports/settings` | 200/200 | 96→104 | 0 |
| admin | `GET /reports/dashboard` | 200/200 | 345→191 | 0 |
| admin | `GET /reports/dashboard-bundle` | 200/200 | 296→173 | 0 |
| admin | `GET /reports/google-status` | 200/200 | 127→126 | 0 |
| admin | `GET /reports/meta-mappings` | 200/200 | 214→169 | 0 |
| admin | `GET /reports/google-mappings` | 200/200 | 111→120 | 0 |
| admin | `GET /reports/sube/:kod` | 200/200 | 132→108 | 0 |
| admin | `GET /reports/sube/:kod/donemler` | 200/200 | 113→171 | 0 |
| admin | `GET /reports/sube/:kod/not` | 200/200 | 104→102 | 0 |
| admin | `GET /reports/sube/:kod/donem/veriler` | 200/200 | 139→176 | 0 |
| admin | `GET /reports/butce-kampanya` | 200/200 | 127→107 | 0 |
| admin | `GET /reports/butce-kampanya/:id` | 200/200 | 291→184 | 0 |
| admin | `GET /reports/butce-durum` | 200/200 | 191→157 | 0 |
| admin | `GET /reports/butce-bekleyen` | 200/200 | 146→106 | 0 |
| sahip:denizli | `GET /users` | 200/200 | 276→125 | 0 |
| sahip:denizli | `GET /categories` | 200/200 | 98→415 | 0 |
| sahip:denizli | `GET /branches` | 200/200 | 120→107 | 0 |
| sahip:denizli | `GET /branches/konumlar` | 200/200 | 261→101 | 0 |
| sahip:denizli | `GET /media` | 403/403 | 65→81 | 0 |
| sahip:denizli | `GET /media/klasorler` | 403/403 | 309→80 | 0 |
| sahip:denizli | `GET /profil` | 200/200 | 134→182 | 0 |
| sahip:denizli | `GET /onboarding/status` | 200/200 | 104→104 | 0 |
| sahip:denizli | `GET /basvurular` | 403/403 | 82→79 | 0 |
| sahip:denizli | `GET /geribildirim` | 200/200 | 153→103 | 0 |
| sahip:denizli | `GET /isbasvuru` | 200/200 | 94→104 | 0 |
| sahip:denizli | `GET /menu/subeler` | 200/200 | 100→125 | 0 |
| sahip:denizli | `GET /menu/cache-durumu` | 403/403 | 65→76 | 0 |
| sahip:denizli | `GET /products` | 200/200 | 245→456 | 0 |
| sahip:denizli | `GET /products/katalog` | 200/200 | 359→645 | 0 |
| sahip:denizli | `GET /products/trash` | 200/200 | 135→127 | 0 |
| sahip:denizli | `GET /academy/courses` | 200/200 | 104→104 | 0 |
| sahip:denizli | `GET /academy/courses/:id` | 404/404 | 103→187 | 0 |
| sahip:denizli | `GET /academy/lessons/:courseId` | 404/404 | 97→98 | 0 |
| sahip:denizli | `GET /academy/progress/:courseId` | 200/200 | 324→118 | 0 |
| sahip:denizli | `GET /academy/progress/all/summary` | 200/200 | 94→111 | 0 |
| sahip:denizli | `GET /academy/progress/admin/stats` | 403/403 | 207→91 | 0 |
| sahip:denizli | `GET /reports/settings` | 403/403 | 66→84 | 0 |
| sahip:denizli | `GET /reports/dashboard` | 200/200 | 112→164 | 0 |
| sahip:denizli | `GET /reports/dashboard-bundle` | 200/200 | 120→107 | 0 |
| sahip:denizli | `GET /reports/google-status` | 403/403 | 68→77 | 0 |
| sahip:denizli | `GET /reports/meta-mappings` | 403/403 | 155→79 | 0 |
| sahip:denizli | `GET /reports/google-mappings` | 403/403 | 71→79 | 0 |
| sahip:denizli | `GET /reports/sube/:kod` | 200/200 | 107→187 | 0 |
| sahip:denizli | `GET /reports/sube/:kod/donemler` | 200/200 | 97→100 | 0 |
| sahip:denizli | `GET /reports/sube/:kod/not` | 403/403 | 65→78 | 0 |
| sahip:denizli | `GET /reports/sube/:kod/donem/veriler` | 200/200 | 182→123 | 0 |
| sahip:denizli | `GET /reports/butce-kampanya` | 403/403 | 65→77 | 0 |
| sahip:denizli | `GET /reports/butce-kampanya/:id` | 403/403 | 69→82 | 0 |
| sahip:denizli | `GET /reports/butce-durum` | 200/200 | 106→100 | 0 |
| sahip:denizli | `GET /reports/butce-bekleyen` | 200/200 | 99→105 | 0 |
| public | `GET /menu/:slug (public)` | 200/200 | 187→126 | 0 |
| public | `GET /menu/:slug (public)` | 200/200 | 148→180 | 0 |
| public | `GET /menu/:slug (public)` | 200/200 | 125→109 | 0 |

## 2. Yazma senaryoları (Worker)

| Senaryo | Sonuç | Not |
|---|---|---|
| ürün ekle (admin) 201 | ✅ | id=kMUdKRoGllcrrc2pCn82 |
| kalori 0 korundu | ✅ | kalori=0 |
| şube kendi ürününü görüyor | ✅ |  |
| yanıt projeksiyonu: merkez alanları yok | ✅ |  |
| availability kapatıldı | ✅ |  |
| fiyat override şube satırına yazıldı | ✅ |  |
| merkez fiyatı korundu | ✅ | merkez=111 |
| menü JSON etkin fiyatı gösteriyor | ✅ | fiyat=222 |
| NEGATİF: başka şubenin availability'si 403 | ✅ | kod=403 |
| test ürünü kalıcı silindi | ✅ |  |

## 3. Gecikme

75 istek çifti.

| Taban | Ortanca | p95 |
|---|---|---|
| api2 (Functions, europe-west1) | 127 ms | 359 ms |
| Worker (kenar) | 111 ms | 456 ms |

## 4. Bekçiler

| Bekçi | Durum | Kanıt |
|---|---|---|
| PDF uçları iki tarafta da yok | ✅ | tekil=404 toplu=404 |
| Token'sız istek 401 | ✅ | kod=401 |
| Şube sahibi yönetim ucunda 403 | ✅ | /media=403 |
| Şube kapsamı korunuyor | ✅ | 1/1 |

---

*`scripts/parite/faz3.mjs` tarafından üretildi.*