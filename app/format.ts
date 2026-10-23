// Visual formatting in the Draft, for the writer's eyes: **bold**, *italic*, # title,
// ## subtitle, - bullets and `code-like` notes. The marks stay plain text in the file;
// away from the cursor they hide, so the page reads like a page.

import { EditorSelection, Prec, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from "@codemirror/view";

export type Format = "bold" | "italic" | "title" | "subtitle" | "bullet" | "code";

export const FORMATS: Record<Format, { label: string; keys: string; mark?: string; prefix?: string }> = {
  bold: { label: "Bold", keys: "Ctrl+B", mark: "**" },
  italic: { label: "Italic", keys: "Ctrl+I", mark: "*" },
  code: { label: "Code-like", keys: "Ctrl+E", mark: "`" },
  title: { label: "Title", keys: "Ctrl+Alt+1", prefix: "# " },
  subtitle: { label: "Subtitle", keys: "Ctrl+Alt+2", prefix: "## " },
  bullet: { label: "Bullet point", keys: "Ctrl+Shift+8", prefix: "- " },
};

const PREFIXES = /^(#{1,2} |[-*] )/;

/** Wraps the selection in `mark` (or unwraps it); with nothing selected, the word under the cursor. */
function toggleMark(view: EditorView, mark: string): boolean {
  const { state } = view;
  const tr = state.changeByRange((r) => {
    let { from, to } = r;
    if (from === to) {
      const w = state.wordAt(from);
      if (w) ({ from, to } = w);
    }
    const n = mark.length;
    const before = state.sliceDoc(from - n, from);
    const after = state.sliceDoc(to, to + n);
    // A single * must not eat one side of a **.
    const exact = (s: string, at: number) => s === mark && (mark !== "*" || (state.sliceDoc(at - 1, at) !== "*" && state.sliceDoc(at + 1, at + 2) !== "*"));
    if (from !== to && exact(before, from - n) && exact(after, to)) {
      return { changes: [{ from: from - n, to: from }, { from: to, to: to + n }], range: EditorSelection.range(from - n, to - n) };
    }
    const inside = state.sliceDoc(from, to);
    if (inside.length > 2 * n && inside.startsWith(mark) && inside.endsWith(mark)) {
      return { changes: { from, to, insert: inside.slice(n, -n) }, range: EditorSelection.range(from, to - 2 * n) };
    }
    return { changes: [{ from, insert: mark }, { from: to, insert: mark }], range: from === to ? EditorSelection.cursor(from + n) : EditorSelection.range(from + n, to + n) };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input.format" }));
  return true;
}

/** Starts each selected line with `prefix`, or takes it away; a title becomes a subtitle and back. */
function togglePrefix(view: EditorView, prefix: string): boolean {
  const { state } = view;
  const lines = new Set<number>();
  for (const r of state.selection.ranges) for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) lines.add(n);
  const all = [...lines].map((n) => state.doc.line(n));
  const on = all.every((l) => l.text.startsWith(prefix));
  const changes = all.map((l) => {
    const had = l.text.match(PREFIXES)?.[0] ?? "";
    return { from: l.from, to: l.from + had.length, insert: on ? "" : prefix };
  });
  view.dispatch({ changes, scrollIntoView: true, userEvent: "input.format" });
  return true;
}

export function applyFormat(view: EditorView, f: Format): boolean {
  const spec = FORMATS[f];
  const done = spec.mark ? toggleMark(view, spec.mark) : togglePrefix(view, spec.prefix!);
  view.focus();
  return done;
}

export const formatKeys = Prec.high(keymap.of([
  { key: "Mod-b", run: (v) => applyFormat(v, "bold") },
  { key: "Mod-i", run: (v) => applyFormat(v, "italic") },
  { key: "Mod-e", run: (v) => applyFormat(v, "code") },
  { key: "Mod-Alt-1", run: (v) => applyFormat(v, "title") },
  { key: "Mod-Alt-2", run: (v) => applyFormat(v, "subtitle") },
  { key: "Mod-Shift-8", run: (v) => applyFormat(v, "bullet") },
]));

class Bullet extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-md-bullet";
    el.textContent = "•";
    return el;
  }
}

const hide = Decoration.replace({});
const mark = Decoration.mark({ class: "cm-md-mark" });
const INLINE: Array<{ re: RegExp; n: number; cls: string }> = [
  { re: /\*\*(?=\S)(.+?)(?<=\S)\*\*/g, n: 2, cls: "cm-md-b" },
  { re: /(?<![*\w])\*(?=[^\s*])([^*\n]+?)(?<=[^\s*])\*(?![*\w])/g, n: 1, cls: "cm-md-i" },
  { re: /`([^`\n]+)`/g, n: 1, cls: "cm-md-code" },
];

function build(view: EditorView): { all: DecorationSet; hidden: DecorationSet } {
  const state: EditorState = view.state;
  const active = new Set(state.selection.ranges.flatMap((r) => {
    const a = state.doc.lineAt(r.from).number, b = state.doc.lineAt(r.to).number;
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }));
  const out: Array<{ from: number; to: number; deco: Decoration }> = [];
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = state.doc.lineAt(pos);
      const here = active.has(line.number);
      const head = line.text.match(/^(#{1,2}) (?=\S)/);
      const bullet = line.text.match(/^([-*]) (?=\S)/);
      if (head) {
        out.push({ from: line.from, to: line.from, deco: Decoration.line({ class: head[1].length === 1 ? "cm-md-h1" : "cm-md-h2" }) });
        out.push({ from: line.from, to: line.from + head[0].length, deco: here ? mark : hide });
      } else if (bullet) {
        out.push({ from: line.from, to: line.from, deco: Decoration.line({ class: "cm-md-li" }) });
        out.push({ from: line.from, to: line.from + 1, deco: Decoration.replace({ widget: new Bullet() }) });
      }
      for (const { re, n, cls } of INLINE) {
        for (const m of line.text.matchAll(re)) {
          const s = line.from + m.index!, e = s + m[0].length;
          out.push({ from: s, to: s + n, deco: here ? mark : hide });
          out.push({ from: s + n, to: e - n, deco: Decoration.mark({ class: cls }) });
          out.push({ from: e - n, to: e, deco: here ? mark : hide });
        }
      }
      pos = line.to + 1;
    }
  }
  out.sort((a, b) => a.from - b.from || a.to - b.to);
  const keep: typeof out = [];
  let last = -1;
  for (const d of out) {
    // Overlapping marks (bold inside a bullet) are fine; overlapping hides are not.
    const hides = d.deco === hide || d.deco.spec.widget;
    if (hides && d.from < last) continue;
    keep.push(d);
    if (hides) last = d.to;
  }
  const ranges = keep.map((d) => d.deco.range(d.from, d.to));
  return { all: Decoration.set(ranges, true), hidden: Decoration.set(keep.filter((d) => d.deco === hide || d.deco.spec.widget).map((d) => d.deco.range(d.from, d.to)), true) };
}

/** The Draft's formatting, shown as it reads. */
export function formatting(): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      hidden: DecorationSet;
      constructor(view: EditorView) {
        ({ all: this.decorations, hidden: this.hidden } = build(view));
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.selectionSet) ({ all: this.decorations, hidden: this.hidden } = build(u.view));
      }
    },
    // The cursor steps over a hidden mark in one go.
    { decorations: (v) => v.decorations, provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.hidden ?? Decoration.none) },
  );
  return [plugin, formatKeys];
}
