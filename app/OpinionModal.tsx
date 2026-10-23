import type { Opinion } from "./claude.ts";
import type { OpinionScope } from "../src/core/opinion.ts";

export type OpinionState = {
  scope: OpinionScope;
  ask: string;
  /** Claude is reading. */
  busy?: boolean;
  result?: Opinion;
  /** What it read, to say so above the answer ("This scene: The stairs"). */
  label?: string;
};

const SCOPES: { k: OpinionScope; label: string; hint: string }[] = [
  { k: "selection", label: "Selected text", hint: "What you highlighted" },
  { k: "scene", label: "This scene", hint: "The ## scene at the cursor" },
  { k: "chapter", label: "This chapter", hint: "The # chapter at the cursor" },
  { k: "script", label: "Whole script", hint: "The whole file" },
];

/** ✦ Opinion: pick what Claude reads, then its honest read with strengths, weaknesses and fixes. */
export function OpinionModal({ value, hasSelection, onChange, onClose, onGo, onJump }: {
  value: OpinionState; hasSelection: boolean;
  onChange: (o: OpinionState) => void; onClose: () => void; onGo: () => void;
  /** Go to a quote in the text; false when it isn't found. */
  onJump: (quote: string) => boolean;
}) {
  const r = value.result;
  const Quote = ({ q }: { q: string }) =>
    q ? <button className="link opinion-quote" title="Show it in the text" onClick={() => onJump(q) && onClose()}>“{q}”</button> : null;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal opinion" role="dialog" aria-label="Opinion" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>✦ Opinion</h2>
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {!r ? (
          <>
            <p className="muted">Claude reads the part you choose, with the rest of the script and your sheets as background, and tells you what works, what doesn't yet, and how to fix it. Your text doesn't change.</p>
            <h3>What to read</h3>
            <div className="seg opinion-scope" role="radiogroup" aria-label="What to read">
              {SCOPES.map((s) => (
                <button key={s.k} role="radio" aria-checked={value.scope === s.k} className={value.scope === s.k ? "on" : ""} title={s.hint}
                  disabled={s.k === "selection" && !hasSelection} data-testid={`opinion-${s.k}`} onClick={() => onChange({ ...value, scope: s.k })}>
                  {s.label}
                </button>
              ))}
            </div>
            <label className="together-dir">
              <span>Anything in particular? <span className="muted">Optional</span></span>
              <textarea rows={3} value={value.ask} placeholder="Is the pacing too slow? Does Miriam sound like herself?" onChange={(e) => onChange({ ...value, ask: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button onClick={onClose}>Cancel</button>
              <button className="primary" data-testid="opinion-go" disabled={value.busy} onClick={onGo}>{value.busy ? "Reading…" : "✦ Ask Claude"}</button>
            </div>
          </>
        ) : (
          <div className="opinion-result" data-testid="opinion-result">
            {value.label && <p className="muted opinion-on">On {value.label}{value.ask.trim() ? ` · “${value.ask.trim()}”` : ""}</p>}
            {r.summary && <p className="opinion-summary">{r.summary}</p>}
            {r.strengths.length > 0 && (
              <section className="opinion-list good">
                <h3>What works</h3>
                <ul>{r.strengths.map((s, i) => <li key={i}>{s.point} <Quote q={s.quote} /></li>)}</ul>
              </section>
            )}
            {r.weaknesses.length > 0 && (
              <section className="opinion-list weak">
                <h3>Not there yet</h3>
                <ul>{r.weaknesses.map((s, i) => <li key={i}>{s.point} <Quote q={s.quote} /></li>)}</ul>
              </section>
            )}
            {r.fixes.length > 0 && (
              <section className="opinion-list fixes">
                <h3>Possible fixes</h3>
                <ul>
                  {r.fixes.map((f, i) => (
                    <li key={i}>
                      <Quote q={f.quote} />
                      <div className="opinion-fix">{f.fix}</div>
                      {f.why && <div className="muted">{f.why}</div>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="modal-actions">
              <button onClick={() => onChange({ ...value, result: undefined })}>Ask again</button>
              <button onClick={() => void navigator.clipboard?.writeText(opinionText(value)).catch(() => {})}>Copy</button>
              <button className="primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The opinion as plain text, to keep or share. */
function opinionText(o: OpinionState): string {
  const r = o.result!;
  const q = (s: string) => (s ? ` ("${s}")` : "");
  return [
    `Opinion on ${o.label ?? "the script"}`,
    r.summary,
    r.strengths.length ? `What works:\n${r.strengths.map((s) => `- ${s.point}${q(s.quote)}`).join("\n")}` : "",
    r.weaknesses.length ? `Not there yet:\n${r.weaknesses.map((s) => `- ${s.point}${q(s.quote)}`).join("\n")}` : "",
    r.fixes.length ? `Possible fixes:\n${r.fixes.map((f) => `- ${f.quote ? `"${f.quote}": ` : ""}${f.fix}${f.why ? ` (${f.why})` : ""}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}
