// G6 doğrulaması — v2'nin ürettiği menü JSON'unu R2'deki mevcut (Firestore
// kaynaklı) JSON ile normalize ederek karşılaştırır.
//
// Kullanım: cd backend-v2 && node scripts/menu-diff.mjs [sube1 sube2 ...]
//   şube verilmezse ilk 2 şube alınır.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const buDizin = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(buDizin, '../.env') });
dotenv.config({ path: path.resolve(buDizin, '../.env') });

const { supabase } = await import('../config/supabase.js');
const { buildMenuData } = await import('../modules/qr-menu/services/menu-builder.js');

const YESIL = '\x1b[32m', KIRMIZI = '\x1b[31m', SARI = '\x1b[33m', GRI = '\x1b[90m', SIFIRLA = '\x1b[0m';

// R2'deki mevcut JSON'un kaynağı. Doğrudan public r2.dev adresi bazı ağlardan
// erişilemiyor; eski API'nin proxy'si aynı R2 nesnesini servis ediyor
// (upload.js → isKeyAllowed 'menu/' önekine izinli), o yüzden önce o denenir.
const ESKI_API = process.env.ESKI_API || 'https://api-fyfp72cohq-uc.a.run.app/api';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

async function r2Json(slug) {
    const kaynaklar = [
        `${ESKI_API}/upload/proxy/menu/${slug}.json`,
        R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/menu/${slug}.json` : null,
    ].filter(Boolean);
    let sonHata = '';
    for (const u of kaynaklar) {
        try {
            const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
            if (r.ok) return await r.json();
            sonHata = `HTTP ${r.status}`;
        } catch (e) { sonHata = e.message; }
    }
    throw new Error(sonHata || 'kaynak yok');
}

// Firestore sürümünde menü JSON'una sızan, artık ÖLMÜŞ alanlar. Menü sayfası
// (MenuPage.jsx) kategoriden yalnızca id + ad okuyor; bunlar taşınmadı:
//   urunSayisi → denormalize sayaç (canlı sayılıyor)
//   renk/gorsel/kilitli/tur → panelde kullanılan alanlar, müşteri menüsünde ölü
const OLU_KATEGORI_ALANLARI = ['urunSayisi', 'renk', 'gorsel', 'kilitli', 'tur'];

const sirala = (a) => [...a].sort((x, y) => String(x.id).localeCompare(String(y.id)));

function normalizeUrun(u) {
    return {
        id: u.id, ad: u.ad, fiyat: Number(u.fiyat),
        aciklama: u.aciklama || '', etiket: [...(u.etiket || [])].sort(),
        gorsel: u.gorsel || '', miktar: u.miktar ?? null,
        birim: u.birim || '', kalori: u.kalori ?? null, kategori: u.kategori || 'diger',
    };
}

function farkAnlat(yol, a, b, farklar) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        farklar.push(`${yol}: eski=${JSON.stringify(a)} yeni=${JSON.stringify(b)}`);
    }
}

async function karsilastir(slug) {
    const yeni = await buildMenuData(slug);
    if (!yeni) return { slug, hata: 'v2 menü üretilemedi (şube yok)' };

    let eski;
    try { eski = await r2Json(slug); }
    catch (e) { return { slug, hata: `R2'den okunamadı: ${e.message}` }; }

    const farklar = [];

    // ── sube bloğu ──
    for (const k of ['id', 'slug', 'ad', 'il', 'ilce']) {
        farkAnlat(`sube.${k}`, eski.sube?.[k] ?? null, yeni.sube?.[k] ?? null, farklar);
    }

    // ── kategoriler: sıra + id/ad (ölü alanlar hariç) ──
    const eskiKat = (eski.kategoriler || []).map((k) => ({ id: k.id, ad: k.ad, sira: k.sira ?? null }));
    const yeniKat = (yeni.kategoriler || []).map((k) => ({ id: k.id, ad: k.ad, sira: k.sira ?? null }));
    farkAnlat('kategoriler (id/ad/sira, sırasıyla)', eskiKat, yeniKat, farklar);

    // Kategori nesnelerinin alan alan tam karşılaştırması: hangi anahtar yalnızca
    // bir tarafta, hangisi iki tarafta ama farklı değerde?
    const oluAlanSayisi = {};
    const eskiKatMap = new Map((eski.kategoriler || []).map((k) => [k.id, k]));
    for (const y of yeni.kategoriler || []) {
        const e = eskiKatMap.get(y.id);
        if (!e) continue;
        for (const alan of new Set([...Object.keys(e), ...Object.keys(y)])) {
            if (['id', 'ad', 'sira'].includes(alan)) continue;      // yukarıda sıkı karşılaştırıldı
            const eVar = e[alan] !== undefined, yVar = y[alan] !== undefined;
            let etiket;
            if (eVar && !yVar) etiket = `${alan}: yalnız eskide`;
            else if (!eVar && yVar) etiket = `${alan}: yalnız yenide`;
            else if (JSON.stringify(e[alan]) !== JSON.stringify(y[alan])) etiket = `${alan}: değer farklı`;
            else continue;
            oluAlanSayisi[etiket] = (oluAlanSayisi[etiket] || 0) + 1;
        }
    }
    void OLU_KATEGORI_ALANLARI;

    // ── ürünler: kategori kırılımı + alan alan ──
    const eskiKatlar = Object.keys(eski.urunlerByKategori || {}).sort();
    const yeniKatlar = Object.keys(yeni.urunlerByKategori || {}).sort();
    farkAnlat('urunlerByKategori anahtarları', eskiKatlar, yeniKatlar, farklar);

    let eskiToplam = 0, yeniToplam = 0;
    for (const kat of new Set([...eskiKatlar, ...yeniKatlar])) {
        const e = sirala((eski.urunlerByKategori?.[kat] || []).map(normalizeUrun));
        const y = sirala((yeni.urunlerByKategori?.[kat] || []).map(normalizeUrun));
        eskiToplam += e.length; yeniToplam += y.length;

        if (e.length !== y.length) {
            const eIds = new Set(e.map((u) => u.id)), yIds = new Set(y.map((u) => u.id));
            farklar.push(`[${kat}] ürün sayısı: eski=${e.length} yeni=${y.length}` +
                ` | yalnız eskide: ${e.filter((u) => !yIds.has(u.id)).map((u) => u.id).join(',') || '-'}` +
                ` | yalnız yenide: ${y.filter((u) => !eIds.has(u.id)).map((u) => u.id).join(',') || '-'}`);
            continue;
        }
        for (let i = 0; i < e.length; i++) {
            for (const alan of Object.keys(e[i])) {
                farkAnlat(`[${kat}] ${e[i].id}.${alan}`, e[i][alan], y[i][alan], farklar);
            }
        }
    }

    return { slug, farklar, eskiToplam, yeniToplam, oluAlanSayisi };
}

// ── Çalıştır ──
let sluglar = process.argv.slice(2);
if (sluglar.length === 0) {
    const { data } = await supabase.from('subeler').select('kod').order('kod').limit(2);
    sluglar = data.map((s) => s.kod);
}

let toplamFark = 0;
for (const slug of sluglar) {
    const sonuc = await karsilastir(slug);
    if (sonuc.hata) {
        console.log(`${KIRMIZI}✗ ${slug}: ${sonuc.hata}${SIFIRLA}`);
        toplamFark++;
        continue;
    }
    const { farklar, eskiToplam, yeniToplam, oluAlanSayisi } = sonuc;
    toplamFark += farklar.length;
    const im = farklar.length === 0 ? `${YESIL}✓${SIFIRLA}` : `${KIRMIZI}✗${SIFIRLA}`;
    console.log(`${im} ${slug.padEnd(24)} ürün: eski=${eskiToplam} yeni=${yeniToplam} | fark: ${farklar.length}`);
    for (const f of farklar.slice(0, 15)) console.log(`   ${KIRMIZI}• ${f}${SIFIRLA}`);
    if (farklar.length > 15) console.log(`   ${GRI}… ${farklar.length - 15} fark daha${SIFIRLA}`);
    const olu = Object.entries(oluAlanSayisi).map(([k, v]) => `${k}(${v})`).join(', ');
    if (olu) console.log(`   ${GRI}kategori nesnesi alan farkları: ${olu}${SIFIRLA}`);
}

console.log('');
if (toplamFark === 0) console.log(`${YESIL}✓ Menü JSON'ları birebir aynı (${sluglar.length} şube).${SIFIRLA}`);
else console.log(`${SARI}${toplamFark} fark var — yukarıya bak.${SIFIRLA}`);
process.exit(toplamFark === 0 ? 0 : 1);
