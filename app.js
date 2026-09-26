import dagre from "./vendor/dagre.js";
import { resolveLive } from "./live.js";
import { API_URL } from "./config.js";
import {
  validateDataset,
  normalize,
  matchNames,
  ancestry,
  subgraph,
  safeUrl,
} from "./graph.js";
const $ = (id) => document.getElementById(id),
  NS = "http://www.w3.org/2000/svg";
const CMC_MAROON = "#981a31",
  CMC_GOLD = "#9e7c0a",
  SELECTED_TEAL = "#087f7a";
let original,
  dataset,
  people,
  roots,
  layout,
  visible,
  selected = null,
  isCMC = true,
  lookupController = null;
let camera = { x: 0, y: 0, k: 1 },
  beforeSelection = null,
  drag = null,
  ignoreClick = false,
  animation;
const svg = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};
const html = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
const measuringCanvas = document.createElement("canvas");
const measuringContext = measuringCanvas.getContext("2d");
function wrap(text, maxWidth = 220) {
  measuringContext.font = "400 23px Lora, Georgia, serif";
  const lines = [""];
  for (const word of text.split(/\s+/)) {
    const pieces = [];
    let piece = "";
    for (const char of word) {
      if (
        piece &&
        measuringContext.measureText(piece + char).width > maxWidth
      ) {
        pieces.push(piece);
        piece = "";
      }
      piece += char;
    }
    if (piece) pieces.push(piece);
    for (const part of pieces) {
      const i = lines.length - 1;
      if (
        lines[i] &&
        measuringContext.measureText(lines[i] + " " + part).width > maxWidth
      )
        lines.push(part);
      else lines[i] += (lines[i] ? " " : "") + part;
    }
  }
  return lines;
}
function setData(data) {
  validateDataset(data);
  dataset = data;
  people = new Map(data.people.map((p) => [p.id, p]));
  roots = [...data.defaultRoots];
  $("names").value = roots.map((id) => people.get(id).name).join("\n");
}
function color(id) {
  return (visible.membership.get(id)?.size || 0) > 1 ? CMC_GOLD : CMC_MAROON;
}
function draw(focusId = null) {
  if (!focusId) {
    selected = null;
    beforeSelection = null;
  }
  $("person-card").hidden = true;
  visible = subgraph(people, roots, {
    depth: $("depth").value === "25" ? Infinity : Number($("depth").value),
    sharedOnly: $("shared-only").checked,
  });
  const rendered = focusId
    ? subgraph(people, [focusId], {
        depth: $("depth").value === "25" ? Infinity : Number($("depth").value),
      })
    : visible;
  if (focusId)
    for (const n of rendered.nodes) {
      n.shared = (visible.membership.get(n.id)?.size || 0) > 1;
    }
  const g = new dagre.graphlib.Graph()
    .setGraph({
      rankdir: "TB",
      nodesep: 30,
      ranksep: 78,
      marginx: 30,
      marginy: 30,
      ranker: "network-simplex",
    })
    .setDefaultEdgeLabel(() => ({}));
  const ids = new Map(rendered.nodes.map((n, i) => [n.id, "n" + i]));
  for (const n of rendered.nodes) {
    const lines = wrap(n.person.name);
    n.width = Math.max(
      170,
      Math.min(
        250,
        Math.max(
          ...lines.map((line) => measuringContext.measureText(line).width),
        ) + 28,
      ),
    );
    n.height = Math.max(88, wrap(n.person.name).length * 27 + 38);
    n.color =
      focusId === n.id && n.id === "mgp-339304" ? SELECTED_TEAL : color(n.id);
    g.setNode(ids.get(n.id), { width: n.width, height: n.height });
  }
  for (const e of rendered.edges) g.setEdge(ids.get(e.from), ids.get(e.to));
  // A hidden common sink keeps the selected people together along the bottom.
  g.setNode("group-anchor", { width: 0, height: 0 });
  for (const id of focusId ? [focusId] : roots)
    g.setEdge(ids.get(id), "group-anchor", { weight: 100, minlen: 1 });
  dagre.layout(g);
  const nodes = rendered.nodes.map((n) => ({
    ...n,
    x: g.node(ids.get(n.id)).x,
    y: g.node(ids.get(n.id)).y,
  }));
  // Compact each generation around its students, eliminating the long blank
  // horizontal stretches introduced by the layout's hidden routing nodes.
  const rows = [...new Set(nodes.map((n) => n.y))]
    .sort((a, b) => b - a)
    .map((y) => ({
      y,
      nodes: nodes.filter((n) => n.y === y).sort((a, b) => a.x - b.x),
    }));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const row of rows) {
    for (const n of row.nodes) n.oldX = n.x;
    const desired = row.nodes.map((n, i) => {
      const students = rendered.edges
        .filter((e) => e.from === n.id)
        .map((e) => nodeMap.get(e.to));
      return students.length
        ? students.reduce((sum, c) => sum + c.x, 0) / students.length
        : i * 230;
    });
    row.nodes.forEach((n, i) => {
      n.x = i
        ? Math.max(
            desired[i],
            row.nodes[i - 1].x + (row.nodes[i - 1].width + n.width) / 2 + 32,
          )
        : desired[i];
    });
    const shift =
      row.nodes.reduce((sum, n, i) => sum + n.x - desired[i], 0) /
      row.nodes.length;
    row.nodes.forEach((n) => (n.x -= shift));
  }
  function mapRowX(row, x) {
    const stops = row.nodes.flatMap((n) => [
      [n.oldX - n.width / 2, n.x - n.width / 2],
      [n.oldX + n.width / 2, n.x + n.width / 2],
    ]);
    if (x <= stops[0][0]) return x + stops[0][1] - stops[0][0];
    for (let i = 1; i < stops.length; i++)
      if (x <= stops[i][0]) {
        const [a, b] = stops[i - 1],
          [c, d] = stops[i];
        return b + ((x - a) / (c - a)) * (d - b);
      }
    return x + stops.at(-1)[1] - stops.at(-1)[0];
  }
  function mapPoint(p) {
    if (p.y >= rows[0].y) return { x: mapRowX(rows[0], p.x), y: p.y };
    for (let i = 1; i < rows.length; i++)
      if (p.y >= rows[i].y) {
        const upper = rows[i],
          lower = rows[i - 1],
          t = (p.y - upper.y) / (lower.y - upper.y);
        return {
          x: mapRowX(upper, p.x) * (1 - t) + mapRowX(lower, p.x) * t,
          y: p.y,
        };
      }
    return { x: mapRowX(rows.at(-1), p.x), y: p.y };
  }
  const minX = Math.min(...nodes.map((n) => n.x - n.width / 2)) - 30,
    minY = Math.min(...nodes.map((n) => n.y - n.height / 2)) - 30;
  const width = Math.max(...nodes.map((n) => n.x + n.width / 2)) - minX + 30,
    height = Math.max(...nodes.map((n) => n.y + n.height / 2)) - minY + 30;
  const edges = rendered.edges.map((e) => {
    const parent = nodes.find((n) => n.id === e.from),
      child = nodes.find((n) => n.id === e.to);
    const points = g
      .edge(ids.get(e.from), ids.get(e.to))
      .points.map(mapPoint)
      .map((p) => ({ x: p.x - minX, y: p.y - minY }));
    points[0] = { x: parent.x - minX, y: parent.y + parent.height / 2 - minY };
    points[points.length - 1] = {
      x: child.x - minX,
      y: child.y - child.height / 2 - minY,
    };
    const routed =
      points.at(-1).y - points[0].y <= 110
        ? [points[0], points.at(-1)]
        : points;
    return { ...e, color: color(e.to), points: routed };
  });
  layout = {
    width,
    height,
    nodes: nodes.map((n) => ({ ...n, x: n.x - minX, y: n.y - minY })),
    edges,
  };
  $("viewport").replaceChildren();
  const paths = svg("g", { "aria-hidden": "true" });
  for (const edge of edges)
    paths.append(
      svg("path", {
        d: curve(edge.points),
        class: "edge",
        "data-from": edge.from,
        "data-to": edge.to,
        style: `--branch:${edge.color}`,
      }),
    );
  $("viewport").append(paths);
  for (const n of layout.nodes) {
    const group = svg("g", {
      class: `node${n.root ? " root" : ""}${n.shared ? " shared" : ""}${n.person.incomplete ? " incomplete" : ""}`,
      "data-id": n.id,
      transform: `translate(${n.x - n.width / 2},${n.y - n.height / 2})`,
      style: `--branch:${n.color}`,
      tabindex: 0,
      role: "button",
      "aria-pressed": "false",
      "aria-label": n.person.name,
    });
    group.append(
      svg("rect", {
        class: "hit",
        x: 0,
        y: 0,
        width: n.width,
        height: n.height,
        rx: 15,
      }),
    );
    group.append(
      svg("circle", {
        class: "anchor",
        cx: n.width / 2,
        cy: 0,
        r: n.root ? 5 : 3.5,
      }),
    );
    const lines = wrap(n.person.name);
    lines.forEach((line, i) =>
      group.append(
        svg(
          "text",
          {
            class: "name",
            x: n.width / 2,
            y: 30 + i * 27,
            "text-anchor": "middle",
          },
          line,
        ),
      ),
    );
    if (n.person.year)
      group.append(
        svg(
          "text",
          {
            class: "meta",
            x: n.width / 2,
            y: lines.length * 27 + 25,
            "text-anchor": "middle",
          },
          n.person.year,
        ),
      );
    group.append(
      svg(
        "title",
        {},
        `${n.person.name}\n${n.person.institution || ""}${n.person.year ? " · " + n.person.year : ""}`,
      ),
    );
    group.onclick = () => toggle(n.id);
    group.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle(n.id);
      }
    };
    $("viewport").append(group);
  }
  $("name-chips").replaceChildren();
  for (const [i, id] of roots.entries()) {
    const chip = html("button", null, "name-chip");
    chip.dataset.id = id;
    chip.style.setProperty(
      "--branch",
      focusId === id && id === "mgp-339304" ? SELECTED_TEAL : CMC_MAROON,
    );
    chip.append(html("i"), html("span", people.get(id).name));
    chip.setAttribute("aria-pressed", "false");
    chip.onclick = () => toggle(id, true);
    $("name-chips").append(chip);
  }
  $("data-notes").textContent =
    `${layout.nodes.length} people · ${layout.nodes.filter((n) => n.shared).length} shared ancestors`;
  const missing = layout.nodes.filter((n) => n.person.incomplete).length;
  if (missing)
    $("data-notes").textContent += ` · ${missing} records awaiting retrieval`;
  positionGraph();
  home(false);
}
function curve(points) {
  if (points.length < 2) return "";
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      y = (a.y + b.y) / 2;
    d += ` C${a.x},${y} ${b.x},${y} ${b.x},${b.y}`;
  }
  return d;
}
function positionGraph() {
  $("graph").style.top =
    document.querySelector("header").getBoundingClientRect().bottom + 15 + "px";
}
function transform() {
  $("viewport").setAttribute(
    "transform",
    `translate(${camera.x},${camera.y}) scale(${camera.k})`,
  );
}
function move(target, animate = true) {
  cancelAnimationFrame(animation);
  if (!animate || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    camera = target;
    transform();
    return;
  }
  const start = { ...camera },
    time = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - time) / 420),
      ease = 1 - (1 - t) ** 3;
    camera = {
      x: start.x + (target.x - start.x) * ease,
      y: start.y + (target.y - start.y) * ease,
      k: start.k + (target.k - start.k) * ease,
    };
    transform();
    if (t < 1) animation = requestAnimationFrame(frame);
  }
  animation = requestAnimationFrame(frame);
}
function home(animate = true) {
  if (!layout) return;
  const group = layout.nodes.filter((n) => n.root),
    width = $("graph").clientWidth,
    height = $("graph").clientHeight;
  const sorted = [...group].sort((a, b) => a.x - b.x);
  const center = sorted[Math.floor((sorted.length - 1) / 2)];
  const x = center.x,
    y = Math.max(...group.map((n) => n.y));
  const k = 0.82;
  move({ k, x: width / 2 - x * k, y: height * 0.78 - y * k }, animate);
}
function fit() {
  if (!layout) return;
  const w = $("graph").clientWidth,
    h = $("graph").clientHeight;
  const k = Math.min((w - 70) / layout.width, (h - 110) / layout.height, 1.2);
  move({
    k: Math.max(0.015, k),
    x: (w - layout.width * k) / 2,
    y: (h - 60 - layout.height * k) / 2,
  });
}
function zoom(
  factor,
  x = $("graph").clientWidth / 2,
  y = $("graph").clientHeight / 2,
) {
  cancelAnimationFrame(animation);
  const k = Math.max(0.015, Math.min(3, camera.k * factor));
  camera = {
    x: x - ((x - camera.x) * k) / camera.k,
    y: y - ((y - camera.y) * k) / camera.k,
    k,
  };
  transform();
}
function clearSelection(restore = true) {
  if (!selected) return;
  const saved = beforeSelection;
  selected = null;
  draw();
  if (restore && saved) move(saved, false);
}
function toggle(id, focus = false) {
  if (selected === id) {
    clearSelection();
    return;
  }
  select(id, focus);
}
function select(id, focus = false) {
  if (!beforeSelection) beforeSelection = { ...camera };
  draw(id);
  selected = id;
  const person = people.get(id),
    ancestors = ancestry(id, people);
  document.querySelectorAll(".node").forEach((e) => {
    e.classList.toggle("dim", !ancestors.has(e.dataset.id));
    e.classList.toggle("selected", e.dataset.id === id);
    e.setAttribute("aria-pressed", String(e.dataset.id === id));
  });
  document.querySelectorAll(".edge").forEach((e) => {
    const lit = ancestors.has(e.dataset.from) && ancestors.has(e.dataset.to);
    e.classList.toggle("lit", lit);
    e.classList.toggle("dim", !lit);
  });
  document.querySelectorAll(".name-chip").forEach((e) => {
    e.classList.toggle("selected", e.dataset.id === id);
    e.classList.toggle("muted", e.dataset.id !== id);
    e.setAttribute("aria-pressed", String(e.dataset.id === id));
  });
  const card = $("person-card");
  card.hidden = false;
  card.style.setProperty(
    "--selected",
    id === "mgp-339304" ? SELECTED_TEAL : CMC_MAROON,
  );
  card.replaceChildren();
  const close = html("button", "×", "close");
  close.setAttribute("aria-label", "Clear selection");
  close.onclick = () => clearSelection();
  card.append(
    close,
    html("h2", person.name),
    html("p", [person.institution, person.year].filter(Boolean).join(" · ")),
  );
  for (const parent of person.advisors) {
    const button = html("button", people.get(parent).name, "advisor");
    button.title = "Advisor";
    button.onclick = () => {
      if (layout.nodes.some((n) => n.id === parent)) select(parent, true);
    };
    card.append(button);
  }
  if (person.incomplete) card.append(html("p", "Record not yet retrieved."));
  for (const source of person.sources || []) {
    const url = safeUrl(source.url);
    if (!url) continue;
    const link = html("a", source.label + " ↗", "source");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    card.append(link);
  }
  {
    const node = layout.nodes.find((n) => n.id === id);
    if (node) {
      const k = Math.max(0.85, camera.k);
      move({
        k,
        x: $("graph").clientWidth / 2 - node.x * k,
        y: $("graph").clientHeight * 0.74 - node.y * k,
      });
    }
  }
}
$("graph").addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const r = $("graph").getBoundingClientRect();
    zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  },
  { passive: false },
);
$("graph").onpointerdown = (e) => {
  if (e.button !== 0 || e.target.closest(".node")) return;
  cancelAnimationFrame(animation);
  drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
  $("graph").setPointerCapture(e.pointerId);
  $("graph").classList.add("dragging");
};
$("graph").onpointermove = (e) => {
  if (!drag) return;
  camera.x += e.clientX - drag.x;
  camera.y += e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  transform();
};
$("graph").onpointerup = (e) => {
  if (drag)
    ignoreClick =
      Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 5;
  drag = null;
  $("graph").classList.remove("dragging");
};
$("graph").onpointercancel = () => {
  drag = null;
  ignoreClick = true;
  $("graph").classList.remove("dragging");
};
$("graph").onclick = (e) => {
  if (ignoreClick) {
    ignoreClick = false;
    return;
  }
  if (!e.target.closest(".node")) clearSelection();
};
$("graph").onkeydown = (e) => {
  if (e.key === "Escape") {
    clearSelection();
    return;
  }
  if (e.target !== $("graph")) return;
  const step = {
    ArrowLeft: [60, 0],
    ArrowRight: [-60, 0],
    ArrowUp: [0, 60],
    ArrowDown: [0, -60],
  }[e.key];
  if (step) {
    e.preventDefault();
    cancelAnimationFrame(animation);
    camera.x += step[0];
    camera.y += step[1];
    transform();
  } else if (["+", "=", "-", "0"].includes(e.key)) {
    e.preventDefault();
    if (e.key === "0") fit();
    else zoom(e.key === "-" ? 0.8 : 1.25);
  }
};
$("zoom-in").onclick = () => zoom(1.25);
$("zoom-out").onclick = () => zoom(0.8);
$("fit").onclick = fit;
$("home").onclick = () => {
  clearSelection(false);
  home();
};
new ResizeObserver(positionGraph).observe(document.querySelector("header"));
window.addEventListener("resize", () => {
  positionGraph();
  if (layout) home(false);
});
$("edit-open").onclick = () => {
  $("names").value = roots.map((id) => people.get(id).name).join("\n");
  $("edit-dialog").showModal();
};
$("reset").onclick = () => {
  setData(original);
  isCMC = true;
  $("shared-only").checked = false;
  $("depth").value = "25";
  $("depth-value").textContent = "All";
  draw();
  $("edit-dialog").close();
};
function chooseCandidate(name, candidates, signal) {
  return new Promise((resolve, reject) => {
    const holder = $("name-errors");
    holder.replaceChildren(html("p", `Which ${name}?`));
    const abort = () => {
      holder.replaceChildren();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    for (const candidate of candidates) {
      const button = html(
        "button",
        `${candidate.name} · ${candidate.detail || candidate.id}`,
        "candidate",
      );
      button.onclick = () => {
        signal.removeEventListener("abort", abort);
        holder.replaceChildren();
        resolve(candidate);
      };
      holder.append(button);
    }
  });
}
$("build").onclick = async () => {
  $("name-errors").textContent = "";
  const names = $("names").value,
    result = matchNames(names, dataset.people);
  if (
    !result.errors.length &&
    result.roots.length &&
    result.roots.every(
      (id) => ![...ancestry(id, people)].some((a) => people.get(a).incomplete),
    )
  ) {
    roots = result.roots;
    isCMC = false;
    draw();
    $("edit-dialog").close();
    return;
  }
  if (!API_URL) {
    $("name-errors").textContent =
      result.errors.join("\n") || "Enter at least one name.";
    return;
  }
  lookupController = new AbortController();
  $("build").disabled = true;
  $("reset").disabled = true;
  $("import").disabled = true;
  $("lookup-cancel").hidden = false;
  try {
    const data = await resolveLive(names, dataset, {
      api: API_URL,
      signal: lookupController.signal,
      onStatus: (message) => ($("lookup-status").textContent = message),
      chooseCandidate,
    });
    setData(data);
    isCMC = false;
    draw();
    $("edit-dialog").close();
    $("lookup-status").textContent = "";
  } catch (error) {
    $("name-errors").textContent =
      error.name === "AbortError" ? "Lookup cancelled." : error.message;
    $("lookup-status").textContent = "";
  } finally {
    lookupController = null;
    $("build").disabled = false;
    $("reset").disabled = false;
    $("import").disabled = false;
    $("lookup-cancel").hidden = true;
  }
};
$("lookup-cancel").onclick = () => lookupController?.abort();
$("edit-dialog").addEventListener("close", () => lookupController?.abort());
$("import").onchange = async () => {
  try {
    const file = $("import").files[0];
    if (!file) return;
    if (file.size > 5000000) throw Error("Choose a file smaller than 5 MB.");
    setData(JSON.parse(await file.text()));
    isCMC = false;
    $("shared-only").checked = false;
    $("depth").value = "25";
    $("depth-value").textContent = "All";
    draw();
    $("edit-dialog").close();
  } catch (e) {
    $("name-errors").textContent = "Import failed: " + e.message;
  } finally {
    $("import").value = "";
  }
};
$("options-open").onclick = () => $("options-dialog").showModal();
$("depth").oninput = () => {
  $("depth-value").textContent =
    $("depth").value === "25" ? "All" : $("depth").value;
  draw();
};
$("shared-only").onchange = () => draw();
$("find").oninput = () => {
  const query = normalize($("find").value);
  $("search-results").replaceChildren();
  if (!query) return;
  for (const node of layout.nodes
    .filter((n) => normalize(n.person.name).includes(query))
    .slice(0, 12)) {
    const button = html("button", node.person.name);
    button.onclick = () => {
      $("options-dialog").close();
      select(node.id, true);
    };
    $("search-results").append(button);
  }
};
$("poster-open").onclick = () => {
  $("poster-dialog").showModal();
  updatePosterPreview();
};
async function updatePosterPreview() {
  try {
    const { getPosterMetrics } = await import("./poster.js?v=2");
    const m = getPosterMetrics(layout, $("poster-size").value);
    $("poster-dimensions").textContent =
      `${m.width.toFixed(1)} × ${m.height.toFixed(1)} inches · ${m.nameSize.toFixed(1)} pt names`;
  } catch {
    $("poster-dimensions").textContent = "";
  }
}
$("poster-size").onchange = updatePosterPreview;
async function download(kind) {
  const button = $(kind === "pdf" ? "pdf" : "svg-export");
  button.disabled = true;
  $("export-status").textContent = "Preparing…";
  try {
    const exporter = await import("./poster.js?v=2");
    const options = {
      title: $("poster-title").value || "PhD Genealogy Tree",
      subtitle: selected
        ? people.get(selected).name + " · Advisor lineage"
        : isCMC
          ? "Claremont McKenna College · Mathematical Sciences"
          : roots.map((id) => people.get(id).name).join(" · "),
      size: $("poster-size").value,
      sourceDate: dataset.updated,
    };
    await (kind === "pdf" ? exporter.exportPoster : exporter.exportSvg)(
      layout,
      options,
    );
    $("export-status").textContent = "Ready.";
  } catch (e) {
    $("export-status").textContent = e.message;
  } finally {
    button.disabled = false;
  }
}
$("pdf").onclick = () => download("pdf");
$("svg-export").onclick = () => download("svg");
const startupControls = ["edit-open", "options-open", "poster-open"];
startupControls.forEach((id) => ($(id).disabled = true));
try {
  const response = await fetch("./data/genealogy.json", { cache: "no-cache" });
  if (!response.ok)
    throw Error("The tree could not be loaded. Please refresh.");
  original = await response.json();
  setData(original);
  await document.fonts.ready;
  draw();
  $("loading").hidden = true;
  startupControls.forEach((id) => ($(id).disabled = false));
} catch (e) {
  $("loading").textContent = e.message;
}
