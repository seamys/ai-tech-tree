import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lang, Lod, TechNode, Taxonomy, TimeMode } from "./types";
import { computeLayout, indexTaxonomy } from "./lib/layout";
import { ageOf, dateToM, isRecent, makeScale } from "./lib/time";
import { initialLang, persistLang, t } from "./i18n";
import { initialTheme, paint, persistTheme, THEMES, type ThemeId } from "./themes";
import { TreeCanvas, type CanvasHandle } from "./components/TreeCanvas";
import { SidePanel, type PanelState } from "./components/Panels";
import { Header, Legend, Timebar, ZoomControls } from "./components/Chrome";

export function App({ taxonomy, initialNodes }: { taxonomy: Taxonomy; initialNodes: TechNode[] }) {
  const [nodes, setNodes] = useState(initialNodes);
  const [lang, setLang] = useState<Lang>(initialLang);
  const [theme, setTheme] = useState<ThemeId>(initialTheme);
  const [timeMode, setTimeMode] = useState<TimeMode>("focus");
  const [now, setNow] = useState(() => new Date());
  const [lod, setLod] = useState<Lod>(0);
  const [panel, setPanel] = useState<PanelState>(null);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showLinks, setShowLinks] = useState(false);
  const [cursorM, setCursorM] = useState<number | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hintGone, setHintGone] = useState(false);
  const canvas = useRef<CanvasHandle>(null);

  // Branch and zone colours come from data; each theme remaps them into its own palette.
  const themedTax = useMemo<Taxonomy>(() => ({
    ...taxonomy,
    zones: taxonomy.zones.map((z) => ({ ...z, color: paint(z.color, theme) })),
    branches: taxonomy.branches.map((b) => (b.color ? { ...b, color: paint(b.color, theme) } : b)),
  }), [taxonomy, theme]);
  const index = useMemo(() => indexTaxonomy(themedTax), [themedTax]);
  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const nowMinute = Math.floor(dateToM(now) * 30.5 * 1440); // changes once per minute
  const scale = useMemo(() => makeScale(timeMode, dateToM(now)), [timeMode, nowMinute]); // eslint-disable-line react-hooks/exhaustive-deps
  const layout = useMemo(() => computeLayout({ nodes, tax: themedTax, index, lod, lang, scale }), [nodes, themedTax, index, lod, lang, scale]);

  // Real clock: the "now" line moves every minute; the view stays anchored.
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      if (d.getMinutes() !== now.getMinutes()) { canvas.current?.holdAnchor(); setNow(d); }
    }, 30_000);
    return () => clearInterval(id);
  }, [now]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEMES[theme].swatch[0]);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = t(lang, "docTitle");
  }, [lang]);

  useEffect(() => {
    const onHash = () => { const h = location.hash.slice(1); if ((h === "en" || h === "zh") && h !== lang) { canvas.current?.holdAnchor(); setLang(h); } };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, [lang]);

  useEffect(() => { const id = setTimeout(() => setHintGone(true), 7000); return () => clearTimeout(id); }, []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2400); return () => clearTimeout(id); }, [toast]);

  const select = useCallback((id: string) => {
    const n = nodesById.get(id);
    if (!n) return;
    // Make sure the node is drawn at the current level of detail; raise it if needed.
    const need = (isRecent(ageOf(n.date, scale.nowM)) || ageOf(n.date, scale.nowM) < 0 ? 0 : n.level - 1) as Lod;
    if (need > lod) setLod(need);
    setPanel({ type: "node", id });
    setFocusRequest({ id, nonce: Date.now() });
  }, [nodesById, lod, scale]);

  const review = useCallback((id: string, approve: boolean) => {
    const n = nodesById.get(id);
    if (!n) return;
    if (approve) {
      setNodes((all) => all.map((x) => (x.id === id ? { ...x, status: "verified", agent_reason: undefined } : x)));
      setToast(t(lang, "approved", { t: n.title[lang] }));
    } else {
      setNodes((all) => all.filter((x) => x.id !== id).map((x) => ({ ...x, parents: x.parents.filter((p) => p !== id) })));
      setToast(t(lang, "rejected", { t: n.title[lang] }));
      setPanel({ type: "queue" });
    }
  }, [nodesById, lang]);

  const switchLang = () => {
    const next: Lang = lang === "zh" ? "en" : "zh";
    canvas.current?.holdAnchor();
    setLang(next);
    persistLang(next);
  };

  const toggleTimeMode = () => {
    const next: TimeMode = timeMode === "focus" ? "linear" : "focus";
    canvas.current?.holdAnchor();
    setTimeMode(next);
    setToast(t(lang, next === "focus" ? "toastFocus" : "toastLinear"));
  };

  const toggleTag = (id: string) => {
    const next = activeTag === id ? null : id;
    setActiveTag(next);
    if (next) {
      if (lod === 0) canvas.current?.focusZone(taxonomy.zones[0].id);
      setToast(t(lang, "tagOn", { t: taxonomy.tags.find((x) => x.id === id)!.name[lang] }));
    }
  };

  const searchEnter = () => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = nodes.find((n) => (n.title.zh + n.title.en + n.summary.zh + n.summary.en).toLowerCase().includes(q));
    if (hit) select(hit.id);
  };

  const candidates = nodes.filter((n) => n.status === "candidate").length;

  return (
    <div className="app" onPointerDown={() => setHintGone(true)}>
      <Header lang={lang} query={query} timeMode={timeMode} showLinks={showLinks} candidates={candidates}
        theme={theme} onTheme={(id) => { setTheme(id); persistTheme(id); }}
        onQuery={setQuery} onSearchEnter={searchEnter} onLang={switchLang} onTimeMode={toggleTimeMode}
        onLinks={() => setShowLinks((x) => !x)} onFeed={() => setPanel({ type: "feed" })} onQueue={() => setPanel({ type: "queue" })} />
      <Legend lang={lang} tax={themedTax} activeTag={activeTag} onZone={(id) => canvas.current?.focusZone(id)} onTag={toggleTag} />
      <TreeCanvas ref={canvas} layout={layout} scale={scale} index={index} nodesById={nodesById} lang={lang} lod={lod}
        onLodChange={setLod} selectedId={panel?.type === "node" ? panel.id : null} focusRequest={focusRequest} onSelect={select}
        query={query} activeTag={activeTag} showLinks={showLinks} cursorM={cursorM} now={now} panelOpen={panel !== null}
        onZoneClick={(id) => canvas.current?.focusZone(id)} />
      <div className={`hint${hintGone ? " gone" : ""}`}>{t(lang, "hint")}</div>
      <ZoomControls lang={lang} lod={lod} onZoom={(f) => canvas.current?.zoomBy(f)} onFit={() => canvas.current?.fit()}
        onRoots={() => canvas.current?.toRoots()} onTop={() => canvas.current?.toTop()} />
      <Timebar lang={lang} nowM={scale.nowM} cursorM={cursorM} onCursor={setCursorM} />
      <SidePanel panel={panel} onClose={() => setPanel(null)} lang={lang} theme={theme} tax={themedTax} index={index} nodes={nodes}
        nodesById={nodesById} scale={scale} now={now} onSelect={select} onReview={review} />
      <div className={`toast${toast ? " show" : ""}`} role="status">{toast}</div>
    </div>
  );
}
