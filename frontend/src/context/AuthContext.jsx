import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
} from 'firebase/auth';
import api from '../services/api';
import { hasPermission } from '@shared/permissions.js';

const AuthContext = createContext(null);

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [subeSlug, setSubeSlug] = useState(null);
    const [role, setRole] = useState(null);
    const [simulatedRole, setSimulatedRole] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                setUser(firebaseUser);
                // Custom claims'ten bilgileri al. force=true: rol/şube değişiklikleri
                // en geç sayfa yenilemesinde yansısın (token cache'i ~1 saat eskimesin).
                try {
                    const idTokenResult = await firebaseUser.getIdTokenResult(true);
                    setSubeSlug(idTokenResult.claims.subeSlug || null);
                    setRole(idTokenResult.claims.role || 'sube_sahibi');
                } catch (err) {
                    console.error('Kullanıcı bilgisi alınamadı:', err);
                }
            } else {
                setUser(null);
                setSubeSlug(null);
                setRole(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    async function login(email, password) {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        // Claims'lerin (yetkilerin) güncel olması için token'ı zorla yenile
        await cred.user.getIdToken(true);
        return cred;
    }

    async function logout() {
        setSubeSlug(null);
        setRole(null);
        return signOut(auth);
    }

    // Şifre belirleme/sıfırlama bağlantısı gönderir. E-posta verilmezse giriş
    // yapan kullanıcının kendi adresine gönderir (profil sayfası); admin yeni
    // kullanıcı oluştururken hedef e-postayı parametre olarak geçer.
    async function resetPassword(hedefEmail) {
        const email = hedefEmail || auth.currentUser?.email;
        if (!email) throw new Error('Hesaba ait e-posta bulunamadı');
        await sendPasswordResetEmail(auth, email);
        return email;
    }

    // Token'ı zorla yenileyip güncel rol/şube claims'ini state'e yansıtır.
    // Kullanıcı kendi rol/şubesini değiştirdiğinde anında (yeniden giriş gerekmeden) güncellemek için.
    async function refreshClaims() {
        if (!auth.currentUser) return;
        try {
            const res = await auth.currentUser.getIdTokenResult(true);
            setSubeSlug(res.claims.subeSlug || null);
            setRole(res.claims.role || 'sube_sahibi');
        } catch (err) {
            console.error('Claims yenilenemedi:', err);
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
        resetPassword,
        refreshClaims,
        can,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
