// Markdown for the pull request body and the workflow summary.
// The hidden agent-seen block lets later runs skip what this run already read.

const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");

// Opus 5.5 list prices per million tokens; web search and fetch are billed separately.
const PRICE = { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 };

export function renderReport({ today, sinceDate, model, accepted, rejected, note, feedReport, feedCount, usage, stop, dryRun, seen }) {
  const cost = (usage.input * PRICE.input + usage.cacheWrite * PRICE.cacheWrite + usage.cacheRead * PRICE.cacheRead + usage.output * PRICE.output) / 1e6;
  const out = [];
  out.push(`## Agent run ${today}${dryRun ? " (dry run)" : ""}`);
  out.push("");
  out.push(accepted.length
    ? `Proposes **${accepted.length}** candidate node(s) from events since ${sinceDate}. They are added with \`status: "candidate"\` and show up in the review queue. Merge to publish them as candidates; edit or delete lines in \`data/nodes.json\` to change or drop one. To make one verified, set \`status\` to \`"verified"\`.`
    : `No candidates since ${sinceDate}.`);
  out.push("");

  if (accepted.length) {
    out.push("| id | date | branch | level | kind | title | confidence |");
    out.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const { node: n } of accepted) {
      out.push(`| \`${n.id}\` | ${n.date} | ${n.branch} | ${n.level} | ${n.kind} | ${esc(n.title.en)} / ${esc(n.title.zh)} | ${n.confidence} |`);
    }
    out.push("");
    for (const { node: n, evidence } of accepted) {
      out.push(`### \`${n.id}\`: ${esc(n.title.en)}`);
      out.push("");
      out.push(`- **Summary:** ${esc(n.summary.en)}`);
      out.push(`- **摘要：** ${esc(n.summary.zh)}`);
      out.push(`- **Why:** ${esc(n.agent_reason.en)}`);
      out.push(`- **理由：** ${esc(n.agent_reason.zh)}`);
      out.push(`- **Parents:** ${n.parents.length ? n.parents.map((p) => `\`${p}\``).join(", ") : "none"} · **Criteria:** ${n.criteria.join(", ")}${n.tags ? ` · **Tags:** ${n.tags.join(", ")}` : ""}`);
      out.push(`- **Source:** ${n.url}`);
      const extra = (evidence ?? []).filter((e) => e !== n.url);
      if (extra.length) out.push(`- **Also read:** ${extra.join(" · ")}`);
      if (n.geo) out.push(`- **Place:** ${n.geo.map((g) => `${g.place.en}${g.role === "target" ? " (target)" : ""}`).join(", ")}`);
      out.push("");
    }
  }

  if (note) {
    out.push("### Agent's note");
    out.push("");
    out.push(note.split("\n").map((l) => `> ${l}`).join("\n"));
    out.push("");
  }

  out.push("<details><summary>Run details</summary>");
  out.push("");
  out.push(`- Model: \`${model}\`, stop reason \`${stop}\`, ${usage.turns} turn(s)`);
  out.push(`- Tokens: ${usage.input} input, ${usage.cacheRead} cache reads, ${usage.cacheWrite} cache writes, ${usage.output} output (about $${cost.toFixed(2)} before tool fees)`);
  out.push(`- Web: ${usage.searches} search(es), ${usage.fetches} fetch(es)`);
  out.push(`- Feeds: ${feedCount} new item(s); ${feedReport.map((r) => (r.ok ? `${r.feed} ${r.kept}` : `${r.feed} failed (${esc(r.error)})`)).join(", ")}`);
  if (rejected.length) {
    out.push(`- Proposals the checks sent back (the agent may have fixed them): ${rejected.map((r) => `${esc(r.title)}: ${esc(r.errors.join("; "))}`).join(" · ")}`);
  }
  out.push("");
  out.push("</details>");
  out.push("");
  out.push(`<!-- agent-seen\n${[...new Set(seen)].join("\n")}\n-->`);
  out.push("");
  return out.join("\n");
}
