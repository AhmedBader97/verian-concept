/**
 * Related library items for an expertise area: by its topic tags, or, for an
 * area Verian doesn't tag (Data Solutions), by searching the library.
 */
import { Corpus } from "@/engine/corpus";
import { bm25Search } from "@/engine/retrieve";
import type { Item } from "@/engine/types";
import type { Expertise } from "./expertise";
import { LIBRARY } from "./library";

export function relatedWork(e: Expertise, n = 6): Item[] {
  if (e.relatedQuery) {
    const corpus = new Corpus(LIBRARY);
    return bm25Search(corpus, e.relatedQuery, { k: n }).hits.map((h) => corpus.byId.get(h.id)!);
  }
  return LIBRARY.filter((i) => e.topics.some((t) => i.topics.includes(t))).slice(0, n);
}
