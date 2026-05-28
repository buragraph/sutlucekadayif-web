import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
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
                // Custom claims'ten bilgileri al (Backend /auth/me isteği iptal edildi)
                try {
                    const idTokenResult = await firebaseUser.getIdTokenResult();
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
        can,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
