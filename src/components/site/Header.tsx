"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LINKS, NAV } from "@/data/site";
import styles from "./Header.module.css";

export function Header() {
  const pathname = usePathname();
  const [solid, setSolid] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const last = useRef(0);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setSolid(y > 24);
      if (!open) setHidden(y > 480 && y > last.current + 4);
      if (y < last.current - 4) setHidden(false);
      last.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    window.__lenis?.stop();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.__lenis?.start();
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href);

  return (
    <header className={styles.header} data-solid={solid || open} data-hidden={hidden && !open}>
      <div className={`container ${styles.bar}`}>
        <Link href="/" className={styles.brand}>
          <span className={styles.word}>Verian</span> <span className={styles.concept}>concept</span>
          <span className="visually-hidden">, home</span>
        </Link>

        <nav aria-label="Main" className={styles.nav}>
          <ul role="list">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={styles.link} aria-current={isActive(item.href) ? "page" : undefined}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <button type="button" className={styles.askButton} onClick={() => window.dispatchEvent(new Event("open-ask"))}>
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
            <circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M13 13l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span>Ask</span>
          <kbd className={styles.kbd} aria-hidden>
            /
          </kbd>
        </button>

        <a className={`btn btn--small ${styles.cta}`} href={LINKS.contact} target="_blank" rel="noreferrer">
          Work with us
        </a>

        <button
          ref={menuButton}
          className={styles.menuButton}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
        >
          <span>{open ? "Close" : "Menu"}</span>
          <span className={styles.burger} aria-hidden data-open={open} />
        </button>
      </div>

      <div id="mobile-menu" className={styles.sheet} data-open={open} inert={!open}>
        <nav aria-label="Main, mobile" className="container">
          <ul role="list" className={styles.sheetList}>
            {[{ href: "/", label: "Home" }, ...NAV].map((item, i) => (
              <li key={item.href} style={{ transitionDelay: `${60 + i * 40}ms` }}>
                <Link href={item.href} className={styles.sheetLink} aria-current={pathname === item.href ? "page" : undefined}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <a className="btn" href={LINKS.contact} target="_blank" rel="noreferrer">
            Work with us
          </a>
        </nav>
      </div>
    </header>
  );
}
