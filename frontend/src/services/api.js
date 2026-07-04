import axios from 'axios';
import { auth } from '../firebase';

// Ortak API tabanı — useReports ve imageProxy de bunu kullanır (tek kaynak;
// env değişkeni/port değişirse yalnızca burası güncellenir)
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const api = axios.create({
    baseURL: API_BASE,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Her istekte Firebase ID Token'ını Authorization header'a ekle
api.interceptors.request.use(async (config) => {
    const user = auth.currentUser;
    if (user) {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
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
