import { buildLayout } from "./layout.js";
import { resolveLive } from "./live.js";
import { API_URL } from "./config.js";
import {
  validateDataset,
  normalize,
  matchNames,
  ancestry,
  descendants,
  subgraph,
  safeUrl,
} from "./graph.js?v=6";
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
  viewMode = "group",
  gesture = null,
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
function draw() {
  selected = null;
  $("person-card").hidden = true;
  visible = subgraph(people, roots, {
    depth: $("depth").value === "25" ? Infinity : Number($("depth").value),
    sharedOnly: $("shared-only").checked,
    includeStudents: $("include-students").checked,
  });
  const rendered = visible;
  for (const n of rendered.nodes) {
    const lines = wrap(n.person.name);
    n.width = Math.max(
      140,
      Math.min(
        250,
        Math.max(
          ...lines.map((line) => measuringContext.measureText(line).width),
        ) + 28,
      ),
    );
    n.height = Math.max(56, wrap(n.person.name).length * 23 + 29);
    n.color = color(n.id);
  }
  positionGraph();
  layout = buildLayout(rendered, roots, $("graph").clientWidth / Math.max(1, $("graph").clientHeight - 80));
  const edges = layout.edges;
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
            y: 25 + i * 23,
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
            y: lines.length * 23 + 18,
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
    chip.style.setProperty("--branch", CMC_MAROON);
    chip.append(html("i"), html("span", people.get(id).name));
    chip.setAttribute("aria-pressed", "false");
    let touchStart, handledTouchUntil = 0;
    chip.onpointerdown = (e) => {
      if (e.pointerType === "touch") touchStart = { x: e.clientX, y: e.clientY };
    };
    chip.onpointercancel = () => { touchStart = null; };
    chip.onpointerup = (e) => {
      if (e.pointerType !== "touch" || !touchStart) return;
      if (Math.hypot(e.clientX - touchStart.x, e.clientY - touchStart.y) < 8) {
        // Mobile browsers can suppress the synthetic click just after a pan.
        handledTouchUntil = performance.now() + 700;
        toggle(id, true);
      }
      touchStart = null;
    };
    chip.onclick = (e) => {
      if (!e.detail || performance.now() > handledTouchUntil) toggle(id, true);
    };
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
  const chips = $("name-chips");
  const capacity = Math.max(1, Math.floor(chips.clientWidth / (innerWidth < 700 ? 100 : 148)));
  const count = roots?.length || 1;
  const columns = Math.ceil(count / Math.ceil(count / capacity));
  chips.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
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
  viewMode = "group";
  const group = layout.nodes.filter((node) => node.root || node.student);
  if (!group.length) return fit(animate);
  const left = Math.min(...group.map((node) => node.x - node.width / 2)),
    right = Math.max(...group.map((node) => node.x + node.width / 2)),
    top = Math.min(...group.map((node) => node.y - node.height / 2)),
    bottom = Math.max(...group.map((node) => node.y + node.height / 2));
  const w = $("graph").clientWidth, h = $("graph").clientHeight;
  const sidePadding = Math.min(72, Math.max(24, w * 0.05));
  const topPadding = 48, bottomPadding = 110;
  const availableHeight = Math.max(1, h - topPadding - bottomPadding);
  const k = Math.max(0.015, Math.min(1.15, (w - sidePadding * 2) / (right - left), availableHeight / (bottom - top)));
  move({
    k,
    x: w / 2 - (left + right) * k / 2,
    y: topPadding + availableHeight / 2 - (top + bottom) * k / 2,
  }, animate);
}
function fit(animate = true) {
  if (!layout) return;
  viewMode = "all";
  const w = $("graph").clientWidth,
    h = $("graph").clientHeight;
  const k = Math.min((w - 70) / layout.width, (h - 110) / layout.height, 1.2);
  move(
    {
      k: Math.max(0.015, k),
      x: (w - layout.width * k) / 2,
      y: (h - 60 - layout.height * k) / 2,
    },
    animate,
  );
}
function zoom(
  factor,
  x = $("graph").clientWidth / 2,
  y = $("graph").clientHeight / 2,
) {
  cancelAnimationFrame(animation);
  viewMode = "custom";
  const k = Math.max(0.015, Math.min(3, camera.k * factor));
  camera = {
    x: x - ((x - camera.x) * k) / camera.k,
    y: y - ((y - camera.y) * k) / camera.k,
    k,
  };
  transform();
}
function clearSelection() {
  selected = null;
  $("person-card").hidden = true;
  for (const node of layout?.nodes || []) {
    node.color = color(node.id);
    node.dim = false;
    node.selected = false;
  }
  for (const edge of layout?.edges || []) edge.dim = false;
  document.querySelectorAll(".node,.edge,.name-chip").forEach((e) => {
    e.classList.remove("dim", "lit", "selected", "muted");
    if (e.hasAttribute("aria-pressed")) e.setAttribute("aria-pressed", "false");
    if (e.classList.contains("name-chip"))
      e.style.setProperty("--branch", CMC_MAROON);
    else if (e.classList.contains("node"))
      e.style.setProperty("--branch", color(e.dataset.id));
  });
}
function toggle(id, focus = false) {
  if (selected === id) {
    clearSelection();
    return;
  }
  select(id, focus);
}
function select(id, focus = false) {
  selected = id;
  if (focus && innerWidth <= 700) {
    const node = layout.nodes.find(node => node.id === id);
    if (node) {
      const k = Math.max(camera.k, 0.8), h = $("graph").clientHeight;
      move({ k, x: $("graph").clientWidth / 2 - node.x * k,
        y: Math.max(60, Math.min(h * 0.3, h - 260)) - node.y * k });
    }
  }
  const person = people.get(id),
    ancestors = ancestry(id, people),
    successors = descendants(id, people),
    related = new Set([...ancestors, ...successors]);
  for (const node of layout.nodes) {
    node.selected = node.id === id;
    node.dim = !related.has(node.id);
    node.color =
      node.id === id && id === "mgp-339304" ? SELECTED_TEAL : color(node.id);
  }
  for (const edge of layout.edges)
    edge.dim = !(
      (ancestors.has(edge.from) && ancestors.has(edge.to)) ||
      (successors.has(edge.from) && successors.has(edge.to))
    );
  document.querySelectorAll(".node").forEach((e) => {
    e.classList.toggle("dim", !related.has(e.dataset.id));
    e.style.setProperty(
      "--branch",
      e.dataset.id === id && id === "mgp-339304"
        ? SELECTED_TEAL
        : color(e.dataset.id),
    );
    e.classList.toggle("selected", e.dataset.id === id);
    e.setAttribute("aria-pressed", String(e.dataset.id === id));
  });
  document.querySelectorAll(".edge").forEach((e) => {
    const lit =
      (ancestors.has(e.dataset.from) && ancestors.has(e.dataset.to)) ||
      (successors.has(e.dataset.from) && successors.has(e.dataset.to));
    e.classList.toggle("lit", lit);
    e.classList.toggle("dim", !lit);
  });
  document.querySelectorAll(".name-chip").forEach((e) => {
    e.classList.toggle("selected", e.dataset.id === id);
    e.classList.toggle("muted", !related.has(e.dataset.id));
    e.style.setProperty(
      "--branch",
      e.dataset.id === id && id === "mgp-339304" ? SELECTED_TEAL : CMC_MAROON,
    );
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
// Capture gestures even when they start on a name. A tap selects; a drag or
// two-finger pinch never changes the selection.
const pointers = new Map();
$("graph").onpointerdown = (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();
  cancelAnimationFrame(animation);
  if (!pointers.size) gesture = {
    startX: e.clientX, startY: e.clientY, moved: false,
    person: e.target.closest(".node")?.dataset.id,
  };
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size > 1) gesture.moved = true;
  $("graph").setPointerCapture(e.pointerId);
};
$("graph").onpointermove = (e) => {
  if (!pointers.has(e.pointerId)) return;
  const previous = [...pointers.values()];
  const old = pointers.get(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) {
    const next = [...pointers.values()], rect = $("graph").getBoundingClientRect();
    const center = (points) => ({ x: (points[0].x + points[1].x) / 2 - rect.left, y: (points[0].y + points[1].y) / 2 - rect.top });
    const distance = (points) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    const before = center(previous), after = center(next);
    const k = Math.max(0.015, Math.min(3, camera.k * distance(next) / Math.max(1, distance(previous))));
    camera = { k, x: after.x - (before.x - camera.x) * k / camera.k, y: after.y - (before.y - camera.y) * k / camera.k };
    gesture.moved = true;
  } else {
    if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > 6) gesture.moved = true;
    if (!gesture.moved) return;
    camera.x += e.clientX - old.x;
    camera.y += e.clientY - old.y;
  }
  viewMode = "custom";
  $("graph").classList.add("dragging");
  transform();
};
function endPointer(e, cancelled = false) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (cancelled) gesture.moved = true;
  if (pointers.size) return;
  const tap = !gesture.moved, person = gesture.person;
  gesture = null;
  $("graph").classList.remove("dragging");
  if (tap) person ? toggle(person) : clearSelection();
}
$("graph").onpointerup = (e) => endPointer(e);
$("graph").onpointercancel = (e) => endPointer(e, true);
$("graph").onlostpointercapture = (e) => endPointer(e, true);
$("graph").onclick = (e) => {
  // Screen-reader activation may generate a click without pointer events.
  if (e.detail === 0 && e.target.closest(".node")) toggle(e.target.closest(".node").dataset.id);
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
    viewMode = "custom";
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
function resizeView() {
  positionGraph();
  if (viewMode === "group") home(false);
  else if (viewMode === "all") fit(false);
}
new ResizeObserver(resizeView).observe(document.querySelector("header"));
window.addEventListener("resize", resizeView);
$("edit-open").onclick = () => {
  $("names").value = roots.map((id) => people.get(id).name).join("\n");
  $("edit-dialog").showModal();
};
$("reset").onclick = () => {
  setData(original);
  isCMC = true;
  $("shared-only").checked = false;
  $("include-students").checked = true;
  $("depth").value = "25";
  $("depth-value").textContent = "All";
  $("depth").setAttribute("aria-valuetext", "All generations");
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
    result.roots.length
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
  $("depth").setAttribute("aria-valuetext", "All generations");
    draw();
    $("edit-dialog").close();
  } catch (e) {
    $("name-errors").textContent = "Import failed: " + e.message;
  } finally {
    $("import").value = "";
  }
};
$("options-open").onclick = () => $("options-dialog").showModal();
let depthTimer;
$("depth").oninput = () => {
  const all = $("depth").value === "25";
  $("depth-value").textContent = all ? "All" : $("depth").value;
  $("depth").setAttribute("aria-valuetext", all ? "All generations" : `${$("depth").value} generations`);
  clearTimeout(depthTimer);
  depthTimer = setTimeout(draw, 100);
};
$("shared-only").onchange = () => draw();
$("include-students").onchange = () => draw();
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
let printCache;
function printLayout() {
  const depth = $("poster-depth").value === "all" ? Infinity : Number($("poster-depth").value);
  const key = JSON.stringify([roots, depth, $("include-students").checked, $("shared-only").checked, selected]);
  if (printCache?.source === dataset && printCache.key === key) return printCache.layout;
  const graph = subgraph(people, roots, { depth, includeStudents: $("include-students").checked, sharedOnly: $("shared-only").checked });
  const ancestors = selected ? ancestry(selected, people) : null;
  const successors = selected ? descendants(selected, people) : null;
  for (const n of graph.nodes) {
    const lines = wrap(n.person.name);
    n.width = Math.max(140, Math.min(250, Math.max(...lines.map(line => measuringContext.measureText(line).width)) + 28));
    n.height = Math.max(56, lines.length * 23 + 29);
    n.selected = n.id === selected;
    n.color = n.id === selected && selected === "mgp-339304" ? SELECTED_TEAL : n.shared ? CMC_GOLD : CMC_MAROON;
    n.dim = selected ? !(ancestors.has(n.id) || successors.has(n.id)) : false;
  }
  for (const e of graph.edges) e.dim = selected ? !((ancestors.has(e.from) && ancestors.has(e.to)) || (successors.has(e.from) && successors.has(e.to))) : false;
  const output = buildLayout(graph, roots, 1.5);
  printCache = { source: dataset, key, layout: output };
  return output;
}
let previewRevision = 0, previewUrl;
async function updatePosterPreview() {
  const revision = ++previewRevision;
  try {
    const { getPosterMetrics, createPosterSvg } = await import("./poster.js?v=7");
    const tree = printLayout();
    const m = getPosterMetrics(tree, $("poster-size").value, "landscape");
    $("poster-dimensions").textContent =
      `${$("poster-depth").value === "all" ? "All" : $("poster-depth").value} generations · ${m.width.toFixed(1)} × ${m.height.toFixed(1)} inches · ${m.nameSize.toFixed(1)} pt names${m.nameSize < 8 ? ". Choose Size to fit for larger text." : ""}`;
    $("poster-layout-note").hidden = m.layoutMode !== "landscape";
    const preview = await createPosterSvg(tree, {
      title: $("poster-title").value || "PhD Genealogy Tree",
      size: $("poster-size").value, layoutMode: "landscape",
    });
    if (revision !== previewRevision || !$("poster-dialog").open) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(new Blob([preview], { type: "image/svg+xml" }));
    $("poster-preview").src = previewUrl;
    $("poster-preview").hidden = false;
  } catch {
    $("poster-dimensions").textContent = "";
  }
}
$("poster-size").onchange = updatePosterPreview;
$("poster-depth").onchange = updatePosterPreview;
$("poster-title").onchange = updatePosterPreview;
$("poster-format").onchange = () => {
  $("download").textContent = `Download ${$("poster-format").value.toUpperCase()} ↓`;
};
async function download(kind) {
  const button = $("download");
  button.disabled = true;
  $("export-status").textContent = "Preparing…";
  try {
    const exporter = await import("./poster.js?v=7");
    const options = {
      title: $("poster-title").value || "PhD Genealogy Tree",
      subtitle: selected
        ? people.get(selected).name + " · Ancestors and descendants highlighted"
        : isCMC
          ? "Claremont McKenna College · Mathematical Sciences"
          : roots.map((id) => people.get(id).name).join(" · "),
      size: $("poster-size").value,
      layoutMode: "landscape",
      sourceDate: dataset.updated,
    };
    options.subtitle += ` · ${$("poster-depth").value === "all" ? "All recorded generations" : $("poster-depth").value + " generations of ancestry"}`;
    await (kind === "pdf" ? exporter.exportPoster : exporter.exportSvg)(
      printLayout(),
      options,
    );
    $("export-status").textContent = "Ready.";
  } catch (e) {
    $("export-status").textContent = e.message;
  } finally {
    button.disabled = false;
  }
}
$("download").onclick = () => download($("poster-format").value);
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
