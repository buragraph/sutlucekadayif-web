import { supabase } from '../../config/supabase.js';

/**
 * WordPress'ten devralınan ilerlemeyi yeni açılan kullanıcıya bağlar.
 *
 * NEDEN: WP kapatılırken 180 e-postanın ilerlemesi taşındı ama bunların
 * çoğunun (çalışanlar) bizde hesabı yoktu; kayıtlar `ilerleme_devir`de
 * e-posta anahtarıyla bekliyor (bkz. 0011_ilerleme_devir.sql). Hesap hangi
 * yoldan açılırsa açılsın burası çağrılır ve kişi ilk girişinde geçmişini
 * hazır bulur.
 *
 * SESSİZ ÇALIŞIR: devir başarısız olsa bile kullanıcı oluşturma AKMAMALI —
 * hesap açmak asıl iş, ilerleme devri ikincil. Hata loglanır, atılmaz.
 *
 * @returns {Promise<number>} ilerleme'ye taşınan satır sayısı
 */
export async function ilerlemeDevral(uid, email) {
    const eposta = String(email ?? '').trim().toLowerCase();
    if (!uid || !eposta) return 0;
    try {
        const { data: bekleyen, error } = await supabase
            .from('ilerleme_devir').select('*').eq('eposta', eposta);
        if (error) throw new Error(error.message);
        if (!bekleyen?.length) return 0;

        // Kullanıcı arada kendi ilerlemesini yapmış olabilir: onu ezme.
        const { error: yazHata } = await supabase.from('ilerleme').upsert(
            bekleyen.map((s) => ({
                uid, ders_id: s.ders_id, kurs_id: s.kurs_id,
                score: s.score, completed_at: s.completed_at, kaynak: s.kaynak,
            })),
            { onConflict: 'uid,ders_id', ignoreDuplicates: true }
        );
        if (yazHata) throw new Error(yazHata.message);

        // Ancak yazıldıktan SONRA sil — arada patlarsa kayıt bekleme listesinde kalsın.
        const { error: silHata } = await supabase
            .from('ilerleme_devir').delete().eq('eposta', eposta);
        if (silHata) throw new Error(silHata.message);

        console.log(`📚 ${eposta}: WordPress'ten ${bekleyen.length} ders ilerlemesi devralındı`);
        return bekleyen.length;
    } catch (err) {
        console.error(`⚠️  ilerleme devri başarısız (${eposta}): ${err.message}`);
        return 0;
    }
}
