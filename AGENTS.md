# AGENTS.md

Guidance for coding agents (Codex, Claude Code and others) working in this repository.
Read it before making changes. Human-facing docs are in `README.md`, `CONTRIBUTING.md` and `docs/ARCHITECTURE.md`.

## What this is

**AI Tech Tree**: an interactive, bilingual (zh/en) map of generative AI, from minerals and energy up to applications.
Each node is a breakthrough or a constraint. The tree has 10 layers (L0–L9) in 4 zones, zooms semantically, runs on a live time axis anchored at "now", and offers a globe, focus lenses and 4 themes.

- Live: https://seamys.github.io/ai-tech-tree/ (GitHub Pages, deployed by CI from `main`)
- Stack: React 19 + TypeScript 7, bundled by esbuild (`scripts/build.mjs`); d3-geo for the globe. No other runtime dependencies.
- Data (`data/`, CC BY 4.0) is separate from code (MIT). It is fetched at runtime and cache-busted by a content hash.

## Commands

```bash
npm install
npx playwright install chromium   # once, for the e2e test
npm run dev        # build + serve with watch (http://localhost:5173)
npm run validate   # data/ against the schema and cross-file rules
npm run typecheck
npm run build      # dist/ with hashed assets, data version stamp and badges
npm run test:unit  # node:test unit tests for scripts/agent (no network)
npm run test:e2e   # serves dist/ and drives the app in Chromium (needs a build first)
npm run agent -- --feeds-only   # agent feeds only, no model call
npm run agent -- --dry-run      # full agent run, prints proposals, writes nothing (needs ANTHROPIC_API_KEY)
```

Before you finish a change, run all of `validate`, `typecheck`, `test:unit`, `build` and `test:e2e`. CI (`.github/workflows/pages.yml`) runs the same on every push and PR.

## Layout

```
data/taxonomy.json      zones, layers, branches (sub-branches have `parent`), tags, criteria, lenses
data/nodes.json         one node per line (keeps diffs readable); bilingual text everywhere
data/geo/land-110m.json Natural Earth land, coordinates rounded to 0.1°
data/schema/            JSON Schema for nodes
scripts/build.mjs       esbuild build/serve, HTML shell, data hash, badges
scripts/validate.mjs    data checks (keep in sync with the schema and types)
scripts/agent/          daily agent (index: run; feeds: fetch/parse; prompt; candidates: pure checks
                        and serialisation; report: PR body; sources.json: feeds and search focus)
.github/workflows/agent.yml  daily run that opens a pull request of candidates
tests/unit/             node:test tests for scripts/agent
src/App.tsx             state: language, theme, focus, panels, time mode, LOD
src/lib/layout.ts       pure layout: nodes → positions, lanes, zone/layer rows
src/lib/time.ts         time scales (linear / focus-on-recent log scale anchored at now)
src/lib/focus.ts        focus model, URL and localStorage persistence (pure)
src/components/TreeCanvas.tsx  pan/zoom, culling, label declutter (imperative, rAF)
src/components/TreeLayer.tsx   memoized SVG of the tree
src/components/Focus.tsx       header focus menu and first-visit lens picker
src/components/Globe.tsx       lazy-loaded canvas globe in the detail panel
src/themes.ts           4 themes; data colours are remapped per theme
tests/e2e/smoke.mjs     end-to-end checks
```

## Conventions

- **Language.** Code, comments, commit messages and docs are in English. Every user-visible string is bilingual: UI strings in `src/i18n.ts`, data as `{ "zh": …, "en": … }`. The project owner usually writes in Chinese, so answer them in Chinese.
- **Current tools only.** Use current, maintained versions of actions, Node (`.nvmrc`) and libraries. Do not introduce deprecated APIs or outdated patterns.
- **Data and code stay separate.** Curated content (nodes, branches, lenses) belongs in `data/`, not in code. When you add a data field, update `data/schema/`, `scripts/validate.mjs`, `src/types.ts` and the README data model together.
- **Data rules** (also in CONTRIBUTING):
  - `geo`: papers and releases use the headquarters of the main institution; physical events use the actual site; policies and lawsuits use the issuing jurisdiction as `origin`, with affected parties as `role: "target"`. Omit `geo` when there is no single place.
  - `level` is honest: 1 is a milestone, 2 is important, 3 is detail.
  - Lens `branches` must be top-level branch ids; sub-branches are included automatically.
- **Versioning.** Semantic versions. For a release, bump `package.json`, `CITATION.cff` and the version string in `src/i18n.ts` (both languages), and add a `CHANGELOG.md` entry with its compare link.
- **Docs follow code.** User-visible features go in README's feature table and CHANGELOG; mechanisms go in `docs/ARCHITECTURE.md`.

## Invariants (easy to break)

- **No React re-render on pan or zoom.** `TreeCanvas` applies transforms imperatively in rAF. One CSS variable `--s = 1/zoom` counter-scales markers and labels (`.ns`), so they keep a constant on-screen size. Do not make text scale with zoom.
- **Label declutter** (`declutter()` in TreeCanvas) reruns only when the zoom, selection, search, tags, focus or theme changes, never on pan. Labels are placed by priority (selected > search hit > new > level 1 > recent > rest), with dots as obstacles; each tries the right of its dot, then the left, otherwise it is hidden and hover reveals it. Widths come from `measureText` plus a cache cleared on theme or font change.
- **React reuses DOM elements across layouts.** Anything the canvas hides imperatively (`style.display` on culled nodes, `style.visibility` on sticky captions, `nolab`/`lft` classes) must be reset when a new layout's elements are collected. A missing reset makes headers or nodes disappear after a layout change.
- **The layout is pure** (`computeLayout`). Focus "hide" filters nodes before layout; empty zones and layers are skipped. The selected node is always kept.
- **Themes.** All colours go through CSS custom properties in `[data-theme]` blocks. Data colours are remapped by `paint()` in `src/themes.ts`. New UI must look right in all four themes: observatory (default, dark), atlas (light), blueprint and mission.
- **Performance budget.** The globe and its map data load lazily (separate chunk). Animations must stop when settled: an idle page requests no animation frames, and the e2e test checks this.
- **Mobile.** At 390px wide the header must fit (the e2e test checks this). Popovers become fixed sheets; `.top` has `backdrop-filter`, so fixed children are positioned relative to the header.
- **The agent only proposes.** It appends `status: "candidate"` nodes and the workflow opens a PR; it never pushes to `main` or edits existing nodes. Every proposal passes `checkProposal()` in `scripts/agent/candidates.mjs` before it is written. When the node model changes, update that file, `buildProposalSchema()` and the system prompt in `scripts/agent/prompt.mjs` with the schema and validator. Web pages are untrusted input: the model gets no tool that writes files or runs code, and the agent step runs without a push-capable token.

## Code review rules

- Reject changes that re-render React on pan or zoom, scale label text with zoom, or skip the DOM-reuse resets above.
- Data changes must pass `npm run validate`. New fields need schema + validator + types + docs.
- Every new UI string exists in both `zh` and `en`.
- Check visual changes in all four themes and on a phone viewport.

## Open work

- Full-screen map view with time replay (phase 2 of the globe).
- Agent follow-ups: notifications beyond GitHub's own PR emails (Telegram, email digest); letting the agent suggest edits to existing nodes (for example an `upcoming` node whose date has passed).
- Release tags v1.0.0–v1.3.0 have not been created on GitHub yet.
