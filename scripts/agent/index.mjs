#!/usr/bin/env node
// Daily maintenance agent. Reads feeds, lets Claude search and verify, and
// appends the nodes it proposes to data/nodes.json as status "candidate".
// It never publishes anything itself: .github/workflows/agent.yml validates the
// result and opens a pull request for human review.
//
//   npm run agent -- --feeds-only        fetch feeds and print the digest (no API call)
//   npm run agent -- --dry-run           run the model, print proposals, change no files
//   npm run agent -- --report report.md  also write the PR body
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { collectFeeds, formatDigest } from "./feeds.mjs";
import { buildProposalSchema, makeContext, checkProposal, appendNodes, extractSeenUrls, normalizeUrl } from "./candidates.mjs";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.mjs";
import { renderReport } from "./report.mjs";

const MODEL = "claude-opus-5-5";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    "feeds-only": { type: "boolean", default: false },
    max: { type: "string", default: process.env.AGENT_MAX_CANDIDATES || "5" },
    "since-days": { type: "string", default: process.env.AGENT_SINCE_DAYS || "3" },
    report: { type: "string" },
    seen: { type: "string" },
  },
});
const maxCandidates = Math.max(0, Math.min(20, Number.parseInt(args.max, 10) || 5));
const sinceDays = Math.max(1, Math.min(30, Number.parseInt(args["since-days"], 10) || 3));

const tax = readJson("data/taxonomy.json");
const nodesText = readFileSync(join(root, "data/nodes.json"), "utf8");
const nodes = JSON.parse(nodesText);
const sources = readJson("scripts/agent/sources.json");
const seenUrls = args.seen && existsSync(args.seen) ? extractSeenUrls(readFileSync(args.seen, "utf8")) : [];

const now = new Date();
const today = now.toISOString().slice(0, 10);
const since = new Date(now.getTime() - sinceDays * 86_400_000);
const sinceDate = since.toISOString().slice(0, 10);
const horizon = new Date(now.getTime() + 60 * 86_400_000).toISOString().slice(0, 10);

// --- 1. feeds ---------------------------------------------------------------
const knownUrls = [...nodes.filter((n) => n.url).map((n) => normalizeUrl(n.url)), ...seenUrls.map(normalizeUrl)];
const { items, report: feedReport } = await collectFeeds(sources.feeds, { since, knownUrls });
for (const r of feedReport) console.error(r.ok ? `feed ${r.feed}: ${r.kept} new of ${r.parsed}` : `feed ${r.feed}: FAILED (${r.error})`);
const digest = formatDigest(items);

if (args["feeds-only"]) {
  console.log(digest || "(no new feed items)");
  process.exit(0);
}

// --- 2. model ---------------------------------------------------------------
const ctx = makeContext(tax, nodes, { today, seenUrls });
const accepted = []; // { node, evidence }
const rejected = []; // { title, errors }

const proposeNode = betaTool({
  name: "propose_node",
  description: "Propose one new node for the tree. Call it once per node, only after you have confirmed the facts from a primary source. It returns errors when a field is invalid or the item is already in the tree; fix them and call again. It refuses further proposals once the limit for this run is reached.",
  strict: true,
  inputSchema: buildProposalSchema(tax, nodes),
  run: (input) => {
    if (accepted.length >= maxCandidates) return `Limit of ${maxCandidates} proposals reached. Do not propose more; finish with your note for the reviewer.`;
    const res = checkProposal(input, ctx);
    if (res.errors) {
      rejected.push({ title: input?.title?.en ?? "(untitled)", errors: res.errors });
      throw new Error(`Not accepted:\n- ${res.errors.join("\n- ")}`);
    }
    accepted.push(res);
    console.error(`proposed ${res.node.id}: ${res.node.title.en} (confidence ${res.node.confidence})`);
    return `Accepted as "${res.node.id}" (${accepted.length}/${maxCandidates}).`;
  },
});

const upcoming = nodes.filter((n) => n.kind === "upcoming" && n.date <= horizon);
const client = new Anthropic();
const runner = client.beta.messages.toolRunner({
  model: MODEL,
  max_tokens: 16000,
  thinking: { type: "adaptive" },
  output_config: { effort: "high" },
  cache_control: { type: "ephemeral" },
  // On a safety decline, the API re-runs the request on a fallback model it picks.
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  max_iterations: 40,
  system: buildSystemPrompt(tax, sources),
  tools: [
    { type: "web_search_20260209", name: "web_search", max_uses: 20 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 30 },
    proposeNode,
  ],
  messages: [{
    role: "user",
    content: buildUserPrompt({ today, sinceDate, digest, feedCount: items.length, nodes, upcoming, maxCandidates }),
  }],
});

const usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, searches: 0, fetches: 0, turns: 0 };
let last;
for await (const message of runner) {
  last = message;
  const u = message.usage ?? {};
  usage.turns++;
  usage.input += u.input_tokens ?? 0;
  usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
  usage.cacheRead += u.cache_read_input_tokens ?? 0;
  usage.output += u.output_tokens ?? 0;
  usage.searches += u.server_tool_use?.web_search_requests ?? 0;
  usage.fetches += u.server_tool_use?.web_fetch_requests ?? 0;
}

const note = (last?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
const stop = last?.stop_reason ?? "none";
console.error(`stop_reason: ${stop}; turns ${usage.turns}; tokens in ${usage.input} (+${usage.cacheRead} cached, ${usage.cacheWrite} cache writes), out ${usage.output}; searches ${usage.searches}, fetches ${usage.fetches}`);
if (stop === "refusal") console.error("warning: the run ended in a refusal; proposals made before it are kept.");

// --- 3. output --------------------------------------------------------------
const newNodes = accepted.map((a) => a.node);
if (args["dry-run"]) {
  for (const n of newNodes) console.log(JSON.stringify(n, null, 2));
} else if (newNodes.length) {
  writeFileSync(join(root, "data/nodes.json"), appendNodes(nodesText, newNodes));
  console.error(`appended ${newNodes.length} candidate node(s) to data/nodes.json`);
}

const report = renderReport({
  today, sinceDate, model: last?.model ?? MODEL, accepted, rejected, note, feedReport,
  feedCount: items.length, usage, stop, dryRun: args["dry-run"],
  seen: [...accepted.map((a) => a.node.url), ...items.map((i) => i.link)],
});
if (args.report) writeFileSync(args.report, report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `count=${args["dry-run"] ? 0 : newNodes.length}\n`);
