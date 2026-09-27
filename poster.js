// Vector exports share one drawing routine. Fonts are local, including accented names.
import { jsPDF } from "./vendor/jspdf.es.min.js";
import { preparePosterLayout } from "./poster-layout.js";

const C = {
  paper: "#fcfaf5",
  ink: "#34323e",
  muted: "#84818a",
  line: "#c5bdce",
  plum: "#9e7c0a",
  border: "#ded9e2",
};
const NAME_SIZE = 20;
let fontsPromise;
function fontData() {
  if (!fontsPromise)
    fontsPromise = Promise.all(
      ["Lora-400", "Lora-600", "DejaVuSans", "DejaVuSans-Bold"].map(async (name) => {
        const response = await fetch(
          new URL(`./assets/fonts/${name}.ttf`, import.meta.url),
        );
        if (!response.ok)
          throw new Error(
            "The poster font could not be loaded. Please try again.",
          );
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 8192) {
          binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 8192),
          );
        }
        return btoa(binary);
      }),
    ).catch((error) => {
      fontsPromise = null;
      throw error;
    });
  return fontsPromise;
}

function pageSize(layout, size) {
  if (size === "readable") {
    const scale = Math.min(
      11 / NAME_SIZE,
      (14400 - 144) / layout.width,
      (14400 - 308) / layout.height,
    );
    return [
      Math.max(720, layout.width * scale + 144),
      Math.max(600, layout.height * scale + 308),
    ];
  }
  if (size === "a1") return [(841 * 72) / 25.4, (594 * 72) / 25.4];
  if (size === "auto") {
    // Fit the graph and fixed margins inside a 36-inch long edge.
    const scale = Math.min(
      (2592 - 144) / layout.width,
      (2592 - 308) / layout.height,
    );
    return [
      Math.max(720, layout.width * scale + 144),
      Math.max(600, layout.height * scale + 308),
    ];
  }
  return [36 * 72, 24 * 72];
}

export function getPosterMetrics(layout, size, layoutMode = 'vertical') {
  layout = preparePosterLayout(layout, { mode: layoutMode, size });
  const [width, height] = pageSize(layout, size);
  return {
    width: width / 72,
    height: height / 72,
    layoutMode: layout.posterLayout || 'vertical',
    continuationCount: layout.continuationCount || 0,
    nameSize:
      NAME_SIZE *
      Math.min((width - 144) / layout.width, (height - 308) / layout.height),
  };
}

const clean = (value) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
const escapeXml = (value) =>
  clean(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char],
  );

async function drawPoster(layout, options = {}) {
  if (!layout.nodes?.length || !(layout.width > 0) || !(layout.height > 0)) {
    throw new Error("Choose at least one person before exporting a poster.");
  }
  layout = preparePosterLayout(layout, { mode: options.layoutMode, size: options.size });
  const [width, height] = pageSize(layout, options.size);
  const doc = new jsPDF({
    orientation: width >= height ? "landscape" : "portrait",
    unit: "pt",
    format: [width, height],
    compress: true,
    putOnlyUsedFonts: true,
  });
  const fonts = await fontData();
  ["normal", "bold", "normal", "bold"].forEach((style, i) => {
    const file = `genealogy-${i}-${style}.ttf`;
    doc.addFileToVFS(file, fonts[i]);
    doc.addFont(file, i < 2 ? "Genealogy" : "GenealogyFallback", style);
  });
  function fontFor(value, bold = false) {
    doc.setFont('Genealogy', bold ? 'bold' : 'normal');
    const font = doc.internal.getFont().metadata;
    return [...clean(value)].some(char => !font.characterToGlyph(char.codePointAt(0)))
      ? 'GenealogyFallback' : 'Genealogy';
  }
  const title = clean(options.title || "PhD Genealogy Tree");
  doc.setProperties({
    title,
    subject: "Academic advisor genealogy",
    creator: "Genealogy",
    keywords: "mathematics, genealogy, advisors",
  });
  const svg = [];
  function path(points, color, lineWidth) {
    doc.setLineDashPattern([], 0);
    if (points.length < 2) return;
    doc.setDrawColor(color);
    doc.setLineWidth(lineWidth);
    doc.lines(
      points.slice(1).map((p, i) => [p.x - points[i].x, p.y - points[i].y]),
      points[0].x,
      points[0].y,
      [1, 1],
      "S",
      false,
    );
    svg.push(
      `<polyline points="${points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${color}" stroke-width="${lineWidth}" stroke-linejoin="round"/>`,
    );
  }
  function circle(x, y, radius, color, hollow = false) {
    doc.setLineDashPattern([], 0);
    doc.setFillColor(hollow ? C.paper : color);
    doc.setDrawColor(color);
    doc.setLineWidth(Math.max(0.4, radius * 0.35));
    doc.circle(x, y, radius, "FD");
    svg.push(
      `<circle cx="${x}" cy="${y}" r="${radius}" fill="${hollow ? C.paper : color}" stroke="${color}" stroke-width="${Math.max(0.4, radius * 0.35)}"/>`,
    );
  }
  function curve(points, color, lineWidth) {
    if (points.length < 2) return;
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(color);
    doc.setLineWidth(lineWidth);
    const first = points[0];
    const segments = [];
    const commands = [`M${first.x},${first.y}`];
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1],
        to = points[i];
      const middleY = (from.y + to.y) / 2;
      segments.push([
        0,
        middleY - from.y,
        to.x - from.x,
        middleY - from.y,
        to.x - from.x,
        to.y - from.y,
      ]);
      commands.push(`C${from.x},${middleY} ${to.x},${middleY} ${to.x},${to.y}`);
    }
    doc.lines(segments, first.x, first.y, [1, 1], "S", false);
    svg.push(
      `<path d="${commands.join(" ")}" fill="none" stroke="${color}" stroke-width="${lineWidth}" stroke-linecap="round"/>`,
    );
  }
  function text(
    value,
    x,
    y,
    fontSize,
    color = C.ink,
    bold = false,
    align = "left",
    family,
  ) {
    const content = clean(value);
    if (!content) return;
    family ||= fontFor(content, bold);
    doc.setFont(family, bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(color);
    doc.text(content, x, y, { align });
    svg.push(
      `<text x="${x}" y="${y}" font-size="${fontSize}" fill="${color}" font-weight="${bold ? 700 : 400}" style="font-family:${family},serif" text-anchor="${align === "center" ? "middle" : align === "right" ? "end" : "start"}">${escapeXml(content)}</text>`,
    );
  }
  function fit(value, fontSize, maxWidth, bold = false) {
    doc.setFont(fontFor(value, bold), bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    const content = clean(value);
    return Math.min(
      fontSize,
      (fontSize * maxWidth) / Math.max(1, doc.getTextWidth(content)),
    );
  }
  const margin = 72;
  doc.setFillColor(C.paper);
  doc.rect(0, 0, width, height, "F");
  svg.push(`<rect width="${width}" height="${height}" fill="${C.paper}"/>`);
  text(
    title,
    width / 2,
    106,
    fit(title, 40, width - margin * 2, true),
    C.ink,
    true,
    "center",
  );
  const subtitle = clean(
    options.subtitle || "A shared history of people and their advisors",
  );
  text(
    subtitle,
    width / 2,
    137,
    fit(subtitle, 12, width - margin * 2),
    C.muted,
    false,
    "center",
  );
  const legendY = 175;
  circle(margin + 4, legendY - 3, 3, '#981a31');
  text("Selected people", margin + 24, legendY, 9, C.muted);
  circle(margin + 170, legendY - 3, 3, C.plum);
  text("Shared ancestors", margin + 182, legendY, 9, C.muted);
  text(
    layout.continuations?.length
      ? "Read down each column · match numbered circles across columns"
      : "Advisors above · students below",
    width - margin,
    legendY,
    9,
    C.muted,
    false,
    "right",
  );
  path(
    [
      { x: margin, y: 192 },
      { x: width - margin, y: 192 },
    ],
    C.border,
    0.8,
  );

  const chartTop = 217,
    chartBottom = height - 91;
  const scale = Math.min(
    (width - margin * 2) / layout.width,
    (chartBottom - chartTop) / layout.height,
  );
  const offsetX = (width - layout.width * scale) / 2;
  const offsetY =
    chartTop + (chartBottom - chartTop - layout.height * scale) / 2;
  const mapPoint = (p) => ({
    x: offsetX + p.x * scale,
    y: offsetY + p.y * scale,
  });
  const color = (value) =>
    /^#[0-9a-f]{6}$/i.test(value || "") ? value : C.plum;
  const soften = (value, opacity = 0.38) => {
    const rgb = color(value)
      .slice(1)
      .match(/../g)
      .map((part) => parseInt(part, 16));
    return (
      "#" +
      rgb
        .map((channel) =>
          Math.round(channel * opacity + 252 * (1 - opacity))
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    );
  };
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  for (const panel of layout.panels || []) {
    const position = mapPoint({ x: panel.x + 36, y: 24 });
    text(panel.label, position.x, position.y, 15 * scale, C.muted);
  }
  for (const edge of layout.edges || []) {
    const ink = edge.color || byId.get(edge.to)?.color;
    for (const points of edge.segments || [edge.points || []])
      curve(points.map(mapPoint), soften(ink, edge.dim ? 0.08 : 0.38), Math.max(0.35, 1.05 * scale));
  }
  for (const marker of layout.continuations || []) {
    const position = mapPoint(marker);
    circle(position.x, position.y, 11 * scale, C.muted, true);
    text(marker.label, position.x, position.y + 4 * scale, 11 * scale, C.ink, false, 'center');
  }

  for (const node of layout.nodes) {
    svg.push(`<g data-person-id="${escapeXml(node.id)}">`);
    const person = node.person || node;
    const center = mapPoint(node),
      w = node.width * scale,
      h = node.height * scale;
    const y = center.y - h / 2;
    const ink = node.dim ? soften(node.color, 0.15) : color(node.color);
    const labelColor = node.selected || color(node.color) === '#087f7a' ? '#087f7a' : node.root ? '#981a31' : C.ink;
    const nameInk = node.dim ? soften(labelColor, 0.15) : labelColor;
    const nameSize = NAME_SIZE * scale;
    const name = clean(person.name || "Unknown");
    const nameFamily = fontFor(name, node.root);
    // Names share one type size throughout the poster; long names wrap.
    doc.setFont(nameFamily, node.root ? "bold" : "normal");
    doc.setFontSize(nameSize);
    const lines = doc.splitTextToSize(name, w - 18 * scale);
    const lineHeight = nameSize * 1.15;
    const nameY =
      y +
      Math.max(
        22 * scale,
        (h - (lines.length - 1) * lineHeight) / 2 - 7 * scale,
      );
    circle(
      center.x,
      y + 5 * scale,
      (node.root ? 3.6 : 2.5) * scale,
      ink,
      person.incomplete,
    );
    lines.forEach((line, i) =>
      text(
        line,
        center.x,
        nameY + i * lineHeight,
        nameSize,
        nameInk,
        Boolean(node.root),
        "center",
        nameFamily,
      ),
    );
    const detailSize = 12 * scale;
    const detailY = nameY + (lines.length - 1) * lineHeight + 18 * scale;
    if (person.year != null)
      text(
        person.year,
        center.x,
        detailY,
        detailSize,
        node.dim ? soften('#605d66', 0.15) : '#605d66',
        false,
        "center",
      );
    svg.push('</g>');
  }

  path(
    [
      { x: margin, y: height - 66 },
      { x: width - margin, y: height - 66 },
    ],
    C.border,
    0.8,
  );
  const footer =
    "Sources: Mathematics Genealogy Project · mathgenealogy.org · cited faculty records";
  text(
    footer,
    margin,
    height - 45,
    fit(footer, 10, (width - 2 * margin) * 0.65),
    C.muted,
  );
  const detail = `${layout.nodes.length} people · ${(layout.edges || []).length} advisor connections`;
  text(
    detail,
    width - margin,
    height - 45,
    fit(detail, 10, (width - 2 * margin) * 0.33),
    C.muted,
    false,
    "right",
  );
  const sourceDate = options.sourceDate
    ? `Source data: ${clean(options.sourceDate)} · `
    : "";
  const incomplete = layout.nodes.filter(
    (node) => node.person?.incomplete,
  ).length;
  const recordNote = incomplete
    ? `${incomplete} open-circle records not yet retrieved. `
    : "";
  const footnote = `${sourceDate}Exported ${new Date().toISOString().slice(0, 10)} · ${recordNote}Historical records may be incomplete.`;
  text(
    footnote,
    margin,
    height - 29,
    fit(footnote, 8, width - margin * 2),
    C.muted,
  );

  const fontStyles = fonts
    .map(
      (font, i) =>
        `@font-face{font-family:${i < 2 ? 'Genealogy' : 'GenealogyFallback'};src:url(data:font/ttf;base64,${font}) format('truetype');font-weight:${i % 2 ? 700 : 400}}`,
    )
    .join("");
  const svgDocument = `<svg xmlns="http://www.w3.org/2000/svg" width="${width / 72}in" height="${height / 72}in" viewBox="0 0 ${width} ${height}"><title>${escapeXml(title)}</title><style>${fontStyles}text{font-family:Genealogy,sans-serif}</style>${svg.join("")}</svg>`;
  return { doc, svg: svgDocument };
}

/** Returns jsPDF for callers needing bytes or a preview instead of a download. */
export async function createPosterDocument(layout, options = {}) {
  return (await drawPoster(layout, options)).doc;
}

/** Returns the standalone SVG text without triggering a browser download. */
export async function createPosterSvg(layout, options = {}) {
  return (await drawPoster(layout, options)).svg;
}

/** Downloads a single-page PDF with vector lines, searchable text, and embedded fonts. */
export async function exportPoster(layout, options = {}) {
  const doc = await createPosterDocument(layout, options);
  await doc.save(options.filename || "mathematical-genealogy.pdf", {
    returnPromise: true,
  });
  return doc;
}

/** Downloads a standalone, editable SVG with the same composition and embedded fonts. */
export async function exportSvg(layout, options = {}) {
  const { svg } = await drawPoster(layout, options);
  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = options.filename || "mathematical-genealogy.svg";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return svg;
}
