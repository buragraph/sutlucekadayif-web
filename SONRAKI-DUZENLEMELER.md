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

1. **Ölü kod: `getButce` (db.js:252)** — artık hiçbir yerden çağrılmıyor, kaldırılabilir.
2. **Tarih yardımcıları ortak modüle** — `scheduled-fetch.js` içindeki `gunFarki`/`tarihObj` ve `routes.js` tarafındaki benzer inline tarih mantığı ortak bir `services/date-utils.js` altında toplanabilir; ileride sınır/saat dilimi semantiği tek yerden değişir.
3. **`budget-routes.js` tekrar eden kalıplar** — durum kontrolü (`durum !== 'gonderildi' && durum !== 'onaylandi'`), son kampanya seçimi (`donem_baslangic` sıralaması) ve kuruş yuvarlama (`Math.round(x*100)/100`) birden çok yerde inline; küçük helper'lara çekilebilir.
4. **Override formu tüm alanları donduruyor** — `ReportsModals.jsx` düzenleme formu üç bütçe alanını her kayıtta (kullanıcı değiştirmese bile) override olarak yazıyor; yalnızca değişen alanı göndermek daha doğru olur (backend artık kısmi payload'ı güvenle destekliyor).
5. **`getDataVersion` istek başına okunuyor** — bütçe rotalarındaki cache doğrulaması her istekte `reports/meta` dokümanını okuyor; kısa TTL'li bellek içi cache ile okuma azaltılabilir.

## Daha önce ertelenen planlar (hatırlatma)

- R2 custom domain: müşteri görselleri/menü JSON'u proxy yerine R2 CDN'den servis edilecek.
- Analytics: menü + panele GA4/Firebase Analytics, dashboard'da özet (en sona ertelendi).
