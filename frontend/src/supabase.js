import { createClient } from '@supabase/supabase-js';

// YALNIZCA kimlik doğrulama için. Veritabanına frontend'den erişim YOK:
// RLS tüm tablolarda deny-all, bu anahtar publishable (bundle'a girmesi güvenli).
// Veri her zaman backend API'sinden geçer.
export const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: true,        // oturum localStorage'da
            autoRefreshToken: true,      // access token 1 saatlik; kütüphane yeniler
            detectSessionInUrl: false,   // magic-link/OAuth dönüşü yok
        },
    }
);
