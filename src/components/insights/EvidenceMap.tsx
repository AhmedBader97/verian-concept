"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { topicTags } from "@/engine/corpus";
import type { Item } from "@/engine/types";
import { KIND_NAMES } from "@/data/library";
import styles from "./Insights.module.css";

type NodeKind = "topic" | "country" | "item";
interface GNode extends SimulationNodeDatum {
  id: string;
  label: string;
  kind: NodeKind;
  r: number;
  count: number;
  itemKind?: Item["kind"];
}
interface GLink {
  source: string | GNode;
  target: string | GNode;
}

const KIND_FILL: Record<Item["kind"], string> = {
  "case-study": "#2d55c8",
  insight: "#12877a",
  report: "#e09a2b",
  news: "#44505c",
  event: "#16202b",
  webinar: "#16202b",
};

interface Props {
  items: Item[];
  selected: string | null;
  onSelect: (topic: string | null) => void;
}

/**
 * The library as a knowledge graph: topics and countries are hubs, pieces of
 * work are the small points between them. This is the same graph the
 * retrieval engine walks when it answers a question.
 */
export function EvidenceMap({ items, selected, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<GNode | null>(null);
  const [size, setSize] = useState({ w: 900, h: 560 });
  const nodesRef = useRef<GNode[]>([]);
  const linksRef = useRef<GLink[]>([]);

  const graph = useMemo(() => {
    const nodes = new Map<string, GNode>();
    const links: GLink[] = [];
    for (const it of items) {
      const id = `item:${it.id}`;
      nodes.set(id, { id, label: it.title, kind: "item", r: 3.2, count: 1, itemKind: it.kind });
      for (const t of topicTags(it)) {
        const tid = `topic:${t}`;
        const n = nodes.get(tid) ?? { id: tid, label: t, kind: "topic" as const, r: 0, count: 0 };
        n.count++;
        nodes.set(tid, n);
        links.push({ source: id, target: tid });
      }
      if (it.country !== "Global") {
        const cid = `country:${it.country}`;
        const n = nodes.get(cid) ?? { id: cid, label: it.country, kind: "country" as const, r: 0, count: 0 };
        n.count++;
        nodes.set(cid, n);
        links.push({ source: id, target: cid });
      }
    }
    for (const n of nodes.values()) {
      if (n.kind === "topic") n.r = 6 + Math.sqrt(n.count) * 3.4;
      if (n.kind === "country") n.r = 4 + Math.sqrt(n.count) * 2.2;
    }
    return { nodes: [...nodes.values()], links };
  }, [items]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      const w = Math.round(e.contentRect.width);
      setSize({ w, h: Math.round(Math.max(420, Math.min(620, w * 0.62))) });
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;

    const nodes: GNode[] = graph.nodes.map((n) => ({ ...n }));
    const links: GLink[] = graph.links.map((l) => ({ ...l }));
    nodesRef.current = nodes;
    linksRef.current = links;

    const sim = forceSimulation<GNode>(nodes)
      .force(
        "link",
        forceLink<GNode, GLink & { source: GNode; target: GNode }>(links as never)
          .id((d) => d.id)
          .distance((l) => ((l.target as GNode).kind === "country" ? 46 : 34))
          .strength(0.35),
      )
      .force("charge", forceManyBody<GNode>().strength((d) => (d.kind === "item" ? -18 : -120)))
      .force("collide", forceCollide<GNode>().radius((d) => d.r + (d.kind === "item" ? 1.5 : 6)))
      .force("x", forceX(size.w / 2).strength(0.06))
      .force("y", forceY(size.h / 2).strength(0.09))
      .alphaDecay(0.035)
      .stop();

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Settle most of the way up front, then let the last part play out gently.
    for (let i = 0; i < (reduced ? 320 : 120); i++) sim.tick();

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      const focus = hoverRef.current?.id ?? (selectedRef.current ? `topic:${selectedRef.current}` : null);
      const near = new Set<string>();
      if (focus) {
        near.add(focus);
        for (const l of links) {
          const s = (l.source as GNode).id;
          const t = (l.target as GNode).id;
          if (s === focus) near.add(t);
          if (t === focus) near.add(s);
        }
      }
      ctx.lineWidth = 1;
      for (const l of links) {
        const s = l.source as GNode;
        const t = l.target as GNode;
        const on = focus && (near.has(s.id) && near.has(t.id)) && (s.id === focus || t.id === focus);
        ctx.strokeStyle = on ? "rgba(22,32,43,0.55)" : focus ? "rgba(22,32,43,0.04)" : "rgba(22,32,43,0.09)";
        ctx.beginPath();
        ctx.moveTo(s.x!, s.y!);
        ctx.lineTo(t.x!, t.y!);
        ctx.stroke();
      }
      for (const n of nodes) {
        const dim = focus && !near.has(n.id);
        ctx.globalAlpha = dim ? 0.18 : 1;
        if (n.kind === "item") {
          ctx.fillStyle = KIND_FILL[n.itemKind!];
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, n.r, 0, Math.PI * 2);
          ctx.fill();
        } else if (n.kind === "topic") {
          ctx.fillStyle = "#fafbfa";
          ctx.strokeStyle = "#16202b";
          ctx.lineWidth = n.id === focus ? 2 : 1.2;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, n.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          const s = n.r * 1.25;
          ctx.fillStyle = "#16202b";
          ctx.beginPath();
          ctx.moveTo(n.x!, n.y! - s);
          ctx.lineTo(n.x! + s * 0.92, n.y! + s * 0.6);
          ctx.lineTo(n.x! - s * 0.92, n.y! + s * 0.6);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.font = "500 12px 'Schibsted Grotesk Variable', system-ui, sans-serif";
      ctx.textAlign = "center";
      // Labels: the focused neighbourhood first, then the biggest nodes. A label is
      // kept inside the canvas and skipped if it would overlap one already drawn.
      const candidates = nodes
        .filter((n) => n.kind !== "item")
        .filter((n) => (n.kind === "topic" ? n.count >= 2 || near.has(n.id) : near.has(n.id) || n.count >= 4))
        .filter((n) => !(focus && !near.has(n.id)))
        .sort((a, b) => Number(near.has(b.id)) - Number(near.has(a.id)) || b.count - a.count);
      const placed: { x: number; y: number; w: number; h: number }[] = [];
      for (const n of candidates) {
        const w = ctx.measureText(n.label).width + 8;
        const h = 16;
        const x = Math.min(Math.max(n.x! - w / 2, 2), size.w - w - 2);
        const y = Math.min(n.y! + n.r + 3, size.h - h - 2);
        if (placed.some((p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y)) continue;
        placed.push({ x, y, w, h });
        ctx.fillStyle = "rgba(241,243,242,0.85)";
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "#16202b";
        ctx.fillText(n.label, x + w / 2, y + 12);
      }
    };

    let raf = 0;
    const loop = () => {
      sim.tick();
      draw();
      if (sim.alpha() > 0.02) raf = requestAnimationFrame(loop);
    };
    if (reduced) draw();
    else {
      sim.alpha(0.5);
      raf = requestAnimationFrame(loop);
    }
    redrawRef.current = draw;
    return () => {
      cancelAnimationFrame(raf);
      sim.stop();
    };
  }, [graph, size]);

  const hoverRef = useRef<GNode | null>(null);
  const selectedRef = useRef<string | null>(selected);
  const redrawRef = useRef<() => void>(() => {});
  useEffect(() => {
    hoverRef.current = hover;
    selectedRef.current = selected;
    redrawRef.current();
  }, [hover, selected]);

  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best: GNode | null = null;
    let bestD = Infinity;
    for (const n of nodesRef.current) {
      const d = Math.hypot(n.x! - x, n.y! - y) - n.r;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return bestD < 10 ? best : null;
  };

  const topics = graph.nodes.filter((n) => n.kind === "topic").sort((a, b) => b.count - a.count);

  return (
    <div className={styles.map}>
      <div ref={wrapRef} className={styles.mapCanvasWrap}>
        <canvas
          ref={canvasRef}
          className={styles.mapCanvas}
          role="img"
          aria-label="Knowledge graph of the library: topics and countries connected to the pieces of work tagged with them"
          onPointerMove={(e) => setHover(pick(e))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const n = pick(e);
            if (n?.kind === "topic") onSelect(selected === n.label ? null : n.label);
            if (n?.kind === "item") {
              const it = items.find((i) => `item:${i.id}` === n.id);
              if (it) window.open(it.url, "_blank", "noopener");
            }
          }}
          style={{ cursor: hover ? "pointer" : "default" }}
        />
        {hover && (
          <div className={styles.mapTip} style={{ left: hover.x, top: (hover.y ?? 0) - hover.r - 10 }}>
            <strong>{hover.label}</strong>
            <span>
              {hover.kind === "item"
                ? `${KIND_NAMES[hover.itemKind!]}. Select to open on veriangroup.com`
                : `${hover.count} piece${hover.count === 1 ? "" : "s"} of work${hover.kind === "topic" ? ". Select to filter" : ""}`}
            </span>
          </div>
        )}
      </div>
      <div className={styles.mapKey}>
        <p className={styles.mapKeyHead}>Topics</p>
        <ul role="list">
          {topics.map((t) => (
            <li key={t.id}>
              <button type="button" aria-pressed={selected === t.label} onClick={() => onSelect(selected === t.label ? null : t.label)}>
                <span>{t.label}</span>
                <span className="tnum">{t.count}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className={styles.mapLegend}>
          <span data-shape="topic" /> topic <span data-shape="country" /> country <span data-shape="item" /> piece of work
        </p>
      </div>
    </div>
  );
}
