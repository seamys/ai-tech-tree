// Right-hand side panel: node details, review queue and the "what's new" feed.
import type { Lang, TechNode, Taxonomy } from "../types";
import type { TaxIndex } from "../lib/layout";
import { ageOf, formatNow, type TimeScale } from "../lib/time";
import { loc, relativeTime, t } from "../i18n";

export type PanelState = { type: "node"; id: string } | { type: "queue" } | { type: "feed" } | null;

interface Common {
  lang: Lang;
  tax: Taxonomy;
  index: TaxIndex;
  nodes: TechNode[];
  nodesById: Map<string, TechNode>;
  scale: TimeScale;
  now: Date;
  onSelect(id: string): void;
  onReview(id: string, approve: boolean): void;
}

function branchLabel(id: string, index: TaxIndex, lang: Lang) {
  const b = index.branch.get(id)!;
  return b.parent ? `${b.layer} · ${index.branch.get(b.parent)!.name[lang]} › ${b.name[lang]}` : `${b.layer} · ${b.name[lang]}`;
}

function NodeChip({ n, index, lang, onSelect }: { n: TechNode; index: TaxIndex; lang: Lang; onSelect(id: string): void }) {
  return (
    <button className="chip" onClick={() => onSelect(n.id)}>
      <i style={{ background: index.colorOfBranch(n.branch) }} />{n.title[lang]}
    </button>
  );
}

function NodeDetail({ node: n, ...c }: Common & { node: TechNode }) {
  const { lang, tax, index, nodes, nodesById, scale, onSelect, onReview } = c;
  const color = index.colorOfBranch(n.branch);
  const children = nodes.filter((x) => x.parents.includes(n.id));
  const kind = n.kind === "constraint" ? ["kindConstraint", "#f6ad55"] as const
    : n.kind === "event" ? ["kindEvent", "#a0aec0"] as const
    : n.kind === "upcoming" ? ["kindUpcoming", "#ff9aa8"] as const : null;
  return (
    <>
      <div className="meta">
        <span className="tag" style={{ color, borderColor: `${color}55` }}>{branchLabel(n.branch, index, lang)}</span>
        <span>{n.date} · {relativeTime(ageOf(n.date, scale.nowM), lang)}</span>
        {kind && <span className="tag" style={{ color: kind[1], borderColor: `${kind[1]}55` }}>{t(lang, kind[0])}</span>}
        <span className="tag">{t(lang, "detailLevel")} {n.level}</span>
        {n.status === "candidate"
          ? <span className="tag cand">{t(lang, "candidate")} {n.confidence}</span>
          : <span className="tag ok">{t(lang, "verified")}</span>}
      </div>
      <h2>{n.title[lang]}</h2>
      <p>{n.summary[lang]}</p>
      {n.status === "candidate" && n.agent_reason && (
        <>
          <h3>{t(lang, "reasoning")}</h3>
          <p>{n.agent_reason[lang]}</p>
          <div className="rel">
            <button className="btn on" onClick={() => onReview(n.id, true)}>{t(lang, "approve")}</button>
            <button className="btn" onClick={() => onReview(n.id, false)}>{t(lang, "reject")}</button>
          </div>
        </>
      )}
      {!!n.tags?.length && (
        <>
          <h3>{t(lang, "crossTags")}</h3>
          <div className="rel">{n.tags.map((id) => <span key={id} className="tag">#{tax.tags.find((x) => x.id === id)!.name[lang]}</span>)}</div>
        </>
      )}
      <h3>{t(lang, "why")}</h3>
      <div className="rel">{n.criteria.map((id) => <span key={id} className="tag">{tax.criteria[id]?.[lang] ?? id}</span>)}</div>
      <h3>{t(lang, "source")}</h3>
      <p className="src">{loc(n.source, lang) || "—"}{n.url && <><br /><a href={n.url} target="_blank" rel="noopener noreferrer">{n.url}</a></>}</p>
      <h3>{t(lang, "parents")}</h3>
      <div className="rel">
        {n.parents.length ? n.parents.map((id) => <NodeChip key={id} n={nodesById.get(id)!} index={index} lang={lang} onSelect={onSelect} />)
          : <span className="tag">{t(lang, "root")}</span>}
      </div>
      <h3>{t(lang, "children")}</h3>
      <div className="rel">
        {children.length ? children.map((x) => <NodeChip key={x.id} n={x} index={index} lang={lang} onSelect={onSelect} />)
          : <span className="tag">{t(lang, "none")}</span>}
      </div>
      <h3>{t(lang, "nodeData")}</h3>
      <pre>{JSON.stringify(n, null, 2)}</pre>
    </>
  );
}

function Queue(c: Common) {
  const { lang, index, nodes, nodesById, onSelect, onReview } = c;
  const q = nodes.filter((n) => n.status === "candidate");
  return (
    <>
      <h2>{t(lang, "queueTitle")}</h2>
      <p>{t(lang, "queueDesc")}</p>
      {q.length === 0 && <p className="dim">{t(lang, "queueEmpty")}</p>}
      {q.map((n) => (
        <div key={n.id} className="qitem">
          <b>{n.title[lang]}</b> <span className="tag cand">{n.confidence}</span>
          <div className="why">
            {n.date} · {t(lang, "suggestedUnder")}「{branchLabel(n.branch, index, lang)}」← {n.parents.map((p) => nodesById.get(p)!.title[lang]).join(t(lang, "listSep"))}
            <br />{n.agent_reason?.[lang]}
          </div>
          <div className="row">
            <button className="btn on" onClick={() => onReview(n.id, true)}>{t(lang, "approve")}</button>
            <button className="btn" onClick={() => onReview(n.id, false)}>{t(lang, "reject")}</button>
            <button className="btn" onClick={() => onSelect(n.id)}>{t(lang, "showOnTree")}</button>
          </div>
        </div>
      ))}
    </>
  );
}

function Feed(c: Common) {
  const { lang, index, nodes, scale, now, onSelect } = c;
  const sorted = [...nodes].sort((a, b) => ageOf(a.date, scale.nowM) - ageOf(b.date, scale.nowM));
  const future = sorted.filter((n) => ageOf(n.date, scale.nowM) < 0).reverse();
  const past = sorted.filter((n) => ageOf(n.date, scale.nowM) >= 0).slice(0, 18);
  const row = (n: TechNode) => (
    <button key={n.id} className="feed" style={{ borderColor: index.colorOfBranch(n.branch) }} onClick={() => onSelect(n.id)}>
      <span className="t">{n.date} · {relativeTime(ageOf(n.date, scale.nowM), lang)} · {branchLabel(n.branch, index, lang)}</span>
      {n.title[lang]}
    </button>
  );
  return (
    <>
      <h2>{t(lang, "feedTitle")}</h2>
      <p>{t(lang, "feedDesc", { now: formatNow(now) })}</p>
      {future.length > 0 && <><h3>{t(lang, "comingUp")}</h3>{future.map(row)}</>}
      <h3>{t(lang, "recent")}</h3>
      {past.map(row)}
    </>
  );
}

export function SidePanel({ panel, onClose, ...c }: Common & { panel: PanelState; onClose(): void }) {
  const node = panel?.type === "node" ? c.nodesById.get(panel.id) : undefined;
  return (
    <aside className={`panel${panel ? " open" : ""}`} aria-hidden={!panel}>
      <button className="btn close" onClick={onClose} aria-label={t(c.lang, "close")}>✕</button>
      {node && <NodeDetail node={node} {...c} />}
      {panel?.type === "queue" && <Queue {...c} />}
      {panel?.type === "feed" && <Feed {...c} />}
    </aside>
  );
}
