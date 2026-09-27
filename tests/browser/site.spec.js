import { test, expect } from "@playwright/test";
import fs from "node:fs";
const bundledData = fs.readFileSync("data/genealogy.json", "utf8");
const snapshot = () => JSON.parse(bundledData);
test.beforeEach(async ({ page }) => {
  const data = snapshot();
  for (const person of data.people) delete person.incomplete;
  await page.route("**/data/genealogy.json", (route) =>
    route.fulfill({ json: data }),
  );
});
async function ready(page) {
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
}
test("minimal interface, readable names, click again and background both restore everyone", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await expect(page.locator("h1")).toHaveText("PhD Genealogy Tree");
  await expect(page.locator(".name-chip")).toHaveCount(12);
  await expect(page.locator("#person-card")).toBeHidden();
  const all = await page.locator(".node").count();
  const textSize = await page
    .locator(".node.root .name")
    .first()
    .evaluate(
      (e) => parseFloat(getComputedStyle(e).fontSize) * e.getScreenCTM().a,
    );
  expect(textSize).toBeGreaterThanOrEqual(11);
  expect(await page.locator(".node .name").evaluateAll(ns => [...new Set(ns.map(n => getComputedStyle(n).fontSize))])).toEqual(["23px"]);
  const positions = await page.locator(".node").evaluateAll(ns => ns.map(n => n.getAttribute("transform")));
  const camera = await page.locator("#viewport").getAttribute("transform");
  expect(await page.locator(".node.root").evaluateAll(ns => ns.every(n => {
    const r = n.getBoundingClientRect(), g = document.getElementById("graph").getBoundingClientRect();
    return r.left >= g.left && r.right <= g.right && r.top >= g.top && r.bottom <= g.bottom;
  }))).toBe(true);
  await page.locator("#fit").click();
  await page.waitForTimeout(450);
  expect(await page.locator(".node").evaluateAll(ns => ns.every(n => {
    const r = n.getBoundingClientRect(), g = document.getElementById("graph").getBoundingClientRect();
    return r.left >= g.left && r.right <= g.right && r.top >= g.top && r.bottom <= g.bottom;
  }))).toBe(true);
  await page.locator("#home").click();
  await page.waitForTimeout(450);
  expect(await page.locator("#viewport").getAttribute("transform")).toBe(camera);
  const rows = await page.locator(".name-chip").evaluateAll(ns => Object.values(ns.reduce((rows, n) => {
    const y = Math.round(n.getBoundingClientRect().top); rows[y] = (rows[y] || 0) + 1; return rows;
  }, {})));
  expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(1);
  const chip = page.locator('.name-chip[data-id="mgp-339304"]');
  await chip.click();
  await expect(page.locator("#person-card")).toContainText("Musco");
  await expect(page.locator("#person-card")).toContainText("Hellerstein");
  await expect(page.locator(".node")).toHaveCount(all);
  expect(await page.locator(".node.dim").count()).toBeGreaterThan(0);
  expect(await page.locator(".edge.lit").count()).toBeGreaterThan(0);
  expect(await page.locator(".node").evaluateAll(ns => ns.map(n => n.getAttribute("transform")))).toEqual(positions);
  expect(await page.locator("#viewport").getAttribute("transform")).toBe(camera);
  await chip.click();
  await expect(page.locator(".node")).toHaveCount(all);
  await expect(page.locator("#person-card")).toBeHidden();
  await chip.click();
  await page.waitForTimeout(450);
  await page.locator('.node[data-id="mgp-339304"]').click();
  await expect(page.locator(".node")).toHaveCount(all);
  await expect(page.locator("#person-card")).toBeHidden();
  await chip.click();
  await page.waitForTimeout(450);
  const blank = await page.evaluate(() => {
    const graph = document.getElementById("graph").getBoundingClientRect();
    for (let y = graph.top + 30; y < graph.bottom - 30; y += 40)
      for (let x = graph.left + 30; x < graph.right - 30; x += 40) {
        const e = document.elementFromPoint(x, y);
        if (e?.closest("#graph") && !e.closest(".node")) return {x,y};
      }
  });
  await page.mouse.click(blank.x, blank.y);
  await expect(page.locator(".node")).toHaveCount(all);
  await expect(page.locator("#person-card")).toBeHidden();
  await chip.click();
  await page.waitForTimeout(450);
  await page.mouse.move(blank.x, blank.y);
  await page.mouse.down();
  await page.mouse.move(blank.x + 60, blank.y + 40, { steps: 5 });
  await page.mouse.move(blank.x, blank.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("#person-card")).toBeVisible();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
test("edit group, filter, search, and vector export", async ({ page }) => {
  await ready(page);
  await page.locator("#edit-open").click();
  await page.locator("#names").fill("R. Teal Witter\nRobert Cass");
  await page.locator("#build").click();
  await expect(page.locator("#edit-dialog")).not.toBeVisible();
  await expect(page.locator(".name-chip")).toHaveCount(2);
  await page.locator("#options-open").click();
  await page.locator("#shared-only").check();
  await page.locator("#shared-only").uncheck();
  await page.locator("#find").fill("Musco");
  await page.locator("#search-results button").first().click();
  await expect(page.locator("#person-card")).toContainText("Musco");
  await page.locator("#home").click();
  await page.locator("#poster-open").click();
  await expect(page.locator("#poster-dimensions")).toContainText("inches");
  const pdfPromise = page.waitForEvent("download");
  await page.locator("#download").click();
  const pdf = await pdfPromise;
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  await pdf.saveAs("/tmp/genealogy-test.pdf");
  await expect(page.locator("#export-status")).toHaveText("Ready.");
  const svgPromise = page.waitForEvent("download");
  await page.locator("#poster-format").selectOption("svg");
  await page.locator("#download").click();
  const svg = await svgPromise;
  await svg.saveAs("/tmp/genealogy-test.svg");
});
test("mobile sizing and safe imported data", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await expect(page.locator(".name-chip")).toHaveCount(12);
  await page.locator("#edit-open").click();
  await page.locator("#import").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"people":[]}'),
  });
  await expect(page.locator("#name-errors")).toContainText("Import failed");
  const data = {
    defaultRoots: ["__proto__"],
    people: [
      {
        id: "__proto__",
        name: "<script>alert(1)</script>",
        advisors: ["constructor"],
        sources: [{ label: "Bad URL", url: "javascript:alert(1)" }],
      },
      { id: "constructor", name: "Their Advisor", advisors: [] },
    ],
  };
  await page.locator("#import").setInputFiles({
    name: "safe.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.locator(".node")).toHaveCount(2);
  await page.locator(".name-chip").click();
  await expect(page.locator("#person-card h2")).toHaveText(data.people[0].name);
  await expect(page.locator("#person-card a")).toHaveCount(0);
  for (const value of await page
    .locator(".node")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("transform"))))
    expect(value).not.toMatch(/NaN|undefined/);
});
test("live lookup resolves ambiguous names", async ({ page }) => {
  await page.route(
    "https://genealogy-api.rtealwitter.workers.dev/**",
    (route) => {
      const u = new URL(route.request().url());
      return route.fulfill({
        json:
          u.pathname === "/search"
            ? {
                candidates: [
                  {
                    id: "9999991",
                    name: "Test Person",
                    detail: "University One 2020",
                  },
                  {
                    id: "9999992",
                    name: "Test Person",
                    detail: "University Two 2022",
                  },
                ],
              }
            : {
                person: {
                  id: "mgp-9999992",
                  name: "Test Person",
                  year: 2022,
                  institution: "University Two",
                  advisors: ["mgp-339304"],
                  sources: [],
                },
                advisorNames: { "mgp-339304": "R. Teal Witter" },
              },
      });
    },
  );
  await ready(page);
  await page.locator("#edit-open").click();
  await page.locator("#names").fill("Test Person");
  await page.locator("#build").click();
  await page.getByRole("button", { name: /University Two/ }).click();
  await expect(page.locator("#edit-dialog")).not.toBeVisible();
  await expect(page.locator(".name-chip")).toHaveCount(1);
  await expect(page.locator(".name-chip")).toContainText("Test Person");
});
test("cancel leaves the current tree intact", async ({ page }) => {
  await page.route(
    "https://genealogy-api.rtealwitter.workers.dev/**",
    (route) =>
      route.fulfill({
        status: 429,
        headers: { "Retry-After": "10" },
        json: { error: "Please wait" },
      }),
  );
  await ready(page);
  const count = await page.locator(".node").count();
  await page.locator("#edit-open").click();
  await page.locator("#names").fill("Someone New");
  await page.locator("#build").click();
  await expect(page.locator("#lookup-status")).toContainText("Waiting");
  await page.locator("#lookup-cancel").click();
  await expect(page.locator("#name-errors")).toContainText("cancelled");
  await expect(page.locator(".node")).toHaveCount(count);
  await expect(page.locator("#build")).toBeEnabled();
});
test("Teal is teal only while selected; other selections keep CMC maroon", async ({
  page,
}) => {
  await ready(page);
  const chip = page.locator('.name-chip[data-id="mgp-339304"]');
  expect(
    await chip.evaluate((e) =>
      getComputedStyle(e).getPropertyValue("--branch").trim(),
    ),
  ).toBe("#981a31");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  expect(
    await chip.evaluate((e) =>
      getComputedStyle(e).getPropertyValue("--branch").trim(),
    ),
  ).toBe("#087f7a");
  expect(
    await page
      .locator(".node.selected")
      .evaluate((e) => getComputedStyle(e).getPropertyValue("--branch").trim()),
  ).toBe("#087f7a");
  await chip.click();
  expect(
    await chip.evaluate((e) =>
      getComputedStyle(e).getPropertyValue("--branch").trim(),
    ),
  ).toBe("#981a31");
  await page.locator('.name-chip[data-id="mgp-286215"]').click();
  expect(
    await page
      .locator(".node.selected")
      .evaluate((e) => getComputedStyle(e).getPropertyValue("--branch").trim()),
  ).toBe("#981a31");
});

test("removing names uses existing records, including unfinished ancestry, without querying MGP", async ({ page }) => {
  const data = snapshot();
  const parent = data.people.find(p => p.id === "mgp-339304").advisors[0];
  data.people.find(p => p.id === parent).incomplete = true;
  await page.route("**/data/genealogy.json", route => route.fulfill({json:data}));
  const requests = [];
  await page.route("https://genealogy-api.rtealwitter.workers.dev/**", route => {
    requests.push(route.request().url()); return route.abort();
  });
  await ready(page);
  await page.locator("#edit-open").click();
  await page.locator("#names").fill("R. Teal Witter\nRobert Cass");
  await page.locator("#build").click();
  await expect(page.locator("#edit-dialog")).not.toBeVisible();
  await expect(page.locator(".name-chip")).toHaveCount(2);
  expect(requests).toEqual([]);
});

test("dragging from a name pans without selecting text or people", async ({page}) => {
  await ready(page);
  const node = page.locator('.node[data-id="mgp-339304"] .name').first();
  const box = await node.boundingBox(), before = await page.locator('#viewport').getAttribute('transform');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 - 40, {steps:8});
  await page.mouse.up();
  expect(await page.locator('#viewport').getAttribute('transform')).not.toBe(before);
  await expect(page.locator('#person-card')).toBeHidden();
  expect(await page.evaluate(() => window.getSelection().toString())).toBe('');
});

test("phone supports a drag beginning on a name and two-finger pinch without accidental selection", async ({browser}) => {
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page = await context.newPage();
  await page.route('**/data/genealogy.json', route => route.fulfill({json:snapshot()}));
  await ready(page);
  const client = await context.newCDPSession(page);
  const touch = (type, touchPoints) => client.send('Input.dispatchTouchEvent', {type,touchPoints});
  const node = await page.locator('.node[data-id="mgp-339304"]').boundingBox();
  const point = {x:node.x + node.width/2, y:node.y + node.height/2, id:1};
  const before = await page.locator('#viewport').getAttribute('transform');
  await touch('touchStart',[point]);
  await touch('touchMove',[{...point,x:point.x+60,y:point.y-45}]);
  await touch('touchEnd',[]);
  expect(await page.locator('#viewport').getAttribute('transform')).not.toBe(before);
  await expect(page.locator('#person-card')).toBeHidden();
  await page.locator('.name-chip[data-id="mgp-339304"]').tap();
  await page.waitForTimeout(450);
  const scale = () => page.locator('#viewport').evaluate(n=>n.getCTM().a);
  const initialScale = await scale();
  expect(initialScale * 23).toBeGreaterThanOrEqual(18);
  const graph = await page.locator('#graph').boundingBox(), y=graph.y+120;
  await touch('touchStart',[{x:140,y,id:1},{x:240,y,id:2}]);
  await touch('touchMove',[{x:90,y:Math.round(y),id:1},{x:290,y:Math.round(y),id:2}]);
  await touch('touchEnd',[]);
  expect(await scale()).toBeGreaterThan(initialScale*1.8);
  await expect(page.locator('.name-chip[data-id="mgp-339304"]')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(() => window.getSelection().toString())).toBe('');
  await context.close();
});

test("students highlight with their faculty and generation slider is separate from the print default", async ({page}) => {
  await ready(page);
  const all = await page.locator('.node').count();
  const students = snapshot().people.filter(person => person.advisors.includes('mgp-17045'));
  expect(students.length).toBe(4);
  await page.locator('.name-chip[data-id="mgp-17045"]').click();
  for (const student of students)
    await expect(page.locator(`.node[data-id="${student.id}"]`)).not.toHaveClass(/dim/);
  await page.locator('#options-open').click();
  await page.locator('#include-students').uncheck();
  for (const student of students)
    await expect(page.locator(`.node[data-id="${student.id}"]`)).toHaveCount(0);
  await page.locator('#include-students').check();
  await page.locator('#options-dialog .dialog-close').click();
  await expect(page.locator('#depth')).toBeVisible();
  await page.locator('#depth').evaluate(n => { n.value='6'; n.dispatchEvent(new Event('input',{bubbles:true})); });
  await expect(page.locator('#depth-value')).toHaveText('6');
  await expect.poll(() => page.locator('.node').count()).toBeLessThan(all);
  const screenCount = await page.locator('.node').count();
  await page.locator('#poster-open').click();
  await expect(page.locator('#poster-dimensions')).toContainText('12 generations');
  await expect(page.locator('#poster-preview')).toBeVisible();
  await expect(page.locator('#poster-title')).not.toBeVisible();
  await page.locator('.print-options summary').click();
  await page.locator('#poster-depth').selectOption('all');
  await expect(page.locator('#poster-dimensions')).toContainText('All generations');
  await expect(page.locator('.node')).toHaveCount(screenCount);
});
