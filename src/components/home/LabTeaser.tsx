"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { runAgent, type AgentRun, type TraceEvent } from "@/engine/agent/harness";
import { getCorpus } from "@/data/library";
import styles from "./HomeSections.module.css";

const QUESTION = "What has Verian found about young people and crises?";

function line(e: TraceEvent): { tag: string; text: string; tone?: "ok" | "warn" | "stop" } | null {
  switch (e.type) {
    case "plan":
      return { tag: "plan", text: `${e.steps.length} steps, linked ${e.entities.map((x) => x.label).join(", ") || "no topics"}` };
    case "tool_call":
      return { tag: "call", text: `${e.tool}(${Object.keys(e.input).join(", ")})` };
    case "tool_result":
      return { tag: "result", text: e.summary };
    case "rewrite":
      return { tag: "rewrite", text: e.detail };
    case "context":
      return { tag: "context", text: `${e.used} of ${e.budget} tokens` };
    case "verify":
      return { tag: "verify", text: `${e.checks.filter((c) => c.status === "supported").length}/${e.checks.length} supported`, tone: "ok" };
    case "approval":
      return { tag: "human", text: "waiting for a researcher to approve", tone: "warn" };
    case "policy":
      return { tag: "policy", text: `${e.tool}: ${e.decision}`, tone: e.decision === "denied" ? "stop" : "warn" };
    default:
      return null;
  }
}

/** A real trace from the in-browser agent, replayed line by line. */
export function LabTeaser() {
  // The agent runs only when this section comes into view, not during page load.
  const [run, setRun] = useState<AgentRun | null>(null);
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const lines = run ? (run.events.map(line).filter(Boolean) as NonNullable<ReturnType<typeof line>>[]) : [];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        const r = runAgent(getCorpus(), QUESTION, { now: () => 0 });
        const total = r.events.map(line).filter(Boolean).length;
        setRun(r);
        if (reduce) {
          setShown(total);
          return;
        }
        let i = 0;
        const step = () => {
          i++;
          setShown(i);
          if (i < total) timer = window.setTimeout(step, 260 + Math.random() * 180);
        };
        timer = window.setTimeout(step, 300);
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <section className={`section ${styles.night}`} aria-labelledby="lab-title">
      <div className="container">
        <div className={styles.labGrid}>
          <div className={styles.labText}>
            <h2 id="lab-title" className="h2">
              Research AI that shows its working
            </h2>
            <p className={styles.labLede}>
              A concept for how Verian could put AI in front of researchers: it cites every claim, says when the evidence is
              thin, asks before anything leaves the building, and logs each step so a person can check it.
            </p>
            <ul role="list" className={styles.labPoints}>
              <li>Compares five retrieval designs, from keyword search to an agentic loop, on the same questions</li>
              <li>Measures quality, speed and cost live in your browser</li>
              <li>Tested against prompt injection, personal data and questions it can&rsquo;t answer</li>
            </ul>
            <Link className={`btn ${styles.labBtn}`} href="/lab/">
              Open the AI Lab
            </Link>
          </div>
          <div className={styles.console} ref={ref}>
            <div className={styles.consoleBar}>
              <span>Agent trace</span>
              <span className={styles.consoleHash}>{run ? `run ${run.hash}` : "ready"}</span>
            </div>
            <p className={styles.consoleQ}>{QUESTION}</p>
            <ol role="list" className={styles.consoleLines} aria-label="Trace">
              {lines.map((l, i) => (
                <li key={i} data-shown={i < shown} data-tone={l.tone}>
                  <span className={styles.consoleTag}>{l.tag}</span>
                  <span>{l.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
