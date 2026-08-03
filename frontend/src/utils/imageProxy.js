/**
 * R2 URL'sini backend proxy URL'sine çevir
 * .r2.dev domain'i erişilemez olduğunda görseller backend üzerinden sunulur
 *
 * Örn: https://pub-xxx.r2.dev/urunler/abc.webp
 *   → http://localhost:5001/api/upload/proxy/urunler/abc.webp
 */
import { API_BASE } from '../services/api';

export function proxyImageUrl(url) {
    if (!url) return '';
    // Zaten proxy URL ise dokunma
    if (url.includes('/api/upload/proxy/')) return url;
    // R2 URL'sinden key'i çıkar
    const match = url.match(/r2\.dev\/(.+)$/);
    if (match) {
        return `${API_BASE}/upload/proxy/${match[1]}`;
    }
    // R2 olmayan URL'ler (ör: harici CDN) doğrudan döner
    return url;
}

// Görsel dışındaki R2 dosyaları (PDF, video) için aynı proxy mantığı
export const proxyR2Url = proxyImageUrl;

// Elde tam URL değil yalnızca R2 key'i varsa (ör. menü ayar JSON'undaki
// alerjen PDF anahtarı) proxy URL'ini doğrudan kur.
export function proxyKeyUrl(key) {
    return key ? `${API_BASE}/upload/proxy/${key}` : '';
}
