// ⛔ TARİHSEL — ARTIK ÇALIŞMAZ: config/firebase.js ve firebase-admin S2 sökümünde
//    kaldırıldı. Bu dosya yapılan işin kaydı olarak duruyor; çıktıları
//    scripts/parite/RAPOR*.md ve görev dosyalarındaki "Uygulandı" bloklarında.
// S1 — Firestore TAM export → R2 `arsiv/firestore-<tarih>/`
//
// Salt okuma. Kök koleksiyonlar → dokümanlar → alt koleksiyonlar (özyinelemeli).
// Her kök koleksiyon ayrı bir .json.gz; yanına manifest.json (sayımlar + damga).
// Yükleme sonrası arşiv R2'den GERİ okunup sayımlar doğrulanır.
//
// Kullanım: cd backend-v2 && node scripts/gecis/s1-firestore-arsiv.mjs [--uygula]
import { gzipSync, gunzipSync } from 'node:zlib';
import { db } from '../../config/firebase.js';
import { uploadFile, r2, BUCKET } from '../../config/r2.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const UYGULA = process.argv.includes('--uygula');
const TARIH = '2026-08-01';
const ONEK = `arsiv/firestore-${TARIH}`;

let dokumanSayaci = 0;

/** Firestore değerlerini JSON'a çevirir (Timestamp/GeoPoint/DocumentReference dahil). */
function degeriCevir(v) {
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) return v.map(degeriCevir);
    if (typeof v === 'object') {
        if (typeof v.toDate === 'function') return { __tur: 'timestamp', deger: v.toDate().toISOString() };
        if (typeof v.latitude === 'number' && typeof v.longitude === 'number') {
            return { __tur: 'geopoint', lat: v.latitude, lng: v.longitude };
        }
        if (v._path && typeof v.path === 'string') return { __tur: 'ref', yol: v.path };
        const o = {};
        for (const [k, x] of Object.entries(v)) o[k] = degeriCevir(x);
        return o;
    }
    return v;
}

/** Bir koleksiyonu (ve altındaki her şeyi) düz nesneye çıkarır. */
async function koleksiyonCikar(ref) {
    const snap = await ref.get();
    const dokumanlar = [];
    for (const d of snap.docs) {
        dokumanSayaci++;
        const kayit = { __id: d.id, veri: degeriCevir(d.data()) };
        const altlar = await d.ref.listCollections();
        if (altlar.length) {
            kayit.__alt = {};
            for (const alt of altlar) kayit.__alt[alt.id] = await koleksiyonCikar(alt);
        }
        dokumanlar.push(kayit);
    }
    return dokumanlar;
}

const kokler = await db.listCollections();
console.log(`kök koleksiyon: ${kokler.map((c) => c.id).join(', ')}\n`);

const manifest = { tarih: TARIH, uretim: new Date().toISOString(), koleksiyonlar: {}, toplamDokuman: 0 };
const dosyalar = [];

for (const kok of kokler) {
    const oncekiSayac = dokumanSayaci;
    const veri = await koleksiyonCikar(kok);
    const altToplam = dokumanSayaci - oncekiSayac;
    const gz = gzipSync(Buffer.from(JSON.stringify({ koleksiyon: kok.id, dokumanlar: veri }), 'utf8'));
    manifest.koleksiyonlar[kok.id] = { kokDokuman: veri.length, tumDokuman: altToplam, gzBoyut: gz.length };
    dosyalar.push({ key: `${ONEK}/${kok.id}.json.gz`, gz });
    console.log(`${kok.id.padEnd(24)} kök=${String(veri.length).padStart(5)} toplam=${String(altToplam).padStart(5)} ${(gz.length / 1024).toFixed(0)} KB`);
}
manifest.toplamDokuman = dokumanSayaci;

// Firebase Auth kullanıcı listesi (parola hash'leri firebase-tools auth:export ile ayrıca alınır)
const { auth } = await import('../../config/firebase.js');
const { users } = await auth.listUsers(1000);
const authDokum = users.map((u) => ({
    uid: u.uid, email: u.email ?? null, displayName: u.displayName ?? null,
    disabled: u.disabled, emailVerified: u.emailVerified,
    customClaims: u.customClaims ?? null,
    providerData: u.providerData.map((p) => ({ providerId: p.providerId, uid: p.uid, email: p.email ?? null })),
    metadata: { creationTime: u.metadata.creationTime, lastSignInTime: u.metadata.lastSignInTime },
}));
const authGz = gzipSync(Buffer.from(JSON.stringify(authDokum), 'utf8'));
dosyalar.push({ key: `${ONEK}/_auth-kullanicilar.json.gz`, gz: authGz });
manifest.authKullanici = authDokum.length;
console.log(`${'_auth-kullanicilar'.padEnd(24)} ${authDokum.length} kullanıcı`);

console.log(`\nTOPLAM ${dokumanSayaci} doküman, ${dosyalar.length} dosya`);
if (!UYGULA) { console.log('KURU KOŞU — R2\'ye yazılmadı. --uygula ekle.'); process.exit(0); }

for (const d of dosyalar) await uploadFile(d.gz, d.key, "application/gzip");
await uploadFile(Buffer.from(JSON.stringify(manifest, null, 2), "utf8"), `${ONEK}/manifest.json`, "application/json");
console.log(`\n${dosyalar.length + 1} dosya yüklendi → ${ONEK}/`);

// ── Doğrulama: arşivi R2'den GERİ oku, sayımları karşılaştır ──
console.log('\n── doğrulama (R2\'den geri okuma) ──');
let hata = 0;
for (const [ad, beklenen] of Object.entries(manifest.koleksiyonlar)) {
    const g = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: `${ONEK}/${ad}.json.gz` }));
    const j = JSON.parse(gunzipSync(Buffer.concat(await g.Body.toArray())).toString('utf8'));
    const say = (liste) => liste.reduce((t, d) => t + 1 + Object.values(d.__alt ?? {}).reduce((x, a) => x + say(a), 0), 0);
    const tum = say(j.dokumanlar);
    const tamam = j.dokumanlar.length === beklenen.kokDokuman && tum === beklenen.tumDokuman;
    if (!tamam) hata++;
    console.log(`${tamam ? '✓' : '✗'} ${ad.padEnd(24)} kök=${j.dokumanlar.length}/${beklenen.kokDokuman} toplam=${tum}/${beklenen.tumDokuman}`);
}
const ag = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: `${ONEK}/_auth-kullanicilar.json.gz` }));
const aj = JSON.parse(gunzipSync(Buffer.concat(await ag.Body.toArray())).toString('utf8'));
console.log(`${aj.length === authDokum.length ? '✓' : '✗'} _auth-kullanicilar     ${aj.length}/${authDokum.length}`);
if (aj.length !== authDokum.length) hata++;

console.log(hata === 0 ? '\nS1 ARŞİVİ DOĞRULANDI ✓' : `\n${hata} koleksiyonda sayım tutmadı ✗`);
process.exit(hata === 0 ? 0 : 1);