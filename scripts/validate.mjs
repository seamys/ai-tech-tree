#!/usr/bin/env node
// Validates data/taxonomy.json and data/nodes.json, including the cross-file
// rules that JSON Schema alone cannot express. Exits non-zero on any error so
// CI refuses to deploy broken data.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const tax = read("data/taxonomy.json");
const nodes = read("data/nodes.json");
const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);

const isBilingual = (v) => v && typeof v === "object" && typeof v.zh === "string" && v.zh && typeof v.en === "string" && v.en;
const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const ID = /^[a-z0-9][a-z0-9-]*$/;
const KINDS = new Set(["paper", "release", "event", "constraint", "upcoming"]);
const ALLOWED = new Set(["id", "date", "branch", "parents", "level", "kind", "title", "summary", "source", "url",
  "criteria", "tags", "status", "added_by", "added_at", "confidence", "agent_reason", "geo"]);

// --- taxonomy ---------------------------------------------------------------
const zoneIds = new Set(tax.zones.map((z) => z.id));
const layerIds = new Set(tax.layers.map((l) => l.id));
const branchIds = new Set(tax.branches.map((b) => b.id));
const tagIds = new Set(tax.tags.map((t) => t.id));
const criteriaIds = new Set(Object.keys(tax.criteria));

for (const z of tax.zones) if (!isBilingual(z.name) || !isBilingual(z.description)) err(`zone ${z.id}: name/description must be {zh,en}`);
for (const l of tax.layers) {
  if (!zoneIds.has(l.zone)) err(`layer ${l.id}: unknown zone "${l.zone}"`);
  if (!isBilingual(l.name)) err(`layer ${l.id}: name must be {zh,en}`);
}
for (const b of tax.branches) {
  if (!layerIds.has(b.layer)) err(`branch ${b.id}: unknown layer "${b.layer}"`);
  if (!isBilingual(b.name)) err(`branch ${b.id}: name must be {zh,en}`);
  if (b.parent) {
    const p = tax.branches.find((x) => x.id === b.parent);
    if (!p) err(`branch ${b.id}: unknown parent branch "${b.parent}"`);
    else if (p.parent) err(`branch ${b.id}: sub-branches can only be one level deep`);
    else if (p.layer !== b.layer) err(`branch ${b.id}: must be in the same layer as its parent`);
  } else if (!b.color) err(`branch ${b.id}: top-level branches need a color`);
}
for (const t of tax.tags) if (!isBilingual(t.name)) err(`tag ${t.id}: name must be {zh,en}`);
for (const [id, c] of Object.entries(tax.criteria)) if (!isBilingual(c)) err(`criterion ${id}: must be {zh,en}`);

// --- nodes ------------------------------------------------------------------
const byId = new Map();
for (const n of nodes) {
  const where = `node ${n.id ?? "(missing id)"}`;
  if (!n.id || !ID.test(n.id)) err(`${where}: id must match ${ID}`);
  if (byId.has(n.id)) err(`${where}: duplicate id`);
  byId.set(n.id, n);
  for (const k of Object.keys(n)) if (!ALLOWED.has(k)) err(`${where}: unknown field "${k}"`);
  if (!DATE.test(n.date ?? "")) err(`${where}: bad date "${n.date}"`);
  else {
    const [, m, d] = n.date.split("-").map(Number);
    if (m && (m < 1 || m > 12)) err(`${where}: month out of range`);
    if (d && (d < 1 || d > 31)) err(`${where}: day out of range`);
  }
  if (!branchIds.has(n.branch)) err(`${where}: unknown branch "${n.branch}"`);
  if (![1, 2, 3].includes(n.level)) err(`${where}: level must be 1, 2 or 3`);
  if (!KINDS.has(n.kind)) err(`${where}: unknown kind "${n.kind}"`);
  if (!isBilingual(n.title)) err(`${where}: title must be {zh,en}`);
  if (!isBilingual(n.summary)) err(`${where}: summary must be {zh,en}`);
  if (n.source !== undefined && !(typeof n.source === "string" && n.source) && !isBilingual(n.source)) err(`${where}: source must be a string or {zh,en}`);
  if (n.url !== undefined) { try { new URL(n.url); } catch { err(`${where}: invalid url`); } }
  if (!Array.isArray(n.parents)) err(`${where}: parents must be an array`);
  if (!Array.isArray(n.criteria) || !n.criteria.length) err(`${where}: needs at least one criterion`);
  else for (const c of n.criteria) if (!criteriaIds.has(c)) err(`${where}: unknown criterion "${c}"`);
  for (const t of n.tags ?? []) if (!tagIds.has(t)) err(`${where}: unknown tag "${t}"`);
  if (!["verified", "candidate"].includes(n.status)) err(`${where}: status must be verified or candidate`);
  if (n.status === "candidate" && !isBilingual(n.agent_reason)) err(`${where}: candidates need agent_reason {zh,en}`);
  if (n.confidence !== undefined && !(n.confidence >= 0 && n.confidence <= 1)) err(`${where}: confidence must be 0..1`);
  if (n.geo !== undefined) {
    if (!Array.isArray(n.geo) || !n.geo.length) err(`${where}: geo must be a non-empty array (omit it when there is no single place)`);
    else {
      for (const g of n.geo) {
        if (!(typeof g.lat === "number" && g.lat >= -90 && g.lat <= 90)) err(`${where}: geo lat out of range`);
        if (!(typeof g.lon === "number" && g.lon >= -180 && g.lon <= 180)) err(`${where}: geo lon out of range`);
        if (!isBilingual(g.place)) err(`${where}: geo place must be {zh,en}`);
        if (g.role !== undefined && !["origin", "target"].includes(g.role)) err(`${where}: geo role must be origin or target`);
      }
      if (!n.geo.some((g) => (g.role ?? "origin") === "origin")) err(`${where}: geo needs at least one origin point`);
    }
  }
  if (n.kind === "upcoming" && n.date < new Date().toISOString().slice(0, 10)) warnings.push(`${where}: "upcoming" node is in the past; update its kind`);
}
for (const n of nodes) for (const p of n.parents ?? []) {
  if (!byId.has(p)) err(`node ${n.id}: unknown parent "${p}"`);
  if (p === n.id) err(`node ${n.id}: cannot be its own parent`);
}

// --- cycle check (parents must form a DAG) ----------------------------------
const state = new Map(); // 1 = visiting, 2 = done
const visit = (id, path) => {
  if (state.get(id) === 2) return;
  if (state.get(id) === 1) { err(`cycle: ${[...path, id].join(" -> ")}`); return; }
  state.set(id, 1);
  for (const p of byId.get(id)?.parents ?? []) if (byId.has(p)) visit(p, [...path, id]);
  state.set(id, 2);
};
for (const id of byId.keys()) visit(id, []);

for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\n${errors.length} error(s) in data/.`);
  process.exit(1);
}
console.log(`data OK: ${nodes.length} nodes, ${tax.branches.length} branches, ${tax.layers.length} layers, ${tax.zones.length} zones.`);
