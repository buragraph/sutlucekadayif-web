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

/**
 * Meta toplamlarını dönem dokümanına yazar.
 * Import/API'den gelen veriler önceden toplanıp buraya geçilir.
 */
export async function upsertMetaToplanlar(subeKod, donemBaslangic, donemBitis, toplamlar, { skipRecalc = false } = {}) {
  const docId = donemDocId(donemBaslangic, donemBitis);
  const docRef = db.collection('subeler').doc(subeKod).collection('donemler').doc(docId);

  await docRef.set({
    donem_baslangic: donemBaslangic,
    donem_bitis: donemBitis,
    harcama: toplamlar.harcama || 0,
    erisim: toplamlar.erisim || 0,
    gosterim: toplamlar.gosterim || 0,
    sonuc: toplamlar.sonuc || 0,
    tiklama: toplamlar.tiklama || 0,
    tiklama_tumu: toplamlar.tiklama_tumu || 0,
    mesaj: toplamlar.mesaj || 0,
    yorum: toplamlar.yorum || 0,
    paylasim: toplamlar.paylasim || 0,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  // Aggregate güncelle (skipRecalc: batch işlemlerde sonda bir kez çağrılır)
  if (!skipRecalc) await recalcSubeAggregates(subeKod);
}

/**
 * Google toplamlarını dönem dokümanına yazar.
 */
export async function upsertGoogleToplanlar(subeKod, donemBaslangic, donemBitis, toplamlar, { skipRecalc = false } = {}) {
  const docId = donemDocId(donemBaslangic, donemBitis);
  const docRef = db.collection('subeler').doc(subeKod).collection('donemler').doc(docId);

  await docRef.set({
    donem_baslangic: donemBaslangic,
    donem_bitis: donemBitis,
    google_arama: toplamlar.google_arama || 0,
    google_harita: toplamlar.google_harita || 0,
    google_telefon: toplamlar.google_telefon || 0,
    google_yol_tarifi: toplamlar.google_yol_tarifi || 0,
    google_web_tiklama: toplamlar.google_web_tiklama || 0,
    google_menu_tiklama: toplamlar.google_menu_tiklama || 0,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  // Aggregate güncelle (skipRecalc: batch işlemlerde sonda bir kez çağrılır)
  if (!skipRecalc) await recalcSubeAggregates(subeKod);
}

/**
 * Bütçe verilerini dönem dokümanına yazar.
 */
export async function upsertButce(subeKod, donemBaslangic, donemBitis, planlananButce, devredilenMiktar = 0, merkezDestegi = 0, { skipBump = false } = {}) {
  const docId = donemDocId(donemBaslangic, donemBitis);
  const docRef = db.collection('subeler').doc(subeKod).collection('donemler').doc(docId);

  await docRef.set({
    donem_baslangic: donemBaslangic,
    donem_bitis: donemBitis,
    planlanan_butce: planlananButce,
    devredilen_miktar: devredilenMiktar,
    merkez_destegi: merkezDestegi,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  // Bütçe alanları toplam_* aggregate'lerini etkilemez; donem_ozetleri'ndeki
  // ilgili kaydı yerinde güncellemek yeterli (tüm dönemleri okuyan recalc yerine 1 read).
  const subeRef = db.collection('subeler').doc(subeKod);
  const subeDoc = await subeRef.get();
  const ozetler = subeDoc.exists ? subeDoc.data().donem_ozetleri : null;
  const idx = Array.isArray(ozetler)
    ? ozetler.findIndex(o => o.baslangic === donemBaslangic && o.bitis === donemBitis)
    : -1;

  if (idx >= 0) {
    ozetler[idx] = {
      ...ozetler[idx],
      planlanan_butce: planlananButce,
      devredilen_miktar: devredilenMiktar,
      merkez_destegi: merkezDestegi,
    };
    await subeRef.update({ donem_ozetleri: ozetler });
    if (!skipBump) await bumpDataVersion();
  } else {
    // Özet kaydı yok (yeni dönem veya eski format şube) — tam yeniden hesapla
    await recalcSubeAggregates(subeKod, { skipBump });
  }
}

/**
 * Toplam erişim override'ını dönem dokümanına yazar.
 * Kampanya seviyesinde tekil erişim (deduplicated).
 */
export async function upsertToplamErisim(subeKod, donemBaslangic, donemBitis, toplamErisim, { skipRecalc = false } = {}) {
  const docId = donemDocId(donemBaslangic, donemBitis);
  const docRef = db.collection('subeler').doc(subeKod).collection('donemler').doc(docId);

  await docRef.set({
    donem_baslangic: donemBaslangic,
    donem_bitis: donemBitis,
    erisim: toplamErisim,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  if (!skipRecalc) await recalcSubeAggregates(subeKod);
}

/**
 * Override'ları dönem dokümanına yazar.
 */
export async function updateOverrides(subeKod, donemBaslangic, donemBitis, overrides) {
  const docId = donemDocId(donemBaslangic, donemBitis);
  const docRef = db.collection('subeler').doc(subeKod).collection('donemler').doc(docId);

  await docRef.set({
    donem_baslangic: donemBaslangic,
    donem_bitis: donemBitis,
    veri_overrides: overrides,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
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
 * Şubenin tüm dönemlerini VERİLERİYLE birlikte döner (tek sorgu).
 */
export async function getDonemler(subeKod) {
  const snap = await db.collection('subeler').doc(subeKod).collection('donemler')
    .orderBy('donem_baslangic', 'desc')
    .get();

  const donemler = [];
  snap.forEach(d => {
    donemler.push(d.data());
  });

  // Eski API uyumluluğu — meta ve google ayrı dönem listeleri döndürüyordu
  return { meta: donemler, google: donemler };
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
}


// ═══════════════════════════════════════════════════
// ── Genel ──
// ═══════════════════════════════════════════════════

export async function clearAllData() {
  // Tüm şubelerin donemler subcollection'ını sil
  const subeSnap = await db.collection('subeler').get();
  for (const doc of subeSnap.docs) {
    await db.recursiveDelete(doc.ref.collection('donemler'));
    // Aggregate alanlarını temizle
    await doc.ref.update({
      toplam_harcama: FieldValue.delete(),
      toplam_erisim: FieldValue.delete(),
      toplam_gosterim: FieldValue.delete(),
      toplam_sonuc: FieldValue.delete(),
      toplam_tiklama: FieldValue.delete(),
      son_donem: FieldValue.delete(),
      donem_sayisi: FieldValue.delete(),
    });
  }
  await bumpDataVersion();
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
