import axios from 'axios';
import { supabase } from '../supabase';

// Ortak API tabanı — useReports ve imageProxy de bunu kullanır (tek kaynak;
// env değişkeni/port değişirse yalnızca burası güncellenir)
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const api = axios.create({
    baseURL: API_BASE,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Her istekte Supabase access token'ını Authorization header'a ekle.
// getSession süresi dolmuş token'ı kendisi yeniler.
api.interceptors.request.use(async (config) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
    }
    return config;
});

// Hata yakalama
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            console.warn('Oturum süresi dolmuş veya geçersiz token');
        }
        return Promise.reject(error);
    }
);

export default api;
