// Interactive canvas. React renders the tree once per layout; everything that
// changes every frame (pan, zoom, sticky labels, time ticks, culling) is
// applied imperatively inside requestAnimationFrame.
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, type ReactElement } from "react";
import type { Lang, Lod, TechNode } from "../types";
import { LOD_TEXT_SCALE, TOP, type Layout, type TaxIndex } from "../lib/layout";
import { formatNow, tickKind, T0, type TimeScale } from "../lib/time";
import { monthLabel, t } from "../i18n";
import { TreeLayer } from "./TreeLayer";

export interface CanvasHandle {
  fit(): void;
  zoomBy(factor: number): void;
  toRoots(): void;
  toTop(): void;
  focusZone(id: string): void;
  /** Keep the current view steady across the next layout change (language, time mode, clock tick). */
  holdAnchor(): void;
}

interface Props {
  layout: Layout;
  scale: TimeScale;
  index: TaxIndex;
  nodesById: Map<string, TechNode>;
  lang: Lang;
  lod: Lod;
  onLodChange(lod: Lod): void;
  selectedId: string | null;
  focusRequest: { id: string; nonce: number } | null;
  onSelect(id: string): void;
  query: string;
  activeTag: string | null;
  showLinks: boolean;
  cursorM: number | null;
  now: Date;
  panelOpen: boolean;
  onZoneClick(id: string): void;
}

const MIN_K = 0.25, MAX_K = 2;
const LABEL_TOP = 142; // sticky labels hide under the header/axis above this y
const MIN_K_FOR_LOD: Record<Lod, number> = { 0: 0.25, 1: 0.75, 2: 1.25 };
const PANEL_W = 380;

/** Level of detail for a zoom factor, with hysteresis so it doesn't flicker at the thresholds. */
function lodFor(k: number, current: Lod): Lod {
  if (current === 0) return k >= 1.2 ? 2 : k >= 0.55 ? 1 : 0;
  if (current === 1) return k < 0.47 ? 0 : k >= 1.2 ? 2 : 1;
  return k < 0.47 ? 0 : k < 1.08 ? 1 : 2;
}

const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const mx = (a.x + b.x) / 2;
  return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
};

const LinksLayer = memo(function LinksLayer({ layout, nodesById, index, selectedId, showLinks }: {
  layout: Layout; nodesById: Map<string, TechNode>; index: TaxIndex; selectedId: string | null; showLinks: boolean;
}) {
  const pos = layout.positions;
  const paths: ReactElement[] = [];
  if (showLinks) for (const [id, p] of pos) for (const parent of p.node.parents) {
    const pp = pos.get(parent);
    if (pp) paths.push(<path key={`a-${parent}-${id}`} d={curve(pp, p)} className="link bg" />);
  }
  const sel = selectedId ? pos.get(selectedId) : undefined;
  if (sel) {
    for (const parent of sel.node.parents) {
      const pp = pos.get(parent);
      if (pp) paths.push(<path key={`p-${parent}`} d={curve(pp, sel)} className="link" stroke={index.colorOfBranch(pp.node.branch)} />);
    }
    for (const [id, p] of pos) if (p.node.parents.includes(sel.node.id))
      paths.push(<path key={`c-${id}`} d={curve(sel, p)} className="link child" stroke={index.colorOfBranch(nodesById.get(id)!.branch)} />);
  }
  return <g className="links">{paths}</g>;
});

export const TreeCanvas = forwardRef<CanvasHandle, Props>(function TreeCanvas(props, ref) {
  const { layout, scale, index, nodesById, lang, lod, onLodChange, selectedId, focusRequest, onSelect,
    query, activeTag, showLinks, cursorM, now, panelOpen, onZoneClick } = props;

  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const nowTagRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  const view = useRef({ x: 0, y: 0, k: 0.48 });
  const frame = useRef(0);
  const pending = useRef<{ lod?: Lod; anchor?: { id: string; sy: number } | null; timeM?: number; fit?: boolean; zone?: string }>({});
  const fitted = useRef(false);
  // Mutable mirrors so the rAF loop always sees current props without re-binding listeners.
  const live = useRef({ layout, scale, lod, lang, now, cursorM, panelOpen });
  live.current = { layout, scale, lod, lang, now, cursorM, panelOpen };
  const nodeEls = useRef<{ el: SVGGElement; x: number; y: number; culled: boolean }[]>([]);
  const labelEls = useRef<{ el: HTMLElement; y: number; hidden: boolean }[]>([]);

  const viewWidth = () => {
    const w = hostRef.current?.clientWidth ?? innerWidth;
    return w - (live.current.panelOpen && w > 720 ? PANEL_W : 0);
  };

  // ---------------------------------------------------------------- per-frame
  const applyNow = useCallback(() => {
    frame.current = 0;
    const svg = svgRef.current, world = worldRef.current, host = hostRef.current;
    if (!svg || !world || !host) return;
    const { layout, scale, lod, lang, now, cursorM } = live.current;
    const v = view.current;
    const W = host.clientWidth, H = host.clientHeight;

    // Switch level of detail when the zoom crosses a threshold; keep the nearest milestone still.
    const want = lodFor(v.k, lod);
    if (want !== lod && pending.current.lod === undefined) {
      let best: { id: string; sy: number } | null = null, bestD = Infinity;
      for (const [id, p] of layout.positions) {
        if (p.node.level !== 1) continue;
        const sy = v.y + p.y * v.k, sx = v.x + p.x * v.k;
        const d = Math.abs(sy - H / 2) + Math.abs(sx - W / 2) * 0.2;
        if (d < bestD) { bestD = d; best = { id, sy }; }
      }
      pending.current = { ...pending.current, lod: want, anchor: best };
      onLodChange(want);
    }

    world.setAttribute("transform", `translate(${v.x} ${v.y}) scale(${v.k})`);
    // Counter-scale labels when zoomed out so they stay readable (one CSS variable, no per-node work).
    svg.style.setProperty("--s", String(Math.min(Math.max(1 / v.k, 1), LOD_TEXT_SCALE[lod])));
    svg.classList.toggle("compact", lod === 0 || v.k < 0.72);

    // Viewport culling: hide nodes far outside the screen.
    const margin = 400;
    for (const n of nodeEls.current) {
      const sx = v.x + n.x * v.k, sy = v.y + n.y * v.k;
      const out = sx < -margin || sx > W + margin || sy < -margin || sy > H + margin;
      if (out !== n.culled) { n.culled = out; n.el.style.display = out ? "none" : ""; }
    }

    // Sticky labels on the left edge.
    for (const l of labelEls.current) {
      const sy = v.y + l.y * v.k;
      const hide = sy < LABEL_TOP || sy > H - 64; // keep clear of the bottom controls
      if (hide !== l.hidden) { l.hidden = hide; l.el.style.visibility = hide ? "hidden" : ""; }
      if (!hide) l.el.style.transform = `translate3d(0,${sy}px,0)`;
    }

    // Time axis: only months inside the viewport; years first, then quarters, then months.
    const grid = gridRef.current!, axis = axisRef.current!;
    const xNowS = v.x + scale.xNow * v.k;
    const mLeft = Math.max(0, Math.floor(scale.m((0 - v.x) / v.k)));
    const mRight = Math.min(Math.floor(scale.nowM) + 3, Math.ceil(scale.m((W - v.x) / v.k)));
    const taken = [xNowS];
    const chosen: { sx: number; m: number; kind: string }[] = [];
    for (const kind of ["y", "q", "m"] as const) {
      for (let m = mLeft; m <= mRight; m++) {
        if (tickKind(m) !== kind) continue;
        const sx = v.x + scale.x(m) * v.k;
        if (sx < 60 || sx > W - 10) continue;
        const gap = kind === "y" ? 44 : 40;
        if (taken.some((x) => Math.abs(x - sx) < gap)) continue;
        taken.push(sx); chosen.push({ sx, m, kind });
      }
    }
    syncPool(grid, chosen.length, "gridline");
    syncPool(axis, chosen.length, "tick");
    chosen.forEach((c, i) => {
      const line = grid.children[i] as HTMLElement, label = axis.children[i] as HTMLElement;
      line.style.transform = label.style.transform = `translate3d(${c.sx}px,0,0)`;
      line.className = `gridline ${c.kind}`;
      label.className = `tick ${c.kind}`;
      label.textContent = c.kind === "y" ? String(T0 + c.m / 12) : monthLabel(c.m % 12, lang);
    });

    const tag = nowTagRef.current!;
    tag.style.transform = `translate3d(${Math.min(xNowS - 4, W - 160)}px,0,0)`;
    tag.lastElementChild!.textContent = `${t(lang, "nowTag")} ${formatNow(now)}`;

    const cur = cursorRef.current!;
    if (cursorM === null) cur.style.display = "none";
    else { cur.style.display = ""; cur.style.transform = `translate3d(${v.x + scale.x(cursorM) * v.k}px,0,0)`; }
  }, [onLodChange]);

  const apply = useCallback(() => { if (!frame.current) frame.current = requestAnimationFrame(applyNow); }, [applyNow]);

  // ---------------------------------------------------------------- view ops
  const doFit = useCallback(() => {
    const narrow = (hostRef.current?.clientWidth ?? innerWidth) <= 720;
    const v = view.current, L = live.current.layout, w = viewWidth();
    v.k = narrow ? 0.4 : 0.48;
    v.x = L.width * v.k < w - 20 ? 20 - 100 * v.k : w - (live.current.scale.xNow + (narrow ? 60 : 330)) * v.k;
    v.y = 150 - (TOP - 62) * v.k;
    apply();
  }, [apply]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    const v = view.current;
    const k = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
    const f = k / v.k;
    v.x = cx - (cx - v.x) * f; v.y = cy - (cy - v.y) * f; v.k = k;
    apply();
  }, [apply]);

  useImperativeHandle(ref, () => ({
    fit() {
      if (live.current.lod !== 0) { pending.current = { ...pending.current, fit: true, lod: 0 }; onLodChange(0); }
      else doFit();
    },
    zoomBy(f) { zoomAt(f, viewWidth() / 2, (hostRef.current?.clientHeight ?? innerHeight) / 2); },
    toRoots() { const g = live.current.layout.groundY; if (g !== null) { view.current.y = 160 - g * view.current.k; apply(); } },
    toTop() { view.current.y = 150 - (TOP - 62) * view.current.k; apply(); },
    focusZone(id) {
      if (live.current.lod === 0) { view.current.k = 0.75; pending.current = { ...pending.current, zone: id, lod: 1 }; onLodChange(1); return; }
      const zr = live.current.layout.zoneRows.find((r) => r.zone.id === id);
      if (zr) { view.current.y = 165 - zr.y * view.current.k; apply(); }
    },
    holdAnchor() {
      const v = view.current, H = hostRef.current?.clientHeight ?? innerHeight;
      pending.current.timeM = live.current.scale.m((viewWidth() / 2 - v.x) / v.k);
      let best: { id: string; sy: number } | null = null, bestD = Infinity;
      for (const [id, p] of live.current.layout.positions) {
        const sy = v.y + p.y * v.k, d = Math.abs(sy - H / 2);
        if (p.node.level === 1 && d < bestD) { bestD = d; best = { id, sy }; }
      }
      pending.current.anchor = best;
    },
  }), [apply, doFit, onLodChange, zoomAt]);

  // ---------------------------------------------------------------- after each layout
  useLayoutEffect(() => {
    const world = worldRef.current!;
    nodeEls.current = [...world.querySelectorAll<SVGGElement>("g.node")].map((el) => {
      const p = layout.positions.get(el.dataset.id!)!;
      return { el, x: p.x, y: p.y, culled: false };
    });
    labelEls.current = [...labelsRef.current!.querySelectorAll<HTMLElement>("[data-y]")].map((el) => ({ el, y: Number(el.dataset.y), hidden: false }));

    const v = view.current, P = pending.current;
    if (!fitted.current) { fitted.current = true; doFit(); }
    if (P.timeM !== undefined) v.x = viewWidth() / 2 - scale.x(P.timeM) * v.k;
    if (P.anchor) { const p = layout.positions.get(P.anchor.id); if (p) v.y = P.anchor.sy - p.y * v.k; }
    if (P.fit) doFit();
    if (P.zone) { const zr = layout.zoneRows.find((r) => r.zone.id === P.zone); if (zr) v.y = 165 - zr.y * v.k; }
    if (P.lod === undefined || P.lod === lod) pending.current = {};
    applyNow();
  }, [layout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Center on a node the app asked to focus (after its layout is ready).
  useLayoutEffect(() => {
    if (!focusRequest) return;
    const p = layout.positions.get(focusRequest.id);
    if (!p) return;
    const v = view.current, H = hostRef.current?.clientHeight ?? innerHeight;
    v.k = Math.max(v.k, MIN_K_FOR_LOD[lod]);
    v.x = viewWidth() / 2 - p.x * v.k;
    v.y = (innerWidth > 720 ? H / 2 : H * 0.19) + 40 - p.y * v.k;
    applyNow();
  }, [focusRequest, layout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Playback cursor: fade nodes that haven't happened yet (class toggle only).
  useEffect(() => {
    for (const { el } of nodeEls.current) el.classList.toggle("notyet", cursorM !== null && Number(el.dataset.t) > cursorM);
    apply();
  }, [cursorM, layout, apply]);

  useEffect(() => { apply(); }, [now, panelOpen, lang, apply]);

  // ---------------------------------------------------------------- input
  useEffect(() => {
    const host = hostRef.current!, svg = svgRef.current!;
    const pts = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
    let moved = false;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) { zoomAt(Math.exp(-Math.max(-30, Math.min(30, e.deltaY)) * 0.008), e.clientX, e.clientY); return; }
      const v = view.current;
      v.x -= e.shiftKey ? e.deltaY : e.deltaX;
      v.y -= e.shiftKey ? 0 : e.deltaY;
      apply();
    };
    const onDown = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { moved = false; drag = { x: e.clientX, y: e.clientY, vx: view.current.x, vy: view.current.y, moved: false }; svg.classList.add("dragging"); }
      host.dispatchEvent(new CustomEvent("canvas-interact"));
    };
    const onMove = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const other = [...pts.entries()].find(([id]) => id !== e.pointerId)![1];
        const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(a.x - b.x, a.y - b.y);
        if (d0 > 0) zoomAt(d1 / d0, (a.x + b.x) / 2, (a.y + b.y) / 2);
        drag = null; moved = true;
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      view.current.x = drag.vx + dx; view.current.y = drag.vy + dy;
      apply();
    };
    const onUp = (e: PointerEvent) => { pts.delete(e.pointerId); if (!pts.size) { drag = null; svg.classList.remove("dragging"); } };
    // One delegated click handler for all nodes.
    const onClick = (e: MouseEvent) => {
      if (moved) return;
      const g = (e.target as Element).closest<SVGGElement>("g.node");
      if (g?.dataset.id) onSelect(g.dataset.id);
    };
    const ro = new ResizeObserver(() => apply());
    ro.observe(host);
    svg.addEventListener("wheel", onWheel, { passive: false });
    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
    svg.addEventListener("click", onClick);
    return () => {
      ro.disconnect();
      svg.removeEventListener("wheel", onWheel);
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
      svg.removeEventListener("click", onClick);
    };
  }, [apply, zoomAt, onSelect]);

  // ---------------------------------------------------------------- render
  return (
    <div className="canvas" ref={hostRef}>
      <div className="grid" ref={gridRef} aria-hidden />
      <svg ref={svgRef} className="tree" role="img" aria-label={t(lang, "docTitle")}>
        <g ref={worldRef}>
          <LinksLayer layout={layout} nodesById={nodesById} index={index} selectedId={selectedId} showLinks={showLinks} />
          <TreeLayer layout={layout} scale={scale} index={index} lang={lang} lod={lod} selectedId={selectedId} query={query} activeTag={activeTag} />
        </g>
      </svg>
      <div className="axis" aria-hidden>
        <div className="ticks" ref={axisRef} />
        <div className="nowtag" ref={nowTagRef}><i /><span /></div>
      </div>
      <div className="cursorline" ref={cursorRef} aria-hidden />
      <div className="sticky" ref={labelsRef}>
        {layout.groundY !== null && (
          <>
            <div className="groundlabel" data-y={layout.groundY - 22}>{t(lang, "aboveGround")}</div>
            <div className="groundlabel" data-y={layout.groundY + 6}>{t(lang, "underground")}</div>
          </>
        )}
        {layout.zoneRows.map(({ zone, y }) => {
          const count = [...nodesById.values()].filter((n) => index.zoneOfNode(n).id === zone.id).length;
          return (
            <button key={zone.id} className="zonehead" data-y={y - 14} style={{ borderColor: zone.color, color: zone.color }}
              onClick={() => onZoneClick(zone.id)}>
              {zone.name[lang]}<small>{zone.description[lang]} · {t(lang, "nodes", { n: count })}</small>
            </button>
          );
        })}
        {layout.layerRows.map(({ layer, zone, y }) => (
          <div key={layer.id} className="layerlabel" data-y={y - 8} style={{ color: zone.color }}>{layer.id}  {layer.name[lang]}</div>
        ))}
        {layout.lanes.filter((l) => !l.summary).map((l) => (
          <div key={l.key} className={`lanelabel${l.isSub ? " sub" : ""}`} data-y={l.y - 22} style={{ color: l.color, borderColor: `${l.color}66` }}>
            {l.isSub ? "└ " : ""}{l.label}
          </div>
        ))}
      </div>
    </div>
  );
});

/** Grow or shrink a container to exactly n pooled children (reused across frames). */
function syncPool(container: HTMLElement, n: number, cls: string) {
  while (container.children.length < n) { const d = document.createElement("div"); d.className = cls; container.appendChild(d); }
  while (container.children.length > n) container.lastElementChild!.remove();
}
