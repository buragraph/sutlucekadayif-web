/**
 * WordPress akademisindeki ders ilerlemesini sisteme taşır (adım 3).
 *
 * VERİ KAYNAĞI: WP'nin `wp_stm_lms_user_lessons` tablosuna erişimimiz yok;
 * veri MasterStudy REST'inden çekildi (POST analytics/course/{id}/lessons-by-users
 * → kullanıcı × ders 0/1 matrisi) ve scratchpad'e düz metin olarak yazıldı.
 * Betik o dosyaları okur; WordPress'e HİÇ bağlanmaz, tekrar çalıştırılabilir.
 *
 * ÜÇ DOSYA:
 *   ders-esleme.json  WP ders id → bizdeki ders id (88/88, elle doğrulanmış
 *                     4 çift dahil — bkz. taşıma notları)
 *   kayit.txt         kurs|wpUser|eposta|yuzde|start_time  (238 kayıt)
 *   matris*.txt       kurs|wpUser|tamamlananlar  — 53790'da yer kazanmak için
 *                     indeks aralığı ("0-27,50-55"), başlıktaki #KOL sırasına göre
 *
 * HESABI OLMAYAN KULLANICI: 180 e-postanın 143'ünün bizde hesabı yok. Onların
 * satırları `ilerleme_devir`e e-posta anahtarıyla yazılır; hesap açılınca
 * `ilerlemeDevral` devreye girer (bkz. modules/academy/devir.js). Böylece WP
 * kapandığında veri kaybolmaz, ama kimse için hesap açılmış olmaz.
 *
 * completed_at: WP ders bazında zaman tutmuyor — kursa kayıt zamanı yazılır,
 * `kaynak='wordpress'` ile işaretlenir. Ayrıntı: 0011_ilerleme_devir.sql.
 *
 * Kullanım: node scripts/gecis/akademi-ilerleme.mjs <veri-dizini> [--uygula]
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { supabase } from '../../config/supabase.js';

const [dizin, ...bayraklar] = process.argv.slice(2);
const UYGULA = bayraklar.includes('--uygula');
if (!dizin) { console.error('Kullanım: node akademi-ilerleme.mjs <veri-dizini> [--uygula]'); process.exit(1); }

const oku = (ad) => fs.readFileSync(path.join(dizin, ad), 'utf8');
const esleme = JSON.parse(oku('ders-esleme.json'));   // [{wpDers, bizDers, bizKurs, ...}]
const dersHarita = new Map(esleme.map((e) => [String(e.wpDers), e]));

// kurs|wpUser → { eposta, start_time }
const kayitlar = new Map();
for (const satir of oku('kayit.txt').trim().split('\n')) {
    const [kurs, kul, eposta, , baslangic] = satir.split('|');
    kayitlar.set(`${kurs}|${kul}`, { eposta: eposta.toLowerCase(), baslangic: Number(baslangic) });
}

/** "0-27,50,52-54" → tamamlanan WP ders id'leri (#KOL sırasına göre) */
function acilim(deger, kolonlar) {
    if (!deger) return [];
    if (!kolonlar) return deger.split(',').filter(Boolean);       // düz id listesi
    const cikti = [];
    for (const parca of deger.split(',').filter(Boolean)) {
        const [a, b] = parca.split('-').map(Number);
        for (let i = a; i <= (b ?? a); i++) cikti.push(kolonlar[i]);
    }
    return cikti;
}

const satirlar = [];
const uyari = [];
for (const dosya of fs.readdirSync(dizin).filter((f) => /^matris.*\.txt$/.test(f))) {
    let kolonlar = null;
    for (const satir of oku(dosya).trim().split('\n')) {
        if (satir.startsWith('#KOL=')) { kolonlar = satir.slice(5).split(','); continue; }
        const [kurs, kul, deger] = satir.split('|');
        const kayit = kayitlar.get(`${kurs}|${kul}`);
        if (!kayit) { uyari.push(`${dosya}: kayıt yok ${kurs}|${kul}`); continue; }
        for (const wpDers of acilim(deger, kolonlar)) {
            const d = dersHarita.get(String(wpDers));
            if (!d) { uyari.push(`${dosya}: ders eşleşmedi ${wpDers}`); continue; }
            satirlar.push({
                eposta: kayit.eposta, ders_id: d.bizDers, kurs_id: d.bizKurs,
                completed_at: new Date(kayit.baslangic * 1000).toISOString(),
            });
        }
    }
}

// Aynı ders farklı kurslardan iki kez gelmez ama e-posta+ders tekilliği garanti edilmeli.
const tekil = new Map();
for (const s of satirlar) tekil.set(`${s.eposta}|${s.ders_id}`, s);
const hepsi = [...tekil.values()];

// ── E-posta → uid ─────────────────────────────────────────────────────────
let sayfa = 1; const authKullanicilar = [];
for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: sayfa, perPage: 1000 });
    if (error) throw new Error(`kullanıcılar okunamadı: ${error.message}`);
    authKullanicilar.push(...data.users);
    if (data.users.length < 1000) break;
    sayfa++;
}
const uidHarita = new Map(authKullanicilar.map((u) => [(u.email || '').toLowerCase(), u.id]));

const bagli = hepsi.filter((s) => uidHarita.has(s.eposta));
const bekleyen = hepsi.filter((s) => !uidHarita.has(s.eposta));
const bagliKisi = new Set(bagli.map((s) => s.eposta)).size;
const bekleyenKisi = new Set(bekleyen.map((s) => s.eposta)).size;

console.log('— Plan —');
console.log(`  ders eşlemesi: ${esleme.length} | kurs kaydı: ${kayitlar.size} | tamamlama satırı: ${hepsi.length}`);
console.log(`  ilerleme       ← ${bagli.length} satır / ${bagliKisi} kişi (hesabı var)`);
console.log(`  ilerleme_devir ← ${bekleyen.length} satır / ${bekleyenKisi} kişi (hesap açılınca bağlanacak)`);
if (uyari.length) { console.log(`  UYARI ${uyari.length}:`); [...new Set(uyari)].slice(0, 20).forEach((u) => console.log('    ' + u)); }

if (!UYGULA) { console.log('\n(kuru çalıştırma — hiçbir şey yazılmadı; --uygula ekle)'); process.exit(uyari.length ? 1 : 0); }
if (uyari.length) { console.error('\nUyarılar giderilmeden uygulanmaz.'); process.exit(1); }

// ── Uygulama ──────────────────────────────────────────────────────────────
const parcala = (dizi, n) => Array.from({ length: Math.ceil(dizi.length / n) }, (_, i) => dizi.slice(i * n, i * n + n));

for (const oby of parcala(bagli, 500)) {
    const { error } = await supabase.from('ilerleme').upsert(
        oby.map((s) => ({ uid: uidHarita.get(s.eposta), ders_id: s.ders_id, kurs_id: s.kurs_id,
                          score: null, completed_at: s.completed_at, kaynak: 'wordpress' })),
        { onConflict: 'uid,ders_id', ignoreDuplicates: true }   // kendi ilerlemesini ezme
    );
    if (error) throw new Error(`ilerleme yazılamadı: ${error.message}`);
}
console.log(`  ✓ ilerleme: ${bagli.length} satır`);

for (const oby of parcala(bekleyen, 500)) {
    const { error } = await supabase.from('ilerleme_devir').upsert(
        oby.map((s) => ({ eposta: s.eposta, ders_id: s.ders_id, kurs_id: s.kurs_id,
                          score: null, completed_at: s.completed_at, kaynak: 'wordpress' })),
        { onConflict: 'eposta,ders_id', ignoreDuplicates: true }
    );
    if (error) throw new Error(`ilerleme_devir yazılamadı: ${error.message}`);
}
console.log(`  ✓ ilerleme_devir: ${bekleyen.length} satır`);
console.log('\nBitti.');
