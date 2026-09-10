# Hardcoded Secrets Analiz Sonuçları: Sütlüce Kadayıf Web

## Yönetici Özeti

- İncelenen aday: 4
- Vulnerable (Açık): 0
- Likely Vulnerable (Olası açık): 0
- Not Vulnerable (Açık değil): 4
- Needs Manual Review (Elle inceleme): 0

**Sonuç:** Public/client koda sızmış **gerçek bir sunucu sırrı bulunmadı.** Client
bundle'da görünen Firebase web `apiKey` normaldir (tasarımca public). Bütün sunucu
sırları (`R2_*`, Meta token, Google OAuth secret, Firebase service account)
`process.env` / Firestore üzerinden geliyor; kaynak kodda literal değer yok.
`.env.example` dosyaları yalnızca yer tutucu içeriyor. Git'te dist/build bundle
takip edilmiyor; yerel `frontend/dist` ayrıca doğrulandı.

---

## Bulgular

### [NOT VULNERABLE] Firebase web apiKey — client bundle'da (normal, sır değil)
- **Dosya**: `frontend/src/firebase.js:6` (kaynak) ve `frontend/dist/assets/index-BZ77qthk.js:~35` (derlenmiş bundle)
- **Değer**: `AIzaSyBWLBxm8****...ZVtc` (+ `authDomain: sutlucekadayif-web.firebaseapp.com`, `projectId: sutlucekadayif-web`, `messagingSenderId: 189502808971`, `appId: 1:189502808971:web:...`)
- **Neden açık değil**: Bu, standart Firebase Client SDK yapılandırmasıdır ve
  tasarımı gereği tarayıcıya gömülür. Firebase web apiKey bir yetki sırrı değildir;
  erişim `firestore.rules` (client için `allow read, write: if false`) ve Firebase
  Auth kuralları ile korunur. Kaynakta değer `import.meta.env.VITE_FIREBASE_API_KEY`
  üzerinden geliyor; Vite build sırasında env değerini bundle'a gömüyor (beklenen
  davranış). Mimari belgesindeki tespitle (bkz. `architecture.md` §Sensitive Data
  Inventory) uyumlu. **Aksiyon gerekmez.**

### [NOT VULNERABLE] Google Client Secret alanı — yer tutucu (`GOCSPX-...`)
- **Dosya**: `frontend/public/reports/index.html:666`, `frontend/src/modules/reports/components/ReportsModals.jsx:84`
- **Neden açık değil**: `GOCSPX-...` gerçek bir değer değil; `<input type="password">`
  alanının `placeholder` metnidir. Gerçek Google Client Secret admin tarafından form
  aracılığıyla girilir ve backend'de Firestore `reports/settings`'e yazılır; response'ta
  yalnızca maskeli (`googleClientSecretMasked`) döner. Client'ta hardcoded gerçek değer yok.

### [NOT VULNERABLE] Meta / Google token akışı — kullanıcı girdisi / localStorage kaynaklı
- **Dosya**: `frontend/public/reports/index.html` (ör. satır 1544, 1601, 1701, 1857, 1867, 2297)
- **Neden açık değil**: Kullanılan `token`/`accessToken` değerleri hardcoded değil;
  `_appSettings.metaApiToken` (backend `.../settings` yanıtından, satır 1274) veya form
  girdisinden (`document.getElementById('settingsMetaToken').value`, satır 1857) geliyor.
  Statik dosyada gömülü gerçek `EAA...`/`AIza...`/`GOCSPX-...` token bulunamadı
  (regex taraması boş döndü). Not: bu token'ların tarayıcıya inip Firestore'a
  yazılması bir mimari/gizlilik konusudur ancak "hardcoded secret" değildir.

### [NOT VULNERABLE] AD_ACCOUNT_ID — backend'de hardcoded tanımlayıcı (sır değil)
- **Dosya**: `backend/modules/reports/services/meta-api.js:11` — `const AD_ACCOUNT_ID = 'act_1095694041713379';`
- **Neden açık değil**: (1) Sır değil — Meta reklam hesabı tanımlayıcısıdır, tek başına
  yetki vermez (erişim `accessToken` ile sağlanır). (2) Backend-only kod; client'a
  gömülmez. İki gerekçeyle de bu skill kapsamında bulgu değildir.
  **Not:** İyi uygulama açısından bu tanımlayıcının da `process.env`'e taşınması
  değerlendirilebilir (fonksiyonel/gizlilik gerekçesiyle, güvenlik açığı değil).

---

## Doğrulama Kapsamı (negatif kanıt)

- **Yüksek güven regex taraması** (`AKIA…`, `AIza…`, `ghp_/github_pat_`, `xox[bp]-`,
  `sk_live_/sk_test_`, `SG.…`, `GOCSPX-…`, `glpat-`, `sk-ant-/sk-proj-`,
  `-----BEGIN … PRIVATE KEY-----`): tüm `frontend/src`, `frontend/public`,
  `frontend/dist`, `backend/**` üzerinde çalıştırıldı — gerçek değer içeren tek eşleşme
  Firebase web apiKey (yukarıda, normal).
- **Değişken adı desenleri** (`secret|password|token|api_key|client_secret|private_key|
  access_key = "…"`): client ve backend script/config'lerde literal atama bulunamadı;
  tümü `process.env` / `import.meta.env`.
- **Backend sır kaynakları**: `config/r2.js` (R2 anahtarları `process.env`),
  `config/firebase.js` (service account `GOOGLE_APPLICATION_CREDENTIALS` yolundan /
  bulut default credential) — hardcoded değer yok.
- **Env örnekleri**: `backend/.env.example`, `frontend/.env.example` yalnızca
  `your-api-key` gibi yer tutucular içeriyor.
- **Dist/bundle**: Git'te derlenmiş bundle takip edilmiyor; yerel `frontend/dist`
  bundle'ı ayrıca tarandı, ek sır çıkmadı.
