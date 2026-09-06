/**
 * Kurs kapak görsellerini WordPress akademisinden alıp R2'ye taşır.
 *
 * NEDEN: Kapak alanı panelde yeni açıldı ama 7 kursun hiçbirinde görsel yoktu;
 * kurs kartları yer tutucu ikonla çıkıyordu. Görseller WP'de duruyor
 * (MasterStudy `courses[].image.url`) ve WordPress kapatılacak — şimdi alınmazsa
 * gidecekler.
 *
 * BİÇİM: Panelden yükleme tarayıcıda WebP'e çeviriyor (max 800px, q80 — sunucuda
 * sharp yok, bkz. routes/upload.js). Betik aynı dönüşümü `cwebp` ile yapar;
 * WP'deki dosyalar kart için fazla ağırdı (biri 1.8 MB). cwebp yoksa betik durur,
 * sıkıştırmadan yüklemez.
 *
 * EŞLEŞME: kurs adı üzerinden (NFC + boşluk normalize). Başlıklar veritabanında
 * NFD olabiliyor — bkz. akademi tarafındaki aynı tuzak.
 *
 * Kullanım: node scripts/gecis/akademi-kurs-kapaklari.mjs <liste.txt> [--uygula]
 *   Satır biçimi: wpId|kurs adı|görsel adresi
 */
import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { supabase } from '../../config/supabase.js';
import { depoAyarla, uploadFile } from '../../config/r2.js';
import { depoS3 } from '../../config/depo-s3.js';

depoAyarla(depoS3);
const [dosya, ...bayraklar] = process.argv.slice(2);
const UYGULA = bayraklar.includes('--uygula');
const YENILE = bayraklar.includes('--yenile');   // kapağı olanların üzerine yaz
if (!dosya) { console.error('Kullanım: node akademi-kurs-kapaklari.mjs <liste.txt> [--uygula]'); process.exit(1); }

const ad = (s) => String(s ?? '').normalize('NFC').replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim();

// Panelin tarayıcı tarafındaki dönüşümüyle AYNI parametreler (utils/gorsel.js):
// en fazla 800px genişlik (küçüğü büyütme), WebP kalite 80.
function webpYap(govde, uzanti) {
    const gecici = path.join(os.tmpdir(), `kapak-${crypto.randomUUID()}`);
    const girdi = `${gecici}.${uzanti}`;
    const cikti = `${gecici}.webp`;
    try {
        fs.writeFileSync(girdi, govde);
        execFileSync('cwebp', ['-quiet', '-q', '80', '-resize', '800', '0', girdi, '-o', cikti]);
        return fs.readFileSync(cikti);
    } finally {
        fs.rmSync(girdi, { force: true });
        fs.rmSync(cikti, { force: true });
    }
}
const UZANTI = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const satirlar = fs.readFileSync(dosya, 'utf8').trim().split('\n').filter(Boolean)
    .map((s) => { const [wpId, baslik, url] = s.split('|'); return { wpId, baslik, url }; });

const { data: kurslar, error } = await supabase.from('kurslar').select('id, title, thumbnail_url');
if (error) throw new Error(`kurslar okunamadı: ${error.message}`);

const plan = []; const eslesmeyen = [];
for (const s of satirlar) {
    const k = kurslar.find((x) => ad(x.title) === ad(s.baslik));
    if (!k) { eslesmeyen.push(s.baslik); continue; }
    plan.push({ ...s, kursId: k.id, kursAd: k.title, mevcut: k.thumbnail_url || null });
}

console.log('— Plan —');
plan.forEach((p) => console.log(`  ${ad(p.kursAd).slice(0, 44).padEnd(46)} ${p.mevcut ? '(kapağı VAR, atlanacak)' : '← ' + p.url.split('/').pop()}`));
if (eslesmeyen.length) { console.log('  EŞLEŞMEYEN:'); eslesmeyen.forEach((b) => console.log('    ' + b)); }
const yapilacak = plan.filter((p) => YENILE || !p.mevcut);
console.log(`\nkurs: ${kurslar.length} | eşleşen: ${plan.length} | kapak yüklenecek: ${yapilacak.length}`);

if (!UYGULA) { console.log('\n(kuru çalıştırma — hiçbir şey yazılmadı; --uygula ekle)'); process.exit(0); }

for (const p of yapilacak) {
    const r = await fetch(p.url);
    if (!r.ok) { console.error(`✗ ${p.kursAd}: indirilemedi (${r.status})`); continue; }
    const tur = r.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
    const uzanti = UZANTI[tur];
    if (!uzanti) { console.error(`✗ ${p.kursAd}: beklenmeyen tür ${tur}`); continue; }
    const ham = Buffer.from(await r.arrayBuffer());
    const govde = webpYap(ham, uzanti);

    const key = `academy/${crypto.randomUUID()}.webp`;
    const yeniUrl = await uploadFile(govde, key, 'image/webp');
    const { error: e } = await supabase.from('kurslar')
        .update({ thumbnail_url: yeniUrl, guncelleme: new Date().toISOString() }).eq('id', p.kursId);
    if (e) throw new Error(`${p.kursAd}: ${e.message}`);
    console.log(`✓ ${ad(p.kursAd).slice(0, 44).padEnd(46)} ${(ham.length / 1024).toFixed(0)} → ${(govde.length / 1024).toFixed(0)} KB`);
    // Sıkıştırmasız yüklenmiş eski kapak varsa R2'den kaldır (yalnız bu betiğin
    // ürettiği academy/ nesneleri; başka yerde kullanılmıyorlar).
    if (p.mevcut && p.mevcut.includes('/academy/')) {
        const { deleteFile } = await import('../../config/r2.js');
        await deleteFile(p.mevcut.replace(/^.*r2\.dev\//, '')).catch(() => {});
    }
}
console.log('\nBitti.');
