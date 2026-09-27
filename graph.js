// Pure graph operations, shared by the interface and tests.
export function validateDataset(data) {
  if (!data || !Array.isArray(data.people) || !Array.isArray(data.defaultRoots))
    throw Error("Expected people and defaultRoots arrays.");
  if (!data.people.length || data.people.length > 5000)
    throw Error("Datasets must contain 1–5,000 people.");
  const ids = new Set();
  for (const p of data.people) {
    if (typeof p.id !== "string" || !p.id || ids.has(p.id))
      throw Error("Each person needs a unique string ID.");
    if (
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 200 ||
      !Array.isArray(p.advisors) ||
      !p.advisors.every((x) => typeof x === "string")
    )
      throw Error("Each person needs a name and an array of advisor IDs.");
    if (
      p.year != null &&
      (!Number.isInteger(p.year) || p.year < 0 || p.year > 2200)
    )
      throw Error("Degree years must be valid integers or null.");
    if (new Set(p.advisors).size !== p.advisors.length)
      throw Error("An advisor may only be listed once per person.");
    if (p.institution != null && typeof p.institution !== "string")
      throw Error("Institution must be text.");
    if (
      p.sources != null &&
      (!Array.isArray(p.sources) ||
        p.sources.some(
          (s) => !s || typeof s.url !== "string" || typeof s.label !== "string",
        ))
    )
      throw Error("Sources need a label and URL.");
    if (
      p.aliases != null &&
      (!Array.isArray(p.aliases) ||
        p.aliases.some((a) => typeof a !== "string"))
    )
      throw Error("Aliases must be text.");
    ids.add(p.id);
  }
  for (const p of data.people)
    for (const id of p.advisors)
      if (!ids.has(id)) throw Error(`Missing advisor ${id} for ${p.name}.`);
  if (!data.defaultRoots.length || data.defaultRoots.some((id) => !ids.has(id)))
    throw Error("The starting group must refer to people in the dataset.");
  if (data.defaultStudents != null && (!Array.isArray(data.defaultStudents) || data.defaultStudents.some(id => !ids.has(id))))
    throw Error("Student IDs must refer to people in the dataset.");
  const byId = new Map(data.people.map((p) => [p.id, p]));
  const visiting = new Set(),
    done = new Set();
  function visit(id) {
    if (visiting.has(id)) throw Error("The dataset contains an advisor cycle.");
    if (done.has(id)) return;
    visiting.add(id);
    for (const parent of byId.get(id).advisors) visit(parent);
    visiting.delete(id);
    done.add(id);
  }
  for (const id of ids) visit(id);
  return data;
}
export const normalize = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
export function matchNames(text, people) {
  const roots = [],
    errors = [];
  for (const line of text
    .split(/[\n;]/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    const query = normalize(line);
    const matches = people.filter((p) =>
      [
        p.id,
        p.mgpId == null ? "" : String(p.mgpId),
        p.name,
        ...(p.aliases || []),
      ].some((s) => normalize(s) === query),
    );
    if (matches.length === 1) roots.push(matches[0].id);
    else
      errors.push(
        matches.length
          ? `“${line}” matches several people; use an ID.`
          : `“${line}” isn't in this collection. Import a dataset containing this person.`,
      );
  }
  return { roots: [...new Set(roots)], errors };
}
export function ancestry(id, people, maxDepth = Infinity) {
  const seen = new Map(),
    queue = [[id, 0]];
  for (let i = 0; i < queue.length; i++) {
    const [current, depth] = queue[i];
    if (seen.has(current) || !people.has(current)) continue;
    seen.set(current, depth);
    if (depth < maxDepth)
      for (const parent of people.get(current).advisors)
        queue.push([parent, depth + 1]);
  }
  return new Set(seen.keys());
}
export function subgraph(
  people,
  roots,
  { depth = Infinity, sharedOnly = false, includeStudents = false } = {},
) {
  const membership = new Map();
  for (const root of roots)
    for (const id of ancestry(root, people, depth)) {
      if (!membership.has(id)) membership.set(id, new Set());
      membership.get(id).add(root);
    }
  const shared = new Set(
    [...membership].filter(([, groups]) => groups.size > 1).map(([id]) => id),
  );
  // Keep the paths from the group to shared ancestors, including intervening advisors.
  const visible = new Set(
    [...membership]
      .filter(
        ([id]) =>
          !sharedOnly ||
          roots.includes(id) ||
          shared.has(id) ||
          [...ancestry(id, people)].some((a) => shared.has(a)),
      )
      .map(([id]) => id),
  );
  const students = new Set();
  if (includeStudents) {
    for (const person of people.values()) {
      const advisors = person.advisors.filter(id => roots.includes(id));
      if (!advisors.length || roots.includes(person.id)) continue;
      students.add(person.id);
      visible.add(person.id);
      // Students can have co-advisors outside the selected faculty. Preserve
      // those branches without counting them as the faculty's own ancestry.
      if (!sharedOnly)
        for (const id of ancestry(person.id, people, depth + 1)) visible.add(id);
    }
  }
  const nodes = [...visible].map((id) => ({
    id,
    person: people.get(id),
    root: roots.includes(id),
    shared: (membership.get(id)?.size || 0) > 1,
    student: students.has(id),
  }));
  const edges = nodes.flatMap((n) =>
    n.person.advisors
      .filter((id) => visible.has(id))
      .map((id) => ({ from: id, to: n.id })),
  );
  return { nodes, edges, membership };
}
export function safeUrl(url) {
  try {
    const u = new URL(url);
    return ["https:", "http:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

export function descendants(id, people) {
  const children = new Map([...people.keys()].map((key) => [key, []]));
  for (const person of people.values())
    for (const advisor of person.advisors)
      children.get(advisor)?.push(person.id);
  const seen = new Set(),
    queue = [id];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (seen.has(current)) continue;
    seen.add(current);
    queue.push(...(children.get(current) || []));
  }
  return seen;
}
