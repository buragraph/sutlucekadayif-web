"use client";

import { categoryOrder, CategoryType, hasProductPrice, Product } from "./data";
import { ExportFormat, formats } from "./export-utils";

type Section = {
  category: string;
  items: Product[];
  continuationIndex?: number;
};
type CanvasSpec = {
  width: number;
  height: number;
  marginX: number;
  contentTop: number;
  contentBottom: number;
  columnGap: number;
  minBody: number;
  maxBody: number;
};

type LayoutSolution = {
  columns: Section[][];
  columnsCount: number;
  columnWidth: number;
  drawWidth: number;
  body: number;
  gap: number;
};

const GREEN = "#005232";
const MONDIA = "'Mondia Sütlüce', Georgia, 'Times New Roman', serif";
const MIN_CATEGORY_GAP = 24;
const NORMAL_CATEGORY_GAP = 32;
const MAX_CATEGORY_GAP = 48;
const MAX_SPARSE_CATEGORY_GAP = 110;
const MIN_NAME_PRICE_GAP = 12;
// Keep kilogram and portion prices visually distinct at every output scale.
// A visibly wider gutter keeps kilogram and portion prices from reading as one
// number while the word-aware wrapper protects product-name readability.
const PRICE_COLUMN_GAP_RATIO = 1.65;
const ROW_GAP_RATIO = 0.12;
const RULE_FIRST_ROW_GAP_RATIO = 1.24;
const HEADING_LINE_HEIGHT_RATIO = 1.08;
const HEADING_RULE_GAP_RATIO = 0.5;
const ALLERGEN_NOTE =
  "Alerjen bilgilerine web sayfamız üzerinden ulaşabilir veya kasadan talep edebilirsiniz.";

function displayPrice(value: number) {
  return value === 0 ? "000₺" : `${String(value).replace(".", ",")}₺`;
}

const canvasSpecs: Record<ExportFormat, CanvasSpec> = {
  a4: {
    width: 1240,
    height: 1754,
    marginX: 78,
    contentTop: 286,
    contentBottom: 1568,
    columnGap: 38,
    minBody: 15,
    maxBody: 28,
  },
  "led-tatli": {
    width: 1080,
    height: 1920,
    marginX: 78,
    contentTop: 110,
    contentBottom: 1735,
    columnGap: 52,
    minBody: 21,
    maxBody: 31,
  },
  "led-diger": {
    width: 1080,
    height: 1920,
    marginX: 70,
    contentTop: 110,
    contentBottom: 1740,
    columnGap: 48,
    minBody: 18,
    maxBody: 29,
  },
  "pleksi-tatli": {
    width: 1181,
    height: 2480,
    marginX: 86,
    contentTop: 330,
    contentBottom: 2260,
    columnGap: 56,
    minBody: 24,
    maxBody: 34,
  },
  "pleksi-diger": {
    width: 1181,
    height: 2480,
    marginX: 78,
    contentTop: 315,
    contentBottom: 2268,
    columnGap: 52,
    minBody: 21,
    maxBody: 35,
  },
  "a5-tatli": {
    width: 1184,
    height: 1680,
    marginX: 72,
    contentTop: 240,
    contentBottom: 1510,
    columnGap: 44,
    minBody: 21,
    maxBody: 32,
  },
  "a5-diger": {
    width: 1184,
    height: 1680,
    marginX: 72,
    contentTop: 240,
    contentBottom: 1510,
    columnGap: 44,
    minBody: 21,
    maxBody: 32,
  },
};

function groupProducts(products: Product[]) {
  const grouped = products.reduce<Record<string, Product[]>>(
    (result, product) => {
      (result[product.category] ??= []).push(product);
      return result;
    },
    {},
  );
  const knownDesserts = categoryOrder.filter(
    (category) =>
      grouped[category]?.length &&
      grouped[category][0]?.outputGroup === "dessert",
  );
  const knownOthers = categoryOrder.filter(
    (category) =>
      grouped[category]?.length && grouped[category][0]?.outputGroup !== "dessert",
  );
  const custom = Object.keys(grouped).filter(
    (category) => !categoryOrder.includes(category),
  );
  const customDesserts = custom.filter(
    (category) =>
      (grouped[category][0]?.categoryType as CategoryType | undefined) ===
        "dessert" || grouped[category][0]?.outputGroup === "dessert",
  );
  const customOthers = custom.filter(
    (category) => !customDesserts.includes(category),
  );
  return [
    ...knownDesserts,
    ...customDesserts,
    ...knownOthers,
    ...customOthers,
  ].map((category) => ({
    category,
    items: grouped[category],
  }));
}

function sectionTitle(section: Section) {
  const title = section.category.toLocaleUpperCase("tr-TR");
  return section.continuationIndex ? `${title} — DEVAM` : title;
}

function sectionKey(section: Section) {
  return `${section.category}-${section.continuationIndex ?? 0}`;
}

function splitContiguousByHeight(
  sections: Section[],
  count: number,
  width: number,
  body: number,
  format: ExportFormat,
) {
  if (count <= 1 || sections.length <= 1) return [sections];
  const heights = sections.map((section) =>
    sectionHeight(section, width, body, format),
  );
  let best: Section[][] = [sections];
  let bestScore = Number.POSITIVE_INFINITY;

  const scoreGroups = (cuts: number[]) => {
    const points = [0, ...cuts, sections.length];
    const groups = points
      .slice(0, -1)
      .map((start, index) => sections.slice(start, points[index + 1]));
    const groupHeights = points.slice(0, -1).map((start, index) => {
      const groupLength = points[index + 1] - start;
      return (
        heights
          .slice(start, points[index + 1])
          .reduce((sum, height) => sum + height, 0) +
        Math.max(0, groupLength - 1) * MIN_CATEGORY_GAP
      );
    });
    const tallest = Math.max(...groupHeights);
    const shortest = Math.min(...groupHeights);
    const score = tallest + (tallest - shortest) * 0.35;
    if (score < bestScore) {
      bestScore = score;
      best = groups;
    }
  };

  if (count === 2) {
    for (let first = 1; first < sections.length; first++) scoreGroups([first]);
  } else {
    for (let first = 1; first < sections.length - 1; first++) {
      for (let second = first + 1; second < sections.length; second++)
        scoreGroups([first, second]);
    }
  }
  return best;
}

function textWidthUnits(text: string) {
  return [...text].reduce((total, character) => {
    if (/\s/u.test(character)) return total + 0.28;
    if (/[İIıiljt'().,:;|]/u.test(character)) return total + 0.3;
    if (/[MW@%&]/u.test(character)) return total + 0.88;
    if (/[0-9]/u.test(character)) return total + 0.56;
    if (/[A-ZÇĞÖŞÜ]/u.test(character)) return total + 0.62;
    return total + 0.52;
  }, 0);
}

function estimatedTextWidth(text: string, size: number, tracking = 0) {
  return (
    textWidthUnits(text) * size +
    Math.max(0, [...text].length - 1) * tracking
  );
}

function wrapWordsToWidth(text: string, maximumWidth: number, size: number) {
  if (estimatedTextWidth(text, size) <= maximumWidth) return [text];
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (estimatedTextWidth(next, size) > maximumWidth && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

function productNameLayout(text: string, maximumWidth: number, body: number) {
  if (estimatedTextWidth(text, body) <= maximumWidth)
    return { lines: [text], size: body };
  const words = text.trim().split(/\s+/);
  if (words.length <= 1) {
    const unitWidth = Math.max(1, estimatedTextWidth(text, 1));
    return { lines: [text], size: Math.min(body, maximumWidth / unitWidth) };
  }

  let best = [words[0], words.slice(1).join(" ")];
  let bestWidth = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index++) {
    const lines = [
      words.slice(0, index).join(" "),
      words.slice(index).join(" "),
    ];
    const widest = Math.max(
      ...lines.map((line) => estimatedTextWidth(line, 1)),
    );
    if (widest < bestWidth) {
      bestWidth = widest;
      best = lines;
    }
  }
  return {
    lines: best,
    size: Math.min(body, maximumWidth / Math.max(1, bestWidth)),
  };
}

function priceGroupWidth(item: Product, body: number, includeDetail: boolean) {
  if (item.price <= 0) return estimatedTextWidth("-", body);
  const priceWidth = estimatedTextWidth(displayPrice(item.price), body);
  if (!includeDetail || !item.detail) return priceWidth;
  return (
    priceWidth +
    body * 0.2 +
    estimatedTextWidth(`(${item.detail})`, body * 0.64)
  );
}

function sectionColumnLayout(section: Section, width: number, body: number) {
  const hasKg = section.items.some((item) => (item.kgPrice ?? 0) > 0);
  const kgOnly = hasKg && section.items.every(item => item.price <= 0);
  const label =
    kgOnly ? "KG" : section.items[0]?.outputGroup === "dessert" ? "Porsiyon" : "Adet";
  const priceWidth = Math.max(
    estimatedTextWidth(label, body * 0.86),
    ...section.items.map((item) =>
      kgOnly ? estimatedTextWidth(displayPrice(item.kgPrice!), body) : priceGroupWidth(item, body, section.category !== "Kolonyalar"),
    ),
  );
  const priceX = width;
  const priceLeft = priceX - priceWidth;

  if (!hasKg || kgOnly) {
    return {
      hasKg: false,
      kgOnly,
      label,
      priceX,
      kgX: null,
      nameWidth: Math.max(body * 4, priceLeft - MIN_NAME_PRICE_GAP),
    };
  }

  const kgWidth = Math.max(
    estimatedTextWidth("KG", body * 0.86),
    ...section.items.map((item) =>
      estimatedTextWidth(
        (item.kgPrice ?? 0) <= 0 ? "-" : displayPrice(item.kgPrice!),
        body,
      ),
    ),
  );
  const kgX = priceLeft - body * PRICE_COLUMN_GAP_RATIO;
  return {
    hasKg,
    kgOnly,
    label,
    priceX,
    kgX,
    nameWidth: Math.max(
      body * 4,
      kgX - kgWidth - MIN_NAME_PRICE_GAP,
    ),
  };
}

function headingWidthUnits(text: string) {
  return [...text].reduce((total, character) => {
    if (/\s/u.test(character)) return total + 0.32;
    if (/[İIıil]/u.test(character)) return total + 0.36;
    if (/[MW]/u.test(character)) return total + 0.9;
    return total + 0.65;
  }, 0);
}

/**
 * Category headings may use at most two lines and must only break between
 * words. This prevents Turkish words such as "BAKLAVALAR" from leaving a
 * single orphan letter on a third line in narrow output columns.
 */
function wrapHeading(text: string, available: number, size: number) {
  if (headingWidthUnits(text) * size <= available) return [text];
  const words = text.trim().split(/\s+/);
  if (words.length <= 1) return [text];

  let best = [words[0], words.slice(1).join(" ")];
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index++) {
    const first = words.slice(0, index).join(" ");
    const second = words.slice(index).join(" ");
    const firstWidth = headingWidthUnits(first);
    const secondWidth = headingWidthUnits(second);
    const score =
      Math.max(firstWidth, secondWidth) +
      Math.abs(firstWidth - secondWidth) * 0.12;
    if (score < bestScore) {
      bestScore = score;
      best = [first, second];
    }
  }
  return best;
}

function rowLineCount(
  item: Product,
  category: string,
  nameWidth: number,
  body: number,
) {
  const nameLines = productNameLayout(
    item.name.toLocaleUpperCase("tr-TR"),
    nameWidth,
    body,
  ).lines.length;
  const detailLines =
    category === "Kolonyalar" && item.detail
      ? wrapWordsToWidth(
          item.detail,
          nameWidth,
          body * 0.66,
        ).length
      : 0;
  return { nameLines, detailLines };
}

function headingLayout(
  section: Section,
  width: number,
  body: number,
  format: ExportFormat,
) {
  const text = sectionTitle(section);
  const baseSize = body * (format === "a4" ? 1.48 : 1.58);
  const columns = sectionColumnLayout(section, width, body);
  const available = columns.nameWidth;
  const lines = wrapHeading(text, available, baseSize);
  const widestLine = Math.max(...lines.map(headingWidthUnits));
  const fittedSize = Math.min(
    baseSize,
    available / Math.max(1, widestLine),
  );
  return {
    lines,
    size: fittedSize >= baseSize * 0.998 ? baseSize : fittedSize,
  };
}

/**
 * A normal category remains intact. Only a category that cannot fit a single
 * column at the current type size is divided into ordered continuation blocks.
 * Repeating the heading keeps every generated column understandable while
 * avoiding a global font-size collapse caused by one exceptionally long list.
 */
function splitOversizedSections(
  sections: Section[],
  width: number,
  body: number,
  format: ExportFormat,
  availableHeight: number,
) {
  return sections.flatMap((section) => {
    if (sectionHeight(section, width, body, format) <= availableHeight)
      return [section];

    const chunks: Section[] = [];
    let currentItems: Product[] = [];
    let chunkIndex = 0;

    for (const item of section.items) {
      const candidate: Section = {
        category: section.category,
        items: [...currentItems, item],
        continuationIndex: chunkIndex || undefined,
      };
      if (
        currentItems.length > 0 &&
        sectionHeight(candidate, width, body, format) > availableHeight
      ) {
        chunks.push({
          category: section.category,
          items: currentItems,
          continuationIndex: chunkIndex || undefined,
        });
        chunkIndex += 1;
        currentItems = [item];
      } else {
        currentItems = candidate.items;
      }
    }

    if (currentItems.length) {
      chunks.push({
        category: section.category,
        items: currentItems,
        continuationIndex: chunkIndex || undefined,
      });
    }
    return chunks;
  });
}

function sectionHeight(
  section: Section,
  width: number,
  body: number,
  format: ExportFormat,
) {
  const heading = headingLayout(section, width, body, format);
  const line = body * 1.24;
  const columns = sectionColumnLayout(section, width, body);
  const rows = section.items.reduce((sum, item) => {
    const { nameLines, detailLines } = rowLineCount(
      item,
      section.category,
      columns.nameWidth,
      body,
    );
    return (
      sum +
      Math.max(line, nameLines * line + detailLines * body * 0.78) +
      body * ROW_GAP_RATIO
    );
  }, 0);
  const ruleOffset =
    heading.size * 0.78 +
    Math.max(0, heading.lines.length - 1) *
      heading.size *
      HEADING_LINE_HEIGHT_RATIO +
    heading.size * HEADING_RULE_GAP_RATIO;
  return ruleOffset + body * RULE_FIRST_ROW_GAP_RATIO + rows;
}

function columnHeight(
  column: Section[],
  width: number,
  body: number,
  format: ExportFormat,
  gap: number,
) {
  return (
    column.reduce(
      (sum, section) => sum + sectionHeight(section, width, body, format),
      0,
    ) +
    Math.max(0, column.length - 1) * gap
  );
}

function fitBodySize(
  sections: Section[],
  count: number,
  width: number,
  availableHeight: number,
  format: ExportFormat,
  spec: CanvasSpec,
  maximumBody: number,
) {
  // The output must remain one fixed page. Continue scaling proportionally for
  // pathological input instead of allowing the final column to cross footer.
  let low = 3;
  let high = maximumBody;
  for (let pass = 0; pass < 16; pass++) {
    const middle = (low + high) / 2;
    const preparedSections = splitOversizedSections(
      sections,
      width,
      middle,
      format,
      availableHeight,
    );
    const columns = splitContiguousByHeight(
      preparedSections,
      count,
      width,
      middle,
      format,
    );
    const headingRatio = format === "a4" ? 1.48 : 1.58;
    const headingsFit = preparedSections.every(
      (section) =>
        headingLayout(section, width, middle, format).size >=
        middle * headingRatio * 0.999,
    );
    const fits =
      headingsFit &&
      columns.every(
        (column) =>
          columnHeight(column, width, middle, format, MIN_CATEGORY_GAP) <=
          availableHeight,
      );
    if (fits) low = middle;
    else high = middle;
  }
  return Math.min(maximumBody, low);
}

function solveLayout(
  sections: Section[],
  itemCount: number,
  format: ExportFormat,
): LayoutSolution {
  const spec = canvasSpecs[format];
  const contentWidth = spec.width - spec.marginX * 2;
  const availableHeight = spec.contentBottom - spec.contentTop;
  const maximumColumns = sections.length ? 3 : 1;
  // Column count must follow the measured content height, not a product-count
  // threshold. A hard 58-item switch forced otherwise readable A4 menus into
  // three narrow columns, shrinking type and leaving large top/bottom voids.
  const minimumColumns = 1;
  const densityScale =
    itemCount <= 22 ? 1.42 : itemCount <= 38 ? 1.3 : itemCount <= 58 ? 1.14 : 1;
  const maximumBody = spec.maxBody * densityScale;
  let chosen: LayoutSolution | null = null;

  for (
    let columnsCount = minimumColumns;
    columnsCount <= maximumColumns;
    columnsCount++
  ) {
    const columnWidth =
      (contentWidth - spec.columnGap * (columnsCount - 1)) / columnsCount;
    const sparseSingle =
      columnsCount === 1 && itemCount <= (format.includes("tatli") ? 32 : 25);
    const sparseWidthRatio = format.startsWith("pleksi") ? 0.76 : 0.82;
    const drawWidth = sparseSingle
      ? contentWidth * sparseWidthRatio
      : columnWidth;
    const body = fitBodySize(
      sections,
      columnsCount,
      drawWidth,
      availableHeight,
      format,
      spec,
      maximumBody,
    );
    const preparedSections = splitOversizedSections(
      sections,
      drawWidth,
      body,
      format,
      availableHeight,
    );
    const columns = splitContiguousByHeight(
      preparedSections,
      columnsCount,
      drawWidth,
      body,
      format,
    );
    const possibleGap = columns.reduce((current, column) => {
      if (column.length <= 1) return current;
      const blocks = column.reduce(
        (sum, section) => sum + sectionHeight(section, drawWidth, body, format),
        0,
      );
      return Math.min(
        current,
        (availableHeight - blocks) / (column.length - 1),
      );
    }, MAX_CATEGORY_GAP);
    const roomy = body >= maximumBody * 0.985;
    const denseLayout = body < maximumBody * 0.9;
    const expandedGap = Math.min(
      MAX_SPARSE_CATEGORY_GAP,
      Math.max(MAX_CATEGORY_GAP, body * 2.1),
    );
    const desiredGap = roomy
      ? expandedGap
      : denseLayout
        ? MIN_CATEGORY_GAP
        : NORMAL_CATEGORY_GAP;
    const gap = Math.max(MIN_CATEGORY_GAP, Math.min(desiredGap, possibleGap));
    chosen = { columns, columnsCount, columnWidth, drawWidth, body, gap };
    const readableSingleColumnBody =
      columnsCount === 1 && itemCount <= 42 ? spec.minBody * 0.78 : spec.minBody;
    if (body >= readableSingleColumnBody || columnsCount === maximumColumns)
      break;
  }

  return (
    chosen ?? {
      columns: [[]],
      columnsCount: 1,
      columnWidth: contentWidth,
      drawWidth: contentWidth * 0.82,
      body: maximumBody,
      gap: MAX_CATEGORY_GAP,
    }
  );
}

function Footer({ format, date }: { format: ExportFormat; date: string }) {
  const spec = canvasSpecs[format];
  const y = format.startsWith("a5") ? 1572 : format === "a4" ? 1638 : format.startsWith("led") ? 1792 : 2328;
  const firstSize = format.startsWith("a5") ? 20 : format === "a4" ? 22 : format.startsWith("led") ? 25 : 29;
  const tracking = firstSize * 0.04;
  const firstLine = `FİYAT DEĞİŞTİRME TARİHİ  |  ${date}`;
  return (
    <g fill={GREEN} textAnchor="middle">
      <text
        x={spec.width / 2}
        y={y}
        fontFamily={MONDIA}
        fontSize={firstSize}
        fontWeight={400}
        letterSpacing={tracking}
        aria-label={firstLine}
      >
        {firstLine}
      </text>
      <text
        x={spec.width / 2}
        y={y + firstSize * 1.38}
        fontFamily={MONDIA}
        fontSize={firstSize}
        fontWeight={400}
        letterSpacing={tracking}
      >
        FİYATLARIMIZA KDV DAHİLDİR
      </text>
      <text
        x={spec.width / 2}
        y={y + firstSize * 2.58}
        fontFamily={MONDIA}
        fontSize={firstSize * 0.72}
        fontWeight={400}
      >
        {ALLERGEN_NOTE}
      </text>
    </g>
  );
}

function Brand({ format }: { format: ExportFormat }) {
  const spec = canvasSpecs[format];
  if (format.startsWith("led")) return null;
  if (format === "a4")
    return (
      <g transform="translate(-25 0)" data-a4-brand="true">
        <image
          data-menu-role="brand-logo"
          href="/sutluce-logo.svg"
          x={408}
          y={62}
          width={240}
          height={126}
          preserveAspectRatio="xMidYMid meet"
        />
        <line
          x1={684}
          y1={78}
          x2={684}
          y2={172}
          stroke={GREEN}
          strokeWidth={2}
          opacity={0.6}
        />
        <text
          data-menu-role="price-list-title"
          x={720}
          y={106}
          fill={GREEN}
          fontFamily={MONDIA}
          fontSize={42}
          fontWeight={700}
          letterSpacing={1.6}
        >
          FİYAT
        </text>
        <text
          data-menu-role="price-list-title"
          x={720}
          y={148}
          fill={GREEN}
          fontFamily={MONDIA}
          fontSize={42}
          fontWeight={700}
          letterSpacing={1.6}
        >
          LİSTESİ
        </text>
      </g>
    );
  const logoWidth = format.startsWith("a5") ? 280 : 400;
  const logoHeight = format.startsWith("a5") ? 144 : 205;
  const y = format.startsWith("a5") ? 52 : 68;
  return (
    <image
      data-menu-role="brand-logo"
      href="/sutluce-logo.svg"
      x={(spec.width - logoWidth) / 2}
      y={y}
      width={logoWidth}
      height={logoHeight}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

function SectionGraphic({
  section,
  x,
  y,
  width,
  body,
  format,
}: {
  section: Section;
  x: number;
  y: number;
  width: number;
  body: number;
  format: ExportFormat;
}) {
  const heading = headingLayout(section, width, body, format);
  const lineHeight = body * 1.24;
  const columns = sectionColumnLayout(section, width, body);
  const hasKg = columns.hasKg;
  const priceX = x + columns.priceX;
  const kgX = columns.kgX === null ? null : x + columns.kgX;
  const label = columns.label;
  const headingBaseline =
    y +
    heading.size * 0.78 +
    Math.max(0, heading.lines.length - 1) *
      heading.size *
      HEADING_LINE_HEIGHT_RATIO;
  const ruleY = headingBaseline + heading.size * HEADING_RULE_GAP_RATIO;
  const rows = section.items.reduce<
    Array<{
      item: Product;
      startY: number;
      nameLines: string[];
      nameSize: number;
      detailLines: string[];
    }>
  >((result, item) => {
    const nameLayout = productNameLayout(
      item.name.toLocaleUpperCase("tr-TR"),
      columns.nameWidth,
      body,
    );
    const nameLines = nameLayout.lines;
    const detailLines =
      section.category === "Kolonyalar" && item.detail
        ? wrapWordsToWidth(
            item.detail,
            columns.nameWidth,
            body * 0.66,
          )
        : [];
    const previous = result[result.length - 1];
    const previousHeight = previous
      ? Math.max(
          lineHeight,
          previous.nameLines.length * lineHeight +
            previous.detailLines.length * body * 0.78,
        ) + body * ROW_GAP_RATIO
      : 0;
    const startY = previous
      ? previous.startY + previousHeight
      : ruleY + body * RULE_FIRST_ROW_GAP_RATIO;
    return [
      ...result,
      { item, startY, nameLines, nameSize: nameLayout.size, detailLines },
    ];
  }, []);

  return (
    <g fill={GREEN} data-menu-section={sectionTitle(section)}>
      <text
        data-menu-role="category-heading"
        x={x}
        y={y + heading.size * 0.78}
        fontFamily={MONDIA}
        fontSize={heading.size}
        fontWeight={700}
        letterSpacing={heading.size * 0.012}
      >
        {heading.lines.map((line, index) => (
          <tspan
            key={line}
            x={x}
            dy={index === 0 ? 0 : heading.size * HEADING_LINE_HEIGHT_RATIO}
          >
            {line}
          </tspan>
        ))}
      </text>
      {hasKg && kgX !== null && (
        <text
          data-menu-role="kg-heading"
          x={kgX}
          y={headingBaseline}
          fontFamily={MONDIA}
          fontSize={body * 0.86}
          fontWeight={400}
          fontStyle="italic"
          textAnchor="end"
        >
          KG
        </text>
      )}
      <text
        data-menu-role={columns.kgOnly ? "kg-heading" : "price-heading"}
        x={priceX}
        y={headingBaseline}
        fontFamily={MONDIA}
        fontSize={body * 0.86}
        fontWeight={400}
        fontStyle="italic"
        textAnchor="end"
      >
        {label}
      </text>
      <line
        x1={x}
        y1={ruleY}
        x2={x + width}
        y2={ruleY}
        stroke={GREEN}
        strokeWidth={Math.max(1.6, body * 0.075)}
      />
      {rows.map(({ item, startY, nameLines, nameSize, detailLines }) => {
        return (
          <g key={item.id} fontFamily={MONDIA} data-menu-row={item.id}>
            <text
              data-menu-role="product-name"
              x={x}
              y={startY}
              fontSize={nameSize}
              fontWeight={400}
            >
              {nameLines.map((line, index) => (
                <tspan key={line} x={x} dy={index === 0 ? 0 : lineHeight}>
                  {line}
                </tspan>
              ))}
            </text>
            {detailLines.length > 0 && (
              <text
                data-menu-role="product-description"
                x={x}
                y={startY + nameLines.length * lineHeight - body * 0.15}
                fontSize={body * 0.66}
                fontWeight={400}
                fontStyle="italic"
              >
                {detailLines.map((line, index) => (
                  <tspan key={line} x={x} dy={index === 0 ? 0 : body * 0.78}>
                    ({line}
                    {index === detailLines.length - 1 ? ")" : ""}
                  </tspan>
                ))}
              </text>
            )}
            {hasKg && kgX !== null && (
              <text
                data-menu-role="kg-price"
                x={kgX}
                y={startY}
                fontSize={body}
                fontWeight={700}
                textAnchor="end"
              >
                {(item.kgPrice ?? 0) <= 0 ? "-" : displayPrice(item.kgPrice!)}
              </text>
            )}
            <text
              data-menu-role={columns.kgOnly ? "kg-price" : "price-detail"}
              x={priceX}
              y={startY}
              fontSize={body}
              textAnchor="end"
              fontWeight={700}
            >
              {columns.kgOnly ? displayPrice(item.kgPrice!) : item.price > 0 ? displayPrice(item.price) : "-"}
              {!columns.kgOnly && item.price > 0 && section.category !== "Kolonyalar" && item.detail && (
                <tspan
                  fontFamily={MONDIA}
                  fontSize={body * 0.64}
                  fontStyle="italic"
                >
                  {" "}
                  ({item.detail})
                </tspan>
              )}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function getLayoutStatus(
  products: Product[],
  format: ExportFormat,
) {
  const group = format.includes("tatli")
    ? "dessert"
    : format.includes("diger")
      ? "other"
      : null;
  const selected = products.filter(
    (product) =>
      product.enabled &&
      hasProductPrice(product) &&
      (!group || product.outputGroup === group),
  );
  const sections = groupProducts(selected);
  const layout = solveLayout(sections, selected.length, format);
  const columns = layout.columnsCount;
  const hasContinuation = layout.columns.some((column) =>
    column.some((section) => Boolean(section.continuationIndex)),
  );
  if (hasContinuation)
    return `${columns} sütun · uzun kategori devam ediyor`;
  if (columns === 1) return "Tek sütun · büyük ve ortalı";
  if (columns === 2) return "2 sütun · otomatik dengelendi";
  return "3 sütun · dengeli yerleşim";
}

export function getLayoutMetrics(
  products: Product[],
  format: ExportFormat,
) {
  const spec = canvasSpecs[format];
  const group = format.includes("tatli")
    ? "dessert"
    : format.includes("diger")
      ? "other"
      : null;
  const selected = products.filter(
    (product) =>
      product.enabled &&
      hasProductPrice(product) &&
      (!group || product.outputGroup === group),
  );
  const sections = groupProducts(selected);
  const layout = solveLayout(sections, selected.length, format);
  const availableHeight = spec.contentBottom - spec.contentTop;
  const columnHeights = layout.columns.map((column) =>
    columnHeight(column, layout.drawWidth, layout.body, format, layout.gap),
  );
  const sharedTop =
    spec.contentTop +
    Math.max(0, (availableHeight - Math.max(0, ...columnHeights)) / 2);
  return {
    columnsCount: layout.columnsCount,
    body: layout.body,
    kgPortionGap: layout.body * PRICE_COLUMN_GAP_RATIO,
    ruleFirstRowGap: layout.body * RULE_FIRST_ROW_GAP_RATIO,
    gap: layout.gap,
    availableHeight,
    columnHeights,
    columnStarts: layout.columns.map(() => sharedTop),
    categories: layout.columns.flatMap((column) =>
      column.map((section) => sectionTitle(section)),
    ),
    headings: layout.columns.flatMap((column) =>
      column.map((section) => {
        const heading = headingLayout(
          section,
          layout.drawWidth,
          layout.body,
          format,
        );
        return {
          category: sectionTitle(section),
          fontSize: heading.size,
          lineCount: heading.lines.length,
          lines: heading.lines,
        };
      }),
    ),
    productNames: layout.columns.flatMap((column) =>
      column.flatMap((section) => {
        const columns = sectionColumnLayout(
          section,
          layout.drawWidth,
          layout.body,
        );
        return section.items.map((item) => {
          const name = item.name.toLocaleUpperCase("tr-TR");
          const nameLayout = productNameLayout(
            name,
            columns.nameWidth,
            layout.body,
          );
          return {
            name,
            lines: nameLayout.lines,
            lineCount: nameLayout.lines.length,
            fontSize: nameLayout.size,
          };
        });
      }),
    ),
    continuationCount: layout.columns.reduce(
      (count, column) =>
        count +
        column.filter((section) => Boolean(section.continuationIndex)).length,
      0,
    ),
  };
}

export function MenuPreview({
  products,
  format,
  date,
  exportCopy = false,
}: {
  products: Product[];
  format: ExportFormat;
  date: string;
  exportCopy?: boolean;
}) {
  const spec = canvasSpecs[format];
  const group = format.includes("tatli")
    ? "dessert"
    : format.includes("diger")
      ? "other"
      : null;
  const selected = products.filter(
    (product) =>
      product.enabled &&
      hasProductPrice(product) &&
      (!group || product.outputGroup === group),
  );
  const sections = groupProducts(selected);
  const { columnsCount, columns, columnWidth, drawWidth, body, gap } =
    solveLayout(sections, selected.length, format);
  const availableHeight = spec.contentBottom - spec.contentTop;
  const columnHeights = columns.map((column) =>
    columnHeight(column, drawWidth, body, format, gap),
  );
  const contentGroupHeight = Math.max(0, ...columnHeights);
  const sharedTop =
    spec.contentTop + Math.max(0, (availableHeight - contentGroupHeight) / 2);

  return (
    <svg
      className={`menu-canvas menu-svg ${format}`}
      data-export-format={exportCopy ? format : undefined}
      viewBox={`0 0 ${spec.width} ${spec.height}`}
      width={spec.width}
      height={spec.height}
      role="img"
      aria-label={`${formats.find(item => item.id === format)?.label} fiyat listesi ön izlemesi`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Sütlüce Kadayıf fiyat listesi</title>
      <rect width={spec.width} height={spec.height} fill="#ffffff" />
      <Brand format={format} />
      {columns.map((column, columnIndex) => {
        const columnX =
          columnsCount === 1
            ? (spec.width - drawWidth) / 2
            : spec.marginX + columnIndex * (columnWidth + spec.columnGap);
        const sectionHeights = column.map((section) =>
          sectionHeight(section, drawWidth, body, format),
        );
        const sectionPositions = sectionHeights.reduce<number[]>(
          (positions, height, index) => {
            if (index === 0) return [sharedTop];
            return [
              ...positions,
              positions[index - 1] + sectionHeights[index - 1] + gap,
            ];
          },
          [],
        );
        return (
          <g key={`${format}-column-${columnIndex}`}>
            {column.map((section, sectionIndex) => {
              return (
                <SectionGraphic
                  key={sectionKey(section)}
                  section={section}
                  x={columnX}
                  y={sectionPositions[sectionIndex]}
                  width={drawWidth}
                  body={body}
                  format={format}
                />
              );
            })}
          </g>
        );
      })}
      <Footer format={format} date={date} />
    </svg>
  );
}
