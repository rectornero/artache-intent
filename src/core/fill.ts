// Parts of a Draft the writer leaves for Claude: {{ a note on what happens }}.
// Claude writes each one as prose; everything outside the braces stays the writer's.

export interface Gap {
  /** Offsets of the whole {{ … }} in the text. */
  from: number;
  to: number;
  /** What the writer asked for, trimmed. */
  note: string;
}

const GAP = /\{\{([\s\S]*?)\}\}/g;

export function findGaps(text: string): Gap[] {
  return [...text.matchAll(GAP)].filter((m) => m[1].trim()).map((m) => ({ from: m.index!, to: m.index! + m[0].length, note: m[1].trim().replace(/\s+/g, " ") }));
}

/** The text with gap i replaced by fills[i]; a missing or empty fill keeps its note. */
export function fillGaps(text: string, gaps: Gap[], fills: string[]): string {
  let out = "";
  let at = 0;
  gaps.forEach((g, i) => {
    const fill = fills[i]?.trim();
    out += text.slice(at, g.from) + (fill ? fill : text.slice(g.from, g.to));
    at = g.to;
  });
  return out + text.slice(at);
}

/** The text with gaps shown as numbered markers, for Claude to read in context. */
export function markGaps(text: string, gaps: Gap[]): string {
  let out = "";
  let at = 0;
  gaps.forEach((g, i) => {
    out += `${text.slice(at, g.from)}<write n="${i + 1}">${g.note}</write>`;
    at = g.to;
  });
  return out + text.slice(at);
}
