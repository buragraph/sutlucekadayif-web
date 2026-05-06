import { google } from 'googleapis';
import { getSettings, getGoogleToken, saveGoogleToken, getGoogleMappings as dbGetGoogleMappings, saveGoogleMappings as dbSaveGoogleMappings } from '../db.js';

const SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
];

async function getOAuthClient() {
  const settings = await getSettings();
  const clientId = settings.googleClientId;
  const clientSecret = settings.googleClientSecret;
  const redirectUri = settings.googleRedirectUri || 'http://localhost:5001/api/reports/auth/google/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Google API Client ID veya Secret veritabanında (Ayarlar) bulunamadı.');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  
  // Token yönetimi
  try {
    const token = await getGoogleToken();
    if (token) {
      oauth2Client.setCredentials(token);
    }
  } catch {}

  oauth2Client.on('tokens', async (tokens) => {
    try {
      const existing = await getGoogleToken() || {};
      const merged = { ...existing, ...tokens };
      await saveGoogleToken(merged);
      oauth2Client.setCredentials(merged);
      console.log('🔄 Google token yenilendi ve db ye kaydedildi');
    } catch(err) {
      console.log('Token kaydedilemedi:', err.message);
    }
  });

  return oauth2Client;
}


// ── Public API ──

export async function getGoogleAuthUrl() {
  const oauth2Client = await getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function handleGoogleCallback(code) {
  const oauth2Client = await getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  await saveGoogleToken(tokens);
  oauth2Client.setCredentials(tokens);
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
  const oauth2Client = await getOAuthClient();
  const tokenRecord = await getGoogleToken();
  if (!tokenRecord) throw new Error("Google API bağlanmamış veya token bulunamadı.");
  const { token } = await oauth2Client.getAccessToken();
  return token;
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
  const oauth2Client = await getOAuthClient();
  const bpp = google.businessprofileperformance({ version: 'v1', auth: oauth2Client });
  
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

  const res = await bpp.locations.fetchMultiDailyMetricsTimeSeries({
    location: locationName,
    dailyMetrics: metrics,
    'dailyRange.startDate.year': startDate.year,
    'dailyRange.startDate.month': startDate.month,
    'dailyRange.startDate.day': startDate.day,
    'dailyRange.endDate.year': endDate.year,
    'dailyRange.endDate.month': endDate.month,
    'dailyRange.endDate.day': endDate.day,
  });

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
