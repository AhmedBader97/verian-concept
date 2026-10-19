"use client";

import { useEffect, useRef, useState } from "react";
import { barycentric, CORNERS, computeLayout, type FieldLayout } from "@/lib/field/formations";
import { percentages } from "@/lib/field/math";
import { useField } from "./FieldContext";
import styles from "./Hero.module.css";

const LABELS = [
  { key: "data", name: "Data", color: CORNERS.data },
  { key: "technology", name: "Technology", color: CORNERS.technology },
  { key: "citizen", name: "Citizen insight", color: CORNERS.citizen },
] as const;

/**
 * Corner labels for the ternary field, and a live readout of the mix under
 * the pointer. When WebGL is unavailable, draws a quiet static triangle.
 */
export function HeroOverlay() {
  const { layout, mode } = useField();
  const [fallbackLayout, setFallbackLayout] = useState<FieldLayout | null>(null);
  const [mix, setMix] = useState<{ x: number; y: number; v: [number, number, number] } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === "fallback") setFallbackLayout(computeLayout(window.innerWidth, window.innerHeight));
  }, [mode]);

  const L = layout ?? fallbackLayout;

  useEffect(() => {
    if (!L || mode !== "webgl") return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || window.scrollY > 40) {
        setMix(null);
        return;
      }
      const v = barycentric([e.clientX, e.clientY], L.hero);
      setMix(v ? { x: e.clientX, y: e.clientY, v } : null);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [L, mode]);

  if (!L) return null;
  // Labels live in the document, so on phones they start where the canvas starts.
  const shift = (p: readonly [number, number]): [number, number] => [p[0], p[1] + (L.stick ?? 0)];
  const A = shift(L.hero.A);
  const B = shift(L.hero.B);
  const C = shift(L.hero.C);
  const pts = [A, B, C];

  return (
    <div ref={ref} className={styles.overlay} data-ready={mode === "webgl" || mode === "fallback"}>
      {mode === "fallback" && (
        <svg className={styles.fallback} width={L.W} height={L.H} aria-hidden>
          <polygon
            points={pts.map((p) => p.join(",")).join(" ")}
            fill="color-mix(in oklab, var(--cobalt) 8%, transparent)"
            stroke="var(--ink-3)"
            strokeWidth="1"
          />
        </svg>
      )}
      {LABELS.map((label, i) => {
        const p = pts[i]!;
        return (
          <span
            key={label.key}
            className={styles.corner}
            data-corner={label.key}
            style={{ left: p[0], top: p[1], ["--dot" as string]: label.color }}
          >
            {label.name}
          </span>
        );
      })}
      <p className={styles.caption} style={{ left: (A[0] + B[0]) / 2, top: A[1] + (L.mobile ? 34 : 48) }}>
        We work where data, technology and citizen insight meet.
        {!L.mobile && <span> Point anywhere in the field to read its mix.</span>}
      </p>
      {mix && (
        <div className={styles.readout} style={{ transform: `translate(${mix.x + 18}px, ${mix.y + 18}px)` }} aria-hidden>
          {LABELS.map((label, i) => (
            <span key={label.key} className={styles.readRow} style={{ ["--dot" as string]: label.color }}>
              <span className={styles.readName}>{label.name}</span>
              <span className="tnum">{percentages(mix.v)[i]}%</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
