# Architecture

## Data / presentation split

| Concern | Where | Changes when |
| --- | --- | --- |
| Content (nodes) | `data/nodes.json` | a new breakthrough or constraint is added |
| Structure (zones, layers, branches, tags, criteria) | `data/taxonomy.json` | the classification changes |
| Contract | `data/schema/node.schema.json` + `scripts/validate.mjs` | the data model changes |
| Interface strings | `src/i18n.ts` | UI text changes |
| Presentation | `src/` | the UI changes |

The app fetches the two JSON files at runtime. `scripts/build.mjs` stamps a hash of the data into `<meta name="data-version">`, and `index.html` preloads both files with that version. Data and code therefore download in parallel. They are also cached independently: a data-only change keeps the hashed JS/CSS bundle cached.

Every bilingual field is `{ "zh": "...", "en": "..." }`, so one record holds both languages and an agent writes both at once.

`validate.mjs` enforces what JSON Schema cannot:
- every branch, tag, criterion and parent id exists;
- ids are unique;
- parents form a DAG with no cycles;
- candidates carry a reason;
- sub-branches stay one level deep, in the same layer as their parent.

## Rendering pipeline

```
data ──► computeLayout(nodes, taxonomy, lod, lang, timeScale) ──► Layout   (pure, memoised)
                                                                    │
                                    React renders the SVG once ◄────┘
                                                                    │
pointer / wheel ──► view {x, y, k} ──► requestAnimationFrame ──► applyNow()
```

`computeLayout` (src/lib/layout.ts) is a pure function. It reruns only when one of its inputs changes: the data, the level of detail, the language, the time scale, or the minute on the clock. It never reruns on pan or zoom.

Pan and zoom never trigger a React render. `applyNow()` runs at most once per animation frame and does only cheap, imperative work:

- Sets one `transform` on the world group.
- Sets one CSS variable `--s = 1/zoom`. Markers and labels counter-scale through `transform: scale(var(--s))`, so they keep the same on-screen size at every zoom level, as on a map. Only positions and spacing change.
- Declutters labels when the zoom changes (not on pan, because overlaps do not depend on translation). Placement is greedy by priority: selected node, search hits, new, milestones, recent, then the rest. Dots are obstacles. Each label tries the right of its dot, then the left, and is otherwise hidden; hovering a node reveals its label. Widths come from `measureText` with each label's computed font, are cached, and are re-measured when the theme or web fonts change. A uniform grid keeps each pass at about O(n).
- Moves the sticky zone/layer/branch labels with `translate3d`, and touches `visibility` only when it actually changes.
- Draws time ticks only for months inside the viewport, from a pool of reused DOM nodes. Years take priority, then quarters, then months.
- Culls nodes far outside the viewport (`display: none`, toggled only on change). This keeps the cost flat as the tree grows.
- Checks whether the zoom crossed a level-of-detail threshold. Hysteresis prevents flicker. On a switch, the nearest milestone is kept at the same screen position so the view doesn't jump.

Node clicks use one delegated listener on the `<svg>` instead of one per node. The replay slider toggles a class on existing nodes rather than re-rendering.

Measured on the same machine with 4× CPU throttling (200 pan frames, Chromium performance metrics):

| | script / frame | style + layout / frame | main thread / frame |
| --- | --- | --- | --- |
| previous single-file page | 1.00 ms | 0.88 ms | 3.30 ms |
| this build | 0.19 ms | 0.43 ms | 1.71 ms |

## Themes

Every colour, font and stroke weight in `src/styles.css` is a CSS custom property defined on `:root`. A theme is a `[data-theme="<id>"]` block that overrides those tokens, plus a few rules for things tokens cannot express, such as ring nodes or uppercase labels. The attribute sits on `<html>` and is set by a tiny inline script in `index.html` before the bundle loads, so the first paint already uses the right theme.

Branch and zone colours live in `data/taxonomy.json` and are shared by all themes. `src/themes.ts` maps each one into the active theme's palette in OKLCH: it keeps the hue, sets a fixed lightness and caps chroma. A light theme therefore gets deep print-like inks, and a monochrome theme gets near-whites, from the same data. The themed taxonomy feeds layout and rendering, so components never branch on the theme.

Adding a theme takes three steps: add an entry to `THEMES` and `THEME_ORDER`, add a `[data-theme]` block to `styles.css`, and add the id to the regex in `index.html`.

## Focus

A focus is a set of top-level branches plus cross-cutting tags (`src/lib/focus.ts`). A node is in focus if its branch, or its parent branch, is selected, or if it carries a selected tag. Empty means everything.

- **Dim** keeps the layout and adds an `unfocus` class to nodes, twigs, limbs and lane labels. Their labels stop claiming space in the declutter pass, so labels in focus get more room.
- **Hide** filters the nodes before `computeLayout`, which skips zones and layers left empty. The selected node is always kept, so search still works, and the view re-fits after the layout changes.
- **Lenses** are curated presets in `data/taxonomy.json` (`lenses`), checked by `validate.mjs`. A lens lists top-level branches and/or tags. The first visit, with nothing stored and no `?focus=` parameter, opens the lens picker. After that the header button opens a chip popover.
- **Persistence.** The focus is saved in `localStorage` (`gt-focus`) and mirrored into the URL with `history.replaceState`, as `?focus=<lens id>` or `?focus=<branch>,tag:<tag>` plus `&fmode=hide`. A URL parameter overrides the stored value.

## Globe

The detail panel opens with a small orthographic globe (`src/components/Globe.tsx`) that turns to the node's `geo` points. It is drawn with `d3-geo` on a single canvas: sphere, graticule, Natural Earth 110m land (`data/geo/land-110m.json`, coordinates rounded to 0.1°, about 20 KB gzipped), then dashed great-circle arcs from each `origin` to each `target`, then markers and labels on the visible hemisphere only.

- **Camera.** It points at the origin, or, when the node has targets, at the midpoint between the origin and target centroids, so both ends of the arc stay in view. Rotation follows `geoInterpolate`, and its duration scales with the angle travelled.
- **Cost.** The component and the land file are a separate chunk (`React.lazy` + esbuild `splitting`) that loads the first time a panel opens. Animation runs for about 3 seconds and then stops, so an open panel costs nothing while idle. With `prefers-reduced-motion` the globe jumps straight to its final frame.
- **Theming.** Colours come from `--globe-*` custom properties in each `[data-theme]` block; arcs use the node's branch colour, or the warning colour for constraints.
- Dragging rotates the globe; the latitude is clamped so it cannot flip.

## Time axis

Time is fractional months since January 2006. `makeScale("focus")` maps it with a log curve anchored at the current moment, `x = xNow − C·ln(1 + (now − t)/τ)`: the last year gets about as much width as the decade before it. Future events use a linear extension to the right of the "now" line. The clock updates every minute; the view stays anchored on the same moment.

## Levels of detail

| lod | shown | lanes |
| --- | --- | --- |
| 0 | level-1 nodes | one per zone |
| 1 | levels 1–2 | one per branch; sub-branches merged into their parent |
| 2 | levels 1–3 | sub-branches get their own lanes |

Nodes from the last 90 days, and future nodes, are visible at every level.

## Build

`esbuild` bundles `src/main.tsx` into ES2022 modules with content-hashed file names and source maps. The build also copies `public/` (the social preview image) and writes `badges/*.json`, the shields.io endpoints behind the README's node-count and latest-event badges. There is no framework-specific build step: the same command serves the dev build (`--serve`) and the production build.
