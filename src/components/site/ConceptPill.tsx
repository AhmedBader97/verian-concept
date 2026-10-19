"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./ConceptPill.module.css";

/** A persistent, honest label: this is a concept, and who made it. */
export function ConceptPill() {
  const pathname = usePathname();
  if (pathname.startsWith("/concept")) return null;
  return (
    <aside aria-label="About this site">
      <Link href="/concept/" className={styles.pill}>
        <svg viewBox="0 0 20 18" aria-hidden className={styles.mark}>
          <circle cx="10" cy="3" r="2.4" fill="var(--marigold)" />
          <circle cx="3" cy="15" r="2.4" fill="var(--cobalt)" />
          <circle cx="17" cy="15" r="2.4" fill="var(--viridian)" />
        </svg>
        <span className={styles.text}>
          <span className={styles.lead}>Unofficial concept</span>
          <span className={styles.by}>by Ahmed Bader</span>
        </span>
      </Link>
    </aside>
  );
}
