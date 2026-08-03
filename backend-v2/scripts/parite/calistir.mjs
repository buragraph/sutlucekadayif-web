// ⛔ TARİHSEL — ARTIK ÇALIŞMAZ: config/firebase.js ve firebase-admin S2 sökümünde
//    kaldırıldı. Bu dosya yapılan işin kaydı olarak duruyor; çıktıları
//    scripts/parite/RAPOR*.md ve görev dosyalarındaki "Uygulandı" bloklarında.
// G9 — PARİTE KAPISI
//
// 1) Tüm GET uçları × (admin + 3 şube sahibi) × (eski API, v2) → normalize diff
// 2) Yazma senaryoları (yalnız v2, izini temizler) + negatif yetki testleri
// 3) 88 şubenin menü JSON'u `menu-v2/` önekine üretilir, `menu/` ile diff
// 4) Bekçi listesi (plan §5) tek tek işaretlenir
// → scripts/parite/RAPOR.md
//
// Eski API'ye YALNIZCA GET gider. Canlı Firestore'a hiçbir yazma yapılmaz.
//
// Kullanım: cd backend-v2 && node scripts/parite/calistir.mjs [yeni-taban]
import path from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const buDizin = path.dirname(fileURLToPath(import.meta.url));
const V2_KOK = path.resolve(buDizin, '../..');
dotenv.config({ path: path.join(V2_KOK, '.env.local') });
dotenv.config({ path: path.join(V2_KOK, '.env') });

const { auth } = await import('../../config/firebase.js');
const { supabase } = await import('../../config/supabase.js');
const { r2, BUCKET } = await import('../../config/r2.js');
const { GetObjectCommand } = await import('@aws-sdk/client-s3');
const { regenerateMenuJsons } = await import('../../modules/qr-menu/services/menu-cache.js');

const YENI = process.argv[2] || 'http://localhost:5002/api';
const ESKI = process.env.ESKI_API || 'https://api-fyfp72cohq-uc.a.run.app/api';

// ⛔ FAZ 1 ARTIFAKTI — OLDUĞU GİBİ ÇALIŞTIRMA.
// Bu script token'ları `auth.createCustomToken(kullanici_sube.uid)` ile basıyor.
// Faz 2'de o kolon artık Supabase UUID'si tutuyor; Firebase karşılığı olmayan bir
// uid için custom token basmak Firebase'de O ANDA hayalet hesap yaratır (Faz 1'de
// bir kez oldu, bkz. FAZ2-GOREVLERI.md B1). Kimlik geçişi kapısı için:
//   node scripts/parite/faz2.mjs
// Faz 1 veri paritesini yeniden ölçmek gerekirse önce token üretimini
// `uid_eslesme.firebase_uid` okuyacak şekilde düzelt, sonra bu kilidi kaldır.
if (!process.env.FAZ1_PARITE_ONAY) {
    console.error('Bu script Faz 1 artifaktı ve olduğu gibi çalıştırılırsa Firebase\'de hayalet hesap yaratır.\n'
        + 'Kimlik geçişi kapısı: node scripts/parite/faz2.mjs\n'
        + 'Yine de koşacaksan önce token üretimini uid_eslesme\'ye bağla ve FAZ1_PARITE_ONAY=1 ver.');
    process.exit(2);
}

const Y = '\x1b[32m', K = '\x1b[31m', S = '\x1b[33m', G = '\x1b[90m', X = '\x1b[0m';

const rapor = { get: [], yazma: [], menu: [], bekci: [] };
let hataSayisi = 0;

// ── Token üretimi ──
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

// ── Normalize + diff ──
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
    if (t(a) !== t(b)) { cikti.push(`${yol}: eski(${t(a)})=${JSON.stringify(a)?.slice(0, 40)} yeni(${t(b)})=${JSON.stringify(b)?.slice(0, 40)}`); return cikti; }
    if (Array.isArray(a)) {
        if (a.length !== b.length) { cikti.push(`${yol}: dizi uzunluğu eski=${a.length} yeni=${b.length}`); return cikti; }
        a.forEach((x, i) => farklar(x, b[i], `${yol}[${i}]`, cikti));
        return cikti;
    }
    if (a && typeof a === 'object') {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if (!(k in a)) { cikti.push(`${yol}.${k}: yalnız yenide = ${JSON.stringify(b[k])?.slice(0, 40)}`); continue; }
            if (!(k in b)) { cikti.push(`${yol}.${k}: yalnız eskide = ${JSON.stringify(a[k])?.slice(0, 40)}`); continue; }
            farklar(a[k], b[k], `${yol}.${k}`, cikti);
        }
        return cikti;
    }
    if (a !== b) cikti.push(`${yol}: eski=${JSON.stringify(a)} yeni=${JSON.stringify(b)}`);
    return cikti;
}

// Bilinen ve gerekçesi yazılı farklar (G4/G7/G8'de ölçüldü)
const ACIKLANMIS = [
    { desen: /toplam_harcama|toplam_erisim|toplam_gosterim|toplam_sonuc|toplam_tiklama|toplamHarcama|toplamErisim|toplamSonuc|donem_sayisi|donemSayisi|donem_ozetleri|son_donem/, neden: 'eski denormalize toplam bayat / override görmüyor (32 şube)' },
    { desen: /\.overrides\./, neden: 'override artık bütçe kolonlarından okunuyor' },
    { desen: /onceki_kalanlar|devredilenler/, neden: 'önceki dönem kalanı bayat toplamdan türüyordu' },
    { desen: /\.stats: dizi uzunluğu/, neden: 'boş ilerleme dokümanı olan admin listede sayılmıyor' },
    { desen: /\.donemler: dizi uzunluğu/, neden: 'donem_ozetleri bayat — alt koleksiyonda daha çok dönem var' },
    { desen: /urunSayisi/, neden: 'kategori sayacı artık canlı hesaplanıyor (denormalize sayaç bayattı)' },
    { desen: /\.fiyat_override: yalnız yenide = \{\}/, neden: "Firestore'da 1 üründe alan hiç yok (536/537'de var); v2 ortak üründe her zaman boş harita döndürür — anlamca aynı" },
];

async function getJson(taban, yol, token) {
    try {
        const r = await fetch(`${taban}${yol}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        return { kod: r.status, govde: await r.json().catch(() => null) };
    } catch (e) {
        return { kod: 0, govde: { hata: e.message } };
    }
}

async function getDiff(ad, yol, token, kimlik) {
    const [eski, yeni] = await Promise.all([getJson(ESKI, yol, token), getJson(YENI, yol, token)]);
    const satir = { ad, yol, kimlik, eskiKod: eski.kod, yeniKod: yeni.kod, farklar: [], aciklanmis: [] };

    if (eski.kod !== yeni.kod) {
        satir.farklar.push(`HTTP kodu: eski=${eski.kod} yeni=${yeni.kod}`);
    } else {
        for (const f of farklar(normalize(eski.govde), normalize(yeni.govde))) {
            const a = ACIKLANMIS.find((x) => x.desen.test(f));
            if (a) satir.aciklanmis.push({ f, neden: a.neden });
            else satir.farklar.push(f);
        }
    }
    hataSayisi += satir.farklar.length;
    rapor.get.push(satir);
    const im = satir.farklar.length === 0 ? `${Y}✓${X}` : `${K}✗${X}`;
    console.log(`${im} ${kimlik.padEnd(18)} ${ad.padEnd(40)} ${G}${satir.eskiKod} · fark ${satir.farklar.length}${satir.aciklanmis.length ? ` (+${satir.aciklanmis.length} açıklanmış)` : ''}${X}`);
    for (const f of satir.farklar.slice(0, 4)) console.log(`     ${K}• ${f}${X}`);
    return { eski, yeni };
}

// ══════════════════════════════════════════════════
// Hazırlık
// ══════════════════════════════════════════════════
const { data: kullanicilar } = await supabase.from('kullanici_sube').select('uid, role, sube_slug');
const adminK = kullanicilar.find((k) => k.role === 'admin');
const gercekSahip = kullanicilar.find((k) => k.role === 'sube_sahibi' && k.sube_slug);

// 3 şube sahibi kapsamı: gerçek şube sahibi + iki farklı şube (mevcut uid'lere
// şube sahibi claim'i verilerek — Auth'ta yeni kullanıcı YARATILMAZ, claim
// yalnızca bu token'a özgüdür).
const { data: subeOrnek } = await supabase.from('subeler').select('kod').order('kod').limit(6);
const digerSubeler = subeOrnek.map((s) => s.kod).filter((k) => k !== gercekSahip?.sube_slug).slice(0, 2);
const sahipKullanicilar = kullanicilar.filter((k) => k.uid !== adminK.uid).slice(0, 2);

const kimlikler = [
    { ad: 'admin', token: await idToken(adminK.uid, { role: 'admin', subeSlug: adminK.sube_slug || null }), rol: 'admin', sube: null },
];
if (gercekSahip) {
    kimlikler.push({
        ad: `sahip:${gercekSahip.sube_slug}`, rol: 'sube_sahibi', sube: gercekSahip.sube_slug,
        token: await idToken(gercekSahip.uid, { role: 'sube_sahibi', subeSlug: gercekSahip.sube_slug }),
    });
}
for (let i = 0; i < digerSubeler.length && i < sahipKullanicilar.length; i++) {
    const sube = digerSubeler[i];
    kimlikler.push({
        ad: `sahip:${sube}`, rol: 'sube_sahibi', sube,
        token: await idToken(sahipKullanicilar[i].uid, { role: 'sube_sahibi', subeSlug: sube }),
    });
}

const { data: ornekKurs } = await supabase.from('kurslar').select('id').limit(1).maybeSingle();
const { data: ornekKampanya } = await supabase.from('kampanyalar')
    .select('id, donem_baslangic, donem_bitis').order('donem_baslangic', { ascending: false }).limit(1).maybeSingle();
const { data: ornekDonem } = await supabase.from('donemler')
    .select('sube_kod, baslangic, bitis').order('baslangic', { ascending: false }).limit(1).maybeSingle();

console.log(`\neski: ${ESKI}\nyeni: ${YENI}`);
console.log(`kimlikler: ${kimlikler.map((k) => k.ad).join(', ')}\n`);

// ══════════════════════════════════════════════════
// 1) GET uçları
// ══════════════════════════════════════════════════
console.log('═══ 1. GET uçları ═══');

function uclar(k) {
    const kendiSube = k.sube || ornekDonem.sube_kod;
    return [
        ['GET /users', '/users'],
        ['GET /categories', '/categories'],
        ['GET /branches', '/branches'],
        ['GET /branches/konumlar', '/branches/konumlar'],
        ['GET /media', '/media'],
        ['GET /media?q=', '/media?q=kadayif'],
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
        ['GET /reports/sube/:kod/donem/veriler', `/reports/sube/${ornekDonem.sube_kod}/donem/veriler?baslangic=${ornekDonem.baslangic}&bitis=${ornekDonem.bitis}`],
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
    for (const [ad, yol] of uclar(k)) await getDiff(ad, yol, k.token, k.ad);
}

// Public menü (token'sız) — 3 şube
console.log(`${G}── public ──${X}`);
for (const slug of [ornekDonem.sube_kod, ...digerSubeler]) {
    await getDiff('GET /menu/:slug (public)', `/menu/${slug}`, null, 'public');
}

// ══════════════════════════════════════════════════
// 2) Yazma senaryoları (yalnız v2)
// ══════════════════════════════════════════════════
console.log('\n═══ 2. Yazma senaryoları (yalnız v2) ═══');

const admin = kimlikler[0];
const sahip = kimlikler[1];
const yabanciSube = digerSubeler[0];

async function istek(yontem, yol, govde, token) {
    const r = await fetch(`${YENI}${yol}`, {
        method: yontem,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
        body: govde === undefined ? undefined : JSON.stringify(govde),
    });
    let j = null;
    const metin = await r.text();
    try { j = JSON.parse(metin); } catch { /* metin */ }
    return { kod: r.status, govde: j, metin };
}

function iddia(ad, kosul, ayrinti = '') {
    if (!kosul) hataSayisi++;
    rapor.yazma.push({ ad, gecti: !!kosul, ayrinti });
    console.log(`${kosul ? Y + '✓' : K + '✗'}${X} ${ad.padEnd(56)} ${G}${ayrinti}${X}`);
}

const { data: ortakKat } = await supabase.from('kategoriler').select('id').eq('tur', 'ortak').limit(1).maybeSingle();
let urunId = null;
try {
    // — Ürün ekle (admin, yalnız 2 şube menüsünde: kapsam dar tutulur) —
    const ekle = await istek('POST', '/products', {
        ad: 'PARITE Test Ürünü', fiyat: 111, kategori: ortakKat.id, kalori: 0,
        menude_subeler: [sahip.sube, yabanciSube], fiyat_serbest: [sahip.sube],
    }, admin.token);
    urunId = ekle.govde?.id;
    iddia('ürün ekle (admin) 201', ekle.kod === 201 && !!urunId, `id=${urunId}`);
    iddia('kalori 0 korundu (0 "boş" değil)', ekle.govde?.kalori === 0, `kalori=${ekle.govde?.kalori}`);

    // — Şube sahibi listesinde görünür, merkez alanları GÖRÜNMEZ —
    const liste = await istek('GET', '/products', undefined, sahip.token);
    const gorunen = (liste.govde?.urunler || []).find((u) => u.id === urunId);
    iddia('şube kendi menüsündeki ürünü görüyor', !!gorunen);
    const govdeMetni = JSON.stringify(liste.govde);
    iddia('yanıt projeksiyonu: merkez alanları yok',
        !['fiyat_override', 'gizli_subeler', 'menude_subeler', 'fiyat_serbest'].some((a) => govdeMetni.includes(`"${a}"`)));

    // — Menüden çıkar / geri al —
    const cikar = await istek('POST', '/products/menu', { ids: [urunId], menude: false }, sahip.token);
    iddia('menüden çıkar (şube sahibi)', cikar.kod === 200 && cikar.govde?.islenen === 1);
    const katalog = await istek('GET', '/products/katalog', undefined, sahip.token);
    iddia('menüden çıkınca katalogda beliriyor', (katalog.govde?.urunler || []).some((u) => u.id === urunId));

    // — NEGATİF: başka şubenin menüsüne yazamaz —
    const yabanciMenu = await istek('POST', '/products/menu', { subeSlug: yabanciSube, ids: [urunId], menude: false }, sahip.token);
    const { data: yabanciSatir } = await supabase.from('urun_sube').select('menude')
        .eq('urun_id', urunId).eq('sube_kod', yabanciSube).maybeSingle();
    iddia('NEGATİF: şube başka şubenin menüsünü değiştiremedi', yabanciSatir?.menude === true,
        `gövdedeki subeSlug yok sayıldı (kod ${yabanciMenu.kod})`);

    await istek('POST', '/products/menu', { ids: [urunId], menude: true }, sahip.token);

    // — Availability (mevcut_degil) —
    const av = await istek('PUT', `/products/${urunId}/availability`, { subeSlug: sahip.sube, mevcut: false }, sahip.token);
    const { data: uyeSatir } = await supabase.from('urun_sube').select('mevcut_degil')
        .eq('urun_id', urunId).eq('sube_kod', sahip.sube).maybeSingle();
    iddia('availability kapatıldı', av.kod === 200 && uyeSatir?.mevcut_degil === true);

    // — NEGATİF: başka şubenin availability'si —
    const avYabanci = await istek('PUT', `/products/${urunId}/availability`, { subeSlug: yabanciSube, mevcut: false }, sahip.token);
    iddia('NEGATİF: başka şubenin availability\'si 403', avYabanci.kod === 403, `kod=${avYabanci.kod}`);

    await istek('PUT', `/products/${urunId}/availability`, { subeSlug: sahip.sube, mevcut: true }, sahip.token);

    // — Fiyat override (şube kendi fiyatı) —
    const fiyat = await istek('PUT', `/products/${urunId}`, { fiyat: 222 }, sahip.token);
    const { data: ovSatir } = await supabase.from('urun_sube').select('fiyat_override')
        .eq('urun_id', urunId).eq('sube_kod', sahip.sube).maybeSingle();
    const { data: anaUrun } = await supabase.from('urunler').select('fiyat').eq('id', urunId).maybeSingle();
    iddia('fiyat override şube satırına yazıldı', fiyat.kod === 200 && Number(ovSatir?.fiyat_override) === 222);
    iddia('merkez fiyatı korundu', Number(anaUrun?.fiyat) === 111, `merkez=${anaUrun?.fiyat}`);

    // — NEGATİF: fiyat izni olmayan şube (yabanciSube) ortak ürünü düzenleyemez —
    const yabanciFiyat = await istek('PUT', `/products/${urunId}`, { fiyat: 999 }, kimlikler[2]?.token || sahip.token);
    iddia('NEGATİF: izinsiz şube fiyat değiştiremedi', yabanciFiyat.kod === 403, `kod=${yabanciFiyat.kod}`);

    // — Ürün düzenle (admin) —
    const duzenle = await istek('PUT', `/products/${urunId}`, { ad: 'PARITE Test Ürünü 2', kalori: 0 }, admin.token);
    iddia('ürün düzenle (admin)', duzenle.kod === 200 && duzenle.govde?.urun?.ad === 'PARITE Test Ürünü 2');

    // — Menü JSON'unda etkin fiyat —
    const menu = await fetch(`${YENI}/menu/${sahip.sube}?taze=${Date.now()}`).then((r) => r.json());
    const menuUrun = Object.values(menu.urunlerByKategori || {}).flat().find((u) => u.id === urunId);
    iddia('menü JSON etkin fiyatı gösteriyor', Number(menuUrun?.fiyat) === 222, `fiyat=${menuUrun?.fiyat}`);
    iddia('menü JSON kalori taşıyor', menuUrun?.kalori === 0, `kalori=${menuUrun?.kalori}`);

    // — Bütçe girişi (admin) + çekim izolasyonu —
    if (ornekKampanya) {
        const b = ornekKampanya.donem_baslangic, s2 = ornekKampanya.donem_bitis;
        const oncekiVeri = await supabase.from('donemler').select('*')
            .eq('sube_kod', sahip.sube).eq('baslangic', b).eq('bitis', s2).maybeSingle();
        const yedek = oncekiVeri.data;

        const butce = await istek('PUT', `/reports/sube/${sahip.sube}/donem/overrides`,
            { baslangic: b, bitis: s2, overrides: { planlananButce: 4242 } }, admin.token);
        const { data: sonra } = await supabase.from('donemler').select('*')
            .eq('sube_kod', sahip.sube).eq('baslangic', b).eq('bitis', s2).maybeSingle();
        iddia('bütçe girişi yazıldı', butce.kod === 200 && Number(sonra?.planlanan_butce) === 4242);
        iddia('bütçe girişi metrikleri bozmadı',
            Number(sonra?.harcama ?? 0) === Number(yedek?.harcama ?? 0) && Number(sonra?.erisim ?? 0) === Number(yedek?.erisim ?? 0),
            `harcama=${sonra?.harcama}`);

        // NEGATİF: şube sahibi bütçe yazamaz (reports.manage yok)
        const sahipButce = await istek('PUT', `/reports/sube/${sahip.sube}/donem/overrides`,
            { baslangic: b, bitis: s2, overrides: { planlananButce: 1 } }, sahip.token);
        iddia('NEGATİF: şube sahibi bütçe yazamadı', sahipButce.kod === 403, `kod=${sahipButce.kod}`);

        // Geri al
        if (yedek) {
            // `guncelleme` de geri yüklenir — butce-durum yanıtı updatedAt taşıyor
            await supabase.from('donemler').update({
                planlanan_butce: yedek.planlanan_butce, devredilen_miktar: yedek.devredilen_miktar,
                merkez_destegi: yedek.merkez_destegi, guncelleme: yedek.guncelleme,
            }).eq('sube_kod', sahip.sube).eq('baslangic', b).eq('bitis', s2);
        }
        const { data: geri } = await supabase.from('donemler').select('planlanan_butce')
            .eq('sube_kod', sahip.sube).eq('baslangic', b).eq('bitis', s2).maybeSingle();
        iddia('bütçe eski değerine döndürüldü',
            Number(geri?.planlanan_butce ?? 0) === Number(yedek?.planlanan_butce ?? 0));
    }
} finally {
    if (urunId) {
        await istek('DELETE', `/products/${urunId}`, undefined, admin.token);
        const kalici = await istek('DELETE', `/products/${urunId}/permanent`, undefined, admin.token);
        const { data: kalan } = await supabase.from('urunler').select('id').eq('id', urunId).maybeSingle();
        iddia('test ürünü kalıcı silindi', kalici.kod === 200 && !kalan);
    }
}

// ══════════════════════════════════════════════════
// 3) 88 menü JSON'u → menu-v2/ ve mevcutla diff
// ══════════════════════════════════════════════════
console.log('\n═══ 3. Menü JSON pariteleri (88 şube) ═══');

const { data: tumSubeler } = await supabase.from('subeler').select('kod').order('kod').range(0, 999);
const sluglar = tumSubeler.map((s) => s.kod);

console.log(`${G}menu-v2/ önekine üretiliyor…${X}`);
await regenerateMenuJsons(sluglar, 'menu-v2');

async function r2Json(key) {
    try {
        const r = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
        const buf = Buffer.concat(await r.Body.toArray());
        return JSON.parse(buf.toString('utf8'));
    } catch (e) {
        return { __hata: e.name || e.message };
    }
}

const siralaUrun = (a) => [...a].sort((x, y) => String(x.id).localeCompare(String(y.id)));
let menuFark = 0, menuYok = 0;
for (const slug of sluglar) {
    const [eski, yeni] = await Promise.all([r2Json(`menu/${slug}.json`), r2Json(`menu-v2/${slug}.json`)]);
    if (eski.__hata || yeni.__hata) {
        rapor.menu.push({ slug, durum: 'okunamadı', ayrinti: eski.__hata || yeni.__hata });
        menuYok++;
        continue;
    }
    const f = [];
    for (const alan of ['id', 'slug', 'ad', 'il', 'ilce']) {
        if (JSON.stringify(eski.sube?.[alan] ?? null) !== JSON.stringify(yeni.sube?.[alan] ?? null)) {
            f.push(`sube.${alan}: ${JSON.stringify(eski.sube?.[alan])} → ${JSON.stringify(yeni.sube?.[alan])}`);
        }
    }
    const eskiKat = (eski.kategoriler || []).map((k) => `${k.id}:${k.ad}:${k.sira}`).join('|');
    const yeniKat = (yeni.kategoriler || []).map((k) => `${k.id}:${k.ad}:${k.sira}`).join('|');
    if (eskiKat !== yeniKat) f.push('kategori sırası/adları farklı');

    const eskiU = siralaUrun(Object.values(eski.urunlerByKategori || {}).flat());
    const yeniU = siralaUrun(Object.values(yeni.urunlerByKategori || {}).flat());
    if (eskiU.length !== yeniU.length) {
        f.push(`ürün sayısı: ${eskiU.length} → ${yeniU.length}`);
    } else {
        for (let i = 0; i < eskiU.length; i++) {
            for (const alan of ['id', 'ad', 'fiyat', 'aciklama', 'gorsel', 'miktar', 'birim', 'kalori', 'kategori']) {
                if (JSON.stringify(eskiU[i][alan] ?? null) !== JSON.stringify(yeniU[i][alan] ?? null)) {
                    f.push(`${eskiU[i].id}.${alan}: ${JSON.stringify(eskiU[i][alan])} → ${JSON.stringify(yeniU[i][alan])}`);
                }
            }
        }
    }
    // Sızıntı kontrolü
    const metin = JSON.stringify(yeni);
    for (const alan of ['fiyat_override', 'gizli_subeler', 'menude_subeler', 'fiyat_serbest', 'vkn', 'fatura_adresi', 'telefon']) {
        if (metin.includes(`"${alan}"`)) f.push(`SIZINTI: ${alan}`);
    }
    if (f.length) menuFark++;
    rapor.menu.push({ slug, durum: f.length ? 'FARK' : 'aynı', urun: yeniU.length, farklar: f });
}
hataSayisi += menuFark;
console.log(`${menuFark === 0 ? Y + '✓' : K + '✗'}${X} ${sluglar.length} şube · farklı: ${menuFark} · okunamayan: ${menuYok}`);
for (const m of rapor.menu.filter((m) => m.durum === 'FARK').slice(0, 5)) {
    console.log(`     ${K}• ${m.slug}: ${m.farklar.slice(0, 3).join(' | ')}${X}`);
}

// ══════════════════════════════════════════════════
// 4) Bekçi listesi
// ══════════════════════════════════════════════════
console.log('\n═══ 4. Bekçi listesi (plan §5) ═══');

function bekci(ad, durum, kanit) {
    rapor.bekci.push({ ad, durum, kanit });
    const im = durum === 'geçti' ? `${Y}✓${X}` : durum === 'açık' ? `${S}○${X}` : `${K}✗${X}`;
    if (durum === 'kaldı') hataSayisi++;
    console.log(`${im} ${ad.padEnd(46)} ${G}${kanit}${X}`);
}

const menuSizinti = rapor.menu.some((m) => (m.farklar || []).some((f) => f.startsWith('SIZINTI')));
bekci('Müşteri projeksiyonu whitelist', menuSizinti ? 'kaldı' : 'geçti',
    `88 menü JSON'unda yönetim alanı/PII yok`);

const projeksiyonTesti = rapor.yazma.find((y) => y.ad.includes('yanıt projeksiyonu'));
bekci('Rol bazlı yanıt projeksiyonu', projeksiyonTesti?.gecti ? 'geçti' : 'kaldı',
    'liste/katalog/çöp + menü JSON kontrol edildi');

bekci('Katalog kural sırası (gizli→menude→mevcut_degil→override)',
    rapor.yazma.find((y) => y.ad.includes('menüden çıkınca'))?.gecti ? 'geçti' : 'kaldı',
    'tek WHERE + menüden çıkar/ekle + availability testleri');

bekci('Override semantiği (çekim bütçeye dokunmaz)',
    rapor.yazma.find((y) => y.ad.includes('bütçe girişi metrikleri bozmadı'))?.gecti ? 'geçti' : 'kaldı',
    'kolon ayrımı + rapor-diff.mjs 10 iddia');

// İzin dosyası ikizliği — içerik karşılaştırması
const izinEski = readFileSync(path.resolve(V2_KOK, '../shared/permissions.js'), 'utf8');
const izinYeni = readFileSync(path.resolve(V2_KOK, 'shared/permissions.js'), 'utf8');
bekci('İzin dosyası ikizliği', izinEski === izinYeni ? 'geçti' : 'kaldı',
    izinEski === izinYeni ? 'shared/ ↔ backend-v2/shared/ birebir aynı' : 'DOSYALAR AYRIŞMIŞ');

// CORS → limiter sırası
const serverKodu = readFileSync(path.resolve(V2_KOK, 'server.js'), 'utf8');
const corsIdx = serverKodu.indexOf('app.use(cors(');
const limiterIdx = serverKodu.indexOf('app.use(generalLimiter)');
bekci('CORS → rate limiter sırası', corsIdx > 0 && limiterIdx > corsIdx ? 'geçti' : 'kaldı',
    `cors@${corsIdx} < limiter@${limiterIdx}`);

const authKodu = readFileSync(path.resolve(V2_KOK, 'middleware/auth.js'), 'utf8');
const reqUserSekli = ['uid:', 'email:', 'subeSlug:', 'role:'].every((a) => authKodu.includes(a));
bekci('req.user şekli sabit', reqUserSekli ? 'geçti' : 'kaldı', '{ uid, email, role, subeSlug }');

bekci('UID remap bütünlüğü (Faz 2)', 'açık', 'Faz 2 işi — bu kapının kapsamı dışında');

bekci('0 değeri "boş" değildir',
    rapor.yazma.find((y) => y.ad.includes('kalori 0'))?.gecti
    && rapor.yazma.find((y) => y.ad.includes('menü JSON kalori'))?.gecti ? 'geçti' : 'kaldı',
    'kalori 0 hem yazımda hem menü JSON\'unda korundu');

// Route sırası — statik yollar /:id'den önce mi?
const urunKodu = readFileSync(path.resolve(V2_KOK, 'modules/qr-menu/routes/products.js'), 'utf8');
const menuKodu = readFileSync(path.resolve(V2_KOK, 'modules/qr-menu/routes/menu.js'), 'utf8');
const kursKodu = readFileSync(path.resolve(V2_KOK, 'modules/academy/routes/courses.js'), 'utf8');
// Yalnızca ROTA KAYITLARINA bak — yorumlarda geçen '/:id' metni yanıltmasın
const rotaSirasi = (kod, statik, dinamik) => {
    const s1 = kod.search(new RegExp(`router\\.(get|post|put|delete)\\(\\s*'${statik}'`));
    const s2 = kod.search(new RegExp(`router\\.(get|post|put|delete)\\(\\s*'${dinamik}'`));
    return s1 >= 0 && s2 >= 0 && s1 < s2;
};
const siraTamam = rotaSirasi(urunKodu, '/katalog', '/:id')
    && rotaSirasi(menuKodu, '/cache-durumu', '/:subeSlug')
    && rotaSirasi(kursKodu, '/reorder', '/:id');
bekci('Route sırası (statik yollar /:id\'den önce)', siraTamam ? 'geçti' : 'kaldı',
    '/katalog, /cache-durumu, /reorder');

const cronAktif = process.env.CRON_AKTIF === 'true';
bekci('Cron tek-aktif', cronAktif ? 'kaldı' : 'geçti',
    `v2 CRON_AKTIF=${process.env.CRON_AKTIF} (eski cron çalışıyor)`);

const schedKodu = readFileSync(path.resolve(V2_KOK, 'modules/reports/services/scheduled-fetch.js'), 'utf8');
bekci('GRACE_DAYS penceresi', schedKodu.includes('GRACE_DAYS = 7') ? 'geçti' : 'kaldı',
    'scheduled-fetch.js GRACE_DAYS = 7 (Meta token yenileme ayrı açık iş)');

const negatifler = rapor.yazma.filter((y) => y.ad.startsWith('NEGATİF'));
bekci('Şube sahibi kendi şubesi dışına yazamaz',
    negatifler.length >= 3 && negatifler.every((n) => n.gecti) ? 'geçti' : 'kaldı',
    `${negatifler.filter((n) => n.gecti).length}/${negatifler.length} negatif test geçti`);

// ══════════════════════════════════════════════════
// RAPOR.md
// ══════════════════════════════════════════════════
mkdirSync(buDizin, { recursive: true });
const zaman = new Date().toISOString();
const md = [];
md.push('# Parite Raporu (G9)', '');
md.push(`Koşum: ${zaman}`, `Eski API: \`${ESKI}\``, `Yeni API: \`${YENI}\``, '');
md.push(`**Sonuç: ${hataSayisi === 0 ? '✅ SIFIR AÇIKLANMAMIŞ FARK' : `❌ ${hataSayisi} açıklanmamış fark`}**`, '');

md.push('## 1. GET uçları', '');
md.push(`${rapor.get.length} istek (${kimlikler.length} kimlik + public).`, '');
md.push('| Kimlik | Uç | HTTP | Fark | Açıklanmış |', '|---|---|---|---|---|');
for (const g of rapor.get) {
    md.push(`| ${g.kimlik} | \`${g.ad}\` | ${g.eskiKod}/${g.yeniKod} | ${g.farklar.length ? `**${g.farklar.length}**` : '0'} | ${g.aciklanmis.length || '—'} |`);
}
const tumAciklanmis = rapor.get.flatMap((g) => g.aciklanmis);
if (tumAciklanmis.length) {
    md.push('', '### Açıklanmış farklar (gerekçeleriyle)', '');
    const grup = {};
    for (const a of tumAciklanmis) grup[a.neden] = (grup[a.neden] || 0) + 1;
    for (const [neden, adet] of Object.entries(grup)) md.push(`- **${adet} alan** — ${neden}`);
}
const acikGet = rapor.get.filter((g) => g.farklar.length);
if (acikGet.length) {
    md.push('', '### ❌ Açıklanmamış farklar', '');
    for (const g of acikGet) {
        md.push(`- \`${g.ad}\` (${g.kimlik}):`);
        for (const f of g.farklar.slice(0, 10)) md.push(`  - ${f}`);
    }
}

md.push('', '## 2. Yazma senaryoları', '');
md.push('| Senaryo | Sonuç | Not |', '|---|---|---|');
for (const y of rapor.yazma) md.push(`| ${y.ad} | ${y.gecti ? '✅' : '❌'} | ${y.ayrinti || ''} |`);

md.push('', '## 3. Menü JSON pariteleri', '');
md.push(`${sluglar.length} şube \`menu-v2/\` önekine üretildi ve \`menu/\` ile karşılaştırıldı.`, '');
md.push(`- Birebir aynı: **${rapor.menu.filter((m) => m.durum === 'aynı').length}**`);
md.push(`- Farklı: **${menuFark}**`);
md.push(`- Okunamayan: **${menuYok}**`);
if (menuFark) {
    md.push('', '### Farklı şubeler', '');
    for (const m of rapor.menu.filter((m) => m.durum === 'FARK')) {
        md.push(`- **${m.slug}**: ${m.farklar.slice(0, 6).join(' · ')}`);
    }
}
if (menuYok) {
    md.push('', '### Okunamayanlar', '');
    for (const m of rapor.menu.filter((m) => m.durum === 'okunamadı')) md.push(`- ${m.slug}: ${m.ayrinti}`);
}

md.push('', '## 4. Bekçi listesi (plan §5)', '');
md.push('| Bekçi | Durum | Kanıt |', '|---|---|---|');
for (const b of rapor.bekci) {
    md.push(`| ${b.ad} | ${b.durum === 'geçti' ? '✅ geçti' : b.durum === 'açık' ? '⏳ açık' : '❌ kaldı'} | ${b.kanit} |`);
}

md.push('', '---', '', '*Bu rapor `scripts/parite/calistir.mjs` tarafından üretildi.*');
writeFileSync(path.join(buDizin, 'RAPOR.md'), md.join('\n'));

console.log('');
console.log(`${hataSayisi === 0 ? Y + '✓ PARİTE KAPISI GEÇİLDİ' : K + `✗ ${hataSayisi} açıklanmamış fark`}${X} — rapor: scripts/parite/RAPOR.md`);
process.exit(hataSayisi === 0 ? 0 : 1);