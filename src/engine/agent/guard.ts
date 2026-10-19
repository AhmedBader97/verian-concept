/**
 * Guards that run before anything is logged or acted on.
 *
 * redact():   removes personal data from text before it reaches the trace or logs
 * scanForInstructions(): flags text inside retrieved documents that tries to
 *             instruct the agent. Retrieved content is data, never commands.
 */

export interface Redaction {
  type: "email" | "phone" | "ni-number" | "postcode" | "card" | "date" | "address";
  count: number;
}

/**
 * Contact details and identifiers that follow a pattern. Names do not, so they
 * are not detected yet: that needs a named-entity model, not a regular expression.
 */
const PATTERNS: ReadonlyArray<readonly [Redaction["type"], RegExp, string]> = [
  ["email", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email removed]"],
  ["ni-number", /\b[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi, "[NI number removed]"],
  ["card", /\b(?:\d[ -]?){13,19}\b/g, "[card number removed]"],
  ["phone", /(?:\+\d{1,3}[\s-]?|\b0)(?:\d[\s-]?){8,12}\d\b/g, "[phone removed]"],
  ["date", /\b\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)\d{2}\b/g, "[date removed]"],
  [
    "address",
    /\b\d{1,4}[a-z]?\s+(?:[A-Z][a-z]+\s+){1,3}(?:Road|Rd|Street|St|Lane|Avenue|Ave|Close|Way|Drive|Place|Court|Gardens|Crescent|Terrace|Square|Grove|Rise|Row|Walk|Mews|Parade)\b/g,
    "[address removed]",
  ],
  ["postcode", /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi, "[postcode removed]"],
];

export function redact(text: string): { text: string; redactions: Redaction[] } {
  let out = text;
  const redactions: Redaction[] = [];
  for (const [type, re, replacement] of PATTERNS) {
    let count = 0;
    out = out.replace(re, () => {
      count++;
      return replacement;
    });
    if (count) redactions.push({ type, count });
  }
  return { text: out, redactions };
}

const INSTRUCTION_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["tries to override instructions", /\b(ignore|disregard|forget)\b[^.]{0,40}\b(previous|prior|above|earlier|all)\b[^.]{0,20}\b(instructions?|prompts?|rules?)\b/i],
  ["claims a new role", /\byou are now\b|\bact as\b|\bnew instructions?\b/i],
  ["mentions the system prompt", /\bsystem prompt\b|<\/?(system|instructions?)>/i],
  ["asks to send data", /\b(send|email|forward|upload|post)\b[^.]{0,60}\b(to|at)\b[^.]{0,40}(@|https?:\/\/|\bclient list\b|\bcontacts?\b)/i],
  ["asks for secrets", /\b(api key|password|credentials?|token)\b/i],
];

export function scanForInstructions(text: string): string[] {
  return INSTRUCTION_PATTERNS.filter(([, re]) => re.test(text)).map(([label]) => label);
}
