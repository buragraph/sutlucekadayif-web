# JWT Güvenliği — Sonuç

**Durum: UYGULANAMAZ** (elle JWT işleme yok)

## Neden

Elle JWT üretimi/doğrulaması yok. Token yaşam döngüsünü tamamen Firebase Auth
(Admin SDK) yönetir.

## Doğrulama

- `grep -rniE "jsonwebtoken|jose|jwt\.(verify|sign|decode)"` → **hiç eşleşme yok**.
- `package.json`'da `jsonwebtoken` / `jose` **yok**.
- Tek doğrulama noktası: `backend/middleware/auth.js:19`
  `const decodedToken = await auth.verifyIdToken(token);` — Firebase Admin SDK.
  SDK imza doğrulaması, algoritma seçimi, anahtar rotasyonu ve süre kontrolünü kendi
  yönetir. Bu nedenle algoritma karışıklığı (`alg: none`/RS256↔HS256), zayıf sır,
  imza atlama, header enjeksiyonu gibi klasik JWT zafiyetleri **uygulanamaz**.
- Özel token/claim yazımı: `routes/users.js:99` ve `:155`
  `auth.setCustomUserClaims(...)` — yine SDK üzerinden; elle imzalama değil.
  `createCustomToken` kullanımı yok.

## Not: custom claim varsayılanı (JWT zafiyeti DEĞİL)

`auth.js` içinde doğrulanmış token'dan rol okunurken varsayılan atanıyor:
`role: decodedToken.role || 'sube_sahibi'` (satır 26). Ayrıca
`routes/users.js:155` claim yazarken `role: data.role || 'sube_sahibi'` kullanır.

Bu bir JWT/kriptografik zafiyet değildir (token yine de geçerli imzalı olmalı). Ancak
**yetkilendirme tasarımı** açısından not düşülür: `role` claim'i olmayan geçerli bir
kullanıcı otomatik `sube_sahibi` (şube sahibi) rolüne düşer — "fail-open" varsayılan.
`sube_sahibi` rolünün `users.*` gibi geniş izinleri olduğu (architecture.md, kısıt
handler içi) düşünülürse, bu davranış `missingauth` / yetki yükseltme kapsamında
değerlendirilmeye değer. JWT sınıfının konusu değildir.

## Sonuç

Elle JWT işleme olmadığı ve Firebase SDK token'ları güvenli yönettiği için JWT sınıfı
uygulanamaz. Custom claim varsayılanı ayrı (missingauth) not olarak bırakıldı.
