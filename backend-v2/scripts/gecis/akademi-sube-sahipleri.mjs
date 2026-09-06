/**
 * WordPress akademisindeki şube sahiplerini Supabase Auth'a taşır.
 *
 * NEDEN BETİK: 76 hesap, panelden tek tek açılamaz. Rota katmanı yerine
 * `kullaniciYarat` + `kullanici_sube` yazımını BİREBİR aynı sırayla tekrarlar
 * (bkz. routes/users.js POST /) — auth kullanıcısı açılıp eşleştirme satırı
 * yazılamazsa auth kaydı geri alınır, ortada yetim hesap kalmaz.
 *
 * Parola: her kullanıcıya rastgele geçici parola. Panelde "şifremi unuttum"
 * akışı YOK (bilinçli karar), parolayı yönetici iletir. Betik parolaları
 * yalnızca ÇIKTI dosyasına yazar; veritabanına düz metin hiçbir yerde girmez.
 *
 * Kullanım:
 *   node scripts/gecis/akademi-sube-sahipleri.mjs <liste.txt> [--uygula]
 *   Liste satır biçimi:  sube_kod|eposta|ad soyad
 *   --uygula verilmezse yalnızca doğrulama yapar, hiçbir şey yazmaz.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { supabase } from '../../config/supabase.js';
import { kullaniciYarat, kullaniciSil } from '../../shared/kullanici-dizini.js';
import { ilerlemeDevral } from '../../modules/academy/devir.js';

const [dosya, ...bayraklar] = process.argv.slice(2);
const UYGULA = bayraklar.includes('--uygula');
if (!dosya) {
    console.error('Kullanım: node akademi-sube-sahipleri.mjs <liste.txt> [--uygula]');
    process.exit(1);
}

const satirlar = fs.readFileSync(dosya, 'utf8').split('\n')
    .map((s) => s.trim()).filter(Boolean)
    .map((s, i) => {
        const [kod, email, ad] = s.split('|').map((x) => (x ?? '').trim());
        return { satir: i + 1, kod, email: email.toLowerCase(), ad };
    });

const EPOSTA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Doğrulama: şube var mı, e-posta geçerli mi, zaten kayıtlı mı ──
const { data: subeSatirlari, error: subeHata } = await supabase.from('subeler').select('kod');
if (subeHata) throw new Error(`şubeler okunamadı: ${subeHata.message}`);
const subeler = new Set(subeSatirlari.map((s) => s.kod));

// Auth listesi sayfalı gelir; 76 kayıt için tek sayfa yeter ama sınırı açık yazalım.
const { data: mevcut, error: listeHata } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listeHata) throw new Error(`mevcut kullanıcılar okunamadı: ${listeHata.message}`);
const mevcutEposta = new Set(mevcut.users.map((u) => (u.email || '').toLowerCase()));

const sorunlar = [];
const gorulen = new Set();
for (const r of satirlar) {
    if (!r.kod || !r.email || !r.ad) sorunlar.push(`${r.satir}: eksik alan`);
    else if (!EPOSTA.test(r.email)) sorunlar.push(`${r.satir}: geçersiz e-posta (${r.email})`);
    else if (!subeler.has(r.kod)) sorunlar.push(`${r.satir}: şube yok (${r.kod})`);
    else if (gorulen.has(r.email)) sorunlar.push(`${r.satir}: listede tekrar eden e-posta (${r.email})`);
    gorulen.add(r.email);
}
const atlanacak = satirlar.filter((r) => mevcutEposta.has(r.email));
const acilacak = satirlar.filter((r) => !mevcutEposta.has(r.email) && !sorunlar.some((s) => s.startsWith(`${r.satir}:`)));

console.log(`liste: ${satirlar.length} | açılacak: ${acilacak.length} | zaten var: ${atlanacak.length} | sorunlu: ${sorunlar.length}`);
if (atlanacak.length) console.log('zaten var →', atlanacak.map((r) => r.email).join(', '));
if (sorunlar.length) { console.log('SORUNLAR:'); sorunlar.forEach((s) => console.log('  ' + s)); }

if (!UYGULA) {
    console.log('\n(kuru çalıştırma — hiçbir şey yazılmadı; uygulamak için --uygula ekle)');
    process.exit(sorunlar.length ? 1 : 0);
}
if (sorunlar.length) { console.error('\nSorunlar giderilmeden uygulanmaz.'); process.exit(1); }

// ── Uygulama ──
const parola = () => `Sutluce-${crypto.randomBytes(9).toString('base64url')}`;
const cikti = [];
let basarili = 0;

for (const r of acilacak) {
    const sifre = parola();
    let yeni;
    try {
        yeni = await kullaniciYarat({
            email: r.email, password: sifre, displayName: r.ad,
            role: 'sube_sahibi', subeSlug: r.kod,
        });
    } catch (err) {
        console.error(`✗ ${r.email}: ${err.message}`);
        continue;
    }
    try {
        const { error } = await supabase.from('kullanici_sube').upsert(
            { uid: yeni.id, role: 'sube_sahibi', sube_slug: r.kod }, { onConflict: 'uid' }
        );
        if (error) throw new Error(error.message);
    } catch (err) {
        // Eşleştirme yazılamadıysa auth kaydını geri al — yetim hesap kalmasın.
        await kullaniciSil(yeni.id).catch(() => {});
        console.error(`✗ ${r.email}: kullanici_sube yazılamadı, geri alındı — ${err.message}`);
        continue;
    }
    // WP'den devralınan ilerleme varsa bağla (bkz. modules/academy/devir.js)
    await ilerlemeDevral(yeni.id, r.email);

    cikti.push([r.kod, r.ad, r.email, sifre].join('\t'));
    basarili++;
    console.log(`✓ ${r.kod.padEnd(30)} ${r.email}`);
}

const ciktiDosyasi = `${dosya.replace(/\.txt$/, '')}-parolalar.tsv`;
fs.writeFileSync(ciktiDosyasi, 'sube\tad\teposta\tgecici_parola\n' + cikti.join('\n') + '\n', { mode: 0o600 });
console.log(`\n${basarili} hesap açıldı. Geçici parolalar: ${ciktiDosyasi}`);
console.log('Bu dosya düz metin parola içerir — dağıtım bitince silin.');
