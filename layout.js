import dagre from "./vendor/dagre.js";
import { routeEdge } from "./geometry.js";

const GAP = 28, MARGIN = 30;

// Project desired centers onto a nonoverlapping row. Pooling adjacent blocks
// avoids the one-directional drift caused by pushing every neighbor right.
function placeRow(row, desired, weights) {
  const offsets = [0], blocks = [];
  for (let i = 1; i < row.length; i++)
    offsets.push(offsets[i - 1] + (row[i - 1].width + row[i].width) / 2 + GAP);
  for (let i = 0; i < row.length; i++) {
    blocks.push({ first: i, last: i, weight: weights[i], sum: (desired[i] - offsets[i]) * weights[i] });
    while (blocks.length > 1) {
      const right = blocks.at(-1), left = blocks.at(-2);
      if (left.sum / left.weight <= right.sum / right.weight) break;
      blocks.splice(-2, 2, { first: left.first, last: right.last,
        weight: left.weight + right.weight, sum: left.sum + right.sum });
    }
  }
  for (const block of blocks)
    for (let i = block.first; i <= block.last; i++)
      row[i].x = block.sum / block.weight + offsets[i];
}

function arrange(nodes, edges) {
  const graph = new dagre.graphlib.Graph()
    .setGraph({ rankdir: "TB", ranksep: 42, nodesep: GAP, ranker: "network-simplex" })
    .setDefaultEdgeLabel(() => ({}));
  const ids = new Map(nodes.map((node, i) => [node.id, `n${i}`]));
  for (const node of nodes)
    graph.setNode(ids.get(node.id), { width: node.width, height: node.height });
  for (const edge of edges) graph.setEdge(ids.get(edge.from), ids.get(edge.to));
  dagre.layout(graph);
  const placed = nodes.map(node => ({ ...node, ...graph.node(ids.get(node.id)) }));
  const byId = new Map(placed.map(node => [node.id, node]));
  const neighbors = new Map(placed.map(node => [node.id, []]));
  for (const edge of edges) {
    neighbors.get(edge.from).push(byId.get(edge.to));
    neighbors.get(edge.to).push(byId.get(edge.from));
  }
  const rows = [...new Set(placed.map(node => node.y))].sort((a, b) => a - b)
    .map(y => ({ y, nodes: placed.filter(node => node.y === y).sort((a, b) => a.x - b.x) }));
  const compact = new Map();
  for (const row of rows) {
    const width = row.nodes.reduce((sum, node) => sum + node.width, 0) + GAP * (row.nodes.length - 1);
    let left = -width / 2;
    for (const node of row.nodes) {
      node.x = left + node.width / 2;
      compact.set(node.id, node.x);
      left += node.width + GAP;
    }
  }
  // Preserve Dagre's crossing-aware order while drawing related generations
  // together. A weak compact-position preference prevents empty horizontal spans.
  for (let pass = 0; pass < 16; pass++) {
    const sweep = pass % 2 ? [...rows].reverse() : rows;
    for (const row of sweep) {
      const weights = row.nodes.map(node => neighbors.get(node.id).length + 0.3);
      const desired = row.nodes.map((node, i) =>
        (neighbors.get(node.id).reduce((sum, other) => sum + other.x, 0) + 0.3 * compact.get(node.id)) / weights[i]);
      placeRow(row.nodes, desired, weights);
    }
  }
  const routed = edges.map(edge => ({ ...edge,
    color: edge.color || byId.get(edge.to).color,
    points: routeEdge(byId.get(edge.from), byId.get(edge.to), rows),
  }));
  const points = routed.flatMap(edge => edge.points);
  const left = Math.min(...placed.map(node => node.x - node.width / 2), ...points.map(point => point.x)) - MARGIN;
  const top = Math.min(...placed.map(node => node.y - node.height / 2)) - MARGIN;
  const width = Math.max(...placed.map(node => node.x + node.width / 2), ...points.map(point => point.x)) - left + MARGIN;
  const height = Math.max(...placed.map(node => node.y + node.height / 2)) - top + MARGIN;
  return { width, height,
    nodes: placed.map(node => ({ ...node, x: node.x - left, y: node.y - top })),
    edges: routed.map(edge => ({ ...edge, points: edge.points.map(point => ({ x: point.x - left, y: point.y - top })) })),
  };
}

export function buildLayout(graph, roots = [], aspectRatio = 1.9) {
  if (!graph.nodes.length) return { width: 300, height: 200, nodes: [], edges: [] };
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const neighbors = new Map(graph.nodes.map(node => [node.id, []]));
  for (const edge of graph.edges) {
    neighbors.get(edge.from).push(edge.to);
    neighbors.get(edge.to).push(edge.from);
  }
  const seen = new Set(), components = [];
  // Independent families need independent ranks; tying every root to a common
  // invisible sink can stretch a short family to the height of the longest one.
  for (const start of [...roots, ...byId.keys()]) {
    if (seen.has(start) || !byId.has(start)) continue;
    const ids = [start];
    seen.add(start);
    for (let i = 0; i < ids.length; i++)
      for (const id of neighbors.get(ids[i]))
        if (!seen.has(id)) { seen.add(id); ids.push(id); }
    const members = new Set(ids);
    components.push(arrange(ids.map(id => byId.get(id)), graph.edges.filter(edge => members.has(edge.from))));
  }
  if (components.length === 1) return components[0];
  components.sort((a, b) => b.height - a.height);
  aspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1.9;
  const widest = Math.max(...components.map(component => component.width));
  const ideal = Math.sqrt(components.reduce((sum, component) => sum + component.width * component.height, 0) * aspectRatio);
  const candidates = new Set([widest, ...[0.6, 0.8, 1, 1.2, 1.5, 2].map(factor => Math.max(widest, ideal * factor))]);
  let prefixWidth = -MARGIN;
  for (let i = 0; i < components.length; i++) {
    prefixWidth += components[i].width + MARGIN;
    if (i < 24 || i === components.length - 1) candidates.add(Math.max(widest, prefixWidth));
  }
  // Try a few shelf widths, including every arrangement of two components.
  // The winner makes names largest when the whole tree fits the actual screen.
  let best;
  for (const targetWidth of candidates) {
    const rows = [];
    let row = { components: [], width: 0, height: 0 };
    for (const component of components) {
      if (row.components.length && row.width + MARGIN + component.width > targetWidth + 0.01) {
        rows.push(row);
        row = { components: [], width: 0, height: 0 };
      }
      row.width += (row.components.length ? MARGIN : 0) + component.width;
      row.height = Math.max(row.height, component.height);
      row.components.push(component);
    }
    rows.push(row);
    const width = Math.max(...rows.map(row => row.width));
    const height = rows.reduce((sum, row) => sum + row.height, 0) + (rows.length - 1) * MARGIN;
    const scale = Math.min(aspectRatio / width, 1 / height);
    if (!best || scale > best.scale || (scale === best.scale && width * height < best.width * best.height))
      best = { rows, width, height, scale };
  }
  const nodes = [], edges = [];
  let y = 0;
  for (const row of best.rows) {
    let x = (best.width - row.width) / 2;
    for (const component of row.components) {
      const top = y + row.height - component.height;
      nodes.push(...component.nodes.map(node => ({ ...node, x: node.x + x, y: node.y + top })));
      edges.push(...component.edges.map(edge => ({ ...edge, points: edge.points.map(point => ({ x: point.x + x, y: point.y + top })) })));
      x += component.width + MARGIN;
    }
    y += row.height + MARGIN;
  }
  return { width: best.width, height: best.height, nodes, edges };
}
