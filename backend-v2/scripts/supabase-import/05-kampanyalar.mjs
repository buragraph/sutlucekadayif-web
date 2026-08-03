// kampanyalar — tek `reports/butce` dokümanındaki `kampanyalar` map'i satırlara açılır.
// `yanitlar` şube-anahtarlı obje; ilk geçişte jsonb olarak taşınır, normalize EDİLMEZ.
import { db, upsert, rapor, uyari, metin, tarih, zaman, dogrudanMi } from './ortak.mjs';

// Kaynakta görülmesi beklenen anahtarlar — dışında bir alan çıkarsa sessizce
// düşmesin diye raporlanır.
const BILINEN = new Set([
    'baslik', 'donem_baslangic', 'donem_bitis', 'durum', 'alici_adi', 'iban',
    'odeme_notu', 'son_tarih', 'bakiye_secenekleri', 'yanitlar', 'createdAt',
]);

export default async function calistir() {
    const doc = await db.collection('reports').doc('butce').get();
    const kampanyalar = doc.data()?.kampanyalar || {};

    const bilinmeyenAlanlar = new Set();
    const satirlar = Object.entries(kampanyalar).map(([id, k]) => {
        for (const alan of Object.keys(k || {})) if (!BILINEN.has(alan)) bilinmeyenAlanlar.add(alan);
        return {
            id,
            baslik: metin(k.baslik ?? null),
            donem_baslangic: tarih(k.donem_baslangic),
            donem_bitis: tarih(k.donem_bitis),
            durum: metin(k.durum ?? null),
            alici_adi: metin(k.alici_adi ?? null),
            iban: metin(k.iban ?? null),
            odeme_notu: metin(k.odeme_notu ?? null),
            son_tarih: tarih(k.son_tarih),
            bakiye_secenekleri: k.bakiye_secenekleri ?? null,
            yanitlar: k.yanitlar ?? null,
            olusturma: zaman(k.createdAt),
        };
    });

    await upsert('kampanyalar', satirlar, 'id');

    if (bilinmeyenAlanlar.size) {
        uyari(`kampanyalar: şemada karşılığı olmayan alan(lar) atlandı → ${[...bilinmeyenAlanlar].join(', ')}`);
    }

    rapor('kampanyalar', {
        'kaynak map girdisi': Object.keys(kampanyalar).length,
        'yazılan satır': satirlar.length,
        'yanıtı olan kampanya': satirlar.filter((s) => s.yanitlar && Object.keys(s.yanitlar).length).length,
        'atlanan bilinmeyen alan': bilinmeyenAlanlar.size ? [...bilinmeyenAlanlar].join(', ') : 0,
    });
    return { yazilan: satirlar.length };
}

if (dogrudanMi(import.meta.url)) await calistir();
