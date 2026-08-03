# Faz 2 Doğrulama Kapısı (B4)

Koşum: 2026-08-01T16:02:48.175Z
Taban: `https://europe-west1-sutlucekadayif-web.cloudfunctions.net/api2/api`

Kimlik sağlayıcı değişti, veri değişmedi. Bu yüzden karşılaştırma **eski API ile değil**, aynı sunucuya iki farklı token (yeni Supabase access token'ı ve Faz 1'in Firebase ID token'ı) ile sorularak yapıldı.

**Sonuç: ✅ SIFIR FARK**

## 1. GET uçları

72 istek çifti (2 kimlik × 36 uç).

| Kimlik | Uç | HTTP (fb/sb) | Fark |
|---|---|---|---|
| admin | `GET /users` | 200/200 | 0 |
| admin | `GET /categories` | 200/200 | 0 |
| admin | `GET /branches` | 200/200 | 0 |
| admin | `GET /branches/konumlar` | 200/200 | 0 |
| admin | `GET /media` | 200/200 | 0 |
| admin | `GET /media/klasorler` | 200/200 | 0 |
| admin | `GET /profil` | 200/200 | 0 |
| admin | `GET /onboarding/status` | 200/200 | 0 |
| admin | `GET /basvurular` | 200/200 | 0 |
| admin | `GET /geribildirim` | 200/200 | 0 |
| admin | `GET /isbasvuru` | 200/200 | 0 |
| admin | `GET /menu/subeler` | 200/200 | 0 |
| admin | `GET /menu/cache-durumu` | 200/200 | 0 |
| admin | `GET /products` | 200/200 | 0 |
| admin | `GET /products/katalog` | 200/200 | 0 |
| admin | `GET /products/trash` | 200/200 | 0 |
| admin | `GET /academy/courses` | 200/200 | 0 |
| admin | `GET /academy/courses/:id` | 200/200 | 0 |
| admin | `GET /academy/lessons/:courseId` | 200/200 | 0 |
| admin | `GET /academy/progress/:courseId` | 200/200 | 0 |
| admin | `GET /academy/progress/all/summary` | 200/200 | 0 |
| admin | `GET /academy/progress/admin/stats` | 200/200 | 0 |
| admin | `GET /reports/settings` | 200/200 | 0 |
| admin | `GET /reports/dashboard` | 200/200 | 0 |
| admin | `GET /reports/dashboard-bundle` | 200/200 | 0 |
| admin | `GET /reports/google-status` | 200/200 | 0 |
| admin | `GET /reports/meta-mappings` | 200/200 | 0 |
| admin | `GET /reports/google-mappings` | 200/200 | 0 |
| admin | `GET /reports/sube/:kod` | 200/200 | 0 |
| admin | `GET /reports/sube/:kod/donemler` | 200/200 | 0 |
| admin | `GET /reports/sube/:kod/not` | 200/200 | 0 |
| admin | `GET /reports/sube/:kod/donem/veriler` | 200/200 | 0 |
| admin | `GET /reports/butce-kampanya` | 200/200 | 0 |
| admin | `GET /reports/butce-kampanya/:id` | 200/200 | 0 |
| admin | `GET /reports/butce-durum` | 200/200 | 0 |
| admin | `GET /reports/butce-bekleyen` | 200/200 | 0 |
| sahip:denizli | `GET /users` | 200/200 | 0 |
| sahip:denizli | `GET /categories` | 200/200 | 0 |
| sahip:denizli | `GET /branches` | 200/200 | 0 |
| sahip:denizli | `GET /branches/konumlar` | 200/200 | 0 |
| sahip:denizli | `GET /media` | 403/403 | 0 |
| sahip:denizli | `GET /media/klasorler` | 403/403 | 0 |
| sahip:denizli | `GET /profil` | 200/200 | 0 |
| sahip:denizli | `GET /onboarding/status` | 200/200 | 0 |
| sahip:denizli | `GET /basvurular` | 403/403 | 0 |
| sahip:denizli | `GET /geribildirim` | 200/200 | 0 |
| sahip:denizli | `GET /isbasvuru` | 200/200 | 0 |
| sahip:denizli | `GET /menu/subeler` | 200/200 | 0 |
| sahip:denizli | `GET /menu/cache-durumu` | 403/403 | 0 |
| sahip:denizli | `GET /products` | 200/200 | 0 |
| sahip:denizli | `GET /products/katalog` | 200/200 | 0 |
| sahip:denizli | `GET /products/trash` | 200/200 | 0 |
| sahip:denizli | `GET /academy/courses` | 200/200 | 0 |
| sahip:denizli | `GET /academy/courses/:id` | 404/404 | 0 |
| sahip:denizli | `GET /academy/lessons/:courseId` | 404/404 | 0 |
| sahip:denizli | `GET /academy/progress/:courseId` | 200/200 | 0 |
| sahip:denizli | `GET /academy/progress/all/summary` | 200/200 | 0 |
| sahip:denizli | `GET /academy/progress/admin/stats` | 403/403 | 0 |
| sahip:denizli | `GET /reports/settings` | 403/403 | 0 |
| sahip:denizli | `GET /reports/dashboard` | 200/200 | 0 |
| sahip:denizli | `GET /reports/dashboard-bundle` | 200/200 | 0 |
| sahip:denizli | `GET /reports/google-status` | 403/403 | 0 |
| sahip:denizli | `GET /reports/meta-mappings` | 403/403 | 0 |
| sahip:denizli | `GET /reports/google-mappings` | 403/403 | 0 |
| sahip:denizli | `GET /reports/sube/:kod` | 200/200 | 0 |
| sahip:denizli | `GET /reports/sube/:kod/donemler` | 200/200 | 0 |
| sahip:denizli | `GET /reports/sube/:kod/not` | 403/403 | 0 |
| sahip:denizli | `GET /reports/sube/:kod/donem/veriler` | 200/200 | 0 |
| sahip:denizli | `GET /reports/butce-kampanya` | 403/403 | 0 |
| sahip:denizli | `GET /reports/butce-kampanya/:id` | 403/403 | 0 |
| sahip:denizli | `GET /reports/butce-durum` | 200/200 | 0 |
| sahip:denizli | `GET /reports/butce-bekleyen` | 200/200 | 0 |

## 2. Bekçi listesi

| Bekçi | Durum | Kanıt |
|---|---|---|
| req.user şekli sabit (iki dalda da) | ✅ geçti | /profil her iki token'la da doğru hesabı döndürdü |
| UID remap bütünlüğü | ✅ geçti | eski-format uid: 0, Auth'ta karşılığı olmayan kullanici_sube satırı: 0 |
| uid_eslesme tutarlı | ✅ geçti | 5 eşleme, hepsinin Supabase karşılığı var |
| Şube sahibi kapsamı (rapor paketi) | ✅ geçti | yalnız denizli |
| Rol bazlı yanıt projeksiyonu | ✅ geçti | merkez alanları yok |
| Şube sahibi yönetim uçlarına giremiyor | ✅ geçti | GET /media=403, GET /reports/settings=403, GET /academy/progress/admin/stats=403, PUT /users/<admin>=403 |
| Token'sız istek 401 | ✅ geçti | kod=401 |
| Firebase dalı ayakta (rollback sigortası) | ✅ geçti | her uçta eski token yeni token ile aynı HTTP kodunu aldı |
| Yeni hayalet Firebase hesabı yok | ✅ geçti | Firebase hesap: 6, e-postasız: 1 (Faz 1'den kalan 1 tanesi bekleniyor) |
| İzin dosyası ikizliği | ✅ geçti | shared/ ↔ backend-v2/shared/ birebir aynı |
| Frontend Firebase'den ayrıldı | ✅ geçti | firebase paketi: yok, supabase-js: ^2.111.0 |

---

*Bu rapor `scripts/parite/faz2.mjs` tarafından üretildi.*