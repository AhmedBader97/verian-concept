/**
 * Shared types for the evidence engine.
 *
 * The same algorithms are implemented in Python (pipeline/engine.py) as the
 * reference implementation; src/engine/parity.test.ts checks that both produce
 * identical rankings on the evaluation set.
 */

export type Kind = "case-study" | "insight" | "news" | "event" | "webinar" | "report";

export interface Item {
  id: string;
  kind: Kind;
  title: string;
  date: string; // ISO yyyy-mm-dd
  url: string;
  topics: string[];
  country: string; // "Global" when not tied to one country
  summary: string;
  summaryBasis?: "teaser" | "page" | "title-only";
  /** Present only on synthetic test fixtures (never on Verian content). */
  fixture?: boolean;
}

export type StrategyId = "keyword" | "bm25" | "graph" | "hybrid" | "agentic";

export interface Filters {
  kinds?: Kind[];
  countries?: string[];
  topics?: string[];
  since?: string; // ISO date, inclusive
}

export interface Hit {
  id: string;
  score: number;
  /** Human-readable reasons this item matched (terms, entities, graph paths). */
  why: string[];
}

export interface RetrievalResult {
  strategy: StrategyId;
  query: string;
  hits: Hit[];
  /** Entities (topics / countries) linked from the query, if any. */
  entities: LinkedEntity[];
  /** Number of retrieval calls made (agentic strategies make several). */
  calls: number;
  /** Query rewrites applied (spelling fixes, synonym expansion, decomposition). */
  rewrites: string[];
}

export interface LinkedEntity {
  node: string; // e.g. "topic:Youth and Family" or "country:Norway"
  label: string;
  via: string; // the query words that triggered the link
}

export interface GoldQuery {
  id: string;
  query: string;
  /** Graded relevance: 2 = directly answers, 1 = relevant context. */
  relevant: Record<string, 1 | 2>;
  note?: string;
}
