// Geçiş/parite adımlarında kullanılacak kısa ömürlü Supabase access token'ı basar.
//
// Kullanım:
//   TOKEN=$(node scripts/gecis/supabase-token.mjs admin)
//   TOKEN=$(node scripts/gecis/supabase-token.mjs sube_sahibi)
//   TOKEN=$(node scripts/gecis/supabase-token.mjs birisi@ornek.com)
//
// Parola bilmeye gerek yok: admin API ile magic-link üretilir (E-POSTA GÖNDERİLMEZ,
// yalnızca token döner) ve anon istemciyle oturuma çevrilir.
// Faz 1'deki admin-token.mjs'in yerini aldı — o Firebase custom token basıyordu ve
// karşılığı olmayan uid'ler için Firebase'de hayalet hesap yaratıyordu.
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../config/supabase.js';

const ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_JJ48onQZn0_fxQl2Rs6wVg_W2C1BgGT';
const hedef = process.argv[2] || 'admin';

let eposta = hedef;
if (!hedef.includes('@')) {
    const { data, error } = await supabase
        .from('kullanici_sube').select('uid').eq('role', hedef).limit(1);
    if (error) throw new Error(error.message);
    if (!data.length) throw new Error(`'${hedef}' rolünde kullanıcı yok`);
    const { data: k, error: kHata } = await supabase.auth.admin.getUserById(data[0].uid);
    if (kHata || !k?.user?.email) throw new Error(`${data[0].uid} için hesap bulunamadı`);
    eposta = k.user.email;
}

const { data: link, error: linkHata } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: eposta,
});
if (linkHata) throw new Error(`generateLink: ${linkHata.message}`);

const anon = createClient(process.env.SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
});
const { data: oturum, error: otpHata } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
});
if (otpHata) throw new Error(`verifyOtp: ${otpHata.message}`);
if (process.env.TOKEN_AYRINTI) console.error(`token → ${eposta} (${oturum.user.id})`);
process.stdout.write(oturum.session.access_token);
