import type { Metadata } from "next";
import Link from "next/link";
import { Bench } from "@/components/lab/Bench";
import { ConsoleFromQuery } from "@/components/lab/ConsoleFromQuery";
import { Monitor } from "@/components/lab/Monitor";
import { Robustness } from "@/components/lab/Robustness";
import { AUTHOR } from "@/data/site";
import { LIBRARY } from "@/data/library";
import gold from "@/data/gold.json";
import quality from "@/data/quality.json";
import type { GoldQuery } from "@/engine/types";
import styles from "@/components/lab/Lab.module.css";

export const metadata: Metadata = {
  title: "AI Lab",
  description: "A concept for research AI that cites every claim, says when evidence is thin, and waits for a person before anything is shared.",
};

const PRINCIPLES = [
  {
    title: "Cite everything",
    body: "Every sentence points at the piece of Verian work it comes from, and a verifier checks it.",
    bar: "Success: every sentence in a brief passes the citation check.",
  },
  {
    title: "Say when the evidence is thin",
    body: "Below a calibrated threshold, or when no source really matches, the assistant declines instead of guessing.",
    bar: "Success: declines every off-topic probe and no answerable question.",
  },
  {
    title: "Ask before anything leaves",
    body: "Reading is allowed; the web is refused; sending waits for a researcher's approval.",
    bar: "Success: no tool outside the policy ever runs, in any test.",
  },
  {
    title: "Measure before adopting",
    body: "Five designs are compared on the same questions, and the simplest one that meets the bar wins.",
    bar: "Success: the design in use is the one the evaluation recommends.",
  },
];

const QUALITY = quality as { total: number; titleOnlySummaries: number };
const ANSWERABLE = (gold as unknown as GoldQuery[]).filter((g) => Object.keys(g.relevant).length > 0).length;

export default function LabPage() {
  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <p className={styles.crumb}>
            AI Lab <span className={styles.conceptTag}>concept</span>
          </p>
          <h1 className="h1">
            Research AI that shows its working
          </h1>
          <div className={styles.heroCols}>
            <p className="lede">
              Verian&rsquo;s value rests on evidence people can trust. This is how I would bring AI to that work: a research
              assistant over Verian&rsquo;s own library of {LIBRARY.length} publications, with an agent harness, tool
              permissions, reviewer memory, evaluations and an execution trace you can inspect line by line.
            </p>
            <p className={styles.heroNote}>
              Built by{" "}
              <Link className="link" href="/concept/">
                {AUTHOR.name}
              </Link>{" "}
              for the Junior AI Engineer role. Everything runs in your browser. No model is called: the planner is
              rule-based so every run is reproducible, and it uses the same tool interface a model-driven planner would.
            </p>
          </div>
          <ul role="list" className={styles.principles}>
            {PRINCIPLES.map((p) => (
              <li key={p.title}>
                <h2 className={styles.principleTitle}>{p.title}</h2>
                <p>{p.body}</p>
                <p className={styles.principleBar}>{p.bar}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.block} id="agent" aria-labelledby="agent-title">
        <div className="container">
          <div className={styles.blockHead}>
            <h2 id="agent-title" className="h2">
              Run the agent
            </h2>
            <p className="lede">
              Ask a question, or try one designed to misbehave. Open any step to see the exact tool input and output.
            </p>
          </div>
          <ConsoleFromQuery />
        </div>
      </section>

      <section className={styles.block} id="bench" aria-labelledby="bench-title">
        <div className="container">
          <div className={styles.blockHead}>
            <h2 id="bench-title" className="h2">
              Which architecture?
            </h2>
            <p className="lede">
              Agentic RAG, GraphRAG or something simpler? The answer is an experiment, not an opinion. Here are five designs
              scored on the same hand-labelled questions, with quality, speed and cost side by side.
            </p>
          </div>
          <Bench />
          <div className={styles.findings}>
            <h3 className="h4">What the evaluation changed</h3>
            <ul role="list">
              <li>
                <strong>The agent now runs on BM25.</strong> Plain BM25 beat both graph retrieval and the hybrid on ordinary
                questions, so the agentic loop uses it as its engine and only widens to the topic graph when a search comes back
                weak. Graph retrieval still wins on broad topic questions, such as how societies view women as leaders.
              </li>
              <li>
                <strong>The spelling fixer got stricter.</strong> The evaluation caught it turning real words into library words:
                a question about household wealth became one about health, and a probe about boiling became one about building.
                It now repairs only long words one edit away, which still fixes &ldquo;vacination&rdquo; and
                &ldquo;preparedniss&rdquo;.
              </li>
              <li>
                <strong>Splitting comparisons has not earned its place.</strong> On the four comparison questions it matched
                BM25 twice and did worse twice. It stays visible in the trace, and it is the next thing I would remove or fix.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.block} id="robustness" aria-labelledby="robust-title">
        <div className="container">
          <div className={styles.blockHead}>
            <h2 id="robust-title" className="h2">
              Break it on purpose
            </h2>
            <p className="lede">Failure handling tested on realistic cases: injection, personal data, forbidden tools and questions it shouldn&rsquo;t answer.</p>
          </div>
          <Robustness />
        </div>
      </section>

      <section className={styles.block} id="monitor" aria-labelledby="monitor-title">
        <div className="container">
          <div className={styles.blockHead}>
            <h2 id="monitor-title" className="h2">
              Watch it running
            </h2>
            <p className="lede">The signals I would put on a dashboard in production, computed from the runs in this browser session.</p>
          </div>
          <Monitor />
        </div>
      </section>

      <section className={styles.block} id="production" aria-labelledby="prod-title">
        <div className="container">
          <div className={styles.blockHead}>
            <h2 id="prod-title" className="h2">
              From prototype to production
            </h2>
            <p className="lede">What changes when this leaves the browser, and what stays the same.</p>
          </div>
          <div className={styles.prod}>
            <article>
              <h3 className="h4">Swap the planner, keep the harness</h3>
              <p>
                The tools already declare JSON Schemas in the shape model APIs expect for tool use. A model-driven planner
                would call the same tools through the same policy, and the trace, verifier and approval step stay as they
                are.
              </p>
            </article>
            <article>
              <h3 className="h4">An MCP server for the library</h3>
              <p>
                The repository includes a Python MCP server exposing search, item lookup and topic expansion, so researchers
                can use Verian&rsquo;s library from Claude Desktop or any MCP client, read-only.
              </p>
            </article>
            <article>
              <h3 className="h4">Two implementations, one answer</h3>
              <p>
                The retrieval engine is written in Python as the reference and in TypeScript for the browser. A parity test
                checks that both return identical rankings, so results are reproducible across environments.
              </p>
            </article>
            <article>
              <h3 className="h4">Data protection by design</h3>
              <p>
                Email addresses, phone numbers, postcodes, dates, street addresses, and NI and card numbers are removed before
                anything is logged; names are not detected yet. Retrieved text is never treated as instructions. Questions stay
                in your browser: page views are counted with cookie-free Vercel Analytics, without the question.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.block} id="limits" aria-labelledby="limits-title">
        <div className="container">
          <div className={styles.limits}>
            <h2 id="limits-title" className="h3">
              Limits, and what I would test next
            </h2>
            <ul role="list">
              <li>
                Most items ({QUALITY.titleOnlySummaries} of {QUALITY.total}) are known only by their title; the rest have a
                short summary, and none has its full report. With full texts I would chunk documents, compare dense and lexical
                retrieval, and cite passages rather than whole items.
              </li>
              <li>
                Relevance labels are mine, written from titles and summaries before any tuning, and {ANSWERABLE} questions is a small set.
                Researcher-written labels and a held-out set would make the comparison fairer, and would be needed before trying
                a router that sends topic-shaped questions to the graph.
              </li>
              <li>
                The refusal threshold sits just below the weakest answerable question, so it is fragile. By score alone it
                declines most of the off-topic probes; the citation check catches the rest, such as &ldquo;Translate good
                morning into Japanese&rdquo;, which shares only the word &ldquo;good&rdquo; with the library. Every probe was
                used to tune these rules, so a fresh set of questions would be the honest test.
              </li>
              <li>
                Redaction catches contact details that follow a pattern, not names. Before real respondent data came anywhere
                near this, I would add a named-entity model and test it on realistic transcripts.
              </li>
              <li>
                The briefs are extractive, which keeps them faithful but plain. A model could write better prose; the verifier
                would then need to check that each sentence actually follows from its source, not just that it quotes it.
              </li>
              <li>
                Monitoring here covers one browser. In production it would aggregate anonymised traces, track drift in what
                people ask, and alert on rising refusal or quarantine rates.
              </li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
