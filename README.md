# Sütlüce Kadayıf — Web Platformu

Sütlüce Kadayıf şubelerinin dijital yönetim platformu. QR menü sistemi, şube yönetimi ve ileride şirket içi akademi gibi modüller barındırır.

## Teknoloji Yığını

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **Veritabanı:** Firebase Firestore
- **Auth:** Firebase Authentication
- **Storage:** Cloudflare R2 (planlanan)

## Başlangıç

### 1. Firebase Projesi

1. [Firebase Console](https://console.firebase.google.com) üzerinden proje oluşturun.
2. **Authentication** servisini etkinleştirin (Email/Password).
3. **Firestore Database** oluşturun.
4. Proje ayarlarından **Service Account** key dosyasını indirin.

### 2. Backend Kurulumu

```bash
cd backend
cp .env.example .env
# .env dosyasını kendi bilgilerinizle doldurun
# serviceAccountKey.json dosyasını backend/ klasörüne koyun
npm install
npm run dev
```

Backend `http://localhost:5001` adresinde çalışacaktır.

### 3. Frontend Kurulumu

```bash
cd frontend
cp .env.example .env
# .env dosyasını Firebase client bilgilerinizle doldurun
npm install
npm run dev
```

Frontend `http://localhost:5173` adresinde çalışacaktır.

## Proje Yapısı

```
sutlucekadayif-web/
├── backend/               # Node.js + Express API
│   ├── config/            # Firebase Admin SDK
│   ├── middleware/         # Auth & yetki kontrolü
│   ├── routes/            # API Endpoints
│   └── server.js          # Ana sunucu
├── frontend/              # React + Vite SPA
│   └── src/
│       ├── components/    # UI bileşenleri
│       ├── pages/         # Sayfalar
│       ├── services/      # API çağrıları
│       ├── context/       # Auth context
│       └── index.css      # Stiller
├── shared/                # Ortak modüller
│   └── permissions.js     # Rol-yetki tanımları
└── README.md
```

## API Endpoints

| Endpoint | Method | Auth | Açıklama |
|----------|--------|------|----------|
| `/api/health` | GET | ❌ | Sağlık kontrolü |
| `/api/menu/:subeSlug` | GET | ❌ | Şube menüsü (müşteriye açık) |
| `/api/auth/me` | GET | ✅ | Giriş yapan kullanıcı + şube bilgisi |
| `/api/products` | GET | ✅ | Ortak ürün listesi |
| `/api/products/:id/availability` | PUT | ✅ | Ürün müsaitlik toggle |

## Kullanıcı Rolleri

| Rol | Yetkiler |
|-----|----------|
| `admin` | Tüm işlemler |
| `sube_sahibi` | Kendi şubesinin ürün müsaitliğini yönetme |
