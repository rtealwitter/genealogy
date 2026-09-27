// Vector exports share one drawing routine. Fonts are local, including accented names.
import { jsPDF } from "./vendor/jspdf.es.min.js";
import { preparePosterLayout } from "./poster-layout.js?v=8";

const C = {
  paper: "#fcfaf5",
  ink: "#34323e",
  muted: "#84818a",
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

// Preview metrics and both vector formats use exactly the same page geometry.
function posterGeometry(layout, size, mode) {
  layout = preparePosterLayout(layout, { mode });
  let width = 36 * 72, height = 24 * 72;
  if (size === "readable") {
    const scale = Math.min(
      11 / NAME_SIZE,
      (14400 - 144) / layout.width,
      (14400 - 308) / layout.height,
    );
    width = Math.max(720, layout.width * scale + 144);
    height = Math.max(600, layout.height * scale + 308);
  }
  const scale = Math.min((width - 144) / layout.width, (height - 308) / layout.height);
  const offsetX = (width - layout.width * scale) / 2;
  const offsetY = 217 + (height - 308 - layout.height * scale) / 2;
  const mapPoint = point => ({ x: offsetX + point.x * scale, y: offsetY + point.y * scale });
  return { layout, width, height, scale, mapPoint };
}

export function getPosterMetrics(layout, size, layoutMode = 'vertical') {
  const page = posterGeometry(layout, size, layoutMode);
  return {
    width: page.width / 72,
    height: page.height / 72,
    layoutMode: page.layout.posterLayout || 'vertical',
    continuationCount: page.layout.continuationCount || 0,
    nameSize: NAME_SIZE * page.scale,
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
  const page = posterGeometry(layout, options.size, options.layoutMode);
  const { width, height, scale, mapPoint } = page;
  layout = page.layout;
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
  function rule(y) {
    doc.setDrawColor(C.border);
    doc.setLineWidth(0.8);
    doc.line(72, y, width - 72, y);
    svg.push(`<line x1="72" y1="${y}" x2="${width - 72}" y2="${y}" stroke="${C.border}" stroke-width="0.8"/>`);
  }
  function circle(x, y, radius, color, hollow = false) {
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
    doc.setDrawColor(color);
    doc.setLineWidth(lineWidth);
    const commands = [{ op: 'm', c: [points[0].x, points[0].y] }];
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1],
        to = points[i];
      const middleY = (from.y + to.y) / 2;
      commands.push({ op: 'c', c: [from.x, middleY, to.x, middleY, to.x, to.y] });
    }
    doc.path(commands).stroke();
    const d = commands.map(command => command.op.toUpperCase() + command.c.join(' ')).join(' ');
    svg.push(
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="${lineWidth}" stroke-linecap="round"/>`,
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
  if (layout.continuations?.length) {
    text(
      "Read down each column · match numbered circles across columns",
      width - margin,
      175,
      9,
      C.muted,
      false,
      "right",
    );
  }
  rule(192);
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

  rule(height - 66);
  const footer =
    "Sources: Mathematics Genealogy Project · mathgenealogy.org";
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

  return {
    doc,
    // PDF downloads do not need the large base64-font SVG document.
    get svg() {
      const fontStyles = fonts.map((font, i) =>
        `@font-face{font-family:${i < 2 ? 'Genealogy' : 'GenealogyFallback'};src:url(data:font/ttf;base64,${font}) format('truetype');font-weight:${i % 2 ? 700 : 400}}`
      ).join('');
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width / 72}in" height="${height / 72}in" viewBox="0 0 ${width} ${height}"><title>${escapeXml(title)}</title><style>${fontStyles}text{font-family:Genealogy,sans-serif}</style>${svg.join("")}</svg>`;
    },
  };
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
  const svg = await createPosterSvg(layout, options);
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
