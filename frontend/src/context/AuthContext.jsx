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
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                setUser(firebaseUser);
                // Kullanıcı bilgisini backend'den al
                try {
                    const { data } = await api.get('/auth/me');
                    setSubeSlug(data.subeSlug);
                    setRole(data.role);
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
        return signInWithEmailAndPassword(auth, email, password);
    }

    async function logout() {
        setSubeSlug(null);
        setRole(null);
        return signOut(auth);
    }

    /**
     * Yetki kontrolü — shared/permissions.js ile senkron
     * @param {string} permission — Yetki key'i (ör: 'products.toggleAvailability')
     * @returns {boolean}
     */
    function can(permission) {
        if (!role) return false;
        return hasPermission(role, permission);
    }

    const value = {
        user,
        subeSlug,
        role,
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
