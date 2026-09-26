// Keep horizontal movement in the empty bands between generations. Long edges
// pass vertically through gaps, so their curves never sweep through a name.
export function routeEdge(parent, child, rows, clearance = 12) {
  const bounds = rows
    .map((row) => ({
      ...row,
      top: Math.min(...row.nodes.map((n) => n.y - n.height / 2)),
      bottom: Math.max(...row.nodes.map((n) => n.y + n.height / 2)),
    }))
    .sort((a, b) => a.y - b.y);
  const start = { x: parent.x, y: parent.y + parent.height / 2 };
  const end = { x: child.x, y: child.y - child.height / 2 };
  const first = bounds.find((r) => r.y === parent.y),
    last = bounds.find((r) => r.y === child.y);
  const points = [start, { x: start.x, y: first.bottom + clearance }];
  for (const row of bounds.filter((r) => r.y > parent.y && r.y < child.y)) {
    const t = (row.y - parent.y) / (child.y - parent.y),
      ideal = start.x + (end.x - start.x) * t;
    const intervals = row.nodes.map((n) => [
      n.x - n.width / 2 - clearance,
      n.x + n.width / 2 + clearance,
    ]);
    const blocked = (x) =>
      intervals.some(([left, right]) => x > left && x < right);
    const candidates = [ideal, ...intervals.flat()].filter((x) => !blocked(x));
    const x = candidates.sort(
      (a, b) => Math.abs(a - ideal) - Math.abs(b - ideal),
    )[0];
    points.push(
      { x, y: row.top - clearance },
      { x, y: row.bottom + clearance },
    );
  }
  points.push({ x: end.x, y: last.top - clearance }, end);
  return points.filter(
    (p, i) => !i || p.x !== points[i - 1].x || p.y !== points[i - 1].y,
  );
}
