import { db } from '../../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

// ═══════════════════════════════════════════════════
// ── Şube CRUD (subeler collection) ──
// ═══════════════════════════════════════════════════

export async function upsertSube(kod, ad, adres = null) {
  const docRef = db.collection('subeler').doc(kod);
  const doc = await docRef.get();
  if (!doc.exists) {
    await docRef.set({ ad, adres: adres || '' });
  } else {
    // Sadece ad/adres güncelle, varsa diğer dataları (telefon vb) ezme
    await docRef.update({ ad, adres: adres || '' });
  }
  const updated = await docRef.get();
  return { id: kod, kod, ...updated.data() };
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

export async function updateSube(kod, ad, adres) {
  const docRef = db.collection('subeler').doc(kod);
  const data = { ad };
  if (adres !== undefined) data.adres = adres;
  await docRef.update(data);
  const updated = await docRef.get();
  return { id: kod, kod, ...updated.data() };
}

export async function deleteSube(kod) {
  const docRef = db.collection('subeler').doc(kod);
  const doc = await docRef.get();
  if (!doc.exists) return false;

  // Alt koleksiyonları sil (donemler)
  await db.recursiveDelete(docRef.collection('donemler'));

  await docRef.delete();
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
export async function upsertMetaToplanlar(subeKod, donemBaslangic, donemBitis, toplamlar) {
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

  // Aggregate güncelle
  await recalcSubeAggregates(subeKod);
}

/**
 * Google toplamlarını dönem dokümanına yazar.
 */
export async function upsertGoogleToplanlar(subeKod, donemBaslangic, donemBitis, toplamlar) {
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

  // Aggregate güncelle
  await recalcSubeAggregates(subeKod);
}

/**
 * Bütçe verilerini dönem dokümanına yazar.
 */
export async function upsertButce(subeKod, donemBaslangic, donemBitis, planlananButce, devredilenMiktar = 0) {
  const docId = donemDocId(donemBaslangic, donemBitis);
  const docRef = db.collection('subeler').doc(subeKod).collection('donemler').doc(docId);

  await docRef.set({
    donem_baslangic: donemBaslangic,
    donem_bitis: donemBitis,
    planlanan_butce: planlananButce,
    devredilen_miktar: devredilenMiktar,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

/**
 * Toplam erişim override'ını dönem dokümanına yazar.
 * Kampanya seviyesinde tekil erişim (deduplicated).
 */
export async function upsertToplamErisim(subeKod, donemBaslangic, donemBitis, toplamErisim) {
  const docId = donemDocId(donemBaslangic, donemBitis);
  const docRef = db.collection('subeler').doc(subeKod).collection('donemler').doc(docId);

  await docRef.set({
    donem_baslangic: donemBaslangic,
    donem_bitis: donemBitis,
    erisim: toplamErisim,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  await recalcSubeAggregates(subeKod);
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
 */
export async function recalcSubeAggregates(subeKod) {
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
  });

  await db.collection('subeler').doc(subeKod).set({
    toplam_harcama,
    toplam_erisim,
    toplam_gosterim,
    toplam_sonuc,
    toplam_tiklama,
    son_donem,
    donem_sayisi,
  }, { merge: true });
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
}

// ── Meta Genel/Şube Eşleştirmeleri ──
export async function getMetaMappings() {
  const doc = await db.collection('reports').doc('meta_mappings').get();
  return doc.exists ? doc.data() : {};
}
export async function saveMetaMappings(mappings) {
  await db.collection('reports').doc('meta_mappings').set(mappings, { merge: false });
}

// ── Meta Kampanya Eşleştirmeleri ──
export async function getCampaignMappings() {
  const doc = await db.collection('reports').doc('campaign_mappings').get();
  return doc.exists ? doc.data() : {};
}
export async function saveCampaignMappings(mappings) {
  await db.collection('reports').doc('campaign_mappings').set(mappings, { merge: false });
}

// ── Meta Reklam Seti Eşleştirmeleri ──
export async function getAdsetMappings() {
  const doc = await db.collection('reports').doc('adset_mappings').get();
  return doc.exists ? doc.data() : {};
}
export async function saveAdsetMappings(mappings) {
  await db.collection('reports').doc('adset_mappings').set(mappings, { merge: false });
}

// ── Meta Adset Cache ──
export async function getAdsetsCache() {
  const doc = await db.collection('reports').doc('adsets_cache').get();
  return doc.exists ? doc.data() : null;
}
export async function saveAdsetsCache(cacheData) {
  await db.collection('reports').doc('adsets_cache').set(cacheData, { merge: false });
}
