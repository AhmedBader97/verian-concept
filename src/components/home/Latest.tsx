import Link from "next/link";
import { EvidenceGlyph } from "@/components/shared/EvidenceGlyph";
import { KIND_NAMES, latest, longDate } from "@/data/library";
import type { Item } from "@/engine/types";
import styles from "./HomeSections.module.css";

function Row({ item }: { item: Item }) {
  return (
    <li>
      <a className={styles.latestRow} href={item.url} target="_blank" rel="noreferrer">
        <EvidenceGlyph item={item} size={52} />
        <span className={styles.latestText}>
          <span className={styles.latestTitle}>{item.title}</span>
          <span className={styles.latestMeta}>
            {KIND_NAMES[item.kind]} from {item.country === "Global" ? "our global team" : item.country}, {longDate(item.date)}
          </span>
        </span>
      </a>
    </li>
  );
}

export function Latest() {
  const cases = latest(["case-study"], 4);
  const insights = latest(["insight", "report", "news", "event", "webinar"], 4);
  return (
    <section className={`section ${styles.opaque}`} aria-labelledby="latest-title">
      <div className="container">
        <h2 id="latest-title" className="visually-hidden">
          Latest work
        </h2>
        <div className={styles.latest}>
          <div>
            <div className={styles.latestHead}>
              <h3 className="h3">Latest case studies</h3>
              <Link className="link" href="/insights/?kind=case-study">
                All case studies
              </Link>
            </div>
            <ul role="list" className={styles.latestList}>
              {cases.map((i) => (
                <Row key={i.id} item={i} />
              ))}
            </ul>
          </div>
          <div>
            <div className={styles.latestHead}>
              <h3 className="h3">News and insights</h3>
              <Link className="link" href="/insights/">
                The full library
              </Link>
            </div>
            <ul role="list" className={styles.latestList}>
              {insights.map((i) => (
                <Row key={i.id} item={i} />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
