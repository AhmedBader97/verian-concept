import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = ["/", "/expertise/", "/expertise/evidence/", "/insights/", "/lab/", "/about/", "/careers/", "/concept/"];

async function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/_vercel\/insights|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

test.describe("every page", () => {
  for (const path of PAGES) {
    test(`${path} renders without errors and has one h1`, async ({ page }) => {
      const errors = await collectErrors(page);
      await page.goto(path);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.getByRole("contentinfo")).toContainText("unofficial redesign concept");
      expect(errors).toEqual([]);
    });

    test(`${path} has no serious accessibility violations`, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(400);
      const results = await new AxeBuilder({ page: page as never }).disableRules(["color-contrast"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });

    test(`${path} does not scroll sideways`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test("colour contrast passes on text-heavy pages", async ({ page }) => {
  for (const path of ["/concept/", "/careers/", "/about/"]) {
    await page.goto(path);
    await page.waitForTimeout(400);
    const results = await new AxeBuilder({ page: page as never }).withRules(["color-contrast"]).analyze();
    expect(results.violations.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }
});

test("home: the field starts, and the story and map respond to scrolling", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-mode]").first()).toHaveAttribute("data-mode", /webgl|fallback/, { timeout: 10_000 });
  await page.locator('[data-step="2"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-step="2"]')).toHaveAttribute("data-active", "true", { timeout: 5000 });
  await page.locator("#world").scrollIntoViewIfNeeded();
  const europe = page.getByRole("button", { name: "Europe", exact: true });
  await europe.click();
  await expect(europe).toHaveAttribute("aria-pressed", "true");
});

test("ask the library: answers with citations, declines what it cannot answer", async ({ page }) => {
  await page.goto("/insights/");
  const box = page.getByLabel("Ask about Verian’s published work");
  await box.fill("young people and crises");
  await expect(page.getByText(/Answer drawn from \d+ sources?/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Sources" }).locator("li").first()).toBeVisible();
  await box.fill("boiling point of mercury");
  await expect(page.getByText("No answer: the library doesn't cover this closely enough.")).toBeVisible();
});

test("AI Lab: refuses the web, holds sending for approval, and passes its checks", async ({ page }) => {
  await page.goto("/lab/");
  await page.getByRole("radio", { name: "Instant" }).click();
  await page.getByRole("button", { name: "Asks for the web" }).click();
  await expect(page.getByText(/web_fetch: refused/)).toBeVisible();
  await page.getByRole("button", { name: "Asks to email a client" }).click();
  await expect(page.getByText(/send_to_client: held for approval/)).toBeVisible();
  await expect(page.getByText(/\[email removed\]/).first()).toBeVisible();

  await page.getByRole("button", { name: /Run \d+ checks/ }).click();
  await expect(page.getByText(/(\d+) of \1 passed/)).toBeVisible();
});

test("AI Lab: the evaluation runs and matches the Python reference", async ({ page }) => {
  await page.goto("/lab/");
  await page.getByRole("button", { name: /Run the evaluation/ }).click();
  await expect(page.locator("table").first().locator("tbody tr")).toHaveCount(5);
  await expect(page.getByText(/(\d+) of \1 rankings in your browser match the Python reference/)).toBeVisible();
});

test("AI Lab: reviewer feedback becomes visible memory", async ({ page }) => {
  await page.goto("/lab/");
  await page.getByRole("radio", { name: "Instant" }).click();
  await page.getByRole("button", { name: "Run agent" }).click();
  await page.getByLabel("Request changes").fill("only case studies please");
  await page.getByRole("button", { name: "Send back" }).click();
  await expect(page.getByRole("button", { name: "Forget: Only case studies" })).toBeVisible();
});

test("the concept label is on every page but the concept page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Unofficial concept/ })).toBeVisible();
  await page.goto("/concept/");
  await expect(page.getByRole("link", { name: /Unofficial concept/ })).toHaveCount(0);
});

test("mobile menu opens and closes", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto("/");
  const button = page.getByRole("button", { name: "Menu" });
  await button.click();
  await expect(page.getByRole("navigation", { name: "Main, mobile" }).getByRole("link", { name: "AI Lab" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
});

test.describe("reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });
  test("headline and story are visible without animation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.locator('[data-step="1"]').scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { name: "Measure" })).toBeVisible();
  });
});
