import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { hasPermission } from '@shared/permissions.js';

const AuthContext = createContext(null);

export function useAuth() {
    return useContext(AuthContext);
}

// Oturumdan uygulama içi kullanıcı nesnesi. Şekil Faz 1'deki kullanımla aynı
// tutuldu (uid + email + displayName); rol/şube ayrı context değerleri.
function kullaniciNesnesi(session) {
    const u = session?.user;
    if (!u) return null;
    return {
        uid: u.id,
        email: u.email,
        displayName: u.user_metadata?.displayName || null,
    };
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [subeSlug, setSubeSlug] = useState(null);
    const [role, setRole] = useState(null);
    const [simulatedRole, setSimulatedRole] = useState(null);
    const [loading, setLoading] = useState(true);

    // Rol/şube artık token'ın app_metadata'sında (Firebase custom claims karşılığı).
    function oturumuUygula(session) {
        setUser(kullaniciNesnesi(session));
        setSubeSlug(session?.user?.app_metadata?.subeSlug || null);
        setRole(session ? session.user.app_metadata?.role || 'sube_sahibi' : null);
    }

    useEffect(() => {
        // Açılışta mevcut oturum, sonrasında her değişiklik (giriş/çıkış/token yenileme)
        supabase.auth.getSession().then(({ data: { session } }) => {
            oturumuUygula(session);
            setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_olay, session) => {
            oturumuUygula(session);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    async function login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    }

    async function logout() {
        setSubeSlug(null);
        setRole(null);
        return supabase.auth.signOut();
    }

    // Kullanıcının kendi parolasını değiştirmesi. E-posta gerektirmez —
    // panelde SMTP'ye bağlı "şifre sıfırlama maili" akışı yok.
    async function parolaDegistir(yeniParola) {
        const { error } = await supabase.auth.updateUser({ password: yeniParola });
        if (error) throw error;
    }

    // Token'ı zorla yenileyip güncel rol/şube bilgisini state'e yansıtır.
    // Kullanıcı kendi rol/şubesini değiştirdiğinde anında (yeniden giriş gerekmeden) güncellemek için.
    async function refreshClaims() {
        try {
            const { data, error } = await supabase.auth.refreshSession();
            if (error) throw error;
            oturumuUygula(data.session);
        } catch (err) {
            console.error('Yetkiler yenilenemedi:', err);
        }
    }

    // Effective role: simulatedRole overrides actual role (admin only)
    const effectiveRole = (role === 'admin' && simulatedRole) ? simulatedRole : role;

    /**
     * Yetki kontrolü — shared/permissions.js ile senkron
     * @param {string} permission — Yetki key'i (ör: 'products.toggleAvailability')
     * @returns {boolean}
     */
    function can(permission) {
        if (!effectiveRole) return false;
        return hasPermission(effectiveRole, permission);
    }

    const value = {
        user,
        subeSlug,
        role: effectiveRole,
        realRole: role,
        simulatedRole,
        setSimulatedRole,
        loading,
        login,
        logout,
        parolaDegistir,
        refreshClaims,
        can,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
