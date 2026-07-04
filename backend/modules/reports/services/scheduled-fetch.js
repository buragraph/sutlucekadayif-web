import { db } from '../../../config/firebase.js';
import { getSettings, upsertGoogleToplanlar, bumpDataVersion } from '../db.js';
import { campaignBasedImport } from './meta-api.js';
import { loadGoogleMappings, fetchLocationMetrics, isGoogleConnected } from './google-business.js';

// Dönem bitişinden sonra kaç gün boyunca (gecikmeli harcama için) çekim tekrarlansın.
// Meta, kapanan pencerenin harcamasını birkaç gün sonra yukarı revize edebildiği için
// (geç atıflar) pencereyi geniş tutuyoruz; her gün tekrar çekilir, son çekim nihai olur.
const GRACE_DAYS = 7;

const bugunStr = () => new Date().toISOString().slice(0, 10);
const gunFarki = (tarih, bugun) => Math.floor((new Date(bugun) - new Date(tarih)) / 86400000);
// "YYYY-MM-DD" → { year, month, day } (Google Business API tarih objesi bekler)
const tarihObj = (s) => { const [y, m, d] = s.split('-').map(Number); return { year: y, month: m, day: d }; };

/**
 * Tek bir dönem için tüm şubelerin Meta + Google verisini çeker.
 */
async function donemCek(since, until) {
  const sonuc = { since, until, meta: false, google: 0, hata: [] };
  const settings = await getSettings().catch(() => ({}));

  // ── Meta (kampanya eşleştirmeli — tek çağrı tüm şubeleri kapsar) ──
  if (settings?.metaApiToken) {
    try {
      await campaignBasedImport(settings.metaApiToken, since, until);
      sonuc.meta = true;
    } catch (e) { sonuc.hata.push('meta: ' + e.message); }
  } else {
    sonuc.hata.push('meta: token yok');
  }

  // ── Google (her eşleşmiş konum için ayrı) ──
  try {
    if (await isGoogleConnected()) {
      const mappings = await loadGoogleMappings();
      // Şube varlık kontrolü: döngü içinde tek tek okumak yerine benzersiz kodları
      // tek getAll çağrısıyla getir (mükerrer eşleşmelerde okuma da tasarruf edilir)
      const kodlar = [...new Set(Object.values(mappings || {}).filter((k) => k && k !== '__atla__'))];
      const snaps = kodlar.length
        ? await db.getAll(...kodlar.map((k) => db.collection('subeler').doc(k)))
        : [];
      const mevcutKodlar = new Set(snaps.filter((s) => s.exists).map((s) => s.id));
      for (const [locationName, subeKod] of Object.entries(mappings || {})) {
        if (!subeKod || subeKod === '__atla__' || !mevcutKodlar.has(subeKod)) continue;
        try {
          const m = await fetchLocationMetrics(locationName, tarihObj(since), tarihObj(until));
          await upsertGoogleToplanlar(subeKod, since, until, {
            google_arama: (m.arama_mobil || 0) + (m.arama_masaustu || 0),
            google_harita: (m.harita_mobil || 0) + (m.harita_masaustu || 0),
            google_telefon: m.telefon || 0,
            google_yol_tarifi: m.yol_tarifi || 0,
            google_web_tiklama: m.web_tiklama || 0,
            google_menu_tiklama: m.menu_tiklama || 0,
          }, { skipBump: true });
          sonuc.google++;
        } catch (e) { sonuc.hata.push(`google ${subeKod}: ${e.message}`); }
      }
    } else {
      sonuc.hata.push('google: bağlı değil');
    }
  } catch (e) { sonuc.hata.push('google: ' + e.message); }

  await bumpDataVersion();
  return sonuc;
}

/**
 * Bütçe kampanyalarından SON GRACE_DAYS içinde BİTEN dönemleri bulur ve çeker.
 * Dönem içinde (henüz bitmemiş) hiçbir şey çekmez.
 */
export async function runScheduledFetch() {
  const bugun = bugunStr();
  const doc = await db.collection('reports').doc('butce').get();
  const kampanyalar = doc.exists ? Object.values(doc.data().kampanyalar || {}) : [];

  // Benzersiz dönemler (bitişi 1..GRACE_DAYS gün önce olanlar)
  const donemler = new Map();
  for (const k of kampanyalar) {
    if (!k.donem_baslangic || !k.donem_bitis) continue;
    const fark = gunFarki(k.donem_bitis, bugun); // bugün − bitiş (gün)
    if (fark >= 1 && fark <= GRACE_DAYS) {
      donemler.set(`${k.donem_baslangic}_${k.donem_bitis}`, { since: k.donem_baslangic, until: k.donem_bitis });
    }
  }

  const sonuclar = [];
  for (const d of donemler.values()) {
    console.log(`[Scheduled] Dönem çekiliyor: ${d.since} → ${d.until}`);
    sonuclar.push(await donemCek(d.since, d.until));
  }
  return { tarih: bugun, donemSayisi: donemler.size, sonuclar };
}
