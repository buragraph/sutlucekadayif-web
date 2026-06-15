import { getDonemVeri, getOncekiDonem, getSubeByKod, getDataVersion } from '../db.js';
import NodeCache from 'node-cache';

// Rapor verisi cache'i — aynı dönem için tekrar istendiğinde Firestore'a gitmez
const reportCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

/**
 * Rapor cache'ini temizler. Veri değişikliklerinden sonra çağrılmalıdır.
 * @param {string} [subeKod] - Belirli şubeyi temizle, verilmezse tümünü temizle
 */
export function invalidateReportCache(subeKod = null) {
  if (subeKod) {
    const keys = reportCache.keys().filter(k => k.startsWith(`report_${subeKod}_`));
    keys.forEach(k => reportCache.del(k));
  } else {
    reportCache.flushAll();
  }
}

function pctChange(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Rapor verisini oluşturur.
 * @param {string} subeKod - Şube kodu
 * @param {string} donemBaslangic - Dönem başlangıç tarihi
 * @param {string} donemBitis - Dönem bitiş tarihi
 * @param {object} [subeData] - Opsiyonel: önceden yüklenmiş şube verisi (batch işlemlerinde gereksiz read önler)
 * @param {number} [knownVersion] - Opsiyonel: önceden okunmuş veri versiyonu (toplu işlemlerde N kez getDataVersion okumasını önler)
 */
export async function buildReportData(subeKod, donemBaslangic, donemBitis, subeData = null, knownVersion = null) {
  // Cache kontrolü — anahtar veri versiyonunu içerir, böylece başka bir
  // instance'ta yapılan güncelleme sonrası bayat rapor servis edilmez (1 read).
  // Toplu PDF gibi döngülerde versiyon dışarıdan geçilerek tekrar okuma önlenir.
  const version = knownVersion != null ? knownVersion : await getDataVersion();
  const cacheKey = `report_${subeKod}_${donemBaslangic}_${donemBitis}_v${version}`;
  const cached = reportCache.get(cacheKey);
  if (cached) return cached;

  const sube = subeData || await getSubeByKod(subeKod);
  if (!sube) {
    throw new Error(`Şube bulunamadı: ${subeKod}`);
  }

  // ── Tek read ile tüm dönem verisini al ──
  const donem = await getDonemVeri(subeKod, donemBaslangic, donemBitis);
  if (!donem) {
    return { veriVar: false, sube: { kod: sube.kod, ad: sube.ad, adres: sube.adres } };
  }

  // ── Overrides uygula ──
  const overrides = donem.veri_overrides || {};

  // ── Meta Özet ──
  const metaOzet = {
    toplamHarcama: overrides.toplamHarcama ?? donem.harcama ?? 0,
    toplamErisim: overrides.toplamErisim ?? donem.erisim ?? 0,
    toplamGosterim: overrides.toplamGosterim ?? donem.gosterim ?? 0,
    toplamSonuc: overrides.toplamSonuc ?? donem.sonuc ?? 0,
    toplamTiklama: overrides.toplamTiklama ?? donem.tiklama ?? 0,
    toplamTiklamaTumu: overrides.toplamTiklamaTumu ?? donem.tiklama_tumu ?? 0,
    toplamMesaj: overrides.toplamMesaj ?? donem.mesaj ?? 0,
    toplamYorum: overrides.toplamYorum ?? donem.yorum ?? 0,
    toplamPaylasim: overrides.toplamPaylasim ?? donem.paylasim ?? 0,
  };
  metaOzet.toplamEtkilesim = metaOzet.toplamYorum + metaOzet.toplamPaylasim + metaOzet.toplamMesaj;

  // ── Google Özet ──
  const hasGoogle = donem.google_arama !== undefined || donem.google_harita !== undefined;
  const googleOzet = hasGoogle ? {
    toplamArama: overrides.googleArama ?? donem.google_arama ?? 0,
    toplamHarita: overrides.googleHarita ?? donem.google_harita ?? 0,
    toplamGorunurluk: (overrides.googleArama ?? donem.google_arama ?? 0) + (overrides.googleHarita ?? donem.google_harita ?? 0),
    telefon: overrides.googleTelefon ?? donem.google_telefon ?? 0,
    yolTarifi: overrides.googleYolTarifi ?? donem.google_yol_tarifi ?? 0,
    webTiklama: overrides.googleWebTiklama ?? donem.google_web_tiklama ?? 0,
    menuTiklama: overrides.googleMenuTiklama ?? donem.google_menu_tiklama ?? 0,
  } : null;

  if (googleOzet) {
    googleOzet.toplamEtkilesim = googleOzet.telefon + googleOzet.yolTarifi + googleOzet.webTiklama + googleOzet.menuTiklama;
  }

  // ── Önceki dönem karşılaştırma ──
  let karsilastirma = null;
  const onceki = await getOncekiDonem(subeKod, donemBaslangic);
  if (onceki) {
    karsilastirma = {};

    // Meta karşılaştırma
    if (onceki.harcama !== undefined) {
      karsilastirma.meta = {
        harcama: pctChange(metaOzet.toplamHarcama, onceki.harcama || 0),
        erisim: pctChange(metaOzet.toplamErisim, onceki.erisim || 0),
        sonuc: pctChange(metaOzet.toplamSonuc, onceki.sonuc || 0),
        tiklama: pctChange(metaOzet.toplamTiklama, onceki.tiklama || 0),
      };
    }

    // Google karşılaştırma
    if (googleOzet && onceki.google_arama !== undefined) {
      const oncekiGorunurluk = (onceki.google_arama || 0) + (onceki.google_harita || 0);
      karsilastirma.google = {
        gorunurluk: pctChange(googleOzet.toplamGorunurluk, oncekiGorunurluk),
        telefon: pctChange(googleOzet.telefon, onceki.google_telefon || 0),
        yolTarifi: pctChange(googleOzet.yolTarifi, onceki.google_yol_tarifi || 0),
        webTiklama: pctChange(googleOzet.webTiklama, onceki.google_web_tiklama || 0),
      };
    }
  }

  // ── Bütçe ──
  const planlananButce = overrides.planlananButce ?? donem.planlanan_butce ?? null;
  const devredilenMiktar = overrides.devredilenMiktar ?? donem.devredilen_miktar ?? null;
  const merkezDestegi = overrides.merkezDestegi ?? donem.merkez_destegi ?? null;

  const result = {
    sube: {
      kod: sube.kod,
      ad: sube.ad,
      adres: sube.adres,
    },
    donem: {
      baslangic: donemBaslangic,
      bitis: donemBitis,
      label: formatDonemLabel(donemBaslangic, donemBitis),
    },
    meta: metaOzet,
    google: googleOzet,
    karsilastirma,
    planlananButce,
    devredilenMiktar,
    merkezDestegi,
    veriVar: true,
  };

  // Sonucu cache'e yaz (1 saat TTL)
  reportCache.set(cacheKey, result);
  return result;
}

function formatDonemLabel(baslangic, bitis) {
  const aylar = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];

  const b = new Date(baslangic);
  const s = new Date(bitis);

  const bAy = aylar[b.getMonth()];
  const sAy = aylar[s.getMonth()];

  if (b.getFullYear() === s.getFullYear()) {
    if (b.getMonth() === s.getMonth()) {
      return `${b.getDate()}-${s.getDate()} ${bAy} ${b.getFullYear()}`;
    }
    return `${b.getDate()} ${bAy} - ${s.getDate()} ${sAy} ${b.getFullYear()}`;
  }
  return `${b.getDate()} ${bAy} ${b.getFullYear()} - ${s.getDate()} ${sAy} ${s.getFullYear()}`;
}
