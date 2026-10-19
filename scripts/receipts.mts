/**
 * Collects the numbers shown on the concept page ("Receipts") from real runs:
 * test suites, the evaluation, parity with Python, accessibility and Lighthouse.
 *
 * Usage: npx tsx scripts/receipts.mts   (after `npm run build`)
 * Inputs it expects (produced by `npm run check:all`):
 *   test-results/vitest.json, test-results/pytest.xml, test-results/e2e.json,
 *   test-results/axe.json, test-results/lighthouse-*.json
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { Corpus } from "../src/engine/corpus";
import { runAll, recommend } from "../src/engine/eval/run";
import { runAgent } from "../src/engine/agent/harness";
import type { GoldQuery, Item, StrategyId } from "../src/engine/types";

const DESIGNS_FOR_RECEIPTS: Record<StrategyId, string> = {
  keyword: "keyword match",
  bm25: "BM25 retrieval",
  graph: "graph retrieval",
  hybrid: "hybrid retrieval",
  agentic: "the agentic loop",
};

const read = <T>(p: string): T | null => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null);

const out: Record<string, unknown> = {};

// Unit tests (Vitest JSON reporter)
const vitest = read<{ numPassedTests: number; numFailedTests: number }>("test-results/vitest.json");
if (vitest && vitest.numFailedTests === 0) out.tsTests = vitest.numPassedTests;

// Python tests (JUnit XML): attributes of the first <testsuite> element
if (existsSync("test-results/pytest.xml")) {
  const xml = readFileSync("test-results/pytest.xml", "utf8");
  const suite = xml.match(/<testsuite\b[^>]*>/)?.[0] ?? "";
  const attr = (k: string) => Number(suite.match(new RegExp(`\\b${k}="(\\d+)"`))?.[1] ?? 0);
  if (suite && attr("failures") === 0 && attr("errors") === 0) out.pyTests = attr("tests") - attr("skipped");
}

// End-to-end tests (Playwright JSON reporter)
const e2e = read<{ stats: { expected: number; unexpected: number; flaky: number } }>("test-results/e2e.json");
if (e2e && e2e.stats.unexpected === 0) out.e2eTests = e2e.stats.expected + e2e.stats.flaky;

// Accessibility (written by tests/e2e/axe-summary.spec.ts)
const axe = read<{ violations: number; pages: number }>("test-results/axe.json");
if (axe) {
  out.axeViolations = axe.violations;
  out.pagesChecked = axe.pages;
}

// Lighthouse (best run per page; we report the home page)
const lhFiles = existsSync("test-results") ? readdirSync("test-results").filter((f) => f.startsWith("lighthouse-") && f.endsWith(".json")) : [];
const lh = lhFiles
  .map((f) => read<{ categories: Record<string, { score: number }>; finalDisplayedUrl: string }>(`test-results/${f}`))
  .filter(Boolean)
  .find((r) => /\/$|\/index/.test(new URL(r!.finalDisplayedUrl).pathname));
if (lh) {
  const s = (k: string) => Math.round((lh.categories[k]?.score ?? 0) * 100);
  out.lighthouse = { performance: s("performance"), accessibility: s("accessibility"), bestPractices: s("best-practices"), seo: s("seo"), page: "/" };
}

// Evaluation, recomputed with the browser engine, and parity with Python
const library = read<Item[]>("src/data/library.json") ?? [];
const gold = (read<GoldQuery[]>("src/data/gold.json") ?? []).filter((g) => Object.keys(g.relevant).length > 0);
const reference = read<{
  strategies?: { strategy: StrategyId; rows: { id: string; ranked: string[] }[] }[];
  abstention?: { threshold: number; correctAbstentions: number; unanswerable: number; falseAbstentions: number };
}>("src/data/eval.reference.json");
out.libraryItems = library.length;
out.goldQuestions = gold.length;
if (gold.length) {
  const corpus = new Corpus(library);
  const results = runAll(corpus, gold);
  const best = results.reduce((a, b) => (b.ndcg > a.ndcg ? b : a));
  const pick = recommend(results, 0.02)!;
  out.bestDesign = { name: DESIGNS_FOR_RECEIPTS[best.strategy], ndcg: Number(best.ndcg.toFixed(4)) };
  out.recommended = { name: DESIGNS_FOR_RECEIPTS[pick.strategy], ndcg: Number(pick.ndcg.toFixed(4)) };
  if (reference?.strategies) {
    let same = 0;
    let total = 0;
    for (const r of results) {
      const ref = reference.strategies.find((s) => s.strategy === r.strategy);
      for (const row of r.rows) {
        const rr = ref?.rows.find((x) => x.id === row.id);
        if (!rr) continue;
        total++;
        if (rr.ranked.join("|") === row.ranked.join("|")) same++;
      }
    }
    out.parity = { same, total };
  }
  if (reference?.abstention) {
    const a = reference.abstention;
    out.abstention = { threshold: a.threshold, correct: a.correctAbstentions, probes: a.unanswerable, falseAbstentions: a.falseAbstentions };
  }
  // End to end: the whole agent (threshold plus citation check) on every gold question.
  const allGold = read<GoldQuery[]>("src/data/gold.json") ?? [];
  let declined = 0;
  let falseRefusals = 0;
  for (const g of allGold) {
    const abstained = runAgent(corpus, g.query, { now: () => 0 }).brief.status === "abstained";
    if (Object.keys(g.relevant).length === 0) declined += abstained ? 1 : 0;
    else falseRefusals += abstained ? 1 : 0;
  }
  out.endToEnd = { declined, probes: allGold.length - gold.length, falseRefusals, answerable: gold.length };
}

writeFileSync("src/data/receipts.json", JSON.stringify(out, null, 2) + "\n");
console.log(out);
