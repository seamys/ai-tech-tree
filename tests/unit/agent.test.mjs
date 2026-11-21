// Unit tests for the daily agent's pure helpers (no network, no API calls).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildProposalSchema, checkProposal, makeContext, appendNodes, formatInline, normalizeUrl, extractSeenUrls, slugify } from "../../scripts/agent/candidates.mjs";
import { parseFeed, parseHfDaily, decodeText } from "../../scripts/agent/feeds.mjs";
import { renderReport } from "../../scripts/agent/report.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tax = JSON.parse(readFileSync(join(root, "data/taxonomy.json"), "utf8"));
const nodesText = readFileSync(join(root, "data/nodes.json"), "utf8");
const nodes = JSON.parse(nodesText);
const today = "2026-11-21";

const proposal = (over = {}) => ({
  id_hint: "Test Model 9",
  date: "2026-11-20",
  branch: "llm",
  parents: ["transformer"],
  level: 2,
  kind: "release",
  title: { zh: "测试模型 9", en: "Test Model 9" },
  summary: { zh: "一个用于测试的模型。", en: "A model used for testing." },
  source: "Example Lab",
  url: "https://example.com/test-model-9?utm_source=x",
  criteria: [Object.keys(tax.criteria)[0]],
  tags: [],
  geo: [{ lat: 37.7749, lon: -122.4194, place: { zh: "旧金山", en: "San Francisco" }, role: "origin" }],
  confidence: 0.734,
  reason: { zh: "测试。", en: "Test." },
  evidence: ["https://example.com/test-model-9", "not a url"],
  ...over,
});

test("a valid proposal becomes a candidate node", () => {
  const ctx = makeContext(tax, nodes, { today });
  const { node, evidence, errors } = checkProposal(proposal(), ctx);
  assert.equal(errors, undefined);
  assert.equal(node.id, "test-model-9");
  assert.equal(node.status, "candidate");
  assert.equal(node.added_by, "agent");
  assert.equal(node.added_at, today);
  assert.equal(node.confidence, 0.73);
  assert.deepEqual(node.geo, [{ lat: 37.77, lon: -122.42, place: { zh: "旧金山", en: "San Francisco" } }]);
  assert.equal("tags" in node, false);
  assert.deepEqual(evidence, ["https://example.com/test-model-9"]);
});

test("duplicates are refused within a run and against the tree", () => {
  const ctx = makeContext(tax, nodes, { today });
  assert.ok(checkProposal(proposal(), ctx).node);
  const again = checkProposal(proposal({ url: "https://www.example.com/test-model-9/" }), ctx);
  assert.match(again.errors.join(" "), /already in the tree/);
  const existing = nodes.find((n) => n.url);
  const dupe = checkProposal(proposal({ url: existing.url, title: { zh: "x", en: "Fresh title" } }), ctx);
  assert.match(dupe.errors.join(" "), /already in the tree/);
});

test("seen URLs from earlier pull requests are refused", () => {
  const seen = extractSeenUrls("body\n<!-- agent-seen\nhttps://example.com/test-model-9\nhttps://arxiv.org/pdf/2611.00001v2\n-->");
  assert.deepEqual(seen, ["https://example.com/test-model-9", "https://arxiv.org/pdf/2611.00001v2"]);
  const ctx = makeContext(tax, nodes, { today, seenUrls: seen });
  assert.ok(checkProposal(proposal(), ctx).errors);
  assert.ok(checkProposal(proposal({ url: "https://arxiv.org/abs/2611.00001", title: { zh: "a", en: "Other" } }), ctx).errors);
});

test("invalid fields come back as errors the model can fix", () => {
  const ctx = makeContext(tax, nodes, { today });
  const { errors } = checkProposal(proposal({
    date: "2026-12-01", branch: "nope", parents: ["missing"], criteria: [], url: "ftp://x", confidence: 2,
    geo: [{ lat: 0, lon: 0, place: { zh: "x", en: "x" }, role: "target" }],
  }), ctx);
  const text = errors.join("\n");
  for (const re of [/future/, /unknown branch/, /unknown parents/, /criterion/, /http\(s\)/, /confidence/, /origin/]) assert.match(text, re);
  assert.match(checkProposal(proposal({ kind: "upcoming", date: "2026-01-01" }), ctx).errors.join(" "), /future date/);
  assert.ok(checkProposal(proposal({ kind: "upcoming", date: "2027-02-01", url: "https://example.com/u" }), ctx).node);
});

test("ids are slugs and stay unique", () => {
  assert.equal(slugify("GPT-6 Astra!"), "gpt-6-astra");
  const ctx = makeContext(tax, nodes, { today });
  const taken = nodes[0].id;
  const { node } = checkProposal(proposal({ id_hint: taken }), ctx);
  assert.equal(node.id, `${taken}-2`);
});

test("appended nodes keep one node per line and pass a JSON round trip", () => {
  const ctx = makeContext(tax, nodes, { today });
  const { node } = checkProposal(proposal(), ctx);
  const text = appendNodes(nodesText, [node]);
  const parsed = JSON.parse(text);
  assert.equal(parsed.length, nodes.length + 1);
  assert.deepEqual(parsed.at(-1), node);
  const lines = text.trimEnd().split("\n");
  assert.equal(lines.at(-1), "]");
  assert.equal(lines.at(-2), `  ${formatInline(node)}`);
  assert.ok(text.startsWith(nodesText.replace(/\s*\]\s*$/, "")));
  assert.match(lines.at(-2), /^ {2}\{"id": "test-model-9", "date": "2026-11-20", "branch": "llm", "parents": \["transformer"\]/);
});

test("the tool schema lists live taxonomy ids and only supported keywords", () => {
  const schema = buildProposalSchema(tax, nodes);
  assert.deepEqual(schema.properties.branch.enum, tax.branches.map((b) => b.id));
  assert.equal(schema.properties.parents.items.enum.length, nodes.length);
  const walk = (s) => {
    for (const k of ["minimum", "maximum", "minLength", "maxLength", "pattern"]) assert.equal(k in s, false, `unsupported ${k}`);
    if (s.type === "object") {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
      Object.values(s.properties).forEach(walk);
    }
    if (s.items) walk(s.items);
  };
  walk(schema);
});

test("URL normalisation", () => {
  assert.equal(normalizeUrl("https://www.Example.com/a/?utm_source=x&id=3#top"), "example.com/a?id=3");
  assert.equal(normalizeUrl("https://arxiv.org/pdf/2611.26232v3.pdf"), "arxiv.org/abs/2611.26232");
  assert.equal(normalizeUrl("https://huggingface.co/papers/2611.26232"), "arxiv.org/abs/2611.26232");
});

test("RSS and Atom parsing", () => {
  const rss = `<rss><channel><item><title><![CDATA[Hello &amp; <b>world</b>]]></title><link>https://a.com/1</link>
    <pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Body&nbsp;text</p>]]></description></item></channel></rss>`;
  const [r] = parseFeed(rss);
  assert.equal(r.title, "Hello & world");
  assert.equal(r.link, "https://a.com/1");
  assert.equal(r.date.toISOString(), "2026-11-20T10:00:00.000Z");
  assert.equal(r.summary, "Body text");
  const atom = `<feed><entry><title type="html">Atom &#8216;item&#8217;</title><link rel="replies" href="https://a.com/c"/>
    <link rel="alternate" type="text/html" href="https://a.com/2" /><published>2026-11-20T13:50:19-05:00</published></entry></feed>`;
  const [a] = parseFeed(atom);
  assert.equal(a.title, "Atom ‘item’");
  assert.equal(a.link, "https://a.com/2");
  assert.equal(decodeText("&#x4e2d;&#25991;"), "中文");
  const hf = parseHfDaily([{ paper: { id: "2611.1", title: "B", upvotes: 1, publishedAt: "2026-11-19T00:00:00Z" } },
    { paper: { id: "2611.2", title: "A", upvotes: 9, publishedAt: "2026-11-19T00:00:00Z" } }]);
  assert.deepEqual(hf.map((p) => p.link), ["https://arxiv.org/abs/2611.2", "https://arxiv.org/abs/2611.1"]);
});

test("report lists candidates and hides seen URLs in a comment", () => {
  const ctx = makeContext(tax, nodes, { today });
  const res = checkProposal(proposal(), ctx);
  const md = renderReport({
    today, sinceDate: "2026-11-18", model: "claude-opus-5-5", accepted: [res], rejected: [], note: "Checked feeds.",
    feedReport: [{ feed: "x", ok: true, parsed: 3, kept: 1 }, { feed: "y", ok: false, error: "HTTP 404" }],
    feedCount: 1, usage: { input: 1000, cacheWrite: 0, cacheRead: 0, output: 1000, searches: 2, fetches: 1, turns: 3 },
    stop: "end_turn", dryRun: false, seen: [res.node.url, res.node.url],
  });
  assert.match(md, /\| `test-model-9` \|/);
  assert.match(md, /y failed \(HTTP 404\)/);
  assert.deepEqual(extractSeenUrls(md), [res.node.url]);
});
