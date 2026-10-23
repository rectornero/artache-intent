// Putting Claude's writing into a Draft in place of what stood there, and
// retiring the old {{ notes }}: since intent writing, a note is just a line.

export interface Gap {
  /** Offsets of what Claude replaces. */
  from: number;
  to: number;
  /** What stands there now, trimmed. */
  note: string;
}

/** The text with gap i replaced by fills[i] (a missing or empty fill keeps what stood there), where each written part now sits, and how far each old offset moved. */
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

/** Every old {{ note }} as an intent line of its own ("\\ note"); empty braces go. Text with none comes back as it was. */
export function retireNotes(text: string): string {
  if (!text.includes("{{")) return text;
  return text
    .replace(/[^\S\n]*\{\{([\s\S]*?)\}\}[^\S\n]*/g, (m, note: string, at: number, all: string) => {
      const body = note.trim().replace(/\s+/g, " ");
      if (!body) return " ";
      const before = at > 0 && all[at - 1] !== "\n";
      const after = at + m.length < all.length && all[at + m.length] !== "\n";
      return `${before ? "\n" : ""}\\ ${body}${after ? "\n" : ""}`;
    })
    .replace(/[^\S\n]+$/gm, "");
}
