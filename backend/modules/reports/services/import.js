import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { parse } from 'csv-parse/sync';
import { upsertSube, upsertMetaToplanlar, upsertGoogleToplanlar, getSubeByKod, getAllSubeler } from '../db.js';

// ── Türkçe sütun eşleme ──

const META_COLUMN_MAP = {
  'Reklam seti adı': 'reklam_seti',
  'Yayın Durumu': 'durum',
  'Harcanan Tutar (TRY)': 'harcama',
  'Erişim': 'erisim',
  'Gösterim': 'gosterim',
  'Sonuçlar': 'sonuc',
  'Sonuç başına ücret': 'sonuc_basina_ucret',
  'Sıklık': 'siklik',
  'Hook Rate': 'hook_rate',
  'Hold Rate': 'hold_rate',
  'CTR (Tümü)': 'ctr',
  'CTR (Bağlantı Tıklama Oranı)': 'ctr_link',
  'CPC (tümü)': 'cpc',
  'CPC (Bağlantı Tıklaması Başına Ücret)': 'cpc_link',
  'CPM (1000 Gösterim Başına Ücret)': 'cpm',
  'Bağlantı Tıklamaları': 'baglanti_tiklamalari',
  'Tıklamalar (Tümü)': 'tiklamalar_tumu',
  'Başlatılan mesajlaşma konuşmaları': 'mesajlasmalar',
  'Başlatılan mesajlaşma konuşması başına ücret': 'mesaj_basina_ucret',
  'Yapılan telefon aramaları': 'telefon_aramalari',
  'Gönderi Yorumları': 'yorumlar',
  'Gönderi Paylaşımları': 'paylasimlar',
  'Rapor Başlangıcı': 'donem_baslangic',
  'Rapor Sonu': 'donem_bitis',
};

const GOOGLE_COLUMN_MAP = {
  'Mağaza kodu': 'magaza_kodu',
  'İşletme adı': 'isletme_adi',
  'Adres': 'adres',
  'Google Arama - Mobil': 'arama_mobil',
  'Google Arama - Masaüstü': 'arama_masaustu',
  'Google Haritalar - Mobil': 'harita_mobil',
  'Google Haritalar - Masaüstü': 'harita_masaustu',
  'Telefonla arama': 'telefon',
  'Mesajlar': 'mesajlar',
  'Rezervasyonlar': 'rezervasyonlar',
  'Yol tarifi': 'yol_tarifi',
  'Web sitesi tıklamaları': 'web_tiklama',
  'Yemek siparişleri': 'yemek_siparisleri',
  'Yemek menüsünün tıklanma sayısı': 'menu_tiklama',
  'Otel rezervasyonu sayısı': 'otel_rezervasyonu',
};

// ── Yardımcı fonksiyonlar ──

function parseNum(val) {
  if (val === undefined || val === null || val === '' || val === '-') return 0;
  const cleaned = String(val).replace(/,/g, '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseInt2(val) {
  return Math.round(parseNum(val));
}

function parseDateFromFilename(filename) {
  // "Adsız-Rapor-Oca-22-2026-Şub-18-2026.csv" gibi format
  // veya "GMB insights (Performance Report) - 2026-1-22 - 2026-2-18 - xxx.csv" gibi format
  
  // GMB formatı: YYYY-M-DD
  const gmbMatch = filename.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s*-\s*(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (gmbMatch) {
    const [, y1, m1, d1, y2, m2, d2] = gmbMatch;
    return {
      baslangic: `${y1}-${m1.padStart(2, '0')}-${d1.padStart(2, '0')}`,
      bitis: `${y2}-${m2.padStart(2, '0')}-${d2.padStart(2, '0')}`,
    };
  }

  return null; // CSV içinden alınacak
}

function mapRow(row, columnMap) {
  const mapped = {};
  const headers = Object.keys(row);
  
  for (const header of headers) {
    const cleanHeader = header.replace(/^\\uFEFF/, '').trim();
    if (columnMap[cleanHeader]) {
      mapped[columnMap[cleanHeader]] = row[header];
    }
  }
  return mapped;
}

/**
 * Meta CSV satırlarını dönem bazında gruplayıp toplamları hesaplar.
 * Her dönem için tek doküman yazılır.
 */
function aggregateMetaRows(mappedRows) {
  // Dönem bazında grupla
  const groups = {};
  for (const row of mappedRows) {
    if (!row.donem_baslangic || !row.donem_bitis) continue;
    const key = `${row.donem_baslangic}_${row.donem_bitis}`;
    if (!groups[key]) {
      groups[key] = {
        donem_baslangic: row.donem_baslangic,
        donem_bitis: row.donem_bitis,
        harcama: 0,
        erisim: 0,
        gosterim: 0,
        sonuc: 0,
        tiklama: 0,
        tiklama_tumu: 0,
        mesaj: 0,
        yorum: 0,
        paylasim: 0,
      };
    }
    const g = groups[key];
    g.harcama += parseNum(row.harcama);
    g.erisim += parseInt2(row.erisim);
    g.gosterim += parseInt2(row.gosterim);
    g.sonuc += parseInt2(row.sonuc);
    g.tiklama += parseInt2(row.baglanti_tiklamalari);
    g.tiklama_tumu += parseInt2(row.tiklamalar_tumu);
    g.mesaj += parseInt2(row.mesajlasmalar);
    g.yorum += parseInt2(row.yorumlar);
    g.paylasim += parseInt2(row.paylasimlar);
  }
  return Object.values(groups);
}

// ── Meta Import ──

export async function importMetaCsv(buffer, subeKod) {
  const content = typeof buffer === 'string' ? buffer : buffer.toString('utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  if (records.length === 0) {
    console.log('⚠️  Boş CSV dosyası');
    return 0;
  }

  // Şube oluştur/güncelle
  const sube = await upsertSube(subeKod, `Sütlüce Kadayıf ${subeKod.charAt(0).toUpperCase() + subeKod.slice(1)}`);

  // Satırları map'le
  const mappedRows = records.map(row => mapRow(row, META_COLUMN_MAP));
  
  // Toplamları hesapla ve dönem bazında grupla
  const donemToplamlari = aggregateMetaRows(mappedRows);

  // Her dönem için tek doküman yaz
  let count = 0;
  for (const toplam of donemToplamlari) {
    await upsertMetaToplanlar(sube.kod, toplam.donem_baslangic, toplam.donem_bitis, toplam);
    count += mappedRows.filter(r => r.donem_baslangic === toplam.donem_baslangic && r.donem_bitis === toplam.donem_bitis).length;
  }

  return count;
}

// ── Google Import ──

export async function importGoogleCsv(buffer, subeKod, originalFilename = null) {
  const content = typeof buffer === 'string' ? buffer : buffer.toString('utf-8');
  const filename = originalFilename || 'unknown.csv';
  
  // GMB CSV has 3 types of lines:
  // Line 1: Headers (Mağaza kodu, İşletme adı, ...)
  // Line 2: Descriptions (explanation of each column) - SKIP THIS
  // Line 3+: Data rows
  // We need to strip line 2 before parsing, otherwise csv-parse uses it as headers
  const lines = content.split('\n');
  const cleanedContent = [lines[0], ...lines.slice(2)].join('\n');

  const records = parse(cleanedContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  if (records.length === 0) {
    console.log('⚠️  Boş CSV dosyası');
    return 0;
  }

  // Tarih bilgisini dosya adından al
  const dates = parseDateFromFilename(filename);
  if (!dates) {
    console.log('⚠️  Tarih bilgisi dosya adından çıkarılamadı:', filename);
    return 0;
  }

  let count = 0;
  for (const row of records) {
    const mapped = mapRow(row, GOOGLE_COLUMN_MAP);
    
    // Şube bilgilerini güncelle
    const ad = mapped.isletme_adi || `Sütlüce Kadayıf ${subeKod.charAt(0).toUpperCase() + subeKod.slice(1)}`;
    const sube = await upsertSube(subeKod, ad, mapped.adres || null);

    const toplamlar = {
      google_arama: parseInt2(mapped.arama_mobil) + parseInt2(mapped.arama_masaustu),
      google_harita: parseInt2(mapped.harita_mobil) + parseInt2(mapped.harita_masaustu),
      google_telefon: parseInt2(mapped.telefon),
      google_yol_tarifi: parseInt2(mapped.yol_tarifi),
      google_web_tiklama: parseInt2(mapped.web_tiklama),
      google_menu_tiklama: parseInt2(mapped.menu_tiklama),
    };

    await upsertGoogleToplanlar(sube.kod, dates.baslangic, dates.bitis, toplamlar);
    count++;
  }

  return count;
}

// ── Toplu Import ──

export async function importSubeVerileri(verilerDir, subeKod) {
  const results = { meta: 0, google: 0 };

  // Meta CSV'leri
  const metaDir = join(verilerDir, 'meta', subeKod);
  if (existsSync(metaDir)) {
    const files = readdirSync(metaDir).filter(f => f.endsWith('.csv'));
    for (const file of files) {
      const count = await importMetaCsv(join(metaDir, file), subeKod);
      results.meta += count;
      console.log(`  ✅ Meta: ${file} → ${count} reklam seti import edildi`);
    }
  } else {
    console.log(`  ⚠️  Meta klasörü bulunamadı: ${metaDir}`);
  }

  // Google CSV'leri
  const googleDir = join(verilerDir, 'google', subeKod);
  if (existsSync(googleDir)) {
    const files = readdirSync(googleDir).filter(f => f.endsWith('.csv'));
    for (const file of files) {
      const count = await importGoogleCsv(join(googleDir, file), subeKod);
      results.google += count;
      console.log(`  ✅ Google: ${file} → ${count} kayıt import edildi`);
    }
  } else {
    console.log(`  ⚠️  Google klasörü bulunamadı: ${googleDir}`);
  }

  return results;
}

// ── Yardımcı: Türkçe → slug ──

function turkishToSlug(text) {
  return text
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/İ/g, 'i').replace(/Ğ/g, 'g').replace(/Ü/g, 'u')
    .replace(/Ş/g, 's').replace(/Ö/g, 'o').replace(/Ç/g, 'c')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// ── Toplu Google Import ──
// Tek bir Google CSV dosyasından tüm şubeleri oluşturur/günceller

export async function importGoogleCsvBulk(buffer, originalFilename) {
  const content = typeof buffer === 'string' ? buffer : buffer.toString('utf-8');
  const filename = originalFilename || 'unknown.csv';

  // GMB CSV: Line 1 = Headers, Line 2 = Descriptions (skip), Line 3+ = Data
  const lines = content.split('\n');
  const cleanedContent = [lines[0], ...lines.slice(2)].join('\n');

  const records = parse(cleanedContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  if (records.length === 0) {
    return { count: 0, subeler: [], error: 'Boş CSV dosyası' };
  }

  const dates = parseDateFromFilename(filename);
  if (!dates) {
    return { count: 0, subeler: [], error: 'Tarih bilgisi dosya adından çıkarılamadı' };
  }

  const results = [];
  for (const row of records) {
    const mapped = mapRow(row, GOOGLE_COLUMN_MAP);

    const isletmeAdi = mapped.isletme_adi || '';
    if (!isletmeAdi) continue;

    // İşletme adından şube kodu oluştur
    const branchPart = isletmeAdi.replace(/Sütlüce Kadayıf/i, '').replace(/Sutluce Kadayif/i, '').trim();
    if (!branchPart) continue;
    const subeKod = turkishToSlug(branchPart);

    const sube = await upsertSube(subeKod, isletmeAdi, mapped.adres || null);

    const toplamlar = {
      google_arama: parseInt2(mapped.arama_mobil) + parseInt2(mapped.arama_masaustu),
      google_harita: parseInt2(mapped.harita_mobil) + parseInt2(mapped.harita_masaustu),
      google_telefon: parseInt2(mapped.telefon),
      google_yol_tarifi: parseInt2(mapped.yol_tarifi),
      google_web_tiklama: parseInt2(mapped.web_tiklama),
      google_menu_tiklama: parseInt2(mapped.menu_tiklama),
    };

    await upsertGoogleToplanlar(sube.kod, dates.baslangic, dates.bitis, toplamlar);
    results.push({ kod: subeKod, ad: isletmeAdi });
  }

  return { count: results.length, subeler: results, dates };
}

// ── Toplu Meta Import (Otomatik Eşleştirme) ──
// Meta CSV'deki reklam seti adının ön-ekini (tire öncesi) şubeyle eşleştirir

export async function importMetaCsvAutoMatch(buffer) {
  const content = typeof buffer === 'string' ? buffer : buffer.toString('utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  if (records.length === 0) {
    return { count: 0, subeKod: null, subeAd: null, error: 'Boş CSV dosyası' };
  }

  // İlk satırdan şube adını çıkar (reklam seti adının tire öncesi kısmı)
  const firstRow = mapRow(records[0], META_COLUMN_MAP);
  const reklamSeti = firstRow.reklam_seti || '';
  const prefix = reklamSeti.split('-')[0].trim();

  if (!prefix || prefix.length < 2) {
    return { count: 0, subeKod: null, subeAd: null, error: 'Şube adı algılanamadı' };
  }

  const subeKod = turkishToSlug(prefix);

  // Mevcut şubelerle eşleştir
  const allSubeler = await getAllSubeler();
  let sube = allSubeler.find(s => s.kod === subeKod);

  // Bulunamadıysa benzer slug dene (kısmi eşleşme)
  if (!sube) {
    sube = allSubeler.find(s => s.kod.includes(subeKod) || subeKod.includes(s.kod));
  }

  if (!sube) {
    return { count: 0, subeKod, subeAd: prefix, error: `Eşleşen şube bulunamadı: "${prefix}" (${subeKod})` };
  }

  // Tüm satırları map'le ve topla
  const mappedRows = records.map(row => mapRow(row, META_COLUMN_MAP));
  const donemToplamlari = aggregateMetaRows(mappedRows);

  let count = 0;
  for (const toplam of donemToplamlari) {
    await upsertMetaToplanlar(sube.kod, toplam.donem_baslangic, toplam.donem_bitis, toplam);
    count += mappedRows.filter(r => r.donem_baslangic === toplam.donem_baslangic && r.donem_bitis === toplam.donem_bitis).length;
  }

  return { count, subeKod: sube.kod, subeAd: sube.ad };
}
