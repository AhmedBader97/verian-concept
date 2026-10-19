/**
 * Runs every retrieval strategy over the gold questions and reports quality,
 * speed and cost. Quality numbers are deterministic; timings are measured
 * live wherever this runs (in the browser on the AI Lab page).
 */
import { Corpus } from "../corpus";
import { retrieve } from "../retrieve";
import { estimateTokens } from "../text";
import type { GoldQuery, StrategyId } from "../types";
import { mean, ndcgAt, percentile, precisionAt, recallAt, reciprocalRank } from "./metrics";

export const K = 5;

export interface QueryRow {
  id: string;
  query: string;
  ranked: string[];
  recall: number;
  precision: number;
  rr: number;
  ndcg: number;
  ms: number;
  calls: number;
}

export interface StrategySummary {
  strategy: StrategyId;
  recall: number;
  precision: number;
  mrr: number;
  ndcg: number;
  p50ms: number;
  p95ms: number;
  calls: number;
  /** Tokens a model would read if the top-k sources were passed to it as context. */
  contextTokens: number;
  rows: QueryRow[];
}

export function runStrategy(
  corpus: Corpus,
  gold: GoldQuery[],
  strategy: StrategyId,
  now: () => number = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
): StrategySummary {
  const rows: QueryRow[] = gold.map((g) => {
    const t0 = now();
    const res = retrieve(corpus, strategy, g.query, { k: 10 });
    const ms = now() - t0;
    const ranked = res.hits.map((h) => h.id);
    return {
      id: g.id,
      query: g.query,
      ranked,
      recall: recallAt(ranked, g.relevant, K),
      precision: precisionAt(ranked, g.relevant, K),
      rr: reciprocalRank(ranked, g.relevant),
      ndcg: ndcgAt(ranked, g.relevant, 10),
      ms,
      calls: res.calls,
    };
  });
  const tokensFor = (ids: string[]) =>
    ids.slice(0, K).reduce((s, id) => {
      const it = corpus.byId.get(id)!;
      return s + estimateTokens(`${it.title}\n${it.kind} ${it.date} ${it.country}\n${it.summary}\n${it.url}`);
    }, 0);
  return {
    strategy,
    recall: mean(rows.map((r) => r.recall)),
    precision: mean(rows.map((r) => r.precision)),
    mrr: mean(rows.map((r) => r.rr)),
    ndcg: mean(rows.map((r) => r.ndcg)),
    p50ms: percentile(rows.map((r) => r.ms), 50),
    p95ms: percentile(rows.map((r) => r.ms), 95),
    calls: mean(rows.map((r) => r.calls)),
    contextTokens: Math.round(mean(rows.map((r) => tokensFor(r.ranked)))),
    rows,
  };
}

export const ALL_STRATEGIES: StrategyId[] = ["keyword", "bm25", "graph", "hybrid", "agentic"];

export function runAll(corpus: Corpus, gold: GoldQuery[], strategies: StrategyId[] = ALL_STRATEGIES) {
  return strategies.map((s) => runStrategy(corpus, gold, s));
}

/**
 * "Use the simplest approach that meets the bar": pick the cheapest strategy
 * whose nDCG is within `tolerance` of the best one.
 */
export function recommend(summaries: StrategySummary[], tolerance = 0.02): StrategySummary | undefined {
  const best = Math.max(...summaries.map((s) => s.ndcg));
  const order: StrategyId[] = ["keyword", "bm25", "graph", "hybrid", "agentic"];
  return order.map((id) => summaries.find((s) => s.strategy === id)).find((s) => s && s.ndcg >= best - tolerance);
}
