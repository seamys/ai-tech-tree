// Fetches the configured feeds and turns them into a compact digest for the
// model. Parsing is deliberately small (no XML dependency): RSS <item> and
// Atom <entry> blocks, plus the Hugging Face daily-papers JSON API.
import { gunzipSync } from "node:zlib";
import { normalizeUrl } from "./candidates.mjs";

const UA = "ai-tech-tree-agent/1 (+https://github.com/seamys/ai-tech-tree)";
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeText(s) {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

const tag = (block, names) => {
  for (const n of names) {
    const m = block.match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)</${n}>`, "i"));
    if (m) return m[1];
  }
  return "";
};

const atomLink = (block) => {
  const links = [...block.matchAll(/<link\b([^>]*?)\/?>/gi)].map((m) => m[1]);
  const pick = links.find((a) => /rel=["']alternate["']/i.test(a)) ?? links.find((a) => !/rel=/i.test(a)) ?? links[0];
  return pick?.match(/href=["']([^"']+)["']/i)?.[1] ?? "";
};

export function parseFeed(xml) {
  const items = [];
  for (const m of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)) {
    const block = m[0];
    const title = decodeText(tag(block, ["title"]));
    let link = decodeText(tag(block, ["link"]));
    if (!/^https?:\/\//.test(link)) link = decodeText(atomLink(block));
    if (!/^https?:\/\//.test(link)) link = decodeText(tag(block, ["guid", "id"]));
    const rawDate = decodeText(tag(block, ["pubDate", "published", "dc:date", "updated"]));
    const date = rawDate ? new Date(rawDate) : null;
    const summary = decodeText(tag(block, ["description", "summary", "content:encoded", "content"]));
    if (title && /^https?:\/\//.test(link)) items.push({ title, link, date: date && !isNaN(date) ? date : null, summary });
  }
  return items;
}

export function parseHfDaily(json) {
  return (Array.isArray(json) ? json : [])
    .map((e) => e.paper ?? e)
    .filter((p) => p?.id && p?.title)
    .map((p) => ({
      title: decodeText(p.title),
      link: `https://arxiv.org/abs/${p.id}`,
      date: p.publishedAt ? new Date(p.publishedAt) : null,
      summary: decodeText(p.summary ?? ""),
      upvotes: p.upvotes ?? 0,
    }))
    .sort((a, b) => b.upvotes - a.upvotes);
}

async function fetchBody(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "*/*" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let buf = Buffer.from(await res.arrayBuffer());
  // Some servers send gzip bytes without a Content-Encoding header.
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  return buf.toString("utf8");
}

/**
 * Fetch every feed and keep items published since `since` whose URL is not
 * already in the tree or in an earlier agent PR. Never throws for a single
 * feed: failures are returned in `report`.
 */
export async function collectFeeds(feeds, { since, knownUrls }) {
  const report = [];
  const seen = new Set(knownUrls);
  const results = await Promise.all(
    feeds.map(async (f) => {
      try {
        const body = await fetchBody(f.url);
        const all = f.type === "hf-daily" ? parseHfDaily(JSON.parse(body)) : parseFeed(body);
        const fresh = all.filter((i) => i.date && i.date >= since).slice(0, f.max ?? 10);
        return { f, fresh, total: all.length };
      } catch (e) {
        return { f, error: e.message ?? String(e) };
      }
    }),
  );
  const items = [];
  for (const r of results) {
    if (r.error) { report.push({ feed: r.f.id, ok: false, error: r.error }); continue; }
    let kept = 0;
    for (const i of r.fresh) {
      const key = normalizeUrl(i.link);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ ...i, feed: r.f.name });
      kept++;
    }
    report.push({ feed: r.f.id, ok: true, parsed: r.total, kept });
  }
  return { items, report };
}

/** One line per item, short enough that a day's digest stays a few thousand tokens. */
export function formatDigest(items) {
  return items
    .map((i, n) => {
      const d = i.date.toISOString().slice(0, 10);
      const s = i.summary.length > 280 ? `${i.summary.slice(0, 277)}...` : i.summary;
      return `${n + 1}. [${d}] (${i.feed}) ${i.title}\n   ${i.link}${s ? `\n   ${s}` : ""}`;
    })
    .join("\n");
}
