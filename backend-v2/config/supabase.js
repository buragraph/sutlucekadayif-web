import './env.js';   // .env + .env.local (mutlak yol) — İLK yüklenmeli
import { createClient } from '@supabase/supabase-js';


const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
        'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tanımlı değil — backend-v2/.env dosyasına bak.'
    );
}

// service_role anahtarı RLS'i baypas eder; bu istemci YALNIZCA sunucuda kullanılır.
// persistSession/autoRefreshToken kapalı: sunucuda oturum yok, her istek tek seferlik.
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Bağlantı sağlık kontrolü — `select 1` karşılığı (public.saglik() fonksiyonu).
 * @returns {Promise<number>} 1
 */
export async function saglikKontrol() {
    const { data, error } = await supabase.rpc('saglik');
    if (error) throw new Error(error.message);
    return data;
}
