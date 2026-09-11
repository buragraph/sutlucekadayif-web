/**
 * Duyurunun antetli belge çıktısı — önizleme ve indirme AYNI HTML'i kullanır.
 *
 * NEDEN TEK KAYNAK: önizlemeyi React ile, çıktıyı ayrı bir şablonla üretseydik
 * ikisi zamanla ayrışırdı ve "ekranda başka, PDF'te başka" şikâyeti kaçınılmaz
 * olurdu. Burada tek bir HTML belgesi üretiliyor; önizleme onu bir iframe'de
 * gösteriyor, indirme de aynı dizeyi pdf-yazdir.js'e veriyor.
 *
 * NEDEN IFRAME (önizlemede): duyuru metni panele `innerHTML` ile basılsaydı
 * yazarın koyduğu her etiket panelde çalışırdı. İçerik zaten kaçışlanıyor ama
 * çerçeve ikinci bir duvar; ayrıca belge kendi CSS'iyle yaşasın, panelin
 * Tailwind'i sızmasın diye.
 *
 * GENİŞLİK 794px = 96dpi'de A4 eni (210mm). pdf-yazdir.js CSS pikselini pt'ye
 * çeviriyor (×0,75), yani PDF tam 595pt enli bir A4 sayfası oluyor. Rapor
 * kâğıdı 480px'te kalıyor — o boru hattı değişmedi.
 */
export const BELGE_GENISLIGI = 794;
// 96dpi'de A4 boyu (297mm). Belge en az bir tam sayfa: kısa duyuruda alt bant
// sayfanın dibine oturuyor, çıktı "yarım kâğıt" gibi durmuyor. Uzun duyuruda
// belge büyüyor, PDF tarafı bu boyda sayfalara bölüyor.
export const BELGE_YUKSEKLIGI = 1123;

const kacis = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const MERKEZ = {
    adresler: [
        'Beylikdüzü Organize Sanayi Bölgesi, Beylikdüzü OSB Mah.<br>Sardunya Cad. No:8 Beylikdüzü / İSTANBUL',
        'Sanayi Mah. D-130 Karayolu Cad.<br>No:61 İç Kapı No: A İzmit / KOCAELİ',
    ],
    telefon: '0850 304 9722',
    sosyal: 'sutlucekadayif',
    site: 'sutlucekadayif.com',
};

/**
 * Düz metni paragraf ve maddelere böler.
 *
 * `-` veya `•` ile başlayan satırlar madde olur — merkez duyuruları tipik
 * olarak "şunları yapın" listesiyle bitiyor ve düz paragraf olarak basıldığında
 * okunmuyordu. Ardışık maddeler tek listede toplanır.
 */
function govdeHtml(icerik) {
    const satirlar = String(icerik || '').split('\n');
    const parcalar = [];
    let liste = null;

    for (const ham of satirlar) {
        const satir = ham.trim();
        if (!satir) { if (liste) { parcalar.push(liste); liste = null; } continue; }

        const madde = /^[-•*]\s+/.test(satir);
        if (madde) {
            const metin = kacis(satir.replace(/^[-•*]\s+/, ''));
            liste = liste || { tur: 'liste', maddeler: [] };
            liste.maddeler.push(metin);
        } else {
            if (liste) { parcalar.push(liste); liste = null; }
            parcalar.push({ tur: 'p', metin: kacis(satir) });
        }
    }
    if (liste) parcalar.push(liste);

    return parcalar.map((p) => (p.tur === 'liste'
        ? `<ul class="d-liste">${p.maddeler.map((m) => `<li>${m}</li>`).join('')}</ul>`
        : `<p>${p.metin}</p>`)).join('\n');
}

const tarihYaz = (d) => {
    const t = d ? new Date(d) : new Date();
    return Number.isNaN(t.getTime())
        ? new Date().toLocaleDateString('tr-TR')
        : t.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/**
 * @param {{baslik:string, icerik:string, tarih?:string}} duyuru
 * @param {{kok?:string}} [secenek] — varlıkların mutlak kökü; iframe/blob
 *        belgesinde göreli yol çözülmüyor, mutlak URL şart.
 */
export function duyuruBelgeHtml(duyuru, { kok = window.location.origin } = {}) {
    const baslik = kacis(duyuru?.baslik || 'Duyuru');
    const govde = govdeHtml(duyuru?.icerik);
    const tarih = tarihYaz(duyuru?.tarih);

    return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  .report { width: ${BELGE_GENISLIGI}px; min-height: ${BELGE_YUKSEKLIGI}px;
            background: #fff; color: #1a1a1a;
            display: flex; flex-direction: column; }
  .d-govde { padding: 46px 62px 34px; flex: 1; }
  .d-ust { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
  .d-logo { width: 172px; height: auto; }
  .d-tarih { font-size: 12px; color: #444; padding-top: 8px; white-space: nowrap; }
  .d-baslik { margin: 34px 0 22px; font-size: 14px; font-weight: 700; line-height: 1.45;
              text-transform: uppercase; letter-spacing: .01em; }
  .d-metin p { margin: 0 0 13px; font-size: 12.5px; line-height: 1.75; text-align: justify; }
  .d-liste { margin: 4px 0 16px; padding: 0; list-style: none; }
  .d-liste li { position: relative; margin: 0 0 9px; padding-left: 26px;
                font-size: 12.5px; line-height: 1.7; }
  /* Referans belgedeki yeşil onay işareti — madde imi olarak. */
  .d-liste li::before { content: '✔'; position: absolute; left: 0; top: -1px;
                        color: #6aa84f; font-size: 13px; }
  .d-imza { margin-top: 26px; font-size: 12.5px; font-weight: 600; }
  .d-alt { border-top: 3px solid #0f6b3a; background: #fff; padding: 16px 62px 20px;
           font-size: 9.5px; line-height: 1.5; color: #0f6b3a; }
  .d-alt-satir { display: flex; flex-wrap: wrap; gap: 28px; }
  .d-alt-kutu { flex: 1 1 240px; font-weight: 600; }
  .d-alt-ikinci { display: flex; flex-wrap: wrap; gap: 28px; margin-top: 12px;
                  font-weight: 600; }
</style></head>
<body>
  <div class="report">
    <div class="d-govde">
      <div class="d-ust">
        <img class="d-logo" src="${kok}/Varlik-1.png" alt="Sütlüce Kadayıf">
        <div class="d-tarih">${tarih}</div>
      </div>

      <h1 class="d-baslik">${baslik}</h1>
      <div class="d-metin">${govde}</div>

      <div class="d-imza">Sütlüce Kadayıf Genel Merkez Yönetimi</div>
    </div>

    <div class="d-alt">
      <div class="d-alt-satir">
        ${MERKEZ.adresler.map((a) => `<div class="d-alt-kutu">📍 ${a}</div>`).join('')}
      </div>
      <div class="d-alt-ikinci">
        <span>☎ ${MERKEZ.telefon}</span>
        <span>◎ ${MERKEZ.sosyal}</span>
        <span>⊕ ${MERKEZ.site}</span>
      </div>
    </div>
  </div>
</body></html>`;
}

/** İndirilen dosyanın adı — başlıktan türetilir. */
export function duyuruDosyaAdi(duyuru) {
    const ad = String(duyuru?.baslik || 'duyuru').trim().slice(0, 60) || 'duyuru';
    return `duyuru-${ad}`;
}
