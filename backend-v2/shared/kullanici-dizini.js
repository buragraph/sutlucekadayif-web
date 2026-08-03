// Kullanıcı dizini — Supabase Auth admin API'sinin üstünde ince bir katman (Faz 2 / B2).
//
// Rota gövdeleri kimlik sağlayıcıyı bilmez. Faz 1'de bu çağrılar firebase-admin'e
// gidiyordu; API'ye yansıyan alan adları ve DEĞER BİÇİMLERİ birebir korunuyor:
//   - createdAt / lastSignIn → Firebase `toUTCString()` basıyordu ("Sat, 01 Aug 2026 …"),
//     Supabase ISO veriyor; burada eski biçime çevriliyor.
//   - displayName → Firebase'de hesabın kendi alanı, Supabase'de user_metadata.displayName.
//   - disabled → Firebase'de boolean alan, Supabase'de banned_until (geçmişse etkisiz).
//   - rol/şube claim'leri → app_metadata.{role,subeSlug}.
//
// DİKKAT: app_metadata'ya null yazılan anahtar SAKLANMAZ (jsonb merge'de null = sil).
// Okurken `?? null` ile normalize et; "şubeyi kaldır" için null göndermek doğru yoldur.
import { supabase } from '../config/supabase.js';

const SAYFA = 1000;

/** Supabase Auth hatasını Express'in beklediği şekle çevirir. */
function hataAt(error, baglam) {
    if (!error) return;
    const h = new Error(`${baglam}: ${error.message}`);
    h.status = error.status >= 400 && error.status < 500 ? error.status : 500;
    throw h;
}

const utc = (v) => (v ? new Date(v).toUTCString() : null);

/** Auth kullanıcısı → API yanıtındaki hesap alanları (rol/şube HARİÇ; onlar kullanici_sube'den). */
export function hesapAlanlari(u) {
    return {
        uid: u.id,
        email: u.email ?? null,
        displayName: u.user_metadata?.displayName ?? null,
        disabled: !!(u.banned_until && new Date(u.banned_until) > new Date()),
        createdAt: utc(u.created_at),
        lastSignIn: utc(u.last_sign_in_at),
    };
}

/** Token/kullanıcı üzerindeki rol-şube claim'leri (yoksa null). */
export function claimler(u) {
    return {
        role: u?.app_metadata?.role ?? null,
        subeSlug: u?.app_metadata?.subeSlug ?? null,
    };
}

/** Tüm kullanıcılar — sayfalanır (listUsers varsayılanı 50, sessizce keser). */
export async function tumKullanicilar() {
    const hepsi = [];
    for (let sayfa = 1; ; sayfa++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page: sayfa, perPage: SAYFA });
        hataAt(error, 'kullanıcılar listelenemedi');
        hepsi.push(...data.users);
        if (data.users.length < SAYFA) return hepsi;
    }
}

/** Tek kullanıcı; bulunamazsa/hata olursa null (eski `auth.getUser(...).catch(() => null)` davranışı). */
export async function kullaniciGetir(uid) {
    const { data, error } = await supabase.auth.admin.getUserById(uid);
    if (error || !data?.user) return null;
    return data.user;
}

/** uid listesi → Map<uid, kullanıcı>. Bilinmeyen uid sessizce atlanır. */
export async function kullanicilariGetir(uidler) {
    const istenen = new Set(uidler);
    const map = new Map();
    for (const u of await tumKullanicilar()) if (istenen.has(u.id)) map.set(u.id, u);
    return map;
}

export async function kullaniciYarat({ email, password, displayName, role, subeSlug }) {
    const app_metadata = {};
    if (role != null) app_metadata.role = role;
    if (subeSlug != null) app_metadata.subeSlug = subeSlug;
    const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,          // panelde e-posta doğrulama akışı yok
        app_metadata,
        user_metadata: displayName ? { displayName } : {},
    });
    hataAt(error, 'kullanıcı oluşturulamadı');
    return data.user;
}

/** E-posta / displayName / parola günceller. displayName null → alan temizlenir. */
export async function kullaniciGuncelle(uid, { email, displayName, password }) {
    const yama = {};
    if (email !== undefined) yama.email = email;
    if (password !== undefined) yama.password = password;
    if (displayName !== undefined) yama.user_metadata = { displayName: displayName || null };
    if (!Object.keys(yama).length) return null;
    const { data, error } = await supabase.auth.admin.updateUserById(uid, yama);
    hataAt(error, 'kullanıcı güncellenemedi');
    return data.user;
}

/** Rol/şube claim'lerini yazar (Firebase setCustomUserClaims karşılığı). */
export async function claimYaz(uid, { role, subeSlug }) {
    const { error } = await supabase.auth.admin.updateUserById(uid, {
        app_metadata: { role: role ?? null, subeSlug: subeSlug ?? null },
    });
    hataAt(error, 'kullanıcı yetkileri yazılamadı');
}

export async function kullaniciSil(uid) {
    const { error } = await supabase.auth.admin.deleteUser(uid);
    hataAt(error, 'kullanıcı silinemedi');
}
