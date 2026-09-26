import { test, expect } from "@playwright/test";
import fs from "node:fs";
test.beforeEach(async ({ page }) => {
  const data = JSON.parse(fs.readFileSync("data/genealogy.json", "utf8"));
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
    .locator(".node .name")
    .first()
    .evaluate(
      (e) => parseFloat(getComputedStyle(e).fontSize) * e.getScreenCTM().a,
    );
  expect(textSize).toBeGreaterThan(18);
  const chip = page.locator('.name-chip[data-id="mgp-339304"]');
  await chip.click();
  await expect(page.locator("#person-card")).toContainText("Musco");
  await expect(page.locator("#person-card")).toContainText("Hellerstein");
  expect(await page.locator(".node").count()).toBeLessThan(all);
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
  const graph = await page.locator("#graph").boundingBox();
  await page.mouse.click(graph.x + 30, graph.y + 40);
  await expect(page.locator(".node")).toHaveCount(all);
  await expect(page.locator("#person-card")).toBeHidden();
  await chip.click();
  await page.waitForTimeout(450);
  await page.mouse.move(graph.x + 30, graph.y + 40);
  await page.mouse.down();
  await page.mouse.move(graph.x + 90, graph.y + 80, { steps: 5 });
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
  await page.locator("#pdf").click();
  const pdf = await pdfPromise;
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  await pdf.saveAs("/tmp/genealogy-test.pdf");
  await expect(page.locator("#export-status")).toHaveText("Ready.");
  const svgPromise = page.waitForEvent("download");
  await page.locator("#svg-export").click();
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
