# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Daily agent.** `.github/workflows/agent.yml` runs once a day (and on demand). It reads lab blogs, Hugging Face daily papers and industry news, searches the web for chips, data centres, power, minerals and policy, checks the `upcoming` nodes that are due, and verifies each find against its primary source with Claude. It then opens a pull request labelled `agent` with up to five `status: "candidate"` nodes, each with its reasons and evidence. Nothing is published without a human merge.
- `npm run agent` (`--feeds-only`, `--dry-run`, `--report`), with feeds and search topics in `scripts/agent/sources.json`.
- Unit tests for the agent (`npm run test:unit`), run in CI.

### Changed
- **Lanes are easier to tell apart.** The trunk now stays pinned to the left edge at any zoom or pan. Every branch bends out of it, and every sub-branch forks visibly off its parent, so the zone → layer → branch → sub-branch structure is always on screen.
- Each branch's name repeats along its line, like a metro map, so a lane can be identified far from the left edge.
- Neighbouring branches in a zone now have clearly different colours: Agents & Tools, Fine-tuning & Serving, Multimodal, Data Centres & Clusters, Fabrication, Packaging & Memory, and Minerals & Materials got new hues.
- Lane lines are slightly bolder and keep a constant on-screen width at every zoom.
- **Selecting a node shows its relatives.** The view glides to fit the node with its parents and children next to the detail panel, instead of jumping to centre the node alone. It never zooms in further than you were, and leaves out relatives too far away to fit at the current level of detail.

### Fixed
- With a node selected, the view no longer snaps back to it every minute when the clock updates.

## [1.3.0] - 2026-11-20

### Added
- **Focus areas.** A lens picker on first visit offers eight curated starting points: everything, the LLM race, creative and multimodal, apps and agents, compute and chips, energy and resources, policy and geopolitics, and data and scaling. Each card has a mini stack map and a node count. After that, **Focus** in the header opens a popover of branch and tag chips with quick lenses.
- Other areas can be **dimmed** (the tree keeps its shape) or **hidden** (the tree compacts and empty zones and layers drop out). Selecting a hidden node through search still shows it.
- The focus is remembered per device and reflected in the URL (`?focus=energy`, `?focus=llm,reason,tag:policy&fmode=hide`), so a focused view can be shared.
- `lenses` in `data/taxonomy.json`, validated by `scripts/validate.mjs`.

### Changed
- Zone headers show "in focus / total" node counts when a focus is active.
- On phones, the search box expands across the header while typing.

### Fixed
- Sticky captions and culled nodes could stay hidden after a layout change, because React reuses their elements.

## [1.2.1] - 2026-11-20

### Fixed
- Text no longer changes size while zooming. Labels and markers now keep a constant on-screen size at every zoom and level of detail; before, they shrank, held, then grew, and jumped at each level change.

### Changed
- Overlapping labels are hidden by priority (selected, search hits, new, milestones, recent) instead of being drawn on top of each other. A label moves to the left of its dot when the right side is taken. Hover a node to see a hidden label.
- Sticky captions on the left edge no longer stack on top of each other when zoomed out.

## [1.2.0] - 2026-11-20

### Added
- Globe in the detail panel: opening a node turns it to where the event happened, with a ripple marker. Policies, supply shocks and lawsuits draw a great-circle arc from origin to the places affected. It is drag-to-rotate, follows the active theme and respects `prefers-reduced-motion`.
- Optional `geo` field on nodes (`lat`, `lon`, bilingual `place`, `role: origin | target`), validated by the schema and `scripts/validate.mjs`. 134 of 137 nodes now have it.
- `data/geo/land-110m.json`, derived from public-domain Natural Earth.

### Changed
- The globe and its map data load lazily as a separate chunk the first time a panel opens, so the initial bundle did not grow.

## [1.1.0] - 2026-11-20

### Added
- Theme picker in the header with four themes: **Observatory** (default; refined dark, ring nodes), **Atlas** (light, printed paper, serif), **Blueprint** (engineering drawing) and **Mission Control** (black telemetry, red/amber alerts only). The choice is saved per device; `?theme=<id>` overrides it.
- Per-theme palette: branch colours from `data/taxonomy.json` are remapped in OKLCH to each theme's lightness and saturation, so contrast stays consistent.

### Changed
- All colours and fonts now come from CSS custom properties; the original look remains available internally as `classic`.
- The theme is applied before first paint (no flash of the wrong colours).
- Sticky labels hide before they reach the bottom controls.

## [1.0.0] - 2026-11-19

### Added
- Interactive tech tree of generative AI: 10 layers in 4 zones (value, intelligence, compute, physical), with the physical foundations drawn as roots below a ground line.
- 137 seed nodes from 2007 to 2027 with bilingual (zh/en) titles and summaries, sources and "why it counts" criteria.
- Two node kinds: breakthroughs and constraints/events (export controls, supply, power, legal).
- Semantic zoom with three levels of detail; sub-branches split out at the deepest level.
- Live timeline: log-scaled "recent focus" axis or linear axis, a real-time "now" line, freshness markers for the last 30/90 days, scheduled future nodes, and a replay slider.
- Cross-cutting tags (policy, capital, safety), dependency links, search in both languages, review queue for agent-proposed candidates, and a "what's new" feed.
- Data split from code: `data/taxonomy.json`, `data/nodes.json`, a JSON Schema and a validation script.
- React 19 + TypeScript app bundled with esbuild; content-hashed assets and preloaded data.
- CI on GitHub Actions: validate, type-check, build and deploy to GitHub Pages; Dependabot for actions and npm.

### Performance
- Pan and zoom run outside React: one transform and one CSS variable per frame, pooled time ticks, viewport culling. Main-thread time per pan frame dropped from 3.3 ms to 1.7 ms compared with the previous single-file page.

[Unreleased]: https://github.com/seamys/ai-tech-tree/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/seamys/ai-tech-tree/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/seamys/ai-tech-tree/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/seamys/ai-tech-tree/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/seamys/ai-tech-tree/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/seamys/ai-tech-tree/releases/tag/v1.0.0
