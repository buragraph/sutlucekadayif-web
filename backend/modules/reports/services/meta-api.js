import { upsertSube, upsertMetaToplanlar, upsertToplamErisim, getAllSubeler, getSubeByKod, getMetaMappings, saveMetaMappings as dbSaveMetaMappings, getCampaignMappings, saveCampaignMappings as dbSaveCampaignMappings, getAdsetMappings, saveAdsetMappings as dbSaveAdsetMappings, getAdsetsCache, saveAdsetsCache, bumpDataVersion } from '../db.js';

// Batch sonunda versiyonu tek seferde artırır. Aggregate'ler her upsert'te delta ile
// güncellendiği için ayrıca recalc gerekmez (skipBump:true ile yazılıp burada 1 bump).
async function bumpAfterBatch(kodlar) {
  if ([...kodlar].length > 0) await bumpDataVersion();
}

const GRAPH_API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const AD_ACCOUNT_ID = 'act_1095694041713379';

// Eşleştirmeleri kaydet/yükle
export async function saveMappings(eslesmeler) { await dbSaveMetaMappings(eslesmeler); }
export async function loadMappings() { return await getMetaMappings(); }

function turkishToSlug(text) {
  return text.toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/İ/g, 'i').replace(/Ğ/g, 'g').replace(/Ü/g, 'u')
    .replace(/Ş/g, 's').replace(/Ö/g, 'o').replace(/Ç/g, 'c')
    .replace(/[^a-z0-9]/g, '').trim();
}

function getActionValue(actions, actionType) {
  if (!actions) return 0;
  const found = actions.find(a => a.action_type === actionType);
  return found ? parseInt(found.value) || 0 : 0;
}

const CREATIVE_KEYWORDS = [
  'ugc', 'sunum', 'hepayni', 'tatlı', 'hafif', 'beslenmey', 'yeninesil',
  'influencer', 'damarı', 'herşey', 'bubenimfavorim', 'iştebenim', 'soguk', 'soğuk',
  'sıcak', 'tadım', 'antalyayapılacak', 'ramazan', 'emre', 'kopya', 'tutanlar',
  'sürekli', 'keşfetim', 'tatlıyiyip', 'yüzlerce', 'ekleme', 'behiç', 'tatlıyı',
  'inf.', 'bayanı', 'şubedeki', 'açkapa', 'ilkdefa', 'hariç', 'bilinirlik', 'etkileşim',
  'ankarakreatif', 'ankarada', 'ankarasütlü', 'izmirden', 'istanbul', 'türkiye',
  'burada', 'sonzaman', 'harika', 'kadayıfmevzu', 'soğukkadayıf', 'kocaeligez',
  'tümlokasyon', 'iftarda', 'ikisevgili', 'davet', 'tanıtım', 'aysenur', 'burasıtürk',
  'denizlide', 'sakaryagur', 'mevzubahis',
];

function extractPrefix(adsetName) {
  const parts = adsetName.split(/[-\/]/);
  if (parts.length < 2) return parts[0]?.trim() || '';
  const p1 = parts[0].trim();
  const p2 = parts[1].trim();
  if (!p1 || p1.length < 2) return p1;
  if (!p2 || p2.length < 2) return p1;
  if (/^\d/.test(p2)) return p1;
  const p2lower = p2.toLowerCase().normalize('NFC').replace(/\s/g, '');
  const isCreative = CREATIVE_KEYWORDS.some(kw => p2lower.includes(kw));
  if (isCreative) return p1;
  const KNOWN_DISTRICTS = ['kecioren', 'kozyatagi', 'pursaklar', 'eryaman', 'etimesgut', 'mamak', 'sincan', 'baglica', 'gunesevler', 'karapurcek', 'etlik', 'maltepe', 'masukiye', 'pendik', 'kadikoy', 'kartal', 'kordon', 'alsancak', 'bornova', 'buca', 'lara', 'kepez', 'konyaalti', 'muratpasa', 'sapanca', 'duzce', 'bolu'];
  const p2slug = turkishToSlug(p2);
  if (KNOWN_DISTRICTS.some(d => p2slug.startsWith(d))) return `${p1}-${p2}`;
  if (p2.length > 15) return p1;
  return `${p1}-${p2}`;
}

export async function fetchAccountLevelReach(accessToken, since, until) {
  const url = `${BASE_URL}/${AD_ACCOUNT_ID}/insights?fields=reach,impressions,spend&time_range={"since":"${since}","until":"${until}"}&access_token=${accessToken}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(`Meta API Hatası: ${json.error.message}`);
  if (json.data && json.data.length > 0) {
    return { reach: parseInt(json.data[0].reach) || 0, impressions: parseInt(json.data[0].impressions) || 0, spend: parseFloat(json.data[0].spend) || 0 };
  }
  return { reach: 0, impressions: 0, spend: 0 };
}

export async function fetchCampaignLevelReach(accessToken, since, until) {
  let allData = [];
  let url = `${BASE_URL}/${AD_ACCOUNT_ID}/insights?level=campaign&fields=campaign_name,reach&time_range={"since":"${since}","until":"${until}"}&limit=500&access_token=${accessToken}`;
  while (url) {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(`Meta API Hatası: ${json.error.message}`);
    if (json.data) allData = allData.concat(json.data);
    url = json.paging?.next || null;
  }
  const subeReach = {};
  for (const row of allData) {
    const name = row.campaign_name || '';
    const parts = name.split('/');
    let region = null;
    for (const p of parts) {
      const clean = p.trim();
      if (/^\d/.test(clean) || clean.length < 2) continue;
      if (['P.Z', 'Soğuk', 'Sıcak', 'PZ', 'S'].includes(clean)) continue;
      region = clean;
    }
    if (!region) continue;
    const slug = turkishToSlug(region);
    if (!subeReach[slug]) subeReach[slug] = { region, reach: 0 };
    subeReach[slug].reach += parseInt(row.reach) || 0;
  }
  return subeReach;
}

export async function fetchMetaInsights(accessToken, timeRange) {
  const { since, until } = timeRange;
  const fields = ['adset_id','adset_name','spend','reach','impressions','actions','cost_per_action_type','frequency','ctr','cpc','cpm','clicks','inline_link_clicks'].join(',');
  let allData = [];
  let url = `${BASE_URL}/${AD_ACCOUNT_ID}/insights?level=adset&fields=${fields}&time_range={"since":"${since}","until":"${until}"}&limit=500&use_account_attribution_setting=true&filtering=[{"field":"spend","operator":"GREATER_THAN","value":"0"}]&access_token=${accessToken}`;
  while (url) {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(`Meta API Hatası: ${json.error.message}`);
    if (json.data) {
      console.log(`   📊 Sayfa: ${json.data.length} sonuç (date_start: ${json.data[0]?.date_start}, date_stop: ${json.data[0]?.date_stop})`);
      allData = allData.concat(json.data);
    }
    url = json.paging?.next || null;
  }
  return allData;
}

/**
 * API satırlarını şube bazında toplamlar nesnesine dönüştürür.
 */
function aggregateApiRows(rows) {
  let harcama = 0, erisim = 0, gosterim = 0, sonuc = 0;
  let tiklama = 0, tiklama_tumu = 0, mesaj = 0, yorum = 0, paylasim = 0;
  for (const row of rows) {
    harcama += parseFloat(row.spend) || 0;
    erisim += parseInt(row.reach) || 0;
    gosterim += parseInt(row.impressions) || 0;
    sonuc += getActionValue(row.actions, 'link_click') || getActionValue(row.actions, 'post_engagement') || 0;
    tiklama += parseInt(row.inline_link_clicks) || 0;
    tiklama_tumu += parseInt(row.clicks) || 0;
    mesaj += getActionValue(row.actions, 'onsite_conversion.messaging_conversation_started_7d');
    yorum += getActionValue(row.actions, 'comment');
    paylasim += getActionValue(row.actions, 'post');
  }
  return { harcama, erisim, gosterim, sonuc, tiklama, tiklama_tumu, mesaj, yorum, paylasim };
}

export async function importFromMetaApi(accessToken, since, until) {
  console.log(`\n📡 Meta API'den veri çekiliyor: ${since} → ${until}`);
  const rawData = await fetchMetaInsights(accessToken, { since, until });
  console.log(`   ${rawData.length} reklam seti bulundu`);
  if (rawData.length === 0) return { count: 0, subeler: [], hatalar: [] };

  const mevcutSubeler = await getAllSubeler();
  const subeGruplari = {};
  const hatalar = [];

  for (const row of rawData) {
    const adsetName = row.adset_name || '';
    const prefix = extractPrefix(adsetName);
    if (!prefix || prefix.length < 2) { hatalar.push({ adset: adsetName, error: 'Şube prefix çıkarılamadı' }); continue; }
    const slug = turkishToSlug(prefix);
    let sube = mevcutSubeler.find(s => s.kod === slug);
    if (!sube) sube = mevcutSubeler.find(s => s.kod.includes(slug) || slug.includes(s.kod));
    if (!sube) { sube = await upsertSube(slug, `Sütlüce Kadayıf ${prefix}`); mevcutSubeler.push(sube); }
    if (!subeGruplari[sube.kod]) subeGruplari[sube.kod] = { sube, rows: [] };
    subeGruplari[sube.kod].rows.push(row);
  }

  const sonuclar = [];
  for (const [kod, grup] of Object.entries(subeGruplari)) {
    const toplamlar = aggregateApiRows(grup.rows);
    await upsertMetaToplanlar(grup.sube.kod, since, until, toplamlar, { skipBump: true });
    sonuclar.push({ kod, ad: grup.sube.ad, kayit: grup.rows.length });
    console.log(`   ✅ ${grup.sube.ad}: ${grup.rows.length} reklam seti → toplamlar yazıldı`);
  }

  // Aggregate'leri sonda bir kez hesapla (N yerine 1 recalc per şube)
  await bumpAfterBatch(Object.keys(subeGruplari));

  console.log(`\n✅ Toplam: ${sonuclar.length} şube, ${rawData.length} reklam seti\n`);
  return { count: rawData.length, subeSayisi: sonuclar.length, subeler: sonuclar, hatalar };
}

export async function previewMetaInsights(accessToken, since, until) {
  const rawData = await fetchMetaInsights(accessToken, { since, until });
  if (rawData.length === 0) return { gruplar: [], toplamKayit: 0 };
  const mevcutSubeler = await getAllSubeler();
  const prefixMap = {};
  for (const row of rawData) {
    const adsetName = row.adset_name || '';
    const prefix = extractPrefix(adsetName);
    if (!prefix || prefix.length < 2) continue;
    const slug = turkishToSlug(prefix);
    if (!prefixMap[slug]) {
      let eslesen = mevcutSubeler.find(s => s.kod === slug);
      if (!eslesen) eslesen = mevcutSubeler.find(s => s.kod.includes(slug) || slug.includes(s.kod));
      prefixMap[slug] = { prefix, slug, eslesenKod: eslesen?.kod || null, eslesenAd: eslesen?.ad || null, kayitSayisi: 0, reklamSetleri: [] };
    }
    prefixMap[slug].kayitSayisi++;
    prefixMap[slug].reklamSetleri.push(adsetName);
  }
  return { gruplar: Object.values(prefixMap).sort((a, b) => b.kayitSayisi - a.kayitSayisi), toplamKayit: rawData.length, mevcutSubeler: mevcutSubeler.map(s => ({ kod: s.kod, ad: s.ad })) };
}

export async function confirmMetaImport(accessToken, since, until, eslesmeleri) {
  const rawData = await fetchMetaInsights(accessToken, { since, until });
  if (rawData.length === 0) return { count: 0, subeler: [] };
  const mevcutSubeler = await getAllSubeler();
  const subeGruplari = {};
  const atlanan = [];

  for (const row of rawData) {
    const adsetName = row.adset_name || '';
    const prefix = extractPrefix(adsetName);
    if (!prefix || prefix.length < 2) continue;
    const slug = turkishToSlug(prefix);
    const hedefKod = eslesmeleri[slug];
    if (!hedefKod || hedefKod === '__atla__') { atlanan.push(adsetName); continue; }
    let sube = mevcutSubeler.find(s => s.kod === hedefKod);
    if (!sube) { sube = await upsertSube(hedefKod, `Sütlüce Kadayıf ${prefix}`); mevcutSubeler.push(sube); }
    if (!subeGruplari[sube.kod]) subeGruplari[sube.kod] = { sube, rows: [] };
    subeGruplari[sube.kod].rows.push(row);
  }

  const sonuclar = [];
  for (const [kod, grup] of Object.entries(subeGruplari)) {
    const toplamlar = aggregateApiRows(grup.rows);
    await upsertMetaToplanlar(grup.sube.kod, since, until, toplamlar, { skipBump: true });
    sonuclar.push({ kod, ad: grup.sube.ad, kayit: grup.rows.length });
  }

  // Kampanya seviyesinde tekil erişim çek
  try {
    const campaignReach = await fetchCampaignLevelReach(accessToken, since, until);
    for (const [kod, grup] of Object.entries(subeGruplari)) {
      const match = campaignReach[kod];
      if (match && match.reach > 0) {
        await upsertToplamErisim(grup.sube.kod, since, until, match.reach, { skipBump: true });
        console.log(`   📊 ${grup.sube.ad}: tekil erişim = ${match.reach}`);
        const s = sonuclar.find(x => x.kod === kod);
        if (s) s.tekilErisim = match.reach;
      }
    }
  } catch (err) {
    console.log('   ⚠️ Kampanya erişim çekilemedi:', err.message);
  }

  // Aggregate'leri sonda bir kez hesapla (2×N yerine 1×N recalc)
  await bumpAfterBatch(Object.keys(subeGruplari));

  return { count: rawData.length, subeSayisi: sonuclar.length, subeler: sonuclar, atlanan: atlanan.length };
}

// ══════════════════════════════════════════════════
// ── REKLAM SETİ BAZLI EŞLEŞTİRME SİSTEMİ ──
// ══════════════════════════════════════════════════

export async function saveAdsetMappings(mappings) { await dbSaveAdsetMappings(mappings); }
export async function loadAdsetMappings() { return await getAdsetMappings(); }

export async function fetchAdsets(accessToken, since, until, forceRefresh = false) {
  const cacheKey = `${since}_${until}`;
  let rawAdsets = [];
  if (!forceRefresh) {
    const cachedData = await getAdsetsCache();
    if (cachedData && cachedData.key === cacheKey && cachedData.adsets) {
      const now = new Date().getTime();
      const cacheTime = new Date(cachedData.updatedAt).getTime();
      if (now - cacheTime < 12 * 60 * 60 * 1000) {
        console.log("⚡️ Meta Adsets Firestore Cache'den getirildi.");
        rawAdsets = cachedData.adsets;
      }
    }
  }
  if (rawAdsets.length === 0) {
    console.log("📡 Meta Adsets API'den çekiliyor...");
    let allData = [];
    let url = `${BASE_URL}/${AD_ACCOUNT_ID}/adsets?fields=id,name,campaign_id,campaign{name},daily_budget,lifetime_budget,budget_remaining,effective_status,insights.time_range({"since":"${since}","until":"${until}"}){reach,impressions,spend}&limit=500&access_token=${accessToken}`;
    while (url) {
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) throw new Error(`Meta API Hatası: ${json.error.message}`);
      if (json.data) allData = allData.concat(json.data);
      url = json.paging?.next || null;
    }
    rawAdsets = allData.map(a => {
      const insight = a.insights?.data?.[0] || null;
      return { id: a.id, name: a.name, campaignName: a.campaign ? a.campaign.name : 'Bilinmeyen Kampanya', reach: insight ? parseInt(insight.reach || 0) : 0, impressions: insight ? parseInt(insight.impressions || 0) : 0, spend: insight ? parseFloat(insight.spend || 0) : 0, daily_budget: a.daily_budget ? parseInt(a.daily_budget) / 100 : 0, lifetime_budget: a.lifetime_budget ? parseInt(a.lifetime_budget) / 100 : 0, budget_remaining: a.budget_remaining ? parseInt(a.budget_remaining) / 100 : 0, effective_status: a.effective_status || 'UNKNOWN' };
    });
    await saveAdsetsCache({ key: cacheKey, updatedAt: new Date().toISOString(), adsets: rawAdsets });
  }
  const mevcutSubeler = await getAllSubeler();
  const mevcutMappings = await loadAdsetMappings() || {};
  return {
    adsets: rawAdsets.map(a => { let kod = mevcutMappings[a.id]; if (kod && typeof kod === 'object') kod = kod.sube; return { ...a, eslesmeKod: kod || null }; }),
    mevcutSubeler: mevcutSubeler.map(s => ({ kod: s.kod, ad: s.ad })),
    mevcutMappings,
  };
}

// ══════════════════════════════════════════════════
// ── KAMPANYA BAZLI EŞLEŞTİRME SİSTEMİ ──
// ══════════════════════════════════════════════════

export async function saveCampaignMappings(mappings) { await dbSaveCampaignMappings(mappings); }
export async function loadCampaignMappings() { return await getCampaignMappings(); }

export async function fetchCampaigns(accessToken, since, until) {
  let allData = [];
  let url = `${BASE_URL}/${AD_ACCOUNT_ID}/campaigns?fields=id,name,insights.time_range({"since":"${since}","until":"${until}"}){reach,impressions,spend}&limit=500&access_token=${accessToken}`;
  while (url) {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(`Meta API Hatası: ${json.error.message}`);
    if (json.data) allData = allData.concat(json.data);
    url = json.paging?.next || null;
  }
  const mevcutSubeler = await getAllSubeler();
  const mevcutMappings = await loadCampaignMappings() || {};
  return {
    kampanyalar: allData.map(c => {
      let kod = mevcutMappings[c.id];
      if (kod && typeof kod === 'object') kod = kod.sube;
      const insight = c.insights?.data?.[0] || null;
      return { id: c.id, name: c.name, reach: insight ? parseInt(insight.reach || 0) : 0, impressions: insight ? parseInt(insight.impressions || 0) : 0, spend: insight ? parseFloat(insight.spend || 0) : 0, eslesmeKod: kod || null };
    }),
    mevcutSubeler: mevcutSubeler.map(s => ({ kod: s.kod, ad: s.ad })),
    mevcutMappings,
  };
}

export async function campaignBasedImport(accessToken, since, until, targetSubeKod = null) {
  const mappings = await loadCampaignMappings() || {};
  const adsetMappings = await loadAdsetMappings() || {};
  if (Object.keys(mappings).length === 0 && Object.keys(adsetMappings).length === 0) {
    throw new Error('Eşleştirme bulunamadı. Önce eşleştirmeleri yapın.');
  }

  const mapSube = (v) => (typeof v === 'object' ? v.sube : v);

  // Hedef şube modu: yalnızca o şubenin kampanya/adset ID'leri Meta'dan sorgulanır
  // (filtering parametresi — tüm hesabın insight'larını çekip atmak yerine)
  let targetCampIds = [];
  let targetAdsetIds = [];
  if (targetSubeKod) {
    targetCampIds = Object.keys(mappings).filter(id => mapSube(mappings[id]) === targetSubeKod);
    targetAdsetIds = Object.keys(adsetMappings).filter(id => mapSube(adsetMappings[id]) === targetSubeKod);
    if (targetCampIds.length === 0 && targetAdsetIds.length === 0) {
      throw new Error(`Hedef şube (${targetSubeKod}) için eşleştirme bulunamadı.`);
    }
  }

  const ADSET_FIELDS = 'adset_id,adset_name,campaign_id,spend,reach,impressions,actions,frequency,ctr,cpc,cpm,clicks,inline_link_clicks';
  const CAMPAIGN_FIELDS = 'campaign_id,campaign_name,reach,impressions,spend';

  const insightsUrl = (level, fields, filtering) =>
    `${BASE_URL}/${AD_ACCOUNT_ID}/insights?level=${level}&fields=${fields}` +
    `&time_range={"since":"${since}","until":"${until}"}&limit=500` +
    (filtering ? `&filtering=${encodeURIComponent(JSON.stringify(filtering))}` : '') +
    `&access_token=${accessToken}`;

  async function fetchInsightRows(url) {
    const rows = [];
    while (url) {
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) throw new Error(`Meta API Hatası: ${json.error.message}`);
      if (json.data) rows.push(...json.data);
      url = json.paging?.next || null;
    }
    return rows;
  }

  // Reklam seti seviyesinde detay çek
  // Meta filtering OR'u tek sorguda desteklemediği için kampanya ve adset
  // filtreleri ayrı sorgular olarak çalışır, satırlar adset_id ile tekilleştirilir
  let adsetCampaignMap = [];
  if (targetSubeKod) {
    const filters = [];
    if (targetCampIds.length) filters.push([{ field: 'campaign.id', operator: 'IN', value: targetCampIds }]);
    if (targetAdsetIds.length) filters.push([{ field: 'adset.id', operator: 'IN', value: targetAdsetIds }]);
    const seen = new Set();
    for (const f of filters) {
      for (const row of await fetchInsightRows(insightsUrl('adset', ADSET_FIELDS, f))) {
        const id = row.adset_id || row.id;
        if (seen.has(id)) continue;
        seen.add(id);
        adsetCampaignMap.push(row);
      }
    }
  } else {
    adsetCampaignMap = await fetchInsightRows(insightsUrl('adset', ADSET_FIELDS, null));
  }

  // Kampanya seviyesinde tekil erişim çek (hedef modda yalnızca ilgili kampanyalar)
  let campaignData = [];
  if (targetSubeKod) {
    const relevantCampIds = new Set(targetCampIds);
    for (const row of adsetCampaignMap) {
      if (row.campaign_id) relevantCampIds.add(row.campaign_id);
    }
    if (relevantCampIds.size > 0) {
      campaignData = await fetchInsightRows(
        insightsUrl('campaign', CAMPAIGN_FIELDS, [{ field: 'campaign.id', operator: 'IN', value: [...relevantCampIds] }])
      );
    }
  } else {
    campaignData = await fetchInsightRows(insightsUrl('campaign', CAMPAIGN_FIELDS, null));
  }

  // Hedef şube modunda tek şube dokümanı okunur (getAllSubeler = N read yerine 1 read)
  let mevcutSubeler;
  if (targetSubeKod) {
    const sube = await getSubeByKod(targetSubeKod);
    if (!sube) throw new Error(`Şube veritabanında bulunamadı: ${targetSubeKod}`);
    mevcutSubeler = [sube];
  } else {
    mevcutSubeler = await getAllSubeler();
  }
  const subeGruplari = {};
  const atlanan = [];

  for (const row of adsetCampaignMap) {
    const campaignId = row.campaign_id;
    const adsetId = row.adset_id || row.id;
    let subeKod = adsetMappings[adsetId];
    if (subeKod && typeof subeKod === 'object') subeKod = subeKod.sube;
    if (!subeKod) { subeKod = mappings[campaignId]; if (subeKod && typeof subeKod === 'object') subeKod = subeKod.sube; }
    if (!subeKod || subeKod === '__atla__') { atlanan.push(row.adset_name); continue; }
    if (targetSubeKod && subeKod !== targetSubeKod) continue;
    let sube = mevcutSubeler.find(s => s.kod === subeKod);
    if (!sube) { atlanan.push(row.adset_name); continue; }
    if (!subeGruplari[sube.kod]) subeGruplari[sube.kod] = { sube, rows: [], campaignIds: new Set() };
    subeGruplari[sube.kod].rows.push(row);
    subeGruplari[sube.kod].campaignIds.add(campaignId);
  }

  const sonuclar = [];
  for (const [kod, grup] of Object.entries(subeGruplari)) {
    const toplamlar = aggregateApiRows(grup.rows);
    await upsertMetaToplanlar(grup.sube.kod, since, until, toplamlar, { skipBump: true });

    // Kampanya seviyesinde tekil erişim yaz
    let toplamTekilErisim = 0;
    for (const cId of grup.campaignIds) {
      const cData = campaignData.find(c => c.campaign_id === cId);
      if (cData) toplamTekilErisim += parseInt(cData.reach) || 0;
    }
    if (toplamTekilErisim > 0) {
      await upsertToplamErisim(grup.sube.kod, since, until, toplamTekilErisim, { skipBump: true });
      console.log(`   📊 ${grup.sube.ad}: tekil erişim = ${toplamTekilErisim.toLocaleString('tr-TR')}`);
    }
    sonuclar.push({ kod, ad: grup.sube.ad, kayit: grup.rows.length, tekilErisim: toplamTekilErisim });
  }

  // Aggregate'leri sonda bir kez hesapla (2×N yerine 1×N recalc)
  await bumpAfterBatch(Object.keys(subeGruplari));

  return { count: adsetCampaignMap.length, subeSayisi: sonuclar.length, subeler: sonuclar, atlanan: atlanan.length };
}
