// Focus: which part of the tree the reader cares about. Pure helpers, no DOM.
//
// A focus is a set of top-level branches plus a set of cross-cutting tags. A node is in
// focus if its branch (or its parent branch) is selected, or if it carries a selected tag.
// Empty sets mean "everything". Nodes outside the focus are either dimmed or hidden.
import type { Lens, Taxonomy, TechNode } from "../types";

export type FocusMode = "dim" | "hide";

export interface Focus {
  branches: string[]; // top-level branch ids
  tags: string[];
  mode: FocusMode;
}

export const ALL: Focus = { branches: [], tags: [], mode: "dim" };
const KEY = "gt-focus";

export const isAll = (f: Focus) => f.branches.length === 0 && f.tags.length === 0;

/** Top-level branch of a node's branch (sub-branches roll up to their parent). */
export function topBranchOf(tax: Taxonomy) {
  const parent = new Map(tax.branches.map((b) => [b.id, b.parent ?? b.id]));
  return (branchId: string) => parent.get(branchId) ?? branchId;
}

/** Predicate: is this node inside the focus? */
export function focusTest(f: Focus, tax: Taxonomy): (n: TechNode) => boolean {
  if (isAll(f)) return () => true;
  const top = topBranchOf(tax);
  const bs = new Set(f.branches), ts = new Set(f.tags);
  return (n) => bs.has(top(n.branch)) || (n.tags ?? []).some((t) => ts.has(t));
}

export const fromLens = (l: Lens, mode: FocusMode): Focus => ({ branches: [...(l.branches ?? [])], tags: [...(l.tags ?? [])], mode });

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** The lens this focus matches exactly, if any (used for the header label). */
export const lensOf = (f: Focus, lenses: Lens[]) =>
  lenses.find((l) => sameSet(l.branches ?? [], f.branches) && sameSet(l.tags ?? [], f.tags));

// ---------------------------------------------------------------- persistence
// URL wins over storage so links are shareable: ?focus=llm,reason,tag:policy&fmode=hide

export function parseFocusParam(search: string, tax: Taxonomy): Focus | null {
  const q = new URLSearchParams(search);
  const raw = q.get("focus");
  if (raw === null) return null;
  const branchIds = new Set(tax.branches.filter((b) => !b.parent).map((b) => b.id));
  const tagIds = new Set(tax.tags.map((t) => t.id));
  const lens = tax.lenses?.find((l) => l.id === raw);
  const mode: FocusMode = q.get("fmode") === "hide" ? "hide" : "dim";
  if (lens) return fromLens(lens, mode);
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    branches: parts.filter((p) => branchIds.has(p)),
    tags: parts.filter((p) => p.startsWith("tag:") && tagIds.has(p.slice(4))).map((p) => p.slice(4)),
    mode,
  };
}

export function focusParam(f: Focus, lenses: Lens[]): string {
  if (isAll(f)) return "";
  const lens = lensOf(f, lenses);
  const q = new URLSearchParams();
  q.set("focus", lens ? lens.id : [...f.branches, ...f.tags.map((t) => `tag:${t}`)].join(","));
  if (f.mode === "hide") q.set("fmode", "hide");
  return q.toString().replace(/%2C/g, ",").replace(/%3A/g, ":");
}

/** Stored focus, or null on a first visit (which shows the lens picker). */
export function loadFocus(tax: Taxonomy): Focus | null {
  const fromUrl = parseFocusParam(location.search, tax);
  if (fromUrl) return fromUrl;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Focus>;
    const branchIds = new Set(tax.branches.map((b) => b.id));
    const tagIds = new Set(tax.tags.map((t) => t.id));
    return {
      branches: (v.branches ?? []).filter((b) => branchIds.has(b)),
      tags: (v.tags ?? []).filter((t) => tagIds.has(t)),
      mode: v.mode === "hide" ? "hide" : "dim",
    };
  } catch {
    return null;
  }
}

export function saveFocus(f: Focus, lenses: Lens[]) {
  try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* private mode */ }
  // Keep the address bar shareable without adding history entries.
  const q = new URLSearchParams(location.search);
  q.delete("focus"); q.delete("fmode");
  const rest = q.toString(), fp = focusParam(f, lenses);
  const search = [rest, fp].filter(Boolean).join("&");
  history.replaceState(null, "", `${location.pathname}${search ? `?${search}` : ""}${location.hash}`);
}
