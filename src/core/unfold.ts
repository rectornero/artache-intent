// ✦ Unfold: the Draft at every level of detail, turned into its final form.
// Fast and Medium passages are written out by Claude; Detailed text stays word
// for word, except keywords or a sketch inside it; Requests are carried out and
// stay the writer's.

import { fillGapsAt, type Gap } from "./fill.ts";
import { passages, toWrite, type Level, type Passage } from "./levels.ts";

/** A story passage Claude reads and may write out. `note` is what stands there now. */
export interface Unit extends Gap {
  level: Level;
}

export interface UnfoldPlan {
  units: Unit[];
  asks: Passage[];
  /** Fast and Medium passages: what is surely left to write out. */
  open: number;
  /** The Draft as Claude reads it: every passage and request marked, headings and comments as they are. */
  marked: string;
}

const esc = (s: string) => s.replace(/</g, "‹").replace(/>/g, "›");

export function planUnfold(text: string, ps: Passage[] = passages(text)): UnfoldPlan {
  const { story, asks, open } = toWrite(ps);
  const units: Unit[] = story.map((p) => ({ from: p.from, to: p.to, note: text.slice(p.from, p.to), level: p.level }));
  const marks = [
    ...units.map((u, i) => ({ from: u.from, to: u.to, put: `<part n="${i + 1}" level="${u.level}">${esc(u.note)}</part>` })),
    ...asks.map((p, i) => ({ from: p.from, to: p.to, put: `<request n="${i + 1}">${esc(text.slice(p.from, p.to))}</request>` })),
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
