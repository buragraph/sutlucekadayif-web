// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Statik site — Cloudflare Pages hedefi. Backend/CMS ayrı (Firebase Functions).
export default defineConfig({
  site: 'https://sutlucekadayif.com',
  // Dev sunucusu: ortamdan gelen PORT'u kullan (4321 doluysa araç başka port atar)
  server: { port: Number(process.env.PORT) || 4321 },

  // Eski WordPress yolu → yeni sayfa. QR menüsünün footer'ı, Google dizini ve
  // basılı materyaller hâlâ /franchise-basvurusu adresini gösteriyor; domain bu
  // siteye çevrildiğinde 404 vermesin diye yönlendiriyoruz.
  // (qr. subdomain'indeki formlar buraya dahil değil — onlar ayrı bir site.)
  redirects: {
    '/franchise-basvurusu': '/franchise',
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
