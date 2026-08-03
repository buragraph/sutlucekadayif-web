// Import doğrulaması — iki taraftan karşılaştırır, sıfır farkla bitmeli.
//
// 1) Satır/doküman sayıları
// 2) donemler'de sum(harcama) ve sum(erisim)
//    DİKKAT: Firestore tarafı (a) öksüz 4 kaydı DÜŞER — üst dokümanı subeler'de
//    olmayan eski slug kalıntıları hiç import edilmiyor; (b) override ?? top-level
//    kuralını uygular — import da aynı kuralla yazıyor.
// 3) Rastgele 5 ürün, alan alan
// 4) urun_sube satır sayısı = dizilerin tekilleştirilmiş üye sayısı
//
// Kullanım: cd backend-v2 && node scripts/supabase-import/dogrula.mjs
import { db, supabase, satirSayisi, subeKodlari, dogrudanMi } from './ortak.mjs';
import { urunSatiri, uyelikSatirlari } from './03-urunler.mjs';
import { donemleriTopla, BEKLENEN_OKSUZ } from './04-donemler.mjs';

const YESIL = '\x1b[32m', KIRMIZI = '\x1b[31m', GRI = '\x1b[90m', SIFIRLA = '\x1b[0m';
const farklar = [];

function karsilastir(baslik, firestore, postgres, ek = '') {
    const esit = String(firestore) === String(postgres);
    if (!esit) farklar.push(`${baslik}: firestore=${firestore} postgres=${postgres}`);
    const im = esit ? `${YESIL}✓${SIFIRLA}` : `${KIRMIZI}✗${SIFIRLA}`;
    console.log(`${im} ${baslik.padEnd(34)} firestore=${String(firestore).padStart(10)}  postgres=${String(postgres).padStart(10)} ${GRI}${ek}${SIFIRLA}`);
}

const yuvarla = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// PostgREST timestamptz'i "…+00:00", biz "…Z" yazıyoruz — aynı an, farklı yazım.
const ZAMAN_KALIBI = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;
const zamanMi = (v) => typeof v === 'string' && ZAMAN_KALIBI.test(v);

const esitDeger = (a, b) => {
    if (a == null && b == null) return true;
    if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
    if (zamanMi(a) && zamanMi(b)) return new Date(a).getTime() === new Date(b).getTime();
    if (typeof a === 'number' || typeof b === 'number') return yuvarla(Number(a)) === yuvarla(Number(b));
    return String(a ?? '') === String(b ?? '');
};

export default async function dogrula() {
    console.log('\n── 1. Satır / doküman sayıları ──');

    const basitler = [
        ['subeler', 'subeler'],
        ['kategoriler', 'kategoriler'],
        ['urunler', 'ortak_urunler'],
        ['medya', 'medya'],
        ['kullanici_sube', 'kullanici_sube'],
        ['franchise_basvurulari', 'franchise_basvurulari'],
        ['geri_bildirimler', 'geri_bildirimler'],
        ['is_basvurulari', 'is_basvurulari'],
    ];
    for (const [tablo, koleksiyon] of basitler) {
        const [fsSay, pgSay] = await Promise.all([
            db.collection(koleksiyon).count().get().then((r) => r.data().count),
            satirSayisi(tablo),
        ]);
        karsilastir(tablo, fsSay, pgSay);
    }

    // sube_notlari: yalnızca geçerli şubeye ait olanlar taşınıyor
    const subeler = await subeKodlari();
    const notDocs = (await db.collection('sube_notlari').get()).docs;
    karsilastir('sube_notlari', notDocs.filter((d) => subeler.has(d.id)).length, await satirSayisi('sube_notlari'),
        notDocs.length !== notDocs.filter((d) => subeler.has(d.id)).length ? '(kopuk şube kaydı düşüldü)' : '');

    // Akademi
    const kursDocs = (await db.collection('academy_courses').get()).docs;
    let dersSayisi = 0;
    for (const k of kursDocs) dersSayisi += (await k.ref.collection('lessons').count().get()).data().count;
    karsilastir('kurslar', kursDocs.length, await satirSayisi('kurslar'));
    karsilastir('dersler', dersSayisi, await satirSayisi('dersler'));

    let ilerlemeSayisi = 0;
    for (const p of (await db.collection('academy_progress').get()).docs) {
        ilerlemeSayisi += (await p.ref.collection('completedLessons').count().get()).data().count;
    }
    karsilastir('ilerleme', ilerlemeSayisi, await satirSayisi('ilerleme'));

    // Eşleşmeler + kampanyalar + ayarlar
    let eslesmeSayisi = 0;
    for (const id of ['adset_mappings', 'campaign_mappings', 'google_mappings', 'meta_mappings']) {
        const d = await db.collection('reports').doc(id).get();
        eslesmeSayisi += Object.values(d.data() || {}).filter((v) => v != null).length;
    }
    karsilastir('eslesmeler', eslesmeSayisi, await satirSayisi('eslesmeler'));

    const butce = await db.collection('reports').doc('butce').get();
    karsilastir('kampanyalar', Object.keys(butce.data()?.kampanyalar || {}).length, await satirSayisi('kampanyalar'));
    karsilastir('ayarlar', 3, await satirSayisi('ayarlar'), '(menu_cache, settings, google_token)');

    // ── 2. Dönemler: sayı + toplamlar ──
    console.log('\n── 2. Dönemler (öksüz kayıtlar Firestore tarafından düşülür) ──');
    const { toplamDokuman, satirlar, oksuzler } = await donemleriTopla();
    console.log(`${GRI}   collectionGroup: ${toplamDokuman} doküman, ${oksuzler.length} öksüz atlandı → ${oksuzler.join(', ')}${SIFIRLA}`);

    const oksuzSubeler = [...new Set(oksuzler.map((o) => o.split('/')[0]))].sort();
    if (JSON.stringify(oksuzSubeler) !== JSON.stringify([...BEKLENEN_OKSUZ].sort())) {
        farklar.push(`öksüz şube listesi beklenenden farklı: ${oksuzSubeler.join(', ')}`);
    }

    karsilastir('donemler (satır)', satirlar.length, await satirSayisi('donemler'));

    const { data: pgDonemler, error } = await supabase
        .from('donemler').select('harcama, erisim').range(0, 99999);
    if (error) throw new Error(`donemler okunamadı: ${error.message}`);

    for (const alan of ['harcama', 'erisim']) {
        const fsToplam = yuvarla(satirlar.reduce((t, s) => t + (Number(s[alan]) || 0), 0));
        const pgToplam = yuvarla(pgDonemler.reduce((t, s) => t + (Number(s[alan]) || 0), 0));
        karsilastir(`sum(${alan})`, fsToplam, pgToplam);
    }

    // ── 3. urun_sube satır sayısı ──
    console.log('\n── 3. Ürünler ──');
    const urunDocs = (await db.collection('ortak_urunler').get()).docs;
    const { satirlar: beklenenUyeler } = uyelikSatirlari(urunDocs, subeler);
    karsilastir('urun_sube (tekilleştirilmiş)', beklenenUyeler.length, await satirSayisi('urun_sube'));

    // ── 4. Rastgele 5 ürün, alan alan ──
    const secilen = [...urunDocs].sort(() => Math.random() - 0.5).slice(0, 5);
    const { data: pgUrunler, error: hata2 } = await supabase
        .from('urunler').select('*').in('id', secilen.map((d) => d.id));
    if (hata2) throw new Error(`urunler okunamadı: ${hata2.message}`);

    for (const doc of secilen) {
        const beklenen = urunSatiri(doc.id, doc.data());
        const gercek = pgUrunler.find((u) => u.id === doc.id);
        if (!gercek) { farklar.push(`ürün ${doc.id}: postgres'te YOK`); console.log(`${KIRMIZI}✗${SIFIRLA} ürün ${doc.id}: postgres'te yok`); continue; }
        const bozuk = Object.keys(beklenen).filter((k) => {
            if (k === 'olusturma' && beklenen[k] == null) return false;   // kaynakta yoksa import anı yazılır
            if (k === 'kategori_id' && gercek[k] == null) return false;   // kopuk kategori bilerek null
            return !esitDeger(beklenen[k], gercek[k]);
        });
        if (bozuk.length) {
            farklar.push(`ürün ${doc.id}: ${bozuk.map((k) => `${k} (${JSON.stringify(beklenen[k])} ≠ ${JSON.stringify(gercek[k])})`).join(', ')}`);
            console.log(`${KIRMIZI}✗${SIFIRLA} ürün ${doc.id.padEnd(22)} farklı alan: ${bozuk.join(', ')}`);
        } else {
            console.log(`${YESIL}✓${SIFIRLA} ürün ${doc.id.padEnd(22)} ${Object.keys(beklenen).length} alan birebir`);
        }
    }

    // ── Sonuç ──
    console.log('');
    if (farklar.length === 0) {
        console.log(`${YESIL}✓ Doğrulama sıfır farkla bitti.${SIFIRLA}`);
        return true;
    }
    console.log(`${KIRMIZI}✗ ${farklar.length} fark bulundu:${SIFIRLA}`);
    for (const f of farklar) console.log(`   • ${f}`);
    return false;
}

if (dogrudanMi(import.meta.url)) {
    const temiz = await dogrula();
    process.exit(temiz ? 0 : 1);
}
