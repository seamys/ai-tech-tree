# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/seamys/ai-tech-tree/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/seamys/ai-tech-tree/releases/tag/v1.0.0
