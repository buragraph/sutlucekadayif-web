# XSS Analiz Sonuçları: Sütlüce Kadayıf Web

> SAST 2. faz — Cross-Site Scripting (HTML/JS/DOM sink'lerine kullanıcı girdisi).
> Üç aşamalı akış: recon (sink tespiti) → batched verify (taint izleme) → merge.
> Kapsam: tüm repo (node_modules hariç). Bağlam: `sast/architecture.md`.

## Yönetici Özeti

- Analiz edilen sink noktası: **2 canlı sink** (+ 2 non-sink teyit edildi)
- VULNERABLE: **0**
- LIKELY VULNERABLE: **0**
- NOT VULNERABLE: **6** (2 canlı sink alan-bazında ayrıştırıldı + 2 non-sink)
- NEEDS MANUAL REVIEW: **0**

**Sonuç:** Çapraz-kullanıcı (düşük yetkili → admin) exploit edilebilir XSS **bulunmadı**. Tespit edilen tek gerçek risk, `report-template.js` içinde HTML escape'in tamamen yokluğu; bugün yalnızca admin ilgili alanları yazabildiği için self-XSS düzeyinde (Düşük), ancak latent bir Stored XSS riski taşıyor. Bir savunma-derinliği (defense-in-depth) sertleştirmesi olarak escape helper eklenmesi önerilir.

**Recon taramaları (0 sonuç verenler):** `innerHTML`/`outerHTML`/`document.write`/`insertAdjacentHTML`, `eval`/`new Function`/string-`setTimeout`, DOM kaynakları (`location.search/hash/href`, `document.referrer`, `window.name`, `postMessage`, `URLSearchParams`), markdown/HTML-render kütüphaneleri (marked, DOMPurify, sanitize-html, html-react-parser) — hiçbiri yok. Public menü endpoint'i (`/api/menu/:subeSlug`) yalnızca **JSON** döner; server-side HTML üretmez, ürün verisi React frontend'te otomatik-escape ile render edilir.

---

## Bulgular

### NOT VULNERABLE — Rapor HTML şablonunda `sube.ad` ham interpolasyonu (server-side template literal) — CONFIRMED

- **Dosya**: `/Users/burak/Desktop/Burak İşler/kişisel/Sutluce/sutlucekadayif-web/backend/modules/reports/services/report-template.js` (satır 379)
- **Endpoint/fonksiyon/bileşen**: `generateReportHtml(data)` → `POST /api/reports/preview` (routes.js:208-209, `res.type('html').send(html)`) ve `POST /api/reports/generate-pdf` + bulk (Puppeteer `page.setContent`, `generate-pdf.js:31`)
- **XSS türü**: (potansiyel) Stored
- **Sorun**: Satır 379'da `<span class="branch">${sube.ad.replace(/Sütlüce Kadayıf\s*/i, '') || sube.kod}</span>` — `sube.ad` HTML escape edilmeden şablona basılıyor. Dosyanın tamamında HİÇBİR HTML escape helper'ı (escape-html, encodeURIComponent vb.) yok. Yani read/render bacağı escape'siz (bu bacak TRUE).
- **Taint izi (source→sink)**: `subeler/{kod}.ad` (Firestore) → `getSubeByKod` → `buildReportData` → `result.sube.ad` (report-data.js:122) → `generateReportHtml` → satır 379 ham `${sube.ad...}` → `res.send(html)` / Puppeteer `setContent`.
- **Sömürü senaryosu**: `sube.ad`'yi yazan TÜM yollar admin yetkisiyle korunuyor; alt-yetkili (sube_sahibi) bu alanı set edemez:
  - `POST /api/branches`, `PUT /api/branches/:slug` → `branches.create`/`branches.edit` = **yalnızca admin** (permissions.js:30-31). `ad.trim()` dışında filtre yok.
  - `POST /api/reports/sube`, `PUT /api/reports/sube/:kod` → `reports.manage` = **yalnızca admin** (permissions.js:58). `upsertSube`/`updateSube` (db.js:43-72) `ad`'yi filtresiz yazar.
  - Onboarding (`POST /api/onboarding/complete`, sube_sahibi'ye açık): yazılabilir alanlar `SUBE_ALANLARI = ['il','ilce','adres']` (onboarding.js:25). `ad` bu listede DEĞİL; `upsertKonum`'a ad mevcut dokümandan alınır (onboarding.js:107). Şube sahibi şube adını değiştiremez.

  Sonuç: yazan da (admin), okuyan da yalnızca admin girdisiyle karşılaşır. **Ayrıcalık sınırı geçilmiyor** → gerçek anlamda self-XSS. Stored XSS'in iki bacağından "düşük yetkili write" bacağı FALSE.
- **Etki**: Yalnızca admin kendi verisine script gömebilir; bunu yine admin görür. Ayrıcalık yükseltmesi veya çapraz-kullanıcı ele geçirme yok. Not: Puppeteer (headless Chromium) script çalıştırırsa SSRF/yerel dosya okuma teorik olarak mümkün — ancak tetikleyen zaten tam yetkili admin olduğu için ek yetki kazanımı yok.
- **Önem**: Düşük (sertleştirme / defense-in-depth; exploit edilebilir ayrıcalık sınırı yok — ancak latent Stored XSS riski)
- **Çözüm önerisi**: Şablonun başına bir `escapeHtml(s)` helper ekleyip (`& < > " '` → HTML entity) `sube.ad`'yi ve ileride kullanıcı-kaynaklı olabilecek her serbest-metin alanı sarmalayın. Ek olarak branch write handler'larında `ad` için `<>` reddeden basit doğrulama, "donmuş" latent riski kapatır.
- **Dinamik test / PoC**: Admin olarak `PUT /api/reports/sube/istanbul` `{ "ad": "Sütlüce Kadayıf <img src=x onerror=alert(1)>" }` → `POST /api/reports/preview` `{ "subeKod":"istanbul", ... }` yanıtındaki HTML'de payload ham çıkar. (Yalnızca admin→admin; gerçek tehdit değil.)

### NOT VULNERABLE — Rapor şablonunda `donem.label` — CONFIRMED

- **Dosya**: `/Users/burak/Desktop/Burak İşler/kişisel/Sutluce/sutlucekadayif-web/backend/modules/reports/services/report-template.js` (satır 382)
- **Endpoint/fonksiyon/bileşen**: `generateReportHtml` → `<span>${donem.label}</span>`
- **Sorun/analiz**: `donem.label` Firestore'da SAKLANMAZ; `report-data.js:128`'de `formatDonemLabel(donemBaslangic, donemBitis)` ile hesaplanır (satır 144-163). Fonksiyon girdileri yalnızca `new Date(...)` içine sokar ve çıktı olarak `getDate()`/`getFullYear()` (sayılar) + sabit ay-adı dizisinden (`Ocak..Aralık`) parça üretir. Kullanıcının verdiği string çıktıya aktarılmaz.
- **Taint izi**: `req.body.donemBaslangic/Bitis` → `new Date()` → sayısal getter'lar / sabit dizi → `label`. Geçersiz tarihte en fazla `NaN`/`undefined` üretir; HTML meta-karakteri taşıyamaz.
- **XSS türü**: —
- **Etki**: Yok.
- **Önem**: Düşük (bulgu yok)
- **Çözüm önerisi**: Gerek yok.
- **Dinamik test / PoC**: `donemBaslangic="<script>"` → label `NaN NaN undefined` benzeri; injection yok.

### NOT VULNERABLE — Rapor şablonunda sayısal alanlar (formatNumber/formatCurrency) — CONFIRMED

- **Dosya**: `/Users/burak/Desktop/Burak İşler/kişisel/Sutluce/sutlucekadayif-web/backend/modules/reports/services/report-template.js` (satır 4-12; kullanım: meta.*, google.*, bütçe alanları)
- **Sorun/analiz**: `formatNumber` = `Intl.NumberFormat('tr-TR').format(Math.round(n))`; `formatCurrency` = `Intl.NumberFormat(...).format(n)`. `Intl.NumberFormat.format` argümanı Number'a coerce eder; string/HTML gelirse `NaN` → `"NaN"` üretir, HTML meta-karakteri geçmez. Değerler zaten Meta/Google otomatik çekiminden (sayı) veya admin bütçe override'larından gelir; override PUT'u `reports.manage` (admin) korumalı ve yalnızca bütçe alanlarını tutar (CLAUDE.md kural 2). Şablonda ayrıca `(planlananButce||0)+...` aritmetiği coercion uygular.
- **XSS türü**: —
- **Etki**: Yok.
- **Önem**: Düşük (bulgu yok)
- **Çözüm önerisi**: Gerek yok.

### NOT VULNERABLE — Chart teması `<style>` dangerouslySetInnerHTML — CONFIRMED

- **Dosya**: `/Users/burak/Desktop/Burak İşler/kişisel/Sutluce/sutlucekadayif-web/frontend/src/components/ui/chart.jsx` (satır 45-72)
- **Endpoint/fonksiyon/bileşen**: `ChartStyle({ id, config })` — `<style dangerouslySetInnerHTML>` içinde `id`, config `key` ve `color` interpolasyonu.
- **XSS türü**: DOM-based (potansiyel)
- **Sorun/analiz**: `dangerouslySetInnerHTML` kullanılıyor, ancak beslenen tüm değerler geliştirici-kaynaklı. Projede `ChartContainer`/`ChartStyle`'ın TEK kullanımı `HarcamaGrafik.jsx` (grep ile teyit). `config = chartConfig` satır 8-11'de sabit tanımlı (`{ harcama: {label:'Harcama', color:'var(--chart-1)'}, butce:{...,color:'var(--chart-3)'} }`). `id` → `chart-${id ?? useId}` (ChartContainer:23), `id` prop hiç geçilmiyor → React `useId`. `color` sabit CSS değişkeni. Firestore/API/kullanıcı girdisi hiçbir alana akmıyor.
- **Taint izi**: Yok — tüm kaynaklar hardcoded.
- **Etki**: Yok.
- **Önem**: Düşük (bulgu yok)
- **Çözüm önerisi**: Mevcut haliyle güvenli. İleride `config`/`color` API'den beslenirse yeniden değerlendirilmeli.

### NOT VULNERABLE — `res.send('<script>window.close();</script>')` (Google OAuth callback) — CONFIRMED

- **Dosya**: `/Users/burak/Desktop/Burak İşler/kişisel/Sutluce/sutlucekadayif-web/backend/modules/reports/routes.js` (satır 100)
- **Analiz**: Tamamen statik string; hiçbir interpolasyon veya `req.query`/`req.body` içeriği yok. `handleGoogleCallback(req.query.code)` çağrılıyor ama `code` yanıta yazılmıyor. Injection yüzeyi yok.
- **XSS türü**: —
- **Önem**: Düşük (bulgu yok)

### NOT VULNERABLE — VideoPlayer `parsedId` (Plyr/YT) — CONFIRMED

- **Dosya**: `/Users/burak/Desktop/Burak İşler/kişisel/Sutluce/sutlucekadayif-web/frontend/src/modules/academy/components/VideoPlayer.jsx` (satır 20-21, 57-68, 173) + `utils/youtube.js`
- **Analiz**: `parseYouTubeInput` çoğu yolda `[a-zA-Z0-9_-]{11}` / playlist regex ile kısıtlıyor; ancak son fallback (youtube.js:33) eşleşme yoksa ham `input`'u döndürür → `parsedId` teorik olarak keyfi string olabilir. `parsedId` iki yere gidiyor: (a) `data-plyr-embed-id={parsedId}` → React JSX attribute, **otomatik escape** edilir (ham HTML sink değil); (b) `window.YT.Player` `playerVars.list` ve Plyr config nesnesi → JS obje alanı, DOM'a ham HTML olarak yazılmaz. Kodda `innerHTML`/`dangerouslySetInnerHTML`/`document.write` yok. Ayrıca `videoId` kaynağı akademi ders içeriği = `academy.manage` (**yalnızca admin**, permissions.js:47) tarafından yazılır. Ne ham HTML/DOM sink'i var, ne de düşük-yetkili yazma yolu.
- **Not**: Sertleştirme için `parseYouTubeInput` fallback'inde ham input yerine `null`/`{type:null}` döndürülebilir.
- **XSS türü**: —
- **Önem**: Düşük (bulgu yok)

---

## Genel Değerlendirme ve Öneri

Uygulamanın XSS yüzeyi dar: DOM manipülasyon sink'i (innerHTML, document.write, eval) yok; React JSX her yerde otomatik escape sağlıyor; tek `dangerouslySetInnerHTML` (chart `<style>`) geliştirici-sabit config ile besleniyor; public menü JSON döner. Tek server-side HTML üretimi rapor şablonu.

**Tek eyleme dönük öneri (defense-in-depth):** `backend/modules/reports/services/report-template.js` içine bir `escapeHtml()` helper ekleyip `sube.ad` (ve ileride eklenebilecek serbest-metin alanları) sarmalamak. Bugün yalnızca admin `sube.ad`'yi yazabildiği için exploit yok; ancak şube adını sube_sahibi düzenlemesine açan herhangi bir gelecekteki değişiklik, bu satırı doğrudan Stored XSS'e (admin raporu + Puppeteer PDF/headless-Chromium bağlamı) çevirir. Escape'i şimdiden eklemek bu latent riski kapatır.
