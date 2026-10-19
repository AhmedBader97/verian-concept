import type { Item, Kind } from "@/engine/types";

/**
 * A generative mark for each library item, used instead of stock photography.
 * Colour encodes the type of item; the pattern is seeded by the item's id, so
 * every piece of work has its own recognisable glyph; density grows with the
 * number of topics it is tagged with.
 */
export const KIND_COLOR: Record<Kind, string> = {
  "case-study": "var(--cobalt)",
  insight: "var(--viridian)",
  report: "var(--marigold)",
  news: "var(--ink-2)",
  event: "var(--ink)",
  webinar: "var(--ink)",
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Props {
  item: Pick<Item, "id" | "kind" | "topics">;
  size?: number;
  cells?: number;
  className?: string;
}

export function EvidenceGlyph({ item, size = 56, cells = 4, className }: Props) {
  const rand = seeded(hash(item.id));
  const color = KIND_COLOR[item.kind];
  const density = Math.min(0.62, 0.3 + item.topics.length * 0.08);
  const tris: { d: string; fill: boolean; tone: number }[] = [];
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const flip = rand() > 0.5;
      const a = flip
        ? `M${x} ${y}L${x + 1} ${y}L${x} ${y + 1}Z`
        : `M${x} ${y}L${x + 1} ${y}L${x + 1} ${y + 1}Z`;
      const b = flip
        ? `M${x + 1} ${y}L${x + 1} ${y + 1}L${x} ${y + 1}Z`
        : `M${x} ${y}L${x + 1} ${y + 1}L${x} ${y + 1}Z`;
      tris.push({ d: a, fill: rand() < density, tone: rand() });
      tris.push({ d: b, fill: rand() < density, tone: rand() });
    }
  }
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${cells} ${cells}`}
      aria-hidden
      shapeRendering="geometricPrecision"
    >
      <rect width={cells} height={cells} fill="var(--paper-raised)" />
      {tris.map((t, i) =>
        t.fill ? <path key={i} d={t.d} fill={color} opacity={0.35 + t.tone * 0.65} /> : null,
      )}
      <rect width={cells} height={cells} fill="none" stroke="var(--rule)" strokeWidth={cells / size} />
    </svg>
  );
}
