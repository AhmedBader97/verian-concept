"use client";

import Link from "next/link";
import { useState } from "react";
import { EXPERTISE } from "@/data/expertise";
import styles from "./Expertise.module.css";

const STAGES = [
  { name: "Understand", line: "What is happening, to whom, and why" },
  { name: "Design", line: "Which response would work, for whom" },
  { name: "Deliver", line: "Putting it into practice, and bringing people with it" },
  { name: "Evaluate", line: "What changed, and what to do next" },
];

/**
 * The public policy cycle with Verian's six areas of expertise placed on it.
 * Hover or focus an area to see the stages it serves; hover a stage to see
 * which areas work there.
 */
export function PolicyCycle() {
  const [area, setArea] = useState<string | null>(null);
  const [stage, setStage] = useState<number | null>(null);
  const active = EXPERTISE.find((e) => e.slug === area);

  const R = 146;
  const cx = 200;
  const cy = 200;
  const pos = (i: number) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 2;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)] as const;
  };
  const lit = (i: number) => (active ? active.stages.includes(i) : stage === i);

  return (
    <div className={styles.cycle}>
      <svg viewBox="0 0 400 400" className={styles.cycleSvg} role="img" aria-label="The policy cycle: understand, design, deliver, evaluate, then back to understand">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="var(--ink-3)" />
          </marker>
        </defs>
        {STAGES.map((_, i) => {
          const a0 = -Math.PI / 2 + (i * Math.PI) / 2 + 0.38;
          const a1 = -Math.PI / 2 + ((i + 1) * Math.PI) / 2 - 0.38;
          const p0 = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)];
          const p1 = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
          return (
            <path
              key={i}
              d={`M${p0[0]} ${p0[1]} A ${R} ${R} 0 0 1 ${p1[0]} ${p1[1]}`}
              fill="none"
              stroke="var(--ink-3)"
              strokeWidth="1.2"
              markerEnd="url(#arrow)"
            />
          );
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" className={styles.cycleCenter}>
          {active ? active.label : "The policy"}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" className={styles.cycleCenterSub}>
          {active ? "works here" : "cycle"}
        </text>
        {STAGES.map((s, i) => {
          const [x, y] = pos(i);
          return (
            <g
              key={s.name}
              className={styles.stageNode}
              data-lit={lit(i)}
              onMouseEnter={() => setStage(i)}
              onMouseLeave={() => setStage(null)}
            >
              <circle cx={x} cy={y} r="42" />
              <text x={x} y={y + 5} textAnchor="middle">
                {s.name}
              </text>
            </g>
          );
        })}
      </svg>

      <div className={styles.cycleSide}>
        <p className={styles.cycleHint}>
          {active
            ? `${active.name}: ${active.stages.map((i) => STAGES[i]!.name.toLowerCase()).join(" and ")}.`
            : stage !== null
              ? `${STAGES[stage]!.name}: ${STAGES[stage]!.line.toLowerCase()}.`
              : "Hover or tab through the areas to see where each one works."}
        </p>
        <ul role="list" className={styles.cycleAreas}>
          {EXPERTISE.map((e) => (
            <li key={e.slug}>
              <Link
                href={`/expertise/${e.slug}/`}
                className={styles.cycleArea}
                data-dim={stage !== null && !e.stages.includes(stage)}
                onMouseEnter={() => setArea(e.slug)}
                onMouseLeave={() => setArea(null)}
                onFocus={() => setArea(e.slug)}
                onBlur={() => setArea(null)}
              >
                <span>{e.name}</span>
                <span className={styles.cycleDots} aria-hidden>
                  {STAGES.map((s, i) => (
                    <span key={s.name} data-on={e.stages.includes(i)} />
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
