/**
 * Reviewer memory. When a researcher sends a draft back with feedback, the
 * agent turns the feedback into explicit, inspectable rules and applies them
 * on the next run. Rules are shown to the user and can be deleted: memory the
 * user cannot see or edit is memory they cannot trust.
 */
import aliasData from "../lexicon/aliases.json";
import { normalize } from "../text";
import type { Filters, Kind } from "../types";

export type MemoryRule =
  | { id: string; kind: "kinds"; kinds: Kind[]; label: string }
  | { id: string; kind: "country"; country: string; label: string }
  | { id: string; kind: "since"; since: string; label: string }
  | { id: string; kind: "length"; max: number; label: string };

const KIND_PHRASES: ReadonlyArray<readonly [RegExp, Kind[], string]> = [
  [/\bcase stud(y|ies)\b/, ["case-study"], "Only case studies"],
  [/\b(insights?|reports?|articles?)\b/, ["insight", "report"], "Only insights and reports"],
  [/\b(events?|webinars?)\b/, ["event", "webinar"], "Only events and webinars"],
];

export function parseFeedback(feedback: string, today: string): MemoryRule[] {
  const text = normalize(feedback);
  const rules: MemoryRule[] = [];
  const restrictive = /\b(only|just|exclusively|focus|stick to|limit)\b/.test(text);

  if (restrictive) {
    for (const [re, kinds, label] of KIND_PHRASES) {
      if (re.test(text)) {
        // One slot per kind of rule: a newer "only insights" replaces "only case studies".
        rules.push({ id: "kinds", kind: "kinds", kinds, label });
        break;
      }
    }
  }

  for (const [country, aliases] of Object.entries(aliasData.countries as Record<string, string[]>)) {
    const names = [country, ...aliases].map((a) => normalize(a));
    if (names.some((n) => new RegExp(`\\b${n}\\b`).test(text))) {
      rules.push({ id: "country", kind: "country", country, label: `Focus on ${country}` });
      break;
    }
  }

  const sinceYear = text.match(/\b(since|from|after)\s+(20\d\d)\b/);
  if (sinceYear) {
    rules.push({ id: "since", kind: "since", since: `${sinceYear[2]}-01-01`, label: `Published since ${sinceYear[2]}` });
  } else if (/\b(recent|latest|newest|this year|last year|past year|last 12 months)\b/.test(text)) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    const since = d.toISOString().slice(0, 10);
    rules.push({ id: "since", kind: "since", since, label: "Published in the last 12 months" });
  }

  if (/\b(more detail|more sources|more examples|go deeper|longer)\b/.test(text)) {
    rules.push({ id: "length", kind: "length", max: 6, label: "Cite up to six sources" });
  } else if (/\b(shorter|brief|briefer|fewer|too long|concise)\b/.test(text)) {
    rules.push({ id: "length", kind: "length", max: 3, label: "Keep it to three sources" });
  }

  return rules;
}

/** New rules replace older rules of the same id. */
export function remember(existing: MemoryRule[], incoming: MemoryRule[]): MemoryRule[] {
  const map = new Map(existing.map((r) => [r.id, r]));
  for (const r of incoming) map.set(r.id, r);
  return [...map.values()];
}

export function applyMemory(rules: MemoryRule[]): { filters: Filters; max: number } {
  const filters: Filters = {};
  let max = 4;
  for (const r of rules) {
    if (r.kind === "kinds") filters.kinds = r.kinds;
    if (r.kind === "country") filters.countries = [r.country];
    if (r.kind === "since") filters.since = r.since;
    if (r.kind === "length") max = r.max;
  }
  return { filters, max };
}
