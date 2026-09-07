/**
 * Kapanan şube kuralı tek yerde.
 *
 * Kapanan şube SİLİNMEZ (bkz. 0015_sube_kapanma.sql): `kapanma_tarihi` dolar,
 * geçmişi (dönemler, bütçe, geri bildirim) yerinde kalır. Değişen şey şubenin
 * OPERASYONEL yüzeylerden çekilmesi: menü üretimi, şube seçicileri, Meta/Google
 * çekimi, müşteri formları.
 *
 * AYRIM ÖNEMLİ:
 *   • Operasyonel liste  → `acikSubeler(sorgu)` ile süz.
 *   • Geçmişe dayalı okuma (raporlar, dönem toplamları, akademi ad eşlemesi)
 *     → SÜZME. Kapanan şubenin geçmiş ayları raporda kalmalı; süzülürse geçmiş
 *     ayların merkez toplamları geriye dönük değişir.
 */

import { supabase } from '../config/supabase.js';

/** PostgREST sorgusunu yalnızca açık şubelerle sınırlar. */
export function acikSubeler(sorgu) {
    return sorgu.is('kapanma_tarihi', null);
}

/** Şube satırı kapalı mı? (satır `kapanma_tarihi` içermeli) */
export function subeKapaliMi(satir) {
    return !!satir?.kapanma_tarihi;
}

/**
 * Şube gerçekten silinebilir mi — yoksa kapatılmalı mı?
 *
 * Dönem geçmişi olan şube veritabanı seviyesinde de silinemez (`donemler` FK'sı
 * `restrict`). Bu fonksiyon aynı kuralı ÖNCEDEN, anlaşılır bir mesajla
 * uygular; yoksa kullanıcı ham FK hatası görürdü. Silme yalnızca hiç geçmişi
 * olmayan (yanlışlıkla açılmış) şube için anlamlı.
 *
 * @returns {Promise<{silinebilir: boolean, sebep?: string}>}
 */
export async function subeSilinebilirMi(kod) {
    const [{ count: donem }, { count: kullanici }] = await Promise.all([
        supabase.from('donemler').select('*', { count: 'exact', head: true }).eq('sube_kod', kod),
        supabase.from('kullanici_sube').select('*', { count: 'exact', head: true }).eq('sube_slug', kod),
    ]);
    if (kullanici > 0) {
        return { silinebilir: false, sebep: 'Bu şubeye atanmış kullanıcılar var. Önce kullanıcıları başka şubeye taşıyın.' };
    }
    if (donem > 0) {
        return {
            silinebilir: false,
            sebep: `Bu şubenin ${donem} dönemlik rapor/bütçe geçmişi var; silinirse geçmiş de gider ve önceki ayların merkez toplamları değişir. Şubeyi silmek yerine KAPATIN (kapanma tarihi girin): geçmişi durur, şube listelerden ve menüden çıkar.`,
        };
    }
    return { silinebilir: true };
}
