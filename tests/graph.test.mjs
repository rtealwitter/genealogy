import test from "node:test";
import assert from "node:assert/strict";
import {
  validateDataset,
  ancestry,
  descendants,
  subgraph,
  matchNames,
  safeUrl,
} from "../graph.js";
const persons = [
  { id: "a", name: "A", advisors: ["c", "d"] },
  { id: "b", name: "B", advisors: ["c"] },
  { id: "c", name: "C", advisors: ["e"] },
  { id: "d", name: "D", advisors: ["e"] },
  {
    id: "e",
    name: "Élie Cartan",
    aliases: ["E. Cartan"],
    mgpId: 42,
    advisors: [],
  },
];
const people = new Map(persons.map((p) => [p.id, p]));
test("shared ancestors count roots, not paths through multiple advisors", () => {
  const g = subgraph(people, ["a", "b"]);
  assert.equal(g.membership.get("e").size, 2);
  assert.equal(g.nodes.filter((p) => p.shared).length, 2);
  assert.equal(g.edges.length, 5);
});
test("generation limits follow shortest advisor paths", () => {
  assert.deepEqual([...ancestry("a", people, 1)].sort(), ["a", "c", "d"]);
  assert.equal(ancestry("a", people).size, 4);
});
test("name resolution supports accents, aliases, IDs, duplicates and reports unknowns", () => {
  assert.deepEqual(matchNames("Elie Cartan\n42\nE. Cartan", persons), {
    roots: ["e"],
    errors: [],
  });
  assert.equal(matchNames("Someone else", persons).errors.length, 1);
  assert.equal(
    matchNames("A", [...persons, { id: "other", name: "A", advisors: [] }])
      .errors.length,
    1,
  );
});
test("rejects invalid IDs, dangling edges and advisor cycles", () => {
  const data = { people: persons, defaultRoots: ["a"] };
  assert.equal(validateDataset(data), data);
  assert.throws(
    () =>
      validateDataset({
        ...data,
        people: [...persons, { id: "a", name: "Dup", advisors: [] }],
      }),
    /unique/,
  );
  assert.throws(
    () =>
      validateDataset({
        ...data,
        people: [{ id: "a", name: "A", advisors: ["missing"] }],
      }),
    /Missing advisor/,
  );
  assert.throws(
    () =>
      validateDataset({
        ...data,
        people: [
          { id: "a", name: "A", advisors: ["b"] },
          { id: "b", name: "B", advisors: ["a"] },
        ],
      }),
    /cycle/,
  );
});
test("only HTTP source URLs can become clickable", () => {
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(
    safeUrl("https://www.mathgenealogy.org/"),
    "https://www.mathgenealogy.org/",
  );
});
test("shared view preserves the connecting paths to common ancestors", () => {
  const g = subgraph(people, ["a", "b"], { sharedOnly: true });
  assert.equal(g.nodes.length, 5);
  assert.equal(g.edges.length, 5);
  const withSide = new Map([
    ...people,
    ["z", { id: "z", name: "Side", advisors: [] }],
    ["a", { ...people.get("a"), advisors: ["c", "d", "z"] }],
  ]);
  assert.equal(
    subgraph(withSide, ["a", "b"], { sharedOnly: true }).nodes.length,
    5,
  );
});
test("non-Latin names retain their identity during matching", () => {
  assert.deepEqual(
    matchNames("张三", [
      { id: "1", name: "张三", advisors: [] },
      { id: "2", name: "Someone Else", advisors: [] },
    ]),
    { roots: ["1"], errors: [] },
  );
});

test("descendant highlighting follows students without pulling in their other advisors", () => {
  assert.deepEqual([...descendants("c", people)].sort(), ["a", "b", "c"]);
  assert.deepEqual([...descendants("e", people)].sort(), ["a", "b", "c", "d", "e"]);
});
