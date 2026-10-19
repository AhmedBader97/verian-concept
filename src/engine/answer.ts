/**
 * Turning retrieved items into a short, cited brief — without a language model.
 *
 * Every sentence is assembled from fields of the item it cites (title, kind,
 * country, date, summary), so nothing is said that the source does not say.
 * The verifier then re-checks each sentence against its citation. When the
 * evidence is too thin, the brief abstains instead of guessing.
 */
import { Corpus, KIND_LABEL, topicTags } from "./corpus";
import { splitNode } from "./retrieve";
import { tokenize } from "./text";
import type { Hit, Item, LinkedEntity } from "./types";

/** Calibrated on the evaluation set: see pipeline/evaluate.py (abstention study). */
export const ABSTAIN_BELOW = 6.7;

/** A word in at most this share of the library is distinctive enough to tie a source to a question. */
export const DISTINCTIVE_SHARE = 0.04;

/** "High" confidence needs a best match at least twice the refusal threshold. */
export const HIGH_CONFIDENCE = 2 * ABSTAIN_BELOW;

export interface Citation {
  n: number;
  id: string;
  title: string;
  url: string;
  kind: Item["kind"];
  date: string;
  country: string;
}

export interface Sentence {
  text: string;
  cites: number[];
  /** "quote" restates one source; "synthesis" makes a claim across sources. */
  kind: "quote" | "synthesis" | "abstain";
  /** For synthesis sentences: the topics the sentence claims recur. */
  themes?: string[];
}

export interface Brief {
  question: string;
  status: "answered" | "abstained";
  confidence: "high" | "medium" | "low";
  sentences: Sentence[];
  citations: Citation[];
  themes: string[];
  note: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatMonth(iso: string): string {
  const [y, m] = iso.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

function article(kind: Item["kind"]): string {
  const label = kind === "news" ? "news story" : KIND_LABEL[kind];
  return /^[aeiou]/.test(label) ? `An ${label}` : `A ${label}`;
}

const NEEDS_THE = new Set(["United Kingdom", "United States", "Netherlands"]);

export function placeName(country: string): string {
  return NEEDS_THE.has(country) ? `the ${country}` : country;
}

export function describe(item: Item): string {
  const where = item.country !== "Global" ? ` in ${placeName(item.country)}` : "";
  return `${article(item.kind)}${where} from ${formatMonth(item.date)}`;
}

export function composeBrief(
  corpus: Corpus,
  question: string,
  hits: Hit[],
  opts: { lexicalBest: number; entities: LinkedEntity[]; max?: number },
): Brief {
  const max = opts.max ?? 4;
  const strong = hits.slice(0, max);
  // A linked topic can rescue a short question ("preparedness"); a place name alone
  // cannot ("the weather in London" links to the United Kingdom but is off-topic).
  const linkedTopic = opts.entities.some((e) => e.node.startsWith("topic:"));
  const abstain = strong.length === 0 || (opts.lexicalBest < ABSTAIN_BELOW && !linkedTopic);

  if (abstain) {
    return {
      question,
      status: "abstained",
      confidence: "low",
      sentences: [
        {
          text: "I couldn't find published Verian work that addresses this directly, so I won't guess.",
          cites: [],
          kind: "abstain",
        },
      ],
      citations: [],
      themes: [],
      note: "Try naming a topic, a country or a programme, or browse the library by topic.",
    };
  }

  const citations: Citation[] = strong.map((h, i) => {
    const it = corpus.byId.get(h.id)!;
    return { n: i + 1, id: it.id, title: it.title, url: it.url, kind: it.kind, date: it.date, country: it.country };
  });

  const sentences: Sentence[] = citations.map((c) => {
    const it = corpus.byId.get(c.id)!;
    const summary = it.summaryBasis === "title-only" ? "" : ` ${it.summary}`;
    return { text: `${describe(it)}: “${it.title}”.${summary}`, cites: [c.n], kind: "quote" as const };
  });

  // Themes: topic tags shared by at least two of the cited items ("recurring").
  const counts = new Map<string, number>();
  for (const c of citations) for (const t of topicTags(corpus.byId.get(c.id)!)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const themes = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 3)
    .map(([t]) => t);
  if (themes.length) {
    sentences.push({
      text: `Across these, the recurring ${themes.length === 1 ? "theme is" : "themes are"} ${listJoin(themes)}.`,
      cites: citations.filter((c) => topicTags(corpus.byId.get(c.id)!).some((t) => themes.includes(t))).map((c) => c.n),
      kind: "synthesis",
      themes,
    });
  }

  const confidence: Brief["confidence"] =
    opts.lexicalBest >= HIGH_CONFIDENCE && strong.length >= 3 ? "high" : opts.lexicalBest >= ABSTAIN_BELOW || linkedTopic ? "medium" : "low";

  return {
    question,
    status: "answered",
    confidence,
    sentences,
    citations,
    themes,
    note:
      confidence === "high"
        ? "Several items match closely."
        : "Matches are partial: read the sources before relying on this.",
  };
}

export function listJoin(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

export interface CitationCheck {
  sentence: number;
  status: "supported" | "weak" | "broken";
  reason: string;
}

const ALLOWED_HOSTS = ["www.veriangroup.com", "veriangroup.com"];

/**
 * Independent check of a brief: every citation must point at a retrieved item
 * on Verian's own site, every sentence must quote its cited source, and each
 * cited item must relate to the question (shared words or a linked entity).
 */
export function verifyBrief(
  corpus: Corpus,
  brief: Brief,
  retrievedIds: string[],
  entities: LinkedEntity[],
): CitationCheck[] {
  const qTerms = new Set(tokenize(brief.question));
  return brief.sentences.map((s, i) => {
    if (!s.cites.length) {
      return brief.status === "abstained"
        ? { sentence: i, status: "supported", reason: "Abstention makes no factual claim." }
        : { sentence: i, status: "broken", reason: "Claim has no citation." };
    }
    for (const n of s.cites) {
      const c = brief.citations.find((x) => x.n === n);
      if (!c) return { sentence: i, status: "broken", reason: `Citation [${n}] does not exist.` };
      if (!retrievedIds.includes(c.id)) return { sentence: i, status: "broken", reason: `[${n}] was never retrieved.` };
      let host = "";
      try {
        host = new URL(c.url).host;
      } catch {
        return { sentence: i, status: "broken", reason: `[${n}] has an invalid link.` };
      }
      if (!ALLOWED_HOSTS.includes(host)) return { sentence: i, status: "broken", reason: `[${n}] links outside veriangroup.com.` };
    }
    if (s.kind === "quote") {
      const item = corpus.byId.get(brief.citations.find((x) => x.n === s.cites[0])!.id)!;
      if (s.cites.length !== 1 || !s.text.includes(item.title)) {
        return { sentence: i, status: "broken", reason: "Sentence does not quote its source." };
      }
    }
    if (s.kind === "synthesis") {
      const cited = s.cites.map((n) => corpus.byId.get(brief.citations.find((x) => x.n === n)!.id)!);
      for (const theme of s.themes ?? []) {
        const n = cited.filter((it) => it.topics.includes(theme)).length;
        if (n < 2) return { sentence: i, status: "broken", reason: `“${theme}” is claimed to recur but appears in ${n} cited source.` };
      }
      if (cited.some((it) => !(s.themes ?? []).some((t) => it.topics.includes(t)))) {
        return { sentence: i, status: "weak", reason: "A cited source shares none of the claimed themes." };
      }
      return { sentence: i, status: "supported", reason: "Each claimed theme appears in at least two cited sources." };
    }
    // A source supports the question when it shares two of the question's words, or
    // one distinctive word (rare in the library, and not a place name), or one word
    // plus a topic the question names. A single shared word never counts when most of
    // the question's words never appear in the library: it is about something else.
    const terms = [...qTerms];
    const known = terms.filter((t) => (corpus.df.get(t) ?? 0) > 0);
    const offTopic = terms.length > 0 && known.length / terms.length < 0.5;
    const distinctive = (t: string) => (corpus.df.get(t) ?? 0) <= Math.max(3, Math.round(corpus.N * DISTINCTIVE_SHARE)) && !corpus.isPlaceTerm(t);
    const related = s.cites.every((n) => {
      const it = corpus.byId.get(brief.citations.find((x) => x.n === n)!.id)!;
      const toks = new Set(tokenize(`${it.title} ${it.summary} ${it.topics.join(" ")} ${it.country}`));
      const shared = known.filter((t) => toks.has(t));
      const topicLinked = entities.some((e) => {
        const [type, label] = splitNode(e.node);
        return type === "topic" && it.topics.includes(label);
      });
      return shared.length >= 2 || (!offTopic && shared.length === 1 && (topicLinked || distinctive(shared[0]!)));
    });
    return related
      ? { sentence: i, status: "supported", reason: "Quotes its source; the source shares the question's terms." }
      : { sentence: i, status: "weak", reason: "Source shares too little with the question." };
  });
}
