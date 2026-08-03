/**
 * sitemap.xml — build sırasında src/pages altındaki sayfalardan otomatik üretilir.
 * Yeni sayfa eklendiğinde elle güncelleme gerekmez.
 */

// Öncelik ipuçları (belirtilmeyen sayfalar 0.7 alır)
const ONCELIK = {
    '': '1.0',
    'urunlerimiz': '0.9',
    'lezzet-duraklarimiz': '0.9',
    'franchise': '0.9',
    'hakkimizda': '0.8',
    'kullanim-kosullari': '0.3',
    'gizlilik-politikasi': '0.3',
};

export async function GET({ site }) {
    const yollar = Object.keys(import.meta.glob('./**/*.astro'))
        .map((p) => p.replace(/^\.\//, '').replace(/\.astro$/, ''))
        .map((p) => (p === 'index' ? '' : p))
        .sort();

    const url = (yol) => {
        const loc = new URL(yol ? `${yol}/` : '', site).href;
        return `  <url>
    <loc>${loc}</loc>
    <priority>${ONCELIK[yol] ?? '0.7'}</priority>
  </url>`;
    };

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${yollar.map(url).join('\n')}
</urlset>
`;

    return new Response(xml, {
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
}
