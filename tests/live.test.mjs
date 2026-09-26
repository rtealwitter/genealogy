import test from "node:test";
import assert from "node:assert/strict";
import { resolveLive } from "../live.js";
const seed = {
  defaultRoots: ["base"],
  people: [{ id: "base", name: "Existing", advisors: [] }],
};
test("rebuilding a bounded lookup advances through the previously incomplete frontier", async () => {
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async (url) => {
    const id = Number(new URL(url).searchParams.get("id"));
    fetched++;
    return Response.json({
      person: {
        id: `mgp-${id}`,
        name: `Person ${id}`,
        advisors: id < 5 ? [`mgp-${id + 1}`] : [],
      },
      advisorNames: { [`mgp-${id + 1}`]: `Person ${id + 1}` },
    });
  };
  try {
    const opts = {
      api: "https://test.invalid",
      signal: new AbortController().signal,
      maxDepth: 1,
    };
    let result = await resolveLive("1", seed, opts);
    assert.equal(fetched, 2);
    assert(result.people.find((p) => p.id === "mgp-3").incomplete);
    result = await resolveLive("1", result, opts);
    assert.equal(fetched, 4);
    result = await resolveLive("1", result, opts);
    assert.equal(fetched, 5);
    assert(!result.people.some((p) => p.incomplete));
  } finally {
    globalThis.fetch = realFetch;
  }
});
