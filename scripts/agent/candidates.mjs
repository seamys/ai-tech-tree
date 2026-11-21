// Pure helpers for the daily agent: the propose_node tool schema, checks that
// turn a model proposal into a node (or a list of errors the model can fix),
// and the one-node-per-line serialisation that data/nodes.json uses.
// No I/O here, so tests/unit can exercise all of it.

const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const ID = /^[a-z0-9][a-z0-9-]*$/;
export const KINDS = ["paper", "release", "event", "constraint", "upcoming"];
// Key order of nodes written by the agent; matches the hand-written nodes.
const KEY_ORDER = ["id", "date", "branch", "parents", "level", "kind", "title", "summary", "source", "url",
  "criteria", "tags", "status", "added_by", "added_at", "confidence", "agent_reason", "geo"];

const bilingual = (desc) => ({
  type: "object",
  description: desc,
  additionalProperties: false,
  required: ["zh", "en"],
  properties: { zh: { type: "string", description: "Simplified Chinese" }, en: { type: "string", description: "English" } },
});

/** JSON Schema for the propose_node tool. Enums come from the live taxonomy and node list. */
export function buildProposalSchema(tax, nodes) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id_hint", "date", "branch", "parents", "level", "kind", "title", "summary", "source", "url",
      "criteria", "tags", "geo", "confidence", "reason", "evidence"],
    properties: {
      id_hint: { type: "string", description: "Short lowercase slug for the node id, e.g. \"gpt6\" or \"ree-export-2027\"." },
      date: { type: "string", description: "When it happened: YYYY-MM-DD, or YYYY-MM if the day is unknown. The event date, not the article date." },
      branch: { type: "string", enum: tax.branches.map((b) => b.id), description: "Branch or sub-branch id." },
      parents: { type: "array", items: { type: "string", enum: nodes.map((n) => n.id) }, description: "Existing node ids this builds on or is caused by." },
      level: { type: "integer", enum: [1, 2, 3], description: "1 milestone, 2 important, 3 detail. Be honest; most new items are 2 or 3." },
      kind: { type: "string", enum: KINDS },
      title: bilingual("Short node title, like the existing ones."),
      summary: bilingual("One or two sentences: what changed and why it matters."),
      source: { type: "string", description: "Who published it (organisation or first authors)." },
      url: { type: "string", format: "uri", description: "Primary source: the paper, the official announcement or the government notice." },
      criteria: { type: "array", items: { type: "string", enum: Object.keys(tax.criteria) }, description: "Why it counts; at least one." },
      tags: { type: "array", items: { type: "string", enum: tax.tags.map((t) => t.id) } },
      geo: {
        type: "array",
        description: "Where it happened, per the geo rules. Empty array when there is no single place.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["lat", "lon", "place", "role"],
          properties: {
            lat: { type: "number" },
            lon: { type: "number" },
            place: bilingual("City or site name."),
            role: { type: "string", enum: ["origin", "target"] },
          },
        },
      },
      confidence: { type: "number", description: "0 to 1: how sure you are that this belongs in the tree as proposed." },
      reason: bilingual("For the reviewer: why you propose it, why this branch, level and parents, and anything uncertain."),
      evidence: { type: "array", items: { type: "string" }, description: "URLs you read to verify the facts." },
    },
  };
}

export function normalizeUrl(u) {
  try {
    const url = new URL(u);
    let host = url.hostname.toLowerCase().replace(/^www\./, "");
    let path = url.pathname.replace(/\/+$/, "");
    const arxiv = (host === "arxiv.org" || host === "export.arxiv.org") && path.match(/^\/(?:abs|pdf)\/([^/]+?)(?:v\d+)?(?:\.pdf)?$/);
    const hfPaper = host === "huggingface.co" && path.match(/^\/papers\/(\d{4}\.\d{4,5})$/);
    if (arxiv || hfPaper) return `arxiv.org/abs/${(arxiv || hfPaper)[1]}`;
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|ref$|source$)/i.test(k)) url.searchParams.delete(k);
    const q = url.searchParams.toString();
    return `${host}${path}${q ? `?${q}` : ""}`;
  } catch {
    return String(u).trim();
  }
}

const normTitle = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function slugify(s) {
  return String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
}

const isBi = (v) => v && typeof v === "object" && typeof v.zh === "string" && v.zh.trim() && typeof v.en === "string" && v.en.trim();
const bi = (v) => ({ zh: v.zh.trim(), en: v.en.trim() });

/**
 * Context for checkProposal. `knownUrls` holds normalised URLs of existing
 * nodes, earlier agent PRs and nodes accepted earlier in this run; it is
 * updated when a proposal is accepted.
 */
export function makeContext(tax, nodes, { today, seenUrls = [] }) {
  return {
    today,
    branchIds: new Set(tax.branches.map((b) => b.id)),
    criteriaIds: new Set(Object.keys(tax.criteria)),
    tagIds: new Set(tax.tags.map((t) => t.id)),
    nodeIds: new Set(nodes.map((n) => n.id)),
    takenIds: new Set(nodes.map((n) => n.id)),
    knownUrls: new Set([...nodes.filter((n) => n.url).map((n) => normalizeUrl(n.url)), ...seenUrls.map(normalizeUrl)]),
    knownTitles: new Set(nodes.map((n) => normTitle(n.title.en))),
  };
}

/** Validate one proposal. Returns { node } or { errors }. Accepting it reserves its id, url and title. */
export function checkProposal(p, ctx) {
  const errors = [];
  if (!p || typeof p !== "object") return { errors: ["input must be an object"] };

  if (!DATE.test(p.date ?? "")) errors.push(`date "${p.date}" must be YYYY, YYYY-MM or YYYY-MM-DD`);
  else {
    const [, m, d] = p.date.split("-").map(Number);
    if ((m && (m < 1 || m > 12)) || (d && (d < 1 || d > 31))) errors.push(`date "${p.date}" is out of range`);
    if (p.kind !== "upcoming" && p.date > ctx.today) errors.push(`date ${p.date} is in the future; use kind "upcoming" for scheduled events`);
    if (p.kind === "upcoming" && p.date < ctx.today) errors.push(`kind "upcoming" needs a future date`);
  }
  if (!ctx.branchIds.has(p.branch)) errors.push(`unknown branch "${p.branch}"`);
  if (![1, 2, 3].includes(p.level)) errors.push("level must be 1, 2 or 3");
  if (!KINDS.includes(p.kind)) errors.push(`unknown kind "${p.kind}"`);
  for (const f of ["title", "summary", "reason"]) if (!isBi(p[f])) errors.push(`${f} needs non-empty zh and en`);
  if (isBi(p.title) && p.title.en.length > 90) errors.push("title.en is too long; keep it under 90 characters");

  let url = "";
  try {
    const u = new URL(p.url);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
    url = u.toString();
  } catch { errors.push("url must be an http(s) link to the primary source"); }
  if (url && ctx.knownUrls.has(normalizeUrl(url))) errors.push("this url is already in the tree or was proposed before");
  if (isBi(p.title) && ctx.knownTitles.has(normTitle(p.title.en))) errors.push("a node with this title already exists");

  const parents = [...new Set(p.parents ?? [])];
  const badParents = parents.filter((id) => !ctx.nodeIds.has(id));
  if (badParents.length) errors.push(`unknown parents: ${badParents.join(", ")}`);
  const criteria = [...new Set(p.criteria ?? [])];
  if (!criteria.length) errors.push("needs at least one criterion");
  const badCriteria = criteria.filter((c) => !ctx.criteriaIds.has(c));
  if (badCriteria.length) errors.push(`unknown criteria: ${badCriteria.join(", ")}`);
  const tags = [...new Set(p.tags ?? [])];
  const badTags = tags.filter((t) => !ctx.tagIds.has(t));
  if (badTags.length) errors.push(`unknown tags: ${badTags.join(", ")}`);

  const geo = Array.isArray(p.geo) ? p.geo : [];
  for (const g of geo) {
    if (!(typeof g.lat === "number" && g.lat >= -90 && g.lat <= 90)) errors.push("geo lat must be -90..90");
    if (!(typeof g.lon === "number" && g.lon >= -180 && g.lon <= 180)) errors.push("geo lon must be -180..180");
    if (!isBi(g.place)) errors.push("geo place needs zh and en");
  }
  if (geo.length && !geo.some((g) => (g.role ?? "origin") === "origin")) errors.push("geo needs at least one origin point");
  if (!(typeof p.confidence === "number" && p.confidence >= 0 && p.confidence <= 1)) errors.push("confidence must be a number from 0 to 1");

  if (errors.length) return { errors };

  let base = slugify(p.id_hint) || slugify(p.title.en) || "node";
  if (!ID.test(base)) base = `n-${base}`.replace(/^n--/, "n-");
  let id = base;
  for (let i = 2; ctx.takenIds.has(id); i++) id = `${base}-${i}`;

  const node = {
    id,
    date: p.date,
    branch: p.branch,
    parents,
    level: p.level,
    kind: p.kind,
    title: bi(p.title),
    summary: bi(p.summary),
    ...(p.source?.trim() ? { source: p.source.trim() } : {}),
    url,
    criteria,
    ...(tags.length ? { tags } : {}),
    status: "candidate",
    added_by: "agent",
    added_at: ctx.today,
    confidence: Math.round(p.confidence * 100) / 100,
    agent_reason: bi(p.reason),
    ...(geo.length
      ? { geo: geo.map((g) => ({ lat: Math.round(g.lat * 100) / 100, lon: Math.round(g.lon * 100) / 100, place: bi(g.place), ...(g.role === "target" ? { role: "target" } : {}) })) }
      : {}),
  };
  ctx.takenIds.add(id);
  ctx.knownUrls.add(normalizeUrl(url));
  ctx.knownTitles.add(normTitle(node.title.en));
  return { node, evidence: (p.evidence ?? []).filter((e) => /^https?:\/\//.test(e)) };
}

/** Inline JSON with ", " and ": " separators, the style of data/nodes.json. */
export function formatInline(v) {
  if (Array.isArray(v)) return `[${v.map(formatInline).join(", ")}]`;
  if (v && typeof v === "object") {
    const keys = Object.keys(v);
    const ordered = keys.every((k) => KEY_ORDER.includes(k))
      ? KEY_ORDER.filter((k) => k in v)
      : keys;
    return `{${ordered.map((k) => `${JSON.stringify(k)}: ${formatInline(v[k])}`).join(", ")}}`;
  }
  return JSON.stringify(v);
}

/** Append nodes to the text of data/nodes.json, one per line. */
export function appendNodes(text, nodes) {
  if (!nodes.length) return text;
  const body = text.replace(/\s*\]\s*$/, "");
  const lines = nodes.map((n) => `  ${formatInline(n)}`).join(",\n");
  return `${body},\n${lines}\n]\n`;
}

/** URLs listed in the hidden <!-- agent-seen --> blocks of earlier agent PR bodies. */
export function extractSeenUrls(text) {
  const urls = [];
  for (const m of String(text).matchAll(/<!--\s*agent-seen\s*([\s\S]*?)-->/g)) {
    for (const u of m[1].split(/\s+/)) if (/^https?:\/\//.test(u)) urls.push(u);
  }
  return urls;
}
