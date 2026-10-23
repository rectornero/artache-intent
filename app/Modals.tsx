import { lineDiff } from "../src/core/diff.ts";
import { STRETCHES, type Stretch } from "./claude.ts";

export type PopItem = { label: string; run: () => void; danger?: boolean };
export type Pop = { x: number; y: number; items: PopItem[] };

/** A small menu under the button that opened it. */
export function PopMenu({ menu, onClose }: { menu: Pop; onClose: () => void }) {
  return (
    <div className="ctx-back" onClick={onClose}>
      <div className="ctx-menu" role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 250), top: Math.min(menu.y, window.innerHeight - 40 * menu.items.length - 20) }} onClick={(e) => e.stopPropagation()}>
        {menu.items.map((it) => (
          <button key={it.label} role="menuitem" className={it.danger ? "danger" : ""} onClick={() => { onClose(); it.run(); }}>{it.label}</button>
        ))}
      </div>
    </div>
  );
}

/** Claude's proposed text as a line diff; nothing changes until the writer accepts. */
export function DiffReview({ label, title, note, before, after, scrollToChange, footer, onClose, onRetry, onAccept, acceptId }: {
  label: string; title: string; note: string; before: string; after: string; scrollToChange?: boolean; footer?: React.ReactNode;
  onClose: () => void; onRetry?: () => void; onAccept: () => void; acceptId: string;
}) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="muted">{note}</p>
        <div className="diff review-diff" ref={scrollToChange ? (el) => el?.querySelector(".diff-del, .diff-add")?.scrollIntoView({ block: "center" }) : undefined}>
          {lineDiff(before, after).map((l, k) => (
            <div key={k} className={`diff-${l.op}`}>{l.op === "add" ? "+ " : l.op === "del" ? "− " : "  "}{l.text || " "}</div>
          ))}
        </div>
        {footer}
        <div className="modal-actions">
          <button onClick={onClose}>Not now</button>
          {onRetry && <button onClick={onRetry}>Try again</button>}
          <button className="primary" data-testid={acceptId} onClick={onAccept}>Accept</button>
        </div>
      </div>
    </div>
  );
}

export type Together = { stretch: Stretch; direction: string };

/** ✦ Write together: how much Claude writes next, and where the story should go. */
export function TogetherModal({ value, onChange, onClose, onGo }: { value: Together; onChange: (t: Together) => void; onClose: () => void; onGo: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal together" role="dialog" aria-label="Write together" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>✦ Write together</h2>
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="muted">Claude reads your Draft and the sheets, and carries on from where it ends, in your style. You review it before it's added.</p>
        <div className="seg" role="radiogroup" aria-label="How much">
          {(Object.keys(STRETCHES) as Stretch[]).map((k) => (
            <button key={k} role="radio" aria-checked={value.stretch === k} className={value.stretch === k ? "on" : ""} onClick={() => onChange({ ...value, stretch: k })}>
              {STRETCHES[k].label}<span className="muted"> · {STRETCHES[k].short}</span>
            </button>
          ))}
        </div>
        <label className="together-dir">
          <span>Where should it go? <span className="muted">Optional</span></span>
          <textarea rows={3} value={value.direction} placeholder="Limo lies about the coat; Tony doesn't notice yet." onChange={(e) => onChange({ ...value, direction: e.target.value })} />
        </label>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" data-testid="together-go" onClick={onGo}>✦ Write</button>
        </div>
      </div>
    </div>
  );
}
