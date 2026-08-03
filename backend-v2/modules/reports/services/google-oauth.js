// Google OAuth — `googleapis` paketi olmadan, düz fetch ile (Faz 3 / C1).
//
// googleapis Node'a bağlı (gaxios/node http, google-auth-library node crypto)
// ve Workers'ta çalışmıyor. Kullandığımız yüzey küçüktü: yetki URL'i, kod→token
// takası, süresi dolan access token'ın yenilenmesi. Üçü de tek POST.
//
// Token kaydının ŞEKLİ googleapis'in yazdığıyla AYNI tutuldu
// (access_token, refresh_token, scope, token_type, expiry_date=ms epoch);
// veritabanındaki mevcut kayıt olduğu gibi çalışmaya devam eder.

const YETKI_UCU = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_UCU = 'https://oauth2.googleapis.com/token';

/** Yetkilendirme URL'i — googleapis generateAuthUrl karşılığı. */
export function yetkiUrl({ clientId, redirectUri, scopes, state }) {
    const p = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes.join(' '),
        access_type: 'offline',
        prompt: 'consent',
    });
    if (state) p.set('state', state);
    return `${YETKI_UCU}?${p.toString()}`;
}

async function tokenIste(govde) {
    const r = await fetch(TOKEN_UCU, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(govde).toString(),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
        throw new Error(`Google token hatası (${r.status}): ${j.error_description || j.error || 'bilinmiyor'}`);
    }
    // googleapis expiry_date (ms epoch) yazıyordu; aynı alanı üretiyoruz.
    if (j.expires_in) j.expiry_date = Date.now() + j.expires_in * 1000;
    return j;
}

/** Yetki kodunu token'a çevirir (callback). */
export async function koduTokenaCevir({ code, clientId, clientSecret, redirectUri }) {
    return await tokenIste({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
    });
}

/** refresh_token ile yeni access token alır. */
export async function tokenYenile({ refreshToken, clientId, clientSecret }) {
    const yeni = await tokenIste({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
    });
    // Yenileme yanıtında refresh_token gelmez — eskisi korunmalı.
    return { ...yeni, refresh_token: yeni.refresh_token || refreshToken };
}

/** Token süresi dolmuş mu (60 sn emniyet payıyla)? */
export function suresiDoldu(token) {
    if (!token?.expiry_date) return !token?.access_token;
    return token.expiry_date - 60_000 <= Date.now();
}
