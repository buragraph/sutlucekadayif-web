import express, { Router } from 'express';
import multer from 'multer';
import { join, dirname, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readdirSync, unlinkSync, readFileSync, rmSync, writeFileSync, createWriteStream } from 'fs';
import archiver from 'archiver';

// Yeni modül yollarına göre servisleri dahil ediyoruz
import { importMetaCsv, importGoogleCsv, importSubeVerileri, importGoogleCsvBulk, importMetaCsvAutoMatch } from './services/import.js';
import { importFromMetaApi, previewMetaInsights, confirmMetaImport, saveMappings, loadMappings, fetchAccountLevelReach, fetchCampaigns, saveCampaignMappings, loadCampaignMappings, campaignBasedImport, fetchAdsets, saveAdsetMappings, loadAdsetMappings } from './services/meta-api.js';
import { getGoogleAuthUrl, handleGoogleCallback, isGoogleConnected, listAccounts, fetchLocationMetrics, fetchAllLocationMetrics, saveGoogleMappings, loadGoogleMappings } from './services/google-business.js';
import { buildReportData } from './services/report-data.js';
import { generateReportHtml } from './services/report-template.js';
import { generatePdf } from './services/generate-pdf.js';
import { getAllSubeler, getSubeByKod, getDonemler, getMetaVeriler, getGoogleVeri, upsertSube, updateSube, deleteSube, deleteDonem, upsertButce, getButce, updateOverrides, upsertGoogleVeri, closeDb, getDb, clearAllData, getDashboardData, upsertToplamErisim, getSettings, saveSettings, loadMappings, saveMappings, getCampaignMappings, getAdsetMappings, loadGoogleMappings, saveGoogleMappings } from './db.js';

import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Cloud Run (Firebase) ortamında sadece /tmp yazılabilir olduğu için os.tmpdir() kullanıyoruz.
const ROOT_DIR = join(os.tmpdir(), 'sutluce_reports');
const RAPORLAR_DIR = join(ROOT_DIR, 'raporlar');
const UPLOAD_DIR = join(ROOT_DIR, 'temp_uploads');


if (!existsSync(ROOT_DIR)) mkdirSync(ROOT_DIR, { recursive: true });

if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
else {
  try { readdirSync(UPLOAD_DIR).forEach(f => unlinkSync(join(UPLOAD_DIR, f))); } catch {}
}

try {
  if (existsSync(RAPORLAR_DIR)) {
    readdirSync(RAPORLAR_DIR).filter(f => f.endsWith('.zip')).forEach(f => {
      try { unlinkSync(join(RAPORLAR_DIR, f)); } catch {}
    });
  } else {
    mkdirSync(RAPORLAR_DIR, { recursive: true });
  }
} catch {}

const router = Router();

// frontend'in "raporlar" dizininden indirdiği PDF'leri statik sunuyoruz
router.use('/raporlar', express.static(RAPORLAR_DIR));

// Rapor UI tarafından çağrılan API ayarları
router.get('/settings', async (req, res) => {
  try {
    const settings = await getSettings();
    const safe = { ...settings };
    if (safe.metaApiToken) {
      safe.metaApiTokenMasked = safe.metaApiToken.substring(0, 6) + '...' + safe.metaApiToken.slice(-4);
    }
    // Google Client Secret Masking
    if (safe.googleClientSecret) {
      safe.googleClientSecretMasked = safe.googleClientSecret.substring(0, 4) + '...' + safe.googleClientSecret.slice(-4);
    }
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/save-settings', async (req, res) => {
  try {
    const newSettings = req.body;
    await saveSettings(newSettings);
    res.json({ success: true, message: 'Ayarlar kaydedildi.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Google OAuth Yönlendirmeleri
router.get('/auth/google', async (req, res) => {
  try {
    const url = await getGoogleAuthUrl();
    res.redirect(url);
  } catch (err) {
    res.status(500).send(`Google API Hatası: ${err.message}`);
  }
});

router.get('/auth/google/callback', async (req, res) => {
  try {
    await handleGoogleCallback(req.query.code);
    res.send('<script>window.close();</script>');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get('/google-status', async (req, res) => {
  try {
    res.json({ connected: await isGoogleConnected() });
  } catch (err) {
    res.json({ connected: false });
  }
});

// Yardımcı Fonksiyonlar
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === ',' && !inQuotes) { fields.push(current); current = ''; continue; }
    current += c;
  }
  fields.push(current);
  return fields;
}

function parseGmbBranch(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    if (lines.length < 3) return null;
    const headers = lines[0].split(',').map(h => h.replace(/^\uFEFF/, '').trim());
    const isletmeIdx = headers.indexOf('İşletme adı');
    if (isletmeIdx === -1) return null;
    const dataLines = lines.slice(2).filter(l => l.trim());
    if (!dataLines.length) return null;
    const fields = parseCsvLine(dataLines[0]);
    const fullName = (fields[isletmeIdx] || '').trim();
    if (!fullName) return null;
    const branchPart = fullName.replace(/Sütlüce Kadayıf/i, '').trim();
    if (!branchPart) return null;
    return { ad: fullName, kod: turkishToSlug(branchPart) };
  } catch (e) {
    return null;
  }
}

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

function getRaporDosyaAdi(subeAd, baslangic, bitis) {
    const sube = subeAd.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    return `Rapor_${sube}_${baslangic}_${bitis}.pdf`;
}

// Rapor önizleme (HTML döndürür)
router.post('/preview', async (req, res) => {
  try {
    const { subeKod, donemBaslangic, donemBitis } = req.body;
    const sube = await getSubeByKod(subeKod);
    if (!sube) return res.status(404).json({ error: 'Şube bulunamadı.' });

    let baslangic = donemBaslangic;
    let bitis = donemBitis;
    if (!baslangic || !bitis) {
      const donemler = await getDonemler(sube.id);
      const sonDonem = donemler.meta[0] || donemler.google[0];
      if (!sonDonem) return res.status(404).json({ error: 'Dönem verisi bulunamadı.' });
      baslangic = sonDonem.donem_baslangic;
      bitis = sonDonem.donem_bitis;
    }

    const reportData = await buildReportData(subeKod, baslangic, bitis);
    if (!reportData.veriVar) return res.status(404).json({ error: 'Veri bulunamadı.' });

    const html = generateReportHtml(reportData);
    res.type('html').send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PDF Üret ve İndir ──
router.post('/generate-pdf', async (req, res) => {
  try {
    const { subeKod, donemBaslangic, donemBitis } = req.body;
    const sube = await getSubeByKod(subeKod);
    if (!sube) return res.status(404).json({ error: 'Şube bulunamadı.' });

    let baslangic = donemBaslangic;
    let bitis = donemBitis;
    if (!baslangic || !bitis) {
      const donemler = await getDonemler(sube.id);
      const sonDonem = donemler.meta[0] || donemler.google[0];
      if (!sonDonem) return res.status(404).json({ error: 'Dönem verisi bulunamadı.' });
      baslangic = sonDonem.donem_baslangic;
      bitis = sonDonem.donem_bitis;
    }

    const reportData = await buildReportData(subeKod, baslangic, bitis);
    if (!reportData.veriVar) return res.status(404).json({ error: 'Veri bulunamadı.' });

    const html = generateReportHtml(reportData);
    const fileName = getRaporDosyaAdi(sube.ad, baslangic, bitis);

    // PDF'i buffer olarak üret — dosya sistemine yazmadan
    const pdfBuffer = await generatePdf(html);

    // Doğrudan kullanıcıya indir olarak gönder
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Toplu PDF Üret — ZIP olarak indir ──
router.post('/generate-pdf-bulk', async (req, res) => {
  try {
    const { subeKodlari, donemBaslangic, donemBitis } = req.body;

    if (!subeKodlari || !Array.isArray(subeKodlari) || subeKodlari.length === 0) {
      return res.status(400).json({ error: 'En az bir şube seçilmelidir.' });
    }
    if (!donemBaslangic || !donemBitis) {
      return res.status(400).json({ error: 'Dönem başlangıç ve bitiş tarihleri zorunludur.' });
    }

    // Her şube için PDF üret
    const pdfResults = [];
    const hatalar = [];

    for (const subeKod of subeKodlari) {
      try {
        const sube = await getSubeByKod(subeKod);
        if (!sube) { hatalar.push({ subeKod, hata: 'Şube bulunamadı' }); continue; }

        const reportData = await buildReportData(subeKod, donemBaslangic, donemBitis);
        if (!reportData.veriVar) { hatalar.push({ subeKod, hata: 'Veri bulunamadı' }); continue; }

        const html = generateReportHtml(reportData);
        const pdfBuffer = await generatePdf(html);
        const fileName = getRaporDosyaAdi(sube.ad, donemBaslangic, donemBitis);

        pdfResults.push({ fileName, buffer: pdfBuffer, subeAd: sube.ad });
        console.log(`  ✅ ${sube.ad} — PDF hazır`);
      } catch (err) {
        hatalar.push({ subeKod, hata: err.message });
        console.error(`  ❌ ${subeKod}:`, err.message);
      }
    }

    if (pdfResults.length === 0) {
      return res.status(404).json({ error: 'Hiçbir şube için PDF oluşturulamadı.', hatalar });
    }

    // ZIP oluştur — memory-based, diske yazmaz
    const archive = archiver('zip', { zlib: { level: 5 } });
    const chunks = [];

    archive.on('data', (chunk) => chunks.push(chunk));

    const archiveFinished = new Promise((resolve, reject) => {
      archive.on('end', resolve);
      archive.on('error', reject);
    });

    for (const pdf of pdfResults) {
      archive.append(pdf.buffer, { name: pdf.fileName });
    }

    await archive.finalize();
    await archiveFinished;

    const zipBuffer = Buffer.concat(chunks);
    const zipName = `Raporlar_${donemBaslangic}_${donemBitis}.zip`;

    console.log(`📦 Toplu PDF: ${pdfResults.length} rapor, ${(zipBuffer.length / 1024).toFixed(0)} KB ZIP`);

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(zipName)}"`,
      'Content-Length': zipBuffer.length,
    });
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (extname(file.originalname).toLowerCase() === '.csv') cb(null, true);
    else cb(new Error('Sadece CSV dosyaları kabul edilir.'));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/upload', upload.single('csv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya seçilmedi.' });
  const platform = req.body.platform;
  const subeKod = req.body.sube;
  
  try {
    let result = null;
    let autoMatched = false;

    if (platform === 'meta') {
      if (subeKod === 'auto') {
         result = await importMetaCsvAutoMatch(req.file.buffer);
         autoMatched = true;
      } else {
         result = await importMetaCsv(req.file.buffer, subeKod);
      }
    } else if (platform === 'google') {
      if (subeKod === 'toplu' || subeKod === 'auto' || !subeKod) {
         result = await importGoogleCsvBulk(req.file.buffer, req.file.originalname);
      } else {
         result = await importGoogleCsv(req.file.buffer, subeKod, req.file.originalname);
      }
    } else {
      return res.status(400).json({ error: 'Geçersiz platform' });
    }

    if (result && result.error) {
       return res.status(400).json({ error: result.error });
    }

    const count = typeof result === 'number' ? result : (result.count || 0);

    res.json({
       success: true,
       message: autoMatched ? `${result.subeAd} için ${count} kayıt otomatik eşleşti.` : `${count} satır başarıyla kaydedildi.`,
       count,
       autoMatchDetail: autoMatched ? result : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard API
router.get('/dashboard', async (req, res) => {
  try {
    const subeler = await getAllSubeler();
    const { metaMap, googleMap, butceMap } = await getDashboardData();
    const dashData = [];
    
    for (const sube of subeler) {
      const allPeriods = new Map();
      for (const [key, m] of Object.entries(metaMap)) {
        if (m.sube_id !== sube.id) continue;
        const pKey = `${m.donem_baslangic}|${m.donem_bitis}`;
        if (!allPeriods.has(pKey)) allPeriods.set(pKey, { baslangic: m.donem_baslangic, bitis: m.donem_bitis, meta: null, google: null });
        allPeriods.get(pKey).meta = { harcama: m.harcama, erisim: m.erisim, sonuc: m.sonuc, tiklama: m.tiklama, reklamSetiSayisi: m.reklam_seti_sayisi };
      }
      for (const [key, g] of Object.entries(googleMap)) {
        if (g.sube_id !== sube.id) continue;
        const pKey = `${g.donem_baslangic}|${g.donem_bitis}`;
        if (!allPeriods.has(pKey)) allPeriods.set(pKey, { baslangic: g.donem_baslangic, bitis: g.donem_bitis, meta: null, google: null });
        allPeriods.get(pKey).google = { gorunurluk: (g.arama_mobil || 0) + (g.arama_masaustu || 0) + (g.harita_mobil || 0) + (g.harita_masaustu || 0), telefon: g.telefon, yolTarifi: g.yol_tarifi, webTiklama: g.web_tiklama };
      }

      const periodList = [...allPeriods.values()].sort((a, b) => b.bitis.localeCompare(a.bitis));

      for (const period of periodList) {
        const fileName = getRaporDosyaAdi(sube.ad, period.baslangic, period.bitis);
        const filePath = join(RAPORLAR_DIR, sube.kod || sube.id, fileName);
        period.rapor = existsSync(filePath) ? { url: `/api/reports/raporlar/${sube.kod || sube.id}/${encodeURIComponent(fileName)}`, dosya: fileName } : null;
        const bKey = `${sube.id}|${period.baslangic}|${period.bitis}`;
        const butce = butceMap[bKey];
        period.planlananButce = butce?.planlanan_butce || null;
        period.devredilenMiktar = butce?.devredilen_miktar || null;
        period.toplamErisim = butce?.toplam_erisim || null;
      }
      dashData.push({ ...sube, donemSayisi: periodList.length, donemler: periodList, raporlar: [] });
    }
    
    res.json({ subeler: dashData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sube', async (req, res) => {
  try {
    const { kod, ad } = req.body;
    if (!kod) return res.status(400).json({ error: 'Şube kodu zorunludur' });
    await upsertSube(kod, ad);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/sube/:kod', async (req, res) => {
  try {
    const { ad, adres } = req.body;
    await updateSube(req.params.kod, ad, adres);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/sube/:kod', async (req, res) => {
  try {
    await deleteSube(req.params.kod);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Mevcut UI'ı bozmamak için temel yapıyı korudum. Tam entegrasyon sağlandı. ---


// ══════════════════════════════════════════════════
// ── META API ENDPOINTS ──
// ══════════════════════════════════════════════════

router.post('/quick-fetch-meta', async (req, res) => {
  const { accessToken, since, until } = req.body;
  try {
    const defaultSube = req.body.targetSubeKod || null; // for campaign-based if needed
    // First try campaignBasedImport, if it errors because mapping not found, fallback to importFromMetaApi
    try {
      const result = await campaignBasedImport(accessToken, since, until, defaultSube);
      res.json(result);
    } catch (e) {
      if (e.message.includes("Eşleştirme bulunamadı")) {
         const result = await importFromMetaApi(accessToken, since, until);
         res.json(result);
      } else throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/preview-meta', async (req, res) => {
  const { accessToken, since, until } = req.body;
  try {
    res.json(await previewMetaInsights(accessToken, since, until));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/confirm-meta', async (req, res) => {
  const { accessToken, since, until, eslesmeler, saveMappingsOnly } = req.body;
  try {
    if (saveMappingsOnly) {
      await saveMappings(eslesmeler);
      return res.json({ success: true });
    }
    const result = await confirmMetaImport(accessToken, since, until, eslesmeler);
    await saveMappings({}); 
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/meta-mappings', async (req, res) => {
  try {
    const mappings = await loadMappings() || {};
    const campaignMappings = await getCampaignMappings() || {};
    const adsetMappings = await getAdsetMappings() || {};
    
    const reverseCampaigns = {};
    for (const [id, val] of Object.entries(campaignMappings)) {
      const sKod = typeof val === 'object' ? val.sube : val;
      if (sKod === '__atla__' || !sKod) continue;
      if (!reverseCampaigns[sKod]) reverseCampaigns[sKod] = [];
      reverseCampaigns[sKod].push({ id, name: typeof val === 'object' ? val.name : id });
    }
    
    const reverseAdsets = {};
    for (const [id, val] of Object.entries(adsetMappings)) {
      const sKod = typeof val === 'object' ? val.sube : val;
      if (sKod === '__atla__' || !sKod) continue;
      if (!reverseAdsets[sKod]) reverseAdsets[sKod] = [];
      reverseAdsets[sKod].push({ id, name: typeof val === 'object' ? val.name : id });
    }
    
    res.json({ mappings, reverseCampaigns, reverseAdsets });
  } catch (e) {
    res.json({ mappings: {}, reverseCampaigns: {}, reverseAdsets: {} });
  }
});
router.post('/meta-mappings', async (req, res) => {
  await saveMappings(req.body.mappings || {});
  res.json({ success: true });
});

router.post('/meta-campaigns', async (req, res) => {
  const { accessToken, since, until } = req.body;
  try {
    res.json(await fetchCampaigns(accessToken, since, until));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/save-campaign-mappings', async (req, res) => {
  await saveCampaignMappings(req.body.mappings || {});
  res.json({ success: true, message: 'Kampanya eşleştirmeleri kaydedildi.' });
});

router.post('/meta-adsets', async (req, res) => {
  const { accessToken, since, until } = req.body;
  try {
    res.json(await fetchAdsets(accessToken, since, until));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/save-adset-mappings', async (req, res) => {
  await saveAdsetMappings(req.body.mappings || {});
  res.json({ success: true, message: 'Reklam seti eşleştirmeleri kaydedildi.' });
});


// ══════════════════════════════════════════════════
// ── GOOGLE API ENDPOINTS ──
// ══════════════════════════════════════════════════

router.get('/google-locations', async (req, res) => {
  try {
    const locations = await listAccounts();
    const subeler = await getAllSubeler();
    const mappings = await loadGoogleMappings();
    // Eşleştirmeleri içine gömelim
    const mapped = locations.map(loc => ({
      ...loc,
      eslesmeKod: mappings[loc.name] || null
    }));
    res.json({ locations: mapped, subeler });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Google lokasyonları çekilemedi.' });
  }
});

router.get('/google-mappings', async (req, res) => {
  res.json(await loadGoogleMappings());
});

router.post('/google-mappings', async (req, res) => {
  await saveGoogleMappings(req.body.mappings || {});
  res.json({ success: true, message: 'Google lokasyon eşleştirmeleri kaydedildi.' });
});

router.post('/google-fetch', async (req, res) => {
  const { since, until } = req.body;
  try {
    const mappings = await loadGoogleMappings();
    if (Object.keys(mappings).length === 0) throw new Error("Önce eşleştirmeleri yapmalısınız.");
    
    // Parse ISODates: "2024-05-01" -> { year:2024, month:5, day:1 }
    const sDate = { year: parseInt(since.split('-')[0]), month: parseInt(since.split('-')[1]), day: parseInt(since.split('-')[2]) };
    const eDate = { year: parseInt(until.split('-')[0]), month: parseInt(until.split('-')[1]), day: parseInt(until.split('-')[2]) };
    
    const results = await fetchAllLocationMetrics(sDate, eDate);
    
    // veritabanına kaydet
    let savedCount = 0;
    for (const r of results) {
      if (r.error) continue;
      const subeKod = mappings[r.name];
      if (!subeKod || subeKod === '__atla__') continue;
      
      const subeler = await getAllSubeler();
      const sube = subeler.find(s => s.kod === subeKod);
      if (!sube) continue;
      
      await upsertGoogleVeri(sube.id, {
        donem_baslangic: since,
        donem_bitis: until,
        ...r.metrics
      });
      savedCount++;
    }
    
    res.json({ success: true, message: `${savedCount} şube için Google verileri güncellendi!`, details: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


export default router;
