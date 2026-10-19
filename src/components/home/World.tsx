"use client";

import { useEffect, useMemo, useState } from "react";
import worldDots from "@/data/world-dots.json";
import { OFFICES, COUNTRY_COUNT, OFFICE_COUNT, type Office } from "@/data/offices";
import { LINKS } from "@/data/site";
import { computeLayout, type FieldLayout } from "@/lib/field/formations";
import { projectNormalised } from "@/lib/field/math";
import type { RegionKey } from "@/lib/field/renderer";
import { useField } from "./FieldContext";
import styles from "./World.module.css";

const REGION_BUTTONS: { key: RegionKey | null; label: string; region?: Office["region"] }[] = [
  { key: null, label: "All regions" },
  { key: "europe", label: "Europe", region: "Europe" },
  { key: "apac", label: "Asia-Pacific", region: "APAC" },
  { key: "northAmerica", label: "North America", region: "North America" },
];

type Box = [number, number, number, number];

function officeScreen(o: Office, L: FieldLayout, box: Box | null): { x: number; y: number; inside: boolean } {
  const [nx, ny] = projectNormalised(o.lon, o.lat, worldDots.bounds);
  const [bx0, by0, bx1, by1] = box ?? [0, 0, 1, 1];
  const lx = (nx - bx0) / (bx1 - bx0);
  const ly = (ny - by0) / (by1 - by0);
  const m = L.map;
  return {
    x: m.x0 + lx * (m.x1 - m.x0),
    y: m.y0 + ly * (m.y1 - m.y0),
    inside: lx >= -0.01 && lx <= 1.01 && ly >= -0.01 && ly <= 1.01,
  };
}

export function World() {
  const { layout, mode, region, setRegion } = useField();
  const [fallbackLayout, setFallbackLayout] = useState<FieldLayout | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    if (mode === "fallback") setFallbackLayout(computeLayout(window.innerWidth, window.innerHeight));
  }, [mode]);

  const L = layout ?? fallbackLayout;
  const box = region ? ((worldDots.regions as Record<RegionKey, { box: number[] }>)[region].box as Box) : null;
  const activeRegion = REGION_BUTTONS.find((b) => b.key === region)?.region;
  const listed = activeRegion ? OFFICES.filter((o) => o.region === activeRegion) : OFFICES;
  const focused = OFFICES.find((o) => o.city === focus) ?? null;

  const staticDots = useMemo(() => {
    if (mode !== "fallback" || !L) return null;
    const d = worldDots.world;
    const m = L.map;
    const out: string[] = [];
    for (let i = 0; i < d.length; i += 2) {
      out.push(`M${(m.x0 + d[i]! * (m.x1 - m.x0)).toFixed(1)} ${(m.y0 + d[i + 1]! * (m.y1 - m.y0)).toFixed(1)}h0`);
    }
    return out.join("");
  }, [mode, L]);

  return (
    <section className={styles.world} data-scene="world" aria-labelledby="world-title" id="world">
      <div className={styles.sticky}>
        <div className={`container ${styles.head}`}>
          <div className={styles.headText}>
            <h2 id="world-title" className="h2">
              Global best practice, delivered locally
            </h2>
            <p className={styles.stat}>
              {OFFICE_COUNT} offices in {COUNTRY_COUNT} countries across Europe, Asia-Pacific and North America.
            </p>
          </div>
          <div className={styles.controls} role="group" aria-label="Show offices by region">
            {REGION_BUTTONS.map((b) => (
              <button
                key={b.label}
                className={styles.chip}
                aria-pressed={region === b.key}
                onClick={() => {
                  setRegion(b.key);
                  setFocus(null);
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {staticDots && L && (
          <svg className={styles.static} width={L.W} height={L.H} aria-hidden>
            <path d={staticDots} stroke="var(--ink)" strokeWidth={2.4} strokeLinecap="round" opacity={0.85} />
          </svg>
        )}

        {L && (
          <ul className={styles.markers} role="list" aria-label="Office locations">
            {OFFICES.map((o) => {
              const p = officeScreen(o, L, box);
              const hidden = !p.inside || (activeRegion && o.region !== activeRegion);
              // At world scale the pins overlap, so they are visual only; the list
              // below is the accessible control. Zoomed in, pins are buttons too.
              const interactive = !!region && !hidden;
              return (
                <li
                  key={o.city}
                  className={styles.marker}
                  data-hidden={hidden ? "true" : "false"}
                  data-interactive={interactive}
                  data-focus={focus === o.city}
                  style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
                  aria-hidden={interactive ? undefined : true}
                >
                  <button
                    className={styles.pin}
                    aria-label={`${o.city}, ${o.country}`}
                    tabIndex={interactive ? 0 : -1}
                    onMouseEnter={() => setFocus(o.city)}
                    onMouseLeave={() => setFocus((f) => (f === o.city ? null : f))}
                    onFocus={() => setFocus(o.city)}
                    onBlur={() => setFocus((f) => (f === o.city ? null : f))}
                  />
                </li>
              );
            })}
          </ul>
        )}

        <div className={`container ${styles.foot}`}>
          <div className={styles.card}>
            <div className={styles.cardInfo} aria-live="polite">
              {focused ? (
                <>
                  <p className={styles.cardCity}>
                    {focused.city}
                    {focused.note ? <span className={styles.cardNote}> {focused.note}</span> : null}
                  </p>
                  <p className={styles.cardMeta}>{focused.country}</p>
                  <p className={styles.cardAddr}>{focused.address}</p>
                </>
              ) : (
                <p className={styles.cardHint}>Hover or tab to an office to see its address. Choose a region to zoom in.</p>
              )}
            </div>
            <button
              type="button"
              className={styles.listToggle}
              aria-expanded={listOpen}
              aria-controls="office-list"
              onClick={() => setListOpen((o) => !o)}
            >
              {listOpen ? "Hide the list" : `List all ${listed.length} offices`}
            </button>
            <ul id="office-list" className={styles.list} role="list" aria-label="Offices in view" data-open={listOpen}>
              {listed.map((o) => (
                <li key={o.city}>
                  <button
                    className={styles.listItem}
                    data-focus={focus === o.city}
                    onMouseEnter={() => setFocus(o.city)}
                    onMouseLeave={() => setFocus((f) => (f === o.city ? null : f))}
                    onFocus={() => setFocus(o.city)}
                    onBlur={() => setFocus((f) => (f === o.city ? null : f))}
                  >
                    {o.city}
                  </button>
                </li>
              ))}
            </ul>
            <a className={styles.listLink} href={LINKS.locations} target="_blank" rel="noreferrer">
              Full contact details on veriangroup.com
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
