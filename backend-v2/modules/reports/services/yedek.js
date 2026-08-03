import { gzipSync } from 'node:zlib';
import { supabase } from '../../../config/supabase.js';
import { uploadFile, deleteFile, listFiles } from '../../../config/r2.js';

// ─── Gece yedeği ───
// Free planda otomatik veritabanı yedeği YOK; bu iş o boşluğu kapatır.
//
// NOT: adı "pg_dump" olsa da Firebase Functions çalışma ortamında pg_dump
// BİNARY'si yok. Onun yerine MANTIKSAL dökümü supabase-js ile alıyoruz: her
// tablo satır satır JSON'a yazılıyor. Çıktı `scripts/supabase-import` ile aynı
// şekilde geri yüklenebilir (upsert). Şema yedeği `supabase/migrations/`
// altında zaten sürüm kontrolünde.

const PREFIX = 'yedek/pg';
const SAKLANAN_DOSYA = 14;

// Sıra FK bağımlılığına göre — geri yüklerken aynı sırayla upsert edilir.
const TABLOLAR = [
    'subeler', 'kategoriler', 'urunler', 'urun_sube', 'donemler', 'kampanyalar',
    'eslesmeler', 'ayarlar', 'medya', 'medya_klasorler', 'kurslar', 'dersler',
    'ilerleme', 'kullanici_sube', 'franchise_basvurulari', 'geri_bildirimler',
    'is_basvurulari', 'sube_notlari',
];

const SAYFA = 1000;

async function tabloOku(tablo) {
    const satirlar = [];
    for (let offset = 0; ; offset += SAYFA) {
        const { data, error } = await supabase.from(tablo).select('*').range(offset, offset + SAYFA - 1);
        if (error) throw new Error(`${tablo}: ${error.message}`);
        satirlar.push(...data);
        if (data.length < SAYFA) break;
    }
    return satirlar;
}

/** Eski yedekleri budar — son SAKLANAN_DOSYA dosya kalır. */
async function eskileriSil() {
    const liste = await listFiles(`${PREFIX}/`);
    const dosyalar = liste.map((o) => o.key).sort(); // ad = tarih → sözlüksel = kronolojik
    const silinecek = dosyalar.slice(0, Math.max(0, dosyalar.length - SAKLANAN_DOSYA));
    for (const key of silinecek) {
        await deleteFile(key).catch((e) => console.error(`[Yedek] ${key} silinemedi:`, e.message));
    }
    return silinecek.length;
}

/**
 * Tüm tabloları tek dosyaya döker, gzip'leyip R2'ye yazar.
 * @param {string} tarih - YYYY-MM-DD (verilmezse bugün, UTC)
 */
export async function yedekAl(tarih = new Date().toISOString().slice(0, 10)) {
    const baslangic = Date.now();
    const icerik = { alindi: new Date().toISOString(), tablolar: {} };
    const sayimlar = {};

    for (const tablo of TABLOLAR) {
        const satirlar = await tabloOku(tablo);
        icerik.tablolar[tablo] = satirlar;
        sayimlar[tablo] = satirlar.length;
    }

    const gz = gzipSync(Buffer.from(JSON.stringify(icerik)), { level: 9 });
    const key = `${PREFIX}/${tarih}.json.gz`;
    await uploadFile(gz, key, 'application/gzip');

    const silinen = await eskileriSil().catch((e) => {
        console.error('[Yedek] Budama hatası:', e.message);
        return 0;
    });

    const toplamSatir = Object.values(sayimlar).reduce((t, n) => t + n, 0);
    console.log(`[Yedek] ${key} — ${toplamSatir} satır, ${(gz.length / 1024).toFixed(0)} KB, ${((Date.now() - baslangic) / 1000).toFixed(1)} sn, ${silinen} eski dosya silindi`);
    return { key, boyut: gz.length, satirlar: toplamSatir, sayimlar, silinen };
}
