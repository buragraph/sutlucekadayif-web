import { getDonemVeri, getOncekiDonem, getSubeByKod } from '../db.js';

function pctChange(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export async function buildReportData(subeKod, donemBaslangic, donemBitis) {
  const sube = await getSubeByKod(subeKod);
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

  return {
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
    veriVar: true,
  };
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
