// Syntax colours for Intent Script, plus the parser's diagnostics as squiggles.

import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { linter, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { tags as t } from "@lezer/highlight";
import { MapMode, RangeSetBuilder, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, gutter, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { LEVELS, passages, type Choice, type Level, type Passage } from "../src/core/levels.ts";
import type { Diagnostic } from "../src/core/ast.ts";

interface St {
  sol: boolean;
}

const intentStream = StreamLanguage.define<St>({
  startState: () => ({ sol: true }),
  token(stream, st) {
    if (stream.sol()) {
      stream.eatSpace();
      if (stream.match(/^\/\/.*/) || stream.match(/^~\s.*/)) return "comment";
      if (stream.match(/^#{1,2}\s.*/)) return "heading";
      if (stream.match(/^@\w+/)) return "keyword";
      if (stream.match(/^>>\s*[A-Z][A-Z ]*:?/)) return "keyword";
      if (stream.match(/^(IF|ELSE IF|ELSE|END)\b/) || stream.match(/^when:/)) return "controlKeyword";
      if (stream.match(/^[?>](?=\s)/)) return "controlKeyword";
      if (stream.match(/^[!+](?=\s)/)) return "operator";
      if (stream.match(/^TODO:?/)) return "invalid";
      if (stream.match(/^\([^)]*\)(?=\s)/)) return "typeName";
      if (stream.match(/^[^:\[\]()\s][^:\[\]()]{0,29}?(\s*\([^)]*\))?\s*:(?=\s)/)) return "typeName";
      if (stream.match(/^-(?=\s)/)) return "typeName";
    }
    st.sol = false;
    if (stream.match(/^\/\/.*/)) return "comment";
    if (stream.match(/^\[\[[^\]]*\]\]/)) return "link";
    if (stream.match(/^\[[^\]]*\]/)) return "meta";
    if (stream.match(/^\*[^*]+\*/)) return "emphasis";
    if (stream.match(/^~[^~]+~/)) return "emphasis";
    if (stream.match("|")) return "operator";
    if (stream.match(/^\w+:(?=\s)/) && /^\s*@/.test(stream.string)) return "propertyName";
    stream.next();
    return null;
  },
});

const style = HighlightStyle.define([
  { tag: t.comment, color: "var(--note)", fontStyle: "italic" },
  { tag: t.heading, color: "var(--text)", fontWeight: "700" },
  { tag: t.keyword, color: "var(--block)", fontWeight: "600" },
  { tag: t.controlKeyword, color: "var(--flow)", fontWeight: "600" },
  { tag: t.operator, color: "var(--flow)" },
  { tag: t.typeName, color: "var(--speaker)", fontWeight: "600" },
  { tag: t.meta, color: "var(--stage)" },
  { tag: t.link, color: "var(--accent)", textDecoration: "underline" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.propertyName, color: "var(--block)" },
  { tag: t.invalid, color: "var(--warning)", fontWeight: "700" },
]);

export function intentLanguage(): Extension {
  return [intentStream, syntaxHighlighting(style)];
}

export function intentLinter(get: () => Diagnostic[]): Extension {
  return linter(
    (view) => {
      const out: CmDiagnostic[] = [];
      for (const d of get()) {
        if (d.line < 1 || d.line > view.state.doc.lines) continue;
        const line = view.state.doc.line(d.line);
        out.push({ from: line.from, to: line.to, severity: d.level === "error" ? "error" : d.level === "warning" ? "warning" : "info", message: d.message });
      }
      return out;
    },
    { delay: 300 },
  );
}

/** A coloured margin stripe on every line of a ::: draft / renpy / mv block. */
function stripes(doc: { lines: number; line: (n: number) => { from: number; text: string } }): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  let kind: string | null = null;
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const t = line.text.trim();
    const open = t.match(/^:::\s*(draft|renpy|mv|was-draft)\s*$/);
    if (!kind && open) kind = open[1];
    if (kind) b.add(line.from, line.from, Decoration.line({ class: `cm-ilayer cm-ilayer-${kind}${open || t === ":::" ? " cm-ilayer-fence" : ""}` }));
    if (kind && t === ":::" ) kind = null;
  }
  return b.finish();
}

export function layerStripes(): Extension {
  return StateField.define<DecorationSet>({
    create: (s) => stripes(s.doc),
    update: (d, tr) => (tr.docChanged ? stripes(tr.state.doc) : d),
    provide: (f) => EditorView.decorations.from(f),
  });
}

/** A name in the text that belongs to a sheet; `stub` names have no sheet yet. */
export interface LinkTarget {
  name: string;
  kind: string;
  file: string;
  stub?: boolean;
}

export const refreshLinks = StateEffect.define<null>();

/** Highlights sheet names as you type. A click opens the sheet. */
export function sheetLinks(get: () => LinkTarget[], open: (t: LinkTarget) => void): Extension {
  const build = (view: EditorView): DecorationSet => {
    const targets = get();
    const b = new RangeSetBuilder<Decoration>();
    if (!targets.length) return b.finish();
    const byName = new Map(targets.map((t) => [t.name.toLowerCase(), t]));
    const esc = [...byName.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`(?<![\\w'’])(${esc.join("|")})(?![\\w'’])`, "gi");
    for (const { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to);
      for (const m of text.matchAll(re)) {
        const t = byName.get(m[1].toLowerCase())!;
        const start = from + m.index!;
        b.add(start, start + m[1].length, Decoration.mark({
          class: `cm-sheet-link cm-sheet-${t.stub ? "stub" : t.kind}`,
          attributes: { "data-sheet": t.name.toLowerCase(), title: t.stub ? `${t.name}: no sheet yet. Click to make one` : `${t.name} (${t.kind}). Click to open the sheet` },
        }));
      }
    }
    return b.finish();
  };
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.transactions.some((tr) => tr.effects.some((e) => e.is(refreshLinks)))) this.decorations = build(u.view);
      }
    },
    { decorations: (v) => v.decorations },
  );
  // A plain click (or tap) on a name opens its sheet beside the text; the
  // cursor still lands there, and double-click or drag selects as usual.
  const click = EditorView.domEventHandlers({
    click(e, view) {
      if (e.button !== 0 || e.detail > 1 || e.shiftKey || !view.state.selection.main.empty) return false;
      const el = (e.target as HTMLElement).closest("[data-sheet]");
      const t = el && get().find((x) => x.name.toLowerCase() === el.getAttribute("data-sheet"));
      if (!t) return false;
      open(t);
      return false;
    },
  });
  return [plugin, click];
}

/** Replaces the writer's choices of level (from the project, or after a tap on the edge). */
export const setChoices = StateEffect.define<Choice[]>();

/**
 * The writer's choices of level, one per line, kept on their line through every edit:
 * typing anywhere in the line keeps it, a new line made with Enter starts free.
 */
export const choicesField = StateField.define<Choice[]>({
  create: () => [],
  update(cs, tr) {
    for (const e of tr.effects) if (e.is(setChoices)) return e.value;
    if (!tr.docChanged) return cs;
    const doc = tr.state.doc;
    const out: Choice[] = [];
    for (const c of cs) {
      const at = tr.changes.mapPos(c.from, 1, MapMode.TrackDel);
      if (at === null) continue;
      const line = doc.lineAt(at);
      if (!out.some((o) => o.from === line.from)) out.push({ ...c, from: line.from, to: line.to });
    }
    return out;
  },
});

class LevelMark extends GutterMarker {
  constructor(readonly level: Level, readonly chosen: boolean, readonly done: boolean) {
    super();
  }
  eq(o: LevelMark) {
    return o.level === this.level && o.chosen === this.chosen && o.done === this.done;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = `cm-level-mark lv-${this.level}${this.chosen ? " chosen" : ""}`;
    el.title = `${LEVELS[this.level].label}${this.done ? ", carried out" : ""}${this.chosen ? " (your choice)" : ""}: ${LEVELS[this.level].hint}. Tap to change.`;
    el.setAttribute("aria-label", el.title);
    return el;
  }
}

const TAGS: Record<string, Level> = { "\\": "intent", "/": "request" };

/**
 * Intent writing in the Draft: each line's level, guessed by rules or chosen by the
 * writer, shown in the text (intent softer, requests on a band) and as a coloured
 * edge. A tap on the edge asks the app for the menu to correct that line. Typing
 * "\\ " or "/ " at the start of a line turns into that choice, and the tag goes.
 */
export function intentLevels(onPick: (at: { lineFrom: number; level: Level; chosen: boolean; x: number; y: number }) => void): Extension {
  const field = StateField.define<Passage[]>({
    create: (s) => passages(s.doc.toString(), s.field(choicesField, false) ?? []),
    update: (ps, tr) => (tr.docChanged || tr.startState.field(choicesField, false) !== tr.state.field(choicesField, false) ? passages(tr.state.doc.toString(), tr.state.field(choicesField, false) ?? []) : ps),
  });
  const lines = EditorView.decorations.compute([field], (state) => {
    const b = new RangeSetBuilder<Decoration>();
    for (const p of state.field(field)) {
      for (let pos = p.from; pos <= p.to; ) {
        const line = state.doc.lineAt(pos);
        b.add(line.from, line.from, Decoration.line({ class: `cm-lv cm-lv-${p.level}${p.done ? " done" : ""}` }));
        pos = line.to + 1;
      }
    }
    return b.finish();
  });
  const at = (state: EditorView["state"], pos: number) => state.field(field).find((p) => pos >= p.from && pos <= p.to);
  const edge = gutter({
    class: "cm-levels",
    lineMarker: (view, line) => {
      const p = at(view.state, line.from);
      return p ? new LevelMark(p.level, view.state.field(choicesField).some((c) => c.from === line.from && !!c.level), p.done) : null;
    },
    lineMarkerChange: (u) => u.docChanged || u.startState.field(choicesField, false) !== u.state.field(choicesField, false),
    domEventHandlers: {
      click(view, line, e) {
        const p = at(view.state, line.from);
        if (!p) return false;
        const r = (e.target as HTMLElement).getBoundingClientRect();
        onPick({ lineFrom: line.from, level: p.level, chosen: view.state.field(choicesField).some((c) => c.from === line.from && !!c.level), x: r.right + 4, y: r.top });
        return true;
      },
    },
  });
  const tags = EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== " " || from !== to) return false;
    const line = view.state.doc.lineAt(from);
    const before = view.state.sliceDoc(line.from, from);
    const m = before.match(/^(\s*)(\\|\/)$/);
    if (!m) return false;
    const level = TAGS[m[2]];
    const tagAt = line.from + m[1].length;
    const rest = view.state.field(choicesField).filter((c) => c.from !== line.from);
    view.dispatch({
      changes: { from: tagAt, to: from },
      effects: setChoices.of([...rest, { from: line.from, to: line.to - 1, level }]),
      userEvent: "input.type",
    });
    return true;
  });
  return [field, lines, edge, tags];
}

/** Replaces the stretches Claude wrote (from the project, or after Claude writes more). */
export const setClaudeSpans = StateEffect.define<{ from: number; to: number }[]>();

/**
 * The stretches Claude wrote, kept in step with every edit. Whatever the writer
 * types inside one becomes theirs. Shown in Claude's colour.
 */
export const claudeSpansField = StateField.define<{ from: number; to: number }[]>({
  create: () => [],
  update(spans, tr) {
    for (const e of tr.effects) if (e.is(setClaudeSpans)) return e.value;
    if (!tr.docChanged) return spans;
    let out = spans.map((s) => ({ from: tr.changes.mapPos(s.from, 1), to: tr.changes.mapPos(s.to, -1) })).filter((s) => s.to > s.from);
    tr.changes.iterChanges((_fa, _ta, fb, tb) => {
      if (tb > fb) out = out.flatMap((s) => (s.to <= fb || s.from >= tb ? [s] : [{ from: s.from, to: fb }, { from: tb, to: s.to }].filter((x) => x.to > x.from)));
    });
    return out;
  },
  provide: (f) =>
    EditorView.decorations.from(f, (spans) => {
      const b = new RangeSetBuilder<Decoration>();
      for (const s of spans) b.add(s.from, s.to, Decoration.mark({ class: "cm-by-claude" }));
      return b.finish();
    }),
});
