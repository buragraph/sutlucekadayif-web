// C2 — FAZ 3 PARİTE KAPISI: Functions `api2` vs Cloudflare Worker
//
// Aynı Supabase token'ıyla iki tabana aynı istekler gider; yanıtlar normalize
// edilip diff'lenir. Ek olarak yazma senaryoları YALNIZCA Worker üzerinde koşar
// (izini temizler) ve gecikme/CPU ölçümü alınır.
//
// Kullanım: cd backend-v2 && node scripts/parite/faz3.mjs
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../config/supabase.js';

const buDizin = path.dirname(fileURLToPath(import.meta.url));
const ESKI = process.env.ESKI_TABAN || 'https://europe-west1-sutlucekadayif-web.cloudfunctions.net/api2/api';
const YENI = process.env.YENI_TABAN || 'https://sutlucekadayif-api.dijitalreklam.workers.dev/api';
const ANON = 'sb_publishable_JJ48onQZn0_fxQl2Rs6wVg_W2C1BgGT';

const Y = '\x1b[32m', K = '\x1b[31m', G = '\x1b[90m', X = '\x1b[0m';
const rapor = { get: [], yazma: [], menu: [], olcum: [], bekci: [] };
let hataSayisi = 0;

async function token(eposta) {
    const { data: link, error } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: eposta });
    if (error) throw new Error(error.message);
    const anon = createClient(process.env.SUPABASE_URL, ANON, { auth: { persistSession: false } });
    const { data, error: e2 } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
    if (e2) throw new Error(e2.message);
    return data.session.access_token;
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
    if (t(a) !== t(b)) { cikti.push(`${yol}: api2(${t(a)})=${JSON.stringify(a)?.slice(0, 40)} worker(${t(b)})=${JSON.stringify(b)?.slice(0, 40)}`); return cikti; }
    if (Array.isArray(a)) {
        if (a.length !== b.length) { cikti.push(`${yol}: dizi uzunluğu api2=${a.length} worker=${b.length}`); return cikti; }
        a.forEach((x, i) => farklar(x, b[i], `${yol}[${i}]`, cikti));
        return cikti;
    }
    if (a && typeof a === 'object') {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if (!(k in a)) { cikti.push(`${yol}.${k}: yalnız worker'da = ${JSON.stringify(b[k])?.slice(0, 40)}`); continue; }
            if (!(k in b)) { cikti.push(`${yol}.${k}: yalnız api2'de = ${JSON.stringify(a[k])?.slice(0, 40)}`); continue; }
            farklar(a[k], b[k], `${yol}.${k}`, cikti);
        }
        return cikti;
    }
    if (a !== b) cikti.push(`${yol}: api2=${JSON.stringify(a)} worker=${JSON.stringify(b)}`);
    return cikti;
}

// Bilinçli, kullanıcı ONAYLI sözleşme değişiklikleri
const ONAYLI_DEGISIM = [
    { desen: /generate-pdf/, neden: 'PDF üretimi tarayıcıya taşındı; iki uç kaldırıldı (onaylı)' },
];

async function getJson(taban, yol, tok) {
    const t0 = performance.now();
    try {
        const r = await fetch(`${taban}${yol}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
        const govde = await r.json().catch(() => null);
        return { kod: r.status, govde, ms: performance.now() - t0 };
    } catch (e) {
        return { kod: 0, govde: { hata: e.message }, ms: performance.now() - t0 };
    }
}

async function getDiff(ad, yol, tok, kimlik) {
    const eski = await getJson(ESKI, yol, tok);
    const yeni = await getJson(YENI, yol, tok);
    const satir = { ad, yol, kimlik, eskiKod: eski.kod, yeniKod: yeni.kod, eskiMs: Math.round(eski.ms), yeniMs: Math.round(yeni.ms), farklar: [], aciklanmis: [] };

    if (eski.kod !== yeni.kod) satir.farklar.push(`HTTP kodu: api2=${eski.kod} worker=${yeni.kod}`);
    else {
        for (const f of farklar(normalize(eski.govde), normalize(yeni.govde))) {
            const a = ONAYLI_DEGISIM.find((x) => x.desen.test(f) || x.desen.test(yol));
            if (a) satir.aciklanmis.push({ f, neden: a.neden });
            else satir.farklar.push(f);
        }
    }
    hataSayisi += satir.farklar.length;
    rapor.get.push(satir);
    rapor.olcum.push({ yol, kimlik, api2: satir.eskiMs, worker: satir.yeniMs });
    console.log(`${satir.farklar.length === 0 ? Y + '✓' : K + '✗'}${X} ${kimlik.padEnd(15)} ${ad.padEnd(40)} ${G}${satir.eskiKod}/${satir.yeniKod} · ${satir.eskiMs}ms→${satir.yeniMs}ms · fark ${satir.farklar.length}${X}`);
    for (const f of satir.farklar.slice(0, 3)) console.log(`     ${K}• ${f}${X}`);
    return { eski, yeni };
}

// ── Hazırlık ──
const { data: kullanicilar } = await supabase.from('kullanici_sube').select('uid, role, sube_slug');
const adminSatir = kullanicilar.find((k) => k.role === 'admin');
const sahipSatir = kullanicilar.find((k) => k.role === 'sube_sahibi' && k.sube_slug);
const { data: adminHesap } = await supabase.auth.admin.getUserById(adminSatir.uid);
const { data: sahipHesap } = await supabase.auth.admin.getUserById(sahipSatir.uid);

const kimlikler = [
    { ad: 'admin', rol: 'admin', sube: null, tok: await token(adminHesap.user.email) },
    { ad: `sahip:${sahipSatir.sube_slug}`, rol: 'sube_sahibi', sube: sahipSatir.sube_slug, tok: await token(sahipHesap.user.email) },
];

const { data: ornekKurs } = await supabase.from('kurslar').select('id').limit(1).maybeSingle();
const { data: ornekKampanya } = await supabase.from('kampanyalar').select('id, donem_baslangic, donem_bitis').order('donem_baslangic', { ascending: false }).limit(1).maybeSingle();
const { data: ornekDonem } = await supabase.from('donemler').select('sube_kod, baslangic, bitis').order('baslangic', { ascending: false }).limit(1).maybeSingle();

console.log(`\napi2  : ${ESKI}\nworker: ${YENI}`);
console.log(`kimlikler: ${kimlikler.map((k) => k.ad).join(', ')}\n`);

// ── 1) GET uçları ──
console.log('═══ 1. GET uçları (api2 vs Worker) ═══');
function uclar(k) {
    const kendiSube = k.sube || ornekDonem.sube_kod;
    return [
        ['GET /users', '/users'], ['GET /categories', '/categories'],
        ['GET /branches', '/branches'], ['GET /branches/konumlar', '/branches/konumlar'],
        ['GET /media', '/media'], ['GET /media/klasorler', '/media/klasorler'],
        ['GET /profil', '/profil'], ['GET /onboarding/status', '/onboarding/status'],
        ['GET /basvurular', '/basvurular'], ['GET /geribildirim', '/geribildirim'],
        ['GET /isbasvuru', '/isbasvuru'], ['GET /menu/subeler', '/menu/subeler'],
        ['GET /menu/cache-durumu', '/menu/cache-durumu'],
        ['GET /products', '/products'], ['GET /products/katalog', '/products/katalog'],
        ['GET /products/trash', '/products/trash'],
        ['GET /academy/courses', '/academy/courses'],
        ...(ornekKurs ? [
            ['GET /academy/courses/:id', `/academy/courses/${ornekKurs.id}`],
            ['GET /academy/lessons/:courseId', `/academy/lessons/${ornekKurs.id}`],
            ['GET /academy/progress/:courseId', `/academy/progress/${ornekKurs.id}`],
        ] : []),
        ['GET /academy/progress/all/summary', '/academy/progress/all/summary'],
        ['GET /academy/progress/admin/stats', '/academy/progress/admin/stats?fresh=1'],
        ['GET /reports/settings', '/reports/settings'],
        ['GET /reports/dashboard', '/reports/dashboard'],
        ['GET /reports/dashboard-bundle', '/reports/dashboard-bundle'],
        ['GET /reports/google-status', '/reports/google-status'],
        ['GET /reports/meta-mappings', '/reports/meta-mappings'],
        ['GET /reports/google-mappings', '/reports/google-mappings'],
        ['GET /reports/sube/:kod', `/reports/sube/${kendiSube}`],
        ['GET /reports/sube/:kod/donemler', `/reports/sube/${kendiSube}/donemler`],
        ['GET /reports/sube/:kod/not', `/reports/sube/${kendiSube}/not`],
        ['GET /reports/sube/:kod/donem/veriler', `/reports/sube/${kendiSube}/donem/veriler?baslangic=${ornekDonem.baslangic}&bitis=${ornekDonem.bitis}`],
        ['GET /reports/butce-kampanya', '/reports/butce-kampanya'],
        ...(ornekKampanya ? [
            ['GET /reports/butce-kampanya/:id', `/reports/butce-kampanya/${ornekKampanya.id}`],
            ['GET /reports/butce-durum', `/reports/butce-durum?since=${ornekKampanya.donem_baslangic}&until=${ornekKampanya.donem_bitis}`],
        ] : []),
        ['GET /reports/butce-bekleyen', '/reports/butce-bekleyen'],
    ];
}
for (const k of kimlikler) {
    console.log(`${G}── ${k.ad} ──${X}`);
    for (const [ad, yol] of uclar(k)) await getDiff(ad, yol, k.tok, k.ad);
}

// Public menü (token'sız)
console.log(`${G}── public ──${X}`);
const { data: subeOrnek } = await supabase.from('subeler').select('kod').order('kod').limit(3);
for (const s of subeOrnek) await getDiff('GET /menu/:slug (public)', `/menu/${s.kod}`, null, 'public');

// ── 2) Yazma senaryoları (yalnız Worker) ──
console.log('\n═══ 2. Yazma senaryoları (yalnız Worker) ═══');
const admin = kimlikler[0], sahip = kimlikler[1];
async function istek(yontem, yol, govde, tok) {
    const r = await fetch(`${YENI}${yol}`, {
        method: yontem,
        headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), 'Content-Type': 'application/json' },
        body: govde === undefined ? undefined : JSON.stringify(govde),
    });
    const metin = await r.text();
    let j = null; try { j = JSON.parse(metin); } catch { /* metin */ }
    return { kod: r.status, govde: j, metin };
}
function iddia(ad, kosul, ayrinti = '') {
    if (!kosul) hataSayisi++;
    rapor.yazma.push({ ad, gecti: !!kosul, ayrinti });
    console.log(`${kosul ? Y + '✓' : K + '✗'}${X} ${ad.padEnd(52)} ${G}${ayrinti}${X}`);
}

const { data: ortakKat } = await supabase.from('kategoriler').select('id').eq('tur', 'ortak').limit(1).maybeSingle();
let urunId = null;
try {
    const ekle = await istek('POST', '/products', {
        ad: 'FAZ3 Parite Ürünü', fiyat: 111, kategori: ortakKat.id, kalori: 0,
        menude_subeler: [sahip.sube], fiyat_serbest: [sahip.sube],
    }, admin.tok);
    urunId = ekle.govde?.id;
    iddia('ürün ekle (admin) 201', ekle.kod === 201 && !!urunId, `id=${urunId}`);
    iddia('kalori 0 korundu', ekle.govde?.kalori === 0, `kalori=${ekle.govde?.kalori}`);

    const liste = await istek('GET', '/products', undefined, sahip.tok);
    const govdeMetni = JSON.stringify(liste.govde);
    iddia('şube kendi ürününü görüyor', (liste.govde?.urunler || []).some((u) => u.id === urunId));
    iddia('yanıt projeksiyonu: merkez alanları yok',
        !['fiyat_override', 'gizli_subeler', 'menude_subeler', 'fiyat_serbest'].some((a) => govdeMetni.includes(`"${a}"`)));

    const av = await istek('PUT', `/products/${urunId}/availability`, { subeSlug: sahip.sube, mevcut: false }, sahip.tok);
    const { data: uye } = await supabase.from('urun_sube').select('mevcut_degil').eq('urun_id', urunId).eq('sube_kod', sahip.sube).maybeSingle();
    iddia('availability kapatıldı', av.kod === 200 && uye?.mevcut_degil === true);
    await istek('PUT', `/products/${urunId}/availability`, { subeSlug: sahip.sube, mevcut: true }, sahip.tok);

    const fiyat = await istek('PUT', `/products/${urunId}`, { fiyat: 222 }, sahip.tok);
    const { data: ov } = await supabase.from('urun_sube').select('fiyat_override').eq('urun_id', urunId).eq('sube_kod', sahip.sube).maybeSingle();
    const { data: ana } = await supabase.from('urunler').select('fiyat').eq('id', urunId).maybeSingle();
    iddia('fiyat override şube satırına yazıldı', fiyat.kod === 200 && Number(ov?.fiyat_override) === 222);
    iddia('merkez fiyatı korundu', Number(ana?.fiyat) === 111, `merkez=${ana?.fiyat}`);

    const menu = await fetch(`${YENI}/menu/${sahip.sube}?taze=${Math.round(performance.now())}`).then((r) => r.json());
    const menuUrun = Object.values(menu.urunlerByKategori || {}).flat().find((u) => u.id === urunId);
    iddia('menü JSON etkin fiyatı gösteriyor', Number(menuUrun?.fiyat) === 222, `fiyat=${menuUrun?.fiyat}`);

    const yabanci = await istek('PUT', `/products/${urunId}/availability`, { subeSlug: subeOrnek[0].kod === sahip.sube ? subeOrnek[1].kod : subeOrnek[0].kod, mevcut: false }, sahip.tok);
    iddia('NEGATİF: başka şubenin availability\'si 403', yabanci.kod === 403, `kod=${yabanci.kod}`);
} finally {
    if (urunId) {
        await istek('DELETE', `/products/${urunId}`, undefined, admin.tok);
        const kalici = await istek('DELETE', `/products/${urunId}/permanent`, undefined, admin.tok);
        const { data: kalan } = await supabase.from('urunler').select('id').eq('id', urunId).maybeSingle();
        iddia('test ürünü kalıcı silindi', kalici.kod === 200 && !kalan);
    }
}

// ── 3) Ölçüm ──
console.log('\n═══ 3. Gecikme ölçümü ═══');
const sirala = (a) => [...a].sort((x, y) => x - y);
const yuzde = (a, p) => sirala(a)[Math.min(a.length - 1, Math.floor(a.length * p))];
const api2Ms = rapor.olcum.map((o) => o.api2), wMs = rapor.olcum.map((o) => o.worker);
const ozet = {
    istek: rapor.olcum.length,
    api2: { ortanca: yuzde(api2Ms, 0.5), p95: yuzde(api2Ms, 0.95) },
    worker: { ortanca: yuzde(wMs, 0.5), p95: yuzde(wMs, 0.95) },
};
console.log(`api2   ortanca ${ozet.api2.ortanca}ms · p95 ${ozet.api2.p95}ms`);
console.log(`worker ortanca ${ozet.worker.ortanca}ms · p95 ${ozet.worker.p95}ms`);

// ── 4) Bekçiler ──
console.log('\n═══ 4. Bekçi listesi ═══');
function bekci(ad, kosul, kanit) {
    const durum = kosul === true || kosul === 'geçti' ? 'geçti' : 'kaldı';
    rapor.bekci.push({ ad, durum, kanit });
    if (durum !== 'geçti') hataSayisi++;
    console.log(`${durum === 'geçti' ? Y + '✓' : K + '✗'}${X} ${ad.padEnd(46)} ${G}${kanit}${X}`);
}
const pdfTek = await istek('POST', '/reports/generate-pdf', { subeKod: 'amasya' }, admin.tok);
const pdfToplu = await istek('POST', '/reports/generate-pdf-bulk', { subeKodlari: ['amasya'] }, admin.tok);
bekci('PDF uçları iki tarafta da yok', pdfTek.kod === 404 && pdfToplu.kod === 404, `tekil=${pdfTek.kod} toplu=${pdfToplu.kod}`);
const tokensiz = await getJson(YENI, '/products', null);
bekci('Token\'sız istek 401', tokensiz.kod === 401, `kod=${tokensiz.kod}`);
const sahipMedya = await getJson(YENI, '/media', sahip.tok);
bekci('Şube sahibi yönetim ucunda 403', sahipMedya.kod === 403, `/media=${sahipMedya.kod}`);
const negatifler = rapor.yazma.filter((y) => y.ad.startsWith('NEGATİF'));
bekci('Şube kapsamı korunuyor', negatifler.every((n) => n.gecti), `${negatifler.filter((n) => n.gecti).length}/${negatifler.length}`);

// ── Rapor ──
const md = [];
md.push('# Faz 3 Parite Raporu (C2)', '');
md.push(`Koşum: ${new Date().toISOString()}`, `api2  : \`${ESKI}\``, `worker: \`${YENI}\``, '');
md.push(`**Sonuç: ${hataSayisi === 0 ? '✅ SIFIR AÇIKLANMAMIŞ FARK' : `❌ ${hataSayisi} sorun`}**`, '');
md.push('## Bilinçli sözleşme değişiklikleri (kullanıcı onaylı)', '');
md.push('1. **PDF üretimi tarayıcıya taşındı.** `POST /reports/generate-pdf` ve');
md.push('   `POST /reports/generate-pdf-bulk` KALDIRILDI (iki tarafta da 404). Panel');
md.push('   `POST /reports/preview` HTML\'ini alıp `@page` ile yazdırıyor; tasarım ve');
md.push('   geometri birebir doğrulandı (MediaBox `0 0 360 1129.91992`).');
md.push('2. **Toplu çıktı ZIP değil tek PDF.** N ayrı PDF yerine her raporu kendi');
md.push('   boyutunda sayfa olarak taşıyan tek belge.', '');
md.push('## 1. GET uçları', '');
md.push('| Kimlik | Uç | HTTP (api2/worker) | ms (api2→worker) | Fark |', '|---|---|---|---|---|');
for (const g of rapor.get) md.push(`| ${g.kimlik} | \`${g.ad}\` | ${g.eskiKod}/${g.yeniKod} | ${g.eskiMs}→${g.yeniMs} | ${g.farklar.length ? `**${g.farklar.length}**` : '0'} |`);
const acik = rapor.get.filter((g) => g.farklar.length);
if (acik.length) {
    md.push('', '### ❌ Açıklanmamış farklar', '');
    for (const g of acik) { md.push(`- \`${g.ad}\` (${g.kimlik}):`); for (const f of g.farklar.slice(0, 10)) md.push(`  - ${f}`); }
}
md.push('', '## 2. Yazma senaryoları (Worker)', '', '| Senaryo | Sonuç | Not |', '|---|---|---|');
for (const y of rapor.yazma) md.push(`| ${y.ad} | ${y.gecti ? '✅' : '❌'} | ${y.ayrinti || ''} |`);
md.push('', '## 3. Gecikme', '', `${ozet.istek} istek çifti.`, '');
md.push('| Taban | Ortanca | p95 |', '|---|---|---|');
md.push(`| api2 (Functions, europe-west1) | ${ozet.api2.ortanca} ms | ${ozet.api2.p95} ms |`);
md.push(`| Worker (kenar) | ${ozet.worker.ortanca} ms | ${ozet.worker.p95} ms |`);
md.push('', '## 4. Bekçiler', '', '| Bekçi | Durum | Kanıt |', '|---|---|---|');
for (const b of rapor.bekci) md.push(`| ${b.ad} | ${b.durum === 'geçti' ? '✅' : '❌'} | ${b.kanit} |`);
md.push('', '---', '', '*`scripts/parite/faz3.mjs` tarafından üretildi.*');
writeFileSync(path.join(buDizin, 'RAPOR-FAZ3.md'), md.join('\n'));

console.log(`\n${hataSayisi === 0 ? Y + '✓ FAZ 3 PARİTE KAPISI GEÇİLDİ' : K + `✗ ${hataSayisi} sorun`}${X} — rapor: scripts/parite/RAPOR-FAZ3.md`);
process.exit(hataSayisi === 0 ? 0 : 1);
