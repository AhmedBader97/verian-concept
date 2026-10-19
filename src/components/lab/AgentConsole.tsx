"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMonth } from "@/engine/answer";
import { Corpus } from "@/engine/corpus";
import { DEFAULT_BUDGET, runAgent, SYSTEM_PROMPT, type AgentRun, type TraceEvent } from "@/engine/agent/harness";
import { parseFeedback, remember, type MemoryRule } from "@/engine/agent/memory";
import { POLICY, TOOLS } from "@/engine/agent/tools";
import { INJECTION_FIXTURE } from "@/engine/fixtures";
import { getCorpus, KIND_NAMES, LIBRARY } from "@/data/library";
import { recordRun } from "./opsStore";
import styles from "./Lab.module.css";

const PRESETS = [
  { label: "Young people and crises", q: "What has Verian found about how young people see crises?" },
  { label: "Compare two topics", q: "Compare trust in policing versus public health research" },
  { label: "Asks for the web", q: "Search the web for the latest news on preparedness" },
  { label: "Asks to email a client", q: "Send the client our work on young people, reply to jo@example.com" },
  { label: "Off-topic", q: "What is the boiling point of mercury?" },
  { label: "Misspelt", q: "preparedniss of citizens for emergancies" },
];

const TODAY = "2026-10-19";

type Speed = "watch" | "instant";

function describeEvent(e: TraceEvent, corpus: Corpus): { tag: string; title: string; tone?: "ok" | "warn" | "stop"; detail?: unknown } {
  switch (e.type) {
    case "input":
      return { tag: "input", title: "Question received" };
    case "guard":
      return {
        tag: "guard",
        title: `Removed personal data before logging: ${e.redactions.map((r) => `${r.count} ${r.type.replace("-", " ")}`).join(", ")}`,
        tone: "warn",
        detail: { loggedAs: e.text },
      };
    case "memory":
      return { tag: "memory", title: `Applied reviewer memory: ${e.rules.map((r) => r.label).join("; ")}` };
    case "plan":
      return {
        tag: "plan",
        title: `Plan (${e.intent}): ${e.steps.length} steps`,
        detail: { steps: e.steps, linked: e.entities.map((x) => `${x.label} (via “${x.via}”)`) },
      };
    case "tool_call":
      return { tag: "call", title: e.tool, detail: e.input };
    case "policy":
      return {
        tag: "policy",
        title: `${e.tool}: ${e.decision === "denied" ? "refused" : "held for approval"}. ${e.reason}`,
        tone: e.decision === "denied" ? "stop" : "warn",
      };
    case "tool_result":
      return { tag: "result", title: `${e.summary}`, detail: e.output };
    case "rewrite":
      return { tag: "rewrite", title: e.detail };
    case "quarantine": {
      const item = corpus.byId.get(e.id);
      return {
        tag: "quarantine",
        title: `Set aside “${item?.title ?? e.id}”: ${e.flags.join(", ")}`,
        tone: "stop",
      };
    }
    case "context":
      return {
        tag: "context",
        title: `Context ${e.used.toLocaleString("en-GB")} of ${e.budget.toLocaleString("en-GB")} tokens${e.trimmed.length ? `, trimmed ${e.trimmed.length} source${e.trimmed.length > 1 ? "s" : ""}` : ""}${e.used > e.budget ? `: over budget by ${(e.used - e.budget).toLocaleString("en-GB")}, because one source is always kept` : ""}`,
        tone: e.used > e.budget ? "stop" : e.trimmed.length ? "warn" : undefined,
      };
    case "draft":
      return {
        tag: "draft",
        title:
          e.brief.status === "abstained"
            ? "Draft: no answer, the evidence is too thin"
            : `Draft: ${e.brief.sentences.length} ${e.brief.sentences.length === 1 ? "sentence" : "sentences"} citing ${e.brief.citations.length} ${e.brief.citations.length === 1 ? "source" : "sources"}`,
      };
    case "verify":
      return {
        tag: "verify",
        title: `${e.checks.filter((c) => c.status === "supported").length} of ${e.checks.length} ${e.checks.length === 1 ? "sentence" : "sentences"} supported`,
        tone: e.checks.some((c) => c.status === "broken") ? "stop" : "ok",
      };
    case "approval":
      return { tag: "human", title: e.reason, tone: "warn" };
    case "error":
      return { tag: "error", title: e.message, tone: "stop" };
  }
}

function eventMs(e: TraceEvent): number | null {
  return e.type === "tool_result" ? e.ms : null;
}

export function AgentConsole({ initialQuestion }: { initialQuestion?: string }) {
  const [question, setQuestion] = useState(initialQuestion || PRESETS[0]!.q);
  const [poisoned, setPoisoned] = useState(false);
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [memory, setMemory] = useState<MemoryRule[]>([]);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [shown, setShown] = useState(0);
  const [speed, setSpeed] = useState<Speed>("watch");
  const [open, setOpen] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [decision, setDecision] = useState<"pending" | "approved" | "changes" | "send-blocked">("pending");
  const [feedbackNote, setFeedbackNote] = useState("");
  const timer = useRef(0);
  const traceRef = useRef<HTMLOListElement>(null);

  const corpus = useMemo(() => (poisoned ? new Corpus([...LIBRARY, INJECTION_FIXTURE]) : getCorpus()), [poisoned]);

  const execute = useCallback(
    (q: string, rules: MemoryRule[] = memory) => {
      window.clearTimeout(timer.current);
      const t0 = performance.now();
      const r = runAgent(corpus, q, { memory: rules, budget });
      recordRun(r, performance.now() - t0);
      setRun(r);
      setOpen(null);
      setDecision("pending");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (speed === "instant" || reduce) {
        setShown(r.events.length);
        return;
      }
      setShown(0);
      let i = 0;
      const step = () => {
        i++;
        setShown(i);
        if (i < r.events.length) timer.current = window.setTimeout(step, 180 + (r.events[i]?.type === "tool_result" ? 160 : 0));
      };
      timer.current = window.setTimeout(step, 120);
    },
    [corpus, budget, memory, speed],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (initialQuestion) execute(initialQuestion);
    // Run once on mount when arriving from "Open the full trace".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = traceRef.current;
    if (el && shown > 0) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [shown]);

  const done = run !== null && shown >= run.events.length;
  const visible = run ? run.events.slice(0, shown) : [];
  const ctx = run?.events.find((e) => e.type === "context");
  const brief = run?.brief;
  const totalMs = run ? run.events.reduce((s, e) => s + (eventMs(e) ?? 0), 0) : 0;

  const requestChanges = () => {
    const rules = parseFeedback(feedback, TODAY);
    if (!rules.length) {
      setFeedbackNote("I couldn't turn that into a rule. Try: only case studies, focus on Norway, since 2024, or shorter.");
      return;
    }
    setFeedbackNote("");
    const next = remember(memory, rules);
    setMemory(next);
    setFeedback("");
    setDecision("changes");
    if (run) execute(run.question, next);
  };

  const exportMarkdown = () => {
    if (!brief) return;
    const lines = [
      `# ${brief.question}`,
      "",
      ...brief.sentences.map((s) => `${s.text} ${s.cites.map((n) => `[${n}]`).join("")}`.trim()),
      "",
      "## Sources",
      ...brief.citations.map((c) => `${c.n}. [${c.title}](${c.url}) (${KIND_NAMES[c.kind]}, ${formatMonth(c.date)})`),
      "",
      `_Approved by a researcher. Agent run ${run?.hash}._`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "verian-brief.md";
    a.click();
    URL.revokeObjectURL(a.href);
    setDecision("approved");
  };

  return (
    <div className={styles.console}>
      <div className={styles.consoleTop}>
        <form
          className={styles.askRow}
          onSubmit={(e) => {
            e.preventDefault();
            execute(question);
          }}
        >
          <label htmlFor="lab-question" className="visually-hidden">
            Research question
          </label>
          <input
            id="lab-question"
            className={styles.qInput}
            value={question}
            maxLength={300}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a research question"
          />
          <button className={`btn ${styles.runBtn}`} type="submit">
            Run agent
          </button>
        </form>
        <div className={styles.presets} role="group" aria-label="Example questions">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={styles.preset}
              onClick={() => {
                setQuestion(p.q);
                execute(p.q);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className={styles.options}>
          <label className={styles.toggle}>
            <input type="checkbox" checked={poisoned} onChange={(e) => setPoisoned(e.target.checked)} />
            <span>Plant a poisoned document in the library</span>
          </label>
          <label className={styles.range}>
            <span>Context budget</span>
            <input
              type="range"
              min={800}
              max={3000}
              step={100}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              aria-valuetext={`${budget} tokens`}
            />
            <span className="tnum">{budget.toLocaleString("en-GB")}</span>
          </label>
          <div className={styles.speed} role="radiogroup" aria-label="Replay speed">
            {(["watch", "instant"] as Speed[]).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={speed === s} onClick={() => setSpeed(s)}>
                {s === "watch" ? "Step by step" : "Instant"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.consoleBody}>
        <section className={styles.tracePane} aria-label="Execution trace">
          <div className={styles.paneHead}>
            <span>Execution trace</span>
            {run && (
              <span className={styles.paneMeta}>
                {run.toolCalls} tool calls, {totalMs.toFixed(1)} ms in tools, run {run.hash}
              </span>
            )}
          </div>
          {!run && <p className={styles.empty}>Choose an example or ask your own question, then run the agent.</p>}
          <ol ref={traceRef} className={styles.trace} aria-live="polite">
            {visible.map((e, i) => {
              const d = describeEvent(e, corpus);
              const ms = eventMs(e);
              const hasDetail = d.detail !== undefined && d.detail !== null;
              return (
                <li key={i} className={styles.event} data-tone={d.tone}>
                  <span className={styles.evTag}>{d.tag}</span>
                  <div className={styles.evMain}>
                    {hasDetail ? (
                      <button type="button" className={styles.evTitle} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                        {d.title}
                      </button>
                    ) : (
                      <span className={styles.evTitlePlain}>{d.title}</span>
                    )}
                    {open === i && hasDetail && <pre className={styles.evDetail}>{JSON.stringify(d.detail, null, 2).slice(0, 2400)}</pre>}
                  </div>
                  <span className={styles.evMs}>{ms !== null ? `${ms.toFixed(2)} ms` : ""}</span>
                </li>
              );
            })}
          </ol>
        </section>

        <aside className={styles.side}>
          <section className={styles.sideBlock} aria-label="Context window">
            <h3 className={styles.sideHead}>Context window</h3>
            {ctx && ctx.type === "context" ? (
              <>
                <div className={styles.budgetBar} role="img" aria-label={`${ctx.used} of ${ctx.budget} tokens used`}>
                  {ctx.parts.map((p, i) => (
                    <span key={p.label} style={{ width: `${(p.tokens / ctx.budget) * 100}%` }} data-part={i} title={`${p.label}: ${p.tokens}`} />
                  ))}
                </div>
                <ul role="list" className={styles.budgetKey}>
                  {ctx.parts.map((p, i) => (
                    <li key={p.label} data-part={i}>
                      <span>{p.label}</span>
                      <span className="tnum">{p.tokens}</span>
                    </li>
                  ))}
                </ul>
                {ctx.trimmed.length > 0 && (
                  <p className={styles.sideNote}>
                    {ctx.used > ctx.budget
                      ? "Lowest-ranked sources were dropped, but one source is always kept, so this run is still over budget."
                      : "Lowest-ranked sources were dropped to stay within budget."}
                  </p>
                )}
              </>
            ) : (
              <p className={styles.sideNote}>Shows what the agent would hold in a model&rsquo;s context, against a fixed budget.</p>
            )}
          </section>

          <section className={styles.sideBlock} aria-label="Tools and permissions">
            <h3 className={styles.sideHead}>Tools and permissions</h3>
            <ul role="list" className={styles.tools}>
              {TOOLS.map((t) => {
                const p = POLICY[t.permission];
                const used = run?.events.some((e) => e.type === "tool_call" && e.tool === t.name);
                return (
                  <li key={t.name} data-decision={p.decision} data-used={used}>
                    <code>{t.name}</code>
                    <span>{p.decision === "allowed" ? "allowed" : p.decision === "denied" ? "refused" : "needs approval"}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={styles.sideBlock} aria-label="Reviewer memory">
            <h3 className={styles.sideHead}>Reviewer memory</h3>
            {memory.length ? (
              <ul role="list" className={styles.memory}>
                {memory.map((r) => (
                  <li key={r.id}>
                    <span>{r.label}</span>
                    <button type="button" onClick={() => setMemory(memory.filter((m) => m.id !== r.id))} aria-label={`Forget: ${r.label}`}>
                      Forget
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.sideNote}>Empty. Feedback on a draft becomes rules you can see and delete.</p>
            )}
          </section>
        </aside>
      </div>

      {done && brief && (
        <section className={styles.draft} aria-label="Draft brief">
          <div className={styles.draftHead}>
            <h3 className="h4">Draft for review</h3>
            <span className={styles.draftStatus} data-status={brief.status}>
              {brief.status === "abstained" ? "No answer" : `Confidence: ${brief.confidence}`}
            </span>
          </div>
          <div className={styles.draftBody}>
            {brief.sentences.map((s, i) => {
              const check = run?.checks[i];
              return (
                <p key={i} className={styles.draftSentence} data-check={check?.status}>
                  <span className={styles.checkMark} role={check ? "img" : undefined} aria-hidden={check ? undefined : true} title={check?.reason} aria-label={check ? `Verification: ${check.status}. ${check.reason}` : undefined} />
                  <span>
                    {s.text}{" "}
                    {s.cites.map((n) => (
                      <sup key={n} className={styles.draftCite}>
                        {n}
                      </sup>
                    ))}
                  </span>
                </p>
              );
            })}
          </div>
          {brief.citations.length > 0 && (
            <ol className={styles.draftSources}>
              {brief.citations.map((c) => (
                <li key={c.n}>
                  <a href={c.url} target="_blank" rel="noreferrer">
                    {c.title}
                  </a>{" "}
                  <span>
                    {KIND_NAMES[c.kind]}, {formatMonth(c.date)}
                  </span>
                </li>
              ))}
            </ol>
          )}

          <div className={styles.approval}>
            {decision === "approved" ? (
              <p className={styles.approved}>Approved and exported as Markdown.</p>
            ) : decision === "send-blocked" ? (
              <p className={styles.blocked}>
                Approved. Sending is switched off in this concept; in production, this approval is what would release
                send_to_client.
              </p>
            ) : (
              <>
                <div className={styles.approvalActions}>
                  <button type="button" className="btn btn--small" onClick={exportMarkdown} disabled={brief.status === "abstained"}>
                    Approve and export
                  </button>
                  <button type="button" className={`btn btn--small ${styles.ghostNight}`} onClick={() => setDecision("send-blocked")} disabled={brief.status === "abstained"}>
                    Approve and send to client
                  </button>
                </div>
                <form
                  className={styles.feedback}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (feedback.trim()) requestChanges();
                  }}
                >
                  <label htmlFor="lab-feedback" className={styles.feedbackLabel}>
                    Request changes
                  </label>
                  <div className={styles.feedbackRow}>
                    <input
                      id="lab-feedback"
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="For example: only case studies, focus on Norway, keep it shorter"
                    />
                    <button type="submit" className={`btn btn--small ${styles.ghostNight}`} disabled={!feedback.trim()}>
                      Send back
                    </button>
                  </div>
                  {feedbackNote && (
                    <p className={styles.feedbackNote} role="status">
                      {feedbackNote}
                    </p>
                  )}
                </form>
              </>
            )}
          </div>
        </section>
      )}

      <details className={styles.prompt}>
        <summary>System prompt and tool schemas</summary>
        <pre>{SYSTEM_PROMPT}</pre>
        <pre>{JSON.stringify(TOOLS, null, 2)}</pre>
      </details>
    </div>
  );
}
