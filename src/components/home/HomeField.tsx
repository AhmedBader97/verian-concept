"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { FieldLayout } from "@/lib/field/formations";
import type { FieldRenderer, RegionKey } from "@/lib/field/renderer";
import { FieldContext, type FieldApi } from "./FieldContext";
import styles from "./HomeField.module.css";

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Owns the fixed WebGL canvas behind the home page and maps scroll position
 * to formations: hero (0) → listen (1) → measure (2) → understand (3) →
 * decide (4) → world (5). Sections opt in with data-scene attributes.
 */
export function HomeField({ children }: { children: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<FieldRenderer | null>(null);
  const [mode, setMode] = useState<FieldApi["mode"]>("pending");
  const [layout, setLayout] = useState<FieldLayout | null>(null);
  const [region, setRegionState] = useState<RegionKey | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(reduced);
    if (!webglAvailable()) {
      setMode("fallback");
      return;
    }
    let disposed = false;
    let cleanup = () => {};

    const idle = (fn: () => void) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 700 });
      else setTimeout(fn, 200);
    };

    const start = () => import("@/lib/field/renderer").then(({ FieldRenderer }) => {
      if (disposed || !canvasRef.current || !rootRef.current) return;
      gsap.registerPlugin(ScrollTrigger);
      const r = new FieldRenderer(canvasRef.current, { reducedMotion: reduced });
      rendererRef.current = r;
      const heroCopy = rootRef.current.querySelector<HTMLElement>("[data-hero-copy]");
      const measureSafeTop = () => {
        if (window.innerWidth < 900 && heroCopy) r.setSafeTop(heroCopy.getBoundingClientRect().bottom + window.scrollY);
      };
      measureSafeTop();
      setLayout(r.layout);
      setMode("webgl");
      // Web fonts can change the headline's height: measure again once they load.
      document.fonts?.ready.then(() => {
        if (disposed) return;
        measureSafeTop();
        r.setStick(window.scrollY);
        setLayout(r.layout);
      });

      // Opening moment: the population condenses into the triangle.
      r.setStage(1, true);
      requestAnimationFrame(() => r.setStage(0));

      const root = rootRef.current;
      const story = root.querySelector<HTMLElement>('[data-scene="story"]');
      const world = root.querySelector<HTMLElement>('[data-scene="world"]');
      const after = document.querySelector<HTMLElement>('[data-scene="after"]');
      const triggers: ScrollTrigger[] = [];
      const steps = story ? Array.from(story.querySelectorAll<HTMLElement>("[data-step]")) : [];
      const parts = { enter: 0, steps: [0, 0, 0], world: 0 };
      const apply = () => r.setStage(parts.enter + parts.steps.reduce((a, b) => a + b, 0) + parts.world, reduced);

      if (story && steps[0]) {
        // Hero → listen, finishing as the first step reaches the middle of the screen.
        triggers.push(
          ScrollTrigger.create({
            trigger: steps[0],
            start: "top bottom",
            end: "top 40%",
            onUpdate: (self) => {
              parts.enter = self.progress;
              apply();
            },
          }),
        );
      }
      // Each later step morphs the field as its text arrives.
      steps.slice(1, 4).forEach((el, i) => {
        triggers.push(
          ScrollTrigger.create({
            trigger: el,
            start: "top 80%",
            end: "top 40%",
            onUpdate: (self) => {
              parts.steps[i] = self.progress;
              apply();
            },
          }),
        );
      });
      if (world) {
        triggers.push(
          ScrollTrigger.create({
            trigger: world,
            start: "top 85%",
            end: "top top",
            onUpdate: (self) => {
              parts.world = self.progress;
              apply();
            },
          }),
        );
      }
      if (world) {
        // Once the map section stops sticking, the canvas scrolls away with it.
        triggers.push(
          ScrollTrigger.create({
            trigger: world,
            start: "bottom bottom",
            end: "bottom top",
            onUpdate: (self) => {
              r.setOffset(self.progress * window.innerHeight);
              r.setOpacity(self.progress > 0.98 ? 0 : 1);
            },
            onLeaveBack: () => {
              r.setOffset(0);
              r.setOpacity(1);
            },
          }),
        );
      } else if (after) {
        triggers.push(
          ScrollTrigger.create({
            trigger: after,
            start: "top bottom",
            end: "top 35%",
            onUpdate: (self) => r.setOpacity(1 - self.progress),
          }),
        );
      }

      const onPointer = (e: PointerEvent) => {
        const heroActive = window.scrollY < window.innerHeight * 0.6;
        r.setPointer(e.clientX, e.clientY, heroActive && e.pointerType === "mouse");
      };
      const onLeave = () => r.setPointer(-9999, -9999, false);
      let resizeTimer = 0;
      let lastW = window.innerWidth;
      let lastH = window.innerHeight;
      const onResize = () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          // Mobile browsers resize the viewport when the URL bar hides: ignore small height-only changes.
          if (window.innerWidth === lastW && Math.abs(window.innerHeight - lastH) < 120) return;
          lastW = window.innerWidth;
          lastH = window.innerHeight;
          r.resize();
          measureSafeTop();
          r.setStick(window.scrollY);
          setLayout(r.layout);
          ScrollTrigger.refresh();
        }, 160);
      };
      const onVisibility = () => (document.hidden ? r.pause() : r.resume());
      const onScroll = () => r.setStick(window.scrollY);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("pointermove", onPointer, { passive: true });
      document.addEventListener("pointerleave", onLeave);
      window.addEventListener("resize", onResize);
      document.addEventListener("visibilitychange", onVisibility);
      ScrollTrigger.refresh();

      cleanup = () => {
        triggers.forEach((t) => t.kill());
        window.removeEventListener("pointermove", onPointer);
        document.removeEventListener("pointerleave", onLeave);
        window.removeEventListener("resize", onResize);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("scroll", onScroll);
        r.dispose();
        rendererRef.current = null;
      };
    });

    idle(() => void start());

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  const api = useMemo<FieldApi>(
    () => ({
      mode,
      layout,
      region,
      reducedMotion,
      setRegion: (key) => {
        setRegionState(key);
        rendererRef.current?.setRegion(key);
      },
    }),
    [mode, layout, region, reducedMotion],
  );

  return (
    <FieldContext.Provider value={api}>
      <div ref={rootRef} className={styles.root} data-mode={mode}>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden />
        {children}
      </div>
    </FieldContext.Provider>
  );
}
