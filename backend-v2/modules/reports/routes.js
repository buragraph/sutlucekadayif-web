import { Router } from '../../shared/router.js';
import { dosyaAl } from '../../shared/dosya.js';
import { kapsamliCacheMiddleware, invalidateCache } from '../../middleware/cache.js';
import { verifyToken, requirePermission } from '../../middleware/auth.js';
import { extname } from 'path';
import crypto from 'crypto';

import { supabase } from '../../config/supabase.js';
import { veriYaDaHata } from '../../utils/veri.js';
import { importMetaCsv, importGoogleCsv, importGoogleCsvBulk, importMetaCsvAutoMatch } from './services/import.js';
import { importFromMetaApi, previewMetaInsights, confirmMetaImport, saveMappings, loadMappings, fetchCampaigns, saveCampaignMappings, campaignBasedImport, fetchAdsets, saveAdsetMappings } from './services/meta-api.js';
import { getGoogleAuthUrl, handleGoogleCallback, isGoogleConnected, listAccounts, fetchLocationMetrics, fetchAllLocationMetrics, saveGoogleMappings, loadGoogleMappings } from './services/google-business.js';
import { buildReportData, invalidateReportCache } from './services/report-data.js';
import budgetRouter from './budget-routes.js';
import { generateReportHtml } from './services/report-template.js';
import {
  getAllSubeler, getSubeByKod, getDonemVeri, upsertSube, updateSube, deleteSube, deleteDonem,
  upsertButce, updateOverrides, upsertGoogleToplanlar, getSettings, saveSettings,
  getCampaignMappings, getAdsetMappings, getSubeNot, saveSubeNot,
} from './db.js';

// konum-store KULLANILMIYOR: sidebar/harita bilgisi artık şube satırının kolonu.
// versionedCacheMiddleware/bumpDataVersion de yok — düz TTL cache (bkz. middleware/cache.js).

const router = Router();

/**
 * Şube erişim kontrolü — sube_sahibi yalnızca kendi şubesine erişebilir.
 */
function ensureBranchAccess(req, res, kod) {
  if (req.user.role === 'admin') return true;
  if (kod && kod === req.user.subeSlug) return true;
  res.status(403).json({ error: 'Bu şubeye erişim yetkiniz yok' });
  return false;
}

// Rapor UI tarafından çağrılan API ayarları
router.get('/settings', verifyToken, requirePermission('reports.manage'), kapsamliCacheMiddleware(60), async (req, res) => {
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
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

router.post('/save-settings', verifyToken, requirePermission('reports.manage'), async (req, res) => {
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
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

// Google OAuth Yönlendirmeleri
// CSRF koruması: callback tarayıcı redirect'i olduğu için auth zincirinden geçemez
// (token taşımaz) — başlatmada üretilen kısa ömürlü `state` nonce'ı callback'te
// birebir doğrulanır.
const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const googleOAuthStates = new Map(); // state -> expiresAt

function issueGoogleOAuthState() {
  const now = Date.now();
  for (const [s, exp] of googleOAuthStates) {
    if (exp < now) googleOAuthStates.delete(s);
  }
  const state = crypto.randomBytes(32).toString('hex');
  googleOAuthStates.set(state, now + GOOGLE_OAUTH_STATE_TTL_MS);
  return state;
}

function consumeGoogleOAuthState(state) {
  if (!state || !googleOAuthStates.has(state)) return false;
  const valid = googleOAuthStates.get(state) >= Date.now();
  googleOAuthStates.delete(state); // tek kullanımlık — replay'i engelle
  return valid;
}

router.get('/auth/google', verifyToken, requirePermission('reports.manage'), async (req, res) => {
  try {
    const state = issueGoogleOAuthState();
    const url = await getGoogleAuthUrl(state);
    res.redirect(url);
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).send('Google API Hatası oluştu');
  }
});

router.get('/auth/google/callback', async (req, res) => {
  try {
    if (!consumeGoogleOAuthState(req.query.state)) {
      return res.status(400).send('Geçersiz veya süresi dolmuş istek (state doğrulaması başarısız).');
    }
    await handleGoogleCallback(req.query.code);
    res.send('<script>window.close();</script>');
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).send('Sunucu hatası oluştu');
  }
});

router.get('/google-status', verifyToken, requirePermission('reports.manage'), async (req, res) => {
  try {
    res.json({ connected: await isGoogleConnected() });
  } catch (err) {
    res.json({ connected: false });
  }
});

/**
 * Şubenin dönem özetleri. v2'de her zaman hesaplanmış dizi gelir (db.js
 * subeOzetleri) — Firestore'daki "eski format → lazy recalc" yolu öldü.
 */
async function ensureOzetler(sube) {
  return Array.isArray(sube.donem_ozetleri) ? sube.donem_ozetleri : [];
}

/**
 * Şube sahibi güncel (en yeni) dönemi görmez — yalnızca tamamlanmış eski dönemler.
 * donem_ozetleri baslangic'e göre desc sıralı olduğundan [0] en güncel dönemdir.
 */
function eskiDonemlerSadece(ozetler, role) {
  if (!Array.isArray(ozetler)) return ozetler;
  return role === 'sube_sahibi' ? ozetler.slice(1) : ozetler;
}

// Rapor önizleme (HTML döndürür)
router.post('/preview', verifyToken, requirePermission('reports.view'), async (req, res) => {
  try {
    const { subeKod, donemBaslangic, donemBitis } = req.body;
    if (!ensureBranchAccess(req, res, subeKod)) return;
    const sube = await getSubeByKod(subeKod);
    if (!sube) return res.status(404).json({ error: 'Şube bulunamadı.' });

    let baslangic = donemBaslangic;
    let bitis = donemBitis;
    if (!baslangic || !bitis) {
      const ozetler = await ensureOzetler(sube);
      const sonDonem = ozetler[0];
      if (!sonDonem) return res.status(404).json({ error: 'Dönem verisi bulunamadı.' });
      baslangic = sonDonem.baslangic;
      bitis = sonDonem.bitis;
    }

    const reportData = await buildReportData(subeKod, baslangic, bitis);
    if (!reportData.veriVar) return res.status(404).json({ error: 'Veri bulunamadı.' });

    const html = generateReportHtml(reportData);
    res.type('html').send(html);
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

// ── PDF üretimi Faz 3'te TARAYICIYA taşındı ──
// `POST /generate-pdf` ve `POST /generate-pdf-bulk` kaldırıldı: sunucu tarafı
// PDF puppeteer + headless Chromium istiyordu, Cloudflare Workers'ta çalışmıyor
// (karşılığı ücretli Browser Rendering API). Panel artık `POST /preview`ün
// döndürdüğü AYNI HTML'i alıp tarayıcıda yazdırıyor; tasarım ve geometri
// birebir korundu — doğrulama: amasya 2026-06-23→07-22, MediaBox iki tarafta da
// `0 0 360 1129.91992` (480×1506px), piksel sapması %0,99 kanal / ort. 1,5/255
// (yalnızca yazı tipi kenar yumuşatma farkı). Bkz. frontend
// `modules/reports/utils/pdf-yazdir.js` ve C2 raporundaki sözleşme değişikliği notu.

const CSV_AL = dosyaAl('csv', {
  uzantilar: ['.csv'],
  enBoy: 10 * 1024 * 1024,
  hataMesaji: 'Sadece CSV dosyaları kabul edilir.',
});

router.post('/upload', verifyToken, requirePermission('reports.manage'), CSV_AL, async (req, res) => {
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
    const eslesmeyenler = (result && result.eslesmeyenler) || [];

    invalidateReportCache();
    invalidateCache('/reports');

    const temelMesaj = autoMatched ? `${result.subeAd} için ${count} kayıt otomatik eşleşti.` : `${count} satır başarıyla kaydedildi.`;
    res.json({
      success: true,
      message: temelMesaj + (eslesmeyenler.length ? ` ${eslesmeyenler.length} satır eşleşen şube bulunamadığı için atlandı (yeni şube açılmadı).` : ''),
      count,
      eslesmeyenler,
      autoMatchDetail: autoMatched ? result : null
    });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

/** Şube nesnesini dashboard şekline çevirir (rol bazlı dönem filtresiyle). */
function dashSube(sube, role) {
  const ozetler = eskiDonemlerSadece(sube.donem_ozetleri, role);
  return {
    ...sube,
    donem_ozetleri: ozetler,
    donemSayisi: role === 'sube_sahibi' && Array.isArray(ozetler) ? ozetler.length : (sube.donem_sayisi || 0),
    donemler: [], // frontend uyumluluğu — dönemler selectBranch'te lazy yüklenir
    toplamHarcama: sube.toplam_harcama || 0,
    toplamErisim: sube.toplam_erisim || 0,
    toplamSonuc: sube.toplam_sonuc || 0,
  };
}

// Dashboard API — Hafif şube listesi
router.get('/dashboard', verifyToken, requirePermission('reports.view'), kapsamliCacheMiddleware(60), async (req, res) => {
  try {
    let subeler;
    if (req.user.role === 'admin') {
      subeler = await getAllSubeler();
    } else {
      const sube = req.user.subeSlug ? await getSubeByKod(req.user.subeSlug) : null;
      subeler = sube ? [sube] : [];
    }
    res.json({ subeler: subeler.map((s) => dashSube(s, req.user.role)) });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

// Dashboard Bundle API — Tek istek ile tüm dashboard verisi
router.get('/dashboard-bundle', verifyToken, requirePermission('reports.view'), kapsamliCacheMiddleware(60), async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';

    // sube_sahibi yalnızca kendi şubesini görür. Meta/Google eşleştirmeleri ve
    // ayarlar admin yapılandırmasıdır — şube sahibine sızdırılmaz.
    if (!isAdmin) {
      const sube = req.user.subeSlug ? await getSubeByKod(req.user.subeSlug) : null;
      return res.json({
        subeler: (sube ? [sube] : []).map((s) => dashSube(s, req.user.role)),
        mappings: {},
        reverseCampaigns: {},
        reverseAdsets: {},
        hasMappings: false,
        settings: {},
        googleMappings: {},
      });
    }

    // Sidebar için yalnızca {kod, ad, il, ilce} gerekiyor — aggregate'ler ve
    // donem_ozetleri şubeye tıklanınca /sube/:kod ile lazy yüklenir.
    const [subeSatirlari, mappingsRaw, campaignMappingsRaw, adsetMappingsRaw, settingsRaw, googleMappingsRaw, onayliKodlar] = await Promise.all([
      supabase.from('subeler').select('kod, ad, il, ilce').range(0, 9999)
        .then((r) => veriYaDaHata(r, 'şubeler okunamadı')),
      loadMappings().catch(() => ({})),
      getCampaignMappings().catch(() => ({})),
      getAdsetMappings().catch(() => ({})),
      getSettings().catch(() => ({})),
      loadGoogleMappings().catch(() => ({})),
      import('./budget-routes.js').then(m => m.getOnayliSubeKodlari()).catch(() => []),
    ]);

    const dashData = subeSatirlari
      .map((e) => ({ kod: e.kod, ad: e.ad || e.kod, il: e.il || null, ilce: e.ilce || null, donemSayisi: 0, donemler: [] }))
      .sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr'));

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
      onayliKodlar: onayliKodlar || [],
    });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

// Tek şube (aggregate'ler + donem_ozetleri) — hedefli yenileme için
router.get('/sube/:kod', verifyToken, requirePermission('reports.view'), async (req, res) => {
  try {
    const { kod } = req.params;
    if (!ensureBranchAccess(req, res, kod)) return;

    const sube = await getSubeByKod(kod);
    if (!sube) return res.status(404).json({ error: 'Şube bulunamadı' });

    const ozetler = eskiDonemlerSadece(sube.donem_ozetleri, req.user.role);
    res.json({
      sube: {
        ...sube,
        donem_ozetleri: ozetler,
        donemSayisi: req.user.role === 'sube_sahibi' && Array.isArray(ozetler) ? ozetler.length : (sube.donem_sayisi || 0),
        toplamHarcama: sube.toplam_harcama || 0,
        toplamErisim: sube.toplam_erisim || 0,
        toplamSonuc: sube.toplam_sonuc || 0,
      },
    });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

// ── Şube notu (yalnızca yönetici) ──
// Not, şube satırından AYRI tabloda tutulur (bkz. db.js): /sube/:kod ve
// /dashboard-bundle şube nesnesini olduğu gibi yaydığı ve bu uçlara şube sahibi
// de eriştiği için, not orada dursa şube sahibine sızardı.
router.get('/sube/:kod/not', verifyToken, requirePermission('reports.manage'), async (req, res) => {
  try {
    res.json(await getSubeNot(req.params.kod));
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

router.put('/sube/:kod/not', verifyToken, requirePermission('reports.manage'), async (req, res) => {
  try {
    const sube = await getSubeByKod(req.params.kod);
    if (!sube) return res.status(404).json({ error: 'Şube bulunamadı' });

    const kaydedilen = await saveSubeNot(req.params.kod, req.body.not, req.user.email || req.user.uid);
    res.json(kaydedilen);
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

// Şubenin dönemleri (şubeye tıklandığında çağrılır)
router.get('/sube/:kod/donemler', verifyToken, requirePermission('reports.view'), async (req, res) => {
  try {
    const { kod } = req.params;
    if (!ensureBranchAccess(req, res, kod)) return;
    const sube = await getSubeByKod(kod);
    if (!sube) return res.status(404).json({ error: 'Şube bulunamadı' });
    const ozetler = eskiDonemlerSadece(await ensureOzetler(sube), req.user.role);
    const donemler = ozetler.map(ozet => ({
      baslangic: ozet.baslangic,
      bitis: ozet.bitis,
      meta: ozet.meta,
      google: ozet.google,
      planlanan_butce: ozet.planlanan_butce || 0,
      devredilen_miktar: ozet.devredilen_miktar || 0,
      harcama: ozet.harcama || 0,
    }));
    res.json({ donemler });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

router.post('/sube', verifyToken, requirePermission('reports.manage'), async (req, res) => {
  try {
    const { kod, ad, link } = req.body;
    if (!kod) return res.status(400).json({ error: 'Şube kodu zorunludur' });
    await upsertSube(kod, ad, null, link);
    invalidateCache('/reports');
    res.json({ success: true });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

router.put('/sube/:kod', verifyToken, requirePermission('reports.manage'), async (req, res) => {
  try {
    const { ad, adres, link } = req.body;
    await updateSube(req.params.kod, ad, adres, link);
    invalidateCache('/reports');
    res.json({ success: true });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

router.delete('/sube/:kod', verifyToken, requirePermission('reports.manage'), async (req, res) => {
  try {
    await deleteSube(req.params.kod);
    invalidateReportCache();
    invalidateCache('/reports');
    res.json({ success: true });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

router.delete('/sube/:kod/donem', verifyToken, requirePermission('reports.manage'), async (req, res) => {
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
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

router.get('/sube/:kod/donem/veriler', verifyToken, requirePermission('reports.view'), async (req, res) => {
  try {
    const { kod } = req.params;
    const { baslangic, bitis } = req.query;
    if (!ensureBranchAccess(req, res, kod)) return;

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
      merkezDestegi: veri?.merkez_destegi || 0,
    };

    // `overrides` artık ayrı bir harita değil — elle girilen bütçe alanlarının
    // KOLON değerleri. Dolu olanlar döner ki düzenleme formu bugünkü gibi
    // önceden dolsun (metrik override'ı v2'de yok, olamaz da).
    const overrides = {};
    if (veri?.planlanan_butce !== undefined) overrides.planlananButce = veri.planlanan_butce;
    if (veri?.devredilen_miktar !== undefined) overrides.devredilenMiktar = veri.devredilen_miktar;
    if (veri?.merkez_destegi !== undefined) overrides.merkezDestegi = veri.merkez_destegi;

    res.json({ computed, overrides });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

router.put('/sube/:kod/donem/overrides', verifyToken, requirePermission('reports.manage'), async (req, res) => {
  try {
    const { kod } = req.params;
    const { baslangic, bitis, overrides } = req.body;

    const sube = await getSubeByKod(kod);
    if (!sube) return res.status(404).json({ error: 'Şube bulunamadı' });

    // YALNIZCA bütçe alanları yazılır. Otomatik çekilen metrikler (harcama,
    // erişim, gösterim, sonuç, google...) bu uçla DEĞİŞTİRİLEMEZ — kolon ayrımı
    // sayesinde yapısal olarak imkânsız.
    const BUTCE_ALANLARI = ['planlananButce', 'devredilenMiktar', 'merkezDestegi'];
    const KOLON = { planlananButce: 'planlanan_butce', devredilenMiktar: 'devredilen_miktar', merkezDestegi: 'merkez_destegi' };
    const mevcutVeri = await getDonemVeri(sube.kod, baslangic, bitis);

    // Eksik gönderilen bütçe alanı MEVCUT kolon değerinden korunur (kısmi istek
    // diğer alanları sıfırlamasın).
    const butceOverrides = {};
    for (const k of BUTCE_ALANLARI) {
      if (overrides?.[k] !== undefined) butceOverrides[k] = overrides[k];
      else if (mevcutVeri?.[KOLON[k]] !== undefined) butceOverrides[k] = mevcutVeri[KOLON[k]];
    }
    await updateOverrides(sube.kod, baslangic, bitis, butceOverrides, { donemVar: mevcutVeri !== null });

    invalidateReportCache(sube.kod);
    invalidateCache('/reports');
    res.json({ success: true });
  } catch (err) {
    console.error('[Reports]', err);
    // updateOverrides gibi doğrulama hataları status taşır (ör. 400) — onurla
    res.status(err.status || 500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

// ══════════════════════════════════════════════════
// ── META API ENDPOINTS ──
// ══════════════════════════════════════════════════

router.post('/campaign-fetch', verifyToken, requirePermission('reports.manage'), async (req, res) => {
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
    if (err.message.includes("eşleştirme")) {
      res.status(400).json({ error: 'Kampanya eşleştirmesi bulunamadı' });
    } else {
      console.error('[Reports] campaign-fetch error:', err);
      res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
    }
  }
});

router.post('/quick-fetch-meta', verifyToken, requirePermission('reports.manage'), async (req, res) => {
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
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

router.post('/preview-meta', verifyToken, requirePermission('reports.manage'), async (req, res) => {
  let { accessToken, since, until } = req.body;
  try {
    if (!accessToken) { const s = await getSettings(); accessToken = s.metaApiToken; }
    if (!accessToken) return res.status(400).json({ error: 'Meta API token bulunamadı' });
    res.json(await previewMetaInsights(accessToken, since, until));
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

router.post('/confirm-meta', verifyToken, requirePermission('reports.manage'), async (req, res) => {
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
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

router.get('/meta-mappings', verifyToken, requirePermission('reports.manage'), kapsamliCacheMiddleware(60), async (req, res) => {
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

router.post('/meta-mappings', verifyToken, requirePermission('reports.manage'), async (req, res) => {
  await saveMappings(req.body.mappings || {});
  invalidateCache('/reports');
  res.json({ success: true });
});

router.post('/meta-campaigns', verifyToken, requirePermission('reports.manage'), async (req, res) => {
  let { accessToken, since, until } = req.body;
  try {
    if (!accessToken) { const s = await getSettings(); accessToken = s.metaApiToken; }
    if (!accessToken) return res.status(400).json({ error: 'Meta API token bulunamadı' });
    res.json(await fetchCampaigns(accessToken, since, until));
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

router.post('/save-campaign-mappings', verifyToken, requirePermission('reports.manage'), async (req, res) => {
  await saveCampaignMappings(req.body.mappings || {});
  invalidateCache('/reports');
  res.json({ success: true, message: 'Kampanya eşleştirmeleri kaydedildi.' });
});

router.post('/meta-adsets', verifyToken, requirePermission('reports.manage'), async (req, res) => {
  let { accessToken, since, until, forceRefresh } = req.body;
  try {
    if (!accessToken) { const s = await getSettings(); accessToken = s.metaApiToken; }
    if (!accessToken) return res.status(400).json({ error: 'Meta API token bulunamadı' });
    res.json(await fetchAdsets(accessToken, since, until, forceRefresh));
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

router.post('/save-adset-mappings', verifyToken, requirePermission('reports.manage'), async (req, res) => {
  await saveAdsetMappings(req.body.mappings || {});
  invalidateCache('/reports');
  res.json({ success: true, message: 'Reklam seti eşleştirmeleri kaydedildi.' });
});

// ══════════════════════════════════════════════════
// ── GOOGLE API ENDPOINTS ──
// ══════════════════════════════════════════════════

router.get('/google-locations', verifyToken, requirePermission('reports.manage'), kapsamliCacheMiddleware(60), async (req, res) => {
  try {
    const locations = await listAccounts();
    const subeler = await getAllSubeler();
    const mappings = await loadGoogleMappings();
    const mapped = locations.map(loc => ({
      ...loc,
      eslesmeKod: mappings[loc.name] || null
    }));
    res.json({ locations: mapped, subeler, mappings });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

router.get('/google-mappings', verifyToken, requirePermission('reports.manage'), async (req, res) => {
  res.json(await loadGoogleMappings());
});

router.post('/google-mappings', verifyToken, requirePermission('reports.manage'), async (req, res) => {
  await saveGoogleMappings(req.body.mappings || {});
  invalidateCache('/reports');
  res.json({ success: true, message: 'Google lokasyon eşleştirmeleri kaydedildi.' });
});

router.post('/google-fetch', verifyToken, requirePermission('reports.manage'), async (req, res) => {
  const { since, until, subeKod } = req.body;
  try {
    const mappings = await loadGoogleMappings();
    if (Object.keys(mappings).length === 0) throw new Error("Önce eşleştirmeleri yapmalısınız.");

    const sDate = { year: parseInt(since.split('-')[0]), month: parseInt(since.split('-')[1]), day: parseInt(since.split('-')[2]) };
    const eDate = { year: parseInt(until.split('-')[0]), month: parseInt(until.split('-')[1]), day: parseInt(until.split('-')[2]) };

    let savedCount = 0;

    if (subeKod) {
      const locationName = Object.keys(mappings).find(k => mappings[k] === subeKod);
      if (!locationName) throw new Error("Bu şube için Google lokasyon eşleştirmesi bulunamadı.");

      const sube = await getSubeByKod(subeKod);
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
      const subeler = await getAllSubeler();
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

    invalidateReportCache();
    invalidateCache('/reports');
    res.json({ success: true, message: `${savedCount} şube için Google verileri güncellendi!` });
  } catch (err) {
    console.error('[Reports] google-fetch error:', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası oluştu' });
  }
});

// Bütçe Toplama
router.use('/', budgetRouter);

export default router;
