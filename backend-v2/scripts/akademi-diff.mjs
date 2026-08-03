// ⛔ TARİHSEL — ARTIK ÇALIŞMAZ: config/firebase.js ve firebase-admin S2 sökümünde
//    kaldırıldı. Bu dosya yapılan işin kaydı olarak duruyor; çıktıları
//    scripts/parite/RAPOR*.md ve görev dosyalarındaki "Uygulandı" bloklarında.
// G7 doğrulaması — akademi uçlarını ESKİ API ile karşılaştırır.
//
// Eski API'ye YALNIZCA GET atılır (canlı Firestore'a yazmıyoruz). İlerleme
// yazma turu yalnızca v2'de koşar ve izini temizler.
//
// Kullanım: cd backend-v2 && node scripts/akademi-diff.mjs [yeni-taban]
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const buDizin = path.dirname(fileURLToPath(import.meta.url));
const V2_KOK = path.resolve(buDizin, '..');
dotenv.config({ path: path.join(V2_KOK, '.env.local') });
dotenv.config({ path: path.join(V2_KOK, '.env') });

const { auth } = await import('../config/firebase.js');
const { supabase } = await import('../config/supabase.js');

const YENI = process.argv[2] || 'http://localhost:5002/api';
const ESKI = process.env.ESKI_API || 'https://api-fyfp72cohq-uc.a.run.app/api';

const YESIL = '\x1b[32m', KIRMIZI = '\x1b[31m', GRI = '\x1b[90m', SIFIRLA = '\x1b[0m';
let farkSayisi = 0;

const frontendEnv = dotenv.parse(readFileSync(path.resolve(V2_KOK, '../frontend/.env'), 'utf8'));
async function idToken(uid, claims) {
    const custom = await auth.createCustomToken(uid, claims);
    const r = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${frontendEnv.VITE_FIREBASE_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: custom, returnSecureToken: true }) }
    );
    const j = await r.json();
    if (!j.idToken) throw new Error(`Token alınamadı: ${JSON.stringify(j).slice(0, 200)}`);
    return j.idToken;
}

/** Anahtarları sıralı, dizileri id/lessonId'ye göre sıralı normalize kopya. */
function normalize(v) {
    if (Array.isArray(v)) {
        const n = v.map(normalize);
        return n.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    if (v && typeof v === 'object') {
        const cikti = {};
        for (const k of Object.keys(v).sort()) {
            if (v[k] === undefined) continue;
            cikti[k] = normalize(v[k]);
        }
        return cikti;
    }
    return v;
}

/** İki nesneyi karşılaştırıp farklı YOLLARI döndürür. */
function farklar(a, b, yol = '', cikti = []) {
    const aTip = a === null ? 'null' : Array.isArray(a) ? 'array' : typeof a;
    const bTip = b === null ? 'null' : Array.isArray(b) ? 'array' : typeof b;
    if (aTip !== bTip) { cikti.push(`${yol}: eski(${aTip})=${JSON.stringify(a)?.slice(0, 60)} yeni(${bTip})=${JSON.stringify(b)?.slice(0, 60)}`); return cikti; }
    if (aTip === 'array') {
        if (a.length !== b.length) { cikti.push(`${yol}: dizi uzunluğu eski=${a.length} yeni=${b.length}`); return cikti; }
        a.forEach((x, i) => farklar(x, b[i], `${yol}[${i}]`, cikti));
        return cikti;
    }
    if (aTip === 'object') {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if (!(k in a)) { cikti.push(`${yol}.${k}: yalnız yenide = ${JSON.stringify(b[k])?.slice(0, 60)}`); continue; }
            if (!(k in b)) { cikti.push(`${yol}.${k}: yalnız eskide = ${JSON.stringify(a[k])?.slice(0, 60)}`); continue; }
            farklar(a[k], b[k], `${yol}.${k}`, cikti);
        }
        return cikti;
    }
    if (a !== b) cikti.push(`${yol}: eski=${JSON.stringify(a)} yeni=${JSON.stringify(b)}`);
    return cikti;
}

async function getJson(taban, yol, token) {
    const r = await fetch(`${taban}${yol}`, { headers: { Authorization: `Bearer ${token}` } });
    return { kod: r.status, govde: await r.json().catch(() => null) };
}

async function diff(ad, yol, token, { yokSay = [] } = {}) {
    const [eski, yeni] = await Promise.all([getJson(ESKI, yol, token), getJson(YENI, yol, token)]);
    if (eski.kod !== yeni.kod) {
        farkSayisi++;
        console.log(`${KIRMIZI}✗${SIFIRLA} ${ad.padEnd(46)} HTTP eski=${eski.kod} yeni=${yeni.kod}`);
        return { eski, yeni };
    }
    const f = farklar(normalize(eski.govde), normalize(yeni.govde))
        .filter((x) => !yokSay.some((y) => x.includes(y)));
    farkSayisi += f.length;
    const im = f.length === 0 ? `${YESIL}✓${SIFIRLA}` : `${KIRMIZI}✗${SIFIRLA}`;
    console.log(`${im} ${ad.padEnd(46)} ${GRI}HTTP ${eski.kod} · fark: ${f.length}${SIFIRLA}`);
    for (const x of f.slice(0, 8)) console.log(`   ${KIRMIZI}• ${x}${SIFIRLA}`);
    if (f.length > 8) console.log(`   ${GRI}… ${f.length - 8} fark daha${SIFIRLA}`);
    return { eski, yeni };
}

// ── Token'lar ──
const { data: kullanicilar } = await supabase.from('kullanici_sube').select('uid, role, sube_slug');
const admin = kullanicilar.find((k) => k.role === 'admin');
const sahip = kullanicilar.find((k) => k.role === 'sube_sahibi' && k.sube_slug);
const adminToken = await idToken(admin.uid, { role: 'admin', subeSlug: admin.sube_slug || null });
const sahipToken = sahip ? await idToken(sahip.uid, { role: 'sube_sahibi', subeSlug: sahip.sube_slug }) : null;

console.log(`\neski: ${ESKI}\nyeni: ${YENI}\n`);

console.log('── Admin ──');
const { yeni: kursListesi } = await diff('GET /academy/courses', '/academy/courses', adminToken);
const kurslar = kursListesi.govde?.courses || [];
const ilkKurs = kurslar[0];

if (ilkKurs) {
    await diff(`GET /academy/courses/:id (${ilkKurs.title?.slice(0, 18)})`, `/academy/courses/${ilkKurs.id}`, adminToken);
    await diff('GET /academy/lessons/:courseId', `/academy/lessons/${ilkKurs.id}`, adminToken);
}
await diff('GET /academy/progress/all/summary', '/academy/progress/all/summary', adminToken);
// AÇIKLANMIŞ FARK — stats listesi 1 satır kısa:
// Eski uç, `academy_progress/{uid}` dokümanı VAR OLAN herkesi listeliyordu.
// Akademiyi bir kez açan admin için Firestore boş bir doküman yaratıyor
// (tamamlanan=0) ve o admin listeye giriyordu. v2'de böyle bir "boş ilerleme
// dokümanı" kavramı yok: liste = ilerlemesi olanlar + admin olmayan kullanıcılar,
// yani ucun kendi tanımı. Somut kayıt: Qrd56VPKqfaQtnouCPHRiP4FTKp1 (admin, 0).
await diff('GET /academy/progress/admin/stats', '/academy/progress/admin/stats?fresh=1', adminToken,
    { yokSay: ['.stats: dizi uzunluğu'] });

// İlerlemesi olan bir kullanıcının detayı
const { data: ornek } = await supabase.from('ilerleme').select('uid').limit(1).maybeSingle();
if (ornek) {
    await diff('GET /academy/progress/admin/stats/:uid/detail', `/academy/progress/admin/stats/${ornek.uid}/detail`, adminToken);
}

if (sahipToken) {
    console.log('\n── Şube sahibi (hedef kitle filtresi) ──');
    const { yeni: sahipKurslar } = await diff('GET /academy/courses', '/academy/courses', sahipToken);
    console.log(`   ${GRI}görünen kurs: ${(sahipKurslar.govde?.courses || []).length}/${kurslar.length}${SIFIRLA}`);
    await diff('GET /academy/progress/all/summary', '/academy/progress/all/summary', sahipToken);
    if (ilkKurs) await diff('GET /academy/progress/:courseId', `/academy/progress/${ilkKurs.id}`, sahipToken);
}

// ── İlerleme yazma turu — YALNIZCA v2, izini temizler ──
console.log('\n── İlerleme yazma (yalnız v2) ──');
const { data: hedefDers } = await supabase.from('dersler')
    .select('id, kurs_id, lesson_type').neq('lesson_type', 'quiz').limit(1).maybeSingle();
const { data: quizDers } = await supabase.from('dersler')
    .select('id, kurs_id').eq('lesson_type', 'quiz').limit(1).maybeSingle();

async function v2(yontem, yol, govde, token, beklenen = [200, 201]) {
    const r = await fetch(`${YENI}${yol}`, {
        method: yontem,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: govde === undefined ? undefined : JSON.stringify(govde),
    });
    const metin = await r.text();
    const tamam = beklenen.includes(r.status);
    if (!tamam) farkSayisi++;
    console.log(`${tamam ? YESIL + '✓' : KIRMIZI + '✗'}${SIFIRLA} ${String(r.status).padEnd(3)} ${(yontem + ' ' + yol).padEnd(52)} ${GRI}${metin.slice(0, 50)}${SIFIRLA}`);
    return metin;
}

if (hedefDers) {
    const oncekiSayi = (await supabase.from('ilerleme').select('*', { count: 'exact', head: true })).count;
    await v2('POST', `/academy/progress/${hedefDers.kurs_id}/${hedefDers.id}`, {}, adminToken);
    const { data: yazilan } = await supabase.from('ilerleme').select('*')
        .eq('uid', admin.uid).eq('ders_id', hedefDers.id).maybeSingle();
    const yazildi = !!yazilan && yazilan.kurs_id === hedefDers.kurs_id;
    if (!yazildi) farkSayisi++;
    console.log(`${yazildi ? YESIL + '✓' : KIRMIZI + '✗'}${SIFIRLA}     ilerleme satırı yazıldı (kurs_id doğru)`);

    // İkinci çağrı idempotent olmalı — completed_at değişmemeli
    await v2('POST', `/academy/progress/${hedefDers.kurs_id}/${hedefDers.id}`, {}, adminToken);
    const { data: ikinci } = await supabase.from('ilerleme').select('completed_at')
        .eq('uid', admin.uid).eq('ders_id', hedefDers.id).maybeSingle();
    const idempotent = ikinci?.completed_at === yazilan?.completed_at;
    if (!idempotent) farkSayisi++;
    console.log(`${idempotent ? YESIL + '✓' : KIRMIZI + '✗'}${SIFIRLA}     ikinci çağrı idempotent`);

    // Özet ucu yeni kaydı görmeli
    const ozet = await getJson(YENI, '/academy/progress/all/summary', adminToken);
    const gorunuyor = (ozet.govde?.byCourse || {})[hedefDers.kurs_id] >= 1;
    if (!gorunuyor) farkSayisi++;
    console.log(`${gorunuyor ? YESIL + '✓' : KIRMIZI + '✗'}${SIFIRLA}     özet ucunda görünüyor`);

    await v2('DELETE', `/academy/progress/${hedefDers.kurs_id}/${hedefDers.id}`, undefined, adminToken);
    const sonSayi = (await supabase.from('ilerleme').select('*', { count: 'exact', head: true })).count;
    const temiz = sonSayi === oncekiSayi;
    if (!temiz) farkSayisi++;
    console.log(`${temiz ? YESIL + '✓' : KIRMIZI + '✗'}${SIFIRLA}     temizlendi (${oncekiSayi} → ${sonSayi})`);
}

if (quizDers) {
    // Quiz dersi genel tamamlama ucundan işaretlenememeli
    await v2('POST', `/academy/progress/${quizDers.kurs_id}/${quizDers.id}`, {}, adminToken, [400]);
    // Boş cevapla sınav: geçememeli, kayıt oluşmamalı
    await v2('POST', `/academy/progress/quiz/${quizDers.kurs_id}/${quizDers.id}/submit`, { answers: {} }, adminToken, [200]);
    const { count } = await supabase.from('ilerleme').select('*', { count: 'exact', head: true })
        .eq('uid', admin.uid).eq('ders_id', quizDers.id);
    if (count !== 0) farkSayisi++;
    console.log(`${count === 0 ? YESIL + '✓' : KIRMIZI + '✗'}${SIFIRLA}     başarısız sınav kayıt açmadı`);
}

console.log('');
if (farkSayisi === 0) console.log(`${YESIL}✓ Akademi: eski API ile fark yok, yazma turu temiz.${SIFIRLA}`);
else console.log(`${KIRMIZI}✗ ${farkSayisi} fark/hata var.${SIFIRLA}`);
process.exit(farkSayisi === 0 ? 0 : 1);