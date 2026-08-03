// Rapor PDF'i — tarayıcıda üretim (Faz 3 / C1)
//
// Sunucu tarafındaki Chromium (puppeteer) Workers'ta çalışmıyor; PDF üretimi
// tarayıcıya taşındı. TASARIM VE GEOMETRİ BİREBİR KORUNUR:
//
//   HTML   : sunucudaki `POST /reports/preview` çıktısı — eski PDF ucunun
//            kullandığı `generateReportHtml(reportData)`'nın TA KENDİSİ.
//            Şablon kopyalanmadı; tek kaynak korunuyor, tasarım sapması imkânsız.
//   Ölçüm  : prod ile aynı seçici — `.report` varsa offsetHeight,
//            yoksa documentElement.scrollHeight (bkz. eski generate-pdf.js).
//   Kâğıt  : `@page { size: 480px <ölçülen>px; margin: 0 }` → tek sürekli sayfa.
//            Eski uç `page.pdf({ width:'480px', height:contentHeight, margin:0 })`
//            veriyordu; ölçüm referansı: amasya 2026-06-23→07-22 = 480×1506px
//            (PDF birimiyle 360×1129.92pt).
//   Arkaplan: eski uçtaki `printBackground: true` karşılığı
//            `print-color-adjust: exact`.
//
// NOT: Yazdırma diyaloğundaki "Üstbilgi/altbilgi" ve "Arka plan grafikleri"
// seçenekleri kullanıcı ayarıdır; ilki açıksa sayfaya tarayıcı kendi başlığını
// ekler. Diyalogda kapatılması gerekir (bir kez ayarlanır, hatırlanır).

const YAZDIR_STILI = (yukseklik) => `
  <style id="pdf-geometri">
    @page { size: 480px ${yukseklik}px; margin: 0; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 480px !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  </style>
`;

/** Gizli iframe kurar, HTML'i yazar, fontlar yüklenene kadar bekler. */
function cerceveKur(html) {
    return new Promise((resolve, reject) => {
        const cerceve = document.createElement('iframe');
        // Ölçüm 480px'lik sütunda yapılmalı — görünür olmamalı ama layout'a girmeli.
        Object.assign(cerceve.style, {
            position: 'fixed', left: '-10000px', top: '0',
            width: '480px', height: '100px', border: '0', visibility: 'hidden',
        });
        cerceve.setAttribute('aria-hidden', 'true');

        // DİKKAT: DOM'a eklenen boş iframe önce about:blank için bir load olayı
        // fırlatır. O olaya kanılırsa ölçüm BOŞ belgede yapılır ve yükseklik
        // iframe'in kendi yüksekliği (100px) çıkar — sessizce yanlış kâğıt.
        // Bu yüzden (a) içerik DOM'a eklemeden ÖNCE veriliyor,
        // (b) load olayında belgenin gerçekten dolu olduğu doğrulanıyor.
        let bitti = false;
        cerceve.onload = async () => {
            if (bitti) return;
            const bel = cerceve.contentDocument;
            if (!bel?.body || bel.body.childElementCount === 0) return;   // about:blank — gerçek yükleme henüz gelmedi
            bitti = true;
            try {
                if (bel.fonts?.ready) await bel.fonts.ready;
                // Görseller (varsa) yüklensin — ölçüm yüksekliği kaymasın
                await Promise.all(
                    [...bel.images].filter((g) => !g.complete).map(
                        (g) => new Promise((c) => { g.onload = g.onerror = c; })
                    )
                );
                resolve(cerceve);
            } catch (e) { reject(e); }
        };
        cerceve.onerror = () => reject(new Error('Rapor çerçevesi yüklenemedi'));
        cerceve.srcdoc = html;
        document.body.appendChild(cerceve);
        setTimeout(() => { if (!bitti) { bitti = true; cerceve.remove(); reject(new Error('Rapor hazırlanamadı (zaman aşımı)')); } }, 30_000);
    });
}

/** Prod'daki ölçümün birebir aynısı. */
function yukseklikOlc(bel) {
    const el = bel.querySelector('.report');
    return Math.ceil(el ? el.offsetHeight : bel.documentElement.scrollHeight);
}

/**
 * Tek raporu yazdırır (kullanıcı diyalogdan "PDF olarak kaydet" der).
 * @param {string} html — /reports/preview çıktısı
 * @returns {Promise<number>} ölçülen sayfa yüksekliği (px) — doğrulama için
 */
export async function raporYazdir(html) {
    const cerceve = await cerceveKur(html);
    try {
        const bel = cerceve.contentDocument;
        const yukseklik = yukseklikOlc(bel);
        bel.head.insertAdjacentHTML('beforeend', YAZDIR_STILI(yukseklik));
        // Stilin uygulanması için bir kare bekle
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        cerceve.contentWindow.focus();
        cerceve.contentWindow.print();
        return yukseklik;
    } finally {
        // Diyalog kapanmadan DOM'dan almak Chrome'da yazdırmayı bozuyor — gecikmeli sil.
        setTimeout(() => cerceve.remove(), 60_000);
    }
}

/**
 * Birden çok raporu TEK belgede yazdırır: her rapor kendi boyutunda ayrı sayfa
 * (CSS adlandırılmış sayfa kuralları). Eski `/generate-pdf-bulk` ZIP içinde N
 * ayrı PDF veriyordu; tarayıcıda ZIP üretmek ancak piksel sadakatinden ödün
 * vererek mümkün olurdu, bu yüzden çıktı "N sayfalı tek PDF"e dönüştü.
 * @param {string[]} htmlListesi
 */
export async function topluRaporYazdir(htmlListesi) {
    // Her raporun <body> içeriğini ve <style>'ını ayrı bir bölüme al
    const parcalar = htmlListesi.map((h, i) => {
        const bel = new DOMParser().parseFromString(h, 'text/html');
        const stiller = [...bel.querySelectorAll('style, link[rel="stylesheet"]')]
            .map((s) => s.outerHTML).join('\n');
        return { i, stiller, govde: bel.body.innerHTML };
    });

    const birlesik = `<!doctype html><html><head><meta charset="utf-8">
        ${parcalar[0]?.stiller ?? ''}
      </head><body>${parcalar.map((p) => `<div class="rapor-sayfa" data-i="${p.i}">${p.govde}</div>`).join('')}</body></html>`;

    const cerceve = await cerceveKur(birlesik);
    try {
        const bel = cerceve.contentDocument;
        const bolumler = [...bel.querySelectorAll('.rapor-sayfa')];
        const kurallar = bolumler.map((b, i) => {
            const el = b.querySelector('.report');
            const y = Math.ceil(el ? el.offsetHeight : b.scrollHeight);
            return `@page sayfa${i} { size: 480px ${y}px; margin: 0; }
                    .rapor-sayfa[data-i="${i}"] { page: sayfa${i}; break-after: page; }`;
        }).join('\n');
        bel.head.insertAdjacentHTML('beforeend', `<style id="pdf-geometri">
            html, body { margin:0 !important; padding:0 !important; width:480px !important;
                         -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .rapor-sayfa:last-child { break-after: auto; }
            ${kurallar}
        </style>`);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        cerceve.contentWindow.focus();
        cerceve.contentWindow.print();
        return bolumler.length;
    } finally {
        setTimeout(() => cerceve.remove(), 60_000);
    }
}
