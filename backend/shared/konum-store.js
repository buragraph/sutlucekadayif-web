import { db } from '../config/firebase.js';

/**
 * Harita konum listesi — tüm şubelerin {slug, ad, il, ilce, lat, lng} özetini TEK
 * dokümanda tutar. Harita endpoint'i 73 ayrı şube dokümanı yerine bu 1 dokümanı okur
 * (admin'de 73 read → 1 read). Şube yazımlarında incremental olarak güncellenir
 * (donem_ozetleri ile aynı denormalizasyon mantığı).
 *
 * Tarafsız modül: yalnızca db'ye bağımlı → branches/reports/onboarding hepsi
 * döngüsel import olmadan kullanabilir.
 */

const KONUM_REF = db.collection('reports').doc('konumlar');

function toEntry(slug, data) {
  return {
    slug,
    ad: data.ad || slug,
    il: data.il || null,
    ilce: data.ilce || null,
    lat: Number.isFinite(data.lat) ? data.lat : null,
    lng: Number.isFinite(data.lng) ? data.lng : null,
  };
}

/**
 * Konum listesini döner (1 read). Doküman hiç kurulmamışsa null döner
 * (çağıran syncAllKonumlar ile bir kez kurabilir).
 */
export async function getKonumListe() {
  const doc = await KONUM_REF.get();
  return doc.exists ? (doc.data().liste || []) : null;
}

/**
 * Tüm subeler'den konum dokümanını baştan kurar (N read + 1 write).
 * İlk kurulum / onarım için — normal akışta çağrılmaz.
 */
export async function syncAllKonumlar() {
  const snap = await db.collection('subeler').get();
  const liste = snap.docs.map((d) => toEntry(d.id, d.data()));
  await KONUM_REF.set({ liste, updatedAt: new Date().toISOString() });
  return liste;
}

/**
 * Tek şube kaydını ekler/günceller (1 read + 1 write, transaction).
 * Verilen alanlar mevcut kaydın üzerine yazılır; verilmeyenler korunur
 * (ör. yalnızca ad gelirse il/ilçe/konum bozulmaz).
 */
export async function upsertKonum(slug, data) {
  const needsFullSync = await db.runTransaction(async (tx) => {
    const doc = await tx.get(KONUM_REF);
    // Doküman yoksa tek kayıtlık EKSİK doküman oluşturma — dışarıda tam kur
    // (yeni şube subeler'de zaten yazılı olduğu için sync onu da kapsar).
    if (!doc.exists) return true;

    const liste = doc.data().liste || [];
    const idx = liste.findIndex((k) => k.slug === slug);
    const merged = { ...(idx >= 0 ? liste[idx] : {}), ...data };
    const entry = toEntry(slug, merged);
    if (idx >= 0) liste[idx] = entry;
    else liste.push(entry);
    tx.set(KONUM_REF, { liste, updatedAt: new Date().toISOString() }, { merge: true });
    return false;
  });

  if (needsFullSync) await syncAllKonumlar();
}

/**
 * Tek şube kaydını siler (1 read + 1 write, transaction).
 */
export async function removeKonum(slug) {
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(KONUM_REF);
    if (!doc.exists) return;
    const liste = (doc.data().liste || []).filter((k) => k.slug !== slug);
    tx.set(KONUM_REF, { liste, updatedAt: new Date().toISOString() }, { merge: true });
  });
}
