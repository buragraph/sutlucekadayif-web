import { getMetaVeriler, getGoogleVeri, getOncekiDonemMeta, getOncekiDonemGoogle, getSubeByKod, getButce } from '../db.js';

function pctChange(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function sumMetaField(rows, field) {
  return rows.reduce((acc, r) => acc + (r[field] || 0), 0);
}

function avgMetaField(rows, field) {
  if (rows.length === 0) return 0;
  const sum = sumMetaField(rows, field);
  return sum / rows.length;
}

export async function buildReportData(subeKod, donemBaslangic, donemBitis) {
  const sube = await getSubeByKod(subeKod);
  if (!sube) {
    throw new Error(`Şube bulunamadı: ${subeKod}`);
  }

  // ── Mevcut dönem verileri ──
  const metaRows = await getMetaVeriler(sube.id, donemBaslangic, donemBitis);
  const googleRow = await getGoogleVeri(sube.id, donemBaslangic, donemBitis);

  // ── Önceki dönem verileri ──
  const oncekiMeta = await getOncekiDonemMeta(sube.id, donemBaslangic);
  const oncekiGoogle = await getOncekiDonemGoogle(sube.id, donemBaslangic);

  // ── Meta Özet ──
  const metaOzet = {
    toplamHarcama: sumMetaField(metaRows, 'harcama'),
    toplamErisim: sumMetaField(metaRows, 'erisim'),
    toplamGosterim: sumMetaField(metaRows, 'gosterim'),
    toplamSonuc: sumMetaField(metaRows, 'sonuc'),
    ortSonucBasinaUcret: metaRows.length > 0
      ? sumMetaField(metaRows, 'harcama') / Math.max(sumMetaField(metaRows, 'sonuc'), 1)
      : 0,
    ortSiklik: avgMetaField(metaRows, 'siklik'),
    ortCtr: avgMetaField(metaRows, 'ctr'),
    ortCpc: avgMetaField(metaRows, 'cpc'),
    ortCpm: avgMetaField(metaRows, 'cpm'),
    toplamTiklama: sumMetaField(metaRows, 'baglanti_tiklamalari'),
    toplamTiklamaTumu: sumMetaField(metaRows, 'tiklamalar_tumu'),
    toplamMesaj: sumMetaField(metaRows, 'mesajlasmalar'),
    toplamYorum: sumMetaField(metaRows, 'yorumlar'),
    toplamPaylasim: sumMetaField(metaRows, 'paylasimlar'),
    toplamEtkilesim: sumMetaField(metaRows, 'yorumlar') + sumMetaField(metaRows, 'paylasimlar') + sumMetaField(metaRows, 'mesajlasmalar'),
    reklamSetleri: metaRows.map(r => ({
      ad: r.reklam_seti,
      durum: r.durum,
      harcama: r.harcama,
      erisim: r.erisim,
      gosterim: r.gosterim,
      sonuc: r.sonuc,
      sonucBasinaUcret: r.sonuc_basina_ucret,
      ctr: r.ctr,
      cpc: r.cpc,
      cpm: r.cpm,
      tiklama: r.baglanti_tiklamalari,
      mesaj: r.mesajlasmalar,
    })),
    enIyi: metaRows.length > 0 ? metaRows[0] : null, // zaten harcamaya göre sıralı
  };

  // En iyi performans gösteren set (sonuç başına en düşük ücret)
  if (metaRows.length > 0) {
    const enVerimli = [...metaRows].sort((a, b) => {
      const ucretA = a.sonuc > 0 ? a.harcama / a.sonuc : Infinity;
      const ucretB = b.sonuc > 0 ? b.harcama / b.sonuc : Infinity;
      return ucretA - ucretB;
    })[0];
    metaOzet.enVerimli = enVerimli;
  }

  // ── Google Özet ──
  const googleOzet = googleRow ? {
    aramaMobil: googleRow.arama_mobil,
    aramaMasaustu: googleRow.arama_masaustu,
    toplamArama: googleRow.arama_mobil + googleRow.arama_masaustu,
    haritaMobil: googleRow.harita_mobil,
    haritaMasaustu: googleRow.harita_masaustu,
    toplamHarita: googleRow.harita_mobil + googleRow.harita_masaustu,
    toplamGorunurluk: googleRow.arama_mobil + googleRow.arama_masaustu + googleRow.harita_mobil + googleRow.harita_masaustu,
    telefon: googleRow.telefon,
    mesajlar: googleRow.mesajlar,
    yolTarifi: googleRow.yol_tarifi,
    webTiklama: googleRow.web_tiklama,
    menuTiklama: googleRow.menu_tiklama,
    toplamEtkilesim: googleRow.telefon + googleRow.yol_tarifi + googleRow.web_tiklama + googleRow.menu_tiklama,
  } : null;

  // ── Önceki dönem karşılaştırma ──
  let karsilastirma = null;
  if (oncekiMeta.length > 0 || oncekiGoogle) {
    karsilastirma = {};

    if (oncekiMeta.length > 0) {
      const oncekiHarcama = sumMetaField(oncekiMeta, 'harcama');
      const oncekiErisim = sumMetaField(oncekiMeta, 'erisim');
      const oncekiSonuc = sumMetaField(oncekiMeta, 'sonuc');
      const oncekiTiklama = sumMetaField(oncekiMeta, 'baglanti_tiklamalari');

      karsilastirma.meta = {
        harcama: pctChange(metaOzet.toplamHarcama, oncekiHarcama),
        erisim: pctChange(metaOzet.toplamErisim, oncekiErisim),
        sonuc: pctChange(metaOzet.toplamSonuc, oncekiSonuc),
        tiklama: pctChange(metaOzet.toplamTiklama, oncekiTiklama),
      };
    }

    if (oncekiGoogle && googleOzet) {
      const oncekiGorunurluk = oncekiGoogle.arama_mobil + oncekiGoogle.arama_masaustu +
        oncekiGoogle.harita_mobil + oncekiGoogle.harita_masaustu;

      karsilastirma.google = {
        gorunurluk: pctChange(googleOzet.toplamGorunurluk, oncekiGorunurluk),
        telefon: pctChange(googleOzet.telefon, oncekiGoogle.telefon),
        yolTarifi: pctChange(googleOzet.yolTarifi, oncekiGoogle.yol_tarifi),
        webTiklama: pctChange(googleOzet.webTiklama, oncekiGoogle.web_tiklama),
      };
    }
  }

  // ── Bütçe & Overrides ──
  const butceRow = await getButce(sube.id, donemBaslangic, donemBitis);
  const planlananButce = butceRow?.planlanan_butce || null;
  const devredilenMiktar = butceRow?.devredilen_miktar || null;
  const toplamErisimOverride = butceRow?.toplam_erisim || null;

  // Erişim: legacy toplam_erisim alanı
  if (toplamErisimOverride && toplamErisimOverride > 0) {
    metaOzet.toplamErisim = toplamErisimOverride;
  }

  // veri_overrides JSON'dan tüm override'ları uygula
  const overrides = butceRow?.veri_overrides ? JSON.parse(butceRow.veri_overrides) : {};
  if (Object.keys(overrides).length > 0) {
    // Meta overrides
    if (overrides.toplamHarcama !== undefined) metaOzet.toplamHarcama = overrides.toplamHarcama;
    if (overrides.toplamErisim !== undefined) metaOzet.toplamErisim = overrides.toplamErisim;
    if (overrides.toplamGosterim !== undefined) metaOzet.toplamGosterim = overrides.toplamGosterim;
    if (overrides.toplamSonuc !== undefined) metaOzet.toplamSonuc = overrides.toplamSonuc;
    if (overrides.toplamTiklama !== undefined) metaOzet.toplamTiklama = overrides.toplamTiklama;
    if (overrides.toplamTiklamaTumu !== undefined) metaOzet.toplamTiklamaTumu = overrides.toplamTiklamaTumu;
    if (overrides.toplamMesaj !== undefined) metaOzet.toplamMesaj = overrides.toplamMesaj;
    if (overrides.toplamPaylasim !== undefined) metaOzet.toplamPaylasim = overrides.toplamPaylasim;
    if (overrides.toplamYorum !== undefined) metaOzet.toplamYorum = overrides.toplamYorum;

    // Google overrides
    if (googleOzet) {
      if (overrides.googleArama !== undefined) {
        googleOzet.toplamArama = overrides.googleArama;
      }
      if (overrides.googleHarita !== undefined) {
        googleOzet.toplamHarita = overrides.googleHarita;
      }
      if (overrides.googleYolTarifi !== undefined) googleOzet.yolTarifi = overrides.googleYolTarifi;
      if (overrides.googleTelefon !== undefined) googleOzet.telefon = overrides.googleTelefon;
      if (overrides.googleWebTiklama !== undefined) googleOzet.webTiklama = overrides.googleWebTiklama;
      if (overrides.googleMenuTiklama !== undefined) googleOzet.menuTiklama = overrides.googleMenuTiklama;
    }

    // Bütçe overrides
    if (overrides.planlananButce !== undefined) {
      // Will be returned separately
    }
  }

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
    planlananButce: overrides.planlananButce ?? planlananButce,
    devredilenMiktar: overrides.devredilenMiktar ?? devredilenMiktar,
    veriVar: metaRows.length > 0 || !!googleRow,
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
