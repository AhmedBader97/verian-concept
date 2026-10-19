"use client";

import { useMemo, useState } from "react";
import gold from "@/data/gold.json";
import reference from "@/data/eval.reference.json";
import { getCorpus } from "@/data/library";
import { runAgent } from "@/engine/agent/harness";
import { recommend, runAll, type StrategySummary } from "@/engine/eval/run";
import type { GoldQuery, StrategyId } from "@/engine/types";
import styles from "./Lab.module.css";

export const DESIGNS: Record<StrategyId, { name: string; what: string; parts: number }> = {
  keyword: { name: "Keyword match", what: "Counts the question's words in each title and summary. The baseline to beat.", parts: 1 },
  bm25: { name: "BM25 retrieval", what: "Classic ranking that weighs rare words and field importance. What plain RAG uses.", parts: 2 },
  graph: { name: "Graph retrieval", what: "Links topics and countries in the question, then spreads relevance across a knowledge graph, like GraphRAG.", parts: 3 },
  hybrid: { name: "Hybrid", what: "Fuses BM25 and graph rankings with reciprocal-rank fusion.", parts: 4 },
  agentic: { name: "Agentic loop", what: "Fixes spelling, splits comparisons, runs BM25, widens weak searches to the topic graph, then filters unsupported results.", parts: 5 },
};

interface RefStrategy {
  strategy: StrategyId;
  rows: { id: string; ranked: string[] }[];
}

const ALL_GOLD = gold as unknown as GoldQuery[];
const GOLD = ALL_GOLD.filter((g) => Object.keys(g.relevant).length > 0);
const pct = (v: number) => `${(v * 100).toFixed(1)}`;

/** Question types, from the note on each gold question. */
const SLICES = [
  { id: "plain", label: "Plain questions", test: (g: GoldQuery) => !g.note?.startsWith("messy") },
  { id: "spelling", label: "With misspellings", test: (g: GoldQuery) => g.note === "messy: misspelling" },
  { id: "compare", label: "Comparisons", test: (g: GoldQuery) => g.note === "messy: comparison" },
].map((s) => ({ ...s, ids: new Set(GOLD.filter(s.test).map((g) => g.id)) }));

export function Bench() {
  const [results, setResults] = useState<StrategySummary[] | null>(null);
  const [tolerance, setTolerance] = useState(2);
  const [cell, setCell] = useState<{ q: string; s: StrategyId } | null>(null);
  const [endToEnd, setEndToEnd] = useState<{ declined: number; probes: number; falseRefusals: number; answerable: number } | null>(null);
  const corpus = getCorpus();

  const run = () => {
    // Run twice and keep the second, so timings exclude one-off warm-up.
    runAll(corpus, GOLD);
    setResults(runAll(corpus, GOLD));
    // End to end: the whole agent, citation check included, on every question.
    let declined = 0;
    let falseRefusals = 0;
    for (const g of ALL_GOLD) {
      const status = runAgent(corpus, g.query, { now: () => 0 }).brief.status;
      if (Object.keys(g.relevant).length === 0) declined += status === "abstained" ? 1 : 0;
      else falseRefusals += status === "abstained" ? 1 : 0;
    }
    setEndToEnd({ declined, probes: ALL_GOLD.length - GOLD.length, falseRefusals, answerable: GOLD.length });
  };

  const best = results ? Math.max(...results.map((r) => r.ndcg)) : 0;
  const pick = results ? recommend(results, tolerance / 100) : undefined;
  const maxMs = results ? Math.max(...results.map((r) => r.p50ms), 0.001) : 1;

  const parity = useMemo(() => {
    if (!results) return null;
    const ref = (reference as { strategies?: RefStrategy[] }).strategies ?? [];
    let same = 0;
    let total = 0;
    for (const r of results) {
      const rs = ref.find((x) => x.strategy === r.strategy);
      if (!rs) continue;
      for (const row of r.rows) {
        const rr = rs.rows.find((x) => x.id === row.id);
        if (!rr) continue;
        total++;
        if (rr.ranked.join("|") === row.ranked.join("|")) same++;
      }
    }
    return { same, total };
  }, [results]);

  const abstention = (reference as { abstention?: { threshold: number; answerable: number; unanswerable: number; correctAbstentions: number; falseAbstentions: number } }).abstention;
  const selected = cell && results ? results.find((r) => r.strategy === cell.s)?.rows.find((r) => r.id === cell.q) : null;

  return (
    <div className={styles.bench}>
      <ul role="list" className={styles.designs}>
        {(Object.keys(DESIGNS) as StrategyId[]).map((id) => (
          <li key={id} data-picked={pick?.strategy === id}>
            <span className={styles.designParts} role="img" aria-label={`Complexity ${DESIGNS[id].parts} of 5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} data-on={i < DESIGNS[id].parts} />
              ))}
            </span>
            <h3 className={styles.designName}>{DESIGNS[id].name}</h3>
            <p>{DESIGNS[id].what}</p>
          </li>
        ))}
      </ul>

      <div className={styles.benchBar}>
        <button type="button" className="btn" onClick={run}>
          {results ? "Run again" : `Run the evaluation on ${GOLD.length} questions`}
        </button>
        <p className={styles.benchNote}>
          Runs in your browser in milliseconds. Relevance labels were written by hand before tuning; see the caveats below.
        </p>
      </div>

      {results && (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="visually-hidden">Retrieval quality, speed and cost by design</caption>
              <thead>
                <tr>
                  <th scope="col">Design</th>
                  <th scope="col">nDCG@10</th>
                  <th scope="col">Recall@5</th>
                  <th scope="col">MRR</th>
                  <th scope="col">Median time</th>
                  <th scope="col">Searches</th>
                  <th scope="col">Context tokens</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.strategy} data-picked={pick?.strategy === r.strategy} data-best={r.ndcg === best}>
                    <th scope="row">{DESIGNS[r.strategy].name}</th>
                    <td>
                      <span className={styles.barCell}>
                        <span className={styles.bar} style={{ width: `${r.ndcg * 100}%` }} />
                        <span className="tnum">{pct(r.ndcg)}</span>
                      </span>
                    </td>
                    <td className="tnum">{pct(r.recall)}</td>
                    <td className="tnum">{pct(r.mrr)}</td>
                    <td>
                      <span className={styles.barCell}>
                        <span className={`${styles.bar} ${styles.barTime}`} style={{ width: `${(r.p50ms / maxMs) * 100}%` }} />
                        <span className="tnum">{r.p50ms < 0.05 ? "< 0.1 ms" : `${r.p50ms.toFixed(1)} ms`}</span>
                      </span>
                    </td>
                    <td className="tnum">{r.calls.toFixed(2)}</td>
                    <td className="tnum">{r.contextTokens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.legend}>
            nDCG@10: how well the top ten are ordered, counting the best answers most (100 is perfect). Recall@5: the share of
            relevant items found in the top five. MRR: how near the top the first relevant item appears. Times are rounded to the
            browser timer&rsquo;s resolution of about 0.1 ms.
          </p>

          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.sliceTable}`}>
              <caption className={styles.sliceCaption}>nDCG@10 by kind of question</caption>
              <thead>
                <tr>
                  <th scope="col">Questions</th>
                  {results.map((r) => (
                    <th key={r.strategy} scope="col">
                      {DESIGNS[r.strategy].name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SLICES.map((sl) => {
                  const scores = results.map((r) => {
                    const rows = r.rows.filter((x) => sl.ids.has(x.id));
                    return rows.length ? rows.reduce((a, x) => a + x.ndcg, 0) / rows.length : 0;
                  });
                  const top = Math.max(...scores);
                  return (
                    <tr key={sl.id}>
                      <th scope="row">
                        {sl.label} <span className={styles.sliceN}>({sl.ids.size})</span>
                      </th>
                      {scores.map((v, i) => (
                        <td key={results[i]!.strategy} className="tnum" data-top={v === top}>
                          {pct(v)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.decide}>
            <label className={styles.range}>
              <span>Accept a design within</span>
              <input type="range" min={0} max={10} step={0.5} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
              <span className="tnum">{tolerance} points</span>
            </label>
            {pick && (
              <p className={styles.decision}>
                <strong>Recommendation: {DESIGNS[pick.strategy].name}.</strong>{" "}
                {pick.ndcg === best
                  ? "It is the best-scoring design."
                  : `It scores ${pct(best - pick.ndcg)} points below the best, inside your tolerance, and is simpler to build, run and explain.`}{" "}
                The rule is to adopt the simplest design that meets the bar, and to keep the extra machinery only where it earns its place.
              </p>
            )}
          </div>

          <div className={styles.grid}>
            <div className={styles.gridHead}>
              <h3 className="h4">Question by question</h3>
              <p className={styles.benchNote}>Each cell is nDCG@10 for one question and one design. Select a cell to see what it returned.</p>
            </div>
            <div className={styles.heatWrap}>
              <table className={styles.heat}>
                <thead>
                  <tr>
                    <th scope="col">Question</th>
                    {results.map((r) => (
                      <th key={r.strategy} scope="col">
                        {DESIGNS[r.strategy].name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GOLD.map((g) => (
                    <tr key={g.id}>
                      <th scope="row">{g.query}</th>
                      {results.map((r) => {
                        const row = r.rows.find((x) => x.id === g.id)!;
                        const active = cell?.q === g.id && cell.s === r.strategy;
                        return (
                          <td key={r.strategy}>
                            <button
                              type="button"
                              className={styles.heatCell}
                              style={{ ["--v" as string]: row.ndcg, color: row.ndcg > 0.55 ? "#fff" : undefined }}
                              aria-pressed={active}
                              aria-label={`${DESIGNS[r.strategy].name}: ${pct(row.ndcg)}`}
                              onClick={() => setCell(active ? null : { q: g.id, s: r.strategy })}
                            >
                              {pct(row.ndcg)}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selected && cell && (
              <div className={styles.cellDetail}>
                <p>
                  <strong>{DESIGNS[cell.s].name}</strong> for “{selected.query}”
                </p>
                <ol>
                  {selected.ranked.slice(0, 5).map((id) => {
                    const g = GOLD.find((x) => x.id === cell.q)!;
                    const rel = g.relevant[id];
                    return (
                      <li key={id} data-rel={rel ?? 0}>
                        {corpus.byId.get(id)?.title ?? id}
                        <span>{rel === 2 ? "answers it" : rel === 1 ? "useful context" : "not relevant"}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </div>

          <div className={styles.receipts}>
            {parity && parity.total > 0 && (
              <p data-ok={parity.same === parity.total}>
                <span>
                  <strong>Reproducible:</strong> {parity.same} of {parity.total} rankings in your browser match the Python
                  reference implementation exactly.
                </span>
              </p>
            )}
            {abstention && (
              <p data-ok>
                <span>
                  <strong>Calibrated refusal:</strong> the agent declines when its best match scores below {abstention.threshold}{" "}
                  and the question names no topic it knows. On the {abstention.unanswerable} off-topic probes used to set it,
                  that rule alone declines {abstention.correctAbstentions}
                  {endToEnd
                    ? `; with the citation check as well, the agent declines ${endToEnd.declined} of ${endToEnd.probes}, and refuses ${endToEnd.falseRefusals} of the ${endToEnd.answerable} answerable questions.`
                    : `, and refuses ${abstention.falseAbstentions} of the ${abstention.answerable} answerable questions.`}
                </span>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
