// Fold a tall tree at a gap between generations. The graph itself is unchanged:
// an edge crossing the fold has two paths joined by matching numbered markers.
const PAD = 36, HEADER = 54, GUTTER = 88, MARKER_GAP = 34;

function spread(items) {
  const ordered = [...items].sort((a, b) => a.x - b.x || a.index - b.index);
  let previous = -Infinity;
  for (const item of ordered) {
    item.markerX = Math.max(item.x, previous + MARKER_GAP);
    previous = item.markerX;
  }
  const shift = ordered.reduce((sum, item) => sum + item.markerX - item.x, 0) / Math.max(1, ordered.length);
  for (const item of ordered) item.markerX -= shift;
}

function splitPath(points, cut) {
  const index = points.findIndex(point => point.y >= cut);
  if (index < 1) return null;
  const a = points[index - 1], b = points[index];
  const t = (cut - a.y) / (b.y - a.y);
  const crossing = { x: a.x + (b.x - a.x) * t, y: cut };
  return { x: crossing.x, upper: [...points.slice(0, index), crossing],
    lower: [crossing, ...points.slice(index)] };
}

function fold(layout, cut, crossEdges) {
  const markers = crossEdges.map(({ edge, index }) => ({ ...splitPath(edge.points, cut), index }));
  if (markers.some(marker => !marker.upper)) return null;
  spread(markers);
  const crossing = new Map(markers.map((marker, index) => [marker.index, { ...marker, label: String(index + 1) }]));
  const panels = [0, 1].map(panelIndex => {
    const nodes = layout.nodes.filter(node => Number(node.y > cut) === panelIndex);
    const ids = new Set(nodes.map(node => node.id));
    const segments = [];
    layout.edges.forEach((edge, index) => {
      const marker = crossing.get(index);
      if (marker) {
        const points = (panelIndex ? marker.lower : marker.upper).map(point => ({ ...point }));
        const endpoint = { x: marker.markerX, y: cut };
        if (panelIndex) {
          points[0] = endpoint;
          points.splice(1, 0, { x: points[1].x, y: (cut + points[1].y) / 2 });
        } else {
          points[points.length - 1] = endpoint;
          points.splice(points.length - 1, 0, { x: points.at(-2).x, y: (cut + points.at(-2).y) / 2 });
        }
        segments.push({ index, points });
      } else if (ids.has(edge.from)) segments.push({ index, points: edge.points });
    });
    const points = segments.flatMap(segment => segment.points);
    const left = Math.min(...nodes.map(node => node.x - node.width / 2), ...points.map(point => point.x)) - PAD;
    const right = Math.max(...nodes.map(node => node.x + node.width / 2), ...points.map(point => point.x)) + PAD;
    const top = Math.min(...nodes.map(node => node.y - node.height / 2), ...points.map(point => point.y));
    const bottom = Math.max(...nodes.map(node => node.y + node.height / 2), ...points.map(point => point.y));
    return { nodes, segments, left, top, width: right - left, height: bottom - top + HEADER + PAD };
  });
  const width = panels[0].width + GUTTER + panels[1].width;
  const height = Math.max(...panels.map(panel => panel.height));
  const nodes = [], edges = layout.edges.map(edge => ({ ...edge, segments: [], points: [] })), continuations = [];
  panels.forEach((panel, index) => {
    const x = index ? panels[0].width + GUTTER : 0;
    const map = point => ({ x: point.x - panel.left + x, y: point.y - panel.top + HEADER });
    nodes.push(...panel.nodes.map(node => ({ ...node, ...map(node) })));
    for (const segment of panel.segments) edges[segment.index].segments.push(segment.points.map(map));
    for (const marker of crossing.values()) continuations.push({ ...map({ x: marker.markerX, y: cut }), label: marker.label });
    panel.x = x;
  });
  return { ...layout, width, height, nodes, edges, continuations,
    panels: panels.map((panel, index) => ({ x: panel.x, y: 0, width: panel.width, height: panel.height,
      label: `${index + 1} · ${index ? 'Later' : 'Earlier'} generations` })),
    posterLayout: 'landscape', continuationCount: markers.length };
}

/** Returns a new export layout; screen geometry and graph membership stay intact. */
export function preparePosterLayout(layout, { mode = 'vertical' } = {}) {
  if (layout.posterLayout || mode !== 'landscape' || layout.nodes.length < 4 || !layout.edges.length) return layout;
  const aspect = (2592 - 144) / (1728 - 308);
  const baseline = Math.min(aspect / layout.width, 1 / layout.height);
  const byId = new Map(layout.nodes.map(node => [node.id, node]));
  const rows = [...new Set(layout.nodes.map(node => node.y))].sort((a, b) => a - b);
  const indexedEdges = layout.edges.map((edge, index) => ({ edge, index }));
  let best = null;
  for (let i = 0; i < rows.length - 1; i++) {
    const upper = layout.nodes.filter(node => node.y <= rows[i]);
    const lower = layout.nodes.filter(node => node.y > rows[i]);
    const bottom = Math.max(...upper.map(node => node.y + node.height / 2));
    const top = Math.min(...lower.map(node => node.y - node.height / 2));
    if (top - bottom < 28) continue;
    const cut = (top + bottom) / 2;
    const crossEdges = indexedEdges.filter(({ edge }) =>
      byId.get(edge.from).y < cut && byId.get(edge.to).y > cut);
    if (!crossEdges.length || crossEdges.length > 24) continue;
    const candidate = fold(layout, cut, crossEdges);
    if (!candidate) continue;
    const fit = Math.min(aspect / candidate.width, 1 / candidate.height);
    // Prefer fewer interrupted relationships when two cuts fit nearly as well.
    const score = fit / (1 + crossEdges.length * .006);
    if (fit > baseline * 1.08 && (!best || score > best.score)) best = { layout: candidate, score };
  }
  return best?.layout || layout;
}
