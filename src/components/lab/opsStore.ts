/**
 * A tiny in-memory monitor for this browser session: every agent run on the
 * site reports here, and the Lab's monitoring panel reads it. Nothing leaves
 * the browser; questions are stored only after personal data is removed.
 */
import { useSyncExternalStore } from "react";
import type { AgentRun } from "@/engine/agent/harness";

export interface OpsRecord {
  at: number;
  question: string; // already redacted
  status: "answered" | "abstained";
  ms: number;
  toolCalls: number;
  denied: number;
  quarantined: number;
  contextUsed: number;
}

let records: OpsRecord[] = [];
const listeners = new Set<() => void>();

export function recordRun(run: AgentRun, ms: number) {
  const guard = run.events.find((e) => e.type === "guard");
  const question = guard && guard.type === "guard" ? guard.text : run.question;
  records = [
    ...records.slice(-199),
    {
      at: Date.now(),
      question,
      status: run.brief.status,
      ms,
      toolCalls: run.toolCalls,
      denied: run.events.filter((e) => e.type === "policy" && e.decision === "denied").length,
      quarantined: run.events.filter((e) => e.type === "quarantine").length,
      contextUsed: run.contextUsed,
    },
  ];
  listeners.forEach((l) => l());
}

export function clearRuns() {
  records = [];
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const EMPTY: OpsRecord[] = [];

export function useOps(): OpsRecord[] {
  return useSyncExternalStore(
    subscribe,
    () => records,
    () => EMPTY,
  );
}
