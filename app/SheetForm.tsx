// A sheet as a form: one card per section, plus the Usage Intent works out
// from the scripts. Edits write the `.sheet` text back.

import { useEffect, useState } from "react";
import { Icon } from "./Icon.tsx";
import { joinPrompts, parseSheet, serializeSheet, SHEET_KINDS, splitPrompts, type FieldSpec, type Sheet, type Usage } from "../src/core/sheets.ts";

interface Props {
  text: string;
  usage: Usage | null;
  onChange: (text: string) => void;
  onJump: (file: string, line: number) => void;
  onClose?: () => void;
  /** Claude drafts a new prompt from the sheet; throws with a message the form shows. */
  onDraftPrompt?: (kind: "image" | "song", sheet: Sheet, earlier: string[]) => Promise<string>;
  /** A new name, given when the writer leaves the name field: renames the sheet everywhere. */
  onRename?: (name: string) => boolean;
}

export function isStub(s: Sheet): boolean {
  return Object.values(s.fields).every((v) => !v.trim());
}

export function SheetForm({ text, usage, onChange, onJump, onClose, onDraftPrompt, onRename }: Props) {
  // The form keeps its own copy so a half-typed value (a trailing new line) survives
  // the round trip through text; outside edits to the text still come in.
  const [sheet, setSheet] = useState(() => parseSheet(text));
  useEffect(() => {
    if (!sheet || serializeSheet(sheet) !== text) setSheet(parseSheet(text));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // The name is typed freely and only applied when the field is left, so a rename happens once.
  const [name, setName] = useState(sheet?.name ?? "");
  useEffect(() => setName(sheet?.name ?? ""), [sheet?.name]);
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
        <input className="sheet-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" title="Renaming updates every script and sheet that mentions it"
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setName(sheet.name); e.currentTarget.blur(); } }}
          onBlur={() => { const n = name.trim(); if (!n) setName(sheet.name); else if (n !== sheet.name) { if (!onRename) set({ name: n }); else if (!onRename(n)) setName(sheet.name); } }} />
        {isStub(sheet) && <span className="badge">Written about, not designed yet</span>}
        {onClose && <button className="icon" onClick={onClose} aria-label="Close sheet">✕</button>}
      </div>

      {usage && (
        <section className="sheet-card usage">
          <h4><span className="sec-icon"><Icon name="usage" /></span>Usage</h4>
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
                <span className="sec-icon"><Icon name={sec.id} /></span>
                {sec.label}
                <span className="caret">{isOpen ? "▾" : "▸"}</span>
              </button>
            </h4>
            {isOpen && (
              <div className="sheet-fields">
                {sec.fields.map((f) => (
                  f.prompts ? (
                    <div key={f.key} className="long">
                      <PromptList kind={f.prompts} value={sheet.fields[f.key] ?? ""} onChange={(v) => setField(f.key, v)}
                        draft={onDraftPrompt && (() => onDraftPrompt(f.prompts!, sheet, splitPrompts(sheet.fields[f.key])))} />
                    </div>
                  ) : (
                    <label key={f.key} className={f.long ? "long" : ""}>
                      <span>{f.label}</span>
                      <FieldInput spec={f} value={sheet.fields[f.key] ?? ""} onChange={(v) => setField(f.key, v)} />
                    </label>
                  )
                ))}
              </div>
            )}
          </section>
        );
      })}

      <section className="sheet-card">
        <h4><span className="sec-icon"><Icon name="notes" /></span>Notes</h4>
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

/** Image or song prompts: write your own or let Claude draft one from the sheet; copy with one tap. */
function PromptList({ kind, value, onChange, draft }: { kind: "image" | "song"; value: string; onChange: (v: string) => void; draft?: () => Promise<string> }) {
  const list = splitPrompts(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const set = (i: number, v: string) => onChange(joinPrompts(list.map((p, k) => (k === i ? v : p))));
  const copy = async (i: number) => {
    try {
      await navigator.clipboard.writeText(list[i]);
      setCopied(i);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Copy isn't allowed here; select the text instead.");
    }
  };
  return (
    <div className="prompt-list">
      {list.map((p, i) => (
        <div key={i} className="prompt-card">
          <textarea value={p} rows={3} onChange={(e) => set(i, e.target.value)} aria-label={`${kind} prompt ${i + 1}`} />
          <div className="prompt-actions">
            <button onClick={() => void copy(i)}><Icon name="copy" size={14} />{copied === i ? "Copied" : "Copy"}</button>
            <button className="quiet" onClick={() => onChange(joinPrompts(list.filter((_, k) => k !== i)))}>Remove</button>
          </div>
        </div>
      ))}
      <div className="prompt-add">
        {draft && (
          <button className="claude-go" disabled={busy} onClick={async () => {
            setBusy(true);
            setError("");
            try {
              onChange(joinPrompts([...list, await draft()]));
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}>{busy ? "Claude is writing…" : `✦ Draft ${kind === "image" ? "an image" : "a song"} prompt`}</button>
        )}
        <button className="side-btn" onClick={() => onChange(`${value ? `${value}\n---\n` : ""}${kind === "image" ? "Describe the picture" : "Describe the music"}`)}>+ Write my own</button>
      </div>
      {error && <p className="warn-text">{error}</p>}
    </div>
  );
}
