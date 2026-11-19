// Focus UI: a header button with a popover of branch chips (quick, always available),
// and a lens picker shown on the first visit (a few curated starting points).
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Lang, Lens, Taxonomy, TechNode } from "../types";
import { ALL, focusTest, fromLens, isAll, lensOf, type Focus, type FocusMode } from "../lib/focus";
import type { TaxIndex } from "../lib/layout";
import { t } from "../i18n";

interface Common { lang: Lang; tax: Taxonomy; index: TaxIndex; nodes: TechNode[] }

const countIn = (f: Focus, tax: Taxonomy, nodes: TechNode[]) => { const test = focusTest(f, tax); return nodes.filter(test).length; };

function ModeSwitch({ lang, mode, onMode }: { lang: Lang; mode: FocusMode; onMode(m: FocusMode): void }) {
  return (
    <div className="seg" role="radiogroup" aria-label={t(lang, "others")}>
      {(["dim", "hide"] as const).map((m) => (
        <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => onMode(m)}>{t(lang, m)}</button>
      ))}
    </div>
  );
}

/** Close a popover on outside pointerdown or Escape. */
function useDismiss(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    addEventListener("pointerdown", onDown);
    addEventListener("keydown", onKey);
    return () => { removeEventListener("pointerdown", onDown); removeEventListener("keydown", onKey); };
  }, [open, ref, close]);
}

// ---------------------------------------------------------------- header button + popover

export function FocusMenu(p: Common & { focus: Focus; onFocus(f: Focus): void; onLenses(): void; open: boolean; onOpen(open: boolean): void }) {
  const { lang, tax, index, nodes, focus } = p;
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(p.open, ref, () => p.onOpen(false));
  const lenses = tax.lenses ?? [];
  const lens = lensOf(focus, lenses);
  const tops = tax.branches.filter((b) => !b.parent);
  const total = useMemo(() => countIn(focus, tax, nodes), [focus, tax, nodes]);

  const toggle = (kind: "branches" | "tags", id: string) => {
    const cur = focus[kind];
    p.onFocus({ ...focus, [kind]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  // Button label: the lens name if it matches one, otherwise the first two picks.
  const picked = [
    ...focus.branches.map((id) => index.branch.get(id)?.name[lang] ?? id),
    ...focus.tags.map((id) => `#${tax.tags.find((x) => x.id === id)?.name[lang] ?? id}`),
  ];
  const label = isAll(focus) ? t(lang, "focusAll")
    : lens ? lens.name[lang]
    : picked.slice(0, 2).join(" · ") + (picked.length > 2 ? ` +${picked.length - 2}` : "");
  const dots = focus.branches.slice(0, 4).map((id) => index.colorOfBranch(id));

  return (
    <div className="focuspicker" ref={ref}>
      <button className={`btn focusbtn${isAll(focus) ? "" : " on"}`} aria-haspopup="dialog" aria-expanded={p.open} onClick={() => p.onOpen(!p.open)}>
        {dots.length > 0 && <span className="dots">{dots.map((c, i) => <i key={i} style={{ background: c }} />)}</span>}
        <span className="k">{t(lang, "focus")}</span><span className="v">{label}</span><span className="caret">▾</span>
      </button>
      {p.open && (
        <div className="focusmenu" role="dialog" aria-label={t(lang, "focusTitle")}>
          <div className="fm-head">
            <b>{t(lang, "focusTitle")}</b>
            <button className="link" disabled={isAll(focus)} onClick={() => p.onFocus({ ...ALL, mode: focus.mode })}>{t(lang, "clear")}</button>
          </div>
          <div className="fm-lenses">
            <span className="fm-label">{t(lang, "quickLenses")}</span>
            {lenses.filter((l) => l.id !== "all").map((l) => (
              <button key={l.id} className={`pill${lens?.id === l.id ? " on" : ""}`} onClick={() => p.onFocus(fromLens(l, focus.mode))}>{l.name[lang]}</button>
            ))}
            <button className="link" onClick={p.onLenses}>{t(lang, "browseLenses")}</button>
          </div>
          <div className="fm-body">
            {tax.zones.map((z) => {
              const bs = tops.filter((b) => index.layer.get(b.layer)!.zone === z.id);
              return (
                <section key={z.id}>
                  <h4 style={{ color: z.color }}>{z.name[lang]}</h4>
                  {bs.map((b) => {
                    const on = focus.branches.includes(b.id), c = b.color!;
                    return (
                      <button key={b.id} className={`fchip${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle("branches", b.id)}
                        style={on ? { borderColor: c, background: `color-mix(in oklab, ${c} 16%, transparent)` } : undefined}>
                        <i style={{ background: c }} />{b.name[lang]}{on && <span className="tick">✓</span>}
                      </button>
                    );
                  })}
                </section>
              );
            })}
            <section>
              <h4>{t(lang, "crossCut")}</h4>
              {tax.tags.map((tag) => {
                const on = focus.tags.includes(tag.id);
                return (
                  <button key={tag.id} className={`fchip tagchip${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle("tags", tag.id)}>
                    #{tag.name[lang]}{on && <span className="tick">✓</span>}
                  </button>
                );
              })}
            </section>
          </div>
          <div className="fm-foot">
            <span>{isAll(focus) ? t(lang, "focusAllCount", { m: total })
              : t(lang, "focusCount", { n: focus.branches.length + focus.tags.length, m: total })}</span>
            <span className="fm-mode"><span className="fm-label">{t(lang, "others")}</span>
              <ModeSwitch lang={lang} mode={focus.mode} onMode={(m) => p.onFocus({ ...focus, mode: m })} /></span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- lens picker (first visit)

/** Ten thin bars, one per layer (top = applications): lit where the lens has nodes. */
function MiniStack({ tax, index, nodes, lens }: Omit<Common, "lang"> & { lens: Lens }) {
  const lit = useMemo(() => {
    const test = focusTest(fromLens(lens, "dim"), tax);
    return new Set(nodes.filter(test).map((n) => index.branch.get(n.branch)!.layer));
  }, [tax, index, nodes, lens]);
  return (
    <span className="ministack" aria-hidden>
      {tax.layers.map((l) => <i key={l.id} style={lit.has(l.id) ? { background: index.zone.get(l.zone)!.color } : undefined} />)}
    </span>
  );
}

export function LensPicker(p: Common & { focus: Focus; onApply(f: Focus): void; onSkip(): void; onCustom(f: Focus): void }) {
  const { lang, tax, nodes } = p;
  const lenses = tax.lenses ?? [];
  const [pick, setPick] = useState<string>(() => lensOf(p.focus, lenses)?.id ?? lenses[1]?.id ?? "all");
  const [mode, setMode] = useState<FocusMode>(p.focus.mode);
  const chosen = fromLens(lenses.find((l) => l.id === pick) ?? lenses[0], mode);
  const n = countIn(chosen, tax, nodes);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") p.onSkip(); };
    addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLButtonElement>(".lens.on")?.focus();
    return () => removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="lensback" onPointerDown={(e) => { if (e.target === e.currentTarget) p.onSkip(); }}>
      <div className="lenspicker" role="dialog" aria-modal="true" aria-labelledby="lens-title" ref={ref}>
        <button className="close" onClick={p.onSkip} aria-label={t(lang, "close")}>✕</button>
        <h2 id="lens-title">{t(lang, "lensTitle")}</h2>
        <p className="sub">{t(lang, "lensDesc")}</p>
        <div className="lensgrid" role="radiogroup">
          {lenses.map((l) => (
            <button key={l.id} role="radio" aria-checked={pick === l.id} className={`lens${pick === l.id ? " on" : ""}`}
              onClick={() => setPick(l.id)} onDoubleClick={() => p.onApply(fromLens(l, mode))}>
              <MiniStack tax={tax} index={p.index} nodes={nodes} lens={l} />
              <span className="txt">
                <b>{l.name[lang]}</b>
                <small>{l.description[lang]}</small>
                <em>{t(lang, "nodes", { n: countIn(fromLens(l, mode), tax, nodes) })}</em>
              </span>
              {pick === l.id && <span className="check" aria-hidden>✓</span>}
            </button>
          ))}
        </div>
        <div className="lensfoot">
          <div className="left">
            <span className="fm-label">{t(lang, "others")}</span>
            <ModeSwitch lang={lang} mode={mode} onMode={setMode} />
            <button className="btn ghost" onClick={() => p.onCustom(chosen)}>{t(lang, "customFocus")}</button>
          </div>
          <div className="right">
            <button className="btn" onClick={p.onSkip}>{t(lang, "skip")}</button>
            <button className="btn primary" onClick={() => p.onApply(chosen)}>{t(lang, "viewN", { n })}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
