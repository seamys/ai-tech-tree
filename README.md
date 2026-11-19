# Generative AI Tech Roadmap

An interactive map of generative AI, from the minerals and energy underneath it to the applications on top, laid out on a live timeline.

**Live site:** https://seamys.github.io/ai-tech-tree/ (add `#en` or `#zh` to pick the language)

## What it shows

- **10 layers in 4 zones.** Value (applications, model services and tools), Intelligence (foundation models, data), Compute (system software, data centres, chips) and Physical (fabrication, energy, minerals). The physical layers are drawn below a ground line as the tree's roots.
- **Semantic zoom.** Zooming in reveals more: overview (milestones only) → layers and branches → sub-branches and detail nodes.
- **Live timeline.** A log-scaled "recent focus" axis (or linear), a "now" line driven by the real clock, red pulses on nodes from the last 30 days, scheduled future nodes, and a replay slider.
- **Two kinds of node.** ● breakthroughs and ◆ constraints/events such as export controls, capacity shortages and power limits.
- **Bilingual.** Chinese and English for both the interface and the content.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173, rebuilds on change
npm run check      # validate data + type-check
npm run build      # production build into dist/
```

Requires Node.js 22 or newer (CI uses the version in `.nvmrc`).

## Project layout

```
data/
  taxonomy.json            zones, layers, branches, tags, criteria (all bilingual)
  nodes.json               the nodes, one per line for readable diffs
  schema/node.schema.json  the node contract (JSON Schema)
src/
  lib/time.ts              time scales (linear / recent focus), date parsing
  lib/layout.ts            pure layout: data + zoom level -> positions
  components/              React components (canvas, panels, header, controls)
  i18n.ts                  interface strings
scripts/
  build.mjs                esbuild bundle, hashed assets, data version stamp
  validate.mjs             data checks run in CI before every deploy
```

Code and content are separate: the page fetches `data/*.json` at runtime. Editing data never requires touching code. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design and performance notes.

## Adding or editing nodes

Add one line to `data/nodes.json`:

```json
{"id": "my-node", "date": "2026-11-19", "branch": "chip", "parents": ["h100"], "level": 2, "kind": "release",
 "title": {"zh": "中文标题", "en": "English title"}, "summary": {"zh": "…", "en": "…"},
 "source": "NVIDIA", "url": "https://…", "criteria": ["architecture-leap"], "status": "verified"}
```

- `date`: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, as precise as your source allows.
- `level`: `1` milestone (always visible), `2` important, `3` detail (deepest zoom only).
- `kind`: `paper`, `release`, `event`, `constraint` or `upcoming`.
- `branch`, `criteria`, `tags` must be ids from `data/taxonomy.json`; `parents` must be existing node ids.
- Agent-proposed nodes use `"status": "candidate"` plus `agent_reason` and `confidence`. They show up in the review queue.

Run `npm run validate` before committing. CI runs it too and refuses to deploy invalid data.

## Deployment

Every push to `main` runs `.github/workflows/pages.yml`: install → validate data → type-check → build → deploy to GitHub Pages. Pull requests run the same checks without deploying.

One-time setup: **Settings → Pages → Source: GitHub Actions**.

The workflow uses current major versions of the official actions (Node 24 runtime), least-privilege permissions, and does not cancel a production deploy in progress. Dependabot keeps the actions and npm dependencies up to date.

## Notes

The data is a seed set as of November 2026. Some dates and facts are still being verified; corrections are welcome.
