"use client";

export type ExportFormat = "a4" | "led-tatli" | "led-diger" | "pleksi-tatli" | "pleksi-diger" | "a5-tatli" | "a5-diger";
export type OutputType = "pdf" | "png" | "jpeg";

export const formats: Array<{ id: ExportFormat; label: string }> = [
  { id: "a4", label: "A4" },
  { id: "led-tatli", label: "LED - 1" },
  { id: "led-diger", label: "LED - 2" },
  { id: "pleksi-tatli", label: "Pleksi Ön Yüz" },
  { id: "pleksi-diger", label: "Pleksi Arka Yüz" },
  { id: "a5-tatli", label: "A5 Ön Yüz" },
  { id: "a5-diger", label: "A5 Arka Yüz" },
];

export function formatForGroup(format: ExportFormat, group: "dessert" | "other"): ExportFormat {
  if (format === "a4") return format;
  return `${format.split("-")[0]}-${group === "dessert" ? "tatli" : "diger"}` as ExportFormat;
}

/**
 * Çıktı ölçüleri.
 *
 * `width`/`height` RASTER piksel, `pdfWidth`/`pdfHeight` PDF sayfa ölçüsü (pt).
 *
 * BASKI FORMATLARINDA sayfa fiziksel ölçü: A4 595×842pt, pleksi 10×21cm, A5
 * yarım A4. Raster de o ölçüde 300 dpi verecek şekilde seçilmiş.
 *
 * LED FARKLI, ÇÜNKÜ LED BASKI DEĞİL. Ekranın santimetresi yok, ölçüsü 1080×1920
 * PİKSEL. Sayfa 405×720pt açılınca (192 dpi) tasarımcı dosyayı LED boyutuna
 * getirmek için 2,67 kat büyütmek zorunda kalıyor ve görüntü piksel piksel
 * görünüyor — bildirilen kusur buydu. Sayfa artık 1080×1920pt: Illustrator'da
 * 1pt = 1px olduğu için LED tuvaline BÜYÜTMEDEN, birebir oturuyor.
 * (PNG/JPEG zaten 1080×1920 raster veriyordu, o yüzden onlarda sorun yoktu.)
 */
export const outputSpecs: Record<ExportFormat, { width: number; height: number; pdfWidth: number; pdfHeight: number; label: string }> = {
  a4: { width: 2480, height: 3508, pdfWidth: 595.28, pdfHeight: 841.89, label: "A4" },
  "led-tatli": { width: 1080, height: 1920, pdfWidth: 1080, pdfHeight: 1920, label: "LED-1" },
  "led-diger": { width: 1080, height: 1920, pdfWidth: 1080, pdfHeight: 1920, label: "LED-2" },
  "pleksi-tatli": { width: 1181, height: 2480, pdfWidth: 283.46, pdfHeight: 595.28, label: "Pleksi-On-Yuz" },
  "pleksi-diger": { width: 1181, height: 2480, pdfWidth: 283.46, pdfHeight: 595.28, label: "Pleksi-Arka-Yuz" },
  "a5-tatli": { width: 1748, height: 2480, pdfWidth: 419.53, pdfHeight: 595.28, label: "A5-On-Yuz" },
  "a5-diger": { width: 1748, height: 2480, pdfWidth: 419.53, pdfHeight: 595.28, label: "A5-Arka-Yuz" },
};

const exportFonts = [
  { family: "Mondia Sütlüce", weight: 400, style: "normal", path: "/fonts/mondia-400.otf", format: "opentype" },
  { family: "Mondia Sütlüce", weight: 400, style: "italic", path: "/fonts/mondia-400-italic.otf", format: "opentype" },
  { family: "Mondia Sütlüce", weight: 700, style: "normal", path: "/fonts/mondia-700.otf", format: "opentype" },
  { family: "Mondia Sütlüce", weight: 700, style: "italic", path: "/fonts/mondia-700-italic.otf", format: "opentype" },
] as const;

let embeddedFontCssPromise: Promise<string> | null = null;

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Logo çıktıya eklenemedi."));
    reader.readAsDataURL(blob);
  });
}

function embeddedFontCss() {
  if (!embeddedFontCssPromise) {
    embeddedFontCssPromise = Promise.all(exportFonts.map(async font => {
      const response = await fetch(new URL(font.path, window.location.href));
      if (!response.ok) throw new Error("Yazı tipleri çıktıya eklenemedi.");
      const dataUrl = await blobToDataUrl(await response.blob());
      return `@font-face{font-family:'${font.family}';src:url('${dataUrl}') format('${font.format}');font-weight:${font.weight};font-style:${font.style};font-display:block;}`;
    }))
      .then(rules => rules.join(""))
      .catch(error => {
        // A transient font request must not poison every later export attempt.
        embeddedFontCssPromise = null;
        throw error;
      });
  }
  return embeddedFontCssPromise;
}

async function serializeSvg(element: SVGSVGElement, width: number, height: number) {
  await document.fonts?.ready;
  const clone = element.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  // Preserve the preview's coordinate system so the exported bitmap is a
  // pixel-perfect high-resolution scale of the SVG shown on screen.
  if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = await embeddedFontCss();
  clone.insertBefore(style, clone.firstChild);
  for (const image of Array.from(clone.querySelectorAll("image"))) {
    const href = image.getAttribute("href") || image.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    if (!href || href.startsWith("data:")) continue;
    const response = await fetch(new URL(href, window.location.href));
    if (!response.ok) throw new Error("Logo çıktıya eklenemedi.");
    image.setAttribute("href", await blobToDataUrl(await response.blob()));
  }
  return new XMLSerializer().serializeToString(clone);
}

async function renderSvgToCanvas(element: SVGSVGElement, width: number, height: number) {
  const source = await serializeSvg(element, width, height);
  const sourceUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Ön izleme çıktıya dönüştürülemedi."));
      image.src = sourceUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Çıktı yüzeyi oluşturulamadı.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Dosya oluşturulamadı.")), type, quality));
}

function concatBytes(parts: Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

export function createImagePdf(jpeg: Uint8Array, imageWidth: number, imageHeight: number, pageWidth: number, pageHeight: number) {
  const encoder = new TextEncoder();
  const objects: Uint8Array[] = [];
  objects.push(encoder.encode("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"));
  objects.push(encoder.encode("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"));
  objects.push(encoder.encode(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`));
  objects.push(concatBytes([encoder.encode(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, encoder.encode("\nendstream\nendobj\n")]));
  const commands = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
  objects.push(encoder.encode(`5 0 obj\n<< /Length ${commands.length} >>\nstream\n${commands}endstream\nendobj\n`));
  const header = encoder.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const offsets: number[] = [0];
  let cursor = header.length;
  for (const object of objects) { offsets.push(cursor); cursor += object.length; }
  const xrefStart = cursor;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let index = 1; index <= 5; index++) xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  const trailer = `${xref}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Blob([concatBytes([header, ...objects, encoder.encode(trailer)])], { type: "application/pdf" });
}

export async function createFormatFile(element: SVGSVGElement, format: ExportFormat, branchName: string, outputType: OutputType) {
  const spec = outputSpecs[format];
  const canvas = await renderSvgToCanvas(element, spec.width, spec.height);
  let blob: Blob;
  if (outputType === "png") blob = await canvasBlob(canvas, "image/png");
  else if (outputType === "jpeg") blob = await canvasBlob(canvas, "image/jpeg", 0.96);
  else {
    const jpegBlob = await canvasBlob(canvas, "image/jpeg", 0.96);
    blob = createImagePdf(new Uint8Array(await jpegBlob.arrayBuffer()), spec.width, spec.height, spec.pdfWidth, spec.pdfHeight);
  }
  const safeBranch = branchName.toLocaleLowerCase("tr-TR").replaceAll("ı", "i").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sube";
  const extension = outputType === "jpeg" ? "jpg" : outputType;
  return { name: `Sutluce-Kadayif-${safeBranch}-${spec.label}.${extension}`, blob };
}

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function u16(value: number) { return new Uint8Array([value & 255, (value >>> 8) & 255]); }
function u32(value: number) { return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]); }

export async function createZip(files: Array<{ name: string; blob: Blob }>) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(data);
    const local = concatBytes([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);
    localParts.push(local);
    centralParts.push(concatBytes([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]));
    offset += local.length;
  }
  const central = concatBytes(centralParts);
  const end = concatBytes([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(central.length),u32(offset),u16(0)]);
  return new Blob([concatBytes([...localParts, central, end])], { type: "application/zip" });
}
