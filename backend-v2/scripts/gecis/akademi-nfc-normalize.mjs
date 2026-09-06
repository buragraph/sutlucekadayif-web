/**
 * Akademi metinlerini NFC'ye çevirir (ayrışık Unicode → birleşik).
 *
 * SORUN: WordPress'ten taşınan başlıklarda Türkçe harfler AYRIŞIK yazılmış —
 * "ı" + birleştirici nokta gibi. Ekranda fark görünmez ama string eşitliği
 * TUTMAZ: `.eq('title', 'Şube Teslimatı')` sorgusu satırı bulamaz, panelde
 * arama kutusu yazılan kelimeyi eşleştiremez, iki farklı yazımdan mükerrer
 * kayıt üretilebilir. (Aynı tuzağa geçiş betiklerinde de düşülmüştü.)
 *
 * Betik SADECE normalize eder; görünen metin birebir aynı kalır.
 * Kuru çalışır; yazmak için --uygula.
 *
 * Kullanım: node scripts/gecis/akademi-nfc-normalize.mjs [--uygula]
 */
import 'dotenv/config';
import { supabase } from '../../config/supabase.js';

const UYGULA = process.argv.includes('--uygula');

// Hangi tabloda hangi metin alanları taranacak
const HEDEFLER = [
    { tablo: 'kurslar', alanlar: ['title', 'description'] },
    { tablo: 'dersler', alanlar: ['title', 'description'] },
];

const nfc = (s) => (typeof s === 'string' ? s.normalize('NFC') : s);

let toplamSatir = 0;
let toplamAlan = 0;

for (const { tablo, alanlar } of HEDEFLER) {
    const { data, error } = await supabase.from(tablo).select(['id', ...alanlar].join(','));
    if (error) throw error;

    for (const satir of data) {
        const yama = {};
        for (const alan of alanlar) {
            const eski = satir[alan];
            if (typeof eski !== 'string') continue;
            const yeni = nfc(eski);
            if (yeni !== eski) yama[alan] = yeni;
        }
        if (!Object.keys(yama).length) continue;

        toplamSatir++;
        toplamAlan += Object.keys(yama).length;
        console.log(`${tablo}/${satir.id}: ${Object.keys(yama).join(', ')} → ${JSON.stringify(yama.title ?? Object.values(yama)[0]).slice(0, 80)}`);

        if (UYGULA) {
            const { error: e } = await supabase.from(tablo).update(yama).eq('id', satir.id);
            if (e) throw e;
        }
    }
}

// Sınav soruları JSON kolonunda; ayrı ele alınır.
const { data: sinavlar, error: se } = await supabase
    .from('dersler').select('id, questions').eq('lesson_type', 'quiz');
if (se) throw se;

for (const d of sinavlar) {
    if (!Array.isArray(d.questions)) continue;
    const yeni = d.questions.map((q) => ({
        ...q,
        questionText: nfc(q.questionText),
        options: (q.options || []).map((o) => ({ ...o, text: nfc(o.text) })),
    }));
    if (JSON.stringify(yeni) === JSON.stringify(d.questions)) continue;

    toplamSatir++;
    toplamAlan++;
    console.log(`dersler/${d.id}: questions (${d.questions.length} soru)`);
    if (UYGULA) {
        const { error: e } = await supabase.from('dersler').update({ questions: yeni }).eq('id', d.id);
        if (e) throw e;
    }
}

console.log(`\n${UYGULA ? 'YAZILDI' : 'KURU ÇALIŞMA'} — ${toplamSatir} satır, ${toplamAlan} alan`);
if (!UYGULA) console.log('Uygulamak için: --uygula');
