"use client";

import { useEffect, useMemo, useState } from "react";
import { EvidenceGlyph } from "@/components/shared/EvidenceGlyph";
import { KIND_NAMES, LIBRARY, longDate } from "@/data/library";
import { topicTags } from "@/engine/corpus";
import type { Kind } from "@/engine/types";
import { EvidenceMap } from "./EvidenceMap";
import styles from "./Insights.module.css";

const KIND_FILTERS: { label: string; kinds: Kind[] }[] = [
  { label: "Everything", kinds: [] },
  { label: "Case studies", kinds: ["case-study"] },
  { label: "Insights and reports", kinds: ["insight", "report", "news"] },
  { label: "Events and webinars", kinds: ["event", "webinar"] },
];

const PAGE = 12;

export function LibraryBrowser() {
  const [kindIdx, setKindIdx] = useState(0);
  const [topic, setTopic] = useState<string | null>(null);
  const [country, setCountry] = useState<string>("");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const k = params.get("kind");
    if (k === "case-study") setKindIdx(1);
    const t = params.get("topic");
    if (t) setTopic(t);
  }, []);

  const countries = useMemo(
    () => [...new Set(LIBRARY.map((i) => i.country))].filter((c) => c !== "Global").sort(),
    [],
  );

  const filtered = useMemo(() => {
    const kinds = KIND_FILTERS[kindIdx]!.kinds;
    return LIBRARY.filter(
      (i) =>
        (!kinds.length || kinds.includes(i.kind)) &&
        (!topic || i.topics.includes(topic)) &&
        (!country || i.country === country),
    );
  }, [kindIdx, topic, country]);

  useEffect(() => setShown(PAGE), [kindIdx, topic, country]);

  return (
    <div className={styles.browser}>
      <section id="map" className={styles.mapSection} aria-labelledby="map-title">
        <div className={styles.mapHead}>
          <h2 id="map-title" className="h3">
            The evidence map
          </h2>
          <p className={styles.note}>
            The library as a knowledge graph. Hover to trace connections; select a topic to filter the list below. The AI
            assistant uses these topic links to judge relevance, and searches through the graph only when a keyword search
            comes back weak.
          </p>
        </div>
        <EvidenceMap items={LIBRARY} selected={topic} onSelect={setTopic} />
      </section>

      <section aria-labelledby="list-title" className={styles.listSection}>
        <div className={styles.filters}>
          <h2 id="list-title" className="h3">
            Browse everything
          </h2>
          <div className={styles.filterRow} role="group" aria-label="Type of work">
            {KIND_FILTERS.map((f, i) => (
              <button key={f.label} type="button" className={styles.chip} aria-pressed={kindIdx === i} onClick={() => setKindIdx(i)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className={styles.filterRow}>
            <label className={styles.select}>
              <span>Country</span>
              <select value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">All countries</option>
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            {topic && (
              <button type="button" className={styles.activeTopic} onClick={() => setTopic(null)}>
                Topic: {topic}
                <span aria-hidden> ×</span>
                <span className="visually-hidden">, remove filter</span>
              </button>
            )}
            <p className={styles.count} aria-live="polite">
              {filtered.length} of {LIBRARY.length}
            </p>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className={styles.emptyList}>Nothing matches these filters. Remove one to see more.</p>
        ) : (
          <ul role="list" className={styles.cards}>
            {filtered.slice(0, shown).map((it) => (
              <li key={it.id}>
                <a className={styles.card} href={it.url} target="_blank" rel="noreferrer">
                  <EvidenceGlyph item={it} size={64} />
                  <div className={styles.cardText}>
                    <p className={styles.cardMeta}>
                      {KIND_NAMES[it.kind]}, {longDate(it.date)}
                      {it.country !== "Global" ? `, ${it.country}` : ""}
                    </p>
                    <h3 className={styles.cardTitle}>{it.title}</h3>
                    {it.summaryBasis !== "title-only" && <p className={styles.cardSummary}>{it.summary}</p>}
                    {topicTags(it).length > 0 && (
                      <p className={styles.cardTopics}>
                        {topicTags(it).map((t) => (
                          <span key={t} className="tag">
                            {t}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
        {shown < filtered.length && (
          <button type="button" className={`btn btn--ghost ${styles.more}`} onClick={() => setShown((s) => s + PAGE)}>
            Show {Math.min(PAGE, filtered.length - shown)} more
          </button>
        )}
      </section>
    </div>
  );
}
