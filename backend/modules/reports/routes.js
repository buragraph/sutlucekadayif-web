import express, { Router } from 'express';
import { cacheMiddleware, invalidateCache } from '../../middleware/cache.js';
import { verifyToken, requirePermission } from '../../middleware/auth.js';
import multer from 'multer';
import { join, dirname, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readdirSync, unlinkSync, readFileSync, rmSync, writeFileSync, createWriteStream } from 'fs';
import archiver from 'archiver';

// Yeni modül yollarına göre servisleri dahil ediyoruz
import { importMetaCsv, importGoogleCsv, importSubeVerileri, importGoogleCsvBulk, importMetaCsvAutoMatch } from './services/import.js';
import { importFromMetaApi, previewMetaInsights, confirmMetaImport, saveMappings, loadMappings, fetchAccountLevelReach, fetchCampaigns, saveCampaignMappings, loadCampaignMappings, campaignBasedImport, fetchAdsets, saveAdsetMappings, loadAdsetMappings } from './services/meta-api.js';
import { getGoogleAuthUrl, handleGoogleCallback, isGoogleConnected, listAccounts, fetchLocationMetrics, fetchAllLocationMetrics, saveGoogleMappings, loadGoogleMappings } from './services/google-business.js';
import { buildReportData, invalidateReportCache } from './services/report-data.js';
import budgetRouter from './budget-routes.js';
import { generateReportHtml } from './services/report-template.js';
import { generatePdf } from './services/generate-pdf.js';
import { getAllSubeler, getSubeByKod, getDonemler, getDonemVeri, upsertSube, updateSube, deleteSube, deleteDonem, upsertButce, getButce, updateOverrides, upsertGoogleToplanlar, closeDb, getDb, clearAllData, upsertToplamErisim, getSettings, saveSettings, getCampaignMappings, getAdsetMappings, recalcSubeAggregates } from './db.js';

import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(os.tmpdir(), 'sutluce_reports');
const UPLOAD_DIR = join(ROOT_DIR, 'temp_uploads');

if (!existsSync(ROOT_DIR)) mkdirSync(ROOT_DIR, { recursive: true });

if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
else {
  try { readdirSync(UPLOAD_DIR).forEach(f => unlinkSync(join(UPLOAD_DIR, f))); } catch {}
}

const router = Router();

// Rapor UI tarafından çağrılan API ayarları
router.get('/settings', verifyToken, cacheMiddleware(600), async (req, res) => {
  try {
    const settings = await getSettings();
    const safe = { ...settings };
    if (safe.metaApiToken) {
      safe.metaApiTokenMasked = safe.metaApiToken.substring(0, 6) + '...' + safe.metaApiToken.slice(-4);
      safe.hasMetaToken = true;
      delete safe.metaApiToken;
    }
    if (safe.googleClientSecret) {
      safe.googleClientSecretMasked = safe.googleClientSecret.substring(0, 4) + '...' + safe.googleClientSecret.slice(-4);
      delete safe.googleClientSecret;
    }
    res.json(safe);
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

router.post('/save-settings', verifyToken, async (req, res) => {
  try {
    const newSettings = req.body;
    // Boş gönderilen token/secret alanlarını mevcut değerlerle koru
    if (!newSettings.metaApiToken || !newSettings.googleClientSecret) {
      const existing = await getSettings();
      if (!newSettings.metaApiToken && existing.metaApiToken) newSettings.metaApiToken = existing.metaApiToken;
      if (!newSettings.googleClientSecret && existing.googleClientSecret) newSettings.googleClientSecret = existing.googleClientSecret;
    }
    await saveSettings(newSettings);
    invalidateCache('/reports');
    res.json({ success: true, message: 'Ayarlar kaydedildi.' });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

// Google OAuth Yönlendirmeleri
router.get('/auth/google', verifyToken, async (req, res) => {
  try {
    const url = await getGoogleAuthUrl();
    res.redirect(url);
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).send('Google API Hatası oluştu');
  }
});

router.get('/auth/google/callback', async (req, res) => {
  try {
    await handleGoogleCallback(req.query.code);
    res.send('<script>window.close();</script>');
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).send('Sunucu hatası oluştu');
  }
});

router.get('/google-status', verifyToken, async (req, res) => {
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
router.post('/preview', verifyToken, async (req, res) => {
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
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

// ── PDF Üret ve İndir ──
router.post('/generate-pdf', verifyToken, async (req, res) => {
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
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

// ── Toplu PDF Üret — ZIP olarak indir ──
router.post('/generate-pdf-bulk', verifyToken, async (req, res) => {
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

    // Tüm şubeleri tek seferde oku (N ayrı getSubeByKod yerine 1 query)
    const allSubeler = await getAllSubeler();
    const subeMap = Object.fromEntries(allSubeler.map(s => [s.kod, s]));

    for (const subeKod of subeKodlari) {
      try {
        const sube = subeMap[subeKod];
        if (!sube) { hatalar.push({ subeKod, hata: 'Şube bulunamadı' }); continue; }

        const reportData = await buildReportData(subeKod, donemBaslangic, donemBitis, sube);
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
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
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

router.post('/upload', verifyToken, upload.single('csv'), async (req, res) => {
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

    // Cache temizle — yeni veriler hemen görünsün
    invalidateReportCache();
    invalidateCache('/reports');

    res.json({
       success: true,
       message: autoMatched ? `${result.subeAd} için ${count} kayıt otomatik eşleşti.` : `${count} satır başarıyla kaydedildi.`,
       count,
       autoMatchDetail: autoMatched ? result : null
    });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

// Dashboard API — Hafif şube listesi (aggregate alanlar subeler dokümanından)
router.get('/dashboard', verifyToken, cacheMiddleware(300), async (req, res) => {
  try {
    const subeler = await getAllSubeler();
    const dashData = subeler.map(sube => ({
      ...sube,
      donemSayisi: sube.donem_sayisi || 0,
      donemler: [], // frontend uyumluluğu — dönemler selectBranch'te lazy yüklenir
      toplamHarcama: sube.toplam_harcama || 0,
      toplamErisim: sube.toplam_erisim || 0,
      toplamSonuc: sube.toplam_sonuc || 0,
    }));
    res.json({ subeler: dashData });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

// Dashboard Bundle API — Tek istek ile tüm dashboard verisini döndürür (4 ayrı istek yerine)
router.get('/dashboard-bundle', verifyToken, cacheMiddleware(300), async (req, res) => {
  try {
    const [subeler, mappingsRaw, campaignMappingsRaw, adsetMappingsRaw, settingsRaw, googleMappingsRaw] = await Promise.all([
      getAllSubeler(),
      import('./services/meta-api.js').then(m => m.loadMappings()).catch(() => ({})),
      getCampaignMappings().catch(() => ({})),
      getAdsetMappings().catch(() => ({})),
      getSettings().catch(() => ({})),
      import('./services/google-business.js').then(m => m.loadGoogleMappings()).catch(() => ({})),
    ]);

    const dashData = subeler.map(sube => ({
      ...sube,
      donemSayisi: sube.donem_sayisi || 0,
      donemler: [],
      toplamHarcama: sube.toplam_harcama || 0,
      toplamErisim: sube.toplam_erisim || 0,
      toplamSonuc: sube.toplam_sonuc || 0,
    }));

    // Meta mappings reverse hesapla
    const mappings = mappingsRaw || {};
    const campaignMappings = campaignMappingsRaw || {};
    const adsetMappings = adsetMappingsRaw || {};

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

    // Settings maskeleme
    const settings = { ...settingsRaw };
    if (settings.metaApiToken) {
      settings.metaApiTokenMasked = settings.metaApiToken.substring(0, 6) + '...' + settings.metaApiToken.slice(-4);
      settings.hasMetaToken = true;
      delete settings.metaApiToken;
    }
    if (settings.googleClientSecret) {
      settings.googleClientSecretMasked = settings.googleClientSecret.substring(0, 4) + '...' + settings.googleClientSecret.slice(-4);
      delete settings.googleClientSecret;
    }

    res.json({
      subeler: dashData,
      mappings,
      reverseCampaigns,
      reverseAdsets,
      hasMappings: Object.keys(campaignMappings).length > 0 || Object.keys(mappings).length > 0,
      settings,
      googleMappings: googleMappingsRaw || {},
    });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

// Şubenin dönemlerini döner (şubeye tıklandığında çağrılır — sadece tarih + veri var/yok)
router.get('/sube/:kod/donemler', verifyToken, (req, res, next) => {
  // nocache parametresi varsa cache'i atla (silme/ekleme sonrası taze veri)
  if (req.query.nocache) return next();
  return cacheMiddleware(180)(req, res, next);
}, async (req, res) => {
  try {
    const { kod } = req.params;
    const donemlerResult = await getDonemler(kod);
    const donemler = donemlerResult.meta.map(veri => ({
      baslangic: veri.donem_baslangic,
      bitis: veri.donem_bitis,
      meta: veri.harcama !== undefined ? { harcama: 1 } : null,
      google: veri.google_arama !== undefined ? { gorunurluk: 1 } : null,
      planlanan_butce: veri.planlanan_butce || 0,
      devredilen_miktar: veri.devredilen_miktar || 0,
      harcama: veri.harcama || 0,
    }));
    res.json({ donemler });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

router.post('/sube', verifyToken, async (req, res) => {
  try {
    const { kod, ad, link } = req.body;
    if (!kod) return res.status(400).json({ error: 'Şube kodu zorunludur' });
    await upsertSube(kod, ad, null, link);
    invalidateCache('/reports');
    res.json({ success: true });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

router.put('/sube/:kod', verifyToken, async (req, res) => {
  try {
    const { ad, adres, link } = req.body;
    await updateSube(req.params.kod, ad, adres, link);
    invalidateCache('/reports');
    res.json({ success: true });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

router.delete('/sube/:kod', verifyToken, async (req, res) => {
  try {
    await deleteSube(req.params.kod);
    invalidateReportCache();
    invalidateCache('/reports');
    res.json({ success: true });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

router.delete('/sube/:kod/donem', verifyToken, async (req, res) => {
  try {
    const { kod } = req.params;
    const { baslangic, bitis } = req.query;
    if (!baslangic || !bitis) return res.status(400).json({ error: 'Tarih parametreleri eksik' });
    
    const sube = await getSubeByKod(kod);
    if (!sube) return res.status(404).json({ error: 'Şube bulunamadı' });

    await deleteDonem(sube.kod, baslangic, bitis);
    invalidateReportCache();
    invalidateCache('/reports');
    res.json({ success: true });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

router.get('/sube/:kod/donem/veriler', verifyToken, async (req, res) => {
  try {
    const { kod } = req.params;
    const { baslangic, bitis } = req.query;
    
    const sube = await getSubeByKod(kod);
    if (!sube) return res.status(404).json({ error: 'Şube bulunamadı' });

    const veri = await getDonemVeri(sube.kod, baslangic, bitis);
    
    const computed = {
      toplamHarcama: veri?.harcama || 0,
      toplamErisim: veri?.erisim || 0,
      toplamGosterim: veri?.gosterim || 0,
      toplamSonuc: veri?.sonuc || 0,
      toplamTiklama: veri?.tiklama || 0,
      toplamTiklamaTumu: veri?.tiklama_tumu || 0,
      toplamPaylasim: veri?.paylasim || 0,
      toplamYorum: veri?.yorum || 0,
      toplamMesaj: veri?.mesaj || 0,
      googleArama: veri?.google_arama || 0,
      googleHarita: veri?.google_harita || 0,
      googleYolTarifi: veri?.google_yol_tarifi || 0,
      googleTelefon: veri?.google_telefon || 0,
      googleWebTiklama: veri?.google_web_tiklama || 0,
      googleMenuTiklama: veri?.google_menu_tiklama || 0,
      planlananButce: veri?.planlanan_butce || 0,
      devredilenMiktar: veri?.devredilen_miktar || 0,
    };

    const overrides = veri?.veri_overrides || {};

    res.json({ computed, overrides });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

router.put('/sube/:kod/donem/overrides', verifyToken, async (req, res) => {
  try {
    const { kod } = req.params;
    const { baslangic, bitis, overrides } = req.body;
    
    const sube = await getSubeByKod(kod);
    if (!sube) return res.status(404).json({ error: 'Şube bulunamadı' });

    await updateOverrides(sube.kod, baslangic, bitis, overrides);

    if (overrides.planlananButce !== undefined || overrides.devredilenMiktar !== undefined) {
      const bRow = await getButce(sube.kod, baslangic, bitis) || {};
      const plan = overrides.planlananButce !== undefined ? overrides.planlananButce : (bRow.planlanan_butce || 0);
      const devr = overrides.devredilenMiktar !== undefined ? overrides.devredilenMiktar : (bRow.devredilen_miktar || 0);
      await upsertButce(sube.kod, baslangic, bitis, plan, devr);
    }
    
    await recalcSubeAggregates(sube.kod);
    invalidateReportCache(sube.kod);
    invalidateCache('/reports');
    res.json({ success: true });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

// --- Mevcut UI'ı bozmamak için temel yapıyı korudum. Tam entegrasyon sağlandı. ---


// ══════════════════════════════════════════════════
// ── META API ENDPOINTS ──
// ══════════════════════════════════════════════════

router.post('/campaign-fetch', verifyToken, async (req, res) => {
  let { accessToken, since, until, subeKod, targetSubeKod } = req.body;
  try {
    if (!accessToken) {
      const s = await getSettings();
      accessToken = s.metaApiToken;
    }
    if (!accessToken) return res.status(400).json({ error: 'Meta API token bulunamadı' });
    const defaultSube = targetSubeKod || subeKod || null;
    const result = await campaignBasedImport(accessToken, since, until, defaultSube);
    invalidateReportCache();
    invalidateCache('/reports');
    res.json(result);
  } catch (err) {
    if (err.message.includes("Eşleşme bulunamadı") || err.message.includes("eşleştirme")) {
      res.status(400).json({ error: 'Kampanya eşleştirmesi bulunamadı' });
    } else {
      console.error('[Reports]', err);
      res.status(500).json({ error: 'Sunucu hatası oluştu' });
    }
  }
});

router.post('/quick-fetch-meta', verifyToken, async (req, res) => {
  let { accessToken, since, until, subeKod, targetSubeKod } = req.body;
  try {
    if (!accessToken) { const s = await getSettings(); accessToken = s.metaApiToken; }
    if (!accessToken) return res.status(400).json({ error: 'Meta API token bulunamadı' });
    const defaultSube = targetSubeKod || subeKod || null; 
    try {
      const result = await campaignBasedImport(accessToken, since, until, defaultSube);
      res.json(result);
    } catch (e) {
      if (e.message.includes("Eşleştirme bulunamadı") || e.message.includes("eşleştirme")) {
         const result = await importFromMetaApi(accessToken, since, until, defaultSube);
         res.json(result);
      } else throw e;
    }
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

router.post('/preview-meta', verifyToken, async (req, res) => {
  let { accessToken, since, until } = req.body;
  try {
    if (!accessToken) { const s = await getSettings(); accessToken = s.metaApiToken; }
    if (!accessToken) return res.status(400).json({ error: 'Meta API token bulunamadı' });
    res.json(await previewMetaInsights(accessToken, since, until));
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

router.post('/confirm-meta', verifyToken, async (req, res) => {
  let { accessToken, since, until, eslesmeler, saveMappingsOnly } = req.body;
  try {
    if (!accessToken) { const s = await getSettings(); accessToken = s.metaApiToken; }
    if (saveMappingsOnly) {
      await saveMappings(eslesmeler);
      invalidateCache('/reports');
      return res.json({ success: true });
    }
    const result = await confirmMetaImport(accessToken, since, until, eslesmeler);
    await saveMappings(eslesmeler);
    invalidateCache('/reports');
    res.json(result);
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

router.get('/meta-mappings', verifyToken, cacheMiddleware(600), async (req, res) => {
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
router.post('/meta-mappings', verifyToken, async (req, res) => {
  await saveMappings(req.body.mappings || {});
  invalidateCache('/reports');
  res.json({ success: true });
});

router.post('/meta-campaigns', verifyToken, async (req, res) => {
  let { accessToken, since, until } = req.body;
  try {
    if (!accessToken) { const s = await getSettings(); accessToken = s.metaApiToken; }
    if (!accessToken) return res.status(400).json({ error: 'Meta API token bulunamadı' });
    res.json(await fetchCampaigns(accessToken, since, until));
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

router.post('/save-campaign-mappings', verifyToken, async (req, res) => {
  await saveCampaignMappings(req.body.mappings || {});
  invalidateCache('/reports');
  res.json({ success: true, message: 'Kampanya eşleştirmeleri kaydedildi.' });
});

router.post('/meta-adsets', verifyToken, async (req, res) => {
  let { accessToken, since, until, forceRefresh } = req.body;
  try {
    if (!accessToken) { const s = await getSettings(); accessToken = s.metaApiToken; }
    if (!accessToken) return res.status(400).json({ error: 'Meta API token bulunamadı' });
    res.json(await fetchAdsets(accessToken, since, until, forceRefresh));
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

router.post('/save-adset-mappings', verifyToken, async (req, res) => {
  await saveAdsetMappings(req.body.mappings || {});
  invalidateCache('/reports');
  res.json({ success: true, message: 'Reklam seti eşleştirmeleri kaydedildi.' });
});


// ══════════════════════════════════════════════════
// ── GOOGLE API ENDPOINTS ──
// ══════════════════════════════════════════════════

router.get('/google-locations', verifyToken, cacheMiddleware(600), async (req, res) => {
  try {
    const locations = await listAccounts();
    const subeler = await getAllSubeler();
    const mappings = await loadGoogleMappings();
    // Eşleştirmeleri içine gömelim
    const mapped = locations.map(loc => ({
      ...loc,
      eslesmeKod: mappings[loc.name] || null
    }));
    res.json({ locations: mapped, subeler, mappings });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

router.get('/google-mappings', verifyToken, async (req, res) => {
  res.json(await loadGoogleMappings());
});

router.post('/google-mappings', verifyToken, async (req, res) => {
  await saveGoogleMappings(req.body.mappings || {});
  invalidateCache('/reports');
  res.json({ success: true, message: 'Google lokasyon eşleştirmeleri kaydedildi.' });
});

router.post('/google-fetch', verifyToken, async (req, res) => {
  const { since, until, subeKod } = req.body;
  try {
    const mappings = await loadGoogleMappings();
    if (Object.keys(mappings).length === 0) throw new Error("Önce eşleştirmeleri yapmalısınız.");
    
    const sDate = { year: parseInt(since.split('-')[0]), month: parseInt(since.split('-')[1]), day: parseInt(since.split('-')[2]) };
    const eDate = { year: parseInt(until.split('-')[0]), month: parseInt(until.split('-')[1]), day: parseInt(until.split('-')[2]) };
    
    const subeler = await getAllSubeler();
    let savedCount = 0;

    if (subeKod) {
      const locationName = Object.keys(mappings).find(k => mappings[k] === subeKod);
      if (!locationName) throw new Error("Bu şube için Google lokasyon eşleştirmesi bulunamadı.");
      
      const sube = subeler.find(s => s.kod === subeKod);
      if (!sube) throw new Error("Şube veritabanında bulunamadı.");

      const metrics = await fetchLocationMetrics(locationName, sDate, eDate);
      await upsertGoogleToplanlar(sube.kod, since, until, {
        google_arama: (metrics.arama_mobil || 0) + (metrics.arama_masaustu || 0),
        google_harita: (metrics.harita_mobil || 0) + (metrics.harita_masaustu || 0),
        google_telefon: metrics.telefon || 0,
        google_yol_tarifi: metrics.yol_tarifi || 0,
        google_web_tiklama: metrics.web_tiklama || 0,
        google_menu_tiklama: metrics.menu_tiklama || 0,
      });
      savedCount = 1;
    } else {
      const results = await fetchAllLocationMetrics(sDate, eDate);
      for (const r of results) {
        if (r.error) continue;
        const mappedKod = mappings[r.name];
        if (!mappedKod || mappedKod === '__atla__') continue;
        
        const sube = subeler.find(s => s.kod === mappedKod);
        if (!sube) continue;
        
        await upsertGoogleToplanlar(sube.kod, since, until, {
          google_arama: (r.metrics.arama_mobil || 0) + (r.metrics.arama_masaustu || 0),
          google_harita: (r.metrics.harita_mobil || 0) + (r.metrics.harita_masaustu || 0),
          google_telefon: r.metrics.telefon || 0,
          google_yol_tarifi: r.metrics.yol_tarifi || 0,
          google_web_tiklama: r.metrics.web_tiklama || 0,
          google_menu_tiklama: r.metrics.menu_tiklama || 0,
        });
        savedCount++;
      }
    }
    
    // Aggregates yeni db katmanında otomatik güncellenir
    invalidateReportCache();
    invalidateCache('/reports');
    res.json({ success: true, message: `${savedCount} şube için Google verileri güncellendi!` });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});


// Bütçe Toplama
router.use('/', budgetRouter);

export default router;
