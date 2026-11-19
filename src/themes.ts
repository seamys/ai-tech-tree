// Visual themes. CSS handles surfaces and typography (see [data-theme] blocks in
// styles.css); this module remaps the data-defined branch colours per theme in
// OKLCH so every theme keeps consistent lightness and contrast.

export type ThemeId = "classic" | "observatory" | "atlas" | "blueprint" | "mission";

interface PaletteRule {
  /** Target lightness (0..1). */
  l: number;
  /** Maximum chroma; branch hues are kept, saturation is capped. */
  cMax: number;
  /** Multiplier applied to the source chroma before capping. */
  cScale: number;
}

interface ThemeMeta {
  name: { zh: string; en: string };
  description: { zh: string; en: string };
  /** Background, foreground and accent used for the picker swatch. */
  swatch: [string, string, string];
  palette: PaletteRule | null;
}

export const THEMES: Record<ThemeId, ThemeMeta> = {
  observatory: {
    name: { zh: "夜观", en: "Observatory" },
    description: { zh: "精致暗色，细线与空心环节点", en: "Refined dark, hairlines and ring nodes" },
    swatch: ["#08090d", "#eceef3", "#a5b0ff"],
    palette: { l: 0.79, cMax: 0.105, cScale: 0.75 },
  },
  atlas: {
    name: { zh: "图志", en: "Atlas" },
    description: { zh: "纸本印刷感，衬线字体，浅色", en: "Printed paper, serif type, light" },
    swatch: ["#f5f1e8", "#22201b", "#d6402b"],
    palette: { l: 0.54, cMax: 0.13, cScale: 0.9 },
  },
  blueprint: {
    name: { zh: "蓝图", en: "Blueprint" },
    description: { zh: "工程图纸，网格与等宽大写", en: "Engineering drawing, grid and mono caps" },
    swatch: ["#0f3057", "#eef5ff", "#ffc94d"],
    palette: { l: 0.88, cMax: 0.06, cScale: 0.45 },
  },
  mission: {
    name: { zh: "指挥中心", en: "Mission Control" },
    description: { zh: "纯黑遥测风，只用红与琥珀警示", en: "Black telemetry, red and amber alerts only" },
    swatch: ["#000000", "#f5f5f5", "#ff3b30"],
    palette: { l: 0.9, cMax: 0.035, cScale: 0.25 },
  },
  classic: {
    name: { zh: "经典", en: "Classic" },
    description: { zh: "初版配色", en: "The original palette" },
    swatch: ["#0b0f14", "#d7e1ea", "#4fd1c5"],
    palette: null,
  },
};

/** Themes offered in the picker, in display order. The first one is the default. */
export const THEME_ORDER: ThemeId[] = ["observatory", "atlas", "blueprint", "mission"];
export const DEFAULT_THEME: ThemeId = THEME_ORDER[0];

// ---- sRGB <-> OKLCH (Björn Ottosson's OKLab) ---------------------------------
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToOklch(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => toLinear(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

function oklchToHex(L: number, C: number, h: number): string {
  const A = C * Math.cos(h), B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return "#" + rgb.map((v) => Math.round(Math.min(1, Math.max(0, toGamma(v))) * 255).toString(16).padStart(2, "0")).join("");
}

const cache = new Map<string, string>();

/** Map a data colour (e.g. a branch colour) into the active theme's palette. */
export function paint(hex: string, theme: ThemeId): string {
  const rule = THEMES[theme].palette;
  if (!rule || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const key = theme + hex;
  let out = cache.get(key);
  if (!out) {
    const [, c, h] = hexToOklch(hex);
    out = oklchToHex(rule.l, Math.min(rule.cMax, c * rule.cScale), h);
    cache.set(key, out);
  }
  return out;
}

export function initialTheme(): ThemeId {
  try {
    const q = new URLSearchParams(location.search).get("theme");
    if (q && q in THEMES) return q as ThemeId;
    const saved = localStorage.getItem("gt-theme");
    if (saved && saved in THEMES) return saved as ThemeId;
  } catch { /* storage can be unavailable */ }
  return DEFAULT_THEME;
}

export function persistTheme(theme: ThemeId) {
  try { localStorage.setItem("gt-theme", theme); } catch { /* ignore */ }
}
