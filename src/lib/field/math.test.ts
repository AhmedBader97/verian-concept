import { describe, expect, it } from "vitest";
import { equalEarth, mixOklab, hexToRgb, percentages, rng } from "./math";

describe("field maths", () => {
  it("rounds shares to exactly 100%", () => {
    expect(percentages([0.3, 0.33, 0.37])).toEqual([30, 33, 37]);
    expect(percentages([0.299, 0.333, 0.368]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(percentages([1 / 3, 1 / 3, 1 / 3]).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("draws the same field every time", () => {
    const a = rng(42);
    const b = rng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
  it("Dirichlet samples are valid mixtures", () => {
    const r = rng(7);
    for (let i = 0; i < 200; i++) {
      const [x, y, z] = r.dirichlet([2, 2, 2]);
      expect(x + y + z).toBeCloseTo(1, 12);
      expect(Math.min(x, y, z)).toBeGreaterThanOrEqual(0);
    }
  });
  it("mixing a colour with itself returns it", () => {
    const c = hexToRgb("#2d55c8");
    mixOklab([c, c], [0.5, 0.5]).forEach((v, i) => expect(v).toBeCloseTo(c[i]!, 6));
  });
  it("Equal Earth puts Greenwich and the equator at the origin", () => {
    expect(equalEarth(0, 0)).toEqual([0, 0]);
    const [x] = equalEarth(180, 0);
    expect(x).toBeCloseTo(2.7066, 3);
  });
});
