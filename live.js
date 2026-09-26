import { matchNames, validateDataset } from "./graph.js";
const pause = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted)
      return reject(new DOMException("Cancelled", "AbortError"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
export async function resolveLive(
  text,
  dataset,
  {
    api,
    signal,
    onStatus = () => {},
    chooseCandidate,
    maxNew = 150,
    maxDepth = 30,
  },
) {
  const people = new Map(dataset.people.map((p) => [p.id, p]));
  async function request(path) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await fetch(api + path, { signal });
      if (response.status === 429) {
        const delay = Math.min(
          30,
          Math.max(1, Number(response.headers.get("Retry-After")) || 10),
        );
        onStatus(`Waiting ${delay}s between requests to Math Genealogy…`);
        await pause(delay * 1000, signal);
        continue;
      }
      if (!response.ok) {
        let message = `Lookup service returned ${response.status}.`;
        try {
          message = (await response.json()).error || message;
        } catch {}
        throw Error(message);
      }
      return response.json();
    }
    throw Error(
      "The lookup service is busy. Please try again in a few minutes.",
    );
  }
  const roots = [];
  for (const line of text
    .split(/[\n;]/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    const local = matchNames(line, [...people.values()]);
    if (local.roots.length === 1) {
      roots.push(local.roots[0]);
      continue;
    }
    const numeric =
      line.match(/^(?:mgp-)?(\d+)$/) ||
      line.match(
        /^https?:\/\/(?:www\.)?mathgenealogy\.org\/id\.php\?id=(\d+)$/,
      );
    let id;
    if (numeric) id = numeric[1];
    else {
      onStatus(`Searching Math Genealogy for ${line}…`);
      const { candidates } = await request(
        "/search?q=" + encodeURIComponent(line),
      );
      if (!candidates?.length)
        throw Error(
          `No Math Genealogy match for “${line}”. Try their full recorded name, or an MGP ID.`,
        );
      const candidate =
        candidates.length === 1
          ? candidates[0]
          : await chooseCandidate(line, candidates, signal);
      id = String(candidate.id).replace(/^mgp-/, "");
    }
    if (!/^\d+$/.test(id))
      throw Error("The lookup returned an invalid person ID.");
    roots.push("mgp-" + id);
  }
  if (!roots.length) throw Error("Enter at least one name or MGP ID.");
  const queue = [...new Set(roots)].map((id) => [id, 0]),
    seen = new Set();
  let fetched = 0;
  for (let i = 0; i < queue.length; i++) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const [id, depth] = queue[i];
    if (seen.has(id)) continue;
    seen.add(id);
    let person = people.get(id),
      fetchedHere = false;
    if (!person || person.incomplete) {
      if (fetched >= maxNew || depth > maxDepth) {
        if (!person)
          people.set(id, {
            id,
            name: `MGP ${id.slice(4)}`,
            mgpId: Number(id.slice(4)),
            year: null,
            institution: "",
            advisors: [],
            sources: [
              {
                label: "Mathematics Genealogy Project",
                url: `https://www.mathgenealogy.org/id.php?id=${id.slice(4)}`,
              },
            ],
            incomplete: true,
            note: "Live lookup limit reached. Continue this group to retrieve more ancestry.",
          });
        continue;
      }
      onStatus(
        `Tracing ${person?.name || "MGP " + id.slice(4)}… ${fetched} new records retrieved`,
      );
      const result = await request(
        "/person?id=" + encodeURIComponent(id.slice(4)),
      );
      person = result.person;
      if (!person || person.id !== id)
        throw Error("The lookup returned an unexpected record.");
      people.set(id, person);
      fetched++;
      fetchedHere = true;
      for (const parent of person.advisors)
        if (!people.has(parent))
          people.set(parent, {
            id: parent,
            mgpId: Number(parent.slice(4)),
            name: result.advisorNames?.[parent] || `MGP ${parent.slice(4)}`,
            year: null,
            institution: "",
            advisors: [],
            sources: [
              {
                label: "Mathematics Genealogy Project",
                url: `https://www.mathgenealogy.org/id.php?id=${parent.slice(4)}`,
              },
            ],
            incomplete: true,
            note: "Advisor record not yet retrieved; this connection is sourced on the student’s record.",
          });
    }
    for (const parent of person.advisors)
      queue.push([parent, depth + (fetchedHere ? 1 : 0)]);
  }
  const result = {
    ...dataset,
    title: "Your mathematical genealogy",
    description:
      "Custom advisor lineages from the Mathematics Genealogy Project and the included sourced records.",
    updated: new Date().toISOString().slice(0, 10),
    defaultRoots: [...new Set(roots)],
    people: [...people.values()],
  };
  validateDataset(result);
  return result;
}
