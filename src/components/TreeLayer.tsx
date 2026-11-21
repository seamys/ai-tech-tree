// Static SVG content of the tree. Memoised: it re-renders only when the layout,
// language, selection, search or tag filter change - never during pan/zoom.
import { memo } from "react";
import type { Lang, TechNode } from "../types";
import { TRUNK_X, TOP, type Layout, type TaxIndex } from "../lib/layout";
import { ageOf, isFresh, isRecent, type TimeScale } from "../lib/time";

interface Props {
  layout: Layout;
  scale: TimeScale;
  index: TaxIndex;
  lang: Lang;
  lod: 0 | 1 | 2;
  selectedId: string | null;
  query: string;
  activeTag: string | null;
  inFocus(n: TechNode): boolean;
}

const matches = (n: TechNode, q: string) =>
  (n.title.zh + n.title.en + n.summary.zh + n.summary.en).toLowerCase().includes(q);

function TreeLayerImpl({ layout, scale, index, lang, selectedId, query, activeTag, inFocus }: Props) {
  const { lanes, zoneSpans, groundY, height: H, width: W } = layout;
  const xNow = scale.xNow;
  const q = query.trim().toLowerCase();

  return (
    <>
      <g className="bg">
        <rect x={xNow} y={TOP - 60} width={4000} height={H + 4000} className="futurezone" />
        {zoneSpans.map(({ zone, y0, y1 }) => (
          <rect key={zone.id} x={-4000} y={y0} width={W + 8000} height={y1 - y0} fill={zone.color} opacity={0.035} />
        ))}
        {groundY !== null && (
          <>
            <rect x={-4000} y={groundY} width={W + 8000} height={H - groundY + 4000} className="soil" />
            <line x1={-4000} x2={W + 4000} y1={groundY} y2={groundY} className="groundline" />
          </>
        )}
        <line x1={xNow} x2={xNow} y1={TOP - 60} y2={H + 200} className="nowline" />
      </g>

      {/* The trunk and the bends into each lane are drawn by the canvas's sticky spine, so the
          lanes start wherever the spine is. TreeCanvas rewrites the two lane paths each frame. */}
      <g className="branches">
        {lanes.map((lane) => {
          if (!lane.nodes.length) return null;
          const { y } = lane;
          const past = lane.nodes.filter((p) => ageOf(p.node.date, scale.nowM) >= 0);
          const xe = past.length ? past[past.length - 1].x : -Infinity;
          const xEnd = Math.max(xNow, ...lane.nodes.map((p) => p.x));
          const off = lane.nodes.some((p) => inFocus(p.node)) ? "" : " unfocus";
          return (
            <g key={lane.key} className="lane" data-lane={lane.key} data-xe={xe} data-xend={xEnd}>
              <path d={`M${TRUNK_X},${y} L${Math.max(TRUNK_X, xe)},${y}`} className={`limb${lane.isSub ? " sub" : ""}${off}`} stroke={lane.color} />
              {/* Dashed tail to "now": the longer it is, the longer this branch has gone without news. */}
              <path d={`M${Math.max(TRUNK_X, xe)},${y} L${xEnd},${y}`} className={`limb-stale${off}`} stroke={lane.color} />
              {lane.nodes.map((p) => (
                <line key={p.node.id} x1={p.x} x2={p.x} y1={y} y2={p.y} className={inFocus(p.node) ? "twig" : "twig unfocus"}
                  stroke={lane.summary ? index.colorOfBranch(p.node.branch) : lane.color} />
              ))}
            </g>
          );
        })}
      </g>

      <g className="nodes">
        {lanes.flatMap((lane) => lane.nodes.map((p) => {
          const n = p.node;
          const age = ageOf(n.date, scale.nowM);
          const fresh = isFresh(age);
          const color = index.colorOfBranch(n.branch);
          const r0 = n.level === 1 ? 7 : n.level === 2 ? 5.5 : 4.5;
          const hit = q !== "" && matches(n, q);
          const cls = [
            "node", `l${n.level}`,
            n.level > 1 && !isRecent(age) && age >= 0 ? "minor" : "",
            n.status === "candidate" ? "candidate" : "",
            n.kind === "constraint" ? "constraint" : "",
            age < 0 ? "future" : fresh ? "fresh" : isRecent(age) ? "recent" : "",
            n.id === selectedId ? "sel" : "",
            hit ? "hit" : q ? "dim" : "",
            activeTag && !(n.tags ?? []).includes(activeTag) ? "untag" : "",
            inFocus(n) ? "" : "unfocus",
          ].filter(Boolean).join(" ");
          return (
            <g key={n.id} className={cls} transform={`translate(${p.x},${p.y})`} data-id={n.id} data-t={(scale.nowM - age).toFixed(3)} style={{ color }}>
              <g className="ns">
                {fresh && <circle r={r0 + 2} className="pulse" />}
                {n.kind === "constraint"
                  ? <rect x={-r0} y={-r0} width={r0 * 2} height={r0 * 2} transform="rotate(45)" className="shape" />
                  : <circle r={r0} className="shape" />}
                <text x={11} y={p.above ? -2 : 4}>
                  {n.title[lang]}{n.status === "candidate" ? " ⧗" : ""}
                  {fresh && <tspan className="badge-fresh" dx={6}>NEW</tspan>}
                </text>
                <text x={11} y={p.above ? 11 : 17} className="date">{n.date}</text>
              </g>
            </g>
          );
        }))}
      </g>
    </>
  );
}

export const TreeLayer = memo(TreeLayerImpl);
