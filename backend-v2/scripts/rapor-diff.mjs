// ⛔ TARİHSEL — ARTIK ÇALIŞMAZ: config/firebase.js ve firebase-admin S2 sökümünde
//    kaldırıldı. Bu dosya yapılan işin kaydı olarak duruyor; çıktıları
//    scripts/parite/RAPOR*.md ve görev dosyalarındaki "Uygulandı" bloklarında.
// G8 doğrulaması — rapor uçlarını ESKİ API ile karşılaştırır ve bütçe/metrik
// kolon ayrımını test eder.
//
// Eski API'ye YALNIZCA GET atılır. Yazma testleri yalnızca v2'de koşar ve
// izini temizler.
//
// Kullanım: cd backend-v2 && node scripts/rapor-diff.mjs [yeni-taban]
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
const db = await import('../modules/reports/db.js');

const YENI = process.argv[2] || 'http://localhost:5002/api';
const ESKI = process.env.ESKI_API || 'https://api-fyfp72cohq-uc.a.run.app/api';

const YESIL = '\x1b[32m', KIRMIZI = '\x1b[31m', SARI = '\x1b[33m', GRI = '\x1b[90m', SIFIRLA = '\x1b[0m';
let fark = 0;
const aciklananlar = [];

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

function normalize(v) {
    if (Array.isArray(v)) return v.map(normalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = normalize(v[k]);
        return o;
    }
    if (typeof v === 'number') return Math.round(v * 100) / 100;
    return v;
}

function farklar(a, b, yol = '', cikti = []) {
    const t = (x) => (x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x);
    if (t(a) !== t(b)) { cikti.push(`${yol}: eski(${t(a)})=${JSON.stringify(a)?.slice(0, 50)} yeni(${t(b)})=${JSON.stringify(b)?.slice(0, 50)}`); return cikti; }
    if (Array.isArray(a)) {
        if (a.length !== b.length) { cikti.push(`${yol}: dizi uzunluğu eski=${a.length} yeni=${b.length}`); return cikti; }
        a.forEach((x, i) => farklar(x, b[i], `${yol}[${i}]`, cikti));
        return cikti;
    }
    if (a && typeof a === 'object') {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if (!(k in a)) { cikti.push(`${yol}.${k}: yalnız yenide = ${JSON.stringify(b[k])?.slice(0, 50)}`); continue; }
            if (!(k in b)) { cikti.push(`${yol}.${k}: yalnız eskide = ${JSON.stringify(a[k])?.slice(0, 50)}`); continue; }
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

async function diff(ad, yol, token, { yokSay = [], aciklama = null } = {}) {
    const [eski, yeni] = await Promise.all([getJson(ESKI, yol, token), getJson(YENI, yol, token)]);
    if (eski.kod !== yeni.kod) {
        fark++;
        console.log(`${KIRMIZI}✗${SIFIRLA} ${ad.padEnd(44)} HTTP eski=${eski.kod} yeni=${yeni.kod}`);
        return { eski, yeni };
    }
    let f = farklar(normalize(eski.govde), normalize(yeni.govde));
    const gozArdi = f.filter((x) => yokSay.some((y) => x.includes(y)));
    f = f.filter((x) => !yokSay.some((y) => x.includes(y)));
    if (gozArdi.length && aciklama) aciklananlar.push(`${ad}: ${gozArdi.length} × ${aciklama}`);
    fark += f.length;
    const im = f.length === 0 ? `${YESIL}✓${SIFIRLA}` : `${KIRMIZI}✗${SIFIRLA}`;
    console.log(`${im} ${ad.padEnd(44)} ${GRI}HTTP ${eski.kod} · fark: ${f.length}${gozArdi.length ? ` (+${gozArdi.length} açıklanmış)` : ''}${SIFIRLA}`);
    for (const x of f.slice(0, 6)) console.log(`   ${KIRMIZI}• ${x}${SIFIRLA}`);
    if (f.length > 6) console.log(`   ${GRI}… ${f.length - 6} fark daha${SIFIRLA}`);
    return { eski, yeni };
}

// ── Token'lar ──
const { data: kullanicilar } = await supabase.from('kullanici_sube').select('uid, role, sube_slug');
const admin = kullanicilar.find((k) => k.role === 'admin');
const sahip = kullanicilar.find((k) => k.role === 'sube_sahibi' && k.sube_slug);
const adminToken = await idToken(admin.uid, { role: 'admin', subeSlug: admin.sube_slug || null });
const sahipToken = sahip ? await idToken(sahip.uid, { role: 'sube_sahibi', subeSlug: sahip.sube_slug }) : null;

console.log(`\neski: ${ESKI}\nyeni: ${YENI}\n`);

console.log('── Admin: yapılandırma ──');
await diff('GET /reports/settings', '/reports/settings', adminToken);
await diff('GET /reports/meta-mappings', '/reports/meta-mappings', adminToken);
await diff('GET /reports/google-mappings', '/reports/google-mappings', adminToken);
await diff('GET /reports/dashboard-bundle', '/reports/dashboard-bundle', adminToken);

console.log('\n── Admin: dönem verisi ──');
// Bilinen ve açıklanmış fark: eski denormalize toplamlar 32 şubede bayat/override'sız.
const TOPLAM_ALANLARI = ['toplam_harcama', 'toplam_erisim', 'toplam_gosterim', 'toplam_sonuc',
    'toplam_tiklama', 'toplamHarcama', 'toplamErisim', 'toplamSonuc', 'donem_sayisi', 'donemSayisi',
    'donem_ozetleri', 'son_donem'];
await diff('GET /reports/dashboard', '/reports/dashboard', adminToken,
    { yokSay: TOPLAM_ALANLARI, aciklama: 'bayat denormalize toplam (G8 notu)' });

const { data: ornekDonem } = await supabase.from('donemler')
    .select('sube_kod, baslangic, bitis').order('baslangic', { ascending: false }).limit(1).maybeSingle();
const kod = ornekDonem.sube_kod;

await diff(`GET /reports/sube/${kod}`, `/reports/sube/${kod}`, adminToken,
    { yokSay: TOPLAM_ALANLARI, aciklama: 'bayat denormalize toplam' });
await diff(`GET /reports/sube/${kod}/donemler`, `/reports/sube/${kod}/donemler`, adminToken);
await diff('GET /reports/sube/:kod/donem/veriler',
    `/reports/sube/${kod}/donem/veriler?baslangic=${ornekDonem.baslangic}&bitis=${ornekDonem.bitis}`, adminToken,
    { yokSay: ['.overrides'], aciklama: 'overrides artık bütçe kolonlarından' });
await diff('GET /reports/sube/:kod/not', `/reports/sube/${kod}/not`, adminToken);

console.log('\n── Bütçe ──');
await diff('GET /reports/butce-kampanya', '/reports/butce-kampanya', adminToken);
const { data: kampanya } = await supabase.from('kampanyalar')
    .select('id, donem_baslangic, donem_bitis').order('donem_baslangic', { ascending: false }).limit(1).maybeSingle();
if (kampanya) {
    await diff('GET /reports/butce-kampanya/:id', `/reports/butce-kampanya/${kampanya.id}`, adminToken,
        { yokSay: ['onceki_kalanlar', 'devredilenler'], aciklama: 'önceki dönem kalanı bayat toplamdan türüyordu' });
    await diff('GET /reports/butce-durum',
        `/reports/butce-durum?since=${kampanya.donem_baslangic}&until=${kampanya.donem_bitis}`, adminToken);
}

if (sahipToken) {
    console.log('\n── Şube sahibi ──');
    await diff('GET /reports/dashboard-bundle', '/reports/dashboard-bundle', sahipToken,
        { yokSay: TOPLAM_ALANLARI, aciklama: 'bayat denormalize toplam' });
    await diff('GET /reports/butce-bekleyen', '/reports/butce-bekleyen', sahipToken);
    if (kampanya) {
        await diff('GET /reports/butce-durum',
            `/reports/butce-durum?since=${kampanya.donem_baslangic}&until=${kampanya.donem_bitis}`, sahipToken);
    }
}

// ══════════════════════════════════════════════════
// Bütçe ↔ metrik izolasyonu (yalnız v2)
// ══════════════════════════════════════════════════
console.log('\n── Bütçe girişi → çekim simülasyonu → bütçe korunuyor mu? ──');

const TEST_SUBE = kod;
const TEST_BASLANGIC = '2019-01-01';
const TEST_BITIS = '2019-01-30';

async function oku() {
    return db.getDonemVeri(TEST_SUBE, TEST_BASLANGIC, TEST_BITIS);
}
function kontrol(ad, kosul, ayrinti = '') {
    if (!kosul) fark++;
    console.log(`${kosul ? YESIL + '✓' : KIRMIZI + '✗'}${SIFIRLA}     ${ad.padEnd(52)} ${GRI}${ayrinti}${SIFIRLA}`);
}

try {
    // 1) Bütçe girişi (admin ekranı yolu: updateOverrides)
    await db.updateOverrides(TEST_SUBE, TEST_BASLANGIC, TEST_BITIS,
        { planlananButce: 5000, devredilenMiktar: -250, merkezDestegi: 1000 });
    let v = await oku();
    kontrol('bütçe yazıldı', v?.planlanan_butce === 5000 && v?.devredilen_miktar === -250 && v?.merkez_destegi === 1000,
        `planlanan=${v?.planlanan_butce} devir=${v?.devredilen_miktar} merkez=${v?.merkez_destegi}`);

    // 2) Meta çekimi (yalnızca metrik kolonlarına yazar)
    await db.upsertMetaToplanlar(TEST_SUBE, TEST_BASLANGIC, TEST_BITIS, {
        harcama: 1234.56, erisim: 98765, gosterim: 200000, sonuc: 42, tiklama: 900,
        tiklama_tumu: 1200, mesaj: 5, yorum: 3, paylasim: 2,
    });
    v = await oku();
    kontrol('çekim sonrası BÜTÇE korundu',
        v?.planlanan_butce === 5000 && v?.devredilen_miktar === -250 && v?.merkez_destegi === 1000,
        `planlanan=${v?.planlanan_butce}`);
    kontrol('çekim metrikleri yazdı', v?.harcama === 1234.56 && v?.erisim === 98765, `harcama=${v?.harcama}`);

    // 3) Google çekimi (meta metriklerini de bütçeyi de ezmemeli)
    await db.upsertGoogleToplanlar(TEST_SUBE, TEST_BASLANGIC, TEST_BITIS, {
        google_arama: 10, google_harita: 20, google_telefon: 3,
        google_yol_tarifi: 4, google_web_tiklama: 5, google_menu_tiklama: 6,
    });
    v = await oku();
    kontrol('google çekimi meta metriğini ezmedi', v?.harcama === 1234.56 && v?.sonuc === 42);
    kontrol('google çekimi bütçeyi ezmedi', v?.planlanan_butce === 5000 && v?.merkez_destegi === 1000);

    // 4) Bütçe onayı (upsertButce) metrikleri ezmemeli
    await db.upsertButce(TEST_SUBE, TEST_BASLANGIC, TEST_BITIS, 7500, -250, 0);
    v = await oku();
    kontrol('bütçe yazımı metrikleri ezmedi', v?.harcama === 1234.56 && v?.google_arama === 10);
    kontrol('bütçe güncellendi', v?.planlanan_butce === 7500 && v?.merkez_destegi === 0);

    // 5) Kısmi override isteği diğer bütçe alanlarını sıfırlamamalı (rota mantığı)
    const mevcut = await oku();
    const yama = { planlananButce: 8000 };
    for (const [alan, kolon] of [['devredilenMiktar', 'devredilen_miktar'], ['merkezDestegi', 'merkez_destegi']]) {
        if (mevcut?.[kolon] !== undefined) yama[alan] = mevcut[kolon];
    }
    await db.updateOverrides(TEST_SUBE, TEST_BASLANGIC, TEST_BITIS, yama);
    v = await oku();
    kontrol('kısmi bütçe güncellemesi devri korudu', v?.planlanan_butce === 8000 && v?.devredilen_miktar === -250,
        `planlanan=${v?.planlanan_butce} devir=${v?.devredilen_miktar}`);

    // 6) Aggregate'ler test dönemini görüyor mu (view/hesap yolu)
    const sube = await db.getSubeByKod(TEST_SUBE);
    const ozet = (sube.donem_ozetleri || []).find((d) => d.baslangic === TEST_BASLANGIC);
    kontrol('donem_ozetleri hesaplandı', !!ozet && ozet.harcama === 1234.56 && ozet.planlanan_butce === 8000);
} finally {
    await db.deleteDonem(TEST_SUBE, TEST_BASLANGIC, TEST_BITIS);
    const kalan = await oku();
    kontrol('test dönemi temizlendi', kalan === null);
}

console.log('');
if (aciklananlar.length) {
    console.log(`${SARI}Açıklanmış farklar (G8/G9 notu):${SIFIRLA}`);
    for (const a of aciklananlar) console.log(`   ${GRI}• ${a}${SIFIRLA}`);
    console.log('');
}
if (fark === 0) console.log(`${YESIL}✓ Raporlar: beklenmeyen fark yok.${SIFIRLA}`);
else console.log(`${KIRMIZI}✗ ${fark} beklenmeyen fark/hata.${SIFIRLA}`);
process.exit(fark === 0 ? 0 : 1);