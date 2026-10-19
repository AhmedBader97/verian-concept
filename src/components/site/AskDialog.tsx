"use client";

import { useEffect, useRef, useState } from "react";
import { AskLibrary } from "@/components/shared/AskLibrary";
import styles from "./AskDialog.module.css";

/**
 * Ask the library from anywhere: the header button, or press "/" or Ctrl/⌘+K.
 * Uses the native <dialog> element for focus handling and Escape to close.
 */
export function AskDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-ask", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-ask", onOpen);
    };
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      window.__lenis?.stop();
      requestAnimationFrame(() => d.querySelector<HTMLInputElement>("input[type=search]")?.focus());
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label="Ask the library"
      onClose={() => {
        setOpen(false);
        window.__lenis?.start();
      }}
      onClick={(e) => {
        if (e.target === ref.current) setOpen(false);
      }}
    >
      <div className={styles.panel}>
        <div className={styles.top}>
          <p className={styles.title}>Ask the library</p>
          <button type="button" className={styles.close} onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
        {open && <AskLibrary compact />}
        <p className={styles.hint}>
          Press <kbd>/</kbd> or <kbd>Ctrl</kbd> + <kbd>K</kbd> on any page to open this.
        </p>
      </div>
    </dialog>
  );
}
