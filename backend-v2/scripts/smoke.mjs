// ⛔ TARİHSEL — ARTIK ÇALIŞMAZ: config/firebase.js ve firebase-admin S2 sökümünde
//    kaldırıldı. Bu dosya yapılan işin kaydı olarak duruyor; çıktıları
//    scripts/parite/RAPOR*.md ve görev dosyalarındaki "Uygulandı" bloklarında.
// G5 duman testi — gerçek Firebase ID token'ıyla her ortak rotaya istek atar.
//
// Token üretimi: auth.createCustomToken(uid, claims) → identitytoolkit
// signInWithCustomToken (API anahtarı frontend/.env'den okunur).
//
// Kullanım: cd backend-v2 && node scripts/smoke.mjs [taban-url]
//   varsayılan taban-url: http://localhost:5002
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const buDizin = path.dirname(fileURLToPath(import.meta.url));
const V2_KOK = path.resolve(buDizin, '..');
const REPO_KOK = path.resolve(V2_KOK, '..');
dotenv.config({ path: path.join(V2_KOK, '.env.local') });
dotenv.config({ path: path.join(V2_KOK, '.env') });

const { auth } = await import('../config/firebase.js');
const { supabase } = await import('../config/supabase.js');

const TABAN = process.argv[2] || 'http://localhost:5002';

// Firebase Web API anahtarı — custom token'ı ID token'a çevirmek için
const frontendEnv = dotenv.parse(readFileSync(path.join(REPO_KOK, 'frontend/.env'), 'utf8'));
const API_KEY = frontendEnv.VITE_FIREBASE_API_KEY;
if (!API_KEY) throw new Error('frontend/.env içinde VITE_FIREBASE_API_KEY yok');

async function idToken(uid, claims) {
    const custom = await auth.createCustomToken(uid, claims);
    const r = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: custom, returnSecureToken: true }),
        }
    );
    const j = await r.json();
    if (!j.idToken) throw new Error(`Token alınamadı: ${JSON.stringify(j).slice(0, 300)}`);
    return j.idToken;
}

const YESIL = '\x1b[32m', KIRMIZI = '\x1b[31m', GRI = '\x1b[90m', SIFIRLA = '\x1b[0m';
let basarisiz = 0;

async function iste(ad, yol, token, beklenen = [200]) {
    const t0 = Date.now();
    let kod, ozet = '';
    try {
        const r = await fetch(`${TABAN}${yol}`, { headers: { Authorization: `Bearer ${token}` } });
        kod = r.status;
        const gövde = await r.text();
        try {
            const j = JSON.parse(gövde);
            const anahtar = Object.keys(j)[0];
            const deger = j[anahtar];
            ozet = Array.isArray(deger) ? `${anahtar}: ${deger.length} kayıt`
                : typeof deger === 'object' && deger !== null ? `${anahtar}: {…}`
                : `${anahtar}: ${String(deger).slice(0, 40)}`;
        } catch { ozet = gövde.slice(0, 60); }
    } catch (e) {
        kod = 0; ozet = e.message;
    }
    const tamam = beklenen.includes(kod);
    if (!tamam) basarisiz++;
    console.log(`${tamam ? YESIL + '✓' : KIRMIZI + '✗'}${SIFIRLA} ${String(kod).padEnd(3)} ${ad.padEnd(34)} ${GRI}${ozet} (${Date.now() - t0}ms)${SIFIRLA}`);
}

// ── Token'lar ──
const { data: kullanicilar } = await supabase.from('kullanici_sube').select('uid, role, sube_slug');
const admin = kullanicilar.find((k) => k.role === 'admin');
const subeSahibi = kullanicilar.find((k) => k.role === 'sube_sahibi' && k.sube_slug);
if (!admin) throw new Error('Admin kullanıcı bulunamadı');

const adminToken = await idToken(admin.uid, { role: 'admin', subeSlug: admin.sube_slug || null });
const sahipToken = subeSahibi
    ? await idToken(subeSahibi.uid, { role: 'sube_sahibi', subeSlug: subeSahibi.sube_slug })
    : null;

console.log(`\nTaban: ${TABAN}`);
console.log(`Admin uid: ${admin.uid}${subeSahibi ? ` | şube sahibi: ${subeSahibi.uid} (${subeSahibi.sube_slug})` : ''}\n`);

console.log('── Admin ──');
await iste('GET /api/health', '/api/health', adminToken);
await iste('GET /api/users', '/api/users', adminToken);
await iste('GET /api/categories', '/api/categories', adminToken);
await iste('GET /api/branches', '/api/branches', adminToken);
await iste('GET /api/branches/konumlar', '/api/branches/konumlar', adminToken);
await iste('GET /api/media', '/api/media', adminToken);
await iste('GET /api/media?q=kadayif', '/api/media?q=kadayif', adminToken);
await iste('GET /api/media/klasorler', '/api/media/klasorler', adminToken);
await iste('GET /api/profil', '/api/profil', adminToken);
await iste('GET /api/onboarding/status', '/api/onboarding/status', adminToken);
await iste('GET /api/basvurular', '/api/basvurular', adminToken);
await iste('GET /api/geribildirim', '/api/geribildirim', adminToken);
await iste('GET /api/isbasvuru', '/api/isbasvuru', adminToken);
await iste('GET /api/upload/proxy (yasak)', '/api/upload/proxy/dekontlar/x.pdf', adminToken, [403]);
await iste('GET /api/upload/dekont (yol hatası)', '/api/upload/dekont/hatali', adminToken, [400]);

if (sahipToken) {
    console.log('\n── Şube sahibi (kapsam kontrolü) ──');
    await iste('GET /api/branches', '/api/branches', sahipToken);
    await iste('GET /api/branches/konumlar', '/api/branches/konumlar', sahipToken);
    await iste('GET /api/profil', '/api/profil', sahipToken);
    await iste('GET /api/onboarding/status', '/api/onboarding/status', sahipToken);
    await iste('GET /api/geribildirim', '/api/geribildirim', sahipToken);
    await iste('GET /api/users (yalnız kendi ekibi)', '/api/users', sahipToken, [200, 403]);
    await iste('GET /api/basvurular (yetkisiz olmalı)', '/api/basvurular', sahipToken, [403]);
}

// ── Yazma turu: her biri kendi izini temizler ──
async function yaz(ad, yontem, yol, govde, token, beklenen = [200, 201]) {
    const r = await fetch(`${TABAN}${yol}`, {
        method: yontem,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: govde === undefined ? undefined : JSON.stringify(govde),
    });
    const metin = await r.text();
    let j = null;
    try { j = JSON.parse(metin); } catch { /* metin kalsın */ }
    const tamam = beklenen.includes(r.status);
    if (!tamam) basarisiz++;
    console.log(`${tamam ? YESIL + '✓' : KIRMIZI + '✗'}${SIFIRLA} ${String(r.status).padEnd(3)} ${(yontem + ' ' + ad).padEnd(34)} ${GRI}${metin.slice(0, 70)}${SIFIRLA}`);
    return j;
}

console.log('\n── Yazma turu (oluştur → güncelle → sil) ──');

// Kategori: oluştur → yeniden adlandır → sil
const kat = await yaz('/api/categories', 'POST', '/api/categories', { ad: 'ZZ Duman Testi', tur: 'ortak' }, adminToken);
if (kat?.id) {
    await yaz('/api/categories/:id', 'PUT', `/api/categories/${kat.id}`, { ad: 'ZZ Duman Testi 2' }, adminToken);
    await yaz('/api/categories/sira', 'PUT', '/api/categories/sira', { idler: [kat.id] }, adminToken);
    await yaz('/api/categories/:id', 'DELETE', `/api/categories/${kat.id}`, undefined, adminToken);
}
await yaz('/api/categories/sync-counts', 'POST', '/api/categories/sync-counts', {}, adminToken);

// Medya klasörü: oluştur → sil
const klasor = await yaz('/api/media/klasorler', 'POST', '/api/media/klasorler', { ad: 'ZZ Duman Klasörü' }, adminToken);
if (klasor?.id) {
    await yaz('/api/media/klasorler/:id', 'DELETE', `/api/media/klasorler/${klasor.id}`, undefined, adminToken);
}

// Medya kaydı: oluştur → adını değiştir → sil (R2'ye dokunmayan sahte URL)
const medya = await yaz('/api/media', 'POST', '/api/media',
    { ad: 'ZZ Duman Görseli', url: 'https://ornek.invalid/zz-duman.webp', klasor: '' }, adminToken);
if (medya?.id) {
    await yaz('/api/media/:id', 'PUT', `/api/media/${medya.id}`, { ad: 'ZZ Duman Görseli 2' }, adminToken);
    await yaz('/api/media/bulk-move', 'PUT', '/api/media/bulk-move', { ids: [medya.id], klasor: '' }, adminToken);
    await yaz('/api/media/:id', 'DELETE', `/api/media/${medya.id}`, undefined, adminToken);
}

// Franchise başvurusu: herkese açık POST (token'sız) → listeden bul → sil
const basvuruYanit = await fetch(`${TABAN}/api/basvurular`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ad: 'ZZ', soyad: 'Duman', email: 'zz@ornek.invalid', telefon: '05000000000', il: 'Test', ilce: 'Test', mesaj: 'duman testi' }),
});
console.log(`${basvuruYanit.ok ? YESIL + '✓' : KIRMIZI + '✗'}${SIFIRLA} ${basvuruYanit.status} POST /api/basvurular (public)  ${GRI}${(await basvuruYanit.text()).slice(0, 40)}${SIFIRLA}`);
if (!basvuruYanit.ok) basarisiz++;

const liste = await fetch(`${TABAN}/api/basvurular`, { headers: { Authorization: `Bearer ${adminToken}` } }).then((r) => r.json());
const duman = liste.basvurular?.find((b) => b.email === 'zz@ornek.invalid');
if (duman) {
    await yaz('/api/basvurular/:id', 'PATCH', `/api/basvurular/${duman.id}`, { durum: 'inceleniyor', not: 'duman' }, adminToken);
    await yaz('/api/basvurular/:id', 'DELETE', `/api/basvurular/${duman.id}`, undefined, adminToken);
} else {
    basarisiz++;
    console.log(`${KIRMIZI}✗${SIFIRLA} POST edilen başvuru listede bulunamadı`);
}

// Profil: telefonu aynı değerle geri yaz (yan etkisiz)
const profil = await fetch(`${TABAN}/api/profil`, { headers: { Authorization: `Bearer ${adminToken}` } }).then((r) => r.json());
await yaz('/api/profil', 'PUT', '/api/profil', { telefon: profil.hesap?.telefon || '' }, adminToken);

// ── QR menü (G6) ──
console.log('\n── QR menü ──');
await iste('GET /api/menu/subeler', '/api/menu/subeler', adminToken);
await iste('GET /api/menu/cache-durumu', '/api/menu/cache-durumu', adminToken);
await iste('GET /api/products (admin)', '/api/products', adminToken);
await iste('GET /api/products/katalog (admin)', '/api/products/katalog', adminToken);
await iste('GET /api/products/trash (admin)', '/api/products/trash', adminToken);

// Public menü — token'sız
const publicMenu = await fetch(`${TABAN}/api/menu/${subeSahibi?.sube_slug || 'adiyaman'}`).then((r) => r.json());
const menuUrunSayisi = Object.values(publicMenu.urunlerByKategori || {}).reduce((t, a) => t + a.length, 0);
console.log(`${publicMenu.sube ? YESIL + '✓' : KIRMIZI + '✗'}${SIFIRLA} 200 GET /api/menu/:slug (public)      ${GRI}${menuUrunSayisi} ürün, ${(publicMenu.kategoriler || []).length} kategori${SIFIRLA}`);
if (!publicMenu.sube) basarisiz++;

// ── Sızıntı kontrolü: şube sahibine merkez alanları GİTMEMELİ ──
const SIZAN_ALANLAR = ['fiyat_override', 'gizli_subeler', 'menude_subeler', 'fiyat_serbest'];
async function sizintiKontrol(ad, yol, token) {
    const j = await fetch(`${TABAN}${yol}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
    const govde = JSON.stringify(j);
    const bulunan = SIZAN_ALANLAR.filter((a) => govde.includes(`"${a}"`));
    const tamam = bulunan.length === 0;
    if (!tamam) basarisiz++;
    console.log(`${tamam ? YESIL + '✓' : KIRMIZI + '✗'}${SIFIRLA}     ${ad.padEnd(34)} ${GRI}${(j.urunler || []).length} ürün${tamam ? ', sızıntı yok' : ' — SIZAN: ' + bulunan.join(', ')}${SIFIRLA}`);
    return j;
}

if (sahipToken) {
    console.log('\n── Şube sahibi sızıntı kontrolü ──');
    await sizintiKontrol('GET /api/products', '/api/products', sahipToken);
    await sizintiKontrol('GET /api/products/katalog', '/api/products/katalog', sahipToken);
    await sizintiKontrol('GET /api/products/trash', '/api/products/trash', sahipToken);
    // Public menü de merkez alanı taşımamalı
    const menuGovde = JSON.stringify(publicMenu);
    const menuSizinti = SIZAN_ALANLAR.filter((a) => menuGovde.includes(`"${a}"`));
    if (menuSizinti.length) basarisiz++;
    console.log(`${menuSizinti.length === 0 ? YESIL + '✓' : KIRMIZI + '✗'}${SIFIRLA}     ${'public menü JSON'.padEnd(34)} ${GRI}${menuSizinti.length === 0 ? 'sızıntı yok' : 'SIZAN: ' + menuSizinti.join(', ')}${SIFIRLA}`);
}

// ── Menü yazma turu (yalnızca tek şubeyi etkileyecek şekilde) ──
if (sahipToken) {
    const hedefSube = subeSahibi.sube_slug;
    console.log(`\n── Menü yazma turu (${hedefSube}) ──`);

    const { data: ortakKat } = await supabase.from('kategoriler').select('id').eq('tur', 'ortak').limit(1).maybeSingle();
    const urun = await yaz('/api/products', 'POST', '/api/products', {
        ad: 'ZZ Duman Ürünü', fiyat: 100, kategori: ortakKat.id, kalori: 0,
        menude_subeler: [hedefSube], fiyat_serbest: [hedefSube],
    }, adminToken);

    if (urun?.id) {
        // Şube sahibi menüsünde görmeli, katalogda görmemeli
        const liste1 = await sizintiKontrol('şube listesinde var mı', '/api/products', sahipToken);
        const listede = (liste1.urunler || []).some((u) => u.id === urun.id);
        console.log(`${listede ? YESIL + '✓' : KIRMIZI + '✗'}${SIFIRLA}     menüde görünüyor`);
        if (!listede) basarisiz++;

        // Menüden çıkar → katalogda görünmeli
        await yaz('/api/products/menu (çıkar)', 'POST', '/api/products/menu', { ids: [urun.id], menude: false }, sahipToken);
        const katalog = await fetch(`${TABAN}/api/products/katalog`, { headers: { Authorization: `Bearer ${sahipToken}` } }).then((r) => r.json());
        const kataloqta = (katalog.urunler || []).some((u) => u.id === urun.id);
        console.log(`${kataloqta ? YESIL + '✓' : KIRMIZI + '✗'}${SIFIRLA}     menüden çıkınca katalogda`);
        if (!kataloqta) basarisiz++;

        // Menüde değilken availability 400 vermeli
        await yaz('availability (menüde değil)', 'PUT', `/api/products/${urun.id}/availability`,
            { subeSlug: hedefSube, mevcut: false }, sahipToken, [400]);

        // Menüye geri al → availability çalışmalı
        await yaz('/api/products/menu (ekle)', 'POST', '/api/products/menu', { ids: [urun.id], menude: true }, sahipToken);
        await yaz('availability (kapat)', 'PUT', `/api/products/${urun.id}/availability`,
            { subeSlug: hedefSube, mevcut: false }, sahipToken);
        await yaz('availability (aç)', 'PUT', `/api/products/${urun.id}/availability`,
            { subeSlug: hedefSube, mevcut: true }, sahipToken);

        // Şube kendi fiyatını yazar (fiyat_serbest verildi) → override satırına gitmeli
        await yaz('şube fiyatı (override)', 'PUT', `/api/products/${urun.id}`, { fiyat: 133 }, sahipToken);
        const { data: uye } = await supabase.from('urun_sube').select('fiyat_override, menude, mevcut_degil')
            .eq('urun_id', urun.id).eq('sube_kod', hedefSube).maybeSingle();
        const { data: anaUrun } = await supabase.from('urunler').select('fiyat').eq('id', urun.id).maybeSingle();
        const dogru = Number(uye?.fiyat_override) === 133 && Number(anaUrun?.fiyat) === 100;
        if (!dogru) basarisiz++;
        console.log(`${dogru ? YESIL + '✓' : KIRMIZI + '✗'}${SIFIRLA}     override ayrı satırda: merkez fiyat=${anaUrun?.fiyat}, şube=${uye?.fiyat_override}`);

        // Menü JSON'unda şube fiyatı görünmeli
        // cacheMiddleware(60) yüzünden aynı URL 60 sn boyunca eski yanıtı verir;
        // testte taze veri için sorgu dizesiyle cache anahtarını değiştiriyoruz.
        const menu2 = await fetch(`${TABAN}/api/menu/${hedefSube}?taze=${process.pid}`).then((r) => r.json());
        const menuUrun = Object.values(menu2.urunlerByKategori || {}).flat().find((u) => u.id === urun.id);
        const fiyatDogru = menuUrun && Number(menuUrun.fiyat) === 133;
        if (!fiyatDogru) basarisiz++;
        console.log(`${fiyatDogru ? YESIL + '✓' : KIRMIZI + '✗'}${SIFIRLA}     menüde etkin fiyat: ${menuUrun?.fiyat ?? '(ürün menüde yok)'}`);

        // Temizlik: çöp kutusu → kalıcı sil
        await yaz('/api/products/:id (çöpe)', 'DELETE', `/api/products/${urun.id}`, undefined, adminToken);
        await yaz('/api/products/:id/permanent', 'DELETE', `/api/products/${urun.id}/permanent`, undefined, adminToken);
    }
}

console.log('');
if (basarisiz === 0) console.log(`${YESIL}✓ Tüm duman testleri geçti.${SIFIRLA}`);
else console.log(`${KIRMIZI}✗ ${basarisiz} istek beklenen kodu vermedi.${SIFIRLA}`);
process.exit(basarisiz === 0 ? 0 : 1);