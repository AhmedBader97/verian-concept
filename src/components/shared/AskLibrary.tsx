"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { runAgent, type AgentRun } from "@/engine/agent/harness";
import { formatMonth } from "@/engine/answer";
import { getCorpus, KIND_NAMES } from "@/data/library";
import { recordRun } from "@/components/lab/opsStore";
import { EvidenceGlyph } from "./EvidenceGlyph";
import styles from "./AskLibrary.module.css";

const SUGGESTIONS = [
  "How do young people feel about crises?",
  "Trust in policing in Norway",
  "Evaluations of children's services",
  "Public attitudes to artificial intelligence",
];

interface Props {
  /** Compact version for the home page. */
  compact?: boolean;
  initialQuery?: string;
  onQuery?: (q: string) => void;
}

/**
 * Ask a question of Verian's published library. Answers come only from the
 * library: every sentence cites a source, and thin evidence means no answer.
 */
export function AskLibrary({ compact = false, initialQuery = "", onQuery }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const inputId = useId();
  const timer = useRef<number>(0);
  const onQueryRef = useRef(onQuery);
  onQueryRef.current = onQuery;

  // Follow later changes to initialQuery, but never on mount: React replays text
  // typed before hydration as a change event, and resetting here would wipe it.
  const lastInitial = useRef(initialQuery);
  useEffect(() => {
    if (initialQuery === lastInitial.current) return;
    lastInitial.current = initialQuery;
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    window.clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 3) {
      setRun(null);
      return;
    }
    timer.current = window.setTimeout(() => {
      const t0 = performance.now();
      const r = runAgent(getCorpus(), q);
      recordRun(r, performance.now() - t0);
      setRun(r);
      onQueryRef.current?.(q);
    }, 220);
    return () => window.clearTimeout(timer.current);
  }, [query]);

  // The search index is built on the first question, not while the page loads.
  const brief = run?.brief;
  const supported = run?.checks.filter((c) => c.status === "supported").length ?? 0;
  const searchEvent = run?.events.find((e) => e.type === "tool_result" && e.tool === "search_library");
  const rewrites = run?.events.filter((e) => e.type === "rewrite") ?? [];
  const plan = run?.events.find((e) => e.type === "plan");

  const statusText = useMemo(() => {
    if (!run || !brief) return "";
    if (brief.status === "abstained") return "No answer: the library doesn't cover this closely enough.";
    return `Answer drawn from ${brief.citations.length} source${brief.citations.length === 1 ? "" : "s"}, ${supported} of ${run.checks.length} sentences verified.`;
  }, [run, brief, supported]);

  return (
    <div className={styles.ask} data-compact={compact}>
      <form role="search" className={styles.form} onSubmit={(e) => e.preventDefault()}>
        <label htmlFor={inputId} className={styles.label}>
          Ask about Verian&rsquo;s published work
        </label>
        <div className={styles.field}>
          <input
            id={inputId}
            className={styles.input}
            type="search"
            value={query}
            placeholder="Ask a research question"
            autoComplete="off"
            spellCheck
            maxLength={300}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className={styles.clear} onClick={() => setQuery("")} aria-label="Clear the question">
              Clear
            </button>
          )}
        </div>
        <div className={styles.suggest}>
          <span className={styles.suggestLabel}>Try</span>
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className={styles.chip} onClick={() => setQuery(s)}>
              {s}
            </button>
          ))}
        </div>
      </form>

      <p className={styles.status} aria-live="polite">
        {statusText}
      </p>

      {brief && (
        <div className={styles.answer} data-status={brief.status}>
          <div className={styles.brief}>
            <div className={styles.briefHead}>
              <span className={styles.badge} data-confidence={brief.confidence}>
                {brief.status === "abstained" ? "No answer" : `Confidence: ${brief.confidence}`}
              </span>
              <button type="button" className={styles.traceToggle} aria-expanded={showTrace} onClick={() => setShowTrace((v) => !v)}>
                {showTrace ? "Hide how this was found" : "How this was found"}
              </button>
            </div>
            <div className={styles.sentences}>
              {brief.sentences.map((s, i) => (
                <p key={i} data-check={run?.checks[i]?.status}>
                  {s.text}{" "}
                  {s.cites.map((n) => (
                    <a key={n} href={`#cite-${inputId}-${n}`} className={styles.cite} aria-label={`Source ${n}`}>
                      {n}
                    </a>
                  ))}
                </p>
              ))}
            </div>
            {brief.status === "abstained" && <p className={styles.note}>{brief.note}</p>}

            {showTrace && run && (
              <ol className={styles.trace} role="list">
                {plan && plan.type === "plan" && (
                  <li>
                    <strong>Plan.</strong> {plan.steps.join(", then ").toLowerCase()}.
                    {plan.entities.length > 0 && <> Linked: {plan.entities.map((e) => e.label).join(", ")}.</>}
                  </li>
                )}
                {searchEvent && searchEvent.type === "tool_result" && (
                  <li>
                    <strong>Search.</strong> {searchEvent.summary}.
                  </li>
                )}
                {rewrites.map((r, i) => (
                  <li key={i}>
                    <strong>Rewrite.</strong> {r.type === "rewrite" ? r.detail : ""}.
                  </li>
                ))}
                <li>
                  <strong>Verify.</strong> {supported} of {run.checks.length} sentences quote a retrieved source on veriangroup.com.
                </li>
                <li>
                  <Link className="link" href={`/lab/#q=${encodeURIComponent(run.question)}`}>
                    Open the full trace in the AI Lab
                  </Link>
                </li>
              </ol>
            )}
          </div>

          {brief.citations.length > 0 && (
            <ol className={styles.sources} role="list" aria-label="Sources">
              {brief.citations.map((c) => {
                const item = getCorpus().byId.get(c.id)!;
                return (
                  <li key={c.n} id={`cite-${inputId}-${c.n}`} className={styles.source}>
                    <span className={styles.sourceN}>{c.n}</span>
                    <EvidenceGlyph item={item} size={44} />
                    <div>
                      <a href={c.url} target="_blank" rel="noreferrer" className={styles.sourceTitle}>
                        {c.title}
                      </a>
                      <p className={styles.sourceMeta}>
                        {KIND_NAMES[c.kind]}, {c.country === "Global" ? "global" : c.country}, {formatMonth(c.date)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
