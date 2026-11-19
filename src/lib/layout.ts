// Pure layout: turns data + view settings into positions. No DOM access, so it
// is easy to test and only recomputed when its inputs change (never on pan/zoom).
import type { Branch, Lang, Layer, Lod, TechNode, Taxonomy, Zone } from "../types";
import { ageOf, isRecent, toM, type TimeScale } from "./time";

export const TOP = 120;
export const TRUNK_X = 150;
/** Spacing factor per level of detail. Labels have a constant screen size, so lanes get more
 *  world-space room at the coarser levels, where the typical zoom is lower. */
export const LOD_TEXT_SCALE: Record<Lod, number> = { 0: 2.0, 1: 1.5, 2: 1.0 };
/** Vertical slots for labels around a lane: alternating above/below. */
const ROW_OFFSETS = [-30, 30, -66, 66, -102, 102, -138, 138, -174, 174, -210, 210];

export interface PlacedNode {
  node: TechNode;
  x: number;
  y: number;
  above: boolean; // label above or below its lane
}

export interface Lane {
  key: string;
  label: string; // empty for zone summary lanes
  color: string;
  ground: boolean;
  isSub: boolean;
  summary: boolean; // overview lane that merges a whole zone
  y: number;
  nodes: PlacedNode[];
}

export interface Layout {
  lanes: Lane[];
  zoneRows: { zone: Zone; y: number }[];
  layerRows: { layer: Layer; zone: Zone; y: number }[];
  zoneSpans: { zone: Zone; y0: number; y1: number }[];
  groundY: number | null;
  height: number;
  width: number;
  positions: Map<string, PlacedNode>;
}

// Rough text width estimate (CJK glyphs ~12.5px, Latin ~7px at 12px font).
const textWidth = (s: string) => {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) < 256 ? 7 : 12.5;
  return w;
};

export interface TaxIndex {
  branch: Map<string, Branch>;
  layer: Map<string, Layer>;
  zone: Map<string, Zone>;
  zoneOfNode(n: TechNode): Zone;
  colorOfBranch(id: string): string;
}

export function indexTaxonomy(tax: Taxonomy): TaxIndex {
  const branch = new Map(tax.branches.map((b) => [b.id, b]));
  const layer = new Map(tax.layers.map((l) => [l.id, l]));
  const zone = new Map(tax.zones.map((z) => [z.id, z]));
  const colorOfBranch = (id: string): string => {
    const b = branch.get(id)!;
    return b.color ?? colorOfBranch(b.parent!);
  };
  return {
    branch, layer, zone, colorOfBranch,
    zoneOfNode: (n) => zone.get(layer.get(branch.get(n.branch)!.layer)!.zone)!,
  };
}

/** Which nodes a given level of detail shows. Recent and future nodes are always shown. */
export const visibleAtLod = (n: TechNode, lod: Lod, nowM: number) =>
  n.level <= lod + 1 || isRecent(ageOf(n.date, nowM)) || ageOf(n.date, nowM) < 0;

export function computeLayout(args: {
  nodes: TechNode[];
  tax: Taxonomy;
  index: TaxIndex;
  lod: Lod;
  lang: Lang;
  scale: TimeScale;
}): Layout {
  const { nodes, tax, index, lod, lang, scale } = args;
  const s = LOD_TEXT_SCALE[lod];
  const lanes: Lane[] = [];
  const zoneRows: Layout["zoneRows"] = [];
  const layerRows: Layout["layerRows"] = [];
  const zoneSpans: Layout["zoneSpans"] = [];
  const positions = new Map<string, PlacedNode>();
  let groundY: number | null = null;
  let y = TOP;

  const placeLane = (lane: Omit<Lane, "y" | "nodes">, members: TechNode[]) => {
    const sorted = [...members].sort((a, b) => toM(a.date) - toM(b.date));
    const rowEnd = ROW_OFFSETS.map(() => -Infinity);
    let maxRow = 1;
    const tmp = sorted.map((node) => {
      const x = scale.x(toM(node.date));
      const w = (Math.max(textWidth(node.title[lang]), lod === 0 ? 0 : 54) + 24) * s;
      let r = 0;
      while (r < ROW_OFFSETS.length - 1 && rowEnd[r] > x - 4 * s) r++;
      rowEnd[r] = x + w;
      maxRow = Math.max(maxRow, r);
      return { node, x, r };
    });
    const half = (Math.abs(ROW_OFFSETS[maxRow]) + 20) * s;
    const laneY = y + half;
    const placed = tmp.map(({ node, x, r }) => {
      const p: PlacedNode = { node, x, y: laneY + ROW_OFFSETS[r] * s, above: ROW_OFFSETS[r] < 0 };
      positions.set(node.id, p);
      return p;
    });
    lanes.push({ ...lane, y: laneY, nodes: placed });
    y = laneY + half + 14 * s;
  };

  for (const zone of tax.zones) {
    if (zone.ground && groundY === null) { groundY = y + 8 * s; y += 64 * s; }
    const y0 = y;
    zoneRows.push({ zone, y: y + 22 * s });
    y += 44 * s;
    const members = nodes.filter((n) => index.zoneOfNode(n).id === zone.id && visibleAtLod(n, lod, scale.nowM));

    if (lod === 0) {
      placeLane({ key: `zone-${zone.id}`, label: "", color: zone.color, ground: zone.ground, isSub: false, summary: true }, members);
    } else {
      for (const layer of tax.layers.filter((l) => l.zone === zone.id)) {
        layerRows.push({ layer, zone, y: y + 14 * s });
        y += 26 * s;
        for (const b of tax.branches.filter((x) => x.layer === layer.id && !x.parent)) {
          const subs = tax.branches.filter((x) => x.parent === b.id);
          const subIds = new Set(subs.map((x) => x.id));
          // Below the deepest level, sub-branch nodes are drawn on their parent's lane.
          const own = members.filter((n) => n.branch === b.id || (lod < 2 && subIds.has(n.branch)));
          if (own.length) placeLane({ key: b.id, label: b.name[lang], color: b.color!, ground: zone.ground, isSub: false, summary: false }, own);
          if (lod === 2) for (const sb of subs) {
            const sn = members.filter((n) => n.branch === sb.id);
            if (sn.length) placeLane({ key: sb.id, label: sb.name[lang], color: b.color!, ground: zone.ground, isSub: true, summary: false }, sn);
          }
        }
      }
    }
    zoneSpans.push({ zone, y0, y1: y + 6 * s });
    y += 16 * s;
  }

  return { lanes, zoneRows, layerRows, zoneSpans, groundY, height: y, width: scale.xNow + 140, positions };
}
