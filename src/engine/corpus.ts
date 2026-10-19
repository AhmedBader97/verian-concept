/**
 * The indexed library: BM25 statistics, a typed knowledge graph and an entity
 * linker, built once from the list of items.
 */
import aliasData from "./lexicon/aliases.json";
import { tokenize, words } from "./text";
import type { Item, LinkedEntity } from "./types";

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

/** Field boosts are applied by repeating tokens, which keeps BM25 itself textbook. */
export const FIELD_BOOST = { title: 2, topics: 2, summary: 1, country: 1, kind: 1 } as const;

const FORMAT_TAGS = new Set<string>(aliasData.formatTags);

export const KIND_LABEL: Record<Item["kind"], string> = {
  "case-study": "case study",
  insight: "insight",
  news: "news",
  event: "event",
  webinar: "webinar",
  report: "report",
};

export function topicTags(item: Item): string[] {
  return item.topics.filter((t) => !FORMAT_TAGS.has(t));
}

export function documentTokens(item: Item): string[] {
  const out: string[] = [];
  const add = (text: string, times: number) => {
    const toks = tokenize(text);
    for (let i = 0; i < times; i++) out.push(...toks);
  };
  add(item.title, FIELD_BOOST.title);
  for (const t of topicTags(item)) add(t, FIELD_BOOST.topics);
  add(item.summary, FIELD_BOOST.summary);
  if (item.country !== "Global") add(item.country, FIELD_BOOST.country);
  add(KIND_LABEL[item.kind], FIELD_BOOST.kind);
  return out;
}

interface AliasEntry {
  node: string;
  label: string;
  alias: string;
  tokens: string[];
}

export class Corpus {
  readonly items: Item[];
  readonly byId: Map<string, Item>;
  /** Position of each item in `items`, by id. */
  readonly index: Map<string, number>;
  readonly N: number;
  readonly tf: Map<string, number>[];
  readonly dl: number[];
  readonly avgdl: number;
  readonly df: Map<string, number>;
  /** Unboosted title+summary token sets, for the naive keyword baseline. */
  readonly plainTokens: Set<string>[];
  /** Surface words seen in the library (normalised, unstemmed), for spelling correction. */
  readonly surface: string[];
  /** Graph: sorted node ids and sorted neighbour lists (determinism matters for parity). */
  readonly nodes: string[];
  readonly neighbours: Map<string, string[]>;
  private readonly aliases: AliasEntry[];

  constructor(items: Item[]) {
    this.items = [...items];
    this.byId = new Map(this.items.map((it) => [it.id, it]));
    this.index = new Map(this.items.map((it, i) => [it.id, i]));
    this.N = this.items.length;
    this.tf = [];
    this.dl = [];
    this.df = new Map();
    this.plainTokens = [];
    let total = 0;
    for (const item of this.items) {
      const toks = documentTokens(item);
      const counts = new Map<string, number>();
      for (const t of toks) counts.set(t, (counts.get(t) ?? 0) + 1);
      this.tf.push(counts);
      this.dl.push(toks.length);
      total += toks.length;
      for (const t of counts.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.plainTokens.push(new Set(tokenize(`${item.title} ${item.summary}`)));
    }
    this.avgdl = this.N ? total / this.N : 0;

    const seen = new Set<string>();
    for (const item of this.items) {
      for (const w of words(`${item.title} ${item.summary} ${item.topics.join(" ")} ${item.country}`)) seen.add(w);
    }
    this.surface = [...seen].sort();

    // Knowledge graph: items <-> topics, items <-> countries.
    const adj = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    };
    for (const item of this.items) {
      const node = `item:${item.id}`;
      if (!adj.has(node)) adj.set(node, new Set());
      for (const t of topicTags(item)) link(node, `topic:${t}`);
      if (item.country !== "Global") link(node, `country:${item.country}`);
    }
    this.nodes = [...adj.keys()].sort();
    this.neighbours = new Map(this.nodes.map((n) => [n, [...adj.get(n)!].sort()]));

    // Entity aliases, in a fixed order: topics then countries, as listed.
    this.aliases = [];
    for (const [label, list] of Object.entries(aliasData.topics as Record<string, string[]>)) {
      for (const alias of [label, ...list]) {
        this.aliases.push({ node: `topic:${label}`, label, alias, tokens: tokenize(alias) });
      }
    }
    for (const [label, list] of Object.entries(aliasData.countries as Record<string, string[]>)) {
      for (const alias of [label, ...list]) {
        this.aliases.push({ node: `country:${label}`, label, alias, tokens: tokenize(alias) });
      }
    }
  }

  private placeTerms: Set<string> | null = null;

  /** True for words that name a place: every token of a country's name or aliases. */
  isPlaceTerm(term: string): boolean {
    if (!this.placeTerms) {
      this.placeTerms = new Set(this.aliases.filter((a) => a.node.startsWith("country:")).flatMap((a) => a.tokens));
      for (const it of this.items) if (it.country !== "Global") for (const t of tokenize(it.country)) this.placeTerms.add(t);
    }
    return this.placeTerms.has(term);
  }

  idf(term: string): number {
    const df = this.df.get(term) ?? 0;
    return Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
  }

  /** BM25 score of one document for a list of unique query terms. */
  bm25(docIndex: number, terms: string[]): number {
    const tf = this.tf[docIndex]!;
    const dl = this.dl[docIndex]!;
    let score = 0;
    for (const t of terms) {
      const f = tf.get(t);
      if (!f) continue;
      const norm = f + BM25_K1 * (1 - BM25_B + (BM25_B * dl) / this.avgdl);
      score += this.idf(t) * ((f * (BM25_K1 + 1)) / norm);
    }
    return score;
  }

  hasTerm(term: string): boolean {
    return this.df.has(term);
  }

  vocabulary(): string[] {
    return [...this.df.keys()];
  }

  /**
   * Link topics and countries mentioned in the query. An alias matches when its
   * stemmed tokens appear contiguously in the query's stemmed tokens.
   */
  linkEntities(query: string): LinkedEntity[] {
    const q = tokenize(query);
    const found = new Map<string, LinkedEntity>();
    for (const a of this.aliases) {
      if (!a.tokens.length || found.has(a.node)) continue;
      if (!this.adjacentNode(a.node)) continue; // ignore entities absent from the library
      if (containsSequence(q, a.tokens)) {
        found.set(a.node, { node: a.node, label: a.label, via: a.alias });
      }
    }
    return [...found.values()];
  }

  private adjacentNode(node: string): boolean {
    return this.neighbours.has(node);
  }

  /**
   * Personalised PageRank from the seed nodes. Fixed iteration order (sorted
   * node ids, sorted neighbours) so Python and TypeScript agree to the bit.
   */
  personalisedPageRank(seeds: string[], alpha = 0.25, iterations = 30): Map<string, number> {
    const valid = seeds.filter((s) => this.neighbours.has(s));
    const rank = new Map<string, number>();
    if (!valid.length) return rank;
    const restart = new Map<string, number>();
    for (const s of valid) restart.set(s, 1 / valid.length);
    for (const n of this.nodes) rank.set(n, restart.get(n) ?? 0);
    for (let it = 0; it < iterations; it++) {
      const next = new Map<string, number>();
      for (const n of this.nodes) next.set(n, alpha * (restart.get(n) ?? 0));
      for (const n of this.nodes) {
        const r = rank.get(n)!;
        if (r === 0) continue;
        const nbrs = this.neighbours.get(n)!;
        if (!nbrs.length) continue;
        const share = ((1 - alpha) * r) / nbrs.length;
        for (const m of nbrs) next.set(m, next.get(m)! + share);
      }
      for (const n of this.nodes) rank.set(n, next.get(n)!);
    }
    return rank;
  }
}

export function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** Words of the query that are not stopwords, unstemmed: used for highlighting. */
export function queryWords(query: string): string[] {
  return words(query);
}
