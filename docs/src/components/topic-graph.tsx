'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from 'd3-force';
import graphDataJSON from '@/lib/graph.json';

export type GraphNode = { id: string; title: string; section: string };
type GraphEdge = [string, string];

type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] };
// JSON modules infer loose arrays; the graph builder emits tuples
const graphData = graphDataJSON as unknown as GraphData;

// colors are fds theme tokens — they track light/dark automatically
const sectionFill: Record<string, string> = {
  guide: 'var(--color-fd-primary)',
  code: 'var(--color-fd-secondary)',
  index: 'var(--color-fd-muted-foreground)',
};

/** focus node + everything one hop away (Obsidian's local graph) */
export function neighborhood(focusId: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const ids = new Set([focusId]);
  for (const [from, to] of graphData.edges) {
    if (from === focusId) ids.add(to);
    if (to === focusId) ids.add(from);
  }
  return {
    nodes: graphData.nodes.filter((n) => ids.has(n.id)),
    edges: graphData.edges.filter(([a, b]) => ids.has(a) && ids.has(b)),
  };
}

type Positioned = GraphNode & { r: number; x: number; y: number; fx?: number; fy?: number };
type LinkDatum = { source: Positioned | string; target: Positioned | string };

const FULL_VIEW = { w: 560, h: 400 };
/** near 1:1 with the widened TOC column (≈336px inner) so labels stay legible */
const MINI_VIEW = { w: 320, h: 210 };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** corner control for the graph board: zoom in, zoom out, fit */
function CtrlBtn({ onClick, label, d, small }: { onClick: () => void; label: string; d: string; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center rounded-md border border-fd-border bg-fd-popover/90 text-fd-muted-foreground shadow-xs transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground ${
        small ? 'size-6' : 'size-7'
      }`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={d} />
      </svg>
    </button>
  );
}

const ZOOM_IN_ICON = 'M6 1.5v9M1.5 6h9';
const ZOOM_OUT_ICON = 'M1.5 6h9';
const FIT_ICON = 'M2 4.5V2h2.5M7.5 2H10v2.5M10 7.5V10H7.5M4.5 10H2V7.5';

/**
 * Force-directed SVG graph, canvas-free on purpose: fills and strokes are
 * CSS variables, so the drawing follows the theme switch.
 *
 * - `variant="full"` — whole dataset, pan + wheel zoom + node drag + ± controls.
 * - `variant="mini"` — a settled local subgraph for the right column; nodes
 *   stay draggable, navigation on click.
 */
export function GraphView({
  nodes,
  edges,
  variant,
  focusId,
  height,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  variant: 'full' | 'mini';
  focusId?: string;
  height?: number;
}) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation<Positioned, LinkDatum> | null>(null);
  const viewRef = useRef({ k: 1, tx: 0, ty: 0 });
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const [positions, setPositions] = useState<Positioned[]>([]);
  const dragging = useRef<{ node?: Positioned; moved: number; x: number; y: number; panning?: boolean } | null>(null);
  const markerId = `tn-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const mini = variant === 'mini';
  // viewBox dimensions per variant (≠ `view`, the pan/zoom transform state)
  const dims = mini ? MINI_VIEW : FULL_VIEW;

  const degrees = useMemo(() => {
    const deg = new Map<string, number>();
    for (const [a, b] of edges) {
      deg.set(a, (deg.get(a) ?? 0) + 1);
      deg.set(b, (deg.get(b) ?? 0) + 1);
    }
    return deg;
  }, [edges]);

  useEffect(() => {
    const placed: Positioned[] = nodes.map((n, i) => ({
      ...n,
      r: mini ? 9 : clamp(8 + (degrees.get(n.id) ?? 0) * 2.5, 9, 20),
      x: dims.w / 2 + Math.cos((i / Math.max(nodes.length, 1)) * Math.PI * 2) * (mini ? 76 : 180),
      y: dims.h / 2 + Math.sin((i / Math.max(nodes.length, 1)) * Math.PI * 2) * (mini ? 54 : 120),
    }));
    const links: LinkDatum[] = edges.map(([source, target]) => ({ source, target }));
    const sim = forceSimulation<Positioned, LinkDatum>(placed)
      .force(
        'link',
        forceLink<Positioned, LinkDatum>(links)
          .id((d) => d.id)
          .distance(mini ? 118 : 150)
          .strength(mini ? 1 : 0.4),
      )
      .force('charge', forceManyBody().strength(mini ? -260 : -420))
      .force('collide', forceCollide((d) => d.r + 12))
      .force('center', forceCenter(dims.w / 2, dims.h / 2))
      .stop();
    simRef.current = sim;
    sim.on('tick', () => setPositions(placed.map((n) => ({ ...n }))));
    if (mini) {
      // settled snapshot for the panel; physics resumes only while dragged
      for (let i = 0; i < 180; i++) sim.tick();
      setPositions(placed.map((n) => ({ ...n })));
    } else {
      sim.alpha(1).restart();
    }
    viewRef.current = { k: 1, tx: 0, ty: 0 };
    setView({ k: 1, tx: 0, ty: 0 });
    return () => {
      sim.on('tick', null);
      simRef.current = null;
    };
  }, [nodes, edges, degrees, mini]);

  // non-passive wheel handler for zoom (full variant only)
  useEffect(() => {
    if (mini || !svgRef.current) return;
    const svg = svgRef.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const { k, tx, ty } = viewRef.current;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const k2 = clamp(k * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.35, 4);
      const wx = (mx - tx) / k;
      const wy = (my - ty) / k;
      const next = { k: k2, tx: mx - wx * k2, ty: my - wy * k2 };
      viewRef.current = next;
      setView(next);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [mini]);

  const toWorld = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const { k, tx, ty } = viewRef.current;
    return { x: (clientX - rect.left - tx) / k, y: (clientY - rect.top - ty) / k };
  };

  /** zoom about the viewport center, so the middle of the graph stays put */
  const zoomBy = (factor: number) => {
    const { k, tx, ty } = viewRef.current;
    const k2 = clamp(k * factor, 0.35, 4);
    const wx = (dims.w / 2 - tx) / k;
    const wy = (dims.h / 2 - ty) / k;
    const next = { k: k2, tx: dims.w / 2 - wx * k2, ty: dims.h / 2 - wy * k2 };
    viewRef.current = next;
    setView(next);
  };

  const resetView = () => {
    const next = { k: 1, tx: 0, ty: 0 };
    viewRef.current = next;
    setView(next);
  };

  const onPointerDown = (e: React.PointerEvent, node?: Positioned) => {
    if (mini && !node) return; // panel: nodes stay draggable, background doesn't pan
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragging.current = { node, moved: 0, x: e.clientX, y: e.clientY, panning: !node };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = dragging.current;
    if (!st) return;
    st.moved += Math.abs(e.clientX - st.x) + Math.abs(e.clientY - st.y);
    st.x = e.clientX;
    st.y = e.clientY;
    if (st.node) {
      const live = simRef.current?.nodes().find((n) => n.id === st.node!.id);
      if (live) {
        const w = toWorld(e.clientX, e.clientY);
        live.fx = w.x;
        live.fy = w.y;
        // keep the copy in sync so the frame that re-renders after the sim
        // tick already shows the dragged position
        st.node.fx = w.x;
        st.node.fy = w.y;
        simRef.current?.alphaTarget(0.25).restart();
        setPositions((prev) => [...prev]);
      }
    } else if (st.panning) {
      const v = viewRef.current;
      const next = { ...v, tx: v.tx + e.movementX, ty: v.ty + e.movementY };
      viewRef.current = next;
      setView(next);
    }
  };

  /**
   * Termination for EVERY gesture, one place: node drags retarget pointerup
   * to the captured `<g>`, which bubbles up here; background pans target the
   * svg directly. `pointercancel` (touch scroll handover) clears too.
   */
  const releaseGesture = () => {
    const st = dragging.current;
    dragging.current = null;
    if (st?.node) {
      const live = simRef.current?.nodes().find((n) => n.id === st.node!.id);
      if (live) {
        live.fx = undefined;
        live.fy = undefined;
      }
      simRef.current?.alphaTarget(0);
    }
    return st;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const st = releaseGesture();
    if (!st) return;
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    // gentle click (no drag) navigates
    if (st.node && st.moved < 6) {
      const splat = st.node.id === 'index' ? undefined : st.node.id;
      void router.navigate({ to: '/docs/$', params: { _splat: splat } });
    }
  };

  // safety net: a release outside the svg (capture failed) still ends the gesture
  useEffect(() => {
    const clear = () => void releaseGesture();
    window.addEventListener('pointerup', clear);
    window.addEventListener('pointercancel', clear);
    return () => {
      window.removeEventListener('pointerup', clear);
      window.removeEventListener('pointercancel', clear);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = new Map(positions.map((n) => [n.id, n]));

  return (
    <div className={mini ? 'relative' : 'relative h-full w-full min-w-0'}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        height={height}
        className={mini ? 'w-full touch-none select-none' : 'h-full w-full min-w-0 touch-none select-none'}
        style={mini ? { aspectRatio: `auto ${dims.w} / ${dims.h}` } : undefined}
      onPointerDown={(e) => {
        // background or edge → pan (full view only; `mini` returns early)
        const t = e.target as Element;
        if (!mini && (t.tagName === 'svg' || t.tagName === 'LINE')) onPointerDown(e, undefined);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="img"
      aria-label={'Topic graph of the Nozzle documentation'}
    >
      <defs>
        <marker
          id={markerId}
          markerWidth={7}
          markerHeight={7}
          refX={6}
          refY={3.5}
          orient="auto"
        >
          <path d="M0,0 L7,3.5 L0,7 Z" fill="var(--color-fd-border)" />
        </marker>
      </defs>
      <g transform={`translate(${view.tx},${view.ty}) scale(${view.k})`}>
        {edges.map(([a, b]) => {
          const from = byId.get(a);
          const to = byId.get(b);
          if (!from || !to) return null;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          // trim the ends by node radii so arrows touch the rims
          const x1 = from.x + ux * (from.r - 1);
          const y1 = from.y + uy * (from.r - 1);
          const x2 = to.x - ux * (to.r + 3);
          const y2 = to.y - uy * (to.r + 3);
          const highlight = !!focusId && (a === focusId || b === focusId);
          return (
            <line
              key={`${a}-${b}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--color-fd-border)"
              strokeWidth={highlight ? 2 : 1.25}
              markerEnd={`url(#${markerId})`}
            />
          );
        })}
        {positions.map((n) => {
          const isFocus = n.id === focusId;
          return (
            <g
              key={n.id}
              onPointerDown={(e) => onPointerDown(e, n)}
              style={{ cursor: 'pointer' }}
            >
              <title>{n.title}</title>
              <circle
                cx={n.x}
                cy={n.y}
                r={n.r}
                fill={sectionFill[n.section] ?? 'var(--color-fd-muted-foreground)'}
                stroke={isFocus ? 'var(--color-fd-foreground)' : 'none'}
                strokeWidth={2}
              />
              <text
                x={n.x}
                y={n.y + n.r + 11}
                textAnchor="middle"
                fontSize={mini ? 11 : 11}
                fill="var(--color-fd-muted-foreground)"
                style={{ pointerEvents: 'none' }}
              >
                {n.title.length > (mini ? 24 : 26) ? `${n.title.slice(0, mini ? 23 : 25)}…` : n.title}
              </text>
            </g>
          );
        })}
      </g>
      </svg>
      <div
        className={
          mini
            ? 'absolute bottom-1 end-1 flex flex-col gap-1'
            : 'absolute bottom-3 end-3 flex flex-col gap-1.5'
        }
      >
        <CtrlBtn small={mini} onClick={() => zoomBy(1.25)} label="Zoom in" d={ZOOM_IN_ICON} />
        <CtrlBtn small={mini} onClick={() => zoomBy(1 / 1.25)} label="Zoom out" d={ZOOM_OUT_ICON} />
        <CtrlBtn small={mini} onClick={resetView} label="Fit view" d={FIT_ICON} />
      </div>
    </div>
  );
}

/** "Linked from" — pages whose content or frontmatter points here. */
export function Backlinks({ slug }: { slug: string }) {
  const incoming = graphData.edges.filter(([, to]) => to === slug).map(([from]) => from);
  if (incoming.length === 0) return null;
  const titleOf = (id: string) => graphData.nodes.find((n) => n.id === id)?.title ?? id;
  return (
    <section className="mt-12 border-t pt-6">
      <h2 className="mb-3 text-sm font-medium text-fd-muted-foreground">Linked from</h2>
      <div className="flex flex-wrap gap-2">
        {incoming.map((id) => (
          <Link
            key={id}
            to="/docs/$"
            params={{ _splat: id === 'index' ? undefined : id }}
            className="rounded-lg border bg-fd-secondary px-2.5 py-1.5 text-sm text-fd-secondary-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
          >
            {titleOf(id)}
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Right-column panel: the current page's local graph + link to the vault-wide view. */
export function TopicGraphPanel({ slug }: { slug: string }) {
  const sub = useMemo(() => neighborhood(slug), [slug]);
  return (
    <div className="mt-6">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground">Topic graph</h3>
        <Link
          to="/docs/graph"
          className="text-xs text-fd-muted-foreground transition-colors hover:text-fd-accent-foreground"
        >
          full graph →
        </Link>
      </div>
      <GraphView variant="mini" focusId={slug} {...sub} />
    </div>
  );
}

/** Whole-vault board for /docs/graph. */
export function GraphBoard() {
  return (
    <div className="flex h-[calc(100dvh-var(--fd-docs-row-3,3.5rem))] w-full min-w-0 max-w-none flex-col gap-3 p-4 md:p-6 xl:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Topic graph</h1>
        <p className="flex flex-wrap items-center gap-3 text-sm text-fd-muted-foreground">
          guide legend:
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-full" style={{ background: sectionFill['guide'] }} /> guide
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-full" style={{ background: sectionFill['code'] }} /> code
          </span>
          <span className="hidden sm:inline">· drag nodes, use ± / wheel to zoom, click to open</span>
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-fd-card">
        <GraphView variant="full" nodes={graphData.nodes} edges={graphData.edges} />
      </div>
    </div>
  );
}
