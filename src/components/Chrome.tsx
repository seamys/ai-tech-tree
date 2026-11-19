// Header, legend, zoom controls and the playback bar.
import { useEffect, useRef, useState } from "react";
import type { Lang, Lod, TimeMode, Taxonomy } from "../types";
import { formatYM } from "../lib/time";
import { t } from "../i18n";

export function Header(p: {
  lang: Lang; query: string; timeMode: TimeMode; showLinks: boolean; candidates: number;
  onQuery(q: string): void; onSearchEnter(): void; onLang(): void; onTimeMode(): void; onLinks(): void; onFeed(): void; onQueue(): void;
}) {
  const { lang } = p;
  return (
    <header className="top">
      <h1><span className="long">{t(lang, "title1")}</span>{t(lang, "title2")}<small>{t(lang, "version")}</small></h1>
      <input className="search" type="search" value={p.query} placeholder={t(lang, "search")}
        onChange={(e) => p.onQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && p.onSearchEnter()} />
      <div className="spacer" />
      <button className="btn lang" onClick={p.onLang} title={t(lang, "langSwitchTitle")}>{t(lang, "langSwitch")}</button>
      <button className="btn hide-narrow" onClick={p.onTimeMode}>
        {t(lang, "timeLabel")}{p.timeMode === "focus" ? t(lang, "timeFocus") : t(lang, "timeLinear")}
      </button>
      <button className={`btn hide-narrow${p.showLinks ? " on" : ""}`} onClick={p.onLinks}>{t(lang, "links")}</button>
      <button className="btn" onClick={p.onFeed}><span className="wide-only">{t(lang, "feed")}</span><span className="narrow-only">{t(lang, "feedShort")}</span></button>
      <button className="btn warn" onClick={p.onQueue}>{t(lang, "review")} <b>{p.candidates}</b></button>
    </header>
  );
}

export function Legend(p: { lang: Lang; tax: Taxonomy; activeTag: string | null; onZone(id: string): void; onTag(id: string): void }) {
  const { lang, tax } = p;
  return (
    <nav className="legend">
      <span className="divider">{t(lang, "jumpTo")}</span>
      {tax.zones.map((z) => (
        <button key={z.id} className="chip" onClick={() => p.onZone(z.id)}><i style={{ background: z.color }} />{z.name[lang]}</button>
      ))}
      <span className="divider">{t(lang, "crossTags")}</span>
      {tax.tags.map((tag) => (
        <button key={tag.id} className={`chip${p.activeTag === tag.id ? " tagon" : ""}`} onClick={() => p.onTag(tag.id)}>#{tag.name[lang]}</button>
      ))}
      <span className="divider">{t(lang, "legendKinds")}　<span className="new">{t(lang, "legendNew")}</span></span>
    </nav>
  );
}

export function ZoomControls(p: { lang: Lang; lod: Lod; onZoom(f: number): void; onFit(): void; onRoots(): void; onTop(): void }) {
  const { lang, lod } = p;
  return (
    <div className="zoomctl">
      <button className="btn" onClick={() => p.onZoom(1.25)} aria-label="zoom in">＋</button>
      <button className="btn" onClick={() => p.onZoom(0.8)} aria-label="zoom out">－</button>
      <button className="btn" onClick={p.onFit}>{t(lang, "fit")}</button>
      <button className="btn" onClick={p.onRoots}>{t(lang, "roots")}</button>
      <button className="btn" onClick={p.onTop}>{t(lang, "canopy")}</button>
      <span className="lodbadge">{t(lang, "lod")} <b>{lod + 1}/3</b> · {t(lang, (["lod0", "lod1", "lod2"] as const)[lod])}</span>
    </div>
  );
}

const PLAY_START_M = 4 * 12; // replay starts in 2010
const SLIDER_MAX = 1000;

/** Replay slider. Drives a time cursor; null means "now" (show everything). */
export function Timebar(p: { lang: Lang; nowM: number; cursorM: number | null; onCursor(m: number | null): void }) {
  const [value, setValue] = useState(SLIDER_MAX);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  const toM = (v: number) => (v >= SLIDER_MAX ? null : PLAY_START_M + (p.nowM - PLAY_START_M) * v / SLIDER_MAX);

  useEffect(() => {
    if (!playing) return;
    let v = value >= SLIDER_MAX ? 0 : value, last = performance.now();
    const step = (ts: number) => {
      v = Math.min(SLIDER_MAX, v + (ts - last) / 14);
      last = ts;
      setValue(v);
      p.onCursor(toM(v));
      if (v < SLIDER_MAX) raf.current = requestAnimationFrame(step); else setPlaying(false);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="timebar">
      <button className="btn" onClick={() => setPlaying((x) => !x)}>{playing ? t(p.lang, "pause") : t(p.lang, "replay")}</button>
      <input type="range" min={0} max={SLIDER_MAX} value={value} aria-label="timeline"
        onChange={(e) => { setPlaying(false); const v = Number(e.target.value); setValue(v); p.onCursor(toM(v)); }} />
      <b>{p.cursorM === null ? t(p.lang, "now") : formatYM(p.cursorM)}</b>
    </div>
  );
}
