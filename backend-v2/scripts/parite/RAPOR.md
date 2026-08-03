# Parite Raporu (G9)

Koşum: 2026-08-01T12:41:14.441Z
Eski API: `https://api-fyfp72cohq-uc.a.run.app/api`
Yeni API: `https://europe-west1-sutlucekadayif-web.cloudfunctions.net/api2/api`

**Sonuç: ✅ SIFIR AÇIKLANMAMIŞ FARK**

## 1. GET uçları

151 istek (4 kimlik + public).

| Kimlik | Uç | HTTP | Fark | Açıklanmış |
|---|---|---|---|---|
| admin | `GET /users` | 200/200 | 0 | — |
| admin | `GET /categories` | 200/200 | 0 | 1 |
| admin | `GET /branches` | 200/200 | 0 | 672 |
| admin | `GET /branches/konumlar` | 200/200 | 0 | — |
| admin | `GET /media` | 200/200 | 0 | — |
| admin | `GET /media?q=` | 200/200 | 0 | — |
| admin | `GET /media/klasorler` | 200/200 | 0 | — |
| admin | `GET /profil` | 200/200 | 0 | — |
| admin | `GET /onboarding/status` | 200/200 | 0 | — |
| admin | `GET /basvurular` | 200/200 | 0 | — |
| admin | `GET /geribildirim` | 200/200 | 0 | — |
| admin | `GET /isbasvuru` | 200/200 | 0 | — |
| admin | `GET /menu/subeler` | 200/200 | 0 | — |
| admin | `GET /menu/cache-durumu` | 200/200 | 0 | — |
| admin | `GET /products` | 200/200 | 0 | 1 |
| admin | `GET /products/katalog` | 200/200 | 0 | — |
| admin | `GET /products/trash` | 200/200 | 0 | — |
| admin | `GET /academy/courses` | 200/200 | 0 | — |
| admin | `GET /academy/courses/:id` | 200/200 | 0 | — |
| admin | `GET /academy/lessons/:courseId` | 200/200 | 0 | — |
| admin | `GET /academy/progress/:courseId` | 200/200 | 0 | — |
| admin | `GET /academy/progress/all/summary` | 200/200 | 0 | — |
| admin | `GET /academy/progress/admin/stats` | 200/200 | 0 | 1 |
| admin | `GET /reports/settings` | 200/200 | 0 | — |
| admin | `GET /reports/dashboard` | 200/200 | 0 | 263 |
| admin | `GET /reports/dashboard-bundle` | 200/200 | 0 | — |
| admin | `GET /reports/google-status` | 200/200 | 0 | — |
| admin | `GET /reports/meta-mappings` | 200/200 | 0 | — |
| admin | `GET /reports/google-mappings` | 200/200 | 0 | — |
| admin | `GET /reports/sube/:kod` | 200/200 | 0 | — |
| admin | `GET /reports/sube/:kod/donemler` | 200/200 | 0 | — |
| admin | `GET /reports/sube/:kod/not` | 200/200 | 0 | — |
| admin | `GET /reports/sube/:kod/donem/veriler` | 200/200 | 0 | 2 |
| admin | `GET /reports/butce-kampanya` | 200/200 | 0 | — |
| admin | `GET /reports/butce-kampanya/:id` | 200/200 | 0 | 1 |
| admin | `GET /reports/butce-durum` | 200/200 | 0 | — |
| admin | `GET /reports/butce-bekleyen` | 200/200 | 0 | — |
| sahip:denizli | `GET /users` | 200/200 | 0 | — |
| sahip:denizli | `GET /categories` | 200/200 | 0 | 1 |
| sahip:denizli | `GET /branches` | 200/200 | 0 | 8 |
| sahip:denizli | `GET /branches/konumlar` | 200/200 | 0 | — |
| sahip:denizli | `GET /media` | 403/403 | 0 | — |
| sahip:denizli | `GET /media?q=` | 403/403 | 0 | — |
| sahip:denizli | `GET /media/klasorler` | 403/403 | 0 | — |
| sahip:denizli | `GET /profil` | 200/200 | 0 | — |
| sahip:denizli | `GET /onboarding/status` | 200/200 | 0 | — |
| sahip:denizli | `GET /basvurular` | 403/403 | 0 | — |
| sahip:denizli | `GET /geribildirim` | 200/200 | 0 | — |
| sahip:denizli | `GET /isbasvuru` | 200/200 | 0 | — |
| sahip:denizli | `GET /menu/subeler` | 200/200 | 0 | — |
| sahip:denizli | `GET /menu/cache-durumu` | 403/403 | 0 | — |
| sahip:denizli | `GET /products` | 200/200 | 0 | — |
| sahip:denizli | `GET /products/katalog` | 200/200 | 0 | — |
| sahip:denizli | `GET /products/trash` | 200/200 | 0 | — |
| sahip:denizli | `GET /academy/courses` | 200/200 | 0 | — |
| sahip:denizli | `GET /academy/courses/:id` | 404/404 | 0 | — |
| sahip:denizli | `GET /academy/lessons/:courseId` | 404/404 | 0 | — |
| sahip:denizli | `GET /academy/progress/:courseId` | 200/200 | 0 | — |
| sahip:denizli | `GET /academy/progress/all/summary` | 200/200 | 0 | — |
| sahip:denizli | `GET /academy/progress/admin/stats` | 403/403 | 0 | — |
| sahip:denizli | `GET /reports/settings` | 403/403 | 0 | — |
| sahip:denizli | `GET /reports/dashboard` | 200/200 | 0 | 5 |
| sahip:denizli | `GET /reports/dashboard-bundle` | 200/200 | 0 | 5 |
| sahip:denizli | `GET /reports/google-status` | 403/403 | 0 | — |
| sahip:denizli | `GET /reports/meta-mappings` | 403/403 | 0 | — |
| sahip:denizli | `GET /reports/google-mappings` | 403/403 | 0 | — |
| sahip:denizli | `GET /reports/sube/:kod` | 200/200 | 0 | 5 |
| sahip:denizli | `GET /reports/sube/:kod/donemler` | 200/200 | 0 | 1 |
| sahip:denizli | `GET /reports/sube/:kod/not` | 403/403 | 0 | — |
| sahip:denizli | `GET /reports/sube/:kod/donem/veriler` | 403/403 | 0 | — |
| sahip:denizli | `GET /reports/butce-kampanya` | 403/403 | 0 | — |
| sahip:denizli | `GET /reports/butce-kampanya/:id` | 403/403 | 0 | — |
| sahip:denizli | `GET /reports/butce-durum` | 200/200 | 0 | — |
| sahip:denizli | `GET /reports/butce-bekleyen` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /users` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /categories` | 200/200 | 0 | 1 |
| sahip:adiyaman | `GET /branches` | 200/200 | 0 | 8 |
| sahip:adiyaman | `GET /branches/konumlar` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /media` | 403/403 | 0 | — |
| sahip:adiyaman | `GET /media?q=` | 403/403 | 0 | — |
| sahip:adiyaman | `GET /media/klasorler` | 403/403 | 0 | — |
| sahip:adiyaman | `GET /profil` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /onboarding/status` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /basvurular` | 403/403 | 0 | — |
| sahip:adiyaman | `GET /geribildirim` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /isbasvuru` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /menu/subeler` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /menu/cache-durumu` | 403/403 | 0 | — |
| sahip:adiyaman | `GET /products` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /products/katalog` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /products/trash` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /academy/courses` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /academy/courses/:id` | 404/404 | 0 | — |
| sahip:adiyaman | `GET /academy/lessons/:courseId` | 404/404 | 0 | — |
| sahip:adiyaman | `GET /academy/progress/:courseId` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /academy/progress/all/summary` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /academy/progress/admin/stats` | 403/403 | 0 | — |
| sahip:adiyaman | `GET /reports/settings` | 403/403 | 0 | — |
| sahip:adiyaman | `GET /reports/dashboard` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /reports/dashboard-bundle` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /reports/google-status` | 403/403 | 0 | — |
| sahip:adiyaman | `GET /reports/meta-mappings` | 403/403 | 0 | — |
| sahip:adiyaman | `GET /reports/google-mappings` | 403/403 | 0 | — |
| sahip:adiyaman | `GET /reports/sube/:kod` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /reports/sube/:kod/donemler` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /reports/sube/:kod/not` | 403/403 | 0 | — |
| sahip:adiyaman | `GET /reports/sube/:kod/donem/veriler` | 200/200 | 0 | 2 |
| sahip:adiyaman | `GET /reports/butce-kampanya` | 403/403 | 0 | — |
| sahip:adiyaman | `GET /reports/butce-kampanya/:id` | 403/403 | 0 | — |
| sahip:adiyaman | `GET /reports/butce-durum` | 200/200 | 0 | — |
| sahip:adiyaman | `GET /reports/butce-bekleyen` | 200/200 | 0 | — |
| sahip:aksaray | `GET /users` | 200/200 | 0 | — |
| sahip:aksaray | `GET /categories` | 200/200 | 0 | 1 |
| sahip:aksaray | `GET /branches` | 200/200 | 0 | 8 |
| sahip:aksaray | `GET /branches/konumlar` | 200/200 | 0 | — |
| sahip:aksaray | `GET /media` | 403/403 | 0 | — |
| sahip:aksaray | `GET /media?q=` | 403/403 | 0 | — |
| sahip:aksaray | `GET /media/klasorler` | 403/403 | 0 | — |
| sahip:aksaray | `GET /profil` | 200/200 | 0 | — |
| sahip:aksaray | `GET /onboarding/status` | 200/200 | 0 | — |
| sahip:aksaray | `GET /basvurular` | 403/403 | 0 | — |
| sahip:aksaray | `GET /geribildirim` | 200/200 | 0 | — |
| sahip:aksaray | `GET /isbasvuru` | 200/200 | 0 | — |
| sahip:aksaray | `GET /menu/subeler` | 200/200 | 0 | — |
| sahip:aksaray | `GET /menu/cache-durumu` | 403/403 | 0 | — |
| sahip:aksaray | `GET /products` | 200/200 | 0 | — |
| sahip:aksaray | `GET /products/katalog` | 200/200 | 0 | — |
| sahip:aksaray | `GET /products/trash` | 200/200 | 0 | — |
| sahip:aksaray | `GET /academy/courses` | 200/200 | 0 | — |
| sahip:aksaray | `GET /academy/courses/:id` | 404/404 | 0 | — |
| sahip:aksaray | `GET /academy/lessons/:courseId` | 404/404 | 0 | — |
| sahip:aksaray | `GET /academy/progress/:courseId` | 200/200 | 0 | — |
| sahip:aksaray | `GET /academy/progress/all/summary` | 200/200 | 0 | — |
| sahip:aksaray | `GET /academy/progress/admin/stats` | 403/403 | 0 | — |
| sahip:aksaray | `GET /reports/settings` | 403/403 | 0 | — |
| sahip:aksaray | `GET /reports/dashboard` | 200/200 | 0 | — |
| sahip:aksaray | `GET /reports/dashboard-bundle` | 200/200 | 0 | — |
| sahip:aksaray | `GET /reports/google-status` | 403/403 | 0 | — |
| sahip:aksaray | `GET /reports/meta-mappings` | 403/403 | 0 | — |
| sahip:aksaray | `GET /reports/google-mappings` | 403/403 | 0 | — |
| sahip:aksaray | `GET /reports/sube/:kod` | 200/200 | 0 | — |
| sahip:aksaray | `GET /reports/sube/:kod/donemler` | 200/200 | 0 | — |
| sahip:aksaray | `GET /reports/sube/:kod/not` | 403/403 | 0 | — |
| sahip:aksaray | `GET /reports/sube/:kod/donem/veriler` | 403/403 | 0 | — |
| sahip:aksaray | `GET /reports/butce-kampanya` | 403/403 | 0 | — |
| sahip:aksaray | `GET /reports/butce-kampanya/:id` | 403/403 | 0 | — |
| sahip:aksaray | `GET /reports/butce-durum` | 200/200 | 0 | — |
| sahip:aksaray | `GET /reports/butce-bekleyen` | 200/200 | 0 | — |
| public | `GET /menu/:slug (public)` | 200/200 | 0 | 14 |
| public | `GET /menu/:slug (public)` | 200/200 | 0 | 14 |
| public | `GET /menu/:slug (public)` | 200/200 | 0 | 14 |

### Açıklanmış farklar (gerekçeleriyle)

- **46 alan** — kategori sayacı artık canlı hesaplanıyor (denormalize sayaç bayattı)
- **974 alan** — eski denormalize toplam bayat / override görmüyor (32 şube)
- **1 alan** — Firestore'da 1 üründe alan hiç yok (536/537'de var); v2 ortak üründe her zaman boş harita döndürür — anlamca aynı
- **1 alan** — boş ilerleme dokümanı olan admin listede sayılmıyor
- **4 alan** — override artık bütçe kolonlarından okunuyor
- **1 alan** — önceki dönem kalanı bayat toplamdan türüyordu
- **1 alan** — donem_ozetleri bayat — alt koleksiyonda daha çok dönem var

## 2. Yazma senaryoları

| Senaryo | Sonuç | Not |
|---|---|---|
| ürün ekle (admin) 201 | ✅ | id=BEVLneFj5jSzyJIoHXiy |
| kalori 0 korundu (0 "boş" değil) | ✅ | kalori=0 |
| şube kendi menüsündeki ürünü görüyor | ✅ |  |
| yanıt projeksiyonu: merkez alanları yok | ✅ |  |
| menüden çıkar (şube sahibi) | ✅ |  |
| menüden çıkınca katalogda beliriyor | ✅ |  |
| NEGATİF: şube başka şubenin menüsünü değiştiremedi | ✅ | gövdedeki subeSlug yok sayıldı (kod 200) |
| availability kapatıldı | ✅ |  |
| NEGATİF: başka şubenin availability'si 403 | ✅ | kod=403 |
| fiyat override şube satırına yazıldı | ✅ |  |
| merkez fiyatı korundu | ✅ | merkez=111 |
| NEGATİF: izinsiz şube fiyat değiştiremedi | ✅ | kod=403 |
| ürün düzenle (admin) | ✅ |  |
| menü JSON etkin fiyatı gösteriyor | ✅ | fiyat=222 |
| menü JSON kalori taşıyor | ✅ | kalori=0 |
| bütçe girişi yazıldı | ✅ |  |
| bütçe girişi metrikleri bozmadı | ✅ | harcama=10779.949999999997 |
| NEGATİF: şube sahibi bütçe yazamadı | ✅ | kod=403 |
| bütçe eski değerine döndürüldü | ✅ |  |
| test ürünü kalıcı silindi | ✅ |  |

## 3. Menü JSON pariteleri

88 şube `menu-v2/` önekine üretildi ve `menu/` ile karşılaştırıldı.

- Birebir aynı: **88**
- Farklı: **0**
- Okunamayan: **0**

## 4. Bekçi listesi (plan §5)

| Bekçi | Durum | Kanıt |
|---|---|---|
| Müşteri projeksiyonu whitelist | ✅ geçti | 88 menü JSON'unda yönetim alanı/PII yok |
| Rol bazlı yanıt projeksiyonu | ✅ geçti | liste/katalog/çöp + menü JSON kontrol edildi |
| Katalog kural sırası (gizli→menude→mevcut_degil→override) | ✅ geçti | tek WHERE + menüden çıkar/ekle + availability testleri |
| Override semantiği (çekim bütçeye dokunmaz) | ✅ geçti | kolon ayrımı + rapor-diff.mjs 10 iddia |
| İzin dosyası ikizliği | ✅ geçti | shared/ ↔ backend-v2/shared/ birebir aynı |
| CORS → rate limiter sırası | ✅ geçti | cors@2145 < limiter@4297 |
| req.user şekli sabit | ✅ geçti | { uid, email, role, subeSlug } |
| UID remap bütünlüğü (Faz 2) | ⏳ açık | Faz 2 işi — bu kapının kapsamı dışında |
| 0 değeri "boş" değildir | ✅ geçti | kalori 0 hem yazımda hem menü JSON'unda korundu |
| Route sırası (statik yollar /:id'den önce) | ✅ geçti | /katalog, /cache-durumu, /reorder |
| Cron tek-aktif | ✅ geçti | v2 CRON_AKTIF=false (eski cron çalışıyor) |
| GRACE_DAYS penceresi | ✅ geçti | scheduled-fetch.js GRACE_DAYS = 7 (Meta token yenileme ayrı açık iş) |
| Şube sahibi kendi şubesi dışına yazamaz | ✅ geçti | 4/4 negatif test geçti |

---

*Bu rapor `scripts/parite/calistir.mjs` tarafından üretildi.*