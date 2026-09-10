import { supabase } from '../../../config/supabase.js';
import { bugunStr } from './date-utils.js';

/**
 * Yeni açılan şubeyi SÜREN bütçe kampanyalarına ekler.
 *
 * NEDEN GEREKLİ: kampanya açılırken katılımcı şube listesi o anki `subeler`
 * anlık görüntüsünden kopyalanıp `kampanyalar.yanitlar` içine gömülüyor
 * (bkz. budget-routes.js kampanya oluşturma). Canlı bir JOIN olmadığı için
 * sonradan açılan şube kampanyada hiç belirmiyordu; merkez her seferinde
 * "Şube Ekle" düğmesiyle elle dahil etmek zorunda kalıyordu.
 *
 * GEÇMİŞE DOKUNULMUYOR: yalnızca dönemi HENÜZ BİTMEMİŞ kampanyalar
 * güncelleniyor. Kapanmış dönemlere şube eklemek geçmiş raporları ve şube
 * sayılarını değiştirirdi; üstelik şubenin o dönemde gerçekten var olup
 * olmadığını bilemiyoruz (`subeler` tablosunda açılış tarihi kolonu yok,
 * yalnızca panele eklenme zamanı var).
 *
 * DURUM ALANINA BAKILMIYOR: `kampanyalar.durum` sahada hep 'aktif' kalıyor,
 * kampanyalar kapatılmıyor. Süren/bitmiş ayrımı bu yüzden `donem_bitis`
 * üzerinden yapılıyor. `son_tarih` de ölçüt değil: elle ekleme düğmesi son
 * tarih geçtikten sonra da çalışıyor, otomatiğin daha katı olması tuhaf olurdu.
 *
 * MEVCUT YANIT EZİLMİYOR: `kampanya_yanit_yaz` RPC'si yamayı mevcut nesneyle
 * birleştiriyor (`v_mevcut || p_yama`), yani boş yanıt yazmak dolu bir yanıtı
 * sıfırlardı. Bu yüzden yalnızca haritada anahtarı OLMAYAN kampanyalara
 * yazılıyor.
 *
 * ÇAĞIRAN AKIŞI DURDURMAZ: şube oluşturma bu yüzden başarısız olmamalı.
 * Hata yalnızca loglanır; en kötü ihtimalle merkez "Şube Ekle" ile elle ekler.
 *
 * @param {string} subeKod
 * @returns {Promise<string[]>} şubenin eklendiği kampanya kimlikleri
 */
export async function acikKampanyalaraEkle(subeKod) {
    if (!subeKod) return [];
    try {
        const bugun = bugunStr();
        const { data, error } = await supabase
            .from('kampanyalar')
            .select('id, yanitlar')
            .gte('donem_bitis', bugun);
        if (error) throw new Error(error.message);

        const eklenen = [];
        for (const kampanya of data || []) {
            if (kampanya.yanitlar?.[subeKod]) continue;   // zaten var — dokunma
            const { error: yazmaHatasi } = await supabase.rpc('kampanya_yanit_yaz', {
                p_id: kampanya.id,
                p_sube: subeKod,
                p_yama: {
                    durum: 'bekliyor',
                    secilen_bakiye: null,
                    kdv_dahil_tutar: null,
                    notlar: null,
                    dekont_url: null,
                    gonderim_tarihi: null,
                    gonderen_uid: null,
                    gonderen_ad: null,
                },
                p_beklenen_durum: null,
            });
            if (yazmaHatasi) throw new Error(yazmaHatasi.message);
            eklenen.push(kampanya.id);
        }
        if (eklenen.length > 0) {
            console.log(`[Butce] ${subeKod} süren kampanyalara eklendi: ${eklenen.join(', ')}`);
        }
        return eklenen;
    } catch (err) {
        console.error(`[Butce] ${subeKod} kampanyalara eklenemedi:`, err.message);
        return [];
    }
}
