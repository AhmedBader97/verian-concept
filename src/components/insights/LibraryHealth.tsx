import quality from "@/data/quality.json";
import { longDate } from "@/data/library";
import styles from "./Insights.module.css";

interface SourceNote {
  found: string;
  action: string;
  items?: string[];
}

interface Quality {
  total: number;
  byKind: Record<string, number>;
  summaryBasis: Record<string, number>;
  itemsWithoutTopics: { count: number; ids: string[] };
  dateRange: { first: string; last: string };
  sourceNotes?: SourceNote[];
}

const Q = quality as Quality;

const BASIS = [
  { key: "page", label: "written from the item's own page" },
  { key: "teaser", label: "written from the listing teaser" },
  { key: "title-only", label: "restate the title only" },
] as const;

/**
 * How the library on this site was built, and what the import found on
 * veriangroup.com. Everything here is read from src/data/quality.json, which
 * pipeline/build.py writes.
 */
export function LibraryHealth() {
  const basis = BASIS.map((b) => ({ ...b, n: Q.summaryBasis[b.key] ?? 0 }));
  const notes = Q.sourceNotes ?? [];
  return (
    <section className={styles.health} id="data" aria-labelledby="health-title">
      <div className={styles.healthHead}>
        <h2 id="health-title" className="h2">
          About this data
        </h2>
        <p className="lede">
          {Q.total} items curated from veriangroup.com and checked by a Python pipeline that validates every field and fails
          loudly. Titles, dates, links and topic tags are Verian&rsquo;s; the summaries are mine.
        </p>
      </div>

      <div className={styles.healthGrid}>
        <div className={styles.healthFacts}>
          <dl className={styles.healthList}>
            <div>
              <dt>Published</dt>
              <dd>
                {longDate(Q.dateRange.first)} to {longDate(Q.dateRange.last)}
              </dd>
            </div>
            <div>
              <dt>Case studies</dt>
              <dd className="tnum">{Q.byKind["case-study"] ?? 0}</dd>
            </div>
            <div>
              <dt>Insights, news, events, reports and webinars</dt>
              <dd className="tnum">{Q.total - (Q.byKind["case-study"] ?? 0)}</dd>
            </div>
            <div>
              <dt>Without a topic tag on Verian&rsquo;s site</dt>
              <dd className="tnum">{Q.itemsWithoutTopics.count}</dd>
            </div>
          </dl>

          <figure className={styles.basis}>
            <figcaption className={styles.basisCaption}>Where each summary comes from</figcaption>
            <div className={styles.basisBar} role="img" aria-label={basis.map((b) => `${b.n} ${b.label}`).join(", ")}>
              {basis.map((b) => (
                <span key={b.key} data-basis={b.key} style={{ flexGrow: b.n }} />
              ))}
            </div>
            <ul role="list" className={styles.basisKey}>
              {basis.map((b) => (
                <li key={b.key} data-basis={b.key}>
                  <span className="tnum">{b.n}</span> {b.label}
                </li>
              ))}
            </ul>
            <p className={styles.note}>
              Title-only summaries are never presented as findings: answers cite those items by their title alone.
            </p>
          </figure>
        </div>

        <div>
          <h3 className="h4">What the import found</h3>
          <ul role="list" className={styles.notes}>
            {notes.map((n) => (
              <li key={n.found}>
                <p className={styles.noteFound}>{n.found}</p>
                <p className={styles.noteAction}>{n.action}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
