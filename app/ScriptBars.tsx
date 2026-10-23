import { inSync, type PairState, type Version } from "../src/core/sync.ts";
import { STRETCHES, type Stretch } from "./claude.ts";

export const VERSION_NAMES: Record<Version, string> = { draft: "Draft", play: "Play", renpy: "Code", mv: "MV" };

/** Above a sheet: edit it as a form or as text. */
export function SheetBar({ raw, setRaw }: { raw: boolean; setRaw: (raw: boolean) => void }) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Sheet">
      <span className="label">Edit as:</span>
      <button className={raw ? "" : "on"} onClick={() => setRaw(false)}>Form</button>
      <button className={raw ? "on" : ""} onClick={() => setRaw(true)}>Text</button>
    </div>
  );
}

/** Above a script: the three versions, and what each one can insert or ask Claude for. */
export function LayerBar({ versions, layer, setLayer, behind, busy, open, onInsert, onTogether, onUnfold, onOpinion, children }: {
  versions: Version[]; layer: Version; setLayer: (l: Version) => void; behind: (l: Version) => boolean; busy: boolean;
  /** Draft: Fast and Medium passages and requests still to unfold. */
  open: number;
  onInsert: (kind: "draft" | "renpy" | "mv") => void; onTogether: (s: Stretch) => void; onUnfold: () => void; onOpinion: () => void; children?: React.ReactNode;
}) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Layers">
      <div className="layer-tabs" role="tablist" aria-label="Layer">
        {versions.map((l) => (
          <button key={l} role="tab" aria-selected={layer === l} className={layer === l ? "on" : ""} onClick={() => setLayer(l)} data-testid={`layer-${l}`}>
            {VERSION_NAMES[l]}
            {behind(l) && <i className="sync-dot" title="Out of sync" />}
          </button>
        ))}
      </div>
      {layer === "play" && (
        <select className="insert-menu" value="" aria-label="Insert" onChange={(e) => { const k = e.target.value as "draft" | "renpy" | "mv"; e.target.value = ""; if (k) onInsert(k); }}>
          <option value="">+ Insert</option>
          <option value="draft">Prose passage</option>
          <option value="renpy">Ren'Py code block</option>
          <option value="mv">MV code block</option>
        </select>
      )}
      {(layer === "draft" || layer === "play") && (
        <div className="draft-tools">
          <button className="claude-go opinion-btn" disabled={busy} data-testid="opinion"
            title="Claude's honest opinion on a part of your script: what works, what doesn't yet, and how to fix it. Your text doesn't change."
            onClick={onOpinion}>✦ Opinion</button>
          {layer === "draft" && <>
          <select className="insert-menu together-menu" value="" aria-label="Write together" disabled={busy} data-testid="together-menu"
            onChange={(e) => { const k = e.target.value as Stretch; e.target.value = ""; if (k) onTogether(k); }}>
            <option value="">✦ Write together</option>
            {(Object.keys(STRETCHES) as Stretch[]).map((k) => <option key={k} value={k}>Next {STRETCHES[k].label.toLowerCase()} ({STRETCHES[k].short})</option>)}
          </select>
          <button className="claude-go unfold" disabled={busy} data-testid="unfold"
            title="Claude writes out your keywords and sketches in your style, keeps what you finished, and carries out your requests. You review it first."
            onClick={onUnfold}>✦ Unfold{open > 0 && <i className="unfold-count">{open}</i>}</button>
          </>}
        </div>
      )}
      {children}
    </div>
  );
}

/** Says which versions are out of step with this one, and offers ✦ Update. */
export function SyncBar({ layer, states, busy, onMarkInStep, onSync }: {
  layer: Version; states: Array<{ n: Version; s: PairState }>; busy: boolean; onMarkInStep: () => void; onSync: (from: Version, to: Version) => void;
}) {
  const off = states.filter(({ s }) => !s.missing && !inSync(s));
  if (!off.length) return null;
  const names = (f: (s: PairState) => boolean) => off.filter(({ s }) => f(s)).map(({ n }) => VERSION_NAMES[n]);
  const both = names((s) => s.here && s.there), newer = names((s) => s.there && !s.here), behindHere = names((s) => s.here && !s.there);
  const text = [
    both.length ? `${both.join(" and ")} and this ${VERSION_NAMES[layer]} were both edited.` : "",
    newer.length ? `${newer.join(" and ")} ${newer.length > 1 ? "have" : "has"} newer changes.` : "",
    behindHere.length ? `${behindHere.join(" and ")} ${behindHere.length > 1 ? "don't" : "doesn't"} have your changes yet.` : "",
  ].filter(Boolean).join(" ");
  return (
    <div className="sync-bar" role="status" data-testid="sync-bar">
      <i className="sync-dot" />
      <span>{text}</span>
      <button className="ghost mark-in-step" title="Both versions already say the same thing: stop flagging them" onClick={onMarkInStep}>Mark as in step</button>
      {off.map(({ n, s }) => s.there ? (
        <button key={n} className="claude-go" disabled={busy} data-testid={`sync-${n}`} onClick={() => onSync(n, layer)}>✦ Update from {VERSION_NAMES[n]}</button>
      ) : (
        <button key={n} className="claude-go" disabled={busy} data-testid={`sync-${n}`} onClick={() => onSync(layer, n)}>✦ Update {VERSION_NAMES[n]}</button>
      ))}
    </div>
  );
}
