// Syntax colours for Intent Script, plus the parser's diagnostics as squiggles.

import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { linter, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";
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
