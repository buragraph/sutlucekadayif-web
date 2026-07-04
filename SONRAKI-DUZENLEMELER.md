# Sonraki Düzenlemeler

Kod incelemesi (2026-07-02) sonrası yapılan düzeltmeler ve geleceğe bırakılan işler.

## Bu turda yapılan düzeltmeler

| Dosya | Düzeltme |
|---|---|
| `backend/modules/reports/db.js` (`updateOverrides`) | İki ayrı yazım (set + update) tek atomik `set(..., { mergeFields })` çağrısına indirildi — kısmi başarısızlıkta tutarsız doküman riski ve çift yazma maliyeti kalktı. |
| `backend/modules/reports/routes.js` (`PUT /sube/:kod/donem/overrides`) | Kısmi payload artık diğer bütçe override'larını silmiyor: eksik gönderilen alan mevcut override'ından korunuyor. Ayrıca `getButce` yerine `getDonemVeri` kullanıldı — `getButce` dönüşünde `merkez_destegi` hiç olmadığı için fallback her zaman 0'a düşüyordu (gizli bug). |
| `backend/modules/reports/budget-routes.js` (tekil onay) | Dönem dokümanı henüz yokken onaylamada `merkez_destegi` 0'a sıfırlanıyordu; artık yanıt kaydındaki değere düşüyor. |
| `backend/modules/reports/services/scheduled-fetch.js` | Google döngüsündeki N+1 `getSubeByKod` okuması tek `db.getAll` çağrısına indirildi (mükerrer eşleşmelerde okuma tasarrufu + tek RPC). |

## İncelendi, düzeltme gerekmedi

- **Yanıtsız şubeyi bakiye girerek onaylama** (`budget-routes.js` tekil onay): eski koddaki "yalnızca gonderildi durumunda onay" kuralı bilinçli gevşetilmiş (kampanyadan sonra eklenen şube senaryosu, koddaki yorumda belgeli). Bakiye girilmeden onay hâlâ engelleniyor. İstenirse ileride onay öncesi UI'da "bu şube henüz bildirim göndermedi" uyarısı eklenebilir.
- CSV import'ta eşleşmeyen şube kodları sessizce atlanmıyor — `eslesmeyenler` listesi ve mesajla kullanıcıya gösteriliyor.
- Şifresiz kullanıcı oluşturma bilinçli akış (rastgele geçici şifre + şifre sıfırlama e-postası).
- `upsertKonum` transaction içinde alan bazlı merge yapıyor; profil ve admin rotalarının eşzamanlı yazması veri kaybetmiyor.
- `scheduled-fetch` tarih matematiği saat diliminden etkilenmiyor (ISO tarih dilimleme).

## Sonraki düzenlemeler (backlog)

1. **`budget-routes.js` tekrar eden kalıplar** — durum kontrolü (`durum !== 'gonderildi' && durum !== 'onaylandi'`), son kampanya seçimi (`donem_baslangic` sıralaması) ve kuruş yuvarlama (`Math.round(x*100)/100`) birden çok yerde inline; küçük helper'lara çekilebilir. (Boş yanıt şablonu `bosYanit()` ile ortaklaştırıldı.)
2. **Bütçe endpoint'leri `reportsApi` katmanına taşınmalı** — `BranchReklamPage`/`BudgetSubmitPage`/
   `BudgetCampaignForm`/`BudgetCampaignsPage` bütçe çağrılarını component içinden shared axios ile
   yapıyor (konvansiyon ihlali; mevcut dosya deseni tutarlı olduğundan ertelendi).
3. **Adset cache tek dokümanda** — `meta-api.js` tüm adset dizisini tek Firestore dokümanına
   yazıyor; adset sayısı büyürse 1 MiB limitine takılır (cache yazımı hata verir, işlev bozulmaz).
   Çözüm: yalnızca gerekli alanları sakla veya parçala — tasarım gerektirir.
4. **Dev için ayrı Firestore/ortam** — Lokal geliştirme bilinçli olarak prod API +
   Firestore'a gider (`frontend/.env` prod URL tanımlar; kullanıcı kararı). İleride dev
   ortamı açılırsa `.env.development` ile yönlendirilir. Not: `.env` gitignore'da olduğu
   için .env'siz temiz ortamda alınan build localhost'a düşer — CI/build kurulursa
   `VITE_API_URL`'i ortamdan vermek gerekir.
5. **`upsertButce`'ye "undefined ise koru" semantiği** — toplu onaydaki `getDonemVeriMap`
   ön-okuması, applyDonemWrite transaction'ı zaten eski dokümanı okuyup merge ettiği için
   bu semantikle tamamen düşürülebilir (şube başına 1 read tasarrufu daha).

## 2026-07-04 backlog turu — yapılanlar

Raporlar incelemesindeki düşük öncelikli bulguların tamamına yakını uygulandı:
ölü kod temizliği (`getButce`, `importSubeVerileri`, BOM regex, ölü literal, `data.campaigns`
fallback); tarih yardımcıları `services/date-utils.js`'e taşındı ve tüm "bugün" hesapları
Europe/Istanbul gününe geçti (backend son_tarih kontrolleri + frontend bütçe kartı/staleDays);
erişim fallback'i adset üst sınırıyla kırpılıyor (paylaşılan kampanyada şişme yok);
`refreshAfterFetch` stale closure'ı store'dan taze okuma ile giderildi; KDV oranı validasyonu +
`DEFAULT_BAKIYE_OPTIONS` ölü verisi temizlendi; `BranchReklamPage` unmount koruması; ortak
`API_BASE` export'u (3 dosya tek kaynağa indi); `toastFetchSonuclari` ortak helper'ı;
toplu onay yazımları paralelleştirildi (Promise.allSettled + kısmi hata raporu);
`getDataVersion` 5 sn TTL mikro-cache (bump lokal cache'i düşürür); override formu yalnızca
değişen bütçe alanını gönderiyor.

## Daha önce ertelenen planlar (hatırlatma)

- R2 custom domain: müşteri görselleri/menü JSON'u proxy yerine R2 CDN'den servis edilecek.
- Analytics: menü + panele GA4/Firebase Analytics, dashboard'da özet (en sona ertelendi).
