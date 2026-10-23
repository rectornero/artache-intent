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
  return fillGapsAt(text, gaps, fills).text;
}

/** fillGaps, plus where each written part now sits and how far each old offset moved. */
export function fillGapsAt(text: string, gaps: Gap[], fills: string[]): { text: string; written: { from: number; to: number }[]; map: (pos: number) => number } {
  let out = "";
  let at = 0;
  const written: { from: number; to: number }[] = [];
  const moves: { at: number; to: number; by: number }[] = [];
  gaps.forEach((g, i) => {
    const fill = fills[i]?.trim();
    out += text.slice(at, g.from);
    if (fill) {
      written.push({ from: out.length, to: out.length + fill.length });
      moves.push({ at: g.from, to: g.to, by: fill.length - (g.to - g.from) });
    }
    out += fill ? fill : text.slice(g.from, g.to);
    at = g.to;
  });
  const map = (pos: number) => pos + moves.filter((m) => m.to <= pos).reduce((n, m) => n + m.by, 0);
  return { text: out + text.slice(at), written, map };
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
