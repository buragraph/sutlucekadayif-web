import 'dotenv/config';
import { supabase } from '../../config/supabase.js';
import { depoS3 } from '../../config/depo-s3.js';
import { depoAyarla, listFiles } from '../../config/r2.js';
depoAyarla(depoS3);

const R2 = 'https://pub-99104fd4f6324895b46545c23e61887f.r2.dev/';
const VIDEO_UZANTI = /\.(mp4|webm|ogg|ogv|m4v|mov)(\?.*)?$/i;

function coz(input) {
    if (!input) return { type: null, id: null };
    const m = String(input).trim();
    const pl = m.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (pl) return { type: 'playlist', id: pl[1] };
    if (/^[a-zA-Z0-9_-]{11}$/.test(m)) return { type: 'video', id: m };
    for (const p of [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com|youtube-nocookie\.com)\/(?:shorts|live|embed|v)\/([a-zA-Z0-9_-]{11})/,
    ]) { const x = m.match(p); if (x) return { type: 'video', id: x[1] }; }
    if (/^https?:\/\//i.test(m) && VIDEO_UZANTI.test(m)) return { type: 'file', id: m };
    return { type: 'bilinmiyor', id: m };
}

const [{ data: kurslar }, { data: dersler }, r2] = await Promise.all([
    supabase.from('kurslar').select('*').order('order_index'),
    supabase.from('dersler').select('*').order('order_index'),
    listFiles('academy/'),
]);
const r2Key = new Map(r2.map((f) => [f.key, f.boyut]));
const keyOf = (url) => (url && url.startsWith(R2) ? url.slice(R2.length) : null);

const bulgu = [];
const ekle = (tur, mesaj) => bulgu.push({ tur, mesaj });

// ── Kurslar ──────────────────────────────────────────────────────────────
for (const k of kurslar) {
    const kd = dersler.filter((d) => d.kurs_id === k.id);
    if (kd.length === 0) ekle('kurs-bos', `${k.title} — hiç ders yok`);
    if (!k.thumbnail_url) ekle('kurs-kapaksiz', `${k.title} — kapak görseli yok`);
    else {
        const key = keyOf(k.thumbnail_url);
        if (key && !r2Key.has(key)) ekle('kirik-kapak', `${k.title} — kapak R2'de YOK: ${key}`);
        else if (key && r2Key.get(key) > 500_000) ekle('buyuk-kapak', `${k.title} — kapak ${(r2Key.get(key)/1024).toFixed(0)} KB`);
        if (!key && !/^https?:/.test(k.thumbnail_url)) ekle('kirik-kapak', `${k.title} — kapak adresi geçersiz`);
    }
    if (!k.is_published) ekle('yayinda-degil', `${k.title}`);
    if (!k.target_roles?.length) ekle('rolsuz-kurs', `${k.title} — hedef rol yok, kimse göremez`);
}

// ── Dersler ──────────────────────────────────────────────────────────────
for (const d of dersler) {
    const kurs = kurslar.find((k) => k.id === d.kurs_id);
    const ad = `${kurs?.title ?? '(kurs yok)'} › ${d.title}`;
    if (!kurs) { ekle('oksuz-ders', `${d.title} — kurs_id ${d.kurs_id} yok`); continue; }

    if (d.lesson_type === 'video') {
        if (!d.video_url?.trim()) { ekle('videosuz-ders', ad); continue; }
        const p = coz(d.video_url);
        if (p.type === 'bilinmiyor') ekle('tanimsiz-video', `${ad} — ${d.video_url}`);
        if (p.type === 'file') {
            const key = keyOf(p.id);
            if (key && !r2Key.has(key)) ekle('kirik-video', `${ad} — R2'de YOK: ${key}`);
            else if (key) ekle('dosya-video', `${ad} — ${(r2Key.get(key)/1048576).toFixed(1)} MB`);
        }
    } else if (d.lesson_type === 'pdf') {
        if (!d.pdf_url?.trim()) { ekle('pdfsiz-ders', ad); continue; }
        const key = keyOf(d.pdf_url);
        if (key && !r2Key.has(key)) ekle('kirik-pdf', `${ad} — R2'de YOK: ${key}`);
        else if (key && r2Key.get(key) > 20_000_000) ekle('buyuk-pdf', `${ad} — ${(r2Key.get(key)/1048576).toFixed(1)} MB`);
    } else if (d.lesson_type === 'quiz') {
        const s = d.questions;
        if (!Array.isArray(s) || s.length === 0) { ekle('sorusuz-sinav', ad); continue; }
        if (d.passing_score == null) ekle('gecme-notu-yok', ad);
        s.forEach((q, i) => {
            const secenek = q.options || [];
            if (!(q.questionText ?? q.text)?.trim()) ekle('bos-soru', `${ad} — ${i + 1}. soru metni boş`);
            if (secenek.length < 2) ekle('az-secenek', `${ad} — ${i + 1}. soruda ${secenek.length} şık`);
            if (secenek.some((o) => !o.text?.trim())) ekle('bos-secenek', `${ad} — ${i + 1}. soruda boş şık`);
            const dogru = q.correctOptionId ?? q.correct ?? q.dogru;
            if (dogru == null || !secenek.some((o) => o.id === dogru)) {
                ekle('cevap-anahtari', `${ad} — ${i + 1}. sorunun doğru şıkkı yok/eşleşmiyor (${JSON.stringify(dogru)})`);
            }
        });
    } else {
        ekle('bilinmeyen-tur', `${ad} — lesson_type='${d.lesson_type}'`);
    }
    if ((d.title || '') !== (d.title || '').normalize('NFC')) ekle('nfd-baslik', ad);
}

// ── Sahipsiz R2 dosyaları ────────────────────────────────────────────────
const kullanilan = new Set();
kurslar.forEach((k) => { const x = keyOf(k.thumbnail_url); if (x) kullanilan.add(x); });
dersler.forEach((d) => { for (const u of [d.video_url, d.pdf_url]) { const x = keyOf(u); if (x) kullanilan.add(x); } });
for (const f of r2) if (!kullanilan.has(f.key)) ekle('sahipsiz-dosya', `${f.key} — ${(f.boyut/1048576).toFixed(1)} MB`);

// ── Rapor ────────────────────────────────────────────────────────────────
console.log(`Kurs: ${kurslar.length} | Ders: ${dersler.length} | academy/ dosya: ${r2.length}\n`);
const grup = {};
for (const b of bulgu) (grup[b.tur] ??= []).push(b.mesaj);
for (const [tur, liste] of Object.entries(grup).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`## ${tur} (${liste.length})`);
    liste.slice(0, 25).forEach((m) => console.log('   -', m));
    if (liste.length > 25) console.log(`   ... +${liste.length - 25}`);
    console.log();
}
if (!bulgu.length) console.log('Bulgu yok.');
