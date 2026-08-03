import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Ortam değişkenlerini MUTLAK yolla yükler — süreç hangi dizinden başlatılırsa
// başlatılsın aynı değerleri görsün.
//
// İki dosya, eski backend'deki bölünmenin aynısı:
//   .env       → deploy'a GİDER (Supabase, R2, CRON_AKTIF, MENU_R2_PREFIX…)
//   .env.local → yalnızca lokal (GOOGLE_APPLICATION_CREDENTIALS, PORT).
//                Firebase CLI bu dosyayı deploy'a dahil etmez; zaten Cloud Run
//                PORT'u kendi verir ve kimlik doğrulaması varsayılan servis
//                hesabından gelir.
//
// dotenv mevcut değişkenin üzerine YAZMAZ; bu yüzden .env önce yüklenir ve
// .env.local yalnızca tanımsız olanları doldurur.
//
// CLOUDFLARE WORKERS (Faz 3): dosya sistemi yok — dotenv ÇALIŞTIRILMAZ.
// Değerler `wrangler.toml [vars]` ve `wrangler secret put` üzerinden zaten
// `process.env`e düşüyor (nodejs_compat).
// DİKKAT: burada top-level await KULLANMA. env.js'i import etmeyen modüller
// (ör. middleware/auth.js) o await sırasında değerlendirilip process.env'i
// boş görüyor — bir kez yaşandı, JWKS URL'i "undefined/..." çıktı.
const workersMi = globalThis.navigator?.userAgent === 'Cloudflare-Workers';

let KOK = '';
if (!workersMi) {
    KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    dotenv.config({ path: path.join(KOK, '.env.local') });
    dotenv.config({ path: path.join(KOK, '.env') });
}

export const BACKEND_V2_KOK = KOK;
