/**
 * Runs Lighthouse (desktop preset) against the static build served on :4173.
 * Usage: node scripts/lighthouse.mjs [paths...]   (CHROME_PATH may point at a Chromium)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const paths = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/lab/"];
mkdirSync("test-results", { recursive: true });
for (const p of paths) {
  const name = p === "/" ? "home" : p.replace(/\//g, "");
  execFileSync(
    "npx",
    [
      "lighthouse",
      `http://127.0.0.1:4173${p}`,
      "--quiet",
      "--preset=desktop",
      "--only-categories=performance,accessibility,best-practices,seo",
      "--output=json",
      `--output-path=test-results/lighthouse-${name}.json`,
      "--chrome-flags=--headless=new --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader",
    ],
    { stdio: "inherit" },
  );
  console.log(`lighthouse: ${p} done`);
}
