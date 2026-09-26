// Vector exports share one drawing routine. Fonts are local, including accented names.
import { jsPDF } from "./vendor/jspdf.es.min.js";

const C = {
  paper: "#faf9f5",
  ink: "#272e2b",
  muted: "#67716a",
  line: "#aaaFA7",
  burgundy: "#793e48",
  teal: "#2d706b",
  pale: "#edf3f0",
  white: "#ffffff",
  border: "#d4d9d2",
};
let fontsPromise;
function fontData() {
  if (!fontsPromise)
    fontsPromise = Promise.all(
      ["DejaVuSans", "DejaVuSans-Bold"].map(async (name) => {
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
  const [width, height] = pageSize(layout, options.size);
  const doc = new jsPDF({
    orientation: width >= height ? "landscape" : "portrait",
    unit: "pt",
    format: [width, height],
    compress: true,
    putOnlyUsedFonts: true,
  });
  const fonts = await fontData();
  ["normal", "bold"].forEach((style, i) => {
    const file = `genealogy-${style}.ttf`;
    doc.addFileToVFS(file, fonts[i]);
    doc.addFont(file, "Genealogy", style);
  });
  const title = clean(options.title || "A shared mathematical ancestry");
  doc.setProperties({
    title,
    subject: "Academic advisor genealogy",
    creator: "Genealogy",
    keywords: "mathematics, genealogy, advisors",
  });
  const svg = [];
  function rect(x, y, w, h, fill, stroke, radius = 0, lineWidth = 0.8) {
    doc.setFillColor(fill);
    if (stroke) {
      doc.setDrawColor(stroke);
      doc.setLineWidth(lineWidth);
    }
    if (radius)
      doc.roundedRect(x, y, w, h, radius, radius, stroke ? "FD" : "F");
    else doc.rect(x, y, w, h, stroke ? "FD" : "F");
    svg.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke || "none"}" stroke-width="${lineWidth}"/>`,
    );
  }
  function path(points, color, lineWidth) {
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
  function text(
    value,
    x,
    y,
    fontSize,
    color = C.ink,
    bold = false,
    align = "left",
  ) {
    const content = clean(value);
    if (!content) return;
    doc.setFont("Genealogy", bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(color);
    doc.text(content, x, y, { align });
    svg.push(
      `<text x="${x}" y="${y}" font-size="${fontSize}" fill="${color}" font-weight="${bold ? 700 : 400}" text-anchor="${align === "center" ? "middle" : align === "right" ? "end" : "start"}">${escapeXml(content)}</text>`,
    );
  }
  function fit(value, fontSize, maxWidth, bold = false) {
    doc.setFont("Genealogy", bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    const content = clean(value);
    return Math.min(
      fontSize,
      (fontSize * maxWidth) / Math.max(1, doc.getTextWidth(content)),
    );
  }
  function truncate(value, fontSize, maxWidth) {
    doc.setFont("Genealogy", "normal");
    doc.setFontSize(fontSize);
    let content = clean(value);
    if (doc.getTextWidth(content) <= maxWidth) return content;
    while (content && doc.getTextWidth(`${content}…`) > maxWidth)
      content = content.slice(0, -1);
    return `${content.trim()}…`;
  }

  const margin = 72;
  rect(0, 0, width, height, C.paper);
  rect(margin, 57, 32, 3, C.burgundy);
  text("MATHEMATICAL GENEALOGY", margin + 44, 63, 11, C.muted, true);
  text(
    title,
    margin,
    116,
    fit(title, 40, width - margin * 2, true),
    C.ink,
    true,
  );
  const subtitle = clean(
    options.subtitle ||
      "People, advisors, and the ideas passed between generations.",
  );
  text(subtitle, margin, 145, fit(subtitle, 14, width - margin * 2), C.muted);
  const legendY = 175;
  rect(margin, legendY - 8, 9, 9, C.burgundy, undefined, 2);
  text("Selected people", margin + 17, legendY, 10, C.muted);
  rect(margin + 139, legendY - 8, 9, 9, C.teal, undefined, 2);
  text("Shared ancestors", margin + 156, legendY, 10, C.muted);
  text(
    "Advisors above · students below",
    width - margin,
    legendY,
    10,
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
  for (const edge of layout.edges || [])
    path((edge.points || []).map(mapPoint), C.line, Math.max(0.3, 0.9 * scale));

  for (const node of layout.nodes) {
    const person = node.person || node;
    const center = mapPoint(node),
      w = node.width * scale,
      h = node.height * scale;
    const x = center.x - w / 2,
      y = center.y - h / 2;
    const ink = node.root ? C.white : node.shared ? C.teal : C.ink;
    rect(
      x,
      y,
      w,
      h,
      node.root ? C.burgundy : node.shared ? C.pale : C.white,
      node.root ? C.burgundy : node.shared ? C.teal : C.border,
      4 * scale,
      0.8 * scale,
    );
    let nameSize = 12 * scale,
      lines;
    const name = clean(person.name || "Unknown");
    // Preserve complete names; wrap and shrink only when they need extra space.
    do {
      doc.setFont("Genealogy", "bold");
      doc.setFontSize(nameSize);
      lines = doc.splitTextToSize(name, w - 18 * scale);
      if (lines.length <= 2) break;
      nameSize *= 0.9;
    } while (nameSize > 3 * scale);
    const nameY = y + (lines.length === 1 ? 25 : 18) * scale;
    lines.forEach((line, i) =>
      text(
        line,
        center.x,
        nameY + i * nameSize * 1.14,
        nameSize,
        ink,
        true,
        "center",
      ),
    );
    const detail = [person.year, person.institution]
      .filter(Boolean)
      .join(" · ");
    text(
      truncate(detail, 8 * scale, w - 18 * scale),
      center.x,
      y + h - 12 * scale,
      8 * scale,
      node.root ? "#f0e4e6" : C.muted,
      false,
      "center",
    );
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
  text(
    `${sourceDate}Exported ${new Date().toISOString().slice(0, 10)} · Historical records may be incomplete.`,
    margin,
    height - 29,
    8,
    C.muted,
  );

  const fontStyles = fonts
    .map(
      (font, i) =>
        `@font-face{font-family:Genealogy;src:url(data:font/ttf;base64,${font}) format('truetype');font-weight:${i ? 700 : 400}}`,
    )
    .join("");
  const svgDocument = `<svg xmlns="http://www.w3.org/2000/svg" width="${width / 72}in" height="${height / 72}in" viewBox="0 0 ${width} ${height}"><title>${escapeXml(title)}</title><style>${fontStyles}text{font-family:Genealogy,sans-serif}</style>${svg.join("")}</svg>`;
  return { doc, svg: svgDocument };
}

/** Returns jsPDF for callers needing bytes or a preview instead of a download. */
export async function createPosterDocument(layout, options = {}) {
  return (await drawPoster(layout, options)).doc;
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
