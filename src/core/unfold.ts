// ✦ Unfold: the Draft at every level of detail, turned into its final form.
// Intent passages are written out by Claude; Written text stays word for word
// (Claude reads it as context), and so does Unpolished text (Claude reads it as the
// writer's notes); Requests are carried out and stay the writer's.

import { fillGapsAt, type Gap } from "./fill.ts";
import { passages, toWrite, type Level, type Passage } from "./levels.ts";

/** An intent passage Claude writes out. `note` is what stands there now. */
export interface Unit extends Gap {
  level: Level;
}

export interface UnfoldPlan {
  units: Unit[];
  asks: Passage[];
  /** Intent passages and open requests: what is left to unfold. */
  open: number;
  /** The Draft as Claude reads it: every intent passage and request marked, the rest as it is. */
  marked: string;
}

const esc = (s: string) => s.replace(/</g, "‹").replace(/>/g, "›");

export function planUnfold(text: string, ps: Passage[] = passages(text)): UnfoldPlan {
  const { story, asks, open } = toWrite(ps);
  const units: Unit[] = story.map((p) => ({ from: p.from, to: p.to, note: text.slice(p.from, p.to), level: p.level }));
  const marks = [
    ...units.map((u, i) => ({ from: u.from, to: u.to, put: `<part n="${i + 1}">${esc(u.note)}</part>` })),
    ...asks.map((p, i) => ({ from: p.from, to: p.to, put: `<request n="${i + 1}">${esc(text.slice(p.from, p.to))}</request>` })),
    // The writer's unpolished words stay theirs: Claude reads them as notes.
    ...ps.filter((p) => p.level === "unpolished").map((p) => ({ from: p.from, to: p.to, put: `<unpolished>${esc(text.slice(p.from, p.to))}</unpolished>` })),
  ].sort((a, b) => a.from - b.from);
  let marked = "";
  let at = 0;
  for (const m of marks) {
    marked += text.slice(at, m.from) + m.put;
    at = m.to;
  }
  return { units, asks, open, marked: marked + text.slice(at) };
}

/** The Draft with each part replaced by Claude's text. A part Claude left empty or unchanged stays the writer's. */
export function applyUnfold(text: string, units: Unit[], parts: string[]) {
  return fillGapsAt(text, units, parts.map((p, i) => (p?.trim() === units[i]?.note.trim() ? "" : p)));
}
