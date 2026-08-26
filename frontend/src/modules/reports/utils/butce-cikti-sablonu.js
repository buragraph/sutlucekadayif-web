// Bütçe toplama çıktısı — yazdırılabilir HTML şablonu
//
// GEOMETRİ: şube reklam raporuyla aynı — 480px genişlik, tek sürekli sayfa.
// Yükseklik `raporPdfIndir()` tarafından ölçülür ve PDF kâğıdı o boyda açılır;
// bu yüzden kökte `.report` sınıfı ZORUNLU (ölçüm o seçiciye bakıyor,
// bkz. utils/pdf-yazdir.js).
//
// Tasarım kullanıcının verdiği mobil düzenden taşındı: koyu yeşil başlık,
// #f5f5f5 bölüm blokları, beyaz kartlar. Önceki A4 sürümündeki "bakiye
// seçenekleri tablosu", "11 sütunlu şube tablosu" ve "sütun sözlüğü" bu
// düzende yok; yerlerini kompakt şube listesi aldı.

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function kacis(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 12500 → "12.500" · 12500.5 → "12.500,50" (birim ayrı yazılır) */
function sayi(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
    const s = Number(n);
    const ondalikli = Math.abs(s % 1) > 0.004;
    return new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: ondalikli ? 2 : 0,
        maximumFractionDigits: ondalikli ? 2 : 0,
    }).format(s);
}

/** "12.500 TL" — tasarımdaki birim yazımı */
function para(n) {
    const g = sayi(n);
    return g === '—' ? '—' : `${g} TL`;
}

function tarih(iso) {
    if (!iso) return '—';
    const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
    if (Number.isNaN(d.getTime())) return kacis(iso);
    return `${d.getDate()} ${AYLAR[d.getMonth()]} ${d.getFullYear()}`;
}

function tarihSaat(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return '—';
    // Gün ve saat aynı (yerel) kaynaktan okunmalı — toISOString ile karıştırılırsa
    // gece yarısı çevresinde tarih bir gün kayar.
    const ss = String(d.getHours()).padStart(2, '0');
    const dd = String(d.getMinutes()).padStart(2, '0');
    return `${d.getDate()} ${AYLAR[d.getMonth()]} ${d.getFullYear()} ${ss}:${dd}`;
}

/** "Ağustos - Eylül Reklam Dönemi" → üst satır + vurgulu alt satır */
function basligiBol(baslik) {
    const kelimeler = String(baslik || '').trim().split(/\s+/);
    if (kelimeler.length < 3) return { ust: baslik || '', alt: '' };
    return { ust: kelimeler.slice(0, -2).join(' '), alt: kelimeler.slice(-2).join(' ') };
}

const IKON = {
    takvim: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    cuzdan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>',
    magaza: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M2 7h20"/></svg>',
    bina: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>',
    pasta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>',
    banknot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>',
    fis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/></svg>',
    jeton: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>',
    konum: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
    canta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/></svg>',
    banka: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>',
    artis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
    azalis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>',
    bilgi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
};

/** Küçük finans kartı (2'li ızgara hücresi) */
function miniKart({ ikon, tutar, baslik, aciklama, vurgu = false, genis = false }) {
    return `
      <div class="mini-kart${vurgu ? ' vurgu' : ''}${genis ? ' genis' : ''}">
        <div class="mk-ust">
          <span class="mk-ikon">${ikon}</span>
          <div class="mk-tutar">${kacis(tutar)}</div>
        </div>
        <div>
          <div class="mk-baslik">${kacis(baslik)}</div>
          <div class="mk-aciklama">${kacis(aciklama)}</div>
        </div>
      </div>`;
}

/**
 * Bütçe toplama çıktısının tam HTML'i.
 * @param {object} v — BudgetCampaignsPage'in hazırladığı veri
 * @returns {string}
 */
export function butceCiktiHtml(v) {
    const {
        baslik, donemBaslangic, donemBitis,
        aliciAdi, iban, odemeNotu,
        satirlar = [], ozet, katilim, olusturma,
    } = v;

    const { ust, alt } = basligiBol(baslik);
    const katilanlar = satirlar.filter((s) => s.durum === 'gonderildi' || s.durum === 'onaylandi');
    const katilanSayi = katilim?.dolduran ?? katilanlar.length;
    const toplamSayi = katilim?.toplam ?? satirlar.length;
    const katilmayan = Math.max(0, toplamSayi - katilanSayi);
    const yuzde = katilim?.yuzde ?? 0;
    const konumOranPct = Math.round((ozet.metaOrani ?? 0.05) * 100);

    // ── Şube bütçe dağılımı: yalnızca katılan şubeler, tutara göre büyükten küçüğe ──
    const dagilim = katilanlar
        .map((s) => ({ ad: s.ad, butce: Number(s.bakiye) || 0, destek: Number(s.merkezDestegi) || 0 }))
        .filter((s) => s.butce > 0 || s.destek > 0)
        .sort((a, b) => (b.butce + b.destek) - (a.butce + a.destek));

    const dagilimSatirlari = dagilim.map((s) => {
        if (s.butce > 0 && s.destek > 0) {
            return `
        <div class="liste-satir karma">
          <span class="sube-ad vurgulu">${kacis(s.ad)}</span>
          <div class="karma-sag">
            <div class="etiketli"><span class="rozet butce">Bütçe</span><span class="liste-tutar soluk">${para(s.butce)}</span></div>
            <div class="etiketli"><span class="rozet destek">Destek</span><span class="liste-tutar soluk">${para(s.destek)}</span></div>
            <div class="ayirac"></div>
            <span class="liste-tutar toplam">${para(s.butce + s.destek)}</span>
          </div>
        </div>`;
        }
        const destekMi = s.destek > 0;
        return `
        <div class="liste-satir">
          <span class="sube-ad">${kacis(s.ad)}</span>
          <div class="etiketli">
            <span class="rozet ${destekMi ? 'destek' : 'butce'}">${destekMi ? 'Destek' : 'Bütçe'}</span>
            <span class="liste-tutar${destekMi ? ' yesil' : ''}">${para(destekMi ? s.destek : s.butce)}</span>
          </div>
        </div>`;
    }).join('');

    // ── Devreden bakiyeler ──
    const devirler = satirlar
        .filter((s) => Number(s.devredilen))
        .map((s) => ({ ad: s.ad, tutar: Number(s.devredilen) }))
        .sort((a, b) => Math.abs(b.tutar) - Math.abs(a.tutar));
    const eksikToplam = devirler.filter((d) => d.tutar > 0).reduce((t, d) => t + d.tutar, 0);
    const fazlaToplam = devirler.filter((d) => d.tutar < 0).reduce((t, d) => t + Math.abs(d.tutar), 0);

    const devirKartlari = devirler.map((d) => {
        const eksik = d.tutar > 0;
        return `
        <div class="devir-kart">
          <div class="devir-ust">
            <div class="devir-ad">${kacis(d.ad)}</div>
            <div class="devir-tutar${eksik ? ' yesil' : ''}">${para(Math.abs(d.tutar))}</div>
          </div>
          <div class="devir-alt">
            <div>
              <div class="devir-kaynak-etiket">Kaynak</div>
              <div class="devir-kaynak">Önceki Reklam Dönemi</div>
            </div>
            <div class="devir-rozet ${eksik ? 'eksik' : 'fazla'}">
              ${eksik ? IKON.azalis : IKON.artis} ${eksik ? 'Eksik Harcama' : 'Fazla Harcama'}
            </div>
          </div>
        </div>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Bütçe Toplama Raporu — ${kacis(baslik)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Neulis Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #e8e8e8;
      display: flex;
      justify-content: center;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .report { width: 480px; background: #fff; display: flex; flex-direction: column; overflow: hidden; }

    /* ── BAŞLIK ── */
    .ust {
      background: #0d512b; color: #fff; text-align: center;
      padding: 56px 24px 40px; border-radius: 0 0 36px 36px;
      position: relative; z-index: 1;
    }
    .ust .kicik {
      font-size: 10px; font-weight: 700; letter-spacing: 0.3em;
      color: #48b05d; text-transform: uppercase; margin-bottom: 16px;
    }
    .ust h1 { font-size: 36px; font-weight: 900; letter-spacing: -0.9px; margin-bottom: 8px; }
    .ust h3 { font-size: 18px; font-weight: 500; color: rgba(255,255,255,0.9); margin-bottom: 24px; line-height: 1.35; }
    .ust h3 .vurgu { color: #48b05d; font-weight: 700; }
    .rozet-tarih {
      display: inline-flex; align-items: center; gap: 8px;
      background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.05);
      padding: 10px 20px; border-radius: 999px;
      font-size: 12px; font-weight: 600; letter-spacing: 0.02em;
    }
    .rozet-tarih svg { width: 16px; height: 16px; color: #48b05d; }

    /* ── GÖVDE ── */
    .govde { padding: 24px 20px; background: #fff; display: flex; flex-direction: column; gap: 24px; }
    .blok { background: #f5f5f5; border: 1px solid #f0f0f0; border-radius: 28px; padding: 24px; }
    .blok-baslik { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
    .blok-baslik svg { width: 20px; height: 20px; color: #0d512b; }
    .blok-baslik h3 { font-size: 13px; font-weight: 700; color: #0d512b; letter-spacing: 0.12em; text-transform: uppercase; }

    /* ── BÜYÜK KART ── */
    .buyuk-kart {
      background: #fff; border: 1px solid #fafafa; border-radius: 20px;
      padding: 24px; margin-bottom: 16px; text-align: center;
      position: relative; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .buyuk-kart .serit {
      position: absolute; top: 0; left: 0; width: 100%; height: 4px;
      background: linear-gradient(to right, #0d512b, #068b3f, #48b05d);
    }
    .buyuk-kart .etiket {
      font-size: 11px; font-weight: 700; color: #9ca3af;
      text-transform: uppercase; letter-spacing: 0.12em; margin: 4px 0 8px;
    }
    .buyuk-kart .tutar {
      font-size: 36px; font-weight: 900; color: #0d512b;
      font-variant-numeric: tabular-nums; letter-spacing: -1.2px; margin-bottom: 8px;
    }
    .buyuk-kart .tutar .birim { font-size: 20px; color: #068b3f; }
    .buyuk-kart .aciklama { font-size: 9px; font-weight: 500; color: #9ca3af; line-height: 1.4; max-width: 250px; margin: 0 auto; }

    /* ── MİNİ KARTLAR ── */
    .izgara { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .mini-kart {
      background: #fff; border: 1px solid #fafafa; border-radius: 16px; padding: 16px;
      display: flex; flex-direction: column; justify-content: space-between;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .mini-kart.genis { grid-column: 1 / -1; }
    .mini-kart.vurgu { background: #e8f3ec; border-color: #cce4d6; }
    .mk-ust { margin-bottom: 8px; }
    .mk-ikon svg { width: 16px; height: 16px; color: #068b3f; display: block; margin-bottom: 6px; }
    .mini-kart.vurgu .mk-ikon svg { color: #0d512b; }
    .mk-tutar { font-size: 18px; font-weight: 900; color: #1f2937; font-variant-numeric: tabular-nums; }
    .mini-kart.vurgu .mk-tutar { color: #0d512b; }
    .mk-baslik { font-size: 9px; font-weight: 700; color: #1f2937; text-transform: uppercase; line-height: 1.3; margin-bottom: 2px; }
    .mini-kart.vurgu .mk-baslik { color: #0d512b; }
    .mk-aciklama { font-size: 8px; color: #9ca3af; line-height: 1.35; }
    .mini-kart.vurgu .mk-aciklama { color: rgba(13,81,43,0.7); }

    /* ── KATILIM ── */
    .katilim-kart {
      background: #fff; border: 1px solid #fafafa; border-radius: 20px;
      padding: 24px; margin-bottom: 12px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .katilim-kart .etiket { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 4px; }
    .katilim-kart .oran { font-size: 36px; font-weight: 900; color: #0d512b; font-variant-numeric: tabular-nums; letter-spacing: -1.2px; margin-bottom: 4px; }
    .katilim-kart .oran .bolu { font-size: 20px; color: #d1d5db; font-weight: 500; margin: 0 4px; }
    .katilim-kart .oran .toplam { font-size: 24px; color: #9ca3af; }
    .katilim-kart .alt-yazi { font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 16px; }
    .cubuk-sarmal { width: 200px; margin: 0 auto; }
    .cubuk-etiket { font-size: 10px; font-weight: 700; color: #9ca3af; margin-bottom: 6px; }
    .cubuk { height: 10px; background: #f3f4f6; border-radius: 999px; overflow: hidden; }
    .cubuk i { display: block; height: 100%; background: #068b3f; border-radius: 999px; }
    .sayac-izgara { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .sayac {
      background: #fff; border: 1px solid #fafafa; border-radius: 12px; padding: 12px;
      display: flex; align-items: center; justify-content: center; gap: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .sayac .nokta { width: 8px; height: 8px; border-radius: 999px; }
    .sayac .nokta.yesil { background: #068b3f; }
    .sayac .nokta.gri { background: #d1d5db; }
    .sayac .etiket { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; }
    .sayac .deger { font-size: 14px; font-weight: 900; color: #1f2937; }

    /* ── ŞUBE LİSTESİ ── */
    .liste { background: #fff; border: 1px solid #fafafa; border-radius: 20px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .liste-baslik {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 16px; background: rgba(249,250,251,0.8); border-bottom: 1px solid #f3f4f6;
    }
    .liste-baslik span { font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.12em; }
    .liste-govde { padding: 0 16px; }
    .liste-satir { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #fafafa; gap: 10px; }
    .liste-satir.karma { align-items: flex-start; }
    .liste-satir:last-child { border-bottom: 0; }
    .sube-ad { font-size: 12px; font-weight: 700; color: #1f2937; }
    .sube-ad.vurgulu { font-weight: 900; color: #0d512b; padding-top: 2px; }
    .etiketli { display: flex; align-items: center; gap: 8px; }
    .rozet { font-size: 8px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
    .rozet.butce { background: #f3f4f6; color: #6b7280; }
    .rozet.destek { background: #e8f3ec; color: #0d512b; }
    .liste-tutar { font-size: 12px; font-weight: 700; color: #1f2937; font-variant-numeric: tabular-nums; text-align: right; min-width: 82px; }
    .liste-tutar.yesil { color: #0d512b; }
    .liste-tutar.soluk { font-size: 11px; font-weight: 600; color: #6b7280; }
    .liste-tutar.toplam { font-size: 12px; font-weight: 900; color: #0d512b; }
    .karma-sag { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .ayirac { width: 100%; height: 1px; background: #f3f4f6; margin: 2px 0; }
    .liste-alt { background: rgba(249,250,251,0.5); border-top: 1px solid #f3f4f6; padding: 10px; text-align: center; }
    .liste-alt span { font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.12em; }

    /* ── DEVİR ── */
    .devir-ozet { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
    .devir-ozet .kutu { background: #fff; border: 1px solid #fafafa; border-radius: 12px; padding: 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .devir-ozet .kutu .etiket { font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; line-height: 1.3; margin-bottom: 8px; }
    .devir-ozet .kutu .deger { font-size: 18px; font-weight: 900; font-variant-numeric: tabular-nums; }
    .devir-ozet .kutu .deger.yesil { color: #0d512b; }
    .devir-ozet .kutu .deger.gri { color: #1f2937; }
    .devir-kart { background: #fff; border: 1px solid #fafafa; border-radius: 16px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .devir-kart + .devir-kart { margin-top: 12px; }
    .devir-ust { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 10px; }
    .devir-ad { font-size: 14px; font-weight: 900; color: #0d512b; }
    .devir-tutar { font-size: 14px; font-weight: 700; color: #1f2937; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .devir-tutar.yesil { color: #0d512b; }
    .devir-alt { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; }
    .devir-kaynak-etiket { font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; margin-bottom: 2px; }
    .devir-kaynak { font-size: 10px; font-weight: 600; color: #4b5563; }
    .devir-rozet {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 9px; font-weight: 700; padding: 4px 8px; border-radius: 6px;
      text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;
    }
    .devir-rozet svg { width: 12px; height: 12px; }
    .devir-rozet.eksik { background: #e8f3ec; color: #0d512b; }
    .devir-rozet.fazla { background: #f3f4f6; color: #4b5563; }

    /* ── ÖDEME ── */
    .odeme-satir { background: #fff; border: 1px solid #fafafa; border-radius: 12px; padding: 12px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .odeme-satir + .odeme-satir { margin-top: 10px; }
    .odeme-satir .etiket { font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.08em; }
    .odeme-satir .deger { font-size: 12px; font-weight: 700; color: #1f2937; margin-top: 3px; word-break: break-word; }
    .odeme-satir .deger.iban { font-family: 'SFMono-Regular', Consolas, monospace; letter-spacing: 0.03em; }
    .odeme-satir .deger.not { font-weight: 500; color: #4b5563; }

    /* ── ALT BİLGİ ── */
    .alt-bilgi { padding: 8px 16px 32px; text-align: center; }
    .alt-bilgi .satir { display: flex; align-items: flex-start; justify-content: center; gap: 6px; font-size: 10px; font-weight: 500; color: #9ca3af; }
    .alt-bilgi svg { width: 12px; height: 12px; flex-shrink: 0; margin-top: 1px; }
    .alt-bilgi p { max-width: 280px; line-height: 1.5; }
    .alt-bilgi .damga { font-size: 9px; color: #b9bec7; margin-top: 6px; }
  </style>
</head>
<body>

<div class="report">

  <div class="ust">
    <div class="kicik">Bütçe Toplama Raporu</div>
    <h1>Sütlüce Kadayıf</h1>
    <h3>${kacis(ust)}${alt ? `<br><span class="vurgu">${kacis(alt)}</span>` : ''}</h3>
    <div class="rozet-tarih">
      ${IKON.takvim}
      <span>${tarih(donemBaslangic)} – ${tarih(donemBitis)}</span>
    </div>
  </div>

  <div class="govde">

    <!-- 1. BÜTÇE ÖZETİ -->
    <div class="blok">
      <div class="blok-baslik">${IKON.cuzdan}<h3>Bütçe Özeti</h3></div>

      <div class="buyuk-kart">
        <div class="serit"></div>
        <div class="etiket">Harcanacak Tutar</div>
        <div class="tutar">${sayi(ozet.harcanacak)} <span class="birim">TL</span></div>
        <p class="aciklama">Şube reklam bütçeleri + merkezi destek + %${konumOranPct} Meta Konum Ücreti</p>
      </div>

      <div class="izgara">
        ${miniKart({
            ikon: IKON.banknot, tutar: para(ozet.toplananKdv),
            baslik: 'KDV + Konum Ücreti Dahil Toplanan',
            aciklama: 'Şubelerden tahsil edilen, KDV ve konum ücreti dahil toplam tutar',
        })}
        ${miniKart({
            ikon: IKON.fis, tutar: para(ozet.kdvTutari),
            baslik: 'KDV Tutarı',
            aciklama: 'Şubelerden tahsil edilen toplam tutarın KDV tutarı',
        })}
        ${miniKart({
            ikon: IKON.jeton, tutar: para(ozet.kdvHaric ?? ozet.toplamBakiye),
            baslik: 'KDV + Konum Ücreti Hariç Toplanan',
            aciklama: 'Şubelerden tahsil edilen tutarın KDV ve konum ücreti hariç karşılığı',
        })}
        ${miniKart({
            ikon: IKON.konum, tutar: para(ozet.toplamKonumUcreti || 0),
            baslik: `Konum Ücreti (%${konumOranPct})`,
            aciklama: 'Şubelerin reklam bakiyesi üzerinden Meta\'ya ödenen konum ücreti',
        })}
        ${miniKart({
            ikon: IKON.canta, tutar: para(ozet.toplamMerkez), vurgu: true, genis: true,
            baslik: 'Merkez Desteği',
            aciklama: 'Şubelere verilen merkezi destek',
        })}
      </div>
    </div>

    <!-- 2. ŞUBE KATILIMI -->
    <div class="blok">
      <div class="blok-baslik">${IKON.magaza}<h3>Şube Katılımı</h3></div>

      <div class="katilim-kart">
        <div class="etiket">Katılan / Toplam Şube</div>
        <div class="oran">
          ${katilanSayi}<span class="bolu">/</span><span class="toplam">${toplamSayi}</span>
        </div>
        <div class="alt-yazi">${katilanSayi} Şube Katıldı</div>
        <div class="cubuk-sarmal">
          <div class="cubuk-etiket">%${yuzde} Katılım Oranı</div>
          <div class="cubuk"><i style="width:${Math.min(100, Math.max(0, yuzde))}%"></i></div>
        </div>
      </div>

      <div class="sayac-izgara">
        <div class="sayac">
          <div class="nokta yesil"></div>
          <div><div class="etiket">Katılan</div><div class="deger">${katilanSayi} Şube</div></div>
        </div>
        <div class="sayac">
          <div class="nokta gri"></div>
          <div><div class="etiket">Katılmayan</div><div class="deger">${katilmayan} Şube</div></div>
        </div>
      </div>
    </div>

    <!-- 3. ŞUBE BÜTÇE DAĞILIMI -->
    ${dagilim.length ? `
    <div class="blok">
      <div class="blok-baslik">${IKON.bina}<h3>Şube Bütçe Dağılımı</h3></div>
      <div class="liste">
        <div class="liste-baslik"><span>Şube Adı</span><span>Tutar &amp; Kaynak</span></div>
        <div class="liste-govde">${dagilimSatirlari}</div>
        <div class="liste-alt"><span>${dagilim.length} Şube</span></div>
      </div>
    </div>` : ''}

    <!-- 4. DEVREDEN BAKİYELER -->
    ${devirler.length ? `
    <div class="blok">
      <div class="blok-baslik">${IKON.pasta}<h3>Devreden Reklam Bakiyeleri</h3></div>
      <div class="devir-ozet">
        <div class="kutu">
          <div class="etiket">Toplam Devreden<br>Eksik Harcama</div>
          <div class="deger yesil">${para(eksikToplam)}</div>
        </div>
        <div class="kutu">
          <div class="etiket">Toplam Devreden<br>Fazla Harcama</div>
          <div class="deger gri">${para(fazlaToplam)}</div>
        </div>
      </div>
      ${devirKartlari}
    </div>` : ''}

    <!-- 5. ÖDEME BİLGİLERİ -->
    ${(aliciAdi || iban || odemeNotu) ? `
    <div class="blok">
      <div class="blok-baslik">${IKON.banka}<h3>Ödeme Bilgileri</h3></div>
      ${aliciAdi ? `<div class="odeme-satir"><div class="etiket">Alıcı</div><div class="deger">${kacis(aliciAdi)}</div></div>` : ''}
      ${iban ? `<div class="odeme-satir"><div class="etiket">IBAN</div><div class="deger iban">${kacis(iban)}</div></div>` : ''}
      ${odemeNotu ? `<div class="odeme-satir"><div class="etiket">Not</div><div class="deger not">${kacis(odemeNotu)}</div></div>` : ''}
    </div>` : ''}

    <div class="alt-bilgi">
      <div class="satir">
        ${IKON.bilgi}
        <p>Bu rapor, ilgili reklam dönemine ait bütçe toplama verilerini özetlemektedir.</p>
      </div>
      <div class="damga">${tarihSaat(olusturma)}</div>
    </div>

  </div>
</div>

</body>
</html>`;
}
