import { db } from '../../config/firebase.js';

// --- Şube CRUD ---

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
  
  // Alt koleksiyonları silmek client SDK'larda zordur ama Admin SDK'da kolayca 
  // recursive silebiliriz veya bulk/batch silme yapabiliriz.
  // Basitlik adina once reports/ altindaki o subenin dosyasini recursive siliyoruz.
  await db.recursiveDelete(db.collection('reports').doc(kod));

  await docRef.delete();
  return true;
}

// --- Meta Veri CRUD (Subcollection: meta_data) ---

export async function upsertMetaVeri(subeId, veri) {
  const docId = `${veri.donem_baslangic}_${veri.donem_bitis}_${veri.reklam_seti.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const docRef = db.collection('reports').doc(subeId).collection('meta_data').doc(docId);
  
  const payload = {
    sube_id: subeId,
    donem_baslangic: veri.donem_baslangic,
    donem_bitis: veri.donem_bitis,
    reklam_seti: veri.reklam_seti,
    durum: veri.durum,
    harcama: veri.harcama || 0,
    erisim: veri.erisim || 0,
    gosterim: veri.gosterim || 0,
    sonuc: veri.sonuc || 0,
    sonuc_basina_ucret: veri.sonuc_basina_ucret || 0,
    siklik: veri.siklik || 0,
    hook_rate: veri.hook_rate || 0,
    hold_rate: veri.hold_rate || 0,
    ctr: veri.ctr || 0,
    ctr_link: veri.ctr_link || 0,
    cpc: veri.cpc || 0,
    cpc_link: veri.cpc_link || 0,
    cpm: veri.cpm || 0,
    baglanti_tiklamalari: veri.baglanti_tiklamalari || 0,
    tiklamalar_tumu: veri.tiklamalar_tumu || 0,
    mesajlasmalar: veri.mesajlasmalar || 0,
    mesaj_basina_ucret: veri.mesaj_basina_ucret || 0,
    telefon_aramalari: veri.telefon_aramalari || 0,
    yorumlar: veri.yorumlar || 0,
    paylasimlar: veri.paylasimlar || 0
  };

  await docRef.set(payload, { merge: true });
}

export async function getMetaVeriler(subeId, donemBaslangic, donemBitis) {
  const snap = await db.collection('reports').doc(subeId).collection('meta_data')
    .where('donem_baslangic', '==', donemBaslangic)
    .where('donem_bitis', '==', donemBitis)
    .orderBy('harcama', 'desc')
    .get();
  
  const arr = [];
  snap.forEach(d => arr.push(d.data()));
  return arr;
}

export async function getOncekiDonemMeta(subeId, donemBaslangic) {
  // SQLite'ta bitişi öncekinden küçük olan son dönemi buluyorduk
  const snap = await db.collection('reports').doc(subeId).collection('meta_data')
    .where('donem_bitis', '<=', donemBaslangic)
    .orderBy('donem_bitis', 'desc')
    .limit(1)
    .get();

  if (snap.empty) return [];
  const onceki = snap.docs[0].data();
  
  // O dönemin tüm verilerini getir
  return await getMetaVeriler(subeId, onceki.donem_baslangic, onceki.donem_bitis);
}

export async function deleteMetaVeriByDonem(subeId, donemBaslangic, donemBitis) {
  const snap = await db.collection('reports').doc(subeId).collection('meta_data')
    .where('donem_baslangic', '==', donemBaslangic)
    .where('donem_bitis', '==', donemBitis)
    .get();
  
  const batch = db.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}


// --- Google Veri CRUD (Subcollection: google_data) ---

export async function upsertGoogleVeri(subeId, veri) {
  const docId = `${veri.donem_baslangic}_${veri.donem_bitis}`;
  const docRef = db.collection('reports').doc(subeId).collection('google_data').doc(docId);
  
  const payload = {
    sube_id: subeId,
    donem_baslangic: veri.donem_baslangic,
    donem_bitis: veri.donem_bitis,
    magaza_kodu: veri.magaza_kodu || null,
    arama_mobil: veri.arama_mobil || 0,
    arama_masaustu: veri.arama_masaustu || 0,
    harita_mobil: veri.harita_mobil || 0,
    harita_masaustu: veri.harita_masaustu || 0,
    telefon: veri.telefon || 0,
    mesajlar: veri.mesajlar || 0,
    rezervasyonlar: veri.rezervasyonlar || 0,
    yol_tarifi: veri.yol_tarifi || 0,
    web_tiklama: veri.web_tiklama || 0,
    yemek_siparisleri: veri.yemek_siparisleri || 0,
    menu_tiklama: veri.menu_tiklama || 0,
    otel_rezervasyonu: veri.otel_rezervasyonu || 0
  };

  await docRef.set(payload, { merge: true });
}

export async function getGoogleVeri(subeId, donemBaslangic, donemBitis) {
  const docId = `${donemBaslangic}_${donemBitis}`;
  const doc = await db.collection('reports').doc(subeId).collection('google_data').doc(docId).get();
  return doc.exists ? doc.data() : null;
}

export async function getOncekiDonemGoogle(subeId, donemBaslangic) {
  const snap = await db.collection('reports').doc(subeId).collection('google_data')
    .where('donem_bitis', '<=', donemBaslangic)
    .orderBy('donem_bitis', 'desc')
    .limit(1)
    .get();

  return snap.empty ? null : snap.docs[0].data();
}


// --- Bütçe CRUD (Subcollection: budgets) ---

export async function upsertButce(subeId, donemBaslangic, donemBitis, planlananButce, devredilenMiktar = 0, toplamErisim = 0) {
  const docId = `${donemBaslangic}_${donemBitis}`;
  const docRef = db.collection('reports').doc(subeId).collection('budgets').doc(docId);
  
  await docRef.set({
    sube_id: subeId,
    donem_baslangic: donemBaslangic,
    donem_bitis: donemBitis,
    planlanan_butce: planlananButce,
    devredilen_miktar: devredilenMiktar,
    toplam_erisim: toplamErisim
  }, { merge: true });
}

export async function upsertToplamErisim(subeId, donemBaslangic, donemBitis, toplamErisim) {
  const docId = `${donemBaslangic}_${donemBitis}`;
  const docRef = db.collection('reports').doc(subeId).collection('budgets').doc(docId);
  await docRef.set({
    sube_id: subeId,
    donem_baslangic: donemBaslangic,
    donem_bitis: donemBitis,
    toplam_erisim: toplamErisim
  }, { merge: true });
}

export async function getButce(subeId, donemBaslangic, donemBitis) {
  const docId = `${donemBaslangic}_${donemBitis}`;
  const docRef = db.collection('reports').doc(subeId).collection('budgets').doc(docId);
  const doc = await docRef.get();
  if (!doc.exists) return null;
  const data = doc.data();
  // Ensure same format as SQLite JSON string
  if (data.veri_overrides && typeof data.veri_overrides === 'object') {
     data.veri_overrides = JSON.stringify(data.veri_overrides);
  }
  return data;
}

export async function updateOverrides(subeId, donemBaslangic, donemBitis, overrides) {
  const docId = `${donemBaslangic}_${donemBitis}`;
  const docRef = db.collection('reports').doc(subeId).collection('budgets').doc(docId);
  // overrides object expected
  await docRef.set({
    sube_id: subeId,
    donem_baslangic: donemBaslangic,
    donem_bitis: donemBitis,
    veri_overrides: overrides
  }, { merge: true });
}


// --- Ortak ve Genel Sorgular ---

export async function getDonemler(subeId) {
  // DISTINCT in Firestore requires fetching or maintaining a set. We fetch all docs and extract.
  const metaSnap = await db.collection('reports').doc(subeId).collection('meta_data')
    .orderBy('donem_baslangic', 'desc')
    .get();
  const googleSnap = await db.collection('reports').doc(subeId).collection('google_data')
    .orderBy('donem_baslangic', 'desc')
    .get();

  const mSet = new Set();
  const metaArr = [];
  metaSnap.forEach(d => {
    const data = d.data();
    const k = `${data.donem_baslangic}_${data.donem_bitis}`;
    if (!mSet.has(k)) { mSet.add(k); metaArr.push({donem_baslangic: data.donem_baslangic, donem_bitis: data.donem_bitis}); }
  });

  const gSet = new Set();
  const googleArr = [];
  googleSnap.forEach(d => {
    const data = d.data();
    const k = `${data.donem_baslangic}_${data.donem_bitis}`;
    if (!gSet.has(k)) { gSet.add(k); googleArr.push({donem_baslangic: data.donem_baslangic, donem_bitis: data.donem_bitis}); }
  });

  return { meta: metaArr, google: googleArr };
}

export async function deleteDonem(subeId, donemBaslangic, donemBitis) {
  await deleteMetaVeriByDonem(subeId, donemBaslangic, donemBitis);
  
  const docId = `${donemBaslangic}_${donemBitis}`;
  await db.collection('reports').doc(subeId).collection('google_data').doc(docId).delete();
  await db.collection('reports').doc(subeId).collection('budgets').doc(docId).delete();
  
  return true;
}

export async function clearAllData() {
  const reportsSnap = await db.collection('reports').get();
  for (const doc of reportsSnap.docs) {
    await db.recursiveDelete(doc.ref);
  }
}

// ── Batch Dashboard Query ──
export async function getDashboardData() {
  // Firestore'da N+1 yerine Collection Group Query ile tek seferde verileri alabiliriz!
  const metaSnap = await db.collectionGroup('meta_data').get();
  const googleSnap = await db.collectionGroup('google_data').get();
  const butceSnap = await db.collectionGroup('budgets').get();

  const metaMap = {};  
  metaSnap.forEach(d => {
    const m = d.data();
    const key = `${m.sube_id}|${m.donem_baslangic}|${m.donem_bitis}`;
    if (!metaMap[key]) {
      metaMap[key] = {
        sube_id: m.sube_id, donem_baslangic: m.donem_baslangic, donem_bitis: m.donem_bitis,
        harcama: 0, erisim: 0, sonuc: 0, tiklama: 0, reklam_seti_sayisi: 0
      };
    }
    metaMap[key].harcama += (m.harcama || 0);
    metaMap[key].erisim += (m.erisim || 0);
    metaMap[key].sonuc += (m.sonuc || 0);
    metaMap[key].tiklama += (m.baglanti_tiklamalari || 0);
    metaMap[key].reklam_seti_sayisi++;
  });

  const googleMap = {};
  googleSnap.forEach(d => {
    const g = d.data();
    const key = `${g.sube_id}|${g.donem_baslangic}|${g.donem_bitis}`;
    googleMap[key] = g;
  });

  const butceMap = {};
  butceSnap.forEach(d => {
    const b = d.data();
    const key = `${b.sube_id}|${b.donem_baslangic}|${b.donem_bitis}`;
    butceMap[key] = b;
  });

  return { metaMap, googleMap, butceMap };
}

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
