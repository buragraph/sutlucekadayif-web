import { getSettings, getGoogleToken, saveGoogleToken, getGoogleMappings as dbGetGoogleMappings, saveGoogleMappings as dbSaveGoogleMappings } from '../db.js';

import { yetkiUrl, koduTokenaCevir, tokenYenile, suresiDoldu } from './google-oauth.js';

const SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
];

// googleapis paketi Faz 3'te düştü (Node http/crypto'ya bağlıydı, Workers'ta
// çalışmıyor). Kullanılan yüzey üç POST'a indi — bkz. google-oauth.js.
async function oauthAyarlari() {
  const settings = await getSettings();
  const clientId = settings.googleClientId;
  const clientSecret = settings.googleClientSecret;
  const redirectUri = settings.googleRedirectUri || 'http://localhost:5001/api/reports/auth/google/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Google API Client ID veya Secret veritabanında (Ayarlar) bulunamadı.');
  }
  return { clientId, clientSecret, redirectUri };
}

// ── Public API ──

export async function getGoogleAuthUrl(state) {
  const { clientId, redirectUri } = await oauthAyarlari();
  return yetkiUrl({ clientId, redirectUri, scopes: SCOPES, state });
}

export async function handleGoogleCallback(code) {
  const { clientId, clientSecret, redirectUri } = await oauthAyarlari();
  const tokens = await koduTokenaCevir({ code, clientId, clientSecret, redirectUri });
  await saveGoogleToken(tokens);
  return tokens;
}

export async function isGoogleConnected() {
  try {
    const settings = await getSettings();
    if (!settings.googleClientId || !settings.googleClientSecret) return false;
    
    const token = await getGoogleToken();
    if (token && token.access_token) return true;
  } catch {}
  return false;
}

// ── Hesap ve Lokasyon Listesi (Direct REST) ──

async function getAccessToken() {
  const tokenRecord = await getGoogleToken();
  if (!tokenRecord) throw new Error("Google API bağlanmamış veya token bulunamadı.");
  if (!suresiDoldu(tokenRecord)) return tokenRecord.access_token;

  // Süresi dolmuş → refresh_token ile yenile ve kaydet (eski `tokens` olayının yerine)
  if (!tokenRecord.refresh_token) throw new Error('Google token süresi doldu ve refresh_token yok — yeniden bağlanılmalı.');
  const { clientId, clientSecret } = await oauthAyarlari();
  const yeni = await tokenYenile({ refreshToken: tokenRecord.refresh_token, clientId, clientSecret });
  const birlesik = { ...tokenRecord, ...yeni };
  await saveGoogleToken(birlesik);
  console.log('🔄 Google token yenilendi ve db ye kaydedildi');
  return birlesik.access_token;
}

export async function listAccounts() {
  const accessToken = await getAccessToken();
  
  // Yöntem 1: GMB v4 API (daha eski ama kota sorunu yok)
  try {
    const v4Res = await fetch('https://mybusiness.googleapis.com/v4/accounts', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (v4Res.ok) {
      const v4Data = await v4Res.json();
      const accounts = v4Data.accounts || [];
      const allLocations = [];
      
      for (const account of accounts) {
        try {
          const locRes = await fetch(`https://mybusiness.googleapis.com/v4/${account.name}/locations?pageSize=100`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          if (!locRes.ok) continue;
          
          const locData = await locRes.json();
          const locations = locData.locations || [];
          for (const loc of locations) {
            allLocations.push({
              name: loc.name,
              title: loc.locationName || loc.title || '',
              storeCode: loc.storeCode || '',
              address: loc.address 
                ? [loc.address.addressLines?.join(', '), loc.address.locality, loc.address.administrativeArea].filter(Boolean).join(', ')
                : '',
              accountName: account.name,
            });
          }
        } catch (err) {}
      }
      if (allLocations.length > 0) return allLocations;
    }
  } catch (err) {}
  
  // Yöntem 2: Yeni Account Management API 
  const accountRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (!accountRes.ok) {
    throw new Error('Google API kota veya yetki hatası.');
  }
  
  const accountData = await accountRes.json();
  const accounts = accountData.accounts || [];
  const allLocations = [];
  
  for (const account of accounts) {
    try {
      const locRes = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storefrontAddress,storeCode&pageSize=100`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!locRes.ok) continue;
      
      const locations = (await locRes.json()).locations || [];
      for (const loc of locations) {
        allLocations.push({
          name: loc.name,
          title: loc.title,
          storeCode: loc.storeCode || '',
          address: loc.storefrontAddress 
            ? [loc.storefrontAddress.addressLines?.join(', '), loc.storefrontAddress.locality, loc.storefrontAddress.administrativeArea].filter(Boolean).join(', ')
            : '',
          accountName: account.name,
        });
      }
    } catch (err) {}
  }
  return allLocations;
}

// ── Performans Metrikleri ──

export async function fetchLocationMetrics(locationName, startDate, endDate) {
  const accessToken = await getAccessToken();
  
  const metrics = [
    'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
    'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
    'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
    'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
    'BUSINESS_DIRECTION_REQUESTS',
    'CALL_CLICKS',
    'WEBSITE_CLICKS',
    'BUSINESS_FOOD_MENU_CLICKS',
  ];

  const sorgu = new URLSearchParams();
  for (const m of metrics) sorgu.append('dailyMetrics', m);
  sorgu.set('dailyRange.startDate.year', startDate.year);
  sorgu.set('dailyRange.startDate.month', startDate.month);
  sorgu.set('dailyRange.startDate.day', startDate.day);
  sorgu.set('dailyRange.endDate.year', endDate.year);
  sorgu.set('dailyRange.endDate.month', endDate.month);
  sorgu.set('dailyRange.endDate.day', endDate.day);

  const istek = await fetch(
    `https://businessprofileperformance.googleapis.com/v1/${locationName}:fetchMultiDailyMetricsTimeSeries?${sorgu}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!istek.ok) {
    const hata = await istek.text();
    throw new Error(`Google performans API (${istek.status}): ${hata.slice(0, 200)}`);
  }
  const res = { data: await istek.json() };

  const totals = { arama_masaustu: 0, arama_mobil: 0, harita_masaustu: 0, harita_mobil: 0, yol_tarifi: 0, telefon: 0, web_tiklama: 0, menu_tiklama: 0 };
  const metricMapping = { 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH': 'arama_masaustu', 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH': 'arama_mobil', 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS': 'harita_masaustu', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS': 'harita_mobil', 'BUSINESS_DIRECTION_REQUESTS': 'yol_tarifi', 'CALL_CLICKS': 'telefon', 'WEBSITE_CLICKS': 'web_tiklama', 'BUSINESS_FOOD_MENU_CLICKS': 'menu_tiklama' };

  for (const series of res.data.multiDailyMetricTimeSeries || []) {
    for (const metricSeries of series.dailyMetricTimeSeries || []) {
      const metricName = metricSeries.dailyMetric;
      const fieldName = metricMapping[metricName];
      if (!fieldName) continue;

      for (const dp of metricSeries.timeSeries?.datedValues || []) {
        totals[fieldName] += parseInt(dp.value || '0', 10);
      }
    }
  }
  return totals;
}

export async function fetchAllLocationMetrics(startDate, endDate) {
  const locations = await listAccounts();
  const results = [];
  for (const loc of locations) {
    try {
      results.push({ ...loc, metrics: await fetchLocationMetrics(loc.name, startDate, endDate) });
    } catch (err) {
      results.push({ ...loc, metrics: null, error: err.message });
    }
  }
  return results;
}

export async function saveGoogleMappings(mappings) { await dbSaveGoogleMappings(mappings); }
export async function loadGoogleMappings() { return await dbGetGoogleMappings(); }
