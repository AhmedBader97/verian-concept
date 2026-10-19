/**
 * Text processing. Deliberately small and deterministic so that the Python
 * reference implementation (pipeline/engine.py) can match it token for token.
 *
 * Rules (keep in sync with Python):
 *  1. Unicode NFKD, drop combining marks, lowercase.
 *  2. Every character outside [a-z0-9] becomes a space.
 *  3. Split on whitespace; drop tokens shorter than 2 characters.
 *  4. Drop stopwords (lexicon/stopwords.json).
 *  5. Light suffix stemming (stem()).
 */
import stopwordList from "./lexicon/stopwords.json";

const STOP = new Set<string>(stopwordList as string[]);

export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Raw words after normalisation, before stopwords and stemming. */
export function words(text: string): string[] {
  const n = normalize(text);
  if (!n) return [];
  return n.split(/\s+/).filter((w) => w.length >= 2);
}

/**
 * A light, predictable stemmer. The first rule that applies wins. `min` is the
 * minimum length the remaining stem must keep, which stops "news" -> "new".
 */
const RULES: ReadonlyArray<readonly [suffix: string, replacement: string, min: number]> = [
  ["ational", "ate", 3],
  ["ization", "ize", 3],
  ["isation", "ise", 3],
  ["iveness", "ive", 3],
  ["fulness", "ful", 3],
  ["ousness", "ous", 3],
  ["ements", "ement", 3],
  ["ments", "ment", 3],
  ["ities", "ity", 3],
  ["ating", "ate", 3],
  ["ation", "ate", 3],
  ["ings", "", 3],
  ["ing", "", 3],
  ["ies", "y", 3],
  ["sses", "ss", 2],
  ["ness", "", 4],
  ["ches", "ch", 3],
  ["shes", "sh", 3],
  ["xes", "x", 2],
  ["ers", "er", 3],
  ["ed", "", 4],
  ["s", "", 4],
  ["e", "", 4],
];

const KEEP_S = ["ss", "us", "is", "ous"];

function stemOnce(word: string): string {
  if (word.length <= 3 || /^\d+$/.test(word)) return word;
  for (const [suffix, replacement, min] of RULES) {
    if (!word.endsWith(suffix)) continue;
    const base = word.slice(0, word.length - suffix.length);
    if (base.length < min) continue;
    if (suffix === "s" && KEEP_S.some((k) => word.endsWith(k))) return word;
    return base + replacement;
  }
  return word;
}

/**
 * Apply rules until nothing changes (at most four passes), so "evaluations" ->
 * "evaluation" -> "evaluate" -> "evaluat", "preparedness" -> "prepar", and
 * "police" and "policing" both become "polic".
 */
export function stem(word: string): string {
  let w = word;
  for (let i = 0; i < 4; i++) {
    const next = stemOnce(w);
    if (next === w) break;
    w = next;
  }
  return w;
}

export function isStopword(word: string): boolean {
  return STOP.has(word);
}

/** Tokens used for indexing and querying. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const w of words(text)) {
    if (STOP.has(w)) continue;
    out.push(stem(w));
  }
  return out;
}

/** Rough token estimate for budgeting model context (about 4 characters per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Damerau–Levenshtein (optimal string alignment) distance, capped for speed. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const m = a.length;
  const n = b.length;
  let prev2: number[] = new Array(n + 1).fill(0);
  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur: number[] = new Array(n + 1).fill(0);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2]! + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n]!;
}
