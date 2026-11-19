# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/seamys/ai-tech-tree/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/seamys/ai-tech-tree/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/seamys/ai-tech-tree/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/seamys/ai-tech-tree/releases/tag/v1.0.0
