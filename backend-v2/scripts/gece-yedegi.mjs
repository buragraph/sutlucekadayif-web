// Gece yedeğinin giriş noktası — GitHub Actions'tan koşar
// (.github/workflows/gece-yedegi.yml). Aynı `yedekAl()` kodu; tek fark
// depolama uygulamasının burada kaydedilmesi (Node → S3 API).
//
// Elle de çalıştırılabilir:  cd backend-v2 && node scripts/gece-yedegi.mjs
import { depoAyarla } from '../config/r2.js';
import { depoS3 } from '../config/depo-s3.js';
import { yedekAl } from '../modules/reports/services/yedek.js';

depoAyarla(depoS3);

const eksik = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL']
    .filter((a) => !process.env[a]);
if (eksik.length) {
    console.error(`Eksik ortam değişkeni: ${eksik.join(', ')}`);
    process.exit(1);
}

const sonuc = await yedekAl();
console.log('[Yedek] tamamlandı:', JSON.stringify({
    key: sonuc.key, satirlar: sonuc.satirlar, boyut: sonuc.boyut, silinen: sonuc.silinen,
}));

// Sağlık kontrolü: yedek beklenenden küçükse (ör. tablo okunamamış) hata ver ki
// Actions kırmızı yansın — sessiz bozuk yedek en tehlikelisi.
if (sonuc.satirlar < 1000) {
    console.error(`Yedek şüpheli küçük: ${sonuc.satirlar} satır`);
    process.exit(1);
}
