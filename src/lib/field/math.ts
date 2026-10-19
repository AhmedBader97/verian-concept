/** Small numeric helpers for the field: seeded randomness, colour mixing, projection. */

/** Largest-remainder rounding, so the three shares always add up to exactly 100%. */
export function percentages(v: [number, number, number]): [number, number, number] {
  const raw = v.map((x) => x * 100);
  const floor = raw.map(Math.floor);
  let left = 100 - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) if (left-- > 0) floor[i]!++;
  return floor as [number, number, number];
}


/** Mulberry32: tiny, fast, seeded PRNG so every visit draws the same field. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  /** Marsaglia–Tsang gamma sampler (shape > 0, scale 1). */
  const gamma = (shape: number): number => {
    if (shape < 1) return gamma(shape + 1) * Math.pow(next(), 1 / shape);
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x = 0;
      let v = 0;
      do {
        x = gauss();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = next();
      if (u < 1 - 0.0331 * x ** 4) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  const dirichlet = (alpha: [number, number, number]): [number, number, number] => {
    const g = alpha.map(gamma) as [number, number, number];
    const s = g[0] + g[1] + g[2];
    return [g[0] / s, g[1] / s, g[2] / s];
  };
  return { next, gauss, gamma, dirichlet };
}

/* ---------- colour: mix in OKLab so blends stay vivid and even ---------- */

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklab([r, g, b]: RGB): RGB {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb([L, A, B]: RGB): RGB {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [r, g, b].map((c) => Math.min(1, Math.max(0, toSrgb(c)))) as RGB;
}

/** Weighted blend of several colours in OKLab. Weights should sum to 1. */
export function mixOklab(colors: RGB[], weights: number[]): RGB {
  const labs = colors.map(rgbToOklab);
  const out: RGB = [0, 0, 0];
  labs.forEach((lab, i) => {
    out[0] += lab[0] * weights[i]!;
    out[1] += lab[1] * weights[i]!;
    out[2] += lab[2] * weights[i]!;
  });
  return oklabToRgb(out);
}

/* ---------- Equal Earth projection (Šavrič, Patterson & Jenny, 2018) ---------- */

const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;

export function equalEarth(lonDeg: number, latDeg: number): [number, number] {
  const lam = (lonDeg * Math.PI) / 180;
  const phi = (latDeg * Math.PI) / 180;
  const t = Math.asin(M * Math.sin(phi));
  const t2 = t * t;
  const t6 = t2 * t2 * t2;
  const x = (lam * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [x, y];
}

export interface MapBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** Project lon/lat into the normalised [0,1] space used by world-dots.json. */
export function projectNormalised(lon: number, lat: number, b: MapBounds): [number, number] {
  const [x, y] = equalEarth(lon, lat);
  return [(x - b.xMin) / (b.xMax - b.xMin), (b.yMax - y) / (b.yMax - b.yMin)];
}
