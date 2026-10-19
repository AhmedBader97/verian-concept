import type { Metadata } from "next";
import Link from "next/link";
import receipts from "@/data/receipts.json";
import { AUTHOR, LINKS } from "@/data/site";
import styles from "@/components/pages/Pages.module.css";

export const metadata: Metadata = {
  title: "About this concept",
  description: "Why Ahmed Bader rebuilt Verian's website, and how it maps to the Junior AI Engineer / Forward Deployed Engineer role.",
};

interface Receipts {
  tsTests?: number;
  pyTests?: number;
  e2eTests?: number;
  parity?: { same: number; total: number };
  lighthouse?: { performance: number; accessibility: number; bestPractices: number; seo: number; page: string };
  axeViolations?: number;
  pagesChecked?: number;
  libraryItems?: number;
  goldQuestions?: number;
  bestDesign?: { name: string; ndcg: number };
  recommended?: { name: string; ndcg: number };
  abstention?: { threshold: number; correct: number; probes: number; falseAbstentions: number };
  endToEnd?: { declined: number; probes: number; falseRefusals: number; answerable: number };
}

const R = receipts as Receipts;

const MAP = [
  {
    need: "Build LLM applications and agentic workflows: harnesses, context and memory, tools and orchestration, with permissions and human oversight",
    built: "An agent harness with a JSON-Schema tool registry, a permission policy, a context budget, reviewer memory you can inspect and delete, and a human approval step",
    see: { href: "/lab/#agent", label: "AI Lab: Run the agent" },
    code: "src/engine/agent/",
  },
  {
    need: "Compare agentic RAG, GraphRAG, single or multi-agent designs, or something simpler, using evidence",
    built: "Five retrieval designs scored on the same hand-labelled questions for quality, speed and context cost, with a 'simplest design that meets the bar' rule",
    see: { href: "/lab/#bench", label: "AI Lab: Which architecture?" },
    code: "src/engine/retrieve.ts, src/engine/eval/",
  },
  {
    need: "Turn prototypes into reliable tools: pipelines, APIs and interfaces, failure handling, data protection, reproducibility and monitoring",
    built: "A validated Python data pipeline, an MCP server, failure tests (injection, personal data, forbidden tools, off-topic questions), deterministic traces and a session monitor",
    see: { href: "/lab/#robustness", label: "AI Lab: Break it on purpose" },
    code: "pipeline/, mcp_server/, tests/",
  },
  {
    need: "Validate results against expert judgement and simpler methods; preserve source references and reproducible workflows",
    built: "Relevance labels written before tuning, a keyword baseline, a verifier that checks every citation, and a parity test between the Python reference and the browser engine",
    see: { href: "/lab/#bench", label: "Evaluation and parity" },
    code: "src/data/gold.json, src/engine/parity.test.ts",
  },
  {
    need: "Work with clients: define requirements and success criteria, demonstrate solutions, support adoption",
    built: "A working demo written for non-specialists, with its success criteria, limits and next steps stated plainly",
    see: { href: "/lab/#limits", label: "Limits and next steps" },
    code: "src/app/lab/page.tsx",
  },
  {
    need: "Python, JavaScript or TypeScript, APIs, version control and structured development",
    built: "A TypeScript site and engine, a Python reference implementation and MCP server, and unit, end-to-end and accessibility tests, documented in the repository",
    see: { href: AUTHOR.repo, label: "The repository" },
    code: "package.json, pyproject.toml",
  },
  {
    need: "Research mindset: data quality, evidence, the limits of an analysis, and public policy",
    built: "A validated import of Verian's library with a data-quality report (duplicate pages, a broken link, untagged items), a calibrated refusal threshold, and caveats about where my own labels could flatter a method",
    see: { href: "/insights/#data", label: "Insights: About this data" },
    code: "pipeline/build.py, pipeline/source_notes.yaml",
  },
];

const REAL = [
  { label: "From Verian's site", body: "Titles, dates, links, topics, office addresses, expertise areas and programme facts. Summaries are paraphrased." },
  { label: "Computed live", body: "Every search, answer, trace, metric and timing is calculated in your browser as you use it. The Python reference rankings, the refusal calibration and the data-quality counts are computed ahead of time by the pipeline." },
  { label: "Illustrative", body: "The point field on the home page is a visual metaphor, not survey data. The poisoned document in the AI Lab is a labelled test fixture." },
];

export default function ConceptPage() {
  const lh = R.lighthouse;
  const tiles = [
    { v: R.tsTests, l: "TypeScript unit tests" },
    { v: R.pyTests, l: "Python tests" },
    { v: R.e2eTests, l: "End-to-end browser tests" },
    { v: R.parity ? `${R.parity.same}/${R.parity.total}` : undefined, l: "rankings identical in Python and TypeScript" },
    { v: R.axeViolations !== undefined ? R.axeViolations : undefined, l: `accessibility violations (axe) across ${R.pagesChecked ?? "all"} pages` },
    // SEO is left out: the site carries a deliberate noindex because it is an unofficial concept.
    { v: lh ? `${lh.performance} / ${lh.accessibility} / ${lh.bestPractices}` : undefined, l: "Lighthouse on the home page: performance, accessibility, best practices" },
  ].filter((t) => t.v !== undefined);

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <p className={styles.kicker}>About this concept</p>
          <h1 className="h1">
            I rebuilt Verian&rsquo;s website to show how I would work as your Junior AI Engineer.
          </h1>
          <div className={styles.conceptIntro}>
            <p className="lede">
              I&rsquo;m {AUTHOR.name}, a software engineer in London. Rather than describe what I can do, I built it: a
              faster, calmer home for Verian&rsquo;s work, and an AI Lab that answers the role&rsquo;s brief with working
              software you can test.
            </p>
            <div className={styles.heroActions}>
              <Link className="btn" href="/lab/">
                Open the AI Lab
              </Link>
              <a className="btn btn--ghost" href={AUTHOR.repo} target="_blank" rel="noreferrer">
                Read the code
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="map-title">
        <div className="container">
          <h2 id="map-title" className="h2">
            The brief, answered
          </h2>
          <div className={styles.mapTableWrap}>
            <table className={styles.mapTable}>
              <thead>
                <tr>
                  <th scope="col">The role asks for</th>
                  <th scope="col">What I built</th>
                  <th scope="col">Where to look</th>
                </tr>
              </thead>
              <tbody>
                {MAP.map((m) => (
                  <tr key={m.need}>
                    <th scope="row">{m.need}</th>
                    <td data-label="What I built">{m.built}</td>
                    <td data-label="Where to look">
                      {m.see.href.startsWith("http") ? (
                        <a className="link" href={m.see.href} target="_blank" rel="noreferrer">
                          {m.see.label}
                        </a>
                      ) : (
                        <Link className="link" href={m.see.href}>
                          {m.see.label}
                        </Link>
                      )}
                      <code className={styles.codePath}>{m.code}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {tiles.length > 0 && (
        <section className={`section ${styles.receiptsBand}`} aria-labelledby="receipts-title">
          <div className="container">
            <h2 id="receipts-title" className="h2">
              Receipts
            </h2>
            <p className={`lede ${styles.receiptsLede}`}>Measured on the build you are looking at, not estimated.</p>
            <dl className={styles.receiptTiles}>
              {tiles.map((t) => (
                <div key={t.l}>
                  <dd className="tnum">{t.v}</dd>
                  <dt>{t.l}</dt>
                </div>
              ))}
            </dl>
            {R.bestDesign && R.recommended && (
              <p className={styles.receiptNote}>
                On {R.goldQuestions} hand-labelled questions over {R.libraryItems} library items,{" "}
                {R.bestDesign.name === R.recommended.name
                  ? `${R.bestDesign.name} scored best (nDCG@10 of ${(R.bestDesign.ndcg * 100).toFixed(1)}), so it is the design the agent uses.`
                  : `the best design was ${R.bestDesign.name} (nDCG@10 of ${(R.bestDesign.ndcg * 100).toFixed(1)}); the recommended design at a two-point tolerance is ${R.recommended.name} (${(R.recommended.ndcg * 100).toFixed(1)}).`}
                {R.abstention &&
                  ` On the ${R.abstention.probes} off-topic probes used to calibrate it, the refusal threshold of ${R.abstention.threshold} alone declined ${R.abstention.correct}`}
                {R.abstention && R.endToEnd
                  ? `; with the citation check as well, the agent declined ${R.endToEnd.declined} of ${R.endToEnd.probes}, and refused ${R.endToEnd.falseRefusals} of the ${R.endToEnd.answerable} answerable questions.`
                  : R.abstention
                    ? `, with ${R.abstention.falseAbstentions} false refusals.`
                    : null}
              </p>
            )}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="real-title">
        <div className={`container ${styles.split}`}>
          <h2 id="real-title" className="h3">
            What is real here
          </h2>
          <dl className={styles.realList}>
            {REAL.map((r) => (
              <div key={r.label}>
                <dt>{r.label}</dt>
                <dd>{r.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section" aria-labelledby="how-title">
        <div className={`container ${styles.split}`}>
          <h2 id="how-title" className="h3">
            How I built it
          </h2>
          <div className="prose">
            <p>
              I started from the role&rsquo;s brief and Verian&rsquo;s own pages, then designed around one idea: Verian works
              where data, technology and citizen insight meet, so the home page opens on a ternary plot of exactly that, and
              every image on the site is drawn in code: there is no stock photography.
            </p>
            <p>
              The search engine exists twice, as a Python reference and in TypeScript for the browser, with a test that
              insists they agree. I wrote the evaluation questions before tuning anything, kept a keyword baseline to beat,
              and let the numbers pick the design. They overruled me twice: the agent now runs on plain BM25 rather than the
              hybrid I started with, and the spelling fixer had to become stricter after it turned &ldquo;wealth&rdquo; into
              &ldquo;health&rdquo;. The site is built with Next.js, React and TypeScript; motion uses GSAP, Lenis and a custom
              Three.js shader; the graph uses d3-force; the Python side includes an MCP server.
            </p>
            <p>
              I work with AI coding agents the way I would in Verian&rsquo;s AI team: I set the direction, review every
              change, and make tests the judge of whether something works.
            </p>
          </div>
        </div>
      </section>

      <section className={`section ${styles.meBand}`} aria-labelledby="me-title">
        <div className={`container ${styles.split}`}>
          <h2 id="me-title" className="h3">
            About me
          </h2>
          <ul role="list" className={styles.cv}>
            <li>
              <strong>Telephone interviewer, IFF Research.</strong> I run CATI surveys, including graduate outcomes research
              for universities, so I know fieldwork from the interviewer&rsquo;s side of the call.
            </li>
            <li>
              <strong>AI voice interviewer, my own company, since 2025.</strong> A telephone interviewer for market research
              with a custom text-to-speech voice and the Claude API as a live reasoning layer that hands back to a human when
              its confidence is low.
            </li>
            <li>
              <strong>ContentBlur.</strong> A real-time video filter built on a multi-model computer vision pipeline. I am
              building its own segmentation model from a curated corpus of around 60,000 frames, with blind-reviewed ground
              truth, sealed predictions before every experiment, and a failing test written before every fix.
            </li>
            <li>
              <strong>Timelex, founder, since 2024.</strong> An AI time-tracking product for law firms: Windows agent,
              ASP.NET Core API, React dashboard, browser extension and Clio integration, with LLM-written timesheet
              narratives.
            </li>
            <li>
              <strong>Graduate developer, Numatic International.</strong> UI and backend for an autonomous robot vacuum that
              cleans commercial buildings. I have also built ASP.NET Core web applications at Tribal Group.
            </li>
            <li>
              <strong>BEng Software Engineering, First Class.</strong>
            </li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className={`container ${styles.closing}`}>
          <p className={styles.closingText}>Thank you for looking. I would love to build things like this with your team.</p>
          <div className={styles.heroActions}>
            <a className="btn" href={AUTHOR.github} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link className="btn btn--ghost" href="/">
              Back to the site
            </Link>
          </div>
          <p className={styles.footnote}>
            Unofficial and not affiliated with Verian. All Verian content links to{" "}
            <a className="link" href={LINKS.original} target="_blank" rel="noreferrer">
              veriangroup.com
            </a>
            .
          </p>
        </div>
      </section>
    </>
  );
}
