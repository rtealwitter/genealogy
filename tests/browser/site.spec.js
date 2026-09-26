import { test, expect } from "@playwright/test";
import fs from "node:fs";
test.beforeEach(async ({ page }) => {
  const data = JSON.parse(fs.readFileSync("data/genealogy.json", "utf8"));
  for (const person of data.people) delete person.incomplete;
  await page.route("**/data/genealogy.json", (route) =>
    route.fulfill({ json: data }),
  );
});
test("load, trace multiple advisors, filter, zoom, custom group, and export", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".node")).not.toHaveCount(0);
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator('.node[data-id="mgp-339304"]').dispatchEvent("click");
  await expect(page.locator("#person-card")).toContainText("Musco");
  await expect(page.locator("#person-card")).toContainText("Hellerstein");
  await expect(page.locator(".node.dim").first()).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator(".node.dim")).toHaveCount(0);
  await page.locator("#shared-only").check();
  await page.locator("#shared-only").uncheck();
  const initial = await page.locator("#zoom-level").innerText();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  expect(await page.locator("#zoom-level").innerText()).not.toEqual(initial);
  await page.locator("#people-editor summary").click();
  await page.locator("#names").fill("R. Teal Witter\nRobert Cass");
  await page.locator("#build").click();
  await expect(page.locator("#stats")).toContainText("2 people in your group");
  await page.locator("#poster-open").click();
  const pdfPromise = page.waitForEvent("download");
  await page.locator("#pdf").click();
  const pdf = await pdfPromise;
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  await pdf.saveAs("/tmp/genealogy-test.pdf");
  await expect(page.locator("#export-status")).toContainText("ready");
  const svgPromise = page.waitForEvent("download");
  await page.locator("#svg-export").click();
  const svg = await svgPromise;
  expect(svg.suggestedFilename()).toMatch(/\.svg$/);
  await svg.saveAs("/tmp/genealogy-test.svg");
  expect(errors).toEqual([]);
});
test("mobile layout and hostile or invalid imports", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.locator("#people-editor summary").click();
  await page
    .locator("#import")
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"people":[]}'),
    });
  await expect(page.locator("#name-errors")).toContainText("Import failed");
  const data = {
    title: "Custom",
    defaultRoots: ["x"],
    people: [
      {
        id: "x",
        name: "<script>alert(1)</script>",
        advisors: [],
        sources: [{ label: "Bad URL", url: "javascript:alert(1)" }],
      },
    ],
  };
  await page
    .locator("#import")
    .setInputFiles({
      name: "safe.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await expect(page.locator(".node")).toHaveCount(1);
  await page.locator(".node").dispatchEvent("click");
  await expect(page.locator("#person-card h3")).toHaveText(data.people[0].name);
  await expect(page.locator("#person-card a")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/genealogy-mobile.png", fullPage: true });
});

test("live lookup disambiguates names and joins the existing ancestry", async ({
  page,
}) => {
  await page.route(
    "https://genealogy-api.rtealwitter.workers.dev/**",
    async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === "/search")
        return route.fulfill({
          json: {
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
          },
        });
      return route.fulfill({
        json: {
          person: {
            id: "mgp-9999992",
            mgpId: 9999992,
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
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator("#people-editor summary").click();
  await page.locator("#names").fill("Test Person");
  await page.locator("#build").click();
  await page.getByRole("button", { name: /University Two/ }).click();
  await expect(page.locator("#lookup-status")).toContainText("ready");
  await expect(page.locator('.node[data-id="mgp-9999992"]')).toBeVisible();
  await expect(page.locator("#stats")).toContainText("1 people in your group");
});
test("live lookup can be cancelled without replacing the graph", async ({
  page,
}) => {
  await page.route(
    "https://genealogy-api.rtealwitter.workers.dev/**",
    (route) =>
      route.fulfill({
        status: 429,
        headers: { "Retry-After": "10" },
        json: { error: "Please wait" },
      }),
  );
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  const count = await page.locator(".node").count();
  await page.locator("#people-editor summary").click();
  await page.locator("#names").fill("Someone New");
  await page.locator("#build").click();
  await expect(page.locator("#lookup-status")).toContainText("Waiting");
  await page.locator("#lookup-cancel").click();
  await expect(page.locator("#name-errors")).toContainText("cancelled");
  await expect(page.locator(".node")).toHaveCount(count);
  await expect(page.locator("#build")).toBeEnabled();
});
test("imported IDs cannot collide with layout library object properties", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator("#people-editor summary").click();
  const data = {
    defaultRoots: ["__proto__"],
    people: [
      { id: "__proto__", name: "A Person", advisors: ["constructor"] },
      { id: "constructor", name: "Their Advisor", advisors: [] },
    ],
  };
  await page
    .locator("#import")
    .setInputFiles({
      name: "ids.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await expect(page.locator(".node")).toHaveCount(2);
  for (const transform of await page
    .locator(".node")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("transform"))))
    expect(transform).not.toMatch(/NaN|undefined/);
});
