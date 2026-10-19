import { mkdirSync, writeFileSync } from "node:fs";
import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Counts every axe violation (all impact levels) across the site, for the concept page's receipts. */
test("accessibility summary", async ({ page, browserName }, info) => {
  test.skip(info.project.name !== "desktop", "one summary is enough");
  const pages = ["/", "/expertise/", "/expertise/evidence/", "/insights/", "/lab/", "/about/", "/careers/", "/concept/"];
  let violations = 0;
  const details: string[] = [];
  for (const path of pages) {
    await page.goto(path);
    await page.waitForTimeout(500);
    const r = await new AxeBuilder({ page: page as never }).analyze();
    violations += r.violations.reduce((s, v) => s + v.nodes.length, 0);
    for (const v of r.violations) details.push(`${path} ${v.id} (${v.impact}): ${v.nodes.length}`);
  }
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/axe.json", JSON.stringify({ violations, pages: pages.length, details, browserName }, null, 2));
});
