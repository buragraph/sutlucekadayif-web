import { upsertSube, upsertMetaVeri, getAllSubeler, upsertToplamErisim, deleteMetaVeriByDonem, getMetaMappings, saveMetaMappings as dbSaveMetaMappings, getCampaignMappings, saveCampaignMappings as dbSaveCampaignMappings, getAdsetMappings, saveAdsetMappings as dbSaveAdsetMappings } from '../db.js';

const GRAPH_API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Sütlüce Kadayıf Ad Account
const AD_ACCOUNT_ID = 'act_1095694041713379';

// Eşleştirmeleri kaydet/yükle
export async function saveMappings(eslesmeler) {
  await dbSaveMetaMappings(eslesmeler);
}

export async function loadMappings() {
  return await getMetaMappings();
}

// Türkçe → slug
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

// actions dizisinden belirli action_type değerini çek
function getActionValue(actions, actionType) {
  if (!actions) return 0;
  const found = actions.find(a => a.action_type === actionType);
  return found ? parseInt(found.value) || 0 : 0;
}

// Reklam seti adından akıllı prefix çıkar (1 veya 2 segment)
// Örn: "Ankara-Eryaman-UGC1" → "Ankara-Eryaman"
//      "Antalya-HerŞeyYerindeYenmeli" → "Antalya"  
//      "Kocaeli-Masukiye-BoluInfluencer" → "Kocaeli-Masukiye"
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
  
  // İkinci parça tarih mi? (sayı ile başlıyor)
  if (/^\d/.test(p2)) return p1;
  
  // İkinci parça kreatif anahtar kelime mi?
  const p2lower = p2.toLowerCase().normalize('NFC').replace(/\s/g, '');
  const isCreative = CREATIVE_KEYWORDS.some(kw => p2lower.includes(kw));
  if (isCreative) return p1;
  
  // Bilinen ilçe/semt adlarıyla başlıyorsa her zaman konum olarak kabul et
  const KNOWN_DISTRICTS = ['kecioren', 'kozyatagi', 'pursaklar', 'eryaman', 'etimesgut', 'mamak', 'sincan', 'baglica', 'gunesevler', 'karapurcek', 'etlik', 'maltepe', 'masukiye', 'pendik', 'kadikoy', 'kartal', 'kordon', 'alsancak', 'bornova', 'buca', 'lara', 'kepez', 'konyaalti', 'muratpasa', 'sapanca', 'duzce', 'bolu'];
  const p2slug = turkishToSlug(p2);
  const startsWithDistrict = KNOWN_DISTRICTS.some(d => p2slug.startsWith(d));
  if (startsWithDistrict) return `${p1}-${p2}`;
  
  // İkinci parça çok uzunsa kesinlikle kreatif isim
  if (p2.length > 15) return p1;
  
  // İkinci parça bir konum/şube adı — iki segmenti birleştir
  return `${p1}-${p2}`;
}

// Hesap seviyesinde tekil erişim çek (deduplicated)
export async function fetchAccountLevelReach(accessToken, since, until) {
  const url = `${BASE_URL}/${AD_ACCOUNT_ID}/insights?fields=reach,impressions,spend&time_range={"since":"${since}","until":"${until}"}&access_token=${accessToken}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(`Meta API Hatası: ${json.error.message}`);
  if (json.data && json.data.length > 0) {
    return {
      reach: parseInt(json.data[0].reach) || 0,
      impressions: parseInt(json.data[0].impressions) || 0,
      spend: parseFloat(json.data[0].spend) || 0,
    };
  }
  return { reach: 0, impressions: 0, spend: 0 };
}

// Kampanya seviyesinde tekil erişim çek (şube bazlı deduplicated)
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

  // Kampanya isimlerinden bölge/şube çıkar ve grupla
  // Kampanya formatı: "P.Z/Soğuk/Ankara/9.09" → 3. segment = bölge
  const subeReach = {};
  for (const row of allData) {
    const name = row.campaign_name || '';
    const parts = name.split('/');
    // Son segmentten tarih olabilir, bölge adı genelde 3. segment
    let region = null;
    for (const p of parts) {
      const clean = p.trim();
      // Tarih veya kısa parçaları atla
      if (/^\d/.test(clean) || clean.length < 2) continue;
      // P.Z, Soğuk gibi genel terimleri atla
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

// Meta API'den reklam seti verilerini çek
export async function fetchMetaInsights(accessToken, timeRange) {
  const { since, until } = timeRange;
  
  const fields = [
    'adset_id',
    'adset_name',
    'spend',
    'reach',
    'impressions',
    'actions',
    'cost_per_action_type',
    'frequency',
    'ctr',
    'cpc',
    'cpm',
    'clicks',
    'inline_link_clicks',
  ].join(',');

  let allData = [];
  let url = `${BASE_URL}/${AD_ACCOUNT_ID}/insights?level=adset&fields=${fields}&time_range={"since":"${since}","until":"${until}"}&limit=500&use_account_attribution_setting=true&filtering=[{"field":"spend","operator":"GREATER_THAN","value":"0"}]&access_token=${accessToken}`;

  // Pagination — tüm sonuçları çek
  while (url) {
    const res = await fetch(url);
    const json = await res.json();
    
    if (json.error) {
      throw new Error(`Meta API Hatası: ${json.error.message}`);
    }
    
    if (json.data) {
      console.log(`   📊 Sayfa: ${json.data.length} sonuç (date_start: ${json.data[0]?.date_start}, date_stop: ${json.data[0]?.date_stop})`);
      allData = allData.concat(json.data);
    }
    url = json.paging?.next || null;
  }

  return allData;
}

// Verileri şubelere eşleştir ve veritabanına yaz
export async function importFromMetaApi(accessToken, since, until) {
  console.log(`\n📡 Meta API'den veri çekiliyor: ${since} → ${until}`);
  
  const rawData = await fetchMetaInsights(accessToken, { since, until });
  console.log(`   ${rawData.length} reklam seti bulundu`);
  
  if (rawData.length === 0) {
    return { count: 0, subeler: [], hatalar: [] };
  }

  // Mevcut şubeleri yükle
  const mevcutSubeler = await getAllSubeler();
  
  // Reklam setlerini şubelere göre grupla
  const subeGruplari = {};
  const hatalar = [];
  
  for (const row of rawData) {
    const adsetName = row.adset_name || '';
    // Ön-ek: tire veya "/" veya boşluk ile ayrılmış ilk kelime
    const prefix = extractPrefix(adsetName);
    
    if (!prefix || prefix.length < 2) {
      hatalar.push({ adset: adsetName, error: 'Şube prefix çıkarılamadı' });
      continue;
    }
    
    const slug = turkishToSlug(prefix);
    
    // Eşleştir
    let sube = mevcutSubeler.find(s => s.kod === slug);
    if (!sube) {
      sube = mevcutSubeler.find(s => s.kod.includes(slug) || slug.includes(s.kod));
    }
    
    if (!sube) {
      // Yeni şube oluştur
      sube = await upsertSube(slug, `Sütlüce Kadayıf ${prefix}`);
      mevcutSubeler.push(sube);
    }
    
    if (!subeGruplari[sube.kod]) {
      subeGruplari[sube.kod] = { sube, rows: [] };
    }
    subeGruplari[sube.kod].rows.push(row);
  }
  
  // Her şube için verileri kaydet
  const sonuclar = [];
  for (const [kod, grup] of Object.entries(subeGruplari)) {
    let kayitSayisi = 0;
    
    for (const row of grup.rows) {
      const veri = {
        donem_baslangic: since,
        donem_bitis: until,
        reklam_seti: row.adset_name || 'Bilinmiyor',
        durum: 'active',
        harcama: parseFloat(row.spend) || 0,
        erisim: parseInt(row.reach) || 0,
        gosterim: parseInt(row.impressions) || 0,
        sonuc: getActionValue(row.actions, 'link_click') || getActionValue(row.actions, 'post_engagement') || 0,
        sonuc_basina_ucret: 0,
        siklik: parseFloat(row.frequency) || 0,
        hook_rate: 0,
        hold_rate: 0,
        ctr: parseFloat(row.ctr) || 0,
        ctr_link: 0,
        cpc: parseFloat(row.cpc) || 0,
        cpc_link: 0,
        cpm: parseFloat(row.cpm) || 0,
        baglanti_tiklamalari: parseInt(row.inline_link_clicks) || 0,
        tiklamalar_tumu: parseInt(row.clicks) || 0,
        mesajlasmalar: getActionValue(row.actions, 'onsite_conversion.messaging_conversation_started_7d'),
        mesaj_basina_ucret: 0,
        telefon_aramalari: 0,
        yorumlar: getActionValue(row.actions, 'comment'),
        paylasimlar: getActionValue(row.actions, 'post'),
      };

      // sonuc_basina_ucret hesapla
      if (veri.sonuc > 0) {
        veri.sonuc_basina_ucret = veri.harcama / veri.sonuc;
      }
      // mesaj_basina_ucret hesapla
      if (veri.mesajlasmalar > 0) {
        veri.mesaj_basina_ucret = veri.harcama / veri.mesajlasmalar;
      }

      await upsertMetaVeri(grup.sube.id, veri);
      kayitSayisi++;
    }
    
    sonuclar.push({ kod, ad: grup.sube.ad, kayit: kayitSayisi });
    console.log(`   ✅ ${grup.sube.ad}: ${kayitSayisi} reklam seti`);
  }
  
  console.log(`\n✅ Toplam: ${sonuclar.length} şube, ${rawData.length} reklam seti\n`);
  
  return {
    count: rawData.length,
    subeSayisi: sonuclar.length,
    subeler: sonuclar,
    hatalar,
  };
}

// ── Önizleme: Reklam setlerini grupla, kaydetme ──
export async function previewMetaInsights(accessToken, since, until) {
  const rawData = await fetchMetaInsights(accessToken, { since, until });
  if (rawData.length === 0) return { gruplar: [], toplamKayit: 0 };

  const mevcutSubeler = await getAllSubeler();

  // Prefix'lere göre grupla
  const prefixMap = {};
  for (const row of rawData) {
    const adsetName = row.adset_name || '';
    const prefix = extractPrefix(adsetName);
    if (!prefix || prefix.length < 2) continue;

    const slug = turkishToSlug(prefix);
    if (!prefixMap[slug]) {
      // Otomatik eşleştirme öner
      let eslesen = mevcutSubeler.find(s => s.kod === slug);
      if (!eslesen) eslesen = mevcutSubeler.find(s => s.kod.includes(slug) || slug.includes(s.kod));
      
      prefixMap[slug] = {
        prefix,
        slug,
        eslesenKod: eslesen?.kod || null,
        eslesenAd: eslesen?.ad || null,
        kayitSayisi: 0,
        reklamSetleri: [],
      };
    }
    prefixMap[slug].kayitSayisi++;
    prefixMap[slug].reklamSetleri.push(adsetName);
  }

  const gruplar = Object.values(prefixMap).sort((a, b) => b.kayitSayisi - a.kayitSayisi);

  return {
    gruplar,
    toplamKayit: rawData.length,
    mevcutSubeler: mevcutSubeler.map(s => ({ kod: s.kod, ad: s.ad })),
  };
}

// ── Manuel eşleştirmeyle kaydet ──
export async function confirmMetaImport(accessToken, since, until, eslesmeleri) {
  // eslesmeleri = { slug: subeKod, ... } — kullanıcının manuel belirlediği eşleştirmeler
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

    // Kullanıcının eşleştirmesini kullan
    const hedefKod = eslesmeleri[slug];
    if (!hedefKod || hedefKod === '__atla__') {
      atlanan.push(adsetName);
      continue;
    }

    // Hedef şubeyi bul veya oluştur
    let sube = mevcutSubeler.find(s => s.kod === hedefKod);
    if (!sube) {
      sube = await upsertSube(hedefKod, `Sütlüce Kadayıf ${prefix}`);
      mevcutSubeler.push(sube);
    }

    if (!subeGruplari[sube.kod]) {
      subeGruplari[sube.kod] = { sube, rows: [] };
    }
    subeGruplari[sube.kod].rows.push(row);
  }

  // Kaydet
  const sonuclar = [];
  for (const [kod, grup] of Object.entries(subeGruplari)) {
    // Önce bu şube+dönemin eski verilerini temizle (çift kayıt önleme)
    await deleteMetaVeriByDonem(grup.sube.id, since, until);
    
    // Debug: ham API değerlerini logla
    const rawTotal = grup.rows.reduce((a, r) => a + (parseFloat(r.spend) || 0), 0);
    console.log(`   🔍 ${grup.sube.ad}: ${grup.rows.length} satır, ham toplam=₺${rawTotal.toFixed(2)}`);
    for (const r of grup.rows) {
      console.log(`      - [${r.adset_id}] ${(r.adset_name||'').substring(0,50)} | spend=${r.spend} | date: ${r.date_start}→${r.date_stop}`);
    }
    
    let kayitSayisi = 0;
    for (const row of grup.rows) {
      const veri = {
        donem_baslangic: since,
        donem_bitis: until,
        reklam_seti: row.adset_id || row.adset_name || 'Bilinmiyor',
        durum: 'active',
        harcama: parseFloat(row.spend) || 0,
        erisim: parseInt(row.reach) || 0,
        gosterim: parseInt(row.impressions) || 0,
        sonuc: getActionValue(row.actions, 'link_click') || getActionValue(row.actions, 'post_engagement') || 0,
        sonuc_basina_ucret: 0,
        siklik: parseFloat(row.frequency) || 0,
        hook_rate: 0, hold_rate: 0,
        ctr: parseFloat(row.ctr) || 0, ctr_link: 0,
        cpc: parseFloat(row.cpc) || 0, cpc_link: 0,
        cpm: parseFloat(row.cpm) || 0,
        baglanti_tiklamalari: parseInt(row.inline_link_clicks) || 0,
        tiklamalar_tumu: parseInt(row.clicks) || 0,
        mesajlasmalar: getActionValue(row.actions, 'onsite_conversion.messaging_conversation_started_7d'),
        mesaj_basina_ucret: 0,
        telefon_aramalari: 0,
        yorumlar: getActionValue(row.actions, 'comment'),
        paylasimlar: getActionValue(row.actions, 'post'),
      };
      if (veri.sonuc > 0) veri.sonuc_basina_ucret = veri.harcama / veri.sonuc;
      if (veri.mesajlasmalar > 0) veri.mesaj_basina_ucret = veri.harcama / veri.mesajlasmalar;

      await upsertMetaVeri(grup.sube.id, veri);
      kayitSayisi++;
    }
    const setDetay = grup.rows.map(r => ({
      isim: r.adset_name || 'Bilinmiyor',
      harcama: parseFloat(r.spend) || 0,
      erisim: parseInt(r.reach) || 0,
    }));
    sonuclar.push({ kod, ad: grup.sube.ad, kayit: kayitSayisi, setler: setDetay });
  }

  // Kampanya seviyesinde tekil erişim çek ve toplamErisim olarak yaz
  try {
    const campaignReach = await fetchCampaignLevelReach(accessToken, since, until);
    for (const [kod, grup] of Object.entries(subeGruplari)) {
      // Kampanya reach'te bu şubeye ait veri var mı?
      const match = campaignReach[kod];
      if (match && match.reach > 0) {
        await upsertToplamErisim(grup.sube.id, since, until, match.reach);
        console.log(`   📊 ${grup.sube.ad}: tekil erişim = ${match.reach}`);
        // sonuçlara tekil erişimi ekle
        const s = sonuclar.find(x => x.kod === kod);
        if (s) s.tekilErisim = match.reach;
      }
    }
  } catch (err) {
    console.log('   ⚠️ Kampanya erişim çekilemedi:', err.message);
  }

  return { count: rawData.length, subeSayisi: sonuclar.length, subeler: sonuclar, atlanan: atlanan.length };
}

// ══════════════════════════════════════════════════
// ── REKLAM SETİ BAZLI EŞLEŞTİRME SİSTEMİ ──
// ══════════════════════════════════════════════════

export async function saveAdsetMappings(mappings) {
  await dbSaveAdsetMappings(mappings);
}

export async function loadAdsetMappings() {
  return await getAdsetMappings();
}

export async function fetchAdsets(accessToken, since, until) {
  let allData = [];
  // '/insights' yerine doğrudan '/adsets' endpointini çağırarak harcaması 0 olan reklam setlerini de çekiyoruz.
  let url = `${BASE_URL}/${AD_ACCOUNT_ID}/adsets?fields=id,name,campaign_id,campaign{name},insights.time_range({"since":"${since}","until":"${until}"}){reach,impressions,spend}&limit=500&access_token=${accessToken}`;
  
  while (url) {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(`Meta API Hatası: ${json.error.message}`);
    if (json.data) allData = allData.concat(json.data);
    url = json.paging?.next || null;
  }

  const mevcutSubeler = await getAllSubeler();
  const mevcutMappings = await loadAdsetMappings() || {};

  return {
    adsets: allData.map(a => {
      // insights verisi varsa al, yoksa 0 değerleri
      const insight = a.insights && a.insights.data && a.insights.data.length > 0 ? a.insights.data[0] : null;
      return {
        id: a.id,
        name: a.name,
        campaignName: a.campaign ? a.campaign.name : 'Bilinmeyen Kampanya',
        reach: insight ? parseInt(insight.reach || 0) : 0,
        impressions: insight ? parseInt(insight.impressions || 0) : 0,
        spend: insight ? parseFloat(insight.spend || 0) : 0,
        eslesmeKod: mevcutMappings[a.id] || null,
      };
    }),
    mevcutSubeler: mevcutSubeler.map(s => ({ kod: s.kod, ad: s.ad })),
    mevcutMappings,
  };
}

// ══════════════════════════════════════════════════
// ── KAMPANYA BAZLI EŞLEŞTİRME SİSTEMİ ──
// ══════════════════════════════════════════════════

// Kampanya eşleştirmelerini kaydet/yükle
export async function saveCampaignMappings(mappings) {
  await dbSaveCampaignMappings(mappings);
}

export async function loadCampaignMappings() {
  return await getCampaignMappings();
}

// Tüm kampanyaları listele
export async function fetchCampaigns(accessToken, since, until) {
  let allData = [];
  let url = `${BASE_URL}/${AD_ACCOUNT_ID}/insights?level=campaign&fields=campaign_id,campaign_name,reach,impressions,spend&time_range={"since":"${since}","until":"${until}"}&limit=500&access_token=${accessToken}`;
  while (url) {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(`Meta API Hatası: ${json.error.message}`);
    if (json.data) allData = allData.concat(json.data);
    url = json.paging?.next || null;
  }

  // Mevcut şubeleri al ve mevcut eşleştirmeleri yükle
  const mevcutSubeler = await getAllSubeler();
  const mevcutMappings = await loadCampaignMappings() || {};

  return {
    kampanyalar: allData.map(c => ({
      id: c.campaign_id,
      name: c.campaign_name,
      reach: parseInt(c.reach) || 0,
      impressions: parseInt(c.impressions) || 0,
      spend: parseFloat(c.spend) || 0,
      eslesmeKod: mevcutMappings[c.campaign_id] || null,
    })),
    mevcutSubeler: mevcutSubeler.map(s => ({ kod: s.kod, ad: s.ad })),
    mevcutMappings,
  };
}

// Kampanya bazlı veri çek ve kaydet
export async function campaignBasedImport(accessToken, since, until, targetSubeKod = null) {
  const mappings = await loadCampaignMappings() || {};
  const adsetMappings = await loadAdsetMappings() || {};

  if (Object.keys(mappings).length === 0 && Object.keys(adsetMappings).length === 0) {
    throw new Error('Eşleştirme bulunamadı. Önce eşleştirmeleri yapın.');
  }

  // Eğer belirli bir şube istenmişse ve bu şubeye ait eşleştirme yoksa hata fırlat (prefix bazlı metoda düşmesi için)
  if (targetSubeKod) {
    const hasCamp = Object.values(mappings).includes(targetSubeKod);
    const hasAdset = Object.values(adsetMappings).includes(targetSubeKod);
    if (!hasCamp && !hasAdset) {
      throw new Error(`Hedef şube (${targetSubeKod}) için eşleştirme bulunamadı.`);
    }
  }


  // 1. Kampanya seviyesinde tekil erişim çek
  let campaignData = [];
  let url = `${BASE_URL}/${AD_ACCOUNT_ID}/insights?level=campaign&fields=campaign_id,campaign_name,reach,impressions,spend&time_range={"since":"${since}","until":"${until}"}&limit=500&access_token=${accessToken}`;
  while (url) {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(`Meta API Hatası: ${json.error.message}`);
    if (json.data) campaignData = campaignData.concat(json.data);
    url = json.paging?.next || null;
  }

  // 2. Reklam seti seviyesinde detay verileri çek (kampanya ID'leriyle birlikte)
  let adsetCampaignMap = [];
  let url2 = `${BASE_URL}/${AD_ACCOUNT_ID}/insights?level=adset&fields=adset_id,adset_name,campaign_id,spend,reach,impressions,actions,frequency,ctr,cpc,cpm,clicks,inline_link_clicks&time_range={"since":"${since}","until":"${until}"}&limit=500&access_token=${accessToken}`;
  while (url2) {
    const res = await fetch(url2);
    const json = await res.json();
    if (json.error) throw new Error(`Meta API Hatası: ${json.error.message}`);
    if (json.data) adsetCampaignMap = adsetCampaignMap.concat(json.data);
    url2 = json.paging?.next || null;
  }

  // 4. Kampanya → şube eşleştirmesiyle reklam setlerini gruplayan kayıt
  const mevcutSubeler = await getAllSubeler();
  const subeGruplari = {};
  const atlanan = [];

  for (const row of adsetCampaignMap) {
    const campaignId = row.campaign_id;
    const adsetId = row.adset_id || row.id;

    // Öncelik 1: Reklam seti özel eşleştirmesi
    let subeKod = adsetMappings[adsetId];
    
    // Öncelik 2: Kampanya eşleştirmesi
    if (!subeKod) subeKod = mappings[campaignId];

    if (!subeKod || subeKod === '__atla__') {
      atlanan.push(row.adset_name);
      continue;
    }

    if (targetSubeKod && subeKod !== targetSubeKod) {
      continue;
    }

    let sube = mevcutSubeler.find(s => s.kod === subeKod);
    if (!sube) {
      atlanan.push(row.adset_name);
      continue;
    }

    if (!subeGruplari[sube.kod]) {
      subeGruplari[sube.kod] = { sube, rows: [], campaignIds: new Set() };
    }
    subeGruplari[sube.kod].rows.push(row);
    subeGruplari[sube.kod].campaignIds.add(campaignId);
  }

  // 5. Kaydet
  const sonuclar = [];
  for (const [kod, grup] of Object.entries(subeGruplari)) {
    let kayitSayisi = 0;
    for (const row of grup.rows) {
      const veri = {
        donem_baslangic: since,
        donem_bitis: until,
        reklam_seti: row.adset_name || 'Bilinmiyor',
        durum: 'active',
        harcama: parseFloat(row.spend) || 0,
        erisim: parseInt(row.reach) || 0,
        gosterim: parseInt(row.impressions) || 0,
        sonuc: getActionValue(row.actions, 'link_click') || getActionValue(row.actions, 'post_engagement') || 0,
        sonuc_basina_ucret: 0,
        siklik: parseFloat(row.frequency) || 0,
        hook_rate: 0, hold_rate: 0,
        ctr: parseFloat(row.ctr) || 0, ctr_link: 0,
        cpc: parseFloat(row.cpc) || 0, cpc_link: 0,
        cpm: parseFloat(row.cpm) || 0,
        baglanti_tiklamalari: parseInt(row.inline_link_clicks) || 0,
        tiklamalar_tumu: parseInt(row.clicks) || 0,
        mesajlasmalar: getActionValue(row.actions, 'onsite_conversion.messaging_conversation_started_7d'),
        mesaj_basina_ucret: 0,
        telefon_aramalari: 0,
        yorumlar: getActionValue(row.actions, 'comment'),
        paylasimlar: getActionValue(row.actions, 'post'),
      };
      if (veri.sonuc > 0) veri.sonuc_basina_ucret = veri.harcama / veri.sonuc;
      if (veri.mesajlasmalar > 0) veri.mesaj_basina_ucret = veri.harcama / veri.mesajlasmalar;
      await upsertMetaVeri(grup.sube.id, veri);
      kayitSayisi++;
    }

    // Kampanya seviyesinde tekil erişim yaz
    let toplamTekilErisim = 0;
    for (const cId of grup.campaignIds) {
      const cData = campaignData.find(c => c.campaign_id === cId);
      if (cData) toplamTekilErisim += parseInt(cData.reach) || 0;
    }
    if (toplamTekilErisim > 0) {
      await upsertToplamErisim(grup.sube.id, since, until, toplamTekilErisim);
      console.log(`   📊 ${grup.sube.ad}: tekil erişim = ${toplamTekilErisim.toLocaleString('tr-TR')}`);
    }

    sonuclar.push({ kod, ad: grup.sube.ad, kayit: kayitSayisi, tekilErisim: toplamTekilErisim });
  }

  return { count: adsetCampaignMap.length, subeSayisi: sonuclar.length, subeler: sonuclar, atlanan: atlanan.length };
}
