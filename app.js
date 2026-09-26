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
const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
let original,
  dataset,
  people,
  roots,
  layout,
  visible,
  selected = null;
let lookupController = null;
let camera = { x: 0, y: 0, k: 1 },
  drag = null;
const el = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};
function wrap(text, max = 25) {
  const lines = [""];
  for (const word of text
    .split(/\s+/)
    .flatMap((word) => word.match(new RegExp(`.{1,${max}}`, "gu")) || [])) {
    const n = lines.length - 1;
    if (lines[n] && (lines[n] + " " + word).length > max) lines.push(word);
    else lines[n] += (lines[n] ? " " : "") + word;
  }
  return lines;
}
function setData(data) {
  validateDataset(data);
  dataset = data;
  people = new Map(data.people.map((p) => [p.id, p]));
  roots = [...data.defaultRoots];
  selected = null;
  $("names").value = roots.map((id) => people.get(id).name).join("\n");
}
function draw() {
  selected = null;
  $("find").value = "";
  $("search-results").replaceChildren();
  visible = subgraph(people, roots, {
    depth:
      Number($("depth").value) === 25 ? Infinity : Number($("depth").value),
    sharedOnly: $("shared-only").checked,
  });
  const g = new dagre.graphlib.Graph()
    .setGraph({
      rankdir: "TB",
      nodesep: 25,
      ranksep: 65,
      marginx: 35,
      marginy: 35,
      ranker: "network-simplex",
    })
    .setDefaultEdgeLabel(() => ({}));
  const layoutIds = new Map(visible.nodes.map((n, i) => [n.id, `n${i}`]));
  for (const n of visible.nodes) {
    n.width = 190;
    n.height = Math.max(66, wrap(n.person.name).length * 15 + 32);
    g.setNode(layoutIds.get(n.id), { width: n.width, height: n.height });
  }
  for (const e of visible.edges)
    g.setEdge(layoutIds.get(e.from), layoutIds.get(e.to));
  dagre.layout(g);
  layout = {
    width: g.graph().width || 300,
    height: g.graph().height || 200,
    nodes: visible.nodes.map((n) => ({
      ...n,
      x: g.node(layoutIds.get(n.id)).x,
      y: g.node(layoutIds.get(n.id)).y,
    })),
    edges: visible.edges.map((e) => ({
      ...e,
      points: g.edge(layoutIds.get(e.from), layoutIds.get(e.to)).points,
    })),
  };
  const viewport = $("viewport");
  viewport.replaceChildren();
  const edges = el("g", { "aria-hidden": "true" });
  for (const e of layout.edges) {
    const d = e.points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
    edges.append(
      el("path", { d, class: "edge", "data-from": e.from, "data-to": e.to }),
    );
  }
  viewport.append(edges);
  for (const n of layout.nodes) {
    const group = el("g", {
      class: `node${n.root ? " root" : ""}${n.shared ? " shared" : ""}${n.person.incomplete ? " incomplete" : ""}`,
      "data-id": n.id,
      transform: `translate(${n.x - n.width / 2},${n.y - n.height / 2})`,
      tabindex: "0",
      role: "button",
      "aria-label": `${n.person.name}, ${n.person.year || "year unrecorded"}. Trace ancestry.`,
    });
    group.append(el("rect", { width: n.width, height: n.height, rx: 6 }));
    const lines = wrap(n.person.name);
    lines.forEach((line, i) =>
      group.append(el("text", { x: 13, y: 22 + i * 15, class: "name" }, line)),
    );
    const institution = n.person.institution || "Institution unrecorded";
    const meta = `${n.person.year || "—"} · ${institution}`;
    group.append(
      el(
        "text",
        { x: 13, y: n.height - 12, class: "meta" },
        meta.length > 32 ? meta.slice(0, 30) + "…" : meta,
      ),
    );
    group.append(
      el(
        "title",
        {},
        `${n.person.name}\n${n.person.year || "Year unrecorded"} · ${institution}`,
      ),
    );
    group.addEventListener("click", () => select(n.id));
    group.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select(n.id);
      }
    });
    viewport.append(group);
  }
  const shared = layout.nodes.filter((n) => n.shared).length;
  $("stats").replaceChildren();
  for (const line of [
    `${roots.length} people in your group`,
    `${layout.nodes.length} records · ${shared} shared ancestors`,
  ]) {
    const d = document.createElement("div");
    d.textContent = line;
    $("stats").append(d);
  }
  $("graph-kicker").textContent =
    $("preset").value === "cmc"
      ? "THE CMC CONSTELLATION"
      : "YOUR CONSTELLATION";
  $("group-description").textContent =
    $("preset").value === "cmc"
      ? `Tenured and tenure-track faculty · ${roots.length} people`
      : `A custom group · ${roots.length} people`;
  clearSelection();
  fit();
}
function transform() {
  $("viewport").setAttribute(
    "transform",
    `translate(${camera.x},${camera.y}) scale(${camera.k})`,
  );
  $("zoom-level").textContent = Math.round(camera.k * 100) + "%";
}
function fit() {
  if (!layout) return;
  const { width, height } = $("graph").getBoundingClientRect();
  camera.k = Math.min(
    (width - 45) / layout.width,
    (height - 45) / layout.height,
    1.3,
  );
  camera.k = Math.max(0.015, camera.k);
  camera.x = (width - layout.width * camera.k) / 2;
  camera.y = (height - layout.height * camera.k) / 2;
  transform();
}
function zoom(
  factor,
  x = $("graph").clientWidth / 2,
  y = $("graph").clientHeight / 2,
) {
  const k = Math.max(0.015, Math.min(3, camera.k * factor));
  camera.x = x - ((x - camera.x) * k) / camera.k;
  camera.y = y - ((y - camera.y) * k) / camera.k;
  camera.k = k;
  transform();
}
function clearSelection() {
  selected = null;
  document
    .querySelectorAll(".node,.edge")
    .forEach((e) => e.classList.remove("dim", "lit", "selected"));
  $("person-card").replaceChildren();
  const eyebrow = document.createElement("div");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "FOLLOW A THREAD";
  const p = document.createElement("p");
  p.textContent =
    "Select a person to illuminate their ancestors and see where their lineages meet.";
  $("person-card").append(eyebrow, p);
}
function select(id, focus = false) {
  selected = id;
  const p = people.get(id),
    ancestors = ancestry(id, people);
  document.querySelectorAll(".node").forEach((e) => {
    e.classList.toggle("dim", !ancestors.has(e.dataset.id));
    e.classList.toggle("selected", e.dataset.id === id);
  });
  document.querySelectorAll(".edge").forEach((e) => {
    const lit = ancestors.has(e.dataset.from) && ancestors.has(e.dataset.to);
    e.classList.toggle("dim", !lit);
    e.classList.toggle("lit", lit);
  });
  const card = $("person-card");
  card.replaceChildren();
  const add = (tag, text, cls) => {
    const e = document.createElement(tag);
    e.textContent = text;
    if (cls) e.className = cls;
    card.append(e);
    return e;
  };
  add(
    "div",
    roots.includes(id)
      ? "IN YOUR GROUP"
      : visible.membership.get(id)?.size > 1
        ? "A SHARED ANCESTOR"
        : "AN ANCESTOR",
    "eyebrow",
  );
  add("h3", p.name);
  add(
    "p",
    `${p.institution || "Institution unrecorded"} · ${p.year || "Year unrecorded"}`,
  );
  add(
    "p",
    `${ancestors.size - 1} ancestors in this collection · connected to ${visible.membership.get(id)?.size || 0} of your group`,
  );
  if (p.advisors.length) {
    add("div", "Advised by");
    for (const parent of p.advisors) {
      const button = add("button", people.get(parent).name);
      button.onclick = () => {
        if (layout.nodes.some((n) => n.id === parent)) select(parent, true);
        else {
          card.querySelector(".outside-note")?.remove();
          add(
            "p",
            "This advisor is outside the current filters. Increase generations or turn off shared ancestry to see them.",
            "outside-note",
          );
        }
      };
    }
  } else
    add(
      "p",
      p.incomplete
        ? "This record has not been retrieved yet."
        : "The included record ends here.",
    );
  if (p.note) add("p", p.note);
  const sources = document.createElement("ul");
  for (const s of p.sources || []) {
    const url = safeUrl(s.url);
    if (!url) continue;
    const li = document.createElement("li"),
      a = document.createElement("a");
    a.href = url;
    a.textContent = s.label + " ↗";
    a.target = "_blank";
    a.rel = "noopener";
    li.append(a);
    sources.append(li);
  }
  card.append(sources);
  if (focus) {
    const n = layout.nodes.find((n) => n.id === id);
    if (n) {
      camera.k = Math.max(camera.k, 0.85);
      camera.x = $("graph").clientWidth / 2 - n.x * camera.k;
      camera.y = $("graph").clientHeight / 2 - n.y * camera.k;
      transform();
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
$("graph").addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || e.target.closest(".node")) return;
  drag = { x: e.clientX, y: e.clientY };
  $("graph").setPointerCapture(e.pointerId);
  $("graph").classList.add("dragging");
});
$("graph").addEventListener("pointermove", (e) => {
  if (!drag) return;
  camera.x += e.clientX - drag.x;
  camera.y += e.clientY - drag.y;
  drag = { x: e.clientX, y: e.clientY };
  transform();
});
for (const event of ["pointerup", "pointercancel"])
  $("graph").addEventListener(event, () => {
    drag = null;
    $("graph").classList.remove("dragging");
  });
$("graph").addEventListener("keydown", (e) => {
  if (e.target !== $("graph")) return;
  const steps = {
    ArrowLeft: [45, 0],
    ArrowRight: [-45, 0],
    ArrowUp: [0, 45],
    ArrowDown: [0, -45],
  };
  if (steps[e.key]) {
    e.preventDefault();
    camera.x += steps[e.key][0];
    camera.y += steps[e.key][1];
    transform();
  } else if (["+", "=", "-", "0", "Escape"].includes(e.key)) {
    e.preventDefault();
    if (e.key === "0") fit();
    else if (e.key === "Escape") clearSelection();
    else zoom(e.key === "-" ? 0.8 : 1.25);
  }
});
$("zoom-in").onclick = () => zoom(1.3);
$("zoom-out").onclick = () => zoom(1 / 1.3);
$("fit").onclick = fit;
$("clear").onclick = clearSelection;
new ResizeObserver(() => {
  if (layout) fit();
}).observe($("graph"));
$("depth").oninput = () => {
  $("depth-value").textContent =
    $("depth").value === "25" ? "All" : $("depth").value;
  draw();
};
$("shared-only").onchange = draw;
$("find").oninput = () => {
  const query = normalize($("find").value),
    results = $("search-results");
  results.replaceChildren();
  if (!query) return;
  for (const n of layout.nodes
    .filter((n) => normalize(n.person.name).includes(query))
    .slice(0, 10)) {
    const button = document.createElement("button");
    button.textContent = n.person.name;
    button.onclick = () => {
      select(n.id, true);
      results.replaceChildren();
    };
    results.append(button);
  }
  if (!results.childElementCount)
    results.textContent = "No matching person in the current graph.";
};
function chooseCandidate(name, candidates, signal) {
  return new Promise((resolve, reject) => {
    const holder = $("name-errors");
    holder.replaceChildren();
    const label = document.createElement("p");
    label.textContent = `Which “${name}” do you mean?`;
    holder.append(label);
    const abort = () => {
      holder.replaceChildren();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    for (const candidate of candidates) {
      const button = document.createElement("button");
      button.className = "candidate";
      button.textContent = `${candidate.name} · ${candidate.detail || "MGP " + candidate.id}`;
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
  const result = matchNames($("names").value, dataset.people);
  if (
    !result.errors.length &&
    result.roots.length &&
    result.roots.every(
      (id) => ![...ancestry(id, people)].some((a) => people.get(a).incomplete),
    )
  ) {
    roots = result.roots;
    $("preset").value = "custom";
    draw();
    return;
  }
  if (!API_URL) {
    $("name-errors").textContent =
      result.errors.join("\n") || "Enter at least one name or ID.";
    return;
  }
  lookupController = new AbortController();
  $("build").disabled = true;
  $("lookup-cancel").hidden = false;
  $("preset").disabled = true;
  $("import").disabled = true;
  try {
    const data = await resolveLive($("names").value, dataset, {
      api: API_URL,
      signal: lookupController.signal,
      onStatus: (message) => ($("lookup-status").textContent = message),
      chooseCandidate,
    });
    setData(data);
    $("preset").value = "custom";
    draw();
    const pending = layout.nodes.filter((n) => n.person.incomplete).length;
    $("lookup-status").textContent = pending
      ? `Built your group. ${pending} records remain at the lookup limit; build again to continue.`
      : "Your genealogy is ready.";
  } catch (error) {
    $("name-errors").textContent =
      error.name === "AbortError"
        ? "Lookup cancelled. Your current graph is unchanged."
        : error.message;
    $("lookup-status").textContent = "";
  } finally {
    $("build").disabled = false;
    $("lookup-cancel").hidden = true;
    $("preset").disabled = false;
    $("import").disabled = false;
    lookupController = null;
  }
};
$("lookup-cancel").onclick = () => lookupController?.abort();
$("preset").onchange = () => {
  if ($("preset").value === "cmc") {
    setData(original);
    updateNotes();
    $("shared-only").checked = false;
    $("depth").value = "25";
    $("depth-value").textContent = "All";
    $("name-errors").textContent = "";
    draw();
  } else {
    $("people-editor").open = true;
    $("names").focus();
  }
};
$("import").onchange = async () => {
  try {
    const file = $("import").files[0];
    if (!file) return;
    if (file.size > 5000000)
      throw Error("Choose a JSON file smaller than 5 MB.");
    const data = JSON.parse(await file.text());
    setData(data);
    $("preset").value = "custom";
    $("shared-only").checked = false;
    $("depth").value = "25";
    $("depth-value").textContent = "All";
    $("name-errors").textContent = "";
    draw();
    updateNotes();
  } catch (e) {
    $("name-errors").textContent = `Import failed: ${e.message}`;
  } finally {
    $("import").value = "";
  }
};
function updateNotes() {
  const notes = $("data-notes");
  notes.replaceChildren();
  for (const text of [
    dataset.description,
    dataset.rosterNote,
    ...(dataset.warnings || []),
    `Dataset updated ${dataset.updated || "date unrecorded"}. ${dataset.people.length} sourced records.`,
    ...(Array.isArray(dataset.notes) ? dataset.notes : []),
  ].filter(Boolean)) {
    const p = document.createElement("p");
    p.textContent = text;
    notes.append(p);
  }
}
$("sources-open").onclick = () => {
  updateNotes();
  $("sources-dialog").showModal();
};
$("poster-open").onclick = () => {
  $("poster-dialog").showModal();
};
async function download(kind) {
  const button = $(kind === "pdf" ? "pdf" : "svg-export");
  button.disabled = true;
  $("export-status").textContent = "Preparing vector artwork…";
  try {
    const exporter = await import("./poster.js");
    const options = {
      title: $("poster-title").value || "A shared mathematical history",
      subtitle: `${$("preset").value === "cmc" ? "Claremont McKenna College · Mathematical Sciences" : roots.map((id) => people.get(id).name).join(" · ")} | ${layout.nodes.length} people · ${layout.edges.length} advisor relationships`,
      size: $("poster-size").value,
      sourceDate: dataset.updated,
    };
    await (kind === "pdf" ? exporter.exportPoster : exporter.exportSvg)(
      layout,
      options,
    );
    $("export-status").textContent =
      "Your poster is ready. Check your downloads.";
  } catch (e) {
    $("export-status").textContent = `Export failed: ${e.message}`;
  } finally {
    button.disabled = false;
  }
}
$("pdf").onclick = () => download("pdf");
$("svg-export").onclick = () => download("svg");
try {
  const response = await fetch("./data/genealogy.json");
  if (!response.ok)
    throw Error(`Could not load the dataset (${response.status}).`);
  original = await response.json();
  setData(original);
  draw();
  $("loading").hidden = true;
} catch (e) {
  $("loading").textContent = e.message;
}
