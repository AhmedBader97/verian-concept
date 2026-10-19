"use client";

import { useEffect, useRef, useState } from "react";
import { useField } from "./FieldContext";
import styles from "./Story.module.css";

const STEPS = [
  {
    title: "Listen",
    body: "Every policy question starts with people. Verian hears directly from many millions of citizens each year, through surveys, interviews, panels and behavioural research.",
    legend: "A population: thousands of points, each standing in for a voice.",
  },
  {
    title: "Measure",
    body: "Then comes gold-standard data on the economy and society: robust samples, careful fieldwork and long-running series kept comparable over time. The Preparedness Index alone covers twelve countries.",
    legend: "Twelve sample blocks, as in an index fielded in twelve countries.",
  },
  {
    title: "Understand",
    body: "Data science and behavioural expertise turn responses into understanding: who is affected, why, and what would actually change behaviour.",
    legend: "Five segments, each coloured by its mix of data, technology and citizen insight.",
  },
  {
    title: "Decide",
    body: "A triangle is the most stable shape in engineering. Evidence triangulated from several sources is the most stable ground for a decision.",
    legend: "Every point settles into one shape.",
  },
];

export function Story() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const { mode } = useField();

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section className={styles.story} data-scene="story" aria-labelledby="story-title" id="how">
      <div className="container">
        <header className={styles.head}>
          <h2 id="story-title" className="h2">
            From voices to decisions
          </h2>
          <p className="lede">How evidence is made, in four steps. The field beside the text follows along as you scroll.</p>
        </header>
        <ol className={styles.steps} role="list" data-mode={mode}>
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              ref={(el) => {
                refs.current[i] = el;
              }}
              data-step={i}
              data-active={active === i}
              className={styles.step}
            >
              <div className={styles.card}>
                <span className={styles.num} aria-hidden>
                  {i + 1}
                </span>
                <h3 className="h3">{s.title}</h3>
                <p className={styles.body}>{s.body}</p>
                <p className={styles.legend}>{s.legend}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
