/**
 * Şube kapsamlı uçların hedef şubesini çözer.
 *
 * Admin istediği şubeye bakar (gövde/sorgu parametresi). Şube sahibi HER ZAMAN
 * kendi şubesine bağlıdır — ama başka bir şube göstermişse bu sessizce kendi
 * şubesine çevrilmez, hata döner: sessiz yönlendirme istemcideki hatayı
 * gizliyordu ("maltepe'ye yaz" diyen çağrı 200 dönüp denizli'yi değiştiriyordu).
 * Parametre hiç yoksa sorun yok, kendi şubesi kullanılır.
 *
 * Ürünler ve akademi aynı kuralı paylaşıyor; kopyalanan sürüm ikisinden birinde
 * gevşetilirse tenant izolasyonu tek taraflı bozulurdu.
 *
 * @returns {{ slug: string|null, hata: string|null }}
 */
export function hedefSube(req, istenenSlug) {
    if (req.user.role === 'admin') return { slug: istenenSlug || null, hata: null };
    if (istenenSlug && istenenSlug !== req.user.subeSlug) {
        return { slug: null, hata: 'Sadece kendi şubenizde işlem yapabilirsiniz' };
    }
    return { slug: req.user.subeSlug || null, hata: null };
}
