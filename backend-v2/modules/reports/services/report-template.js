// Rapor HTML şablonu — Puppeteer ile PDF'e dönüştürülecek
// Tek sayfa, mobil dikey format (1080x1920 oranı)

// Serbest-metin alanları (şube adı, dönem etiketi vb.) HTML'e kaçışsız gömülmesin
// diye (Bulgu #14) — bugün bu alanları yalnızca admin yazıyor olsa da savunma
// derinliği için escape edilir; sayısal formatlayıcılar zaten güvenli, dokunulmadı.
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(n) {
  if (n === null || n === undefined) return '-';
  return new Intl.NumberFormat('tr-TR').format(Math.round(n));
}

function formatCurrency(n) {
  if (n === null || n === undefined) return '-';
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function generateReportHtml(data) {
  const { sube, donem, meta, google, planlananButce, devredilenMiktar, merkezDestegi } = data;
  // Toplam bütçe: planlanan + devir + merkez. Yalnızca merkez desteği girilse de (planlanan 0)
  // hesaplanır ki eksik/aşım kartı görünsün.
  const toplamButceHesap = (planlananButce || 0) + (devredilenMiktar || 0) + (merkezDestegi || 0);
  const toplamButce = toplamButceHesap > 0 ? toplamButceHesap : null;
  const eksikHarcama = toplamButce ? toplamButce - meta.toplamHarcama : null;

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: #e8e8e8;
      display: flex;
      justify-content: center;
      padding: 0;
    }

    .report {
      width: 480px;
      background: #ffffff;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* ── HEADER ── */
    .header {
      background: #0d512b;
      padding: 48px 24px 32px;
      text-align: center;
      color: #fff;
      border-radius: 0 0 32px 32px;
      position: relative;
      z-index: 1;
    }

    .header .subtitle {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.2em;
      color: #48b05d;
      text-transform: uppercase;
      margin-bottom: 12px;
    }

    .header h1 {
      font-size: 28px;
      font-weight: 900;
      letter-spacing: -0.5px;
      line-height: 1.2;
      margin-bottom: 16px;
    }

    .header h1 .branch {
      color: #48b05d;
    }

    .header .period-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(255,255,255,0.1);
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.03em;
    }

    .header .period-badge svg {
      width: 14px; height: 14px;
      color: #48b05d;
    }

    /* ── CONTENT ── */
    .content {
      padding: 20px 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* ── SECTION ── */
    .section {
      background: #f5f5f5;
      border-radius: 24px;
      padding: 20px;
      border: 1px solid #eee;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 14px;
    }

    .section-header svg {
      width: 18px; height: 18px;
      color: #0d512b;
    }

    .section-header h3 {
      font-size: 12px;
      font-weight: 700;
      color: #0d512b;
      letter-spacing: 0.15em;
      text-transform: uppercase;
    }

    /* ── INFO BOX ── */
    .info-box {
      background: #e8f3ec;
      color: #0d512b;
      font-size: 10px;
      font-weight: 500;
      padding: 10px 12px;
      border-radius: 12px;
      display: flex;
      gap: 8px;
      align-items: flex-start;
      margin-bottom: 12px;
      line-height: 1.5;
    }

    .info-box svg {
      width: 14px; height: 14px;
      color: #068b3f;
      flex-shrink: 0;
      margin-top: 1px;
    }

    /* ── BIG CARD ── */
    .big-card {
      background: #fff;
      border-radius: 16px;
      padding: 16px 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      margin-bottom: 10px;
      text-align: center;
      border: 1px solid #f0f0f0;
    }

    .big-card .label {
      font-size: 10px;
      font-weight: 700;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      margin-bottom: 4px;
    }

    .big-card .value {
      font-size: 32px;
      font-weight: 900;
      color: #0d512b;
      font-variant-numeric: tabular-nums;
      letter-spacing: -1px;
    }

    .big-card .value .unit {
      font-size: 24px;
      font-weight: 500;
      color: #068b3f;
    }

    .big-card .sub {
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
      margin-top: 6px;
    }

    .big-card .sub strong {
      color: #374151;
    }

    /* ── GRID ── */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .mini-card {
      background: #fff;
      border-radius: 12px;
      padding: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      border: 1px solid #f0f0f0;
    }

    .mini-card .label {
      font-size: 9px;
      font-weight: 700;
      color: #9ca3af;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .mini-card .value {
      font-size: 13px;
      font-weight: 900;
      color: #374151;
    }

    .mini-card.green {
      background: #e8f3ec;
      border-color: #cce4d6;
    }

    .mini-card.green .label {
      color: #068b3f;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .mini-card.green .label svg {
      width: 11px; height: 11px;
    }

    .mini-card.green .value {
      color: #0d512b;
    }

    /* ── ROW CARD ── */
    .row-card {
      background: #fff;
      padding: 14px 16px;
      border-radius: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      border: 1px solid #f0f0f0;
    }

    .row-card + .row-card {
      margin-top: 8px;
    }

    .row-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .row-left svg {
      width: 18px; height: 18px;
      flex-shrink: 0;
    }

    .row-label {
      font-size: 12px;
      font-weight: 700;
      color: #374151;
    }

    .row-sublabel {
      font-size: 8px;
      font-weight: 500;
      color: #9ca3af;
      line-height: 1.3;
      margin-top: 2px;
      max-width: 150px;
    }

    .row-value {
      font-size: 18px;
      font-weight: 900;
      color: #0d512b;
      font-variant-numeric: tabular-nums;
    }

    /* ── GRID CARD (Etkileşim) ── */
    .grid-card {
      background: #fff;
      padding: 14px;
      border-radius: 14px;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      border: 1px solid #f0f0f0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .grid-card svg {
      width: 18px; height: 18px;
      color: #068b3f;
      margin-bottom: 6px;
    }

    .grid-card .gc-value {
      font-size: 18px;
      font-weight: 900;
      color: #0d512b;
      font-variant-numeric: tabular-nums;
      margin-bottom: 2px;
    }

    .grid-card .gc-label {
      font-size: 9px;
      font-weight: 700;
      color: #6b7280;
      text-transform: uppercase;
    }

    .grid-card .gc-desc {
      font-size: 7px;
      font-weight: 500;
      color: #9ca3af;
      line-height: 1.3;
      margin-top: 3px;
    }

    /* ── FOOTER ── */
    .footer {
      padding: 12px 24px 20px;
      text-align: center;
    }

    .footer p {
      font-size: 9px;
      font-weight: 500;
      color: #9ca3af;
      max-width: 280px;
      margin: 0 auto;
      line-height: 1.5;
      display: flex;
      gap: 4px;
      align-items: flex-start;
      justify-content: center;
    }

    .footer svg {
      width: 10px; height: 10px;
      flex-shrink: 0;
      margin-top: 1px;
    }

    /* SVG icons color helpers */
    .icon-green { color: #068b3f; }
    .icon-dark { color: #0d512b; }
    .icon-blue { color: #2563eb; }
    .icon-red { color: #ef4444; }
  </style>
</head>
<body>

<div class="report">

  <!-- HEADER -->
  <div class="header">
    <div class="subtitle">Aylık Reklam Performans Raporu</div>
    <h1>Sütlüce Kadayıf<br><span class="branch">${escapeHtml(sube.ad.replace(/Sütlüce Kadayıf\s*/i, '') || sube.kod)}</span></h1>
    <div class="period-badge">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      <span>${escapeHtml(donem.label)}</span>
    </div>
  </div>

  <div class="content">

    <!-- 1. BÜTÇE & HARCAMA -->
    <div class="section">
      <div class="section-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
        <h3>Bütçe & Harcama</h3>
      </div>

      <div class="big-card">
        <div class="label">Toplam Harcama</div>
        <div class="value">${formatCurrency(meta.toplamHarcama)} <span class="unit">₺</span></div>
        ${planlananButce ? `<div class="sub">Planlanan Bütçe: <strong>${formatCurrency(planlananButce)} ₺</strong></div>` : ''}
        ${merkezDestegi ? `<div class="sub">Merkez Desteği: <strong>+${formatCurrency(merkezDestegi)} ₺</strong></div>` : ''}
      </div>

      ${toplamButce ? `
      <div class="grid-2">
        <div class="big-card" style="text-align:left">
          <div class="label">Devreden</div>
          <div class="value" style="font-size:20px;letter-spacing:0">${devredilenMiktar ? (devredilenMiktar > 0 ? '+' : '') + formatCurrency(devredilenMiktar) : '0'} <span class="unit" style="font-size:17px">₺</span></div>
          ${devredilenMiktar && devredilenMiktar !== 0 ? `<div style="font-size:8px;color:#9ca3af;font-weight:500;margin-top:2px;line-height:1.2">${devredilenMiktar > 0 ? 'Önceki aydan kalan bütçe' : 'Önceki ay fazladan harcanan bütçe'}</div>` : ''}
        </div>
        <div class="big-card" style="text-align:left;${eksikHarcama >= 0 ? 'background:rgba(34,197,94,0.06);border-color:rgba(34,197,94,0.15)' : 'background:rgba(239,68,68,0.06);border-color:rgba(239,68,68,0.15)'}">
          <div class="label" style="display:flex;align-items:center;gap:4px;${eksikHarcama >= 0 ? 'color:#16a34a' : 'color:#ef4444'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px"><polyline points="${eksikHarcama >= 0 ? '22 7 13.5 15.5 8.5 10.5 2 17' : '2 17 8.5 10.5 13.5 15.5 22 7'}"/></svg>
            ${eksikHarcama >= 0 ? 'Eksik Harcama' : 'Bütçe Aşımı'}
          </div>
          <div class="value" style="font-size:20px;letter-spacing:0;color:${eksikHarcama >= 0 ? '#0d512b' : '#dc2626'}">${formatCurrency(Math.abs(eksikHarcama))} <span class="unit" style="font-size:17px;color:inherit">₺</span></div>
          <div style="font-size:8px;color:${eksikHarcama >= 0 ? '#16a34a' : '#ef4444'};font-weight:500;margin-top:2px;line-height:1.2">${eksikHarcama >= 0 ? 'Planlanan bütçenin altında harcandı' : 'Planlanan bütçe aşıldı'}</div>
        </div>
      </div>
      ` : ''}
    </div>

    <!-- 2. REKLAM ERİŞİM VERİLERİ -->
    <div class="section">
      <div class="section-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <h3>Reklam Erişim Verileri</h3>
      </div>

      <div class="info-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <p>Bu veriler Instagram ve Facebook üzerinden reklamların ulaştığı kullanıcıları göstermektedir.</p>
      </div>

      <div class="row-card">
        <div class="row-left">
          <svg class="icon-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <div>
            <div class="row-label">Toplam Erişim</div>
            <div class="row-sublabel">Instagram ve Facebook üzerinden ulaşılan kişi sayısı</div>
          </div>
        </div>
        <div class="row-value">${formatNumber(meta.toplamErisim)}</div>
      </div>

      <div class="row-card">
        <div class="row-left">
          <svg class="icon-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          <div class="row-label">Toplam Gösterim</div>
        </div>
        <div class="row-value">${formatNumber(meta.toplamGosterim)}</div>
      </div>
    </div>

    <!-- 3. ETKİLEŞİM VERİLERİ -->
    <div class="section">
      <div class="section-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        <h3>Etkileşim Verileri</h3>
      </div>

      <div class="grid-2">
        <div class="grid-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
          <div class="gc-value">${formatNumber(meta.toplamTiklama)}</div>
          <div class="gc-label">Bağlantı Tıklaması</div>
        </div>
        <div class="grid-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
          <div class="gc-value">${formatNumber(meta.toplamTiklamaTumu)}</div>
          <div class="gc-label">Tıklama (Tümü)</div>
        </div>
        <div class="grid-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16,6 12,2 8,6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          <div class="gc-value">${formatNumber(meta.toplamPaylasim)}</div>
          <div class="gc-label">Paylaşım</div>
          <div class="gc-desc">Reklamın kullanıcılar tarafından birbirine gönderilme sayısı</div>
        </div>
        <div class="grid-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
          <div class="gc-value">${formatNumber(meta.toplamYorum)}</div>
          <div class="gc-label">Yorum</div>
        </div>
      </div>
    </div>

    <!-- 4. GOOGLE İŞLETME -->
    ${google ? `
    <div class="section">
      <div class="section-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/></svg>
        <h3>Google İşletme</h3>
      </div>

      <div class="row-card">
        <div class="row-left">
          <svg class="icon-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <div class="row-label">Google Arama</div>
        </div>
        <div class="row-value">${formatNumber(google.toplamArama)}</div>
      </div>

      <div class="row-card">
        <div class="row-left">
          <svg class="icon-red" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <div class="row-label">Google Haritalar</div>
        </div>
        <div class="row-value">${formatNumber(google.toplamHarita)}</div>
      </div>

      <div class="row-card">
        <div class="row-left">
          <svg class="icon-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
          <div class="row-label">Yol Tarifi Alma</div>
        </div>
        <div class="row-value">${formatNumber(google.yolTarifi)}</div>
      </div>

      <div class="row-card">
        <div class="row-left">
          <svg class="icon-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>
          <div class="row-label">Telefon Araması</div>
        </div>
        <div class="row-value">${formatNumber(google.telefon)}</div>
      </div>
    </div>
    ` : ''}

  </div>

  <!-- FOOTER -->
  <div class="footer">
    <p>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      Bu rapor, Meta Ads (Instagram & Facebook) ve Google Business Profile verileri kullanılarak hazırlanmıştır.
    </p>
  </div>

</div>

</body>
</html>`;
}
