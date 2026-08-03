import crypto from 'node:crypto';

const ALFABE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Firestore biçiminde 20 karakterlik rastgele id üretir.
 * Postgres tarafında `id text primary key` kolonlarının varsayılanı yok — eskiden
 * id'yi Firestore veriyordu. Aynı biçimi korumak önemli: id'ler R2 dosya adlarında,
 * URL'lerde ve frontend state'inde geçiyor.
 */
export function yeniId() {
    const bayt = crypto.randomBytes(20);
    let id = '';
    for (let i = 0; i < 20; i++) id += ALFABE[bayt[i] % ALFABE.length];
    return id;
}

/**
 * null/undefined değerli anahtarları atar.
 * Firestore'da "alan yok" ile "alan null" farklıydı ve yanıtta anahtar hiç
 * görünmüyordu; Postgres her kolonu döndürdüğü için yanıt şeklini korumak
 * adına boş kolonları kırpıyoruz (parite).
 */
export function temizNull(nesne) {
    const cikti = {};
    for (const [k, v] of Object.entries(nesne)) {
        if (v !== null && v !== undefined) cikti[k] = v;
    }
    return cikti;
}

/**
 * timestamptz → eski API'deki ISO biçimi ("2026-07-15T10:22:30.127Z").
 *
 * PostgREST "+00:00" ofsetiyle ve milisaniyeyi kırparak döndürüyor
 * ("…:07.54+00:00"); Firestore tarafında değerler `new Date().toISOString()`
 * ile yazıldığı için hep Z'li ve 3 haneliydi. Aynı an, farklı yazım — ama
 * yanıt gövdesi bire bir aynı kalsın diye normalize ediyoruz.
 */
export function isoZ(v) {
    if (v === null || v === undefined || v === '') return v ?? null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toISOString();
}

/**
 * TÜM satırları getirir — PostgREST'in satır tavanını sayfalayarak aşar.
 *
 * DİKKAT: Supabase REST katmanı yanıtı 1000 satırda KESER ve bunu hata olarak
 * bildirmez; `.range(0, 99999)` yazmak da işe yaramaz. Tavanı aşabilecek her
 * toplu okuma bu yardımcıdan geçmeli — aksi halde veri sessizce eksik gelir
 * (ör. 5.470 satırlık urun_sube'de ürünlerin bir kısmı şubesiz görünür).
 *
 * Sayfalama deterministik olsun diye sıralama ZORUNLU: aynı satır iki sayfada
 * çıkmasın / atlanmasın.
 *
 * @param {() => object} sorguKur - her sayfada yeniden kurulan sorgu
 * @param {{sirala: string|string[], sayfa?: number, baglam?: string}} secenekler
 */
export async function tumSatirlar(sorguKur, { sirala, sayfa = 1000, baglam = 'satırlar' } = {}) {
    if (!sirala) throw new Error(`${baglam}: tumSatirlar için 'sirala' zorunlu (deterministik sayfalama)`);
    const kolonlar = Array.isArray(sirala) ? sirala : [sirala];
    const hepsi = [];
    for (let offset = 0; ; offset += sayfa) {
        let sorgu = sorguKur();
        for (const k of kolonlar) sorgu = sorgu.order(k, { ascending: true });
        const { data, error } = await sorgu.range(offset, offset + sayfa - 1);
        if (error) throw new Error(`${baglam}: ${error.message}`);
        hepsi.push(...data);
        if (data.length < sayfa) break;
    }
    return hepsi;
}

/** Supabase yanıtı: hata varsa fırlat, yoksa data döndür. */
export function veriYaDaHata(sonuc, baglam) {
    if (sonuc.error) {
        const hata = new Error(`${baglam}: ${sonuc.error.message}`);
        hata.status = 500;
        throw hata;
    }
    return sonuc.data;
}
