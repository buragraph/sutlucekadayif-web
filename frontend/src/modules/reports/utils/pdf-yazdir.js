// Rapor PDF'i — tarayıcıda üretim (Faz 3 / C1, Windows düzeltmesi)
//
// GEÇMİŞ: PDF önce sunucuda puppeteer ile üretiliyordu; Workers'a geçişte
// tarayıcıya taşındı ve `window.print()` ile yazdırma penceresi açılıyordu.
// Windows'ta bu yol tıkandı: Chrome yazdırma önizlemesi "Hedef" listesini
// dolduramayıp önizlemede asılı kalıyor ve sekme yanıt vermez hâle geliyordu
// (yazıcı sürücüsü / print spooler kaynaklı, belgeyle ilgisi yok).
//
// ŞİMDİ: yazdırma penceresine HİÇ uğranmıyor. Rapor gizli bir çerçevede
// serilip 2x çözünürlükte görüntüye çevriliyor ve doğrudan PDF olarak iniyor.
//
// GEOMETRİ KORUNUYOR: kâğıt 480px × ölçülen içerik yüksekliği, kenar boşluğu 0
// (480×1509px = 360×1131,75pt). Eski sunucu çıktısının MediaBox'ı da bu ölçekte.
//
// ÖDÜN: PDF içindeki yazı artık seçilebilir metin değil, görüntü. Tasarım ve
// ölçüler birebir; yalnızca metin kopyalanamaz.

const OLCEK = 2;          // tuval çözünürlüğü (2x = retina keskinliği)
const GENISLIK = 480;     // rapor kâğıt genişliği (CSS px)
const PT = 0.75;          // 96dpi'de 1 CSS px = 0,75 pt

// Sürüm damgası — PDF'in özelliklerine yazılır. "Hangi kodla üretildi?" sorusunu
// dosyanın kendisi cevaplasın diye var; her düzeltmede elle ilerletilir.
const SURUM = '2026-08-25.5';

/**
 * Gizli çerçeve kurar, HTML'i yükler, fontlar ve görseller hazır olana kadar bekler.
 *
 * `srcdoc` YERİNE blob URL kullanılıyor: srcdoc çerçevesinin belgesi
 * `about:srcdoc` olur ve bazı Chrome sürümlerinde kararsız davranıyor. Blob URL
 * aynı kökenlidir, `contentDocument` okunabilir.
 */
function cerceveKur(html, genislik = GENISLIK) {
    return new Promise((resolve, reject) => {
        const cerceve = document.createElement('iframe');
        // Ekran dışında ama GİZLENMEDEN durur: `visibility:hidden`/`display:none`
        // bir çerçeveden görüntü almak boş/bozuk sonuç veriyor.
        Object.assign(cerceve.style, {
            position: 'fixed', left: '-10000px', top: '0',
            width: `${genislik}px`, height: '100px', border: '0',
            opacity: '0', pointerEvents: 'none',
        });
        cerceve.setAttribute('aria-hidden', 'true');

        const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
        cerceve.dataset.blobUrl = blobUrl;

        let bitti = false;
        const vazgec = (hata) => {
            if (bitti) return;
            bitti = true;
            cerceveyiKaldir(cerceve);
            reject(hata);
        };

        cerceve.onload = async () => {
            if (bitti) return;
            const bel = cerceve.contentDocument;
            // Boş belge (henüz gerçek yükleme gelmedi) — ölçüm burada yapılırsa
            // yükseklik çerçevenin kendi boyu çıkar ve sessizce yanlış kâğıt olur.
            if (!bel?.body || bel.body.childElementCount === 0) return;
            bitti = true;
            try {
                // Kaydırma çubuğu ölçümü ve çizimi bozmadan ÖNCE etkisiz kılınır.
                // Font da burada gömülür ki hem ölçüm hem çizim aynı metrikleri görsün.
                let fontCss = '';
                try { fontCss = await fontCssUret(); } catch (e) { console.warn('[PDF] yazı tipi gömülemedi:', e.message); }
                bel.head.insertAdjacentHTML('beforeend',
                    `<style id="pdf-font">${fontCss}</style><style id="pdf-duzeltme">${DUZELTME_CSS}</style>`);
                cerceve.dataset.fontGomuldu = fontCss ? '1' : '0';
                // Çerçeveyi içeriği kapsayacak kadar büyüt — çubuk hiç oluşmasın.
                cerceve.style.height = `${Math.max(200, bel.documentElement.scrollHeight)}px`;
                if (bel.fonts?.ready) await bel.fonts.ready;
                await Promise.all(
                    [...bel.images].filter((g) => !g.complete).map(
                        (g) => new Promise((c) => { g.onload = g.onerror = c; })
                    )
                );
                resolve(cerceve);
            } catch (e) { vazgec(e); }
        };
        cerceve.onerror = () => vazgec(new Error('Rapor çerçevesi yüklenemedi'));

        cerceve.src = blobUrl;
        document.body.appendChild(cerceve);
        setTimeout(() => vazgec(new Error('Rapor hazırlanamadı (zaman aşımı)')), 30_000);
    });
}

// Inter — UYGULAMANIN KENDİ PAKETİNDEN, Google Fonts'tan değil.
// Şablon fontu `@import url(fonts.googleapis.com…)` ile çekiyor; bu, PDF'i
// görüntüye çevirirken güvenilmez: SVG içine gömülemezse metin yedek fonta
// düşüyor, yedek font daha geniş olduğu için etiketler İKİNCİ SATIRA taşıyor
// (canlı DOM 480px ve Inter yüklü görünse bile). Değişken ağırlıklı tek dosya
// 100–900 aralığını kapsıyor; latin-ext Türkçe karakterler (ş, ğ, İ, ı) için şart.
const FONT_DOSYALARI = [
    { yol: new URL('@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2', import.meta.url).href,
      aralik: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
    { yol: new URL('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', import.meta.url).href,
      aralik: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
];

let fontCssOnbellek = null;

/** Font dosyalarını data URI'ye çevirip @font-face kuralları üretir (bir kez). */
async function fontCssUret() {
    if (fontCssOnbellek) return fontCssOnbellek;
    const parcalar = await Promise.all(FONT_DOSYALARI.map(async ({ yol, aralik }) => {
        const yanit = await fetch(yol);
        if (!yanit.ok) throw new Error(`Yazı tipi indirilemedi (${yanit.status})`);
        const veri = new Uint8Array(await yanit.arrayBuffer());
        let ikili = '';
        for (let i = 0; i < veri.length; i += 8192) {
            ikili += String.fromCharCode.apply(null, veri.subarray(i, i + 8192));
        }
        return `@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;`
            + `font-display:block;src:url(data:font/woff2;base64,${btoa(ikili)}) format('woff2');`
            + `unicode-range:${aralik};}`;
    }));
    fontCssOnbellek = parcalar.join('\n');
    return fontCssOnbellek;
}

/**
 * Çerçevenin İÇİNE enjekte edilen düzeltme.
 *
 * SORUN: rapor şablonunun CSS'i `body { display:flex; justify-content:center }`
 * ve `.report { width:480px }` kullanıyor. Çerçevede dikey kaydırma çubuğu
 * çıktığında görünür alan daralıyor (Windows'ta klasik çubuk 17px) ve `.report`
 * bir FLEX ÖĞESİ olduğu için varsayılan `flex-shrink:1` ile 480 → 463px'e
 * SIKIŞIYOR. Sonuç: metinler ikinci satıra taşıyor, sağda beyaz boşluk kalıyor.
 * macOS'ta çubuklar içeriğin üstünde durup 0px yer kapladığı için sorun orada
 * hiç görünmüyordu — "bende düzgün, arkadaşta kayık" bundandı.
 *
 * Ölçüldü: arkadaşın PDF'inde içerik 463px, doğrusunda 480px.
 */
const DUZELTME_CSS = `
    html { scrollbar-width: none !important; }
    html::-webkit-scrollbar { display: none !important; width: 0 !important; }
    body { display: block !important; overflow: hidden !important; }
    .report { flex: 0 0 auto !important; width: ${GENISLIK}px !important; margin: 0 auto !important; }

    /* Tek satır olması TASARIM GEREĞİ olan sabit etiketler satır kırmaya kapatılır.
       Bunlar şablonda sabit metinler (şube adı veya kullanıcı girdisi değil) ve
       yerleşimde bol yatay boşlukları var; kırılmaları yalnızca metin ölçümü
       birkaç piksel kaydığında oluyor ve çıktıyı önizlemeden ayırıyordu.
       Çok satırlı olmak İSTENEN metinler (alt açıklamalar, bilgi kutusu, başlık,
       alt bilgi) bilinçli olarak DIŞARIDA bırakıldı. */
    .report .section-header h3,
    .report .period-badge span,
    .report .big-card .label,
    .report .big-card .value,
    .report .big-card .sub,
    .report .mini-card .label,
    .report .mini-card .value,
    .report .row-label,
    .report .row-value,
    .report .gc-label,
    .report .gc-value { white-space: nowrap !important; }
`;

function cerceveyiKaldir(cerceve) {
    const blobUrl = cerceve.dataset?.blobUrl;
    cerceve.remove();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
}

/** Sunucu tarafındaki ölçümün birebir aynısı. */
function yukseklikOlc(bel) {
    const el = bel.querySelector('.report');
    return Math.ceil(el ? el.offsetHeight : bel.documentElement.scrollHeight);
}

/** Dosya adında kullanılamayacak karakterleri temizler. */
function dosyaAdiTemizle(ad) {
    return String(ad || 'rapor')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 120) || 'rapor';
}

/**
 * HTML raporu PDF olarak indirir — yazdırma penceresi AÇILMAZ.
 * @param {string} html — /reports/preview çıktısı ya da bütçe çıktısı şablonu
 * @param {string} dosyaAdi — uzantısız ad (ör. "rapor-amasya-2026-06-23")
 * @returns {Promise<{yukseklik:number, boyut:number}>} doğrulama için
 */
export async function raporPdfIndir(html, dosyaAdi = 'rapor') {
    const cerceve = await cerceveKur(html);
    try {
        const bel = cerceve.contentDocument;
        const yukseklik = yukseklikOlc(bel);

        // Çerçeve içeriği tam kapsamalı; kısa kalırsa görüntünün altı boş çıkar.
        cerceve.style.height = `${yukseklik}px`;

        // Güvenlik ağı: rapor 480px'e oturmadıysa çizim de kayar — sessizce
        // yanlış PDF üretmektense hata ver.
        const rapor = bel.querySelector('.report');
        if (rapor && Math.abs(rapor.offsetWidth - GENISLIK) > 1) {
            throw new Error(`Rapor genişliği ${rapor.offsetWidth}px (beklenen ${GENISLIK}px) — PDF üretilmedi.`);
        }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        const [{ domToPng }, { jsPDF }] = await Promise.all([
            import('modern-screenshot'),
            import('jspdf'),
        ]);

        // NEDEN html2canvas DEĞİL: html2canvas kendi çizim motorunu kullanıyor ve
        // önizlemeden sapıyor. Ölçüldü: %3,59 piksel farkı, başlığın alt köşe
        // yuvarlaklığı kayboluyor ve içerik ~5px aşağı kayıyordu.
        // modern-screenshot `foreignObject` ile Chrome'un KENDİ layout motorunu
        // kullanıyor (yazı tiplerini de gömüyor): %1,88 fark, ortalama sapma
        // 1,62/255 — yani yalnızca kenar yumuşatma, görünür kayma yok.
        const hedef = bel.querySelector('.report') || bel.body;
        const png = await domToPng(hedef, {
            scale: OLCEK,
            width: GENISLIK,
            height: yukseklik,
            backgroundColor: '#ffffff',
        });

        // ── Teşhis damgası ──
        // Kayma/taşma şikâyetlerinde tahmin yürütmemek için üretim anındaki
        // ölçümler PDF özelliklerine yazılır: hangi sürüm, rapor gerçekten kaç
        // piksele oturdu, çerçevenin görünür alanı ne, Inter yüklendi mi.
        const teshis = {
            s: SURUM,
            genislik: rapor?.offsetWidth ?? null,
            yukseklik,
            gorunurAlan: bel.documentElement?.clientWidth ?? null,
            inter: (() => { try { return bel.fonts?.check?.('700 12px Inter') ?? null; } catch { return null; } })(),
            fontGomuldu: cerceve.dataset?.fontGomuldu === '1',
            dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
            ua: (navigator.userAgent || '').slice(0, 90),
        };
        console.info('[PDF teşhis]', teshis);

        // Birim `pt`: jsPDF'in `px` birimi 1px = 1,333pt sayıyor (480px → 640pt),
        // yani CSS pikseli değil. Dönüşümü kendimiz yapıyoruz: 96dpi'de
        // 1px = 0,75pt → 480×1509px = 360×1131,75pt. Eski sunucu çıktısının
        // MediaBox'ı da bu ölçekteydi (480×1506px = 360×1129,5pt).
        const g = GENISLIK * PT;
        const y = yukseklik * PT;
        const pdf = new jsPDF({ unit: 'pt', format: [g, y], orientation: 'portrait', compress: true });
        pdf.addImage(png, 'PNG', 0, 0, g, y, undefined, 'FAST');

        pdf.setProperties({
            title: dosyaAdiTemizle(dosyaAdi),
            creator: `Sutluce Panel ${SURUM}`,
            subject: JSON.stringify(teshis),
        });

        const ad = `${dosyaAdiTemizle(dosyaAdi)}.pdf`;
        pdf.save(ad);
        return { yukseklik, boyut: pdf.output('blob').size };
    } finally {
        cerceveyiKaldir(cerceve);
    }
}
