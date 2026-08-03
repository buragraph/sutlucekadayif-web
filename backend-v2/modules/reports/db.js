import { supabase } from '../../config/supabase.js';
import { veriYaDaHata, isoZ, tumSatirlar } from '../../utils/veri.js';

// ═══════════════════════════════════════════════════
// ── Rapor veri katmanı ──
// ═══════════════════════════════════════════════════
//
// ÖLEN KAVRAMLAR (Firestore'a özgüydüler):
//  • getDataVersion/bumpDataVersion — cross-instance cache doğrulaması. Postgres'te
//    okuma ucuz; sıcak uçlarda düz TTL cache yeter.
//  • applyDonemWrite + recalcSubeAggregates + donem_ozetleri denormalizasyonu —
//    aggregate'ler artık sorguyla türetiliyor (subeOzetleri).
//  • veri_overrides — bütçe alanları kendi kolonlarında; çekim uçları metrik
//    kolonlarına, bütçe uçları bütçe kolonlarına yazar. "Donmuş override" yapısal
//    olarak imkânsız.
//
// TARİH KOLONLARI: `baslangic`/`bitis` SALT TARİH (date). PostgREST bunları
// 'YYYY-MM-DD' olarak döndürür — eski sözleşmeyle aynı. isoZ YALNIZCA
// timestamptz kolonlarına (guncelleme) uygulanır.

const METRIK_KOLONLARI = [
    'harcama', 'erisim', 'gosterim', 'tiklama', 'tiklama_tumu',
    'mesaj', 'paylasim', 'sonuc', 'yorum',
    'google_arama', 'google_harita', 'google_menu_tiklama',
    'google_telefon', 'google_web_tiklama', 'google_yol_tarifi',
];
const BUTCE_KOLONLARI = ['planlanan_butce', 'devredilen_miktar', 'merkez_destegi'];

const sayi = (v) => (v === null || v === undefined ? null : Number(v));

/** donemler satırı → eski dönem dokümanı şekli (veri_overrides HARİÇ — o öldü). */
export function donemVerisi(satir) {
    if (!satir) return null;
    const cikti = {
        donem_baslangic: satir.baslangic,
        donem_bitis: satir.bitis,
        updatedAt: isoZ(satir.guncelleme),
    };
    for (const k of [...METRIK_KOLONLARI, ...BUTCE_KOLONLARI]) {
        if (satir[k] !== null && satir[k] !== undefined) cikti[k] = Number(satir[k]);
    }
    return cikti;
}

/**
 * Dönem satırlarından şube özetlerini üretir — eski `donem_ozetleri` dizisi ve
 * `toplam_*` aggregate'lerinin birebir karşılığı (baslangic'e göre desc).
 */
function subeOzetleri(donemSatirlari) {
    let toplam_harcama = 0, toplam_erisim = 0, toplam_gosterim = 0, toplam_sonuc = 0, toplam_tiklama = 0;
    const donem_ozetleri = [];

    const sirali = [...donemSatirlari].sort((a, b) => (a.baslangic < b.baslangic ? 1 : a.baslangic > b.baslangic ? -1 : 0));
    for (const d of sirali) {
        toplam_harcama += Number(d.harcama) || 0;
        toplam_erisim += Number(d.erisim) || 0;
        toplam_gosterim += Number(d.gosterim) || 0;
        toplam_sonuc += Number(d.sonuc) || 0;
        toplam_tiklama += Number(d.tiklama) || 0;

        donem_ozetleri.push({
            baslangic: d.baslangic,
            bitis: d.bitis,
            // Eski kural: alan VARSA işaret koy. Postgres'te "alan yok" = null.
            meta: d.harcama !== null && d.harcama !== undefined ? { harcama: 1 } : null,
            google: d.google_arama !== null && d.google_arama !== undefined ? { gorunurluk: 1 } : null,
            planlanan_butce: Number(d.planlanan_butce) || 0,
            devredilen_miktar: Number(d.devredilen_miktar) || 0,
            merkez_destegi: Number(d.merkez_destegi) || 0,
            harcama: Number(d.harcama) || 0,
            updatedAt: isoZ(d.guncelleme) || null,
        });
    }

    return {
        toplam_harcama, toplam_erisim, toplam_gosterim, toplam_sonuc, toplam_tiklama,
        donem_sayisi: sirali.length,
        son_donem: sirali.length > 0 ? `${sirali[0].baslangic}_${sirali[0].bitis}` : null,
        donem_ozetleri,
    };
}

/**
 * subeler satırı + dönemleri → eski şube dokümanı şekli.
 *
 * ŞEKİL NOTU: Firestore'da alan YOKSA yanıtta da yoktu; alan BOŞ STRING ise
 * vardı. Import bu ayrımı korudu (yok → null, '' → ''), o yüzden burada
 * yalnızca null kırpılır. '' kırpılırsa onboarding'i yarım kalmış şubelerin
 * `vkn: ""` gibi alanları yanıttan düşer ve ekran/parite fark verir.
 * `ad`/`adres`/`telefon` her şubede dolu olduğundan her zaman yazılır.
 */
const OPSIYONEL_SUBE_ALANLARI = ['link', 'il', 'ilce', 'lat', 'lng', 'yetkili_adi', 'fatura_adresi', 'vkn', 'sirket_tipi'];

function subeNesnesi(satir, donemSatirlari) {
    const nesne = {
        id: satir.kod,
        kod: satir.kod,
        ad: satir.ad,
        adres: satir.adres ?? '',
        telefon: satir.telefon ?? '',
    };
    for (const alan of OPSIYONEL_SUBE_ALANLARI) {
        const deger = alan === 'lat' || alan === 'lng' ? sayi(satir[alan]) : satir[alan];
        if (deger === null || deger === undefined) continue;
        nesne[alan] = deger;
    }
    return { ...nesne, ...subeOzetleri(donemSatirlari) };
}

// ═══════════════════════════════════════════════════
// ── Şube CRUD ──
// ═══════════════════════════════════════════════════

export async function upsertSube(kod, ad, adres = null, link = null) {
    const data = { ad, adres: adres || '', link: link || '' };
    veriYaDaHata(
        await supabase.from('subeler').upsert({ kod, ...data }, { onConflict: 'kod' }),
        'şube yazılamadı'
    );
    return { id: kod, kod, ...data };
}

export async function getSubeByKod(kod) {
    const [{ data: satir }, donemler] = await Promise.all([
        supabase.from('subeler').select('*').eq('kod', kod).maybeSingle(),
        supabase.from('donemler').select('*').eq('sube_kod', kod).range(0, 9999)
            .then((r) => veriYaDaHata(r, 'dönemler okunamadı')),
    ]);
    if (!satir) return null;
    return subeNesnesi(satir, donemler);
}

export async function getAllSubeler() {
    // Tüm şubeler + tüm dönemler: 2 sorgu (Firestore'da 88 + 88×N okumaydı)
    const [satirlar, donemler] = await Promise.all([
        supabase.from('subeler').select('*').order('ad').range(0, 9999)
            .then((r) => veriYaDaHata(r, 'şubeler okunamadı')),
        tumSatirlar(() => supabase.from('donemler').select('*'),
            { sirala: ['sube_kod', 'baslangic'], baglam: 'dönemler' }),
    ]);
    const byShube = new Map();
    for (const d of donemler) {
        if (!byShube.has(d.sube_kod)) byShube.set(d.sube_kod, []);
        byShube.get(d.sube_kod).push(d);
    }
    return satirlar.map((s) => subeNesnesi(s, byShube.get(s.kod) || []));
}

export async function updateSube(kod, ad, adres, link) {
    const data = {};
    if (ad !== undefined) data.ad = ad;
    if (adres !== undefined) data.adres = adres;
    if (link !== undefined) data.link = link;
    if (Object.keys(data).length > 0) {
        veriYaDaHata(await supabase.from('subeler').update(data).eq('kod', kod), 'şube güncellenemedi');
    }
    return { id: kod, kod, ...data };
}

export async function deleteSube(kod) {
    const { data: mevcut } = await supabase.from('subeler').select('kod').eq('kod', kod).maybeSingle();
    if (!mevcut) return false;
    // donemler + sube_notlari FK cascade ile gider (Firestore'da recursiveDelete gerekiyordu)
    veriYaDaHata(await supabase.from('subeler').delete().eq('kod', kod), 'şube silinemedi');
    return true;
}

// ── Şube notu (yalnızca yönetici) ──
// AYRI TABLODA: /sube/:kod ve /dashboard-bundle şube nesnesini olduğu gibi yayıyor
// ve bu uçlara şube sahibi de erişiyor. Not şube satırında dursa sızardı.

const NOT_LIMIT = 5000;

export async function getSubeNot(kod) {
    const { data } = await supabase.from('sube_notlari').select('*').eq('sube_kod', kod).maybeSingle();
    if (!data) return { not: '', guncelleyen: null, guncellemeZamani: null };
    return {
        not: data.notu || '',
        guncelleyen: data.guncelleyen || null,
        guncellemeZamani: isoZ(data.guncelleme) || null,
    };
}

export async function saveSubeNot(kod, not, guncelleyen) {
    const temiz = String(not ?? '').trim().slice(0, NOT_LIMIT);
    const zaman = new Date().toISOString();
    veriYaDaHata(
        await supabase.from('sube_notlari').upsert(
            { sube_kod: kod, notu: temiz, guncelleyen: guncelleyen || null, guncelleme: zaman },
            { onConflict: 'sube_kod' }
        ),
        'not kaydedilemedi'
    );
    return { not: temiz, guncelleyen: guncelleyen || null, guncellemeZamani: zaman };
}

export async function deleteSubeNot(kod) {
    veriYaDaHata(await supabase.from('sube_notlari').delete().eq('sube_kod', kod), 'not silinemedi');
}

// ═══════════════════════════════════════════════════
// ── Dönem yazımı ──
// ═══════════════════════════════════════════════════
//
// applyDonemWrite'ın yerine geçen TEK yazma yolu. Firestore sürümünden farkı:
// aggregate/özet dizisi güncellemesi YOK (view/sorgu türetiyor) ve yalnızca
// verilen kolonlara dokunulur — çekim bütçeyi, bütçe girişi metriği ezemez.

async function donemYaz(subeKod, baslangic, bitis, alanlar) {
    veriYaDaHata(
        await supabase.from('donemler').upsert(
            { sube_kod: subeKod, baslangic, bitis, ...alanlar, guncelleme: new Date().toISOString() },
            { onConflict: 'sube_kod,baslangic,bitis' }
        ),
        'dönem yazılamadı'
    );
}

/** Meta toplamlarını yazar — YALNIZCA meta metrik kolonları. */
export async function upsertMetaToplanlar(subeKod, donemBaslangic, donemBitis, toplamlar) {
    await donemYaz(subeKod, donemBaslangic, donemBitis, {
        harcama: toplamlar.harcama || 0,
        erisim: toplamlar.erisim || 0,
        gosterim: toplamlar.gosterim || 0,
        sonuc: toplamlar.sonuc || 0,
        tiklama: toplamlar.tiklama || 0,
        tiklama_tumu: toplamlar.tiklama_tumu || 0,
        mesaj: toplamlar.mesaj || 0,
        yorum: toplamlar.yorum || 0,
        paylasim: toplamlar.paylasim || 0,
    });
}

/** Google toplamlarını yazar — YALNIZCA google metrik kolonları. */
export async function upsertGoogleToplanlar(subeKod, donemBaslangic, donemBitis, toplamlar) {
    await donemYaz(subeKod, donemBaslangic, donemBitis, {
        google_arama: toplamlar.google_arama || 0,
        google_harita: toplamlar.google_harita || 0,
        google_telefon: toplamlar.google_telefon || 0,
        google_yol_tarifi: toplamlar.google_yol_tarifi || 0,
        google_web_tiklama: toplamlar.google_web_tiklama || 0,
        google_menu_tiklama: toplamlar.google_menu_tiklama || 0,
    });
}

/** Bütçe verilerini yazar — YALNIZCA bütçe kolonları. */
export async function upsertButce(subeKod, donemBaslangic, donemBitis, planlananButce, devredilenMiktar = 0, merkezDestegi = 0) {
    await donemYaz(subeKod, donemBaslangic, donemBitis, {
        planlanan_butce: planlananButce,
        devredilen_miktar: devredilenMiktar,
        merkez_destegi: merkezDestegi,
    });
}

/** Kampanya seviyesinde tekil erişim — yalnızca erisim kolonu. */
export async function upsertToplamErisim(subeKod, donemBaslangic, donemBitis, toplamErisim) {
    await donemYaz(subeKod, donemBaslangic, donemBitis, { erisim: toplamErisim });
}

// Bütçe override doğrulaması — eski kurallar aynen.
const BUTCE_OVERRIDE_ALANLARI = ['planlananButce', 'devredilenMiktar', 'merkezDestegi'];
// devredilenMiktar önceki dönemden devreden EKSİ bakiye olabilir → negatif meşru.
const OVERRIDE_NEGATIF_IZINLI = new Set(['devredilenMiktar']);
const OVERRIDE_TAVAN = 10_000_000;
const OVERRIDE_KOLONU = {
    planlananButce: 'planlanan_butce',
    devredilenMiktar: 'devredilen_miktar',
    merkezDestegi: 'merkez_destegi',
};

/**
 * Bütçe override'larını yazar.
 *
 * Eskiden ayrı bir `veri_overrides` haritasına yazılıyordu; artık doğrudan bütçe
 * KOLONLARINA yazılır — "override" ile "gerçek değer" ayrımı ortadan kalktı,
 * çünkü metrikler zaten ayrı kolonlarda ve çekim onlara dokunmuyor.
 * Eski semantik korunur: gönderilmeyen bütçe alanı NULL'a çekilir (tam değişim).
 */
export async function updateOverrides(subeKod, donemBaslangic, donemBitis, overrides, { donemVar = null } = {}) {
    for (const alan of BUTCE_OVERRIDE_ALANLARI) {
        if (overrides && overrides[alan] !== undefined) {
            const n = Number(overrides[alan]);
            const altSinir = OVERRIDE_NEGATIF_IZINLI.has(alan) ? -OVERRIDE_TAVAN : 0;
            if (!Number.isFinite(n) || n < altSinir || n > OVERRIDE_TAVAN) {
                const err = new Error(`Geçersiz override tutarı: ${alan}`);
                err.status = 400;
                throw err;
            }
            overrides[alan] = n; // string/gevşek tip geldiyse normalize et
        }
    }

    const mevcutVar = donemVar !== null
        ? donemVar
        : !!(await getDonemVeri(subeKod, donemBaslangic, donemBitis));

    // Var olmayan dönemde saklanacak override da yoksa hiç yazma
    if (!mevcutVar && (!overrides || Object.keys(overrides).length === 0)) return;

    const alanlar = {};
    for (const alan of BUTCE_OVERRIDE_ALANLARI) {
        alanlar[OVERRIDE_KOLONU[alan]] = overrides?.[alan] !== undefined ? overrides[alan] : null;
    }
    await donemYaz(subeKod, donemBaslangic, donemBitis, alanlar);
}

// ═══════════════════════════════════════════════════
// ── Dönem okuma ──
// ═══════════════════════════════════════════════════

export async function getDonemVeri(subeKod, donemBaslangic, donemBitis) {
    const { data } = await supabase.from('donemler').select('*')
        .eq('sube_kod', subeKod).eq('baslangic', donemBaslangic).eq('bitis', donemBitis).maybeSingle();
    return donemVerisi(data);
}

/** Birden çok şubenin aynı dönemi — tek sorguda (kod → veri | null). */
export async function getDonemVeriMap(subeKodlari, donemBaslangic, donemBitis) {
    if (!subeKodlari || subeKodlari.length === 0) return {};
    const satirlar = veriYaDaHata(
        await supabase.from('donemler').select('*')
            .in('sube_kod', subeKodlari).eq('baslangic', donemBaslangic).eq('bitis', donemBitis)
            .range(0, 9999),
        'dönemler okunamadı'
    );
    const sonuc = Object.fromEntries(subeKodlari.map((k) => [k, null]));
    for (const s of satirlar) sonuc[s.sube_kod] = donemVerisi(s);
    return sonuc;
}

/** Önceki dönem verisi (karşılaştırma için). */
export async function getOncekiDonem(subeKod, donemBaslangic) {
    const satirlar = veriYaDaHata(
        await supabase.from('donemler').select('*')
            .eq('sube_kod', subeKod).lte('bitis', donemBaslangic)
            .order('bitis', { ascending: false }).limit(1),
        'önceki dönem okunamadı'
    );
    return satirlar.length > 0 ? donemVerisi(satirlar[0]) : null;
}

export async function deleteDonem(subeKod, donemBaslangic, donemBitis) {
    veriYaDaHata(
        await supabase.from('donemler').delete()
            .eq('sube_kod', subeKod).eq('baslangic', donemBaslangic).eq('bitis', donemBitis),
        'dönem silinemedi'
    );
    return true;
}

// ═══════════════════════════════════════════════════
// ── Ayarlar & eşleşmeler ──
// ═══════════════════════════════════════════════════

// API uyumluluğu için stub'lar (eski db katmanında da stub'dı)
export async function getDb() { return true; }
export async function closeDb() { return true; }

async function ayarOku(anahtar, varsayilan) {
    const { data } = await supabase.from('ayarlar').select('deger').eq('anahtar', anahtar).maybeSingle();
    return data?.deger ?? varsayilan;
}

async function ayarYaz(anahtar, deger, { merge = true } = {}) {
    const mevcut = merge ? await ayarOku(anahtar, {}) : {};
    veriYaDaHata(
        await supabase.from('ayarlar').upsert(
            { anahtar, deger: { ...mevcut, ...deger }, guncelleme: new Date().toISOString() },
            { onConflict: 'anahtar' }
        ),
        `${anahtar} yazılamadı`
    );
}

export async function getSettings() { return ayarOku('settings', {}); }
export async function saveSettings(data) { await ayarYaz('settings', data, { merge: true }); }

// ── Google Token ──
export async function getGoogleToken() { return ayarOku('google_token', null); }
export async function saveGoogleToken(token) { await ayarYaz('google_token', token, { merge: false }); }

// ── Eşleşmeler (tek tablo, tur ile ayrılır) ──
async function eslesmeOku(tur) {
    const satirlar = await tumSatirlar(
        () => supabase.from('eslesmeler').select('anahtar, deger').eq('tur', tur),
        { sirala: 'anahtar', baglam: `${tur} eşleşmeleri` }
    );
    return Object.fromEntries(satirlar.map((s) => [s.anahtar, s.deger]));
}

/** Tam yerine yazma: gelen sette olmayan anahtarlar SİLİNİR. */
async function eslesmeYazTam(tur, mappings) {
    const yeni = mappings || {};
    const mevcut = await eslesmeOku(tur);
    const silinecek = Object.keys(mevcut).filter((k) => yeni[k] === undefined);
    if (silinecek.length > 0) {
        veriYaDaHata(
            await supabase.from('eslesmeler').delete().eq('tur', tur).in('anahtar', silinecek),
            `${tur} eşleşmeleri silinemedi`
        );
    }
    const satirlar = Object.entries(yeni)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([anahtar, deger]) => ({ tur, anahtar, deger }));
    if (satirlar.length > 0) {
        veriYaDaHata(
            await supabase.from('eslesmeler').upsert(satirlar, { onConflict: 'tur,anahtar' }),
            `${tur} eşleşmeleri yazılamadı`
        );
    }
}

/**
 * Merge + null-silme: gelen eşleştirmeler mevcutların ÜZERİNE yazılır, null değer
 * o eşleştirmeyi siler. Tam yerine yazma, modalın tarih aralığı dışında kalan
 * eski eşleştirmeleri sessizce kaybettiriyordu.
 */
async function eslesmeYazMerge(tur, mappings) {
    const girdiler = Object.entries(mappings || {});
    if (girdiler.length === 0) return;
    const silinecek = girdiler.filter(([, v]) => v === null).map(([k]) => k);
    const yazilacak = girdiler.filter(([, v]) => v !== null)
        .map(([anahtar, deger]) => ({ tur, anahtar, deger }));
    if (silinecek.length > 0) {
        veriYaDaHata(
            await supabase.from('eslesmeler').delete().eq('tur', tur).in('anahtar', silinecek),
            `${tur} eşleşmeleri silinemedi`
        );
    }
    if (yazilacak.length > 0) {
        veriYaDaHata(
            await supabase.from('eslesmeler').upsert(yazilacak, { onConflict: 'tur,anahtar' }),
            `${tur} eşleşmeleri yazılamadı`
        );
    }
}

export async function getGoogleMappings() { return eslesmeOku('google'); }
export async function saveGoogleMappings(mappings) { await eslesmeYazTam('google', mappings); }

export async function getMetaMappings() { return eslesmeOku('meta'); }
export async function saveMetaMappings(mappings) { await eslesmeYazTam('meta', mappings); }

export async function getCampaignMappings() { return eslesmeOku('campaign'); }
export async function saveCampaignMappings(mappings) { await eslesmeYazMerge('campaign', mappings); }

export async function getAdsetMappings() { return eslesmeOku('adset'); }
export async function saveAdsetMappings(mappings) { await eslesmeYazMerge('adset', mappings); }

// ── Meta Adset Cache ──
// TAŞINMADI: Firestore'da adset listesini saklamak Meta API çağrısını değil
// OKUMA maliyetini kısmak içindi. v2'de cache yok — fetchAdsets her seferinde
// Meta'ya sorar (forceRefresh davranışının varsayılanı).
export async function getAdsetsCache() { return null; }
export async function saveAdsetsCache() { /* no-op */ }
