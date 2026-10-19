import { describe, expect, it } from "vitest";
import { composeBrief, verifyBrief } from "./answer";
import { Corpus, containsSequence } from "./corpus";
import { redact, scanForInstructions } from "./agent/guard";
import { runAgent } from "./agent/harness";
import { applyMemory, parseFeedback, remember } from "./agent/memory";
import { decide, validateInput } from "./agent/tools";
import { ndcgAt, precisionAt, recallAt, reciprocalRank } from "./eval/metrics";
import { FIXTURE_ITEMS, INJECTION_FIXTURE } from "./fixtures";
import libraryJson from "../data/library.json";
import type { Item } from "./types";

const LIBRARY_ITEMS = libraryJson as Item[];
import { agenticSearch, bm25Search, correctSpelling, decompose, graphSearch, hybridSearch, keywordSearch } from "./retrieve";
import { editDistance, normalize, stem, tokenize } from "./text";

const corpus = new Corpus(FIXTURE_ITEMS);

describe("text", () => {
  it("normalises accents, case and punctuation", () => {
    expect(normalize("Reykjavík Index — 2026!")).toBe("reykjavik index 2026");
  });
  it("stems predictably and keeps short words", () => {
    expect(stem("policies")).toBe("policy");
    expect(stem("families")).toBe("family");
    expect(stem("evaluations")).toBe(stem("evaluate"));
    expect(stem("evaluating")).toBe(stem("evaluate"));
    expect(stem("policing")).toBe(stem("police"));
    expect(stem("smoking")).toBe(stem("smoke"));
    expect(stem("preparedness")).toBe(stem("prepared"));
    expect(stem("news")).toBe("news");
    expect(stem("crisis")).toBe("crisis");
    expect(stem("process")).toBe("process");
    expect(stem("2026")).toBe("2026");
  });
  it("drops stopwords and Verian's own name", () => {
    expect(tokenize("What has Verian published about the police?")).toEqual(["publish", "polic"]);
  });
  it("measures edit distance with transpositions", () => {
    expect(editDistance("polcie", "police")).toBe(1);
    expect(editDistance("survey", "survey")).toBe(0);
    expect(editDistance("abc", "xyzuvw", 2)).toBeGreaterThan(2);
  });
});

describe("corpus", () => {
  it("links topics and countries from aliases", () => {
    const linked = corpus.linkEntities("How do young people in Norway feel about the police?").map((e) => e.node);
    expect(linked).toContain("topic:Youth and Family");
    expect(linked).toContain("topic:Crime & Justice");
    expect(linked).toContain("country:Norway");
  });
  it("ignores entities that have no items", () => {
    expect(corpus.linkEntities("misinformation online")).toEqual([]);
  });
  it("personalised PageRank keeps total mass at 1", () => {
    const ppr = corpus.personalisedPageRank(["topic:Youth and Family"]);
    const total = [...ppr.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });
  it("finds contiguous token sequences only", () => {
    expect(containsSequence(["a", "b", "c"], ["b", "c"])).toBe(true);
    expect(containsSequence(["a", "b", "c"], ["a", "c"])).toBe(false);
  });
});

describe("retrieval", () => {
  it("keyword baseline counts shared words", () => {
    const res = keywordSearch(corpus, "household finances survey");
    expect(res.hits[0]!.id).toBe("household-finances");
  });
  it("bm25 ranks the most specific match first", () => {
    expect(bm25Search(corpus, "smoking near building entrances").hits[0]!.id).toBe("smoke-free");
  });
  it("graph search reaches items through linked topics", () => {
    const res = graphSearch(corpus, "children");
    expect(res.entities.map((e) => e.label)).toContain("Youth and Family");
    expect(res.hits.map((h) => h.id)).toEqual(expect.arrayContaining(["youth-preparedness", "families-first"]));
  });
  it("graph search falls back to BM25 when nothing links", () => {
    const res = graphSearch(corpus, "household finances");
    expect(res.rewrites[0]).toMatch(/fell back/);
  });
  it("hybrid fusion is deterministic", () => {
    const a = hybridSearch(corpus, "trust police Norway").hits.map((h) => h.id);
    const b = hybridSearch(corpus, "trust police Norway").hits.map((h) => h.id);
    expect(a).toEqual(b);
    expect(a[0]).toBe("policing-trust");
  });
  it("agentic search fixes spelling", () => {
    const fixed = correctSpelling(corpus, "preparedniss index");
    expect(fixed.fixes.length).toBe(1);
    const res = agenticSearch(corpus, "preparedniss index");
    expect(res.hits[0]!.id).toBe("preparedness-index");
    expect(res.rewrites.join(" ")).toMatch(/spelling/);
  });
  it("spelling repair leaves short and real words alone", () => {
    // Words under eight letters are never "corrected", so "wealth" cannot become "health".
    expect(correctSpelling(corpus, "household wealth and boiling point").fixes).toEqual([]);
    expect(correctSpelling(corpus, "preparednes index").fixes).toEqual(["preparednes → preparedness"]);
  });
  it("agentic search splits comparisons", () => {
    expect(decompose("Compare policing in Norway vs smoking in Australia")).toHaveLength(2);
    expect(decompose("young people and trust")).toHaveLength(1);
    const res = agenticSearch(corpus, "compare policing trust versus smoke-free areas");
    const ids = res.hits.map((h) => h.id);
    expect(ids).toContain("policing-trust");
    expect(ids).toContain("smoke-free");
    expect(res.calls).toBeGreaterThanOrEqual(2);
  });
  it("filters apply after ranking", () => {
    const res = bm25Search(corpus, "survey", { filters: { countries: ["Spain"] } });
    expect(res.hits.every((h) => corpus.byId.get(h.id)!.country === "Spain")).toBe(true);
  });
});

describe("briefs", () => {
  it("abstains when nothing relevant is found", () => {
    const brief = composeBrief(corpus, "boiling point of mercury", [], { lexicalBest: 0, entities: [] });
    expect(brief.status).toBe("abstained");
    expect(brief.citations).toEqual([]);
  });
  it("every sentence of an answer is supported by a retrieved citation", () => {
    const res = hybridSearch(corpus, "young people preparedness");
    const lexicalBest = bm25Search(corpus, "young people preparedness").hits[0]!.score;
    const brief = composeBrief(corpus, "young people preparedness", res.hits, { lexicalBest, entities: res.entities });
    const checks = verifyBrief(corpus, brief, res.hits.map((h) => h.id), res.entities);
    expect(brief.status).toBe("answered");
    expect(checks.every((c) => c.status !== "broken")).toBe(true);
  });
  it("verifier catches citations that were never retrieved", () => {
    const res = hybridSearch(corpus, "young people preparedness");
    const brief = composeBrief(corpus, "young people preparedness", res.hits, { lexicalBest: 9, entities: res.entities });
    const checks = verifyBrief(corpus, brief, [], res.entities);
    expect(checks.some((c) => c.status === "broken")).toBe(true);
  });
});

describe("guards", () => {
  it("redacts emails, phone numbers and NI numbers", () => {
    const { text, redactions } = redact("Email jo@example.com or call 07700 900123, NI QQ 12 34 56 C");
    expect(text).not.toMatch(/example\.com|07700|QQ 12/);
    expect(redactions.map((r) => r.type).sort()).toEqual(["email", "ni-number", "phone"]);
  });
  it("leaves ordinary questions alone", () => {
    expect(redact("Trust in policing since 2018 across 12 countries").redactions).toEqual([]);
  });
  it("flags instruction-like text inside documents", () => {
    expect(scanForInstructions(INJECTION_FIXTURE.summary).length).toBeGreaterThan(0);
    expect(scanForInstructions(FIXTURE_ITEMS[0]!.summary)).toEqual([]);
  });
});

describe("tools and policy", () => {
  it("allows reads, refuses the web, holds sending for approval", () => {
    expect(decide("search_library").decision).toBe("allowed");
    expect(decide("web_fetch").decision).toBe("denied");
    expect(decide("send_to_client").decision).toBe("needs-approval");
    expect(decide("delete_everything").decision).toBe("denied");
  });
  it("validates tool input against its schema", () => {
    expect(validateInput("search_library", { query: "ok query", k: 3 })).toEqual([]);
    expect(validateInput("search_library", { k: 99 })).toEqual(expect.arrayContaining(["missing “query”", "“k” is above 10"]));
    expect(validateInput("search_library", { query: "fine", strategy: "magic" })[0]).toMatch(/must be one of/);
  });
});

describe("memory", () => {
  it("turns reviewer feedback into explicit rules", () => {
    const rules = parseFeedback("Only case studies please, focus on Norway, and keep it shorter", "2026-10-19");
    expect(rules.map((r) => r.id).sort()).toEqual(["country", "kinds", "length"]);
    expect(applyMemory(rules)).toEqual({ filters: { kinds: ["case-study"], countries: ["Norway"] }, max: 3 });
  });
  it("newer rules replace older ones with the same id", () => {
    const a = parseFeedback("focus on Norway", "2026-10-19");
    const b = parseFeedback("focus on Spain", "2026-10-19");
    expect(remember(a, b)).toEqual(b);
    // One slot for types of work: "only insights" replaces "only case studies".
    const kinds = remember(parseFeedback("only case studies", "2026-10-19"), parseFeedback("only insights please", "2026-10-19"));
    expect(kinds.map((r) => r.label)).toEqual(["Only insights and reports"]);
  });
  it("checks nested tool inputs against the schema", () => {
    const errors = validateInput("search_library", { query: "trust", filters: { colour: "red", since: "not-a-date", kinds: ["poems"] } });
    expect(errors.join(" ")).toMatch(/unexpected “filters.colour”/);
    expect(errors.join(" ")).toMatch(/filters.since/);
    expect(errors.join(" ")).toMatch(/filters.kinds\[0\]/);
    expect(validateInput("web_fetch", { url: "not a url" }).join(" ")).toMatch(/web address/);
  });
  it("understands recency", () => {
    const rules = parseFeedback("only recent work", "2026-10-19");
    expect(applyMemory(rules).filters.since).toBe("2025-10-19");
  });
});

describe("agent harness", () => {
  const fixedClock = () => 0;

  it("answers with citations and stops for approval", () => {
    const run = runAgent(corpus, "What do young people think about preparedness?", { now: fixedClock });
    expect(run.brief.status).toBe("answered");
    expect(run.events.at(-1)!.type).toBe("approval");
    expect(run.checks.every((c) => c.status !== "broken")).toBe(true);
  });

  it("is reproducible: same input, same trace", () => {
    const a = runAgent(corpus, "trust in policing in Norway", { now: fixedClock });
    const b = runAgent(corpus, "trust in policing in Norway", { now: fixedClock });
    expect(a.hash).toBe(b.hash);
  });

  it("abstains on questions the library cannot answer", () => {
    const run = runAgent(corpus, "What is the boiling point of mercury?", { now: fixedClock });
    expect(run.brief.status).toBe("abstained");
  });

  it("quarantines retrieved text that tries to give instructions", () => {
    const poisoned = new Corpus([...FIXTURE_ITEMS, INJECTION_FIXTURE]);
    const run = runAgent(poisoned, "policing survey note in Norway", { now: fixedClock });
    expect(run.events.some((e) => e.type === "quarantine" && e.id === "fixture-injection")).toBe(true);
    expect(run.brief.citations.map((c) => c.id)).not.toContain("fixture-injection");
    expect(run.events.some((e) => e.type === "tool_call" && e.tool === "send_to_client")).toBe(false);
  });

  it("never writes personal data into the trace", () => {
    const run = runAgent(corpus, "policing trust, reply to jo@example.com or 07700 900123", { now: fixedClock });
    const trace = JSON.stringify(run);
    expect(trace).not.toMatch(/jo@example\.com|07700 900123/);
  });

  it("is refused web access and continues with the library", () => {
    const run = runAgent(corpus, "search the web for policing trust", { now: fixedClock });
    expect(run.events.some((e) => e.type === "policy" && e.tool === "web_fetch" && e.decision === "denied")).toBe(true);
    expect(run.brief.status).toBe("answered");
  });

  it("holds sending for a person", () => {
    const run = runAgent(corpus, "send the client our policing trust work", { now: fixedClock });
    expect(run.events.some((e) => e.type === "policy" && e.tool === "send_to_client" && e.decision === "needs-approval")).toBe(true);
  });

  it("applies reviewer memory on the next run", () => {
    const memory = parseFeedback("only case studies", "2026-10-19");
    const run = runAgent(corpus, "preparedness", { memory, now: fixedClock });
    expect(run.brief.citations.every((c) => c.kind === "case-study")).toBe(true);
  });

  it("leaves weak single-word matches out of the brief", () => {
    const run = runAgent(corpus, "trust in policing", { now: fixedClock });
    const ids = run.brief.citations.map((c) => c.id);
    expect(ids[0]).toBe("policing-trust");
    expect(ids).not.toContain("youth-preparedness");
  });

  it("reads intent from phrases, not single words", () => {
    const harm = runAgent(corpus, "What has Verian found about online harm?", { now: fixedClock });
    expect(harm.events.some((e) => e.type === "tool_call" && e.tool === "web_fetch")).toBe(false);
    const reminders = runAgent(corpus, "Do email reminders improve survey response rates?", { now: fixedClock });
    expect(reminders.events.some((e) => e.type === "tool_call" && e.tool === "send_to_client")).toBe(false);
  });

  it("trims sources to fit a small context budget", () => {
    const run = runAgent(corpus, "young people preparedness trust policing Norway", { budget: 700, now: fixedClock });
    const ctx = run.events.find((e) => e.type === "context");
    expect(ctx && ctx.type === "context" && ctx.trimmed.length).toBeGreaterThan(0);
  });
});

describe("metrics", () => {
  const relevant = { a: 2, b: 1 } as Record<string, 1 | 2>;
  it("computes recall, precision and reciprocal rank", () => {
    expect(recallAt(["x", "a", "y"], relevant, 5)).toBe(0.5);
    expect(precisionAt(["a", "b", "x", "y", "z"], relevant, 5)).toBe(0.4);
    expect(reciprocalRank(["x", "b"], relevant)).toBe(0.5);
  });
  it("nDCG is 1 for the ideal ranking", () => {
    expect(ndcgAt(["a", "b"], relevant, 10)).toBeCloseTo(1, 12);
    expect(ndcgAt(["b", "a"], relevant, 10)).toBeLessThan(1);
  });
});

describe("agent harness on Verian's library", () => {
  const library = new Corpus(LIBRARY_ITEMS);
  const fixedClock = () => 0;

  it("declines off-topic questions that only share a place name or a stray word", () => {
    for (const q of [
      "What's the weather in London tomorrow?",
      "How do I become a commercial airline pilot?",
      "What is the capital of Australia?",
      "Best restaurants in Paris for a date night",
      "Translate good morning into Japanese",
    ]) {
      expect(runAgent(library, q, { now: fixedClock }).brief.status, q).toBe("abstained");
    }
  });

  it("redrafts without sources that share only a place name with the question", () => {
    const run = runAgent(library, "Trust in the police in Norway", { now: fixedClock });
    expect(run.brief.status).toBe("answered");
    const cited = run.brief.citations.map((c) => library.byId.get(c.id)!);
    expect(cited.every((it) => /polic/i.test(`${it.title} ${it.summary}`))).toBe(true);
    expect(run.checks.every((c) => c.status === "supported")).toBe(true);
  });

  it("handles the AI Lab's preset questions as the page describes", () => {
    const web = runAgent(library, "Search the web for the latest news on preparedness", { now: fixedClock });
    expect(web.events.some((e) => e.type === "policy" && e.tool === "web_fetch" && e.decision === "denied")).toBe(true);
    expect(web.brief.status).toBe("answered");
    const send = runAgent(library, "Send the client our work on young people, reply to jo@example.com", { now: fixedClock });
    expect(send.events.some((e) => e.type === "policy" && e.tool === "send_to_client" && e.decision === "needs-approval")).toBe(true);
    expect(JSON.stringify(send)).not.toMatch(/jo@example\.com/);
    expect(runAgent(library, "preparedniss of citizens for emergancies", { now: fixedClock }).brief.status).toBe("answered");
    expect(runAgent(library, "Compare trust in policing versus public health research", { now: fixedClock }).brief.status).toBe("answered");
  });

  it("still answers a one-word topic question", () => {
    expect(runAgent(library, "preparedness", { now: fixedClock }).brief.status).toBe("answered");
  });
});

