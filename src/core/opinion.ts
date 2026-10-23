/** Which part of a script a ✦ Opinion reads: the selection, the scene or chapter at the cursor, or all of it. */
export type OpinionScope = "selection" | "scene" | "chapter" | "script";

export interface OpinionPart {
  scope: OpinionScope;
  text: string;
  /** First and last line of the part, from 1. */
  from: number;
  to: number;
  /** The heading it sits under ("First scene"), when it has one. */
  title: string;
}

const heading = (line: string, level: 1 | 2) => (level === 1 ? /^#\s+\S/.test(line) : /^##\s+\S/.test(line));

/**
 * The part around `cursorLine`. A scene runs from its `##` heading to the next `#` or `##`;
 * a chapter from its `#` heading to the next `#`. Without a heading above, it starts at the top.
 */
export function opinionPart(text: string, scope: OpinionScope, cursorLine: number, selection = ""): OpinionPart {
  const lines = text.split("\n");
  const at = Math.min(Math.max(cursorLine, 1), lines.length) - 1;
  if (scope === "selection" && selection.trim()) {
    const start = text.indexOf(selection);
    const from = start < 0 ? at + 1 : text.slice(0, start).split("\n").length;
    return { scope, text: selection, from, to: from + selection.split("\n").length - 1, title: "" };
  }
  if (scope === "script" || scope === "selection") return { scope: "script", text, from: 1, to: lines.length, title: "" };
  const opens = (l: string) => (scope === "scene" ? heading(l, 2) || heading(l, 1) : heading(l, 1));
  const starts = (l: string) => (scope === "scene" ? heading(l, 2) : heading(l, 1));
  let first = 0;
  for (let i = at; i >= 0; i--) {
    if (starts(lines[i])) { first = i; break; }
    // A scene doesn't reach back past its chapter's heading.
    if (scope === "scene" && heading(lines[i], 1)) { first = i + 1; break; }
  }
  let last = lines.length - 1;
  for (let i = first + 1; i < lines.length; i++) if (opens(lines[i])) { last = i - 1; break; }
  const title = starts(lines[first] ?? "") ? lines[first].replace(/^#+\s+/, "").trim() : "";
  return { scope, text: lines.slice(first, last + 1).join("\n"), from: first + 1, to: last + 1, title };
}

/** The line a quote from Claude is on, to jump there; null when it isn't found. */
export function lineOfQuote(text: string, quote: string): number | null {
  const q = quote.trim().replace(/^[“"'‘]+|[”"'’]+$/g, "");
  if (!q) return null;
  let i = text.indexOf(q);
  if (i < 0) i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) {
    // Close enough: the first few words.
    const head = q.split(/\s+/).slice(0, 4).join(" ");
    i = head.length > 8 ? text.toLowerCase().indexOf(head.toLowerCase()) : -1;
  }
  return i < 0 ? null : text.slice(0, i).split("\n").length;
}
