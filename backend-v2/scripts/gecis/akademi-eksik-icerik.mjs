/**
 * WordPress akademisinde olup bizde olmayan içeriği taşır (adım 1-2).
 *
 * NEDEN BETİK: WordPress kapatılacak; oradaki iki kalem panelden elle
 * girilemeyecek kadar veri taşıyor (177 MB'lık MP4 + soru/cevap seti).
 * Rota katmanı yerine doğrudan yazar ama ALAN SÖZLEŞMESİNİ birebir izler
 * (bkz. modules/academy/routes/lessons.js POST) — `dersSatiri` üzerinden.
 *
 * Taşınanlar:
 *  1. "Led Ekran Yönetimi ve Güncelleme" kursu + "Ekran Yönetimi" videosu.
 *     Video WP diskindeydi (uploads/2026/08); upload rotasının 100 MB sınırı
 *     bunu geçirmez, bu yüzden R2'ye doğrudan yazılıyor. Kursun ikinci dersi
 *     "Örnek Uygulama" WP'de de BOŞ (medya kütüphanesinde karşılığı yok),
 *     yer tutucu olarak açılır.
 *  2. WP müfredatında olup bizde olmayan iki sınav. DİKKAT: her ikisinde de
 *     WP'deki cevap anahtarı YANLIŞ işaretliydi (ilk şık doğru işaretlenmiş);
 *     diğer 13 sınavda böyle bir sorun yok, yani bu ikisi WP'de bozuk kalmış.
 *     Doğru şıklar elle düzeltilerek taşınıyor — bkz. satır içi yorumlar.
 *
 * Kullanım: node scripts/gecis/akademi-eksik-icerik.mjs [--uygula]
 */
import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { supabase } from '../../config/supabase.js';
import { depoAyarla, uploadFile } from '../../config/r2.js';
import { depoS3 } from '../../config/depo-s3.js';
import { yeniId } from '../../utils/veri.js';
import { dersSatiri, kursSatiri } from '../../modules/academy/donusum.js';

depoAyarla(depoS3);

const UYGULA = process.argv.includes('--uygula');
const VIDEO = process.argv.find((a) => a.startsWith('--video='))?.slice(8);

const soruId = () => crypto.randomBytes(6).toString('base64url').toLowerCase().slice(0, 9);

// Akademi başlıkları veritabanına NFD (ayrışık) biçimde girmiş: "Ürün" orada
// U + birleşen çift nokta olarak duruyor, düz eşitlik tutmuyor. Karşılaştırma
// hep NFC'ye indirgenerek yapılır.
const ad = (s) => String(s ?? '').normalize('NFC').trim();
const esit = (a, b) => ad(a) === ad(b);
const simdi = new Date().toISOString();

// ── 1. Led Ekran kursu ────────────────────────────────────────────────────
const LED_KURS = {
    title: 'Led Ekran Yönetimi ve Güncelleme',
    description: '',
    isPublished: false,          // diğer 6 kurs gibi; yayına alma kararı panelden
    targetRoles: ['sube_sahibi'],
    orderIndex: 6,               // mevcut en büyük order_index 5
    createdAt: simdi,
    updatedAt: simdi,
};
const LED_DERSLER = [
    { title: 'Ekran Yönetimi', lessonType: 'video', videoDosya: true },
    // WP'de de medyası yok — ders kaydı var, dosyası yok.
    { title: 'Örnek Uygulama', lessonType: 'video', videoUrl: '' },
];

// ── 2. Eksik sınav ────────────────────────────────────────────────────────
// Kurs: Hizmet ve Kalite Standartları Eğitimi, "5. Stok Takibi ve Sipariş
// Yönetimi" bölümünün sonu → WP sırası: Ürün Kabul ve Giriş Kontrolü'nden
// hemen sonra (bizde order_index 18), yani 19'a girer, sonrası kayar.
const EKSIK_SINAVLAR = [{
    kursTitle: 'Hizmet ve Kalite Standartları Eğitimi',
    oncekiDersTitle: 'Ürün Kabul ve Giriş Kontrolü',
    title: 'Stok Takibi ve Sipariş Yönetimi Sınavı',
    lessonType: 'quiz',
    passingScore: 70,            // diğer 13 sınavın tamamı 70
    questions: [
        {
            id: soruId(),
            questionText: 'FIFO kuralı neyi ifade eder?',
            options: [
                { id: 'A', text: 'İlk çıkan ilk girer' },
                { id: 'B', text: 'En çok satan en öne' },
                { id: 'C', text: 'İlk giren ilk çıkar' },
                { id: 'D', text: 'Tarihi yakın olan en arkaya' },
            ],
            correctOptionId: 'C',   // WP'de 'A' işaretliydi — FIFO = first in, first out
        },
        {
            id: soruId(),
            questionText: 'Soğutucu sıcaklıkları ne zaman kaydedilmelidir?',
            options: [
                { id: 'A', text: 'Haftada bir' },
                { id: 'B', text: 'Ayda bir' },
                { id: 'C', text: 'Sadece arıza olunca' },
                { id: 'D', text: 'Sabah ve akşam' },
            ],
            correctOptionId: 'D',   // WP'de 'C' işaretliydi — günlük kayıt esas
        },
    ],
}, {
    // WP id 53998. Bizdeki "Merkezin Onayı..." VİDEOSUYLA aynı adı taşıdığı için
    // ad karşılaştırmasında görünmemişti; müfredatta ayrı bir sınav.
    kursTitle: 'Hizmet ve Kalite Standartları Eğitimi',
    oncekiDersTitle: 'Merkezin Onayı Olmadan Satılan Ürünlerin Riskleri',
    title: 'Merkezin Onayı Olmadan Satılan Ürünlerin Riskleri Sınavı',
    lessonType: 'quiz',
    passingScore: 70,
    questions: [
        {
            id: soruId(),
            questionText: 'Müşteri yeni ürün önerdiğinde doğru yaklaşım?',
            options: [
                { id: 'A', text: 'Hemen satışa koymak' },
                { id: 'B', text: '"Yöneticimize ileteceğiz, değerlendirilecektir." demek' },
                { id: 'C', text: '"Asla olmaz" demek' },
                { id: 'D', text: 'Cevap vermemek' },
            ],
            correctOptionId: 'B',   // WP'de 'A' işaretliydi — dersin tamamına aykırı
        },
    ],
}];

// ── Doğrulama ─────────────────────────────────────────────────────────────
const { data: kurslar, error: kHata } = await supabase.from('kurslar').select('id, title, order_index');
if (kHata) throw new Error(`kurslar okunamadı: ${kHata.message}`);

const ledVar = kurslar.find((k) => esit(k.title, LED_KURS.title));
const sinavPlani = [];
for (const s of EKSIK_SINAVLAR) {
    const kurs = kurslar.find((k) => esit(k.title, s.kursTitle));
    if (!kurs) throw new Error(`kurs bulunamadı: ${s.kursTitle}`);
    const { data: dersler } = await supabase.from('dersler')
        .select('id, title, order_index, lesson_type').eq('kurs_id', kurs.id).order('order_index');
    const varMi = dersler.find((d) => esit(d.title, s.title) && d.lesson_type === 'quiz');
    // Aynı adı taşıyan video olabilir (53998 vakası) — sıra referansı da tipe bakar.
    const onceki = dersler.find((d) => esit(d.title, s.oncekiDersTitle) && d.lesson_type !== 'quiz');
    if (!onceki) throw new Error(`ders bulunamadı: ${s.oncekiDersTitle}`);
    sinavPlani.push({ s, kurs, dersler, varMi, yeniSira: onceki.order_index + 1 });
}

if (VIDEO && !fs.existsSync(VIDEO)) throw new Error(`video dosyası yok: ${VIDEO}`);

console.log('— Plan —');
console.log(ledVar ? `  ✓ Led kursu zaten var (${ledVar.id}), atlanacak`
    : `  + kurs: ${LED_KURS.title} (+${LED_DERSLER.length} ders)`);
console.log(`      video: ${VIDEO ? `${(fs.statSync(VIDEO).size / 1048576).toFixed(0)} MB → R2` : 'YOK (--video= verilmedi)'}`);
for (const p of sinavPlani) {
    console.log(p.varMi ? `  ✓ "${p.s.title}" zaten var (${p.varMi.id}), atlanacak`
        : `  + ders: ${p.s.title} → ${p.kurs.title}, sıra ${p.yeniSira} (sonraki ${p.dersler.length - p.yeniSira} ders kayar)`);
}

if (!UYGULA) { console.log('\n(kuru çalıştırma — hiçbir şey yazılmadı; --uygula ekle)'); process.exit(0); }

// ── Uygulama ──────────────────────────────────────────────────────────────
if (!ledVar) {
    let videoUrl = '';
    if (VIDEO) {
        const key = `academy/videos/${crypto.randomUUID()}.mp4`;
        process.stdout.write('  video R2\'ye yükleniyor… ');
        videoUrl = await uploadFile(fs.readFileSync(VIDEO), key, 'video/mp4');
        console.log('tamam');
    }
    const kursId = yeniId();
    const { error } = await supabase.from('kurslar').insert({ id: kursId, ...kursSatiri(LED_KURS) });
    if (error) throw new Error(`kurs yazılamadı: ${error.message}`);
    console.log(`  ✓ kurs ${kursId}`);

    for (const [i, d] of LED_DERSLER.entries()) {
        const ders = {
            title: d.title, description: '', lessonType: 'video',
            videoUrl: d.videoDosya ? videoUrl : (d.videoUrl || ''),
            pdfUrl: '', passingScore: null, questions: null,
            orderIndex: i, createdAt: simdi,
        };
        const id = yeniId();
        const { error: dHata } = await supabase.from('dersler').insert({ id, kurs_id: kursId, ...dersSatiri(ders) });
        if (dHata) throw new Error(`ders yazılamadı (${d.title}): ${dHata.message}`);
        console.log(`  ✓ ders ${id}  ${d.title}${ders.videoUrl ? '' : '  (videosuz)'}`);
    }
}

for (const { s: sinav, kurs, dersler, varMi, yeniSira } of sinavPlani) {
    if (varMi) continue;
    // Araya girecek: sonraki dersleri bir kaydır. Sondan başa doğru yazılır ki
    // (kurs_id, order_index) üzerinde geçici çakışma olmasın.
    const kayacak = dersler.filter((d) => d.order_index >= yeniSira).reverse();
    for (const d of kayacak) {
        const { error } = await supabase.from('dersler')
            .update({ order_index: d.order_index + 1 }).eq('id', d.id);
        if (error) throw new Error(`sıra kaydırılamadı (${d.title}): ${error.message}`);
    }
    console.log(`  ✓ ${kayacak.length} ders bir sıra kaydırıldı`);

    const ders = {
        title: sinav.title, description: '', lessonType: 'quiz',
        videoUrl: '', pdfUrl: '',
        passingScore: sinav.passingScore, questions: sinav.questions,
        orderIndex: yeniSira, createdAt: simdi,
    };
    const id = yeniId();
    const { error } = await supabase.from('dersler').insert({ id, kurs_id: kurs.id, ...dersSatiri(ders) });
    if (error) throw new Error(`sınav yazılamadı: ${error.message}`);
    console.log(`  ✓ ders ${id}  ${sinav.title}`);
}

console.log('\nBitti.');
