// A sheet as a form: one card per section, plus the Usage Intent works out
// from the scripts. Edits write the `.sheet` text back.

import { useEffect, useState } from "react";
import { parseSheet, serializeSheet, SHEET_KINDS, type FieldSpec, type Sheet, type Usage } from "../src/core/sheets.ts";

interface Props {
  text: string;
  usage: Usage | null;
  onChange: (text: string) => void;
  onJump: (file: string, line: number) => void;
  onClose?: () => void;
}

export function isStub(s: Sheet): boolean {
  return Object.values(s.fields).every((v) => !v.trim());
}

export function SheetForm({ text, usage, onChange, onJump, onClose }: Props) {
  // The form keeps its own copy so a half-typed value (a trailing new line) survives
  // the round trip through text; outside edits to the text still come in.
  const [sheet, setSheet] = useState(() => parseSheet(text));
  useEffect(() => {
    if (!sheet || serializeSheet(sheet) !== text) setSheet(parseSheet(text));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!sheet) return <div className="error-box">This sheet needs a first line like <code>@character Name</code>.</div>;
  const spec = SHEET_KINDS[sheet.kind];
  const set = (patch: Partial<Sheet>) => {
    const next = { ...sheet, ...patch };
    setSheet(next);
    onChange(serializeSheet(next));
  };
  const setField = (k: string, v: string) => set({ fields: { ...sheet.fields, [k]: v } });

  return (
    <div className={`sheet k-${sheet.kind}`} data-testid="sheet">
      <div className="sheet-head">
        <span className={`sheet-kind k-${sheet.kind}`}>{spec.label}</span>
        <input className="sheet-name" value={sheet.name} onChange={(e) => set({ name: e.target.value })} aria-label="Name" />
        {isStub(sheet) && <span className="badge">Written about, not designed yet</span>}
        {onClose && <button className="icon" onClick={onClose} aria-label="Close sheet">✕</button>}
      </div>

      {usage && (
        <section className="sheet-card usage">
          <h4>Usage</h4>
          {usage.scenes.length ? (
            <div className="usage-scenes">
              {usage.scenes.map((s, k) => (
                <button key={k} className="chip" onClick={() => onJump(s.file, s.line)}>{s.title}</button>
              ))}
            </div>
          ) : (
            <p className="muted">Not in any scene yet.</p>
          )}
          {sheet.kind === "character" && usage.lines > 0 && <p className="muted">{usage.lines} spoken line{usage.lines > 1 ? "s" : ""}</p>}
          {usage.missing.length > 0 && <p className="warn-text">Asked for but not on the sheet: {usage.missing.join(", ")}</p>}
          {usage.unused.length > 0 && <p className="muted">Never used yet: {usage.unused.join(", ")}</p>}
        </section>
      )}

      {spec.sections.map((sec, i) => {
        const filled = sec.fields.some((f) => sheet.fields[f.key]?.trim());
        const isOpen = open[sec.id] ?? (i < 2 || filled);
        return (
          <section key={sec.id} className={`sheet-card ${isOpen ? "" : "closed"}`}>
            <h4>
              <button className="sec-toggle" onClick={() => setOpen({ ...open, [sec.id]: !isOpen })} aria-expanded={isOpen}>
                <span className="caret">{isOpen ? "▾" : "▸"}</span>
                {sec.label}
              </button>
            </h4>
            {isOpen && (
              <div className="sheet-fields">
                {sec.fields.map((f) => (
                  <label key={f.key} className={f.long ? "long" : ""}>
                    <span>{f.label}</span>
                    <FieldInput spec={f} value={sheet.fields[f.key] ?? ""} onChange={(v) => setField(f.key, v)} />
                  </label>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <section className="sheet-card">
        <h4>Notes</h4>
        <textarea className="notes" value={sheet.notes.join("\n")} rows={3} placeholder="Anything else" onChange={(e) => set({ notes: e.target.value.split("\n") })} />
      </section>
    </div>
  );
}

const OWN = "\u0000own";

/** Text, long text, a colour, or a dropdown (that may also take the writer's own value). */
function FieldInput({ spec, value, onChange }: { spec: FieldSpec; value: string; onChange: (v: string) => void }) {
  const [own, setOwn] = useState(false);
  if (spec.colour) {
    const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : "#888888";
    return (
      <span className="colour-field">
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} aria-label={spec.label} />
        <code>{value || "none"}</code>
        {value && <button className="icon" onClick={() => onChange("")} aria-label="Clear colour">✕</button>}
      </span>
    );
  }
  if (spec.choices) {
    const listed = !value || spec.choices.some((c) => c.toLowerCase() === value.toLowerCase());
    if (spec.open && (own || !listed)) {
      return (
        <span className="own-field">
          <input value={value} autoFocus={own} placeholder="Your own" onChange={(e) => onChange(e.target.value)} />
          <button className="icon" onClick={() => { setOwn(false); onChange(""); }} aria-label="Back to the list" title="Back to the list">▾</button>
        </span>
      );
    }
    const current = spec.choices.find((c) => c.toLowerCase() === value.toLowerCase()) ?? value;
    return (
      <select value={current} onChange={(e) => (e.target.value === OWN ? (setOwn(true), onChange("")) : onChange(e.target.value))}>
        <option value="">—</option>
        {!listed && <option value={value}>{value}</option>}
        {spec.choices.map((c) => <option key={c} value={c}>{c}</option>)}
        {spec.open && <option value={OWN}>Your own…</option>}
      </select>
    );
  }
  return spec.long ? (
    <textarea value={value} placeholder={spec.hint} rows={3} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <input value={value} placeholder={spec.hint} onChange={(e) => onChange(e.target.value)} />
  );
}
