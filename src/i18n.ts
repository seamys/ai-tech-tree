// UI strings. Content strings (node titles, branch names...) live in data/ as {zh, en}.
import type { Bilingual, Lang } from "./types";

const zh = {
  title1: "生成式 AI ",
  title2: "技术路线树",
  version: "v1.3 · 关注领域 + 实时时间轴 + 地球仪",
  docTitle: "生成式 AI 技术路线树",
  search: "搜索节点（中英文皆可）",
  timeLabel: "时间：",
  timeFocus: "聚焦近期",
  timeLinear: "线性",
  toastFocus: "聚焦近期：越接近现在，时间轴拉得越开",
  toastLinear: "线性：每个月等宽",
  links: "依赖连线",
  feed: "更新动态",
  feedShort: "动态",
  review: "待审核",
  langSwitch: "EN",
  theme: "主题",
  focus: "关注",
  focusAll: "全部领域",
  focusTitle: "关注领域",
  quickLenses: "快速视角",
  crossCut: "跨领域标签",
  clear: "清空",
  others: "其他领域",
  dim: "淡化",
  hide: "隐藏",
  focusCount: "{n} 个领域 · {m} 个节点",
  focusAllCount: "全部 {m} 个节点",
  browseLenses: "浏览视角…",
  lensTitle: "你关注什么？",
  lensDesc: "选一个视角，树会突出相关的分支。之后随时可以在顶栏「关注」里调整。",
  customFocus: "＋ 自定义组合…",
  skip: "暂不设置",
  viewN: "查看 {n} 个节点",
  focusOutside: "该节点不在当前关注范围内，已临时显示",
  langSwitchTitle: "Switch to English",
  hint: "滚轮上下移动 · Ctrl+滚轮或双指捏合缩放，越放大越细 · 点节点看详情",
  fit: "适配",
  roots: "⇣ 根系",
  canopy: "⇡ 树冠",
  replay: "▶ 回放",
  pause: "❚❚ 暂停",
  now: "现在",
  nowTag: "现在",
  jumpTo: "跳到",
  crossTags: "横切标签",
  legendKinds: "● 突破　◆ 约束　◌ 计划",
  legendNew: "◉ 30 天内新增",
  lod: "细节",
  lod0: "概览：4 大区，只显示里程碑",
  lod1: "分层：10 层与分支",
  lod2: "细分：子分支与细节节点",
  stackRoot: "生成式 AI 技术栈",
  aboveGround: "▲ 地上：智能与应用",
  underground: "▼ 地下：算力与物理基础（根系）",
  nodes: "{n} 个节点",
  detailLevel: "细节级别",
  noPlace: "无单一地点（全球性或分布式）",
  candidate: "Agent 候选 · 置信度",
  verified: "已确认",
  reasoning: "Agent 判定理由",
  approve: "通过",
  reject: "驳回",
  why: "判定依据",
  source: "来源",
  parents: "父节点（继承自）",
  children: "子节点（影响了）",
  root: "根",
  none: "暂无",
  nodeData: "节点数据（Agent 读写格式）",
  kindConstraint: "◆ 约束",
  kindEvent: "事件",
  kindUpcoming: "◌ 计划 / 未来",
  queueTitle: "待审核队列",
  queueDesc: "Agent 每次运行后，把它认为是“突破”或“约束”的候选节点放在这里，人工通过后才进入正式树。",
  suggestedUnder: "建议挂在",
  showOnTree: "在树上查看",
  queueEmpty: "队列已清空。",
  feedTitle: "更新动态",
  feedDesc: "现在是 {now}。30 天内的新节点在树上带红色脉冲和 NEW 标记，90 天内的带粉色描边。",
  comingUp: "即将到来",
  recent: "最近",
  approved: "已通过：{t}（演示，仅本页内存）",
  rejected: "已驳回：{t}",
  tagOn: "已高亮 #{t}，再点一次取消",
  loading: "加载中…",
  loadError: "数据加载失败",
  close: "关闭",
  listSep: "、",
  inDays: "{n} 天后",
  today: "今天",
  daysAgo: "{n} 天前",
  monthsAgo: "{n} 个月前",
  yearsAgo: "{n} 年前",
};

type Strings = typeof zh;

const en: Strings = {
  title1: "Generative AI ",
  title2: "Tech Roadmap",
  version: "v1.3 · focus areas + live timeline + globe",
  docTitle: "Generative AI Tech Roadmap",
  search: "Search nodes (EN or 中文)",
  timeLabel: "Time: ",
  timeFocus: "recent focus",
  timeLinear: "linear",
  toastFocus: "Recent focus: the closer to now, the wider the axis",
  toastLinear: "Linear: every month the same width",
  links: "Links",
  feed: "What's new",
  feedShort: "New",
  review: "Review",
  langSwitch: "中文",
  theme: "Theme",
  focus: "Focus",
  focusAll: "All areas",
  focusTitle: "Focus areas",
  quickLenses: "Quick lenses",
  crossCut: "Cross-cutting tags",
  clear: "Clear",
  others: "Other areas",
  dim: "Dim",
  hide: "Hide",
  focusCount: "{n} areas · {m} nodes",
  focusAllCount: "All {m} nodes",
  browseLenses: "Browse lenses…",
  lensTitle: "What are you interested in?",
  lensDesc: "Pick a lens and the tree highlights the branches that matter. You can change it any time from Focus in the header.",
  customFocus: "+ Custom mix…",
  skip: "Not now",
  viewN: "Show {n} nodes",
  focusOutside: "This node is outside your focus; showing it for now",
  langSwitchTitle: "切换到中文",
  hint: "Scroll to pan · Ctrl+scroll or pinch to zoom; zoom in for more detail · click a node for details",
  fit: "Fit",
  roots: "⇣ Roots",
  canopy: "⇡ Canopy",
  replay: "▶ Replay",
  pause: "❚❚ Pause",
  now: "Now",
  nowTag: "NOW",
  jumpTo: "Jump to",
  crossTags: "Cross-cutting tags",
  legendKinds: "● Breakthrough　◆ Constraint　◌ Scheduled",
  legendNew: "◉ New in 30 days",
  lod: "Detail",
  lod0: "Overview: 4 zones, milestones only",
  lod1: "Layers: 10 layers and branches",
  lod2: "Detail: sub-branches and detail nodes",
  stackRoot: "Generative AI stack",
  aboveGround: "▲ ABOVE GROUND: intelligence & applications",
  underground: "▼ UNDERGROUND: compute & physical foundations (roots)",
  nodes: "{n} nodes",
  detailLevel: "Detail level",
  noPlace: "No single location (global or distributed)",
  candidate: "Agent candidate · confidence",
  verified: "Verified",
  reasoning: "Agent's reasoning",
  approve: "Approve",
  reject: "Reject",
  why: "Why it counts",
  source: "Source",
  parents: "Parents (builds on)",
  children: "Children (influenced)",
  root: "Root",
  none: "None yet",
  nodeData: "Node data (agent read/write format)",
  kindConstraint: "◆ Constraint",
  kindEvent: "Event",
  kindUpcoming: "◌ Scheduled",
  queueTitle: "Review queue",
  queueDesc: "After each run the agent puts candidate breakthroughs and constraints here. They join the tree only after a human approves them.",
  suggestedUnder: "Suggested under",
  showOnTree: "Show on tree",
  queueEmpty: "Queue is empty.",
  feedTitle: "What's new",
  feedDesc: "It is now {now}. Nodes from the last 30 days pulse red with a NEW tag; nodes from the last 90 days have a pink outline.",
  comingUp: "Coming up",
  recent: "Recent",
  approved: "Approved: {t} (demo, in-page memory only)",
  rejected: "Rejected: {t}",
  tagOn: "Highlighting #{t}. Click again to clear.",
  loading: "Loading…",
  loadError: "Failed to load data",
  close: "Close",
  listSep: ", ",
  inDays: "in {n} days",
  today: "today",
  daysAgo: "{n} days ago",
  monthsAgo: "{n} months ago",
  yearsAgo: "{n} years ago",
};

export type UIKey = keyof Strings;
const STRINGS: Record<Lang, Strings> = { zh, en };

export function t(lang: Lang, key: UIKey, vars?: Record<string, string | number>): string {
  let s = STRINGS[lang][key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Pick the right language from a {zh, en} value (or pass a plain string through). */
export const loc = (v: Bilingual | string | undefined, lang: Lang): string =>
  v === undefined ? "" : typeof v === "string" ? v : v[lang] || v.zh;

export const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (monthIndex: number, lang: Lang) =>
  lang === "en" ? MONTHS_EN[monthIndex] : `${monthIndex + 1}月`;

/** Human-friendly distance from now, e.g. "5 days ago" / "in 51 days". ageMonths < 0 means future. */
export function relativeTime(ageMonths: number, lang: Lang): string {
  const days = Math.round(-ageMonths * 30.5);
  if (days > 0) return t(lang, "inDays", { n: days });
  if (days === 0) return t(lang, "today");
  if (-days < 60) return t(lang, "daysAgo", { n: -days });
  if (-days < 730) return t(lang, "monthsAgo", { n: Math.round(-days / 30.5) });
  return t(lang, "yearsAgo", { n: Math.round(-days / 365) });
}

export function initialLang(): Lang {
  try {
    const h = location.hash.slice(1);
    if (h === "en" || h === "zh") return h;
    const saved = localStorage.getItem("gt-lang");
    if (saved === "en" || saved === "zh") return saved;
  } catch { /* storage can be unavailable */ }
  return "zh";
}

export function persistLang(lang: Lang) {
  try { localStorage.setItem("gt-lang", lang); } catch { /* ignore */ }
  try { history.replaceState(null, "", `#${lang}`); } catch { /* ignore */ }
}
