import Link from "next/link";
import { RevealLines } from "@/components/shared/RevealLines";
import { EXPERTISE } from "@/data/expertise";
import { byTopic } from "@/data/library";
import styles from "./HomeSections.module.css";

export const STAGES = ["Understand", "Design", "Deliver", "Evaluate"] as const;

export function ExpertiseIndex() {
  return (
    <section className={`section ${styles.opaque}`} data-scene="after" aria-labelledby="expertise-title">
      <div className="container">
        <div className={styles.sectionHead}>
          <RevealLines as="h2" id="expertise-title" className="h2">
            Our expertise
          </RevealLines>
          <p className="lede">
            End to end across the public policy cycle: from understanding a problem, through designing and delivering a
            response, to evaluating what changed.
          </p>
        </div>

        <p className={styles.cycleLegend}>
          Dots show where each area works in the policy cycle:{" "}
          {STAGES.map((s, i) => `${i + 1} ${s.toLowerCase()}`).join(", ")}.
        </p>
        <div className={styles.cycleKey} aria-hidden>
          <span />
          <span className={styles.rowStages}>
            {STAGES.map((s, i) => (
              <span key={s} className={styles.cycleIndex}>
                {i + 1}
              </span>
            ))}
          </span>
          <span />
        </div>

        <ul role="list" className={styles.index}>
          {EXPERTISE.map((e) => {
            const count = e.topics.length ? new Set(e.topics.flatMap((t) => byTopic(t).map((i) => i.id))).size : 0;
            return (
              <li key={e.slug}>
                <Link href={`/expertise/${e.slug}/`} className={styles.row}>
                  <span className={styles.rowName}>{e.name}</span>
                  <span className={styles.rowStages} role="img" aria-label={`Policy cycle: ${e.stages.map((s) => STAGES[s]).join(" and ")}`}>
                    {STAGES.map((s, i) => (
                      <span key={s} className={styles.stageDot} data-on={e.stages.includes(i)} title={s} />
                    ))}
                  </span>
                  <span className={styles.rowCount}>{count > 0 ? `${count} in the library` : ""}</span>
                  <span className={styles.rowBody}>
                    <span>{e.short}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className={styles.after}>
          <Link className="link" href="/expertise/">
            How the six areas fit the policy cycle
          </Link>
        </p>
      </div>
    </section>
  );
}
