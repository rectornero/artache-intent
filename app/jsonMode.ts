import { StreamLanguage, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

// Small JSON highlighter for intent.json, so the app needs no extra language package.
const lang = StreamLanguage.define<null>({
  startState: () => null,
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^"(?:[^"\\]|\\.)*"(?=\s*:)/)) return "propertyName";
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return "string";
    if (stream.match(/^-?\d+(\.\d+)?/)) return "number";
    if (stream.match(/^(true|false|null)\b/)) return "keyword";
    stream.next();
    return null;
  },
});

const style = HighlightStyle.define([
  { tag: t.propertyName, color: "var(--block)" },
  { tag: t.string, color: "var(--speaker)" },
  { tag: t.number, color: "var(--flow)" },
  { tag: t.keyword, color: "var(--stage)" },
]);

export function json(): Extension {
  return [lang, syntaxHighlighting(style)];
}
