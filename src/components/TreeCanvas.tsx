// Interactive canvas. React renders the tree once per layout; everything that
// changes every frame (pan, zoom, sticky labels, time ticks, culling) is
// applied imperatively inside requestAnimationFrame.
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, type ReactElement } from "react";
import type { Lang, Lod, TechNode } from "../types";
import { TOP, TRUNK_X, type Layout, type TaxIndex } from "../lib/layout";
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
  /** Fit the view once the next layout is ready (e.g. after the focus hides branches). */
  fitAfterLayout(): void;
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
  /** Nodes outside the reader's focus are dimmed (in "hide" mode they are not in the layout at all). */
  inFocus(n: TechNode): boolean;
  showLinks: boolean;
  cursorM: number | null;
  now: Date;
  panelOpen: boolean;
  onZoneClick(id: string): void;
}

const MIN_K = 0.25, MAX_K = 2;
const LABEL_TOP = 142; // sticky labels hide under the header/axis above this y
// Sticky spine (screen px): the trunk sits at the world trunk's x, but never left of SPINE_MIN.
// A lane bends out of the trunk and starts at ELBOW; a sub-branch forks off its parent at
// FORK and starts at SUB.
const SPINE_MIN = 18, ELBOW = 30, FORK = 40, SUB = 64, BEND = 24;
// Lane names repeat along each lane roughly this far apart (screen px).
const PILL_GAP = 560;
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

interface NodeEl { el: SVGGElement; x: number; y: number; culled: boolean; above: boolean; t: number; w: number; dw: number; nolab: boolean; left: boolean }

/** One lane as the per-frame code sees it: its two world paths and its spine pieces. */
interface LaneEl {
  key: string; y: number; xe: number; xEnd: number; isSub: boolean; summary: boolean; parentY: number | null;
  label: string; color: string; nodes: TechNode[]; unfocus: boolean; xs: number[]; labelW: number; pillW: number;
  limb: SVGPathElement; stale: SVGPathElement; bend: SVGGElement | null; fork: SVGPathElement | null; forkDot: SVGCircleElement | null;
}

// Label widths come from canvas measureText with each label's computed font, which also
// works for labels that are currently hidden (getComputedTextLength would return 0).
let measureCtx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();
/** Width of a repeated lane-name pill (see .lanepill): its text plus padding and border. */
function pillWidth(text: string): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 11 + 18;
  measureCtx.font = `600 11px ${getComputedStyle(document.documentElement).getPropertyValue("--font-ui")}`;
  return measureCtx.measureText(text).width + 18;
}

function measure(el: SVGTextElement | null): number {
  if (!el) return 0;
  const cs = getComputedStyle(el);
  let text = el.firstChild?.textContent ?? "";
  if (cs.textTransform === "uppercase") text = text.toUpperCase();
  const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const key = font + "|" + cs.letterSpacing + "|" + text;
  let w = widthCache.get(key);
  if (w === undefined) {
    measureCtx ??= document.createElement("canvas").getContext("2d");
    if (!measureCtx) return text.length * 7;
    measureCtx.font = font;
    w = measureCtx.measureText(text).width + (parseFloat(cs.letterSpacing) || 0) * text.length;
    if (el.querySelector(".badge-fresh")) w += 32;
    widthCache.set(key, w);
  }
  return w;
}

/** Lower is more important: it claims screen space first. */
function rank(c: DOMTokenList): number {
  if (c.contains("sel")) return 0;
  if (c.contains("hit")) return 1;
  if (c.contains("dim") || c.contains("untag") || c.contains("notyet") || c.contains("unfocus")) return 9;
  if (c.contains("fresh")) return 2;
  if (c.contains("l1")) return 3;
  if (c.contains("recent") || c.contains("future")) return 4;
  return c.contains("l2") ? 5 : 6;
}

/** Greedy label placement: labels keep a constant on-screen size, so instead of shrinking
 *  them when zoomed out we hide the ones that would overlap a more important label. */
function declutter(items: NodeEl[], k: number, compact: boolean) {
  const order = items.map((n) => ({ n, r: rank(n.el.classList) })).sort((a, b) => a.r - b.r || b.n.t - a.n.t);
  const CELL = 64, grid = new Map<number, number[][]>();
  const keyOf = (gx: number, gy: number) => (gx + 30000) * 60000 + (gy + 30000);
  const add = (box: number[]) => {
    for (let gx = Math.floor(box[0] / CELL); gx <= Math.floor(box[1] / CELL); gx++)
      for (let gy = Math.floor(box[2] / CELL); gy <= Math.floor(box[3] / CELL); gy++) {
        const key = keyOf(gx, gy), list = grid.get(key);
        if (list) list.push(box); else grid.set(key, [box]);
      }
  };
  // Markers are obstacles too: a label never runs over another node's dot.
  for (const n of items) if (!n.el.classList.contains("notyet")) add([n.x * k - 7, n.x * k + 7, n.y * k - 7, n.y * k + 7]);
  const hits = (box: number[]) => {
    for (let gx = Math.floor(box[0] / CELL); gx <= Math.floor(box[1] / CELL); gx++)
      for (let gy = Math.floor(box[2] / CELL); gy <= Math.floor(box[3] / CELL); gy++)
        for (const b of grid.get(keyOf(gx, gy)) ?? [])
          if (box[0] < b[1] && box[1] > b[0] && box[2] < b[3] && box[3] > b[2]) return true;
    return false;
  };
  for (const { n, r } of order) {
    const c = n.el.classList;
    let show = !(compact && c.contains("minor")) && !(c.contains("unfocus") && r !== 0), left = false;
    if (show) {
      const withDate = !compact, sx = n.x * k, sy = n.y * k;
      const w = Math.max(n.w, withDate ? n.dw : 0) + 4;
      const y0 = sy + (n.above ? -15 : -9), y1 = sy + (n.above ? (withDate ? 14 : 3) : (withDate ? 21 : 8));
      // Prefer the right of the dot; fall back to the left; otherwise hide (the selection always shows).
      let box = [sx + 9, sx + 11 + w, y0, y1];
      if (hits(box)) {
        const alt = [sx - 11 - w, sx - 9, y0, y1];
        if (!hits(alt)) { box = alt; left = true; } else show = r === 0;
      }
      if (show) add(box);
    }
    if (n.nolab === show) { n.nolab = !show; n.el.classList.toggle("nolab", !show); }
    if (n.left !== left) { n.left = left; n.el.classList.toggle("lft", left); }
  }
}

export const TreeCanvas = forwardRef<CanvasHandle, Props>(function TreeCanvas(props, ref) {
  const { layout, scale, index, nodesById, lang, lod, onLodChange, selectedId, focusRequest, onSelect,
    query, activeTag, inFocus, showLinks, cursorM, now, panelOpen, onZoneClick } = props;

  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const spineRef = useRef<SVGSVGElement>(null);
  const trunkRef = useRef<SVGLineElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);
  const nowTagRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  const view = useRef({ x: 0, y: 0, k: 0.48 });
  const frame = useRef(0);
  const pending = useRef<{ lod?: Lod; anchor?: { id: string; sy: number } | null; timeM?: number; fit?: boolean; zone?: string }>({});
  const fitted = useRef(false);
  // Mutable mirrors so the rAF loop always sees current props without re-binding listeners.
  const live = useRef({ layout, scale, lod, lang, now, cursorM, panelOpen });
  live.current = { layout, scale, lod, lang, now, cursorM, panelOpen };
  const nodeEls = useRef<NodeEl[]>([]);
  // Label decluttering depends only on zoom (not pan), so it reruns when k or the inputs change.
  const declutterKey = useRef("");
  const labelEls = useRef<{ el: HTMLElement; y: number; dy: number; sx: number | null; hidden: boolean }[]>([]);
  const fadeRef = useRef<HTMLDivElement>(null);
  const fadeW = useRef(-1);
  const laneEls = useRef<LaneEl[]>([]);
  const spineMarks = useRef<{ el: SVGElement; y: number }[]>([]);
  const trunkEnd = useRef<{ y: number; ground: boolean } | null>(null); // the last lane that bends out of the trunk

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
    // Labels and markers keep a constant on-screen size at every zoom (one CSS variable, no per-node work).
    svg.style.setProperty("--s", String(1 / v.k));
    const compact = lod === 0 || v.k < 0.72;
    svg.classList.toggle("compact", compact);
    const dk = `${v.k.toFixed(4)}|${compact}`;
    if (dk !== declutterKey.current) { declutterKey.current = dk; declutter(nodeEls.current, v.k, compact); }

    // Viewport culling: hide nodes far outside the screen, and nodes that have slid under the
    // sticky spine (their labels would otherwise poke out from behind it).
    const margin = 400, spineCut = Math.max(SPINE_MIN, v.x + TRUNK_X * v.k) + ELBOW;
    for (const n of nodeEls.current) {
      const sx = v.x + n.x * v.k, sy = v.y + n.y * v.k;
      const out = sx < spineCut || sx > W + margin || sy < -margin || sy > H + margin;
      if (out !== n.culled) { n.culled = out; n.el.style.display = out ? "none" : ""; }
    }

    // Sticky spine: the trunk follows the world trunk but stops at the left edge, so every lane
    // keeps a visible bend into the trunk (and every sub-branch its fork) at any zoom or pan.
    const SX = Math.max(SPINE_MIN, v.x + TRUNK_X * v.k);
    const toWorld = (sx: number) => (sx - v.x) / v.k;
    for (const m of spineMarks.current) m.el.setAttribute("transform", `translate(${SX} ${v.y + m.y * v.k})`);
    // Fade out whatever passes under the spine, so labels never run through the trunk.
    const fw = Math.round(SX + 14);
    if (fw !== fadeW.current) { fadeW.current = fw; fadeRef.current!.style.width = `${fw}px`; }
    const trunk = trunkRef.current!;
    trunk.setAttribute("x1", String(SX)); trunk.setAttribute("x2", String(SX));
    const end = trunkEnd.current;
    trunk.setAttribute("y1", String(v.y + (TOP - 46) * v.k));
    trunk.setAttribute("y2", String(end ? v.y + end.y * v.k + (end.ground ? -BEND : BEND) : v.y + (TOP - 46) * v.k));
    for (const l of laneEls.current) {
      const sy = v.y + l.y * v.k;
      const x0 = toWorld(SX + (l.fork ? SUB : ELBOW)), solidEnd = Math.max(x0, l.xe);
      l.limb.setAttribute("d", l.xe > x0 ? `M${x0},${l.y} L${l.xe},${l.y}` : "");
      l.stale.setAttribute("d", l.xEnd > solidEnd ? `M${solidEnd},${l.y} L${l.xEnd},${l.y}` : "");
      if (l.bend) l.bend.setAttribute("transform", `translate(${SX} ${sy})`);
      if (l.fork && l.forkDot && l.parentY !== null) {
        const py = v.y + l.parentY * v.k, a = SX + FORK, b = SX + SUB;
        l.fork.setAttribute("d", `M${a},${py} C${a + 16},${py} ${b - 16},${sy} ${b},${sy}`);
        l.forkDot.setAttribute("transform", `translate(${a} ${py})`);
      }
    }

    // Sticky labels on the left edge.
    let lastSy = -Infinity;
    for (const l of labelEls.current) { // sorted by y
      const sy = v.y + l.y * v.k + l.dy;
      // Keep clear of the header and bottom controls, and never stack two captions on one line.
      const hide = sy < LABEL_TOP || sy > H - 64 || sy - lastSy < 18;
      if (!hide) lastSy = sy;
      if (hide !== l.hidden) { l.hidden = hide; l.el.style.visibility = hide ? "hidden" : ""; }
      if (!hide) l.el.style.transform = `translate3d(${l.sx === null ? 0 : SX + l.sx}px,${sy}px,0)`;
    }

    // Lane names repeat along each lane, like line names on a metro map. Anchors sit on a world
    // grid whose spacing only changes at powers of two, so they move with the map instead of
    // jittering while you zoom. An anchor is skipped where a node's stem crosses the lane.
    const pills: { l: LaneEl; sx: number; sy: number }[] = [];
    const gap = 2 ** Math.round(Math.log2(PILL_GAP / v.k));
    for (const l of laneEls.current) {
      if (l.summary || pills.length > 80) continue;
      const sy = v.y + l.y * v.k;
      if (sy < LABEL_TOP + 12 || sy > H - 72) continue;
      const from = SX + (l.fork ? SUB : ELBOW) + l.labelW + 90;
      const to = Math.min(W - l.pillW - 12, v.x + l.xEnd * v.k - l.pillW - 8);
      const pad = 14 / v.k, pw = l.pillW / v.k;
      for (let aw = Math.ceil(toWorld(from) / gap) * gap; v.x + aw * v.k <= to; aw += gap)
        if (!l.xs.some((x) => x > aw - pad && x < aw + pw + pad)) pills.push({ l, sx: v.x + aw * v.k, sy });
    }
    const pillBox = pillsRef.current!;
    syncPool(pillBox, pills.length, "lanepill");
    pills.forEach((p, i) => {
      const el = pillBox.children[i] as HTMLElement;
      if (el.textContent !== p.l.label) el.textContent = p.l.label;
      el.style.color = p.l.color;
      el.classList.toggle("unfocus", p.l.unfocus);
      el.style.transform = `translate3d(${p.sx}px,${p.sy}px,0)`;
    });

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
    fitAfterLayout() { pending.current = { ...pending.current, fit: true }; },
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
      const [title, date] = el.querySelectorAll("text");
      el.classList.remove("nolab", "lft");
      el.style.display = ""; // React may reuse an element we culled under the previous layout
      return { el, x: p.x, y: p.y, culled: false, above: p.above, t: Number(el.dataset.t), w: measure(title), dw: measure(date), nolab: false, left: false };
    });
    declutterKey.current = "";
    labelEls.current = [...labelsRef.current!.querySelectorAll<HTMLElement>("[data-y]")].map((el) => {
      el.style.visibility = "";
      return { el, y: Number(el.dataset.y), dy: Number(el.dataset.dy ?? 0), sx: el.dataset.sx === undefined ? null : Number(el.dataset.sx), hidden: false };
    }).sort((a, b) => a.y - b.y);

    const spine = spineRef.current!;
    spineMarks.current = [...spine.querySelectorAll<SVGElement>("[data-y]")].map((el) => ({ el, y: Number(el.dataset.y) }));
    laneEls.current = [];
    let last: (typeof layout.lanes)[number] | null = null;
    for (const l of layout.lanes) {
      const g = world.querySelector<SVGGElement>(`g.lane[data-lane="${l.key}"]`);
      if (!g) continue;
      const [limb, stale] = g.querySelectorAll<SVGPathElement>(":scope > path");
      const bend = spine.querySelector<SVGGElement>(`[data-bend="${l.key}"]`);
      const forkG = spine.querySelector<SVGGElement>(`[data-fork="${l.key}"]`);
      const parent = forkG ? layout.lanes.find((p) => p.key === forkG.dataset.parent) : undefined;
      const labelEl = labelsRef.current!.querySelector<HTMLElement>(`[data-lane="${l.key}"]`);
      if (bend) last = l;
      laneEls.current.push({
        key: l.key, y: l.y, xe: Number(g.dataset.xe), xEnd: Number(g.dataset.xend), isSub: l.isSub, summary: l.summary,
        parentY: parent ? parent.y : null, label: l.label, color: l.color,
        nodes: l.nodes.map((p) => p.node), unfocus: !l.nodes.some((p) => inFocus(p.node)), xs: l.nodes.map((p) => p.x),
        labelW: labelEl?.offsetWidth ?? 0, pillW: pillWidth(l.label),
        limb, stale, bend, fork: forkG?.querySelector("path") ?? null, forkDot: forkG?.querySelector("circle") ?? null,
      });
    }
    trunkEnd.current = last ? { y: last.y, ground: last.ground } : null;

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
    declutterKey.current = ""; apply();
  }, [cursorM, layout, apply]);

  useEffect(() => { apply(); }, [now, panelOpen, lang, apply]);

  // Selection, search and tag filters change label priorities.
  useEffect(() => {
    for (const l of laneEls.current) l.unfocus = !l.nodes.some(inFocus);
    declutterKey.current = ""; apply();
  }, [selectedId, query, activeTag, inFocus, apply]);

  // A theme or web-font change alters label widths: re-measure and re-place.
  useEffect(() => {
    const remeasure = () => {
      widthCache.clear();
      for (const n of nodeEls.current) { const [a, b] = n.el.querySelectorAll("text"); n.w = measure(a); n.dw = measure(b); }
      for (const l of laneEls.current) l.pillW = pillWidth(l.label);
      const labels = labelsRef.current;
      if (labels) for (const l of laneEls.current) l.labelW = labels.querySelector<HTMLElement>(`[data-lane="${CSS.escape(l.key)}"]`)?.offsetWidth ?? l.labelW;
      declutterKey.current = ""; apply();
    };
    const mo = new MutationObserver(remeasure);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    void document.fonts?.ready.then(remeasure);
    return () => mo.disconnect();
  }, [apply]);

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
          <TreeLayer layout={layout} scale={scale} index={index} lang={lang} lod={lod} selectedId={selectedId} query={query} activeTag={activeTag} inFocus={inFocus} />
        </g>
      </svg>
      <div className="axis" aria-hidden>
        <div className="ticks" ref={axisRef} />
        <div className="nowtag" ref={nowTagRef}><i /><span /></div>
      </div>
      <div className="cursorline" ref={cursorRef} aria-hidden />
      <div className="spinefade" ref={fadeRef} aria-hidden />
      <svg className="spine" ref={spineRef} aria-hidden>
        <line className="trunk" ref={trunkRef} />
        {layout.lanes.map((l) => {
          if (!l.nodes.length) return null;
          const off = l.nodes.some((p) => inFocus(p.node)) ? "" : " unfocus";
          const parent = l.isSub ? layout.lanes.find((p) => p.key === index.branch.get(l.key)?.parent && p.nodes.length) : undefined;
          if (parent) return (
            <g key={l.key} data-fork={l.key} data-parent={parent.key}>
              <path className={`limb sub${off}`} stroke={l.color} />
              <circle r={2.8} className={`forkdot${off}`} stroke={l.color} />
            </g>
          );
          // Branches grow up out of the trunk; below the ground line, roots grow down.
          const b = l.ground ? -BEND : BEND;
          return (
            <g key={l.key} data-bend={l.key}>
              <path className={`limb${l.isSub ? " sub" : ""}${off}`} stroke={l.color} d={`M0,${b} C0,${b * 0.35} ${BEND * 0.35},0 ${BEND},0 L${ELBOW},0`} />
            </g>
          );
        })}
        {layout.layerRows.map(({ layer, y }) => <circle key={layer.id} data-y={y - 2} r={3.2} className="layerdot" />)}
        {layout.zoneRows.map(({ zone, y }) => <circle key={zone.id} data-y={y - 3} r={5} className="zonedot" fill={zone.color} />)}
        <g data-y={TOP - 46}><circle r={9} className="stack-dot" /><text x={16} y={5} className="stack-root">{t(lang, "stackRoot")}</text></g>
      </svg>
      <div className="sticky" ref={labelsRef}>
        <div className="pills" ref={pillsRef} />
        {layout.groundY !== null && (
          <>
            <div className="groundlabel" data-y={layout.groundY - 22}>{t(lang, "aboveGround")}</div>
            <div className="groundlabel" data-y={layout.groundY + 6}>{t(lang, "underground")}</div>
          </>
        )}
        {layout.zoneRows.map(({ zone, y }) => {
          const all = [...nodesById.values()].filter((n) => index.zoneOfNode(n).id === zone.id);
          const shown = all.filter(inFocus).length;
          const count = shown === all.length ? all.length : `${shown}/${all.length}`;
          return (
            <button key={zone.id} className="zonehead" data-y={y - 14} data-sx={10} style={{ borderColor: zone.color, color: zone.color }}
              onClick={() => onZoneClick(zone.id)}>
              {zone.name[lang]}<small>{zone.description[lang]} · {t(lang, "nodes", { n: count })}</small>
            </button>
          );
        })}
        {layout.layerRows.map(({ layer, zone, y }) => (
          <div key={layer.id} className="layerlabel" data-y={y - 8} data-sx={12} style={{ color: zone.color }}>{layer.id}  {layer.name[lang]}</div>
        ))}
        {layout.lanes.filter((l) => !l.summary).map((l) => (
          <div key={l.key} className={`lanelabel${l.isSub ? " sub" : ""}${l.nodes.some((p) => inFocus(p.node)) ? "" : " unfocus"}`}
            data-y={l.y} data-dy={-21} data-sx={(l.isSub ? SUB : ELBOW) + 2} data-lane={l.key} style={{ color: l.color, borderColor: `${l.color}66` }}>
            {l.label}
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
