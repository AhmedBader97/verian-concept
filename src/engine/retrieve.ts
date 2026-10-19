/**
 * Retrieval strategies, from simplest to most elaborate:
 *
 *   keyword  – counts query words found in title + summary (the baseline to beat)
 *   bm25     – classic lexical ranking with field boosts (plain RAG retrieval)
 *   graph    – links topics/countries in the query, then spreads relevance over
 *              the knowledge graph with personalised PageRank (GraphRAG-style)
 *   hybrid   – reciprocal-rank fusion of bm25 and graph
 *   agentic  – a multi-step loop: fix spelling, split comparisons, retry weak
 *              searches with synonyms, fuse, then drop unsupported hits
 *
 * Every strategy is deterministic. Ties break by date (newest first), then id.
 */
import { Corpus, topicTags } from "./corpus";
import { editDistance, tokenize, words } from "./text";
import type { Filters, Hit, Item, LinkedEntity, RetrievalResult, StrategyId } from "./types";

export const RRF_K = 60;
export const GRAPH_LEXICAL_WEIGHT = 0.3;
/** Agentic loop retries a sub-query when its best BM25 score is below this. */
export const WEAK_SCORE = 2.0;

export interface RetrieveOptions {
  k?: number;
  filters?: Filters;
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function byScore(corpus: Corpus) {
  return (a: Hit, b: Hit) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = corpus.byId.get(a.id)!.date;
    const db = corpus.byId.get(b.id)!.date;
    if (da !== db) return da < db ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

export function passesFilters(item: Item, f?: Filters): boolean {
  if (!f) return true;
  if (f.kinds?.length && !f.kinds.includes(item.kind)) return false;
  if (f.countries?.length && !f.countries.includes(item.country)) return false;
  if (f.topics?.length && !f.topics.some((t) => item.topics.includes(t))) return false;
  if (f.since && item.date < f.since) return false;
  return true;
}

function finish(
  corpus: Corpus,
  strategy: StrategyId,
  query: string,
  hits: Hit[],
  opts: RetrieveOptions,
  extra: Partial<RetrievalResult> = {},
): RetrievalResult {
  const k = opts.k ?? 10;
  const filtered = hits.filter((h) => h.score > 0 && passesFilters(corpus.byId.get(h.id)!, opts.filters));
  filtered.sort(byScore(corpus));
  return {
    strategy,
    query,
    hits: filtered.slice(0, k),
    entities: extra.entities ?? [],
    calls: extra.calls ?? 1,
    rewrites: extra.rewrites ?? [],
  };
}

/* ---------------------------------------------------------------- keyword */

export function keywordSearch(corpus: Corpus, query: string, opts: RetrieveOptions = {}): RetrievalResult {
  const terms = uniq(tokenize(query));
  const hits: Hit[] = corpus.items.map((item, i) => {
    const matched = terms.filter((t) => corpus.plainTokens[i]!.has(t));
    return { id: item.id, score: matched.length, why: matched.length ? [`words: ${matched.join(", ")}`] : [] };
  });
  return finish(corpus, "keyword", query, hits, opts);
}

/* ------------------------------------------------------------------- bm25 */

function bm25Hits(corpus: Corpus, query: string): Hit[] {
  const terms = uniq(tokenize(query));
  return corpus.items.map((item, i) => {
    const score = corpus.bm25(i, terms);
    const matched = terms.filter((t) => corpus.tf[i]!.has(t));
    return { id: item.id, score, why: matched.length ? [`terms: ${matched.join(", ")}`] : [] };
  });
}

export function bm25Search(corpus: Corpus, query: string, opts: RetrieveOptions = {}): RetrievalResult {
  return finish(corpus, "bm25", query, bm25Hits(corpus, query), opts);
}

/* ------------------------------------------------------------------ graph */

function graphHits(corpus: Corpus, query: string, entities: LinkedEntity[]): Hit[] {
  const lexical = bm25Hits(corpus, query);
  const maxLex = Math.max(0, ...lexical.map((h) => h.score));
  const ppr = corpus.personalisedPageRank(entities.map((e) => e.node));
  let maxPpr = 0;
  for (const item of corpus.items) maxPpr = Math.max(maxPpr, ppr.get(`item:${item.id}`) ?? 0);
  return corpus.items.map((item, i) => {
    const g = maxPpr > 0 ? (ppr.get(`item:${item.id}`) ?? 0) / maxPpr : 0;
    const l = maxLex > 0 ? lexical[i]!.score / maxLex : 0;
    const why: string[] = [];
    const direct = entities.filter((e) => {
      const [type, label] = splitNode(e.node);
      return type === "topic" ? topicTags(item).includes(label) : item.country === label;
    });
    if (direct.length) why.push(`linked: ${direct.map((e) => e.label).join(", ")}`);
    else if (g > 0) why.push("related through the topic graph");
    why.push(...lexical[i]!.why);
    return { id: item.id, score: g + GRAPH_LEXICAL_WEIGHT * l, why };
  });
}

export function splitNode(node: string): [string, string] {
  const idx = node.indexOf(":");
  return [node.slice(0, idx), node.slice(idx + 1)];
}

export function graphSearch(corpus: Corpus, query: string, opts: RetrieveOptions = {}): RetrievalResult {
  const entities = corpus.linkEntities(query);
  if (!entities.length) {
    const res = bm25Search(corpus, query, opts);
    return { ...res, strategy: "graph", rewrites: ["no topic or country found, so fell back to BM25"] };
  }
  return finish(corpus, "graph", query, graphHits(corpus, query, entities), opts, { entities });
}

/* ----------------------------------------------------------------- hybrid */

/** Reciprocal-rank fusion over full rankings (score > 0 only). */
export function fuse(corpus: Corpus, rankings: Hit[][]): Hit[] {
  const scores = new Map<string, number>();
  const why = new Map<string, string[]>();
  for (const ranking of rankings) {
    const sorted = ranking.filter((h) => h.score > 0).sort(byScore(corpus));
    sorted.forEach((h, rank) => {
      scores.set(h.id, (scores.get(h.id) ?? 0) + 1 / (RRF_K + rank + 1));
      why.set(h.id, uniq([...(why.get(h.id) ?? []), ...h.why]));
    });
  }
  return [...scores.entries()].map(([id, score]) => ({ id, score, why: why.get(id) ?? [] }));
}

export function hybridSearch(corpus: Corpus, query: string, opts: RetrieveOptions = {}): RetrievalResult {
  const entities = corpus.linkEntities(query);
  const lexical = bm25Hits(corpus, query);
  const lists = entities.length ? [lexical, graphHits(corpus, query, entities)] : [lexical];
  return finish(corpus, "hybrid", query, fuse(corpus, lists), opts, { entities });
}

/* ---------------------------------------------------------------- agentic */

/**
 * Replace an unknown long word (8+ letters) with a library word one edit away.
 * Deliberately conservative: the unanswerable probes in the evaluation showed
 * that looser rules "correct" real words the library doesn't use (wealth to
 * health, boiling to building). Ties prefer the more common stem, then the
 * word list's order, so the result is deterministic.
 */
export const SPELL_MIN_LENGTH = 8;
export const SPELL_MAX_EDITS = 1;

export function correctSpelling(corpus: Corpus, query: string): { query: string; fixes: string[] } {
  const fixes: string[] = [];
  const out = words(query).map((w) => {
    const t = tokenize(w)[0];
    if (!t || w.length < SPELL_MIN_LENGTH || corpus.hasTerm(t)) return w;
    let best: string | null = null;
    let bestD = SPELL_MAX_EDITS + 1;
    let bestDf = -1;
    for (const v of corpus.surface) {
      if (Math.abs(v.length - w.length) > SPELL_MAX_EDITS) continue;
      const d = editDistance(w, v, SPELL_MAX_EDITS);
      if (d > SPELL_MAX_EDITS) continue;
      const vt = tokenize(v)[0];
      if (!vt) continue;
      const df = corpus.df.get(vt) ?? 0;
      if (d < bestD || (d === bestD && df > bestDf)) {
        best = v;
        bestD = d;
        bestDf = df;
      }
    }
    if (best) {
      fixes.push(`${w} → ${best}`);
      return best;
    }
    return w;
  });
  return { query: out.join(" "), fixes };
}

const SPLITTERS = [" versus ", " vs ", " compared with ", " compared to ", " and "];

/** Split "A vs B" / "compare A and B" into two sub-questions. Otherwise one. */
export function decompose(query: string): string[] {
  const lower = ` ${query.toLowerCase().replace(/[?.!]/g, " ").replace(/\s+/g, " ").trim()} `;
  const isCompare = /\b(compare|comparing|versus|vs|difference|differences)\b/.test(lower);
  if (!isCompare) return [query];
  const body = lower.replace(/\b(compare|comparing|the difference between|differences between|difference between)\b/g, " ");
  for (const s of SPLITTERS) {
    const idx = body.indexOf(s);
    if (idx > 0) {
      const a = body.slice(0, idx).trim();
      const b = body.slice(idx + s.length).trim();
      if (a && b) return [a, b];
    }
  }
  return [query];
}

function synonymsFor(entities: LinkedEntity[]): string {
  return entities.map((e) => splitNode(e.node)[1]).join(" ");
}

export function agenticSearch(corpus: Corpus, query: string, opts: RetrieveOptions = {}): RetrievalResult {
  const rewrites: string[] = [];
  let calls = 0;

  const spelled = correctSpelling(corpus, query);
  if (spelled.fixes.length) rewrites.push(`spelling: ${spelled.fixes.join(", ")}`);
  const base = spelled.fixes.length ? spelled.query : query;

  const parts = decompose(base);
  if (parts.length > 1) rewrites.push(`split into: ${parts.map((p) => `“${p}”`).join(" and ")}`);

  // BM25 does the work (it scored best on the evaluation questions). The topic
  // graph is only brought in when the lexical match is weak and the question
  // names a topic or country.
  const lists: Hit[][] = [];
  const entities: LinkedEntity[] = [];
  for (const part of parts) {
    let partEntities = corpus.linkEntities(part);
    let res = bm25Search(corpus, part, { k: corpus.N });
    calls++;
    const best = Math.max(0, ...bm25Hits(corpus, part).map((h) => h.score));
    if (best < WEAK_SCORE && partEntities.length) {
      const expanded = `${part} ${synonymsFor(partEntities)}`;
      rewrites.push(`weak match for “${part}”, retried with topic names and the topic graph`);
      res = hybridSearch(corpus, expanded, { k: corpus.N });
      partEntities = res.entities;
      calls++;
    }
    for (const e of partEntities) if (!entities.some((x) => x.node === e.node)) entities.push(e);
    lists.push(res.hits);
  }

  let fused = lists.length > 1 ? fuse(corpus, lists) : lists[0] ?? [];

  // Verifier: keep only hits with lexical overlap or a direct entity link.
  const qTerms = new Set(tokenize(base));
  const before = fused.length;
  fused = fused.filter((h) => {
    const i = corpus.index.get(h.id)!;
    const item = corpus.items[i]!;
    const lexical = [...qTerms].some((t) => corpus.tf[i]!.has(t));
    const linked = entities.some((e) => {
      const [type, label] = splitNode(e.node);
      return type === "topic" ? topicTags(item).includes(label) : item.country === label;
    });
    return lexical || linked;
  });
  if (fused.length < before) rewrites.push(`verifier removed ${before - fused.length} weakly supported results`);

  return finish(corpus, "agentic", query, fused, opts, { entities, calls, rewrites });
}

/* --------------------------------------------------------------- registry */

export const STRATEGIES: Record<StrategyId, (c: Corpus, q: string, o?: RetrieveOptions) => RetrievalResult> = {
  keyword: keywordSearch,
  bm25: bm25Search,
  graph: graphSearch,
  hybrid: hybridSearch,
  agentic: agenticSearch,
};

export function retrieve(corpus: Corpus, strategy: StrategyId, query: string, opts?: RetrieveOptions) {
  return STRATEGIES[strategy](corpus, query, opts);
}
