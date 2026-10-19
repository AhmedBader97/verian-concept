/**
 * Ranking metrics. Same definitions as pipeline/engine.py.
 *
 * recall@k    share of relevant items found in the top k
 * precision@k share of the top k that are relevant
 * mrr         1 / rank of the first relevant item (0 if none in the ranking)
 * ndcg@k      graded relevance (2 = answers directly, 1 = useful context),
 *             gain 2^rel - 1, log2 discount, normalised by the ideal ranking
 */
export function recallAt(ranked: string[], relevant: Record<string, number>, k: number): number {
  const rel = Object.keys(relevant);
  if (!rel.length) return 0;
  const top = ranked.slice(0, k);
  return rel.filter((id) => top.includes(id)).length / rel.length;
}

export function precisionAt(ranked: string[], relevant: Record<string, number>, k: number): number {
  const top = ranked.slice(0, k);
  if (!top.length) return 0;
  return top.filter((id) => id in relevant).length / k;
}

export function reciprocalRank(ranked: string[], relevant: Record<string, number>): number {
  for (let i = 0; i < ranked.length; i++) if (ranked[i]! in relevant) return 1 / (i + 1);
  return 0;
}

export function ndcgAt(ranked: string[], relevant: Record<string, number>, k: number): number {
  const dcg = ranked.slice(0, k).reduce((sum, id, i) => sum + (2 ** (relevant[id] ?? 0) - 1) / Math.log2(i + 2), 0);
  const ideal = Object.values(relevant)
    .sort((a, b) => b - a)
    .slice(0, k)
    .reduce((sum, rel, i) => sum + (2 ** rel - 1) / Math.log2(i + 2), 0);
  return ideal > 0 ? dcg / ideal : 0;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}
