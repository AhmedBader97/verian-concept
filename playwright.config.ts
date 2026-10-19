import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the static export in out/ (npm run build first).
 * WebGL runs on SwiftShader in headless Chromium.
 */
export default defineConfig({
  testDir: "tests/e2e",
  // Keep Playwright's own artefacts in a subfolder: it empties this folder on every
  // run, and test-results/ also holds the Vitest, pytest and Lighthouse reports.
  outputDir: "test-results/playwright",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  webServer: {
    command: "npx serve out -l 4173 --no-clipboard",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
