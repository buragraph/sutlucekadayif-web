# Supabase Geçişi — Uygulama Görevleri (Faz 1)

> **Bu dosya uygulayıcı oturum içindir.** Strateji ve gerekçeler
> `SUPABASE-GECIS-PLANI.md`'de; oraya yalnızca bekçi listesi (§5) ve tereddüt
> anında bakılır. Bu dosyadaki şema ve alan listeleri **canlı Firestore'dan
> 2026-08-01'de çıkarıldı** — kod tabanını yeniden keşfetmeye gerek YOK.

## Çalışma kuralları (token ekonomisi dahil)

1. **Sadece taşıdığın rotanın dosyasını oku.** Rota rota ilerle: eski dosya
   (`backend/...`) → yeni dosya (`backend-v2/...`). Kod tabanında serbest
   keşif yapma; bu dosyada olmayan bir bilgi gerekirse önce buraya ve plana bak.
2. Firestore erişimi: `cd backend && GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node <script>`.
   Geçici scriptler `_tmp-*.mjs`, iş bitince silinir.
3. Supabase erişimi: bağlı Supabase MCP (`list_projects`, `apply_migration`,
   `execute_sql`) ya da `backend-v2/config/supabase.js` üzerinden.
4. **API sözleşmesi bire bir korunur** — yol, JSON şekli, hata kodu. Alan adı
   "düzeltme" yok (akademi alanları İngilizce kalır: `title`, `orderIndex`...).
5. Her görevin sonunda "Doğrula" bloğu koşulur; geçmeden sonraki göreve geçilmez.
6. Uzun çıktıları özetle; tam dökümleri dosyaya yaz, sohbete yapıştırma.
7. `backend/` (eski) Faz 1 boyunca SALT OKUNUR — tek istisna zaten planlı
   olan işler (Meta token yenileme gibi) ve onlar bu görev setinin dışında.

## Sabit bağlam

- Veri hacmi: 88 şube · 874 dönem · 537 ürün · 14 kategori · 287 medya ·
  7 kurs + 86 ders · 5 kullanıcı — tam import saniyeler sürer.
- Eski API: `https://api-fyfp72cohq-uc.a.run.app/api` (Functions, us-central1).
- Frontend: Cloudflare Worker `sutlucekadayif-cms` (assets); `VITE_API_URL` ile
  API seçer. R2 menü JSON'ları: `menu/{subeSlug}.json`.
- Parite testi için token üretimi kalıbı: `auth.createCustomToken(uid, claims)`
  → `identitytoolkit signInWithCustomToken` (API key frontend `.env`'de).
  Şube sahibi örneği: `denizli`.

---

## G1 — Supabase projesi + iskelet

**Yap:**
- Supabase MCP ile proje aç: bölge `eu-central-1` (Frankfurt). Kullanıcıdan
  org seçimi/onay iste. PLAN KARARI (2026-08-01 güncellendi): **free planda
  kalınıyor**, Pro alınmayacak — yedek boşluğunu G8'deki gece pg_dump kapatır;
  sistem her gün kullanıldığı için uyuma koşulu oluşmaz.
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` → `backend-v2/.env` (gitignore'a
  `backend-v2/.env` ekle) ve Functions secret'ına (A4'te lazım).
- `backend-v2/` iskeleti: `config/supabase.js` (createClient, service_role,
  `{ auth: { persistSession: false } }`), `server.js` (eski `backend/server.js`
  kopyası — CORS→limiter sırası AYNEN), `middleware/` (auth.js dokunulmadan
  kopya), boş modül klasörleri. `GET /api/health` ucu ekle.

**Doğrula:** `node backend-v2/server.js` lokalde 200 sağlık yanıtı; Supabase'e
`select 1` gidiyor.

## G2 — Şema migration'ı

**Yap:** `supabase/migrations/0001_temel.sql` — plandaki §3 DDL'i, aşağıdaki
GERÇEK alan düzeltmeleriyle:

- `subeler`e ek kolonlar: `telefon text`. (`donem_ozetleri`, `toplam_*`,
  `son_donem`, `donem_sayisi` TAŞINMAZ — view'lardan gelecek.)
- **`donemler` kesin metrik kolonları** (canlıdan çıkarılan süperset; tüm
  alan setleri bunun alt kümesi, eksikler null):
  - Meta: `harcama, erisim, gosterim, tiklama, tiklama_tumu, mesaj, paylasim,
    sonuc, yorum` (numeric)
  - Google: `google_arama, google_harita, google_menu_tiklama, google_telefon,
    google_web_tiklama, google_yol_tarifi` (numeric)
  - Bütçe (elle): `planlanan_butce, devredilen_miktar, merkez_destegi` (numeric)
  - `baslangic date, bitis date` (kaynak: `donem_baslangic`/`donem_bitis` ISO
    string), `guncelleme timestamptz` (kaynak: `updatedAt`)
- `kampanyalar` gerçek alanlar: `id text pk, baslik text, donem_baslangic date,
  donem_bitis date, durum text, alici_adi text, iban text, odeme_notu text,
  son_tarih date, bakiye_secenekleri jsonb, yanitlar jsonb, olusturma timestamptz`.
  (`yanitlar` şube-anahtarlı obje — ilk geçişte jsonb, normalize ETME.)
- Eşleme dokümanları (adset_mappings 636 anahtar / campaign_mappings 46 /
  google_mappings 78 / meta_mappings 3) tek tabloya:
  `eslesmeler (tur text, anahtar text, deger jsonb, primary key (tur, anahtar))`
  — tur ∈ `adset|campaign|google|meta`.
- `ayarlar (anahtar text pk, deger jsonb, guncelleme timestamptz)` — şunlar
  buraya taşınır: `menu_cache`, `settings` (metaApiToken, googleClientId/Secret/
  RedirectUri), `google_token`. `qr_menu_version` ve `adsets_cache` TAŞINMAZ
  (Postgres'te gereksiz).
- Akademi — İngilizce alanlar AYNEN (API sözleşmesi):
  `kurslar(id text pk, title, description, thumbnail_url, is_published boolean,
  order_index int, target_roles text[], target_subeler text[], olusturma, guncelleme)`;
  `dersler(id text pk, kurs_id ref cascade, title, description, lesson_type,
  video_url, pdf_url, order_index int, passing_score numeric, questions jsonb, olusturma)`.
  DİKKAT: JS tarafı camelCase bekler (`orderIndex`) — dönüşüm `backend-v2`
  veri katmanında tek yardımcıda yapılır, rota gövdelerinde değil.
- `kullanici_sube(uid text pk, role text, sube_slug text references subeler(kod))`.
- `medya(id text pk, url text, klasor text, ad text, boyut int, arama text[],
  olusturma timestamptz)` — kaynak `createdAt` Firestore **Timestamp** (ISO
  değil!), import `toDate()` ile çevirir.
- `urunler`, `urun_sube`, `kategoriler`: plandaki gibi.
- HER tabloda `enable row level security` (policy yok = deny-all).

**Uygulandı (2026-08-01) — listeye göre farklar** (canlı tarama sonucu):
- `subeler`e ayrıca: `fatura_adresi, sirket_tipi, vkn, yetkili_adi, lat, lng`
  (19–20 şubede dolu; onboarding ekranı yazıyor).
- `kullanici_sube`ye ayrıca: `telefon, onboarded, onboarded_at`.
- `kategoriler.urunSayisi` TAŞINMADI — G5'te sorguyla sayılır.
- Dönem id'si `{baslangic}_{bitis}` biçiminde deterministik; ayrı kolon yok,
  rota id'yi iki tarihe ayırıp unique anahtardan bulur.
- Ayrı dosya `0003_formlar.sql`: `franchise_basvurulari`, `geri_bildirimler`,
  `is_basvurulari`, `sube_notlari` (görev listesinde yoktu; rotaları canlı).
  API'deki `not` alanı kolonlarda `admin_notu`/`notu` — `not` Postgres'te
  ayrılmış sözcük; dönüşüm veri katmanındaki yardımcıda.
- `0000_saglik.sql`: `/api/health` için `saglik()` fonksiyonu (search_path sabit).

**Doğrula:** MCP `apply_migration` temiz; `list_tables` beklenen tablo setini
gösteriyor.

## G3 — İlerleme (progress) koleksiyonunun adını teyit et

Tek istisna keşif: akademi ilerleme kayıtlarının koleksiyon yolu bu dosyada
yok. `grep -rn "progress\|ilerleme" backend/modules/academy/routes/progress.js
| head -20` ile koleksiyon adını ve alanlarını çıkar, `dersler` kalıbıyla
tabloyu `0002_ilerleme.sql` olarak ekle (uid + ders/kurs referansı + tamamlanma).

**Sonuç (2026-08-01):** kayıt yolu `academy_progress/{uid}/completedLessons/{lessonId}`
→ `{ courseId, completedAt, score? }`; canlıda 4 kayıt.
`ilerleme(uid, ders_id, kurs_id, score, completed_at)` olarak uygulandı.
Üst dokümandaki `byCourse/totalCompleted/lastActivity/statsMigrated` sayaç
cache'i TAŞINMADI — `ilerleme_ozeti` view'ı + group by yerini alıyor.

## G4 — Import scriptleri

**Yap:** `scripts/supabase-import/` — koleksiyon başına bir `*.mjs`, hepsi
**upsert** (tekrar çalıştırılabilir), hepsi sonunda satır sayısı raporlar.
Sıra: subeler → kategoriler → urunler+urun_sube → donemler → kampanyalar →
eslesmeler → ayarlar → akademi → kullanici_sube → medya.

Kurallar:
- Firestore doküman id'si = `id` kolonu (text, AYNEN).
- `deletedAt` taşınır → `silinme` (ürünlerde 28 soft-delete kaydı var).
- Ürün dizileri → `urun_sube` satırları: `menude_subeler` üyeliği `menude=true`;
  `gizli_subeler` → `gizli=true`; `mevcut_degil` → `mevcut_degil=true`;
  `fiyat_override[sube]` → kolon; `fiyat_serbest` → boolean. Bir şube birden
  çok dizide geçebilir → satır birleştirilir (tek upsert).
- **Dönem alan önceliği (2026-08-01'de DÜZELTİLDİ):** hem bütçe hem metrik
  kolonları `veri_overrides` varsa ORADAN, yoksa top-level alandan.
  Gerekçe: eski okuma yolu (`report-data.js:58`) metrikleri de override'dan
  okuyor — canlıda 238 dönemde metrik override'ı var, 243 alan top-level'dan
  farklı (ör. ankara_dikmen erişim 124.174 vs 1.516.364) ve 186 alanın
  top-level karşılığı hiç yok. "Metrikler top-level'dan" kuralı uygulansaydı
  panelde görünen geçmiş rakamlar değişir, G9 parite kapısı fark verirdi.
  Override kavramı yine ölüyor: import sonrası kolon tek doğru kaynak, sonraki
  çekimler onu serbestçe tazeliyor.
  Anahtar eşlemesi: `toplamHarcama→harcama, toplamErisim→erisim,
  toplamGosterim→gosterim, toplamSonuc→sonuc, toplamTiklama→tiklama,
  toplamTiklamaTumu→tiklama_tumu, toplamMesaj→mesaj, toplamYorum→yorum,
  toplamPaylasim→paylasim, googleArama→google_arama, googleHarita→google_harita,
  googleTelefon→google_telefon, googleYolTarifi→google_yol_tarifi,
  googleWebTiklama→google_web_tiklama, googleMenuTiklama→google_menu_tiklama,
  planlananButce→planlanan_butce, devredilenMiktar→devredilen_miktar,
  merkezDestegi→merkez_destegi`.
- Formlar + şube notları da import edilir: `franchise_basvurulari` (1 kayıt),
  `sube_notlari` (4 kayıt); `geri_bildirimler`/`is_basvurulari` henüz boş.
- `konumlar` dokümanı import EDİLMEZ (il/ilçe zaten şube dokümanında değilse
  `reports/konumlar.liste`'den şubeye eşlenir — kontrol et, gerekirse buradan doldur).

**Doğrula:** `scripts/supabase-import/dogrula.mjs` — iki taraftan: satır/doküman
sayıları eşit; `sum(harcama)`, `sum(erisim)` donemler'de eşit; rastgele 5 ürün
alan alan eşit; `urun_sube` toplam satırı = dizilerin tekilleştirilmiş üye
sayısı. Rapor sıfır farkla bitmeli.

**Uygulandı (2026-08-01) — sıfır fark.** Scriptler `backend-v2/scripts/supabase-import/`
altında (repo kökünde node_modules yok; firebase-admin + supabase-js oradan çözülüyor).
Yazılan: 88 şube, 14 kategori, 537 ürün, 5.470 urun_sube, 870 dönem, 3 kampanya,
763 eşleşme, 3 ayar, 7 kurs + 86 ders + 4 ilerleme, 5 kullanıcı, 287 medya,
1 franchise başvurusu, 4 şube notu. Süre ~11 sn.
- Öksüz dönem kuralı çalıştı: 874 → 870, atlananlar tam olarak beklenen 4 kayıt.
  Script beklenen listeyle karşılaştırıp sapmayı uyarı olarak basıyor.
- `il`/`ilçe` 81 şubede İKİ kaynakta da yok (konumlar listesinin de yalnızca
  7 girdisinde il var) — import kaybı değil, verinin hâli. Buna karşılık
  lat/lng konumlar listesinden 81 şubeye kazandırıldı.
- FK tuzağı: Firestore'da "şubesi yok" bazen `''` ile yazılmış; `bosNull()`
  ile null'a çevriliyor, yoksa `sube_slug=()` FK ihlali veriyor.

## G5 — backend-v2: ortak rotalar

`backend/routes/` → `backend-v2/routes/`: users, categories, branches, media,
upload, onboarding, ai **+ profil, basvurular, geribildirim, isbasvuru**
(kullanıcı onayı 2026-08-01; tabloları `0003_formlar.sql`'de).
Firestore çağrıları supabase-js'e çevrilir; auth/izin
zinciri (verifyToken + requirePermission) dokunulmaz. `konum-store.js` KULLANILMAZ
(il/ilçe şube satırında). upload/media R2 tarafı aynen (`config/r2.js` kopyası).

**Doğrula:** lokal `server.js` + gerçek admin token'ıyla her rotaya smoke istek.

**Uygulandı (2026-08-01) — 37 duman testi geçti** (`backend-v2/scripts/smoke.mjs`:
admin + şube sahibi token'ı, tüm GET'ler + oluştur/güncelle/sil turu; test kayıtları
kendini temizliyor, sonrasında `dogrula.mjs` yine sıfır fark verdi).
- `0004_medya_klasorler.sql`: `medya_klasorler` tablosu (routes/media.js klasör
  uçlarını kullanıyor, Firestore'da koleksiyon hiç oluşmadığı için şemada yoktu)
  + form tablolarına `guncelleme` kolonu (PATCH `guncellemeZamani` yazıyor).
- **Davranış düzeltmesi:** şube silmede "atanmış kullanıcı var mı" kontrolü eskiden
  `where('subeSlug','==',slug)` sorguluyordu — alanın gerçek adı `sube_slug`, yani
  koruma hiç devreye girmiyordu. v2'de doğru kolonla çalışıyor.
- Ölenler: `konum-store.js` (il/ilçe/lat/lng şube kolonu), `bumpDataVersion`,
  `kategoriler.urunSayisi` denormalizasyonu (canlı sayılıyor — `/sync-counts` ucu
  sözleşme için duruyor ama artık yazmıyor), kategori silmedeki collectionGroup
  fallback'i (ortak + şube ürünleri tek tabloda).
- Sorgu sayısı: `/api/branches` 88+2 → 3 sorgu; `/api/media/klasorler` 1+N+3 → 2.
- `menu-cache.js` G6'ya kadar YER TUTUCU: çağrıldığında iş yapmaz ama uyarı basar
  (categories/branches onu çağırıyor). G6'da gerçek uygulama gelecek.

## G6 — backend-v2: qr-menü

`menu-builder` tek sorguya iner (plan §3'teki JOIN). `katalog-cache.js`,
`PAYLASIM_ESIGI`, `bumpKatalogVersion` middleware'i YAZILMAZ (ölü karmaşıklık).
`menu-cache.js`'ten kalanlar: R2 yazımı, duraklatma bayrağı (`ayarlar` tablosu),
`regenerateAffectedMenuJsons` mantığı (etkilenen şube seçimi artık
`urun_sube`'den sorgulanır). `products.js` rotaları: projeksiyon kuralları
(yanitPojeksiyonu, menudeMi, urunGizliMi) SQL WHERE + kolon seçimine iner ama
fonksiyon sınırları korunur. `/katalog` `/:id`'den önce. Kalori dahil.

**Doğrula:** 2 şubenin menü JSON'u v2'den üretilip R2'deki mevcutla normalize
diff — sıfır fark. Şube sahibi token'ıyla liste/katalog sızıntı kontrolü
(fiyat_override, gizli, menude, fiyat_serbest yanıtlarda YOK).

**Uygulandı (2026-08-01).** `scripts/menu-diff.mjs` ile adiyaman/denizli/aksaray:
ürün blokları alan alan SIFIR fark (56/62/73 ürün). Kategori nesnesinde tek fark
`urunSayisi` (bilinçli ölü) + Firestore'da boş değerle duran 3 anahtar.
Sızıntı kontrolü temiz: şube sahibinin liste/katalog/çöp yanıtlarında ve public
menü JSON'unda merkez alanlarının hiçbiri yok.
- **`MENU_R2_PREFIX` (yeni env):** v2 menüleri `menu-v2/` önekine yazar; paralel
  yayın boyunca canlı `menu/` dosyaları EZİLMEZ. Doğrulandı: test sonrası
  `menu/denizli.json` son değişiklik hâlâ 31 Tem, `menu-v2/denizli.json` bugün.
  **G11'de bu değer `menu` yapılacak.**
- Kural fonksiyonları (urunKilitliMi, urunGizliMi, menudeMi, yanitProjeksiyonu,
  fiyatDuzenlenebilirMi, etkinFiyat) AYNEN korundu; `urun_sube` satırları ↔ eski
  diziler çevirisi tek yerde (`urunNesnesi`/`uyelikleriGetir`) yapılıyor.
- Yazılmayanlar: `katalog-cache.js`, `PAYLASIM_ESIGI`, `bumpKatalogVersion`
  middleware'i, `findProduct` collectionGroup fallback'i, kategori `urunSayisi`
  sayaç yazımları.
- Duman testine QR menü turu eklendi: ürün oluştur → menüden çıkar/ekle →
  availability → şube fiyatı (override `urun_sube`'ye gitti, merkez fiyatı 100'de
  kaldı) → menüde etkin fiyat 133 → çöp → kalıcı sil. Sonrasında satır sayıları
  taban değerlerine döndü (537 ürün / 5.470 urun_sube / 779 override).

## G7 — backend-v2: akademi

courses/lessons/progress/istatistik rotaları. camelCase↔snake_case dönüşümü
tek yardımcıda. Hedefleme (targetRoles/targetSubeler) text[] sorgularıyla.

**Doğrula:** kurs listesi + bir kurs detayı + ilerleme yazma, eski API ile diff.

**Uygulandı (2026-08-01) — `scripts/akademi-diff.mjs` sıfır fark.** Eski API'ye
yalnızca GET atılır (canlı Firestore'a yazılmaz); yazma turu sadece v2'de koşar
ve izini temizler. Karşılaştırılanlar: kurs listesi (admin + şube sahibi), kurs
detayı, ders listesi, ilerleme özeti, admin istatistikleri, kullanıcı detayı.
- **Zaman damgası biçimi düzeltildi (tüm modüller):** PostgREST `…:07.54+00:00`
  döndürüyordu, eski API `…:07.540Z`. `utils/veri.js#isoZ` ile normalize edildi;
  akademi + ürün + medya + form yanıtlarına uygulandı. Bu düzeltilmeseydi G9'da
  her zaman alanı fark verirdi.
- **Import düzeltmesi:** `targetRoles/targetSubeler` Firestore'da HİÇ yoksa artık
  `[]` değil `null` yazılıyor — eski API o kursu bu anahtarlar olmadan
  döndürüyordu. `08-akademi.mjs` güncellendi, akademi import'u yeniden koşuldu.
- **AÇIKLANMIŞ FARK (G9'a taşınır):** `/progress/admin/stats` listesi 1 satır
  kısa. Eski uç `academy_progress/{uid}` dokümanı olan herkesi sayıyordu;
  akademiyi bir kez açan admin için Firestore boş doküman yaratıyor ve o admin
  listeye giriyordu (Qrd56VPKqfaQtnouCPHRiP4FTKp1, tamamlanan=0). v2'de "boş
  ilerleme dokümanı" kavramı yok — liste ucun kendi tanımına uyuyor: ilerlemesi
  olanlar + admin olmayan kullanıcılar.
- Ölenler: `syncUserProgressStats` + `statsMigrated` lazy migration (sayaçlar
  `ilerleme`den anlık türetiliyor), ders/kurs silmede collectionGroup ile yetim
  ilerleme temizliği (FK cascade), `konum-store` (şube adları `subeler`'den).
- Dönüşüm tek dosyada: `modules/academy/donusum.js` (camelCase ↔ snake_case).
  Hedefleme `text[]` sorgusuyla SQL'de eleniyor; `courseVisibleToUser` yine de
  uygulanıyor (kuralın tek kaynağı orası).

## G8 — backend-v2: raporlar

**TARİH KOLONU UYARISI (G7'deki isoZ bulgusunun devamı):** `donem_baslangic` /
`donem_bitis` / `son_tarih` SALT-TARİH kolonları (`2026-05-24`). PostgREST
bunları zaten eski sözleşmeyle aynı biçimde döndürür — `isoZ`'dan GEÇİRME,
geçirilirse `2026-05-24T00:00:00.000Z`'ye şişer ve her dönem yanıtı fark verir.
`isoZ` yalnızca timestamptz kolonlarına (`guncelleme`, `olusturma`).

En büyük modül; `db.js`'teki 27 fonksiyon esas iş. `applyDonemWrite`/
`recalcSubeAggregates`/`donem_ozetleri` yerine: dönem upsert'ü (unique
sube_kod+baslangic+bitis) + `sube_toplamlari` view + dashboard sorguları.
Bütçe yazma uçları YALNIZCA bütçe kolonlarına, çekim uçları YALNIZCA metrik
kolonlarına dokunur (override semantiği yapısal). `versionedCacheMiddleware`
yerine düz 60sn TTL cache (opsiyonel). Meta/Google servisleri (meta-api.js,
google-business.js, scheduled-fetch.js) veri yazma noktaları hariç aynen.
Cron v2'de `CRON_AKTIF=false` ile tanımlanır.

**Gece yedeği (KARAR — free planda kalınıyor, Pro alınmayacak):** cron'a ikinci
görev olarak `pg_dump` → R2 (`yedek/pg/YYYY-MM-DD.sql.gz`, son 14 dosya
tutulur, eskisi silinir). Free planda otomatik yedek yok; bu görev o boşluğu
kapatır. Sistem her gün kullanıldığı için free'nin uyuma koşulu zaten oluşmaz.

**BEKLENEN FARK (2026-08-01'de ölçüldü):** şube toplamları 88 şubenin 32'sinde
eski denormalize değerlerle TUTMUYOR — `sube_toplamlari` view'ı daha yüksek
çıkıyor. İki sebep, ikisi de eski tarafın hatası:
1. `donem_ozetleri` bayat — ör. amasya'da özet 12 dönem, alt koleksiyonda 13
   (recalcSubeAggregates bir dönemi kaçırmış). View 13'ü sayıyor.
2. Denormalize toplam override'ları GÖRMÜYOR — ör. aydin_nazilli'de dönem
   sayısı aynı ama özet toplamı ham değerleri topluyor (138.557,75), dönem
   ekranı ise override'lı değeri gösteriyor (141.434,83). Yani bugün panelde
   şube toplamı ≠ listelediği dönemlerin toplamı.
G9'da bu 32 şube "açıklanmış fark" olarak raporlanır; v2 rakamı doğru olan.

**Doğrula:** dashboard-bundle yanıtı eski API ile normalize diff (sayısal
alanlar birebir); bütçe girişi → çekim simülasyonu → bütçe alanının
korunduğu testi.

**Uygulandı (2026-08-01) — `scripts/rapor-diff.mjs` beklenmeyen fark yok.**
14 GET ucu (admin + şube sahibi) eski API ile diff'lendi; bütçe/metrik izolasyonu
10 iddiayla test edildi: bütçe gir → Meta çek → Google çek → bütçe onayı →
kısmi bütçe güncellemesi; her adımda diğer kolon grubu bozulmadı.
- **Yedek (pg_dump YERİNE mantıksal döküm):** Functions çalışma ortamında
  `pg_dump` binary'si YOK. `services/yedek.js` 18 tabloyu supabase-js ile okuyup
  tek gzip JSON olarak `yedek/pg/YYYY-MM-DD.json.gz` yazıyor, son 14 dosyayı
  tutuyor. Şema yedeği zaten `supabase/migrations/` altında. Test: 8.142 satır,
  178 KB, geri okunup açıldı. Cron 03:00 (çekimden önce) ve `CRON_AKTIF`ten
  BAĞIMSIZ çalışır.
- Cron: `otomatikRaporCekimi` 07:00 europe-west1, `CRON_AKTIF=false` olduğu için
  şimdilik atlıyor (eski backend çekiyor). G11'de `true` yapılacak.
- `kampanyalar` artık satır başına bir kampanya; `yanitlar` jsonb'ye atomik yazma
  `0005_kampanya_yanit.sql`'deki RPC ile (satır kilidi + "durum hâlâ gonderildi mi"
  guard'ı = Firestore transaction'ının karşılığı). "Aynı dönemde iki kampanya"
  koruması artık YAPISAL (id birincil anahtar).
- **BULUNAN SIZINTI (v2'de ben açtım, düzeltildi):** `versionedCacheMiddleware`'i
  düz `cacheMiddleware`'e çevirince cache anahtarı yalnızca URL'den kuruluyordu →
  admin'in dashboard-bundle yanıtı şube sahibine servis edildi (merkez
  eşleştirmeleri + ayarlar). Eski middleware'de kapsam ayracı vardı. Yeni
  `kapsamliCacheMiddleware` rol/şube ayracı ekliyor ve yanıtı `no-store`
  işaretliyor. Rol'e göre değişen HER uçta bu kullanılmalı.
- Şekil düzeltmeleri: şube nesnesinde "alan yok" (null) kırpılır ama "boş string"
  KORUNUR — ikisi farklı; import'ta `link` alanı da bu ayrımı koruyacak şekilde
  düzeltilip yeniden koşuldu.
- `adsets_cache` taşınmadı → `fetchAdsets` her çağrıda Meta'ya sorar.

## G9 — Parite kapısı

`scripts/parite/calistir.mjs`: TÜM GET uçları × (admin + 3 şube sahibi
token'ı) × (eski, yeni) → normalize (dizileri id'ye göre sırala, alan sırala)
→ diff. Yazma senaryoları: ürün ekle/düzenle/sil, menüye al/çıkar, fiyat
override, availability, bütçe girişi — her biri sonrası DB durumu + R2 çıktısı
karşılaştır. 88 menü JSON'u `menu-v2/` prefix'ine üret, mevcutla diff.
Bekçi listesi (plan §5) tek tek işaretlenir.

**Çıktı:** `scripts/parite/RAPOR.md` — sıfır fark ya da açıklanmış fark listesi.
**Bu kapı geçilmeden G10 başlamaz; farklar kullanıcıya gösterilir.**

**GEÇTİ (2026-08-01) — `backend-v2/scripts/parite/calistir.mjs`, çıkış kodu 0.**
151 GET isteği (admin + 3 şube sahibi kapsamı + public), 20 yazma iddiası,
88 menü JSON'u, 13 bekçi. Rapor: `backend-v2/scripts/parite/RAPOR.md`.
- 88 şubenin menü JSON'u `menu-v2/` önekine üretildi; `menu/` ile **farklı: 0**.
- Bekçi listesi: 12 geçti, 1 açık (UID remap — Faz 2 işi).
- Açıklanmış farklar (hepsi eski tarafın bayat denormalizasyonu ya da Firestore'un
  seyrek doküman kalıntısı): 974 alan bayat toplam · 46 alan kategori sayacı ·
  4 alan override okuma yolu · 1'er alan (fiyat_override boş harita, boş ilerleme
  dokümanlı admin, önceki dönem kalanı, bayat donem_ozetleri).

**KAPI SIRASINDA BULUNAN GERÇEK HATALAR (hepsi düzeltildi):**
1. **PostgREST 1000 satır tavanı** — `.range(0, 99999)` yazmak İŞE YARAMIYOR;
   yanıt sessizce kesiliyor. `urun_sube` toplu okumasında 3.284 satırın 1000'i
   geliyordu → admin ürün listesinde bazı ürünler şubesiz görünüyordu.
   `utils/veri.js#tumSatirlar` (sıralamalı sayfalama) eklendi ve tavanı aşabilen
   TÜM toplu okumalar ona geçirildi. **Yeni toplu okuma yazarken bunu kullan.**
2. **Karışık anahtarlı toplu upsert** — PostgREST kolon listesini satırların
   BİRLEŞİMİNDEN kurar ve eksik alanı DEFAULT değil NULL yazar; ürün eklemede
   `fiyat_serbest` NOT NULL ihlali veriyordu. Toplu upsert satırları artık tek tip.
3. **Yarım ürün** — üyelik yazımı patlayınca ürün satırı geride kalıyordu
   (kataloğa şubesiz hayalet ürün). Artık hata durumunda ürün geri alınıyor.
4. Şekil farkları: `/branches` yanıtına sızan `kod`/`olusturma`, `konumlar`
   girdilerinde null/boş ayrımı, `kalori`/`boyut`/`gorsel`/`kilitli` alanlarında
   "alan yok" ile "alan boş" karışması (0006 migration'ı + import düzeltmeleri).

## G10 — Paralel yayın (A4)

`firebase.json`'a ikinci codebase (`backend-v2`, function adı `api2`, bölge
`europe-west1`); secrets. Deploy: `npx firebase-tools deploy --only
functions:api2`. Lokal frontend `VITE_API_URL=<api2>` ile elle uçtan uca test.
Cron v2'de kapalı kalır.

**Uygulandı (2026-08-01) — v2 YAYINDA.**
- URL: `https://europe-west1-sutlucekadayif-web.cloudfunctions.net/api2`
- `firebase.json` artık iki codebase'li dizi: `default` (backend, nodejs20) +
  `v2` (backend-v2, **nodejs22**). Kullanıcı onayıyla üç fonksiyon da deploy
  edildi: `api2`, `otomatikRaporCekimi` (CRON_AKTIF=false → nötr), `geceYedegi`
  (03:00 yedek — free planda tek yedek yolu).
- **NODE 22 ZORUNLU:** `@supabase/supabase-js` Node 20'de `createClient`
  aşamasında "native WebSocket not found" ile container'ı çökertiyor. İlk deploy
  bu yüzden başarısız oldu. Eski codebase nodejs20'de kaldı (30 Eki'de
  kapanıyor — ayrı iş).
- **Env ayrımı:** `.env` deploy'a gider (Supabase, R2, CRON_AKTIF,
  MENU_R2_PREFIX), `.env.local` yalnızca lokal (GOOGLE_APPLICATION_CREDENTIALS,
  PORT). Eski backend'in kalıbının aynısı; `config/env.js` ikisini mutlak yolla
  yükler. Deploy çıktısı "Loaded environment variables from .env." ile doğrulandı.
- Artifact temizlik politikası kuruldu (3 günden eski imajlar silinir).
- **Doğrulama (dağıtılmış URL'e karşı):** sağlık ucu `supabase: ok`; public menü
  200/0.43 sn; duman testi 62 kontrol geçti; **parite kapısı yeniden koşuldu ve
  geçti** (151 GET + 20 yazma + 88 menü + 13 bekçi). CORS: `localhost:5173`
  preflight 204 ve `RateLimit-*` başlıkları açıkta — eski davranışla aynı.

**Elle yapılacak (uçtan uca panel testi):** `frontend/.env` içinde
`VITE_API_URL=https://europe-west1-sutlucekadayif-web.cloudfunctions.net/api2/api`
yapıp `cd frontend && npm run dev` ile giriş yapılıp panel gezilecek. (Giriş
bilgisi gerektiği için bu adım kullanıcıya ait.) Test sonrası `.env` eski
değerine döndürülmeli — geçiş G11'de.

## G11 — Geçiş gecesi (A5) — KULLANICI ONAYIYLA

Sıralı: menü yazımı duraklat → son tam import + doğrulama → frontend env flip
+ wrangler deploy → eski cron kapat / yenisini aç (`CRON_AKTIF`) → 88 menü
yeniden üret → smoke (2-3 şube menüsü + panel giriş + bütçe ekranı).
Geri dönüş: env flip geri + eski cron aç.

**TAMAMLANDI (2026-08-01 ~13:00, kullanıcı onayıyla).** Sıra ve sonuçlar:
1. Eski backend'de menü yazımı duraklatıldı (`duraklatildi: true`).
2. Son tam import (10,9 sn) + doğrulama. **Doğrulama 1 fark yakaladı:** panel
   testinde v2'ye eklenen "Soğuk Çay" ürünü Firestore'da yoktu ve 88 şubenin
   menüsüne işaretlenmişti; kullanıcı onayıyla kalıcı silindi, sonra sıfır fark.
3. v2 `MENU_R2_PREFIX=menu` + `CRON_AKTIF=true` ile yeniden deploy edildi.
4. `frontend/.env` → api2; `npm run build` + `wrangler deploy`
   (`sutlucekadayif-cms`, sürüm f7fae4e7).
5. Eski cron silindi (`functions:delete otomatikRaporCekimi --region us-central1`).
   Artık tek çekim işi var: v2 / europe-west1.
6. 88 menü canlı `menu/` önekine yeniden üretildi — **hepsi 88'i güncellendi**.
   DİKKAT: duraklatma bayrağı Supabase'e de import edildiği için ilk
   `regenerate-cache` çağrısı sessizce atlandı; bayrak v2'de kaldırılınca
   (`POST /menu/cache-durumu {duraklat:false}`) üretim gerçekleşti.
7. Smoke: 3 şubenin R2 menüsü (62/56/83 ürün), public menü ucu, panel uçları
   (health, dashboard-bundle, products, categories, academy) ve bütçe ekranı
   (butce-durum + kampanya detayı, 88 şube yanıtı) — hepsi 200.

**Yedekler:** `.env` ve `frontend/.env` geçiş öncesi kopyaları scratchpad'de
(`env-yedek-g11`, `frontend-env-yedek-g11`). Geri dönüş: frontend `.env`'i eski
API'ye çevir + build + wrangler deploy; `backend-v2/.env`'de
`MENU_R2_PREFIX=menu-v2`/`CRON_AKTIF=false` yapıp v2'yi yeniden deploy et; eski
cron için `firebase deploy --only functions:default`; eski backend'de menü
duraklatmasını kaldır → eski sistem 88 menüyü kendi verisinden yeniden yazar.

## G12 — Gözlem + söküm (A6)

1–2 hafta sonra kullanıcı onayıyla: Firestore tam export → R2 arşiv, eski
codebase sil, Firestore rules deny-all. Firebase Auth'a DOKUNMA (Faz 2'nin işi).

Gözlem haftasında bir kez **geri yükleme tatbikatı**: gece yedeği
(`yedek/pg/*.json.gz`) boş bir scratch şemaya gerçekten geri yüklenir ve satır
sayıları doğrulanır. Yedek "geri okunabildi" ile "geri yüklenebilir" aynı şey
değil — restore yolu bir kez fiilen çalıştırılmadan yedek var sayılmaz.

Sökümden ÖNCE: **Google OAuth redirect URI** hâlâ eski API'ye kayıtlı
(`api-...-uc.a.run.app/api/reports/auth/google/callback` — Google Console +
ayarlar.settings.googleRedirectUri + ReportsModals placeholder). Mevcut token
refresh'i redirect gerektirmez, yalnızca Google hesabı YENİDEN bağlanırken
lazım — ama eski API silinince kırılır; api2 adresine taşı.

---

*Faz 2 (Auth) ve Faz 3 (Workers) görev dosyaları Faz 1 bitince yazılır —
şimdiden detaylandırmak bayatlar. Stratejileri planın §4b/§4c'sinde.*
