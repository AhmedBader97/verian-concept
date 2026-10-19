/**
 * Formations for the home-page field. Every point keeps its identity across
 * formations; the shader interpolates between them as you scroll.
 *
 *   0  ternary   points inside the triangle, placed by their mix of data,
 *                technology and citizen insight (a ternary plot)
 *   1  listen    a broad, even population
 *   2  measure   twelve sample blocks
 *   3  understand five segments, coloured by their mix
 *   4  decide    a solid triangle — the most stable shape there is
 *   5  world     a dot-matrix world map (Equal Earth projection)
 *   6  region    a zoomed region of the map (rebuilt on demand)
 */
import worldDots from "@/data/world-dots.json";
import { hexToRgb, oklabToRgb, rgbToOklab, rng } from "./math";

export type Vec2 = [number, number];
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface Tri {
  A: Vec2; // bottom left: data
  B: Vec2; // bottom right: technology
  C: Vec2; // top: citizen insight
}

export interface FieldLayout {
  mobile: boolean;
  /**
   * Phones with little room under the headline: the canvas starts this many
   * pixels lower and glides up into place over the first scroll, so the
   * triangle never sits under the copy.
   */
  stick: number;
  W: number;
  H: number;
  hero: Tri;
  panel: Rect;
  mark: Tri;
  map: Rect;
}

export const CORNERS = {
  data: "#2d55c8",
  technology: "#12877a",
  citizen: "#e09a2b",
} as const;

export const MAP_ASPECT = worldDots.aspect;

function triangle(cx: number, cy: number, side: number): Tri {
  const h = (side * Math.sqrt(3)) / 2;
  return {
    A: [cx - side / 2, cy + h / 3],
    B: [cx + side / 2, cy + h / 3],
    C: [cx, cy - (2 * h) / 3],
  };
}

/**
 * @param safeTop On phones, the y position (px) below which the hero triangle
 * may be drawn, so it never sits under the headline and buttons.
 */
export function computeLayout(W: number, H: number, safeTop = 0): FieldLayout {
  const mobile = W < 900;
  if (!mobile) {
    const side = Math.min(0.44 * W, (0.7 * H) / 0.866, 760);
    const cx = Math.min(0.72 * W, W - side / 2 - 0.085 * W);
    const hero = triangle(cx, 0.56 * H, side);
    const panel: Rect = { x0: 0.5 * W, y0: 0.16 * H, x1: 0.95 * W, y1: 0.88 * H };
    const pw = panel.x1 - panel.x0;
    const ph = panel.y1 - panel.y0;
    const markSide = Math.min(pw * 0.62, (ph * 0.78) / 0.866);
    const mark = triangle(panel.x0 + pw / 2, panel.y0 + ph / 2 + markSide * 0.06, markSide);
    let mw = Math.min(0.9 * W, 1500);
    let mh = mw / MAP_ASPECT;
    if (mh > 0.6 * H) {
      mh = 0.6 * H;
      mw = mh * MAP_ASPECT;
    }
    const my0 = Math.max(0.3 * H, H - mh - 0.07 * H);
    const map: Rect = { x0: (W - mw) / 2, y0: my0, x1: (W + mw) / 2, y1: my0 + mh };
    return { mobile, W, H, stick: 0, hero, panel, mark, map };
  }
  // Fit the triangle between the hero copy and the bottom edge, leaving room
  // for the corner labels and the concept label. If there isn't room for a
  // legible triangle, keep the size and let the canvas start lower (stick).
  const base = H - 96;
  const top = Math.max(safeTop + 56, 0.4 * H);
  const side = Math.max(230, Math.min(0.74 * W, 320, (base - top) / 0.866));
  const h = side * 0.866;
  const stick = Math.max(0, top - (base - h));
  const hero = triangle(W / 2, base - h / 3, side);
  const panel: Rect = { x0: 0.05 * W, y0: 0.1 * H, x1: 0.95 * W, y1: 0.5 * H };
  const pw = panel.x1 - panel.x0;
  const ph = panel.y1 - panel.y0;
  const markSide = Math.min(pw * 0.7, (ph * 0.86) / 0.866);
  const mark = triangle(W / 2, panel.y0 + ph / 2 + markSide * 0.05, markSide);
  const mw = 0.96 * W;
  const mh = mw / MAP_ASPECT;
  const map: Rect = { x0: 0.02 * W, y0: 0.4 * H, x1: 0.98 * W, y1: 0.4 * H + mh };
  return { mobile, W, H, stick, hero, panel, mark, map };
}

export interface Formations {
  n: number;
  pos: Float32Array[]; // 7 arrays of n*2
  color: Float32Array; // n*3
  rand: Float32Array; // n*4: delay, phase, size jitter, spare
  vis: Float32Array; // n*2: visible on world map, visible on region map
  composition: Float32Array; // n*3, for readouts
}

const SEED = 20231109; // the day Kantar Public became Verian

export function buildFormations(n: number, L: FieldLayout): Formations {
  const r = rng(SEED);
  const pos = Array.from({ length: 7 }, () => new Float32Array(n * 2));
  const color = new Float32Array(n * 3);
  const rand = new Float32Array(n * 4);
  const vis = new Float32Array(n * 2);
  const comp = new Float32Array(n * 3);
  const labs = [CORNERS.data, CORNERS.technology, CORNERS.citizen].map((c) => rgbToOklab(hexToRgb(c)));

  // ---- 0: ternary field --------------------------------------------------
  const mixture: Array<{ w: number; a: [number, number, number] }> = [
    { w: 0.4, a: [2.4, 2.4, 2.4] },
    { w: 0.2, a: [7, 1.6, 1.3] },
    { w: 0.2, a: [1.3, 7, 1.6] },
    { w: 0.2, a: [1.6, 1.3, 7] },
  ];
  const { A, B, C } = L.hero;
  for (let i = 0; i < n; i++) {
    let u = r.next();
    let k = 0;
    while (k < mixture.length - 1 && u > mixture[k]!.w) {
      u -= mixture[k]!.w;
      k++;
    }
    const [a, b, c] = r.dirichlet(mixture[k]!.a);
    comp[i * 3] = a;
    comp[i * 3 + 1] = b;
    comp[i * 3 + 2] = c;
    pos[0]![i * 2] = a * A[0] + b * B[0] + c * C[0];
    pos[0]![i * 2 + 1] = a * A[1] + b * B[1] + c * C[1];
    const rgb = oklabToRgb([
      labs[0]![0] * a + labs[1]![0] * b + labs[2]![0] * c,
      labs[0]![1] * a + labs[1]![1] * b + labs[2]![1] * c,
      labs[0]![2] * a + labs[1]![2] * b + labs[2]![2] * c,
    ]);
    color[i * 3] = rgb[0];
    color[i * 3 + 1] = rgb[1];
    color[i * 3 + 2] = rgb[2];
    rand[i * 4] = r.next();
    rand[i * 4 + 1] = r.next();
    rand[i * 4 + 2] = r.next();
    rand[i * 4 + 3] = r.next();
  }

  // ---- 1: listen — an even, organic population with a soft edge ---------
  const P = L.panel;
  const pw = P.x1 - P.x0;
  const ph = P.y1 - P.y0;
  const lcx = P.x0 + pw / 2;
  const lcy = P.y0 + ph / 2;
  const rx = pw / 2;
  const ry = ph / 2;
  // Jittered lattice over the bounding box; keep cells inside a wobbly ellipse.
  // Grow the lattice until it holds enough cells.
  let lattice: Vec2[] = [];
  for (let density = 1.3; lattice.length < n; density *= 1.08) {
    lattice = [];
    const cols = Math.ceil(Math.sqrt((n * density * pw) / ph));
    const rows = Math.ceil((n * density) / cols);
    const cellW = pw / cols;
    const cellH = ph / rows;
    const lr = rng(SEED + 1);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = P.x0 + (x + 0.15 + 0.7 * lr.next()) * cellW;
        const py = P.y0 + (y + 0.15 + 0.7 * lr.next()) * cellH;
        const ang = Math.atan2((py - lcy) / ry, (px - lcx) / rx);
        const edge = 0.94 + 0.06 * Math.sin(ang * 3 + 0.7) + 0.035 * Math.sin(ang * 7 + 2.1);
        const d = Math.hypot((px - lcx) / rx, (py - lcy) / ry);
        if (d < edge - 0.08 * lr.next()) lattice.push([px, py]);
      }
    }
  }
  // Points are assigned to lattice cells in a shuffled order so the dispersal reads as scattering.
  const order1 = shuffled(lattice.length, r.next);
  for (let i = 0; i < n; i++) {
    const p = lattice[order1[i]!]!;
    pos[1]![i * 2] = p[0];
    pos[1]![i * 2 + 1] = p[1];
  }

  // ---- 2: measure — twelve sample blocks ---------------------------------
  const bCols = L.mobile ? 3 : 4;
  const bRows = 12 / bCols;
  const gap = Math.min(pw, ph) * 0.05;
  const bw = (pw - gap * (bCols - 1)) / bCols;
  const bh = (ph - gap * (bRows - 1)) / bRows;
  const perBlock = Math.ceil(n / 12);
  const inCols = Math.ceil(Math.sqrt((perBlock * bw) / bh));
  const inRows = Math.ceil(perBlock / inCols);
  // Order points by their listen-position (row-major), so neighbours stay neighbours.
  const byListen = [...Array(n).keys()].sort((p, q) => {
    const ry = Math.floor((pos[1]![p * 2 + 1]! - P.y0) / (ph / bRows)) - Math.floor((pos[1]![q * 2 + 1]! - P.y0) / (ph / bRows));
    if (ry !== 0) return ry;
    return pos[1]![p * 2]! - pos[1]![q * 2]!;
  });
  byListen.forEach((idx, j) => {
    const block = Math.min(11, Math.floor(j / perBlock));
    const within = j - block * perBlock;
    const bx = block % bCols;
    const by = Math.floor(block / bCols);
    const cx = within % inCols;
    const cy = Math.floor(within / inCols);
    pos[2]![idx * 2] = P.x0 + bx * (bw + gap) + ((cx + 0.5) / inCols) * bw;
    pos[2]![idx * 2 + 1] = P.y0 + by * (bh + gap) + ((cy + 0.5) / inRows) * bh;
  });

  // ---- 3: understand — five segments, by mix -----------------------------
  const seg = new Uint8Array(n);
  const counts = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = comp[i * 3]!;
    const b = comp[i * 3 + 1]!;
    const c = comp[i * 3 + 2]!;
    const m = Math.max(a, b, c);
    const s = m > 0.55 ? (a === m ? 0 : b === m ? 1 : 2) : m < 0.42 ? 3 : 4;
    seg[i] = s;
    counts[s]!++;
  }
  const pcx = P.x0 + pw / 2;
  const pcy = P.y0 + ph / 2;
  const spread = Math.min(pw, ph);
  const centres: Vec2[] = L.mobile
    ? [
        [pcx - pw * 0.3, pcy + ph * 0.18],
        [pcx + pw * 0.3, pcy + ph * 0.22],
        [pcx, pcy - ph * 0.28],
        [pcx - pw * 0.02, pcy + ph * 0.02],
        [pcx + pw * 0.3, pcy - ph * 0.12],
      ]
    : [
        [pcx - pw * 0.28, pcy + ph * 0.2],
        [pcx + pw * 0.3, pcy + ph * 0.22],
        [pcx - pw * 0.04, pcy - ph * 0.28],
        [pcx + 0.0, pcy + ph * 0.04],
        [pcx + pw * 0.3, pcy - ph * 0.16],
      ];
  for (let i = 0; i < n; i++) {
    const s = seg[i]!;
    const sigma = spread * 0.085 * Math.sqrt(counts[s]! / (n / 5));
    let gx = r.gauss();
    let gy = r.gauss();
    while (Math.hypot(gx, gy) > 2.4) {
      gx = r.gauss();
      gy = r.gauss();
    }
    pos[3]![i * 2] = centres[s]![0] + gx * sigma;
    pos[3]![i * 2 + 1] = centres[s]![1] + gy * sigma;
  }

  // ---- 4: decide — a solid triangle on a fine lattice -----------------------
  const M = L.mark;
  const side = M.B[0] - M.A[0];
  const spacing = Math.sqrt((side * side * 0.433) / n);
  const tri: Vec2[] = [];
  const h = side * 0.866;
  for (let yy = 0; yy <= h; yy += spacing * 0.866) {
    const rowW = (yy / h) * side;
    const y = M.C[1] + yy;
    const count = Math.max(1, Math.floor(rowW / spacing));
    const start = M.C[0] - ((count - 1) * spacing) / 2;
    for (let k = 0; k < count; k++) tri.push([start + k * spacing, y]);
  }
  const byAngle = [...Array(n).keys()].sort((p, q) => pos[3]![p * 2]! - pos[3]![q * 2]!);
  const triSorted = tri.sort((p, q) => p[0] - q[0]);
  byAngle.forEach((idx, j) => {
    const p = triSorted[Math.floor((j * triSorted.length) / n)]!;
    pos[4]![idx * 2] = p[0];
    pos[4]![idx * 2 + 1] = p[1];
  });

  // ---- 5: world map -------------------------------------------------------
  placeOnMap(worldDots.world, [0, 0, 1, 1], L.map, pos[4]!, pos[5]!, vis, 0, n, r.next);
  // Region slot starts as a copy of the world map.
  pos[6]!.set(pos[5]!);
  for (let i = 0; i < n; i++) vis[i * 2 + 1] = vis[i * 2]!;

  return { n, pos, color, rand, vis, composition: comp };
}

/**
 * Assign points to map dots, sweeping left to right from their previous
 * formation so the transition reads as one coherent motion. Points beyond the
 * number of dots double up on a dot and are hidden.
 */
export function placeOnMap(
  dots: number[],
  box: [number, number, number, number],
  rect: Rect,
  from: Float32Array,
  into: Float32Array,
  vis: Float32Array,
  visSlot: 0 | 1,
  n: number,
  random: () => number,
) {
  const [bx0, by0, bx1, by1] = box;
  const count = dots.length / 2;
  const targets: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const nx = (dots[i * 2]! - bx0) / (bx1 - bx0);
    const ny = (dots[i * 2 + 1]! - by0) / (by1 - by0);
    targets.push([rect.x0 + nx * (rect.x1 - rect.x0), rect.y0 + ny * (rect.y1 - rect.y0)]);
  }
  targets.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const order = [...Array(n).keys()].sort((p, q) => from[p * 2]! - from[q * 2]!);
  const visible = Math.min(n, count);
  // Spread the visible points evenly through the sweep order, and when there
  // are more dots than points, sample the dots evenly too.
  const visibleSet = new Uint8Array(n);
  for (let k = 0; k < visible; k++) visibleSet[order[Math.floor((k * n) / visible)]!] = 1;
  let k = 0;
  order.forEach((idx) => {
    if (visibleSet[idx]) {
      const p = targets[Math.floor((k++ * count) / visible)]!;
      into[idx * 2] = p[0];
      into[idx * 2 + 1] = p[1];
      vis[idx * 2 + visSlot] = 1;
    } else {
      const p = targets[Math.floor(random() * count)]!;
      into[idx * 2] = p[0];
      into[idx * 2 + 1] = p[1];
      vis[idx * 2 + visSlot] = 0;
    }
  });
}

function shuffled(n: number, random: () => number): number[] {
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Barycentric coordinates of a point in the hero triangle (for the readout). */
export function barycentric(p: Vec2, t: Tri): [number, number, number] | null {
  const [x, y] = p;
  const [x1, y1] = t.A;
  const [x2, y2] = t.B;
  const [x3, y3] = t.C;
  const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
  const a = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / det;
  const b = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / det;
  const c = 1 - a - b;
  if (a < 0 || b < 0 || c < 0) return null;
  return [a, b, c];
}
