// ⛔ TARİHSEL — ARTIK ÇALIŞMAZ: config/firebase.js ve firebase-admin S2 sökümünde
//    kaldırıldı. Bu dosya yapılan işin kaydı olarak duruyor; çıktıları
//    scripts/parite/RAPOR*.md ve görev dosyalarındaki "Uygulandı" bloklarında.
// B1 — Firebase Auth kullanıcılarını Supabase Auth'a taşır ve uid eşlemesini yazar.
//
// Kullanım: node scripts/gecis/b1-kullanici-tasi.mjs <parola-dosyasi> [--uygula]
//   --uygula verilmezse KURU KOŞU: hiçbir kullanıcı yaratılmaz, ne yapılacağı basılır.
//   Parolalar YALNIZCA <parola-dosyasi>'na yazılır (0600), stdout'a asla düşmez.
//
// Firebase claim'leri app_metadata'ya BİREBİR kopyalanır. Claim'i olmayan kullanıcıya
// uydurma rol atanmaz — permissions.js'te yalnızca 'admin' ve 'sube_sahibi' var;
// rolsüz kullanıcı bugün Firebase'de nasıl davranıyorsa Supabase'de de öyle davranır.
// DİKKAT: app_metadata'ya null yazılan anahtar saklanmaz (jsonb merge'de null = sil),
// bu yüzden subeSlug yoksa anahtar hiç gönderilmez.
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { auth } from '../../config/firebase.js';
import { supabase } from '../../config/supabase.js';

const [dosya, ...bayraklar] = process.argv.slice(2);
const UYGULA = bayraklar.includes('--uygula');
if (!dosya) throw new Error('Parola dosyası yolu zorunlu (ilk argüman)');

const HARFLER = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+';
function parolaUret(uzunluk = 20) {
    const b = randomBytes(uzunluk);
    return Array.from(b, (x) => HARFLER[x % HARFLER.length]).join('');
}

const { users } = await auth.listUsers(1000);
const { data: mevcutEslesme, error: eslesmeHata } = await supabase.from('uid_eslesme').select('firebase_uid');
if (eslesmeHata) throw new Error('uid_eslesme okunamadı: ' + eslesmeHata.message);
const zatenVar = new Set((mevcutEslesme ?? []).map((r) => r.firebase_uid));

const kimlikler = [];
const atlananlar = [];

for (const u of users) {
    if (!u.email) {
        atlananlar.push({ uid: u.uid, sebep: 'e-posta yok (parolayla giriş imkânsız)' });
        continue;
    }
    if (zatenVar.has(u.uid)) {
        atlananlar.push({ uid: u.uid, sebep: 'uid_eslesme\'de zaten var' });
        continue;
    }

    const claims = u.customClaims ?? {};
    const app_metadata = {};
    if (claims.role != null) app_metadata.role = claims.role;
    if (claims.subeSlug != null) app_metadata.subeSlug = claims.subeSlug;
    const user_metadata = u.displayName ? { displayName: u.displayName } : {};
    const parola = parolaUret();

    console.log(
        `${UYGULA ? 'YARAT' : 'kuru '} ${u.email.padEnd(30)} app_metadata=${JSON.stringify(app_metadata)} ` +
        `user_metadata=${JSON.stringify(user_metadata)}`
    );
    if (!UYGULA) continue;

    const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: parola,
        email_confirm: true,
        app_metadata,
        user_metadata,
    });
    if (error) throw new Error(`createUser(${u.email}): ${error.message}`);

    const { error: insHata } = await supabase
        .from('uid_eslesme')
        .insert({ firebase_uid: u.uid, supabase_uid: data.user.id, eposta: u.email });
    if (insHata) {
        // Eşleme yazılamazsa kullanıcı ortada kalmasın — geri al.
        await supabase.auth.admin.deleteUser(data.user.id);
        throw new Error(`uid_eslesme insert(${u.email}): ${insHata.message} — kullanıcı geri alındı`);
    }
    kimlikler.push({ eposta: u.email, parola, firebase_uid: u.uid, supabase_uid: data.user.id });
}

console.log(`\nAtlananlar (${atlananlar.length}):`);
for (const a of atlananlar) console.log(`  ${a.uid} — ${a.sebep}`);

if (UYGULA && kimlikler.length) {
    const metin =
        `Sütlüce Kadayıf — Supabase geçici parolaları (${kimlikler.length} kullanıcı)\n` +
        `Bu dosyayı ilgili kişilere ilettikten sonra SİL. Herkes ilk girişte bu parolayı kullanır.\n\n` +
        kimlikler.map((k) => `${k.eposta}\n  parola: ${k.parola}\n  uid: ${k.supabase_uid}\n`).join('\n');
    writeFileSync(dosya, metin, { mode: 0o600 });
    console.log(`\n${kimlikler.length} kullanıcı yaratıldı. Parolalar: ${dosya} (0600)`);
} else if (!UYGULA) {
    console.log('\nKURU KOŞU — hiçbir şey yazılmadı. Uygulamak için --uygula ekle.');
}