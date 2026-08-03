// ⛔ TARİHSEL — ARTIK ÇALIŞMAZ: config/firebase.js ve firebase-admin S2 sökümünde
//    kaldırıldı. Bu dosya yapılan işin kaydı olarak duruyor; çıktıları
//    scripts/parite/RAPOR*.md ve görev dosyalarındaki "Uygulandı" bloklarında.
// B4 — FAZ 2 DOĞRULAMA KAPISI (kimlik geçişi)
//
// Soru: kimlik sağlayıcı değişti, yanıtlar değişti mi?
// Yöntem: AYNI sunucuya (api2) aynı uçlar iki kez sorulur —
//   (a) yeni Supabase access token'ı, (b) ESKİ Firebase ID token'ı (Faz 1 kimliği).
// İkisi de aynı req.user'ı üretmek zorunda; gövdeler byte düzeyinde eşleşmeli.
// Eski API'ye HİÇ istek gitmez (veri Faz 1'de zaten kapatıldı; buradaki soru veri değil kimlik).
//
// Ayrıca Faz 2'ye özgü bekçiler: uid remap bütünlüğü, şube sahibi kapsamı,
// hayalet Firebase hesabı üretilmemesi.
//
// Kullanım: cd backend-v2 && node scripts/parite/faz2.mjs [taban]
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { auth } from '../../config/firebase.js';
import { supabase } from '../../config/supabase.js';

const buDizin = path.dirname(fileURLToPath(import.meta.url));
const V2_KOK = path.resolve(buDizin, '../..');
const TABAN = process.argv[2] || 'https://europe-west1-sutlucekadayif-web.cloudfunctions.net/api2/api';
const ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_JJ48onQZn0_fxQl2Rs6wVg_W2C1BgGT';

const Y = '\x1b[32m', K = '\x1b[31m', G = '\x1b[90m', X = '\x1b[0m';
const rapor = { get: [], bekci: [] };
let hataSayisi = 0;

// ── Token üretimi ──
const frontendEnv = Object.fromEntries(
    readFileSync(path.resolve(V2_KOK, '../frontend/.env'), 'utf8')
        .split('\n').filter((s) => s.includes('=') && !s.startsWith('#'))
        .map((s) => [s.slice(0, s.indexOf('=')).trim(), s.slice(s.indexOf('=') + 1).trim()])
);

async function supabaseToken(eposta) {
    const { data: link, error } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: eposta });
    if (error) throw new Error(`generateLink(${eposta}): ${error.message}`);
    const anon = createClient(process.env.SUPABASE_URL, ANON, { auth: { persistSession: false } });
    const { data, error: e2 } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
    if (e2) throw new Error(`verifyOtp(${eposta}): ${e2.message}`);
    return data.session.access_token;
}

// DİKKAT: yalnızca GERÇEK Firebase uid'leriyle çağrılır (uid_eslesme'den).
// Karşılığı olmayan bir uid verilirse Firebase o hesabı o an yaratır (hayalet hesap).
async function firebaseToken(firebaseUid, claims) {
    const custom = await auth.createCustomToken(firebaseUid, claims);
    const r = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${frontendEnv.VITE_FIREBASE_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: custom, returnSecureToken: true }) }
    );
    const j = await r.json();
    if (!j.idToken) throw new Error(`Firebase token: ${JSON.stringify(j).slice(0, 200)}`);
    return j.idToken;
}

// ── Normalize + diff (calistir.mjs ile aynı mantık) ──
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
    if (t(a) !== t(b)) { cikti.push(`${yol}: firebase(${t(a)})=${JSON.stringify(a)?.slice(0, 40)} supabase(${t(b)})=${JSON.stringify(b)?.slice(0, 40)}`); return cikti; }
    if (Array.isArray(a)) {
        if (a.length !== b.length) { cikti.push(`${yol}: dizi uzunluğu firebase=${a.length} supabase=${b.length}`); return cikti; }
        a.forEach((x, i) => farklar(x, b[i], `${yol}[${i}]`, cikti));
        return cikti;
    }
    if (a && typeof a === 'object') {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if (!(k in a)) { cikti.push(`${yol}.${k}: yalnız supabase'de = ${JSON.stringify(b[k])?.slice(0, 40)}`); continue; }
            if (!(k in b)) { cikti.push(`${yol}.${k}: yalnız firebase'de = ${JSON.stringify(a[k])?.slice(0, 40)}`); continue; }
            farklar(a[k], b[k], `${yol}.${k}`, cikti);
        }
        return cikti;
    }
    if (a !== b) cikti.push(`${yol}: firebase=${JSON.stringify(a)} supabase=${JSON.stringify(b)}`);
    return cikti;
}

async function getJson(yol, token) {
    try {
        const r = await fetch(`${TABAN}${yol}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        return { kod: r.status, govde: await r.json().catch(() => null) };
    } catch (e) {
        return { kod: 0, govde: { hata: e.message } };
    }
}

async function getDiff(ad, yol, kimlik) {
    // Sıra önemli: önce Firebase (Faz 1 kimliği), sonra Supabase. Cache varsa
    // ikisi de aynı scope'a düşer; scope farklı çıksaydı zaten fark olarak görünürdü.
    const fb = await getJson(yol, kimlik.fbToken);
    const sb = await getJson(yol, kimlik.sbToken);
    const satir = { ad, yol, kimlik: kimlik.ad, fbKod: fb.kod, sbKod: sb.kod, farklar: [] };

    if (fb.kod !== sb.kod) satir.farklar.push(`HTTP kodu: firebase=${fb.kod} supabase=${sb.kod}`);
    else satir.farklar.push(...farklar(normalize(fb.govde), normalize(sb.govde)));

    if (![200, 403, 404].includes(sb.kod)) satir.farklar.push(`beklenmedik durum: ${sb.kod}`);

    hataSayisi += satir.farklar.length;
    rapor.get.push(satir);
    const im = satir.farklar.length === 0 ? `${Y}✓${X}` : `${K}✗${X}`;
    console.log(`${im} ${kimlik.ad.padEnd(16)} ${ad.padEnd(42)} ${G}${sb.kod} · fark ${satir.farklar.length}${X}`);
    for (const f of satir.farklar.slice(0, 4)) console.log(`     ${K}• ${f}${X}`);
    return { fb, sb };
}

// ══════════════════════════════════════════════════
// Hazırlık — kimlikler yalnızca GERÇEK kullanıcılardan
// ══════════════════════════════════════════════════
const { data: eslesmeler } = await supabase.from('uid_eslesme').select('*');
const { data: kullanicilar } = await supabase.from('kullanici_sube').select('uid, role, sube_slug');

function kimlikKur(satir) {
    const esl = eslesmeler.find((e) => e.supabase_uid === satir.uid);
    if (!esl) throw new Error(`${satir.uid} için uid_eslesme kaydı yok — Firebase tarafı test edilemez`);
    return { esl, satir };
}

const adminSatir = kullanicilar.find((k) => k.role === 'admin');
const sahipSatir = kullanicilar.find((k) => k.role === 'sube_sahibi' && k.sube_slug);
if (!adminSatir || !sahipSatir) throw new Error('admin veya şube sahibi bulunamadı');

const kimlikler = [];
for (const [ad, satir] of [['admin', adminSatir], [`sahip:${sahipSatir.sube_slug}`, sahipSatir]]) {
    const { esl } = kimlikKur(satir);
    kimlikler.push({
        ad,
        rol: satir.role,
        sube: satir.sube_slug,
        eposta: esl.eposta,
        supabaseUid: esl.supabase_uid,
        firebaseUid: esl.firebase_uid,
        sbToken: await supabaseToken(esl.eposta),
        fbToken: await firebaseToken(esl.firebase_uid, { role: satir.role, subeSlug: satir.sube_slug || null }),
    });
}

const { data: ornekKurs } = await supabase.from('kurslar').select('id').limit(1).maybeSingle();
const { data: ornekKampanya } = await supabase.from('kampanyalar')
    .select('id, donem_baslangic, donem_bitis').order('donem_baslangic', { ascending: false }).limit(1).maybeSingle();
const { data: ornekDonem } = await supabase.from('donemler')
    .select('sube_kod, baslangic, bitis').order('baslangic', { ascending: false }).limit(1).maybeSingle();

console.log(`\ntaban: ${TABAN}`);
console.log(`kimlikler: ${kimlikler.map((k) => `${k.ad} (${k.eposta})`).join(', ')}\n`);

// ══════════════════════════════════════════════════
// 1) GET uçları — Supabase token'ı vs eski Firebase token'ı
// ══════════════════════════════════════════════════
console.log('═══ 1. GET uçları — Supabase token vs ESKİ Firebase token ═══');

function uclar(k) {
    const kendiSube = k.sube || ornekDonem.sube_kod;
    return [
        ['GET /users', '/users'],
        ['GET /categories', '/categories'],
        ['GET /branches', '/branches'],
        ['GET /branches/konumlar', '/branches/konumlar'],
        ['GET /media', '/media'],
        ['GET /media/klasorler', '/media/klasorler'],
        ['GET /profil', '/profil'],
        ['GET /onboarding/status', '/onboarding/status'],
        ['GET /basvurular', '/basvurular'],
        ['GET /geribildirim', '/geribildirim'],
        ['GET /isbasvuru', '/isbasvuru'],
        ['GET /menu/subeler', '/menu/subeler'],
        ['GET /menu/cache-durumu', '/menu/cache-durumu'],
        ['GET /products', '/products'],
        ['GET /products/katalog', '/products/katalog'],
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

const yanitlar = {};
for (const k of kimlikler) {
    console.log(`${G}── ${k.ad} ──${X}`);
    yanitlar[k.ad] = {};
    for (const [ad, yol] of uclar(k)) yanitlar[k.ad][ad] = await getDiff(ad, yol, k);
}

// ══════════════════════════════════════════════════
// 2) Bekçi listesi (Faz 2)
// ══════════════════════════════════════════════════
console.log('\n═══ 2. Bekçi listesi (Faz 2) ═══');

function bekci(ad, durum, kanit) {
    rapor.bekci.push({ ad, durum, kanit });
    const im = durum === 'geçti' ? `${Y}✓${X}` : `${K}✗${X}`;
    if (durum !== 'geçti') hataSayisi++;
    console.log(`${im} ${ad.padEnd(48)} ${G}${kanit}${X}`);
}

// — req.user şekli: iki dal da aynı kimliği üretiyor mu (fonksiyonel kanıt) —
const profilTutarli = kimlikler.every((k) => {
    const p = yanitlar[k.ad]['GET /profil'];
    return p.sb.govde?.hesap?.email === k.eposta && p.fb.govde?.hesap?.email === k.eposta;
});
const authKodu = readFileSync(path.resolve(V2_KOK, 'middleware/auth.js'), 'utf8');
const sekilTamam = ['uid:', 'email:', 'subeSlug:', 'role:'].every((a) => authKodu.includes(a));
bekci('req.user şekli sabit (iki dalda da)', profilTutarli && sekilTamam ? 'geçti' : 'kaldı',
    '/profil her iki token\'la da doğru hesabı döndürdü');

// — UID remap bütünlüğü —
const { data: ksTum } = await supabase.from('kullanici_sube').select('uid');
const { data: ilTum } = await supabase.from('ilerleme').select('uid');
const uuidMi = (u) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(u);
const eskiFormat = [...ksTum, ...ilTum].filter((r) => !uuidMi(r.uid));
const { data: authListe } = await supabase.auth.admin.listUsers({ perPage: 1000 });
const authIdler = new Set(authListe.users.map((u) => u.id));
const oksuz = ksTum.filter((r) => !authIdler.has(r.uid));
bekci('UID remap bütünlüğü', eskiFormat.length === 0 && oksuz.length === 0 ? 'geçti' : 'kaldı',
    `eski-format uid: ${eskiFormat.length}, Auth'ta karşılığı olmayan kullanici_sube satırı: ${oksuz.length}`);

// — Eşleme tablosu tam mı (Firebase dalı çalışan herkes için) —
const eslesmeEksik = eslesmeler.filter((e) => !authIdler.has(e.supabase_uid));
bekci('uid_eslesme tutarlı', eslesmeEksik.length === 0 ? 'geçti' : 'kaldı',
    `${eslesmeler.length} eşleme, hepsinin Supabase karşılığı var`);

// — Şube sahibi kapsamı: yalnız kendi şubesi —
const sahip = kimlikler.find((k) => k.rol === 'sube_sahibi');
const { data: tumSubeler } = await supabase.from('subeler').select('kod').range(0, 999);
const bundle = JSON.stringify(yanitlar[sahip.ad]['GET /reports/dashboard-bundle'].sb.govde ?? {});
const sizanSubeler = tumSubeler
    .map((s) => s.kod)
    .filter((kod) => kod !== sahip.sube && bundle.includes(`"${kod}"`));
bekci('Şube sahibi kapsamı (rapor paketi)', sizanSubeler.length === 0 ? 'geçti' : 'kaldı',
    sizanSubeler.length ? `sızan: ${sizanSubeler.slice(0, 5).join(', ')}` : `yalnız ${sahip.sube}`);

// — Şube sahibi ürün listesinde merkez alanları yok —
const urunMetni = JSON.stringify(yanitlar[sahip.ad]['GET /products'].sb.govde ?? {});
const sizanAlanlar = ['fiyat_override', 'gizli_subeler', 'menude_subeler', 'fiyat_serbest']
    .filter((a) => urunMetni.includes(`"${a}"`));
bekci('Rol bazlı yanıt projeksiyonu', sizanAlanlar.length === 0 ? 'geçti' : 'kaldı',
    sizanAlanlar.length ? `sızan: ${sizanAlanlar.join(', ')}` : 'merkez alanları yok');

// — Yönetim uçlarında 403 —
const admin = kimlikler.find((k) => k.rol === 'admin');
const negatifler = [
    ['GET /media', (await getJson('/media', sahip.sbToken)).kod],
    ['GET /reports/settings', (await getJson('/reports/settings', sahip.sbToken)).kod],
    ['GET /academy/progress/admin/stats', (await getJson('/academy/progress/admin/stats', sahip.sbToken)).kod],
];
const putYabanci = await fetch(`${TABAN}/users/${admin.supabaseUid}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${sahip.sbToken}`, 'Content-Type': 'application/json' },
    body: '{}',
});
negatifler.push(['PUT /users/<admin>', putYabanci.status]);
bekci('Şube sahibi yönetim uçlarına giremiyor', negatifler.every(([, kod]) => kod === 403) ? 'geçti' : 'kaldı',
    negatifler.map(([a, k]) => `${a}=${k}`).join(', '));

// — Token'sız istek reddi —
const tokensiz = await getJson('/products', null);
bekci('Token\'sız istek 401', tokensiz.kod === 401 ? 'geçti' : 'kaldı', `kod=${tokensiz.kod}`);

// — Firebase dalı hâlâ çalışıyor (rollback sigortası) —
const fbCalisiyor = rapor.get.every((g) => g.fbKod === g.sbKod);
bekci('Firebase dalı ayakta (rollback sigortası)', fbCalisiyor ? 'geçti' : 'kaldı',
    'her uçta eski token yeni token ile aynı HTTP kodunu aldı');

// — Hayalet Firebase hesabı üretilmedi —
const { users: fbKullanicilar } = await auth.listUsers(1000);
const epostasiz = fbKullanicilar.filter((u) => !u.email);
bekci('Yeni hayalet Firebase hesabı yok', epostasiz.length <= 1 ? 'geçti' : 'kaldı',
    `Firebase hesap: ${fbKullanicilar.length}, e-postasız: ${epostasiz.length} (Faz 1'den kalan 1 tanesi bekleniyor)`);

// — İzin dosyası ikizliği —
const izinEski = readFileSync(path.resolve(V2_KOK, '../shared/permissions.js'), 'utf8');
const izinYeni = readFileSync(path.resolve(V2_KOK, 'shared/permissions.js'), 'utf8');
bekci('İzin dosyası ikizliği', izinEski === izinYeni ? 'geçti' : 'kaldı',
    izinEski === izinYeni ? 'shared/ ↔ backend-v2/shared/ birebir aynı' : 'DOSYALAR AYRIŞMIŞ');

// — Frontend'de Firebase kalıntısı yok —
const fePaket = JSON.parse(readFileSync(path.resolve(V2_KOK, '../frontend/package.json'), 'utf8'));
bekci('Frontend Firebase\'den ayrıldı', !fePaket.dependencies.firebase ? 'geçti' : 'kaldı',
    `firebase paketi: ${fePaket.dependencies.firebase ?? 'yok'}, supabase-js: ${fePaket.dependencies['@supabase/supabase-js']}`);

// ══════════════════════════════════════════════════
// RAPOR-FAZ2.md
// ══════════════════════════════════════════════════
const md = [];
md.push('# Faz 2 Doğrulama Kapısı (B4)', '');
md.push(`Koşum: ${new Date().toISOString()}`, `Taban: \`${TABAN}\``, '');
md.push('Kimlik sağlayıcı değişti, veri değişmedi. Bu yüzden karşılaştırma **eski API'
    + ' ile değil**, aynı sunucuya iki farklı token'
    + ' (yeni Supabase access token\'ı ve Faz 1\'in Firebase ID token\'ı) ile sorularak yapıldı.', '');
md.push(`**Sonuç: ${hataSayisi === 0 ? '✅ SIFIR FARK' : `❌ ${hataSayisi} fark/başarısız bekçi`}**`, '');

md.push('## 1. GET uçları', '');
md.push(`${rapor.get.length} istek çifti (${kimlikler.length} kimlik × ${rapor.get.length / kimlikler.length} uç).`, '');
md.push('| Kimlik | Uç | HTTP (fb/sb) | Fark |', '|---|---|---|---|');
for (const g of rapor.get) {
    md.push(`| ${g.kimlik} | \`${g.ad}\` | ${g.fbKod}/${g.sbKod} | ${g.farklar.length ? `**${g.farklar.length}**` : '0'} |`);
}
const acik = rapor.get.filter((g) => g.farklar.length);
if (acik.length) {
    md.push('', '### ❌ Farklar', '');
    for (const g of acik) {
        md.push(`- \`${g.ad}\` (${g.kimlik}):`);
        for (const f of g.farklar.slice(0, 10)) md.push(`  - ${f}`);
    }
}

md.push('', '## 2. Bekçi listesi', '');
md.push('| Bekçi | Durum | Kanıt |', '|---|---|---|');
for (const b of rapor.bekci) md.push(`| ${b.ad} | ${b.durum === 'geçti' ? '✅ geçti' : '❌ kaldı'} | ${b.kanit} |`);

md.push('', '---', '', '*Bu rapor `scripts/parite/faz2.mjs` tarafından üretildi.*');
writeFileSync(path.join(buDizin, 'RAPOR-FAZ2.md'), md.join('\n'));

console.log('');
console.log(`${hataSayisi === 0 ? Y + '✓ FAZ 2 KAPISI GEÇİLDİ' : K + `✗ ${hataSayisi} sorun`}${X} — rapor: scripts/parite/RAPOR-FAZ2.md`);
process.exit(hataSayisi === 0 ? 0 : 1);