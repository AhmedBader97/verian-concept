# Verian, reimagined — an unofficial redesign concept

An unofficial redesign of [veriangroup.com](https://www.veriangroup.com), built by **Ahmed Bader** as part of an application for Verian's **Junior AI Engineer / Forward Deployed Engineer** role. It is not affiliated with or endorsed by Verian; every piece of Verian content links back to its original page.

**Live:** https://verian-concept.vercel.app · **About the concept:** [/concept](https://verian-concept.vercel.app/concept/)

---

## What is in it

| | |
|---|---|
| **Home** | A WebGL field of points that starts as a *ternary plot* of Verian's own positioning (data, technology, citizen insight) and reforms as you scroll: a population, twelve sample blocks, five segments, a solid triangle, then a dot-matrix world map of Verian's 23 offices (Equal Earth projection) with region zoom. |
| **Ask our library** | Ask a question of Verian's published case studies and insights. Every sentence of the answer cites its source; a verifier re-checks each citation; thin evidence means no answer. Runs entirely in the browser. |
| **Evidence map** | The library as a knowledge graph (topics, countries, pieces of work), drawn with d3-force. It is the graph that graph retrieval walks; the agent falls back to it when a keyword search comes back weak. |
| **AI Lab** | The answer to the role's brief: an agent harness with a JSON-Schema tool registry, permission policy (read allowed, web refused, sending needs approval), context budget, reviewer memory, human approval and a full execution trace; five retrieval designs evaluated side by side; live failure tests; a session monitor. |
| **Expertise, About, Careers** | Rebuilt pages with an interactive policy cycle, office directory and the AI role itself. |

## The engine

```
pipeline/library.yaml ──► pipeline/build.py ──► src/data/library.json ─┐
  (curated from Verian's   (validation, data      (what the site uses)   │
   public pages)            quality report)                              │
                                 │                                        ▼
                                 ├──► src/data/eval.reference.json   src/engine/  (TypeScript, in the browser)
                                 │    (Python reference rankings,      text · corpus · retrieve · answer
                                 │     metrics, refusal calibration)   agent/ (harness, tools, guard, memory)
                                 │                                     eval/ (metrics, runner)
pipeline/engine.py ──────────────┘                                        ▲
  (Python reference implementation)          src/engine/parity.test.ts ───┘  identical rankings, enforced
mcp_server/server.py ── the same library exposed as read-only MCP tools (search, item, topics)
```

**Retrieval designs compared:** keyword baseline · BM25 with field boosts · graph retrieval (entity linking + personalised PageRank, GraphRAG-style) · hybrid (reciprocal-rank fusion) · an agentic loop (spelling repair, comparison splitting, BM25, a fall-back to the topic graph when a search comes back weak, verification). The evaluation uses hand-labelled questions with graded relevance (nDCG@10, Recall@5, MRR), plus timing and context-token cost, and recommends the simplest design within a tolerance of the best.

## Results

Measured on 201 library items and 41 hand-labelled questions (32 plain, 5 misspelt, 4 comparisons), plus 11 questions the library cannot answer (four of them added after an independent review). Labels were written before any tuning.

| Design | nDCG@10 | Plain | Misspelt | Comparisons |
|---|---|---|---|---|
| Keyword match | 74.5 | 76.1 | 47.5 | 95.0 |
| BM25 | 84.8 | **88.8** | 50.3 | **96.1** |
| Graph retrieval | 67.2 | 69.9 | 50.4 | 67.2 |
| Hybrid (RRF) | 81.3 | 84.4 | 53.5 | 91.3 |
| **Agentic loop** | **88.5** | **88.8** | **89.1** | 85.8 |

What the evaluation changed:

- **The agent runs on BM25.** The first version of the agentic loop was built on the hybrid; BM25 alone beat it on ordinary questions, so the loop now uses BM25 and only widens to the topic graph when a search comes back weak. Graph retrieval still wins on broad topic questions (for example, how societies view women as leaders).
- **The spelling fixer got stricter.** The evaluation caught it rewriting real words into library words ("wealth" into "health" in an answerable question, "boiling" into "building" in a probe). It now repairs only words of eight or more letters, one edit away.
- **Comparison splitting has not earned its place.** It matched BM25 on two of the four comparison questions and did worse on two. Next step: remove it, or fuse the two halves more carefully.
- **Refusals are calibrated, not guessed.** `pipeline/evaluate.py` sweeps thresholds over the evaluation set and picks the one that refuses the most probes without refusing a single answerable question: 6.7, which declines 9 of the 11 probes by score alone. A review then showed that a place name was enough to get an answer ("What's the weather in London tomorrow?"), so a linked country no longer counts, and the citation check now sends a draft back when a source shares too little with the question. End to end, the agent declines all 11 probes and refuses none of the 41 answerable questions; since every probe was used in tuning, a fresh set is the honest next test.

The import itself produced a data-quality report (`src/data/quality.json`, shown on the Insights page): a case study published twice under two addresses, a malformed link on a tag page, fourteen case studies reachable only through tag pages, and 24 items with no topic tag.

**Safety and data protection:** email addresses, phone numbers, postcodes, dates, street addresses, and NI and card numbers are redacted before anything is logged, including the question (names are not detected yet); retrieved text is scanned for instruction-like content and quarantined; tools are permission-classed and their inputs checked against each tool's schema; a citation check can send a draft back for a second pass; every run is reproducible (stable trace hash). Questions never leave the browser: the Lab link carries them in the URL fragment, and analytics events are stripped to the bare page address.

## Run it

```bash
npm install
npm run dev            # http://localhost:3000
npm run build          # static export to out/
npm start              # serve out/ on :4173
```

Tests:

```bash
npm test               # TypeScript unit + parity tests (Vitest)
npm run test:py        # Python reference, pipeline and MCP server (pytest)
npm run e2e            # Playwright: every page, accessibility (axe), interactions, mobile, reduced motion
```

Data:

```bash
pip install --break-system-packages pyyaml mcp pytest
python3 -m pipeline.build         # validate library.yaml, rebuild JSON, rerun the evaluation
node scripts/world-dots.mjs       # regenerate the dot-matrix world map
python3 -m mcp_server.server      # the MCP server (see mcp_server/README.md)
```

## Design notes

- **Palette:** a cool "survey paper" ground with blue-graphite ink. Three hues are reserved for data only: cobalt (data), viridian (technology), marigold (citizen insight). Every text pairing meets WCAG AA.
- **Type:** Schibsted Grotesk for display and interface, Spectral for reading text, JetBrains Mono only for traces and code.
- **No stock photography:** every image is generated from data — the field, the map, and a glyph per library item (colour = type of work, pattern = its id).
- **Motion:** one orchestrated opening (the population condensing into the triangle); everything else answers scrolling or input. GSAP + ScrollTrigger + SplitText, Lenis smooth scrolling, and a single-draw-call Three.js point shader with frame-rate-independent easing. `prefers-reduced-motion` turns it all off.

## What is real

Titles, dates, links, topics, office addresses and programme facts come from Verian's public site (October 2026); summaries are paraphrased. Searches, answers, traces, metrics and timings are computed live. The home-page field is a visual metaphor, not survey data, and the AI Lab's "poisoned document" is a labelled test fixture.

## Stack

Next.js 16 (static export) · React 19 · TypeScript · CSS Modules · GSAP · Lenis · Three.js · d3-force · Python 3 · pytest · MCP Python SDK · Vitest · Playwright · axe-core · Lighthouse · Vercel (with cookie-free Web Analytics; visit once with `?me` to exclude your own visits).

---

The Verian name, and the work described here, belong to Verian Group. Code © Ahmed Bader.
