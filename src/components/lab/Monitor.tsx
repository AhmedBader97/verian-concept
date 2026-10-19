"use client";

import { percentile } from "@/engine/eval/metrics";
import { clearRuns, useOps } from "./opsStore";
import styles from "./Lab.module.css";

/** Session monitoring: what a production dashboard would watch, from this browser's runs. */
export function Monitor() {
  const ops = useOps();
  const n = ops.length;
  const ms = ops.map((o) => o.ms);
  const abstained = ops.filter((o) => o.status === "abstained").length;
  const denied = ops.reduce((s, o) => s + o.denied, 0);
  const quarantined = ops.reduce((s, o) => s + o.quarantined, 0);
  const tiles = [
    { label: "Runs this session", value: n.toString() },
    { label: "Median run time", value: n ? `${percentile(ms, 50).toFixed(1)} ms` : "–" },
    { label: "Slowest 5%", value: n ? `${percentile(ms, 95).toFixed(1)} ms` : "–" },
    { label: "Declined to answer", value: n ? `${Math.round((abstained / n) * 100)}%` : "–" },
    { label: "Tool calls refused", value: denied.toString() },
    { label: "Documents quarantined", value: quarantined.toString() },
  ];

  return (
    <div className={styles.monitor}>
      <dl className={styles.tiles}>
        {tiles.map((t) => (
          <div key={t.label}>
            <dt>{t.label}</dt>
            <dd className="tnum">{t.value}</dd>
          </div>
        ))}
      </dl>
      {n > 0 ? (
        <div className={styles.logWrap}>
          <table className={styles.log}>
            <caption className="visually-hidden">Recent runs</caption>
            <thead>
              <tr>
                <th scope="col">Question, as logged</th>
                <th scope="col">Outcome</th>
                <th scope="col">Tools</th>
                <th scope="col">Time</th>
              </tr>
            </thead>
            <tbody>
              {[...ops].reverse().slice(0, 8).map((o) => (
                <tr key={o.at + o.question}>
                  <td>{o.question}</td>
                  <td>{o.status === "answered" ? "Answered" : "Declined"}</td>
                  <td className="tnum">{o.toolCalls}</td>
                  <td className="tnum">{o.ms.toFixed(1)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className={styles.clearLog} onClick={clearRuns}>
            Clear this session&rsquo;s log
          </button>
        </div>
      ) : (
        <p className={styles.benchNote}>Run the agent above, or ask the library anywhere on the site, and this fills in.</p>
      )}
    </div>
  );
}
