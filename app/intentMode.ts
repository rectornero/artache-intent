// Syntax colours for Intent Script, plus the parser's diagnostics as squiggles.

import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { linter, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { tags as t } from "@lezer/highlight";
import { RangeSetBuilder, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
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

/** Marks every {{ note }}: a part of the Draft the writer left for Claude to write. */
export function gapMarks(): Extension {
  const build = (doc: { toString: () => string }): DecorationSet => {
    const b = new RangeSetBuilder<Decoration>();
    for (const m of doc.toString().matchAll(/\{\{[\s\S]*?\}\}/g)) {
      b.add(m.index!, m.index! + m[0].length, Decoration.mark({ class: "cm-gap", attributes: { title: "Claude writes this part: ✦ Write" } }));
    }
    return b.finish();
  };
  return StateField.define<DecorationSet>({
    create: (s) => build(s.doc),
    update: (d, tr) => (tr.docChanged ? build(tr.state.doc) : d),
    provide: (f) => EditorView.decorations.from(f),
  });
}
