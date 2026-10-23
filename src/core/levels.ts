// Intent writing: a Draft written at whatever detail each moment deserves.
// Every line is finished text (Written) unless the writer marks it: Intent (keywords
// or a sketch, for Claude to write out) or Request (an ask for Claude). The writer marks
// a line on its edge, with the toolbar, or by starting it with "\\ " (intent) or "/ "
// (request). Nothing is guessed. A choice follows its line and is kept in
// intent.levels.json with the line's place and text.

export type Level = "intent" | "written" | "request";

export const LEVELS: Record<Level, { label: string; hint: string }> = {
  intent: { label: "Intent", hint: "Keywords or a sketch: ✦ Unfold writes it out" },
  written: { label: "Written", hint: "Finished text: kept word for word" },
  request: { label: "Request", hint: "An ask for Claude, never part of the story" },
};

export const LEVELS_FILE = "intent.levels.json";

/** A run of neighbouring lines at one level. `from`/`to` are offsets in the text. */
export interface Passage {
  from: number;
  to: number;
  level: Level;
  /** The writer chose it on the edge (true), or it comes from a tag or is plain Written. */
  chosen: boolean;
  /** A request Claude has already carried out. */
  done: boolean;
  /** The lines' own text, one per line. */
  lines: string[];
}

/** The writer's choice for one line. */
export interface Choice {
  /** The line it belongs to, as offsets in the text. */
  from: number;
  to: number;
  level?: Level;
  /** A request Claude has already carried out. */
  done?: boolean;
}
interface Stored extends Choice {
  text: string;
}
export type Levels = Record<string, Stored[]>;

export function readLevels(files: Record<string, string>): Levels {
  try {
    return JSON.parse(files[LEVELS_FILE] ?? "{}") as Levels;
  } catch {
    return {};
  }
}

// Headings, comments, fences and script lines a Draft made from Play still carries (as in words.ts).
const NOT_STORY = /^\s*(#|\/\/|~\s|:::|>>|@|\+\s|!\s|TODO:)/;
const DIVIDER = /^\s*([—–-]{1,3}|\*{3,}|_{3,})\s*$/;
// The writer's own tags at the start of a line: "\\ " intent, "/ " or "»" a request ("//" is a comment).
const REQUEST_TAG = /^(\/(?!\/)|»)/;
const INTENT_TAG = /^\\/;

/**
 * A line's level from the writer's own tag, else Written. Nothing is guessed: a line
 * is intent or a request only when the writer said so, with a tag or on its edge.
 */
export function taggedLevel(line: string): Level {
  const t = line.trim();
  if (REQUEST_TAG.test(t)) return "request";
  if (INTENT_TAG.test(t)) return "intent";
  return "written";
}

/** Lines that carry no level: blank, headings, comments, dividers. */
function skipped(line: string): boolean {
  return !line.trim() || NOT_STORY.test(line) || DIVIDER.test(line);
}

/** The writer's choices in `text`: where they were if the line is unchanged, else wherever its text now is. */
export function choicesIn(text: string, stored: Stored[] = []): Choice[] {
  const out: Choice[] = [];
  for (const c of stored) {
    const { text: was, ...rest } = c;
    if (text.slice(c.from, c.to) === was) out.push({ ...rest });
    else if (was.trim()) {
      const at = text.indexOf(was);
      if (at >= 0) out.push({ ...rest, from: at, to: at + was.length });
    }
  }
  return out;
}

/** `choices` with the line starting at `lineFrom` changed (`level: null` clears the choice). */
export function choose(choices: Choice[], text: string, lineFrom: number, change: { level?: Level | null; done?: boolean }): Choice[] {
  const from = text.lastIndexOf("\n", lineFrom - 1) + 1;
  const end = text.indexOf("\n", from);
  const to = end < 0 ? text.length : end;
  const was = choices.find((c) => c.from <= from && c.to >= to);
  const rest = choices.filter((c) => c.to <= from || c.from >= to);
  const next: Choice = { from, to, ...(was?.level ? { level: was.level } : {}), ...(was?.done ? { done: true } : {}) };
  if (change.level === null) delete next.level;
  else if (change.level) next.level = change.level;
  if (change.done === true) next.done = true;
  else if (change.done === false) delete next.done;
  return next.level || next.done ? [...rest, next].sort((x, y) => x.from - y.from) : rest;
}

/** intent.levels.json with `file`'s choices set (none: the file is dropped). */
export function writeLevels(files: Record<string, string>, file: string, text: string, choices: Choice[]): string | undefined {
  const all = readLevels(files);
  // A line may still be empty: a tag was just typed and the words are coming.
  const list = choices.filter((c) => (c.level || c.done) && c.to >= c.from && c.to <= text.length).map((c) => ({ ...c, text: text.slice(c.from, c.to) }));
  if (list.length) all[file] = list;
  else delete all[file];
  return Object.keys(all).length ? JSON.stringify(all, null, 1) + "\n" : undefined;
}

/** The Draft's passages: each line's level (the writer's choice, else its tag, else Written), neighbours at one level joined. */
export function passages(text: string, choices: Choice[] = []): Passage[] {
  const out: Passage[] = [];
  let at = 0;
  let open = false; // inside a » … » request that runs over several lines
  let prevEnd = -1;
  for (const line of text.split("\n")) {
    const from = at, to = at + line.length;
    at = to + 1;
    if (skipped(line)) {
      if (!line.trim() || DIVIDER.test(line)) open = false;
      continue;
    }
    const t = line.trim();
    const mine = choices.find((c) => c.from <= from && c.to >= to);
    const ask = open || t.startsWith("»");
    if (t.startsWith("»")) open = !/».*»/.test(t);
    else if (open && t.includes("»")) open = false;
    const level: Level = mine?.level ?? (ask ? "request" : taggedLevel(line));
    const chosen = !!mine?.level;
    const done = !!mine?.done;
    const last = out[out.length - 1];
    if (last && last.level === level && prevEnd === from - 1 && chosen === last.chosen) {
      last.to = to;
      last.lines.push(t);
      last.done = last.done && done;
    } else out.push({ from, to, level, chosen, done, lines: [t] });
    prevEnd = to;
  }
  return out;
}

/** What ✦ Unfold has to do: intent to write out, and requests not yet carried out. Written text is kept word for word. */
export function toWrite(ps: Passage[]): { story: Passage[]; asks: Passage[]; open: number } {
  const story = ps.filter((p) => p.level === "intent");
  const asks = ps.filter((p) => p.level === "request" && !p.done);
  return { story, asks, open: story.length + asks.length };
}

/** The start of every line in [from, to). */
export function lineStarts(text: string, from: number, to: number): number[] {
  const out = [from];
  for (let i = text.indexOf("\n", from); i >= 0 && i + 1 < to; i = text.indexOf("\n", i + 1)) out.push(i + 1);
  return out;
}

/** The Draft without its requests: what a reader of the story gets. */
export function storyOnly(text: string, choices: Choice[] = []): string {
  const asks = passages(text, choices).filter((p) => p.level === "request");
  if (!asks.length) return text;
  return text.split("\n").filter((_, i, all) => {
    const from = all.slice(0, i).reduce((n, l) => n + l.length + 1, 0);
    return !asks.some((p) => from >= p.from && from <= p.to);
  }).join("\n");
}
