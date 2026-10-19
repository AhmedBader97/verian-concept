"use client";

import { createElement, useEffect, useRef } from "react";
import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";
import { ScrollTrigger } from "gsap/ScrollTrigger";

interface Props {
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
  children: React.ReactNode;
  /** Play on load instead of when scrolled into view. */
  immediate?: boolean;
  delay?: number;
  id?: string;
}

/**
 * Headline lines rise out of a mask, once. Text is fully visible without
 * JavaScript and for visitors who prefer reduced motion.
 */
export function RevealLines({ as = "h2", className, children, immediate = false, delay = 0, id }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.visibility = "visible";
      return;
    }
    gsap.registerPlugin(SplitText, ScrollTrigger);
    let split: SplitText | null = null;
    let tween: gsap.core.Tween | null = null;
    const run = () => {
      split = SplitText.create(el, { type: "lines", mask: "lines", linesClass: "rl-line" });
      gsap.set(el, { visibility: "visible" });
      tween = gsap.from(split.lines, {
        yPercent: 105,
        duration: 1.05,
        ease: "power4.out",
        stagger: 0.09,
        delay,
        scrollTrigger: immediate ? undefined : { trigger: el, start: "top 86%", once: true },
        onComplete: () => split?.revert(),
      });
    };
    // Wait for web fonts so lines split where they will finally break.
    let cancelled = false;
    (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (!cancelled) run();
    });
    return () => {
      cancelled = true;
      tween?.scrollTrigger?.kill();
      tween?.kill();
      split?.revert();
    };
  }, [immediate, delay]);

  return createElement(as, { ref, className, id, "data-reveal": immediate ? "immediate" : "scroll" }, children);
}
