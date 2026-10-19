/**
 * Cross-language parity: the browser engine must reproduce the Python
 * reference implementation (pipeline/engine.py) exactly.
 *
 * 1. On the shared test fixtures, for a fixed list of queries, tokens, linked
 *    entities and the top-10 ranking of every strategy must match.
 * 2. On the real library, every strategy's ranking for every gold question
 *    must match src/data/eval.reference.json.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ABSTAIN_BELOW } from "./answer";
import { Corpus } from "./corpus";
import { FIXTURE_ITEMS } from "./fixtures";
import { retrieve } from "./retrieve";
import { tokenize } from "./text";
import type { GoldQuery, Item, StrategyId } from "./types";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const load = <T>(p: string): T | null => (existsSync(here(p)) ? (JSON.parse(readFileSync(here(p), "utf8")) as T) : null);

interface FixtureParity {
  queries: {
    query: string;
    tokens: string[];
    entities: string[];
    strategies: Record<StrategyId, { ids: string[]; scores: number[] }>;
  }[];
}

interface Reference {
  strategies?: { strategy: StrategyId; rows: { id: string; query: string; ranked: string[]; scores?: number[] }[] }[];
  abstention?: { threshold: number };
}

const STRATEGIES: StrategyId[] = ["keyword", "bm25", "graph", "hybrid", "agentic"];

describe("parity with the Python reference: fixtures", () => {
  const data = load<FixtureParity>("./parity.fixtures.json");
  it.skipIf(!data)("has the parity file", () => expect(data).not.toBeNull());
  if (!data) return;
  const corpus = new Corpus(FIXTURE_ITEMS);
  for (const q of data.queries) {
    it(`“${q.query}”: tokens and entities`, () => {
      expect(tokenize(q.query)).toEqual(q.tokens);
      expect(corpus.linkEntities(q.query).map((e) => e.node)).toEqual(q.entities);
    });
    for (const s of STRATEGIES) {
      it(`“${q.query}”: ${s} ranking and scores`, () => {
        const hits = retrieve(corpus, s, q.query, { k: 10 }).hits;
        expect(hits.map((h) => h.id)).toEqual(q.strategies[s].ids);
        hits.forEach((h, i) => expect(h.score).toBeCloseTo(q.strategies[s].scores[i]!, 9));
      });
    }
  }
});

describe("parity with the Python reference: library and gold questions", () => {
  const ref = load<Reference>("../data/eval.reference.json");
  const gold = load<GoldQuery[]>("../data/gold.json") ?? [];
  const library = load<Item[]>("../data/library.json") ?? [];
  const ready = !!ref?.strategies?.length && gold.length > 0;
  it.skipIf(!ready)("reference exists", () => expect(ready).toBe(true));
  if (!ready || !ref?.strategies) return;
  const corpus = new Corpus(library);
  for (const s of ref.strategies) {
    it(`${s.strategy}: identical rankings on ${s.rows.length} questions`, () => {
      const mismatches = s.rows
        .map((row) => ({ row, ours: retrieve(corpus, s.strategy, row.query, { k: 10 }).hits.map((h) => h.id) }))
        .filter(({ row, ours }) => ours.join("|") !== row.ranked.join("|"))
        .map(({ row }) => row.id);
      expect(mismatches).toEqual([]);
    });
  }
  it("the browser's refusal threshold is the calibrated one", () => {
    if (ref.abstention) expect(ABSTAIN_BELOW).toBe(ref.abstention.threshold);
  });
});
