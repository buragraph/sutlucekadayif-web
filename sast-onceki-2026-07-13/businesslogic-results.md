# İş Mantığı Açıkları Sonuçları: Sütlüce Kadayıf Web

> SAST Faz 2 — iş mantığı (business logic) değerlendirmesi. Kaynak: tehdit modeli +
> `budget-routes.js`, `db.js`, `routes.js`, `academy/routes/progress.js` kodunun elle
> doğrulanması. Sınıflandırma: **CONFIRMED** (kodda kesin doğrulandı) / **PLAUSIBLE**
> (koşullu ya da etki/pratiklik sınırlı). Önem: Kritik / Yüksek / Orta / Düşük.

## Yönetici Özeti

- İncelenen senaryo: 14
- CONFIRMED: 6
- PLAUSIBLE: 6
- Uygulanamaz / etki yok (hardening notu): 2

**Koordinatörün dört sorusuna kısa cevap:**
1. **`secilen_bakiye` sunulan `bakiye_secenekleri`'ne karşı doğrulanıyor mu?** HAYIR.
   Şube sahibi keyfi (menüde olmayan, hatta negatif/dev) bir tutar gönderebilir; toplu
   onayda bu değer `planlanan_butce`'ye doğrudan yazılır. → CONFIRMED / Yüksek (Bulgu 1).
2. **Miktar alanlarında negatif/aşırı büyük/tip kontrolü var mı?** HAYIR. Gönderimde
   yalnızca `isNaN` bakılıyor; işaret/üst sınır yok. Override yolunda hiç `Number()`
   dönüşümü/tip kontrolü yok. → CONFIRMED / Yüksek (Bulgu 2, 4).
3. **Tarih formatı doğrulanıyor mu?** HAYIR. Kampanya oluşturmada yalnızca alan varlığı
   kontrol ediliyor; `YYYY-MM-DD` format doğrulaması yok. Son tarih kapısı sözlüksel string
   karşılaştırması. → PLAUSIBLE / Orta (Bulgu 5).
4. **Yarış koşulları var mı?** EVET. Toplu onay TOCTOU, `MAX_KAMPANYA` tavan yarışı ve
   `devret` sıralama yarışı — hiçbiri onay akışını tek transaction'a almıyor. → PLAUSIBLE /
   CONFIRMED (Bulgu 7, 8, 9).

---

## Bulgular

### [CONFIRMED] 1. Şube kendi bütçesini menü-dışı `secilen_bakiye` göndererek şişiriyor
- **Kategori**: Girdi doğrulama / limit ihlali (tutar manipülasyonu)
- **Dosya**: `backend/modules/reports/budget-routes.js:792-803` (gönderim), `:351-362`
  (toplu onay tüketimi), `backend/modules/reports/db.js:219-225` (`upsertButce`)
- **Endpoint**: `POST /api/reports/butce-gonder/:kampanyaId`
- **İhlal edilen kural**: `secilen_bakiye`, kampanyanın `bakiye_secenekleri` listesinden
  biri olmalı; değilse reddedilmeli.
- **Sorun**: Gönderim handler'ı yalnızca değerin varlığını (`if (!secilen_bakiye ...)`,
  :794) ve sayı olduğunu (`isNaN`, :801) kontrol eder. `kampanya.bakiye_secenekleri`
  **hiç okunmaz**, üyelik kontrolü yoktur. Seçilen değer `numBakiye` olarak aynen saklanır
  (:843). Toplu onayda (`onayla`, :351-362) `yanit.secilen_bakiye` doğrudan `upsertButce`
  ile `planlanan_butce`'ye yazılır — tekrar doğrulama yok. Bu tutar `butce-durum`'da
  `toplamButce`/`kalan`/aşım bayraklarını sürer (:637-658).
- **Sömürü senaryosu**: `budget.submit` yetkili bir şube sahibi (kendi şubesi) POST ile
  `secilen_bakiye=999999999` gönderir; admin "tümünü onayla" derse (satır satır incelemeden)
  şubenin planlanan bütçesi keyfi büyük değere set olur, harcama/aşım raporları çarpıtılır.
- **Etki**: Bütçe/aşım raporlarının bütünlüğü bozulur; merkezî bütçe kararlarının dayandığı
  denormalize `donem_ozetleri` şubenin kontrolündeki uydurma değerle kirlenir.
- **Kanıt**: `:792-803` içinde `bakiye_secenekleri` referansı yok; `:351-362` onayda yeniden
  doğrulama yok; `db.js:151` `planlanan_butce: merged.planlanan_butce || 0` — yalnızca
  falsy koruması, aralık kontrolü yok.
- **Öneri**: Gönderimde `Number(secilen_bakiye)`'nin `kampanya.bakiye_secenekleri`
  içinde olduğunu doğrula (kayan nokta için tam eşleşme/tolerans); değilse 400 dön.
- **Dinamik Test**:
  ```
  # Şube sahibi token'ı ile (kendi kampanyası aktifken)
  curl -X POST https://<host>/api/reports/butce-gonder/<kampanyaId> \
    -H "Authorization: Bearer <SUBE_TOKEN>" \
    -F "secilen_bakiye=999999999" -F "kdv_dahil_tutar=100" -F "dekont=@x.png"
  # Beklenen (açık): 200 success — menüde olmayan tutar kabul edilir.
  # Admin toplu onaydan sonra GET /api/reports/butce-durum → şube toplamButce=999999999
  ```

### [CONFIRMED] 2. Negatif / sıfır / aşırı büyük tutarlar bütçe aggregate'lerini bozuyor
- **Kategori**: Girdi doğrulama (işaret/aralık kontrolü eksik)
- **Dosya**: `backend/modules/reports/budget-routes.js:794-803`, `:634-658`,
  `backend/modules/reports/db.js:146-162`
- **Endpoint**: `POST /api/reports/butce-gonder/:kampanyaId`
- **İhlal edilen kural**: Tutarlar sonlu ve `> 0`, makul bir tavanın altında olmalı;
  negatif ve sonsuz/NaN reddedilmeli.
- **Sorun**: `secilen_bakiye` ve `kdv_dahil_tutar` herhangi bir sonlu sayıyı kabul eder;
  `-100000` gibi negatifler ve dev değerler geçer. Endpoint `multipart` (dekontUpload)
  olduğu için `req.body` değerleri **string**tir: `!"-100"` → false (geçer), `!"0"` →
  false (0 bile geçer); `isNaN(Number("-100"))` → false (geçer). Onaylanan negatif
  `secilen_bakiye`, negatif `planlanan_butce` olur. `butce-durum`'da
  `if (toplamButce > 0)` (:644) negatif toplamı **sessizce** aşım/uyarı sayımından ve
  `toplamPlanlanan`'dan düşürür — gerçek aşımı gizleyebilir.
- **Sömürü senaryosu**: Şube negatif ya da uçuk bir bakiye gönderir; onaylanınca
  `toplamButce` negatife/anlamsıza gider, `kalan`/`kullanimOrani` bozulur, şube aşım
  panosundan görünmez olur.
- **Etki**: Finansal raporlama bütünlüğü; aşım tespiti atlatılabilir.
- **Kanıt**: `:794` truthiness guard'ı negatifi engellemez; `db.js:151-153` yalnızca
  `|| 0` (falsy) koruması yapar, işaret/aralık kontrolü yoktur.
- **Öneri**: `Number.isFinite(x) && x > 0 && x <= TAVAN` kontrolü ekle; hem gönderim hem
  onay hem override yolunda uygula.
- **Dinamik Test**:
  ```
  curl -X POST .../butce-gonder/<id> -H "Authorization: Bearer <SUBE_TOKEN>" \
    -F "secilen_bakiye=-50000" -F "kdv_dahil_tutar=1"
  # Beklenen (açık): 200 success. Onay sonrası butce-durum'da şube listeden düşer.
  ```

### [CONFIRMED] 4. Override yolunda bütçe alanlarında tip/dönüşüm kontrolü yok
- **Kategori**: Tip karışıklığı / girdi doğrulama
- **Dosya**: `backend/modules/reports/routes.js:702-716`, `backend/modules/reports/db.js:151-153`
- **Endpoint**: `PUT /api/reports/sube/:kod/donem/overrides`
- **İhlal edilen kural**: Override tutarları saklamadan önce sonlu, negatif olmayan sayıya
  zorlanmalı/doğrulanmalı.
- **Sorun**: Handler `overrides.planlananButce/.devredilenMiktar/.merkezDestegi`'yi
  **hiçbir `Number()` dönüşümü/tip kontrolü olmadan** kopyalar (:704) ve `upsertButce`'ye
  verir (:716). `db.js`'te bu alanlar `TOPLAM_KEYS`'te olmadığından `Number()||0` delta
  yolundan geçmez; `|| 0` yalnızca falsy'yi yakalar. Bir JSON string (`"1e9"`), boolean ya
  da object ham saklanır; sonradan `toplamButce = planlanan + devredilen + merkez`
  (`budget-routes.js:637`) string birleştirme ya da `NaN` üretir.
- **Sömürü senaryosu**: Admin (ya da ele geçirilmiş admin token'ı) `{"planlananButce":"1e9"}`
  gönderir; downstream matematiği bozulur. `reports.manage` gerektirdiğinden yalnızca
  admin tetikler → önem düşük, ancak doğrulama boşluğu gerçek.
- **Etki**: Bütçe aggregate'lerinin bozulması; yanlış rapor.
- **Kanıt**: `:704` `butceOverrides[k] = overrides[k]` — dönüşüm yok.
- **Öneri**: Her override alanını `Number.isFinite` ve `>= 0` ile doğrula, aksi halde 400.
- **Dinamik Test**:
  ```
  curl -X PUT .../sube/<kod>/donem/overrides -H "Authorization: Bearer <ADMIN>" \
    -H "Content-Type: application/json" \
    -d '{"baslangic":"2026-07-01","bitis":"2026-07-31","overrides":{"planlananButce":"1e9"}}'
  # Beklenen: 200; butce-durum'da toplamButce string-concat/NaN olur.
  ```

### [CONFIRMED] 8. `devret` ve tekrar-onay durum kapısı olmadan onaylı bütçeyi yeniden yazıyor
- **Kategori**: İş akışı / idempotency
- **Dosya**: `backend/modules/reports/budget-routes.js:446-464` (tekil onay tekrarı),
  `:503-539` (`devret`)
- **Endpoint**: `POST .../onayla/:subeKod`, `POST .../devret/:subeKod`
- **İhlal edilen kural**: `devret`/tekrar-onay kampanya/yanıt durumuna göre kapılanmalı;
  onaylı bir bütçeyi değiştirmek açık bir yeniden-onay gerektirmeli ve aktör kaydedilmeli.
- **Sorun**: `onayla/:subeKod` zaten `onaylandi` bir şubede tekrar çağrılabilir (:447 açıkça
  izin verir) ve `upsertButce`'yi yeniden çalıştırır. `devret`'in **hiçbir durum kapısı
  yok** — onaydan önce, sonra ya da yerine çağrılabilir; `devredilen_miktar`'ı önceki
  dönem kalanıyla yeniden yazar (:526-533). `upsertButce` mutlak değer yazdığından tekil
  işlemler idempotent ama **sıralama denetimsiz**: onaydan sonra `devret` çağrısı şubenin
  toplam bütçesini ve `kalan`'ı sessizce değiştirir, yeniden onay/bildirim olmadan; kim/ne
  zaman yaptığı kaydedilmez.
- **Sömürü senaryosu**: Admin yolu; iş akışı bütünlüğü/denetlenebilirlik açığı. Onaylı
  bütçe, ayrı bir `devret` çağrısıyla habersiz değişir.
- **Etki**: Denetim izi yok; onaylı finansal değer sessizce değişebilir.
- **Kanıt**: `:503-539` devret handler'ında durum kontrolü yok; `:447` tekrar onaya izin.
- **Öneri**: `devret`'i yalnızca ilgili durum(lar)da kabul et; onaylı bütçeyi değiştiren her
  işlem için aktör/zaman logla ve yeniden-onay şartı koy.

### [CONFIRMED] 9. `MAX_KAMPANYA` tavanı eşzamanlı oluşturmada aşılabilir (TOCTOU) ve dekont kaybı
- **Kategori**: Limit ihlali / yarış koşulu
- **Dosya**: `backend/modules/reports/budget-routes.js:94-140`
- **Endpoint**: `POST /api/reports/butce-kampanya`
- **İhlal edilen kural**: Tavan ve en-eskiyi-silme tek bir transaction içinde
  uygulanmalı.
- **Sorun**: Tavan, `kampanyalar` bir kez okunup (:95), yeni kampanya yazılıp (:128),
  ardından **yalnızca ön-okuma sayısı `>= MAX_KAMPANYA` ise** en eski silinerek (:132-140)
  uygulanır. İki eşzamanlı oluşturma aynı sayıyı (ör. 5) okur, ikisi de yazar, her biri bir
  "en eski"yi siler; doküman 6'nın üstüne çıkabilir ya da yanlış (artık ikinci en eski)
  kampanya silinebilir. Silme R2 dekont dosyalarını da temizlediğinden (`deleteDekontlar`),
  yarış **başka kampanyanın makbuzlarının geri dönüşsüz kaybına** yol açabilir. Kod yorumu
  zaten geçici "tavan+1" durumunu kabul ediyor.
- **Sömürü senaryosu**: Admin yolu (`budget.manage`); iki hızlı eşzamanlı oluşturma isteği
  invaryantı bozar. Kötü niyet gerektirmez — çift tık/paralel istek yeterli.
- **Etki**: Veri kaybı (başka kampanyanın dekontları), tavan ihlali.
- **Kanıt**: `:95` okuma, `:128` yazma, `:132-140` koşullu silme — hepsi ayrı; transaction
  yok.
- **Öneri**: Okuma + yazma + en-eskiyi-silmeyi tek `runTransaction` içinde `butce` dokümanı
  üzerinde yap.
- **Dinamik Test**:
  ```
  # 5 kampanya varken iki isteği eşzamanlı gönder:
  for i in 1 2; do curl -X POST .../butce-kampanya -H "Authorization: Bearer <ADMIN>" \
    -H "Content-Type: application/json" \
    -d '{"baslik":"c'$i'","donem_baslangic":"2026-0'$i'-01","donem_bitis":"2026-0'$i'-28","son_tarih":"2026-0'$i'-20","bakiye_secenekleri":[1000]}' & done; wait
  # Beklenen (açık): kampanya sayısı 6'yı geçer veya yanlış kampanya + dekontları silinir.
  ```

### [CONFIRMED] 11. Academy: keyfi / var olmayan dersleri "tamamlandı" işaretleyerek istatistik şişirme
- **Kategori**: Ödül / metrik manipülasyonu
- **Dosya**: `backend/modules/academy/routes/progress.js:311-335` (yazan), `:80-165`
  (istatistik tüketici `/admin/stats`)
- **Endpoint**: `POST /api/academy/progress/:courseId/:lessonId`
- **İhlal edilen kural**: Yalnızca var olan, yayınlanmış, kullanıcıya görünür ve verilen
  kursa ait bir ders tamamlanabilmeli.
- **Sorun**: Handler `courseId`/`lessonId`'yi doğrudan URL'den alır. Dersi **yalnızca
  quiz tipini engellemek için** okur (:317-321); ders **yoksa** (`lessonSnap.exists` false)
  bu kapı atlanır ve keyfi string'ler için `completedLessons/{lessonId} = { courseId,
  completedAt }` yazılır (:330). Dersin kursa ait olduğu, kursun yayınlandığı ya da
  kullanıcıya görünür olduğu (`courseVisibleToUser` **çağrılmıyor**) hiç doğrulanmaz.
- **Sömürü senaryosu**: `calisan`/`sube_sahibi` uydurma `courseId`/`lessonId` ile POST
  atarak kendi `totalCompleted`/`byCourse` sayaçlarını şişirir; adminler bunu
  `GET /admin/stats`'ta eğitim-tamamlama kanıtı olarak okur.
- **Etki**: Eğitim tamamlama metriklerinin güvenilirliği bozulur (sahte tamamlama).
- **Kanıt**: `:319` guard `lessonSnap.exists && lessonType==='quiz'` — var olmayan ders
  guard'ı atlar; `:330` ham yazım; görünürlük/aidiyet kontrolü yok.
- **Öneri**: Yazmadan önce dersin var olduğunu, `courseId`'ye ait olduğunu, kursun
  yayınlandığını ve `courseVisibleToUser(course, req.user)` döndüğünü doğrula.
- **Dinamik Test**:
  ```
  curl -X POST .../academy/progress/UYDURMA_KURS/UYDURMA_DERS \
    -H "Authorization: Bearer <CALISAN_TOKEN>"
  # Beklenen (açık): 200 success; GET /admin/stats totalCompleted artar.
  ```

---

### [PLAUSIBLE] 3. `kdv_dahil_tutar` beyan edilen bakiyeden kopuk, aralık kontrolü yok
- **Kategori**: Veri bütünlüğü / finansal yanlış raporlama
- **Dosya**: `backend/modules/reports/budget-routes.js:792-799, 841-850`, `:440-472`
- **Endpoint**: `POST /api/reports/butce-gonder/:kampanyaId`; `POST .../onayla/:subeKod`
- **İhlal edilen kural**: `kdv_dahil_tutar` pozitif olmalı ve (iş politikasına göre)
  `secilen_bakiye`/dekont ile uyumlu olmalı.
- **Sorun**: `kdv_dahil_tutar` ilişki ve aralık kontrolü olmadan olduğu gibi saklanır. Şube,
  küçük bir `kdv_dahil_tutar` beyan edip büyük `secilen_bakiye` seçebilir; makbuz toplamı ile
  onaylanan bütçe ayrışır. Tekil onayda `kdv` doğrudan body'den yazılır (:444, :471).
- **Neden PLAUSIBLE**: `kdv_dahil_tutar` bütçe aggregate'lerine **beslenmiyor** (yalnızca
  gösterim/mutabakat amaçlı). Sistemik finansal etkisi Bulgu 1/2'den düşük; yine de gerçek
  bir tutarsızlık kaynağı.
- **Öneri**: `kdv_dahil_tutar` için pozitif sayı kontrolü; iş kuralı gereğiyse
  `secilen_bakiye`/dekont ile mutabakat.

### [PLAUSIBLE] 5. Son tarih (`son_tarih`) doğrulanmamış tarih formatı üzerinden atlatılabilir
- **Kategori**: İş akışı atlama / bozuk zaman kontrolü
- **Dosya**: `backend/modules/reports/budget-routes.js:88-92` (oluşturma),
  `:724-753` (listeler), `:815-818` (gönderim kapısı)
- **Endpoint**: `POST /api/reports/butce-gonder/:kampanyaId`; kampanya oluşturma
- **İhlal edilen kural**: Tüm tarih alanları oluşturma/güncellemede katı `YYYY-MM-DD` olarak
  doğrulanmalı; karşılaştırma string değil tarih olarak yapılmalı.
- **Sorun**: Gönderim kapısı `kampanya.son_tarih < bugun` **sözlüksel string
  karşılaştırması**dır (`bugun = bugunStr()` → `YYYY-MM-DD`, :815-816). Oluşturma (:88-92)
  `son_tarih`/`donem_baslangic`/`donem_bitis`'in iyi biçimli `YYYY-MM-DD` olduğunu
  doğrulamaz — yalnızca varlık kontrolü. `son_tarih` başka formatta saklanırsa (ör.
  `13/07/2026`, timestamp) sözlüksel karşılaştırma yanlış davranır: ISO `bugun`'ün altında
  sıralanan değer gönderimi kalıcı bloklar; yukarıda sıralanan bozuk değer kampanyayı
  süresiz açık tutar (deadline sonrası gönderim). Aynı kırılgan karşılaştırma
  `butce-bekleyen` (:727) ve `katildiklarim` (:751)'i sürer.
- **Neden PLAUSIBLE**: Kampanyaları yalnızca admin oluşturur ve UI iyi biçimli ISO
  gönderirse karşılaştırma doğru çalışır; sömürü, bozuk formatta veri saklanmasına bağlı
  (yanlış/eski entegrasyon veya elle API çağrısı). İyi biçimli ISO'da açık tetiklenmez.
- **Öneri**: Oluşturma/güncellemede tüm tarih alanlarını katı `^\d{4}-\d{2}-\d{2}$` +
  geçerli tarih olarak doğrula; karşılaştırmayı gerçek tarih nesnesiyle yap.

### [PLAUSIBLE] 6. Yeniden gönderim şube kaydını ezer, durum `gonderildi` kalır (denetim izi yok)
- **Kategori**: Durum manipülasyonu / inkar edilebilirlik
- **Dosya**: `backend/modules/reports/budget-routes.js:820-854`
- **Endpoint**: `POST /api/reports/butce-gonder/:kampanyaId`
- **İhlal edilen kural**: İlk gönderimden sonra ya gönderim dondurulmalı ya da hesap
  verebilirlik için append-only geçmiş tutulmalı.
- **Sorun**: Şube, onaya kadar sınırsız kez yeniden gönderebilir — handler yalnızca
  `mevcutYanit?.durum === 'onaylandi'` iken engeller (:822). Her gönderim
  `secilen_bakiye`/`kdv_dahil_tutar`/`notlar`/`gonderim_tarihi`'yi tamamen yeniden yazar
  (:841-854). Önceki gönderimlerin değişmez kaydı yoktur; admin toplu onay en son değeri
  okur.
- **Neden PLAUSIBLE**: Onay öncesi düzenlemeye izin vermek kısmen kasıtlı olabilir; ancak
  denetim izi yokluğu Bulgu 1 ile birleşince admin'e makul değer gösterip sonra değiştirme
  riskini artırır.
- **Öneri**: Gönderimi ilk gönderimden sonra dondur ya da append-only geçmiş tut.

### [PLAUSIBLE] 7. Şube gönderimi ile admin toplu onayı arasında yarış (TOCTOU)
- **Kategori**: Yarış koşulu / TOCTOU
- **Dosya**: `backend/modules/reports/budget-routes.js:326-392` (toplu),
  `:426-495` (tekil)
- **Endpoint**: `POST .../onayla` vs `POST .../butce-gonder/:kampanyaId`
- **İhlal edilen kural**: Onay, yanıtı okuyup kilitlemeli (transaction / iyimser sürüm) ki
  onaylanan tutar ile kaydedilen yanıt ayrışamasın.
- **Sorun**: Toplu onay tüm `butce` dokümanını okur (:328), `gonderildi` yanıtları filtreler
  (:340), ayrı bir `Promise.allSettled` içinde her şubenin `secilen_bakiye`'sini dönem
  dokümanına yazar (:351-362) ve **ancak sonra** yanıt durumlarını günceller (:384).
  **Okuma→onay→durum'u kapsayan transaction yok.** Eşzamanlı gönderen (`durum !==
  'onaylandi'` iken izinli) bir şubenin yeni `secilen_bakiye`'si dokümanda kalırken onay
  eski değeri `planlanan_butce`'ye yazabilir (veya tersi). Tekil onay yolunda da aynı
  oku-sonra-yaz boşluğu var.
- **Neden PLAUSIBLE**: Pencere dar ve onay admin tarafından tetiklenir; yine de eşzamanlı
  gönderim şube kontrolünde olduğundan otomatik araçla kışkırtılabilir.
- **Öneri**: Onayı `runTransaction` içinde yanıt okuma + bütçe yazma + durum güncellemeyi
  atomik yaparak uygula (veya iyimser sürüm kontrolü).

### [PLAUSIBLE] 12. Academy: kurs görünürlük/yayın kontrolü olmadan sınav gönderimi
- **Kategori**: İş akışında yetkilendirme boşluğu
- **Dosya**: `backend/modules/academy/routes/progress.js:218-281`;
  `backend/modules/academy/routes/courses.js:64-85`; `backend/modules/academy/utils.js:21-27`
- **Endpoint**: `POST /api/academy/progress/quiz/:courseId/:lessonId/submit`
- **İhlal edilen kural**: Sınav gönderimi yalnızca kullanıcının görmeye yetkili olduğu
  kurslardaki derslerle sınırlı olmalı.
- **Sorun**: Sınav notlandırması dersi yükleyip cevapları sunucu tarafında puanlar (cevaplar
  `stripQuizAnswers` ile istemciden doğru şekilde ayıklanır, `utils.js:6`). Ancak gönderim
  yolu `course.isPublished` ya da `courseVisibleToUser`'ı **hiç kontrol etmez** — kullanıcı,
  rolüne/şubesine atanmamış bir kursta (id'leri biliyorsa) geçer not kaydedebilir,
  tamamlama kaydını ve byCourse istatistiğini şişirir. Notlandırma sağlam; boşluk,
  liste/detay endpoint'lerinin uyguladığı görünürlük kapısının eksikliği (`courses.js:34-39,
  72`).
- **Neden PLAUSIBLE**: Bulgu 11'den dar — geçerli id'ler + doğru cevaplarla geçer not
  gerekir (cevaplar görünmediğinden normal sınavı zorla geçmek mümkün değil). Etki: yetkisiz
  kursta ilerleme kaydı.
- **Öneri**: Gönderim yolunda `courseVisibleToUser` + `isPublished` kapısını uygula.

### [PLAUSIBLE] 13. Academy: `passingScore: 0` yanlış yapılandırılmış sınav herkesi geçirir
- **Kategori**: Mantık uç durumu / yapılandırma sertleştirme
- **Dosya**: `backend/modules/academy/routes/progress.js:236-251`;
  `backend/modules/academy/routes/lessons.js:88-90`
- **Endpoint**: `POST .../quiz/:courseId/:lessonId/submit`
- **İhlal edilen kural**: Minimum geçer not düşünülmeli / 0'da uyarılmalı; `answers`
  anahtarları soru id'lerine karşı doğrulanmalı.
- **Sorun**: Puanlama `Math.round(correctCount / questions.length * 100)`, `passingScore`
  varsayılan 70. Ders oluşturma `passingScore` 0-100 ve `questions.length >= 1`'i doğrular
  (`lessons.js:88-90`) ve `questions.length === 0` durumu çalışma anında da yakalanır
  (`progress.js:238`, bölme-sıfır yok). Ancak `passingScore: 0` yapılandırılmış bir sınav
  herhangi bir gönderimi otomatik geçirir (skor `>= 0`). Saldırgan `correctOptionId`'yi
  göremediğinden normal sınavı zorla geçemez — bu öncelikle yapılandırma sertleştirme notu.
- **Neden PLAUSIBLE**: Saldırgan-kontrollü yol değil; yanlış yazılmış (`passingScore:0`)
  sınav sessizce herkese tamamlama verir.
- **Öneri**: Minimum geçer not zorla / 0'da uyar; `answers` anahtarlarını soru id'leriyle
  doğrula.

### [PLAUSIBLE] 14. `merkezDestegi` (merkez desteği) doğrulanmadan bütçeye ekleniyor
- **Kategori**: Girdi doğrulama (admin tarafı tutar)
- **Dosya**: `backend/modules/reports/budget-routes.js:440-464`, `:636-637`;
  `backend/modules/reports/routes.js:702-716`
- **Endpoint**: `POST .../onayla/:subeKod` (`merkez` body), `PUT .../overrides`
- **İhlal edilen kural**: `merkezDestegi` sonlu, negatif olmayan bir sayı olarak
  doğrulanmalı.
- **Sorun**: `merkez` tekil onayda çıplak `Number(merkez)` ile dönüştürülür (:442) ve
  override yolunda ham kopyalanır (Bulgu 4), aralık/işaret doğrulaması yok. `toplamButce`'ye
  eklenir (:637); yanlış ya da negatif değer tüm aşım/uyarı hesabını çarpıtır.
- **Neden PLAUSIBLE**: Yalnızca admin tetikler → düşük öncelik; yine de finansal
  aggregate'e giren doğrulanmamış bir tutar.
- **Öneri**: `merkezDestegi`'ni `Number.isFinite && >= 0` ile doğrula.

---

### [NOT EXPLOITABLE / Sertleştirme] 10. Aynı-dönem kampanya anahtar çakışması
- **Kategori**: Veri bütünlüğü
- **Dosya**: `backend/modules/reports/budget-routes.js:88-102`, `:630-632`
- **Endpoint**: `POST /api/reports/butce-kampanya`
- **Durum**: Tehdit modelinde iddia edilen "onaylanmış bütçelerin yetim kalması" zararı
  **gerçekleşmez**: aynı saklanan `donem_baslangic`/`donem_bitis` string'leri hem yazma
  yolundan (`upsertButce`, :353-359) hem okuma/eşleştirme yolundan (`butce-durum`,
  :630-632) geçtiği için tarih geçerli/sıralı olsun olmasın **her zaman hizalanır**.
  Oluşturma zaten mevcut anahtarı reddeder (:100-102). Geriye kalan `donem_baslangic <=
  donem_bitis` doğrulamasının yokluğu düşük önemli bir girdi-doğrulama/sertleştirme
  boşluğudur; admin-only (`budget.manage`) — ayrıcalık yükseltme değil.
- **Öneri**: Yine de oluşturmada iki alanın geçerli tarih ve `baslangic <= bitis` olduğunu
  doğrula (Bulgu 5 ile birlikte tek yerde).

## Uygulanamaz Kategoriler

- **Checkout/sepet fiyat manipülasyonu, kupon/indirim, cüzdan/bakiye transferi, stok/envanter
  yarışı, abonelik kademesi, iade/chargeback**: Kod tabanında böyle bir akış yok. QR menü
  salt-okunur public katalog; ürünlerin sunucu tarafı satın alınabilir fiyat akışı yok. Tek
  "bakiye" reklam `secilen_bakiye`'si (yukarıda kapsandı).
