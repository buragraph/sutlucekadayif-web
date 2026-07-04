import { db } from '../../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

// ═══════════════════════════════════════════════════
// ── Veri Versiyonu (cross-instance cache doğrulama) ──
// ═══════════════════════════════════════════════════
// Cloud Run'da her instance'ın kendi in-memory cache'i var. Cache'in bayat olup
// olmadığı Firestore'daki tek bir versiyon dokümanıyla (1 read) doğrulanır:
// her veri yazımı versiyonu artırır, cache yalnızca versiyon eşleşirse servis edilir.

const VERSION_REF = db.collection('reports').doc('meta');

export async function getDataVersion() {
  const doc = await VERSION_REF.get();
  return doc.exists ? (doc.data().v || 0) : 0;
}

export async function bumpDataVersion() {
  try {
    await VERSION_REF.set({ v: FieldValue.increment(1) }, { merge: true });
  } catch (err) {
    console.error('[db] Versiyon artırılamadı:', err.message);
  }
}

// ═══════════════════════════════════════════════════
// ── Şube CRUD (subeler collection) ──
// ═══════════════════════════════════════════════════

export async function upsertSube(kod, ad, adres = null, link = null) {
  const docRef = db.collection('subeler').doc(kod);
  const data = { ad, adres: adres || '', link: link || '' };
  await docRef.set(data, { merge: true });
  await bumpDataVersion();
  return { id: kod, kod, ...data };
}

export async function getSubeByKod(kod) {
  const doc = await db.collection('subeler').doc(kod).get();
  if (!doc.exists) return null;
  return { id: kod, kod, ...doc.data() };
}

export async function getAllSubeler() {
  const snap = await db.collection('subeler').orderBy('ad').get();
  const arr = [];
  snap.forEach(d => arr.push({ id: d.id, kod: d.id, ...d.data() }));
  return arr;
}

export async function updateSube(kod, ad, adres, link) {
  const docRef = db.collection('subeler').doc(kod);
  const data = { ad };
  if (adres !== undefined) data.adres = adres;
  if (link !== undefined) data.link = link;
  await docRef.update(data);
  await bumpDataVersion();
  return { id: kod, kod, ...data };
}

export async function deleteSube(kod) {
  const docRef = db.collection('subeler').doc(kod);
  const doc = await docRef.get();
  if (!doc.exists) return false;

  // Alt koleksiyonları sil (donemler)
  await db.recursiveDelete(docRef.collection('donemler'));

  await docRef.delete();
  await bumpDataVersion();
  return true;
}


// ═══════════════════════════════════════════════════
// ── Dönem CRUD (subeler/{kod}/donemler subcollection) ──
// ═══════════════════════════════════════════════════

function donemDocId(baslangic, bitis) {
  return `${baslangic}_${bitis}`;
}

// toplam_* aggregate'lerini besleyen meta alanları (google/bütçe alanları toplamı etkilemez)
const TOPLAM_KEYS = ['harcama', 'erisim', 'gosterim', 'sonuc', 'tiklama'];

/**
 * Bir dönem dokümanına alanları yazar VE şube aggregate'lerini DELTA ile günceller.
 *
 * recalcSubeAggregates'in aksine şubenin TÜM dönemlerini OKUMAZ — sabit ~2 read
 * (dönem dokümanı + şube dokümanı), dönem sayısından bağımsız. 200 şube × 200 dönem
 * ölçeğinde kritik fark: recalc O(dönem), bu O(1).
 *
 * - toplam_* yalnızca TOPLAM_KEYS'ten (meta) beslenir; google/bütçe yalnızca özet işaretini günceller.
 * - Read-modify-write transaction içinde: eşzamanlı yazmalarda dizi güncellemesi kaybolmaz.
 * - Eski format şube (donem_ozetleri dizisi yok) tespit edilirse tek seferlik tam recalc'a
 *   düşer (migration); sonraki yazımlar delta ile ilerler.
 *
 * @param {object} fields - Dönem dokümanına merge edilecek alanlar
 * @param {object} [opts]
 * @param {boolean} [opts.skipBump] - Versiyon artışını çağırana bırak (batch'te sonda 1 kez)
 */
async function applyDonemWrite(subeKod, donemBaslangic, donemBitis, fields, { skipBump = false } = {}) {
  const subeRef = db.collection('subeler').doc(subeKod);
  const donemRef = subeRef.collection('donemler').doc(donemDocId(donemBaslangic, donemBitis));
  const now = new Date().toISOString();
  const donemFields = { donem_baslangic: donemBaslangic, donem_bitis: donemBitis, ...fields, updatedAt: now };

  const needsRecalc = await db.runTransaction(async (tx) => {
    // Tüm okumalar yazımlardan önce (Firestore transaction kuralı)
    const subeSnap = await tx.get(subeRef);
    const donemSnap = await tx.get(donemRef);

    const ozetler = subeSnap.exists ? subeSnap.data().donem_ozetleri : undefined;

    // Dönem dokümanını her durumda yaz
    tx.set(donemRef, donemFields, { merge: true });

    // Eski format / yeni şube (özet dizisi yok) → delta güvenli değil, tam recalc gerek
    if (!Array.isArray(ozetler)) return true;

    const old = donemSnap.exists ? donemSnap.data() : {};
    const isNew = !donemSnap.exists;
    const merged = { ...old, ...fields };

    const subeUpdate = {};
    // toplam_* delta — yalnızca değişen meta alanları
    for (const k of TOPLAM_KEYS) {
      const delta = (Number(merged[k]) || 0) - (Number(old[k]) || 0);
      if (delta !== 0) subeUpdate[`toplam_${k}`] = FieldValue.increment(delta);
    }

    // donem_ozetleri girişi (recalcSubeAggregates ile birebir aynı şekil)
    const ozetEntry = {
      baslangic: donemBaslangic,
      bitis: donemBitis,
      meta: merged.harcama !== undefined ? { harcama: 1 } : null,
      google: merged.google_arama !== undefined ? { gorunurluk: 1 } : null,
      planlanan_butce: merged.planlanan_butce || 0,
      devredilen_miktar: merged.devredilen_miktar || 0,
      merkez_destegi: merged.merkez_destegi || 0,
      harcama: merged.harcama || 0,
      updatedAt: now,
    };
    const idx = ozetler.findIndex(o => o.baslangic === donemBaslangic && o.bitis === donemBitis);
    if (idx >= 0) ozetler[idx] = ozetEntry;
    else ozetler.push(ozetEntry);
    // donem_baslangic desc — recalc çıktısıyla aynı sıralama
    ozetler.sort((a, b) => (a.baslangic < b.baslangic ? 1 : a.baslangic > b.baslangic ? -1 : 0));
    subeUpdate.donem_ozetleri = ozetler;

    if (isNew) {
      subeUpdate.donem_sayisi = FieldValue.increment(1);
      const curSonB = subeSnap.exists && subeSnap.data().son_donem
        ? String(subeSnap.data().son_donem).split('_')[0]
        : null;
      if (!curSonB || donemBaslangic >= curSonB) {
        subeUpdate.son_donem = `${donemBaslangic}_${donemBitis}`;
      }
    }

    tx.set(subeRef, subeUpdate, { merge: true });
    return false;
  });

  if (needsRecalc) {
    // Tek seferlik migration / eski format — tam recalc (versiyon aşağıda artırılır)
    await recalcSubeAggregates(subeKod, { skipBump: true });
  }
  if (!skipBump) await bumpDataVersion();
}

/**
 * Meta toplamlarını dönem dokümanına yazar (aggregate'ler delta ile güncellenir).
 */
export async function upsertMetaToplanlar(subeKod, donemBaslangic, donemBitis, toplamlar, { skipBump = false } = {}) {
  await applyDonemWrite(subeKod, donemBaslangic, donemBitis, {
    harcama: toplamlar.harcama || 0,
    erisim: toplamlar.erisim || 0,
    gosterim: toplamlar.gosterim || 0,
    sonuc: toplamlar.sonuc || 0,
    tiklama: toplamlar.tiklama || 0,
    tiklama_tumu: toplamlar.tiklama_tumu || 0,
    mesaj: toplamlar.mesaj || 0,
    yorum: toplamlar.yorum || 0,
    paylasim: toplamlar.paylasim || 0,
  }, { skipBump });
}

/**
 * Google toplamlarını dönem dokümanına yazar (toplam_*'ı etkilemez; özet işaretini günceller).
 */
export async function upsertGoogleToplanlar(subeKod, donemBaslangic, donemBitis, toplamlar, { skipBump = false } = {}) {
  await applyDonemWrite(subeKod, donemBaslangic, donemBitis, {
    google_arama: toplamlar.google_arama || 0,
    google_harita: toplamlar.google_harita || 0,
    google_telefon: toplamlar.google_telefon || 0,
    google_yol_tarifi: toplamlar.google_yol_tarifi || 0,
    google_web_tiklama: toplamlar.google_web_tiklama || 0,
    google_menu_tiklama: toplamlar.google_menu_tiklama || 0,
  }, { skipBump });
}

/**
 * Bütçe verilerini dönem dokümanına yazar (toplam_*'ı etkilemez; özet bütçesini günceller).
 */
export async function upsertButce(subeKod, donemBaslangic, donemBitis, planlananButce, devredilenMiktar = 0, merkezDestegi = 0, { skipBump = false } = {}) {
  await applyDonemWrite(subeKod, donemBaslangic, donemBitis, {
    planlanan_butce: planlananButce,
    devredilen_miktar: devredilenMiktar,
    merkez_destegi: merkezDestegi,
  }, { skipBump });
}

/**
 * Toplam erişim override'ını dönem dokümanına yazar (kampanya seviyesinde tekil erişim).
 */
export async function upsertToplamErisim(subeKod, donemBaslangic, donemBitis, toplamErisim, { skipBump = false } = {}) {
  await applyDonemWrite(subeKod, donemBaslangic, donemBitis, { erisim: toplamErisim }, { skipBump });
}

/**
 * Override'ları dönem dokümanına yazar.
 */
export async function updateOverrides(subeKod, donemBaslangic, donemBitis, overrides) {
  const docId = donemDocId(donemBaslangic, donemBitis);
  const docRef = db.collection('subeler').doc(subeKod).collection('donemler').doc(docId);

  // Tek atomik yazım. mergeFields listesindeki alanlar deep-merge YAPILMADAN bütünüyle
  // yazılır — veri_overrides tamamen değişir, eski (donmuş) override anahtarları kalmaz.
  await docRef.set({
    donem_baslangic: donemBaslangic,
    donem_bitis: donemBitis,
    updatedAt: new Date().toISOString(),
    veri_overrides: overrides,
  }, { mergeFields: ['donem_baslangic', 'donem_bitis', 'updatedAt', 'veri_overrides'] });
  await bumpDataVersion();
}

/**
 * Tek bir dönemin tüm verisini döner (1 read).
 */
export async function getDonemVeri(subeKod, donemBaslangic, donemBitis) {
  const docId = donemDocId(donemBaslangic, donemBitis);
  const doc = await db.collection('subeler').doc(subeKod).collection('donemler').doc(docId).get();
  if (!doc.exists) return null;
  return doc.data();
}

/**
 * Bütçe verisini döner (getDonemVeri wrapper — uyumluluk için).
 */
export async function getButce(subeKod, donemBaslangic, donemBitis) {
  const veri = await getDonemVeri(subeKod, donemBaslangic, donemBitis);
  if (!veri) return null;
  // Eski format uyumluluğu
  const result = {
    planlanan_butce: veri.planlanan_butce || 0,
    devredilen_miktar: veri.devredilen_miktar || 0,
    toplam_erisim: veri.erisim || 0,
  };
  if (veri.veri_overrides) {
    result.veri_overrides = typeof veri.veri_overrides === 'object'
      ? JSON.stringify(veri.veri_overrides)
      : veri.veri_overrides;
  }
  return result;
}

/**
 * Önceki dönem verisini döner (karşılaştırma için).
 */
export async function getOncekiDonem(subeKod, donemBaslangic) {
  const snap = await db.collection('subeler').doc(subeKod).collection('donemler')
    .where('donem_bitis', '<=', donemBaslangic)
    .orderBy('donem_bitis', 'desc')
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data();
}

/**
 * Dönemi siler ve aggregate'leri günceller.
 */
export async function deleteDonem(subeKod, donemBaslangic, donemBitis) {
  const docId = donemDocId(donemBaslangic, donemBitis);
  await db.collection('subeler').doc(subeKod).collection('donemler').doc(docId).delete();
  await recalcSubeAggregates(subeKod);
  return true;
}


// ═══════════════════════════════════════════════════
// ── Şube Aggregate Alanları ──
// ═══════════════════════════════════════════════════

/**
 * Şubenin tüm dönemlerini tarayarak aggregate alanlarını günceller.
 * Veri ekleme, silme, güncelleme işlemlerinden sonra çağrılır.
 * @param {object} [opts]
 * @param {boolean} [opts.skipBump] - Batch işlemlerde versiyon artışı sonda
 *   bir kez yapılır (aynı dokümana N paralel increment çakışmasını önler).
 */
export async function recalcSubeAggregates(subeKod, { skipBump = false } = {}) {
  const snap = await db.collection('subeler').doc(subeKod).collection('donemler')
    .orderBy('donem_baslangic', 'desc')
    .get();

  let toplam_harcama = 0;
  let toplam_erisim = 0;
  let toplam_gosterim = 0;
  let toplam_sonuc = 0;
  let toplam_tiklama = 0;
  let son_donem = null;
  let donem_sayisi = 0;
  
  const donem_ozetleri = [];

  snap.forEach(d => {
    const data = d.data();
    toplam_harcama += (data.harcama || 0);
    toplam_erisim += (data.erisim || 0);
    toplam_gosterim += (data.gosterim || 0);
    toplam_sonuc += (data.sonuc || 0);
    toplam_tiklama += (data.tiklama || 0);
    donem_sayisi++;

    if (!son_donem) {
      son_donem = `${data.donem_baslangic}_${data.donem_bitis}`;
    }
    
    // UI için gereken özet veriyi diziye ekle
    donem_ozetleri.push({
      baslangic: data.donem_baslangic,
      bitis: data.donem_bitis,
      meta: data.harcama !== undefined ? { harcama: 1 } : null,
      google: data.google_arama !== undefined ? { gorunurluk: 1 } : null,
      planlanan_butce: data.planlanan_butce || 0,
      devredilen_miktar: data.devredilen_miktar || 0,
      merkez_destegi: data.merkez_destegi || 0,
      harcama: data.harcama || 0,
      updatedAt: data.updatedAt || null,
    });
  });

  await db.collection('subeler').doc(subeKod).set({
    toplam_harcama,
    toplam_erisim,
    toplam_gosterim,
    toplam_sonuc,
    toplam_tiklama,
    son_donem,
    donem_sayisi,
    donem_ozetleri // 0 Read için sihirli dokunuş!
  }, { merge: true });

  if (!skipBump) await bumpDataVersion();
  // Kurulan özet dizisini döndür — çağıran tekrar okumadan kullanabilsin (lazy backfill)
  return donem_ozetleri;
}


// ═══════════════════════════════════════════════════
// ── Settings & Mappings (reports collection'da kalır) ──
// ═══════════════════════════════════════════════════

// Stubs for API compatibility
export async function getDb() { return true; }
export async function closeDb() { return true; }

export async function getSettings() {
  const doc = await db.collection('reports').doc('settings').get();
  return doc.exists ? doc.data() : {};
}

export async function saveSettings(data) {
  await db.collection('reports').doc('settings').set(data, { merge: true });
  await bumpDataVersion();
}

// ── Google Token Saklama ──
export async function getGoogleToken() {
  const doc = await db.collection('reports').doc('google_token').get();
  return doc.exists ? doc.data() : null;
}
export async function saveGoogleToken(token) {
  await db.collection('reports').doc('google_token').set(token, { merge: false });
}

// ── Google Lokasyon Eşleştirmeleri ──
export async function getGoogleMappings() {
  const doc = await db.collection('reports').doc('google_mappings').get();
  return doc.exists ? doc.data() : {};
}
export async function saveGoogleMappings(mappings) {
  await db.collection('reports').doc('google_mappings').set(mappings, { merge: false });
  await bumpDataVersion();
}

// ── Meta Genel/Şube Eşleştirmeleri ──
export async function getMetaMappings() {
  const doc = await db.collection('reports').doc('meta_mappings').get();
  return doc.exists ? doc.data() : {};
}
export async function saveMetaMappings(mappings) {
  await db.collection('reports').doc('meta_mappings').set(mappings, { merge: false });
  await bumpDataVersion();
}

// ── Meta Kampanya Eşleştirmeleri ──
export async function getCampaignMappings() {
  const doc = await db.collection('reports').doc('campaign_mappings').get();
  return doc.exists ? doc.data() : {};
}
export async function saveCampaignMappings(mappings) {
  await db.collection('reports').doc('campaign_mappings').set(mappings, { merge: false });
  await bumpDataVersion();
}

// ── Meta Reklam Seti Eşleştirmeleri ──
export async function getAdsetMappings() {
  const doc = await db.collection('reports').doc('adset_mappings').get();
  return doc.exists ? doc.data() : {};
}
export async function saveAdsetMappings(mappings) {
  await db.collection('reports').doc('adset_mappings').set(mappings, { merge: false });
  await bumpDataVersion();
}

// ── Meta Adset Cache ──
export async function getAdsetsCache() {
  const doc = await db.collection('reports').doc('adsets_cache').get();
  return doc.exists ? doc.data() : null;
}
export async function saveAdsetsCache(cacheData) {
  await db.collection('reports').doc('adsets_cache').set(cacheData, { merge: false });
}
