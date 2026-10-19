/**
 * Typed access to Verian's library (built by pipeline/build.py from
 * pipeline/library.yaml) and a lazily built search corpus.
 */
import raw from "./library.json";
import { Corpus } from "@/engine/corpus";
import type { Item, Kind } from "@/engine/types";

export const LIBRARY: Item[] = raw as Item[];

let corpus: Corpus | null = null;
export function getCorpus(): Corpus {
  if (!corpus) corpus = new Corpus(LIBRARY);
  return corpus;
}

export const KIND_NAMES: Record<Kind, string> = {
  "case-study": "Case study",
  insight: "Insight",
  news: "News",
  event: "Event",
  webinar: "Webinar",
  report: "Report",
};

export function latest(kinds: Kind[], n: number): Item[] {
  return LIBRARY.filter((i) => kinds.includes(i.kind))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, n);
}

export function byTopic(topic: string): Item[] {
  return LIBRARY.filter((i) => i.topics.includes(topic));
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m! - 1]} ${y}`;
}
