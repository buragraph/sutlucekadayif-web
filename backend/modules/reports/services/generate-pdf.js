/**
 * PDF Üretim Servisi — Firebase Functions (Gen 2) Uyumlu
 * ──────────────────────────────────────────────────────
 * @sparticuz/chromium + puppeteer-core kullanır.
 * Dosya sistemine yazmaz — PDF'i Buffer olarak döndürür.
 */

/**
 * HTML içeriğinden PDF Buffer üretir.
 * @param {string} htmlContent - PDF'e dönüştürülecek HTML string
 * @returns {Buffer} PDF içeriği
 */
export async function generatePdf(htmlContent) {
  // Ağır paketler cold start'ı şişirmemek için ilk kullanımda yüklenir
  const [{ default: chromium }, { default: puppeteerCore }] = await Promise.all([
    import('@sparticuz/chromium'),
    import('puppeteer-core'),
  ]);

  let browser = null;
  try {
    browser = await puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();

    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    const contentHeight = await page.evaluate(() => {
      const el = document.querySelector('.report');
      return el ? el.offsetHeight : document.documentElement.scrollHeight;
    });

    const pdfBuffer = await page.pdf({
      printBackground: true,
      width: '480px',
      height: `${contentHeight}px`,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    console.log(`📄 PDF oluşturuldu (${(pdfBuffer.length / 1024).toFixed(0)} KB)`);
    return Buffer.from(pdfBuffer);
  } catch (err) {
    console.error('❌ PDF oluşturma hatası:', err.message);
    throw err;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
