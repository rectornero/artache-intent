// Intent writing: a Draft written at whatever detail each moment deserves.
// Every line is read on its own, by rules, with no Claude and nothing to format:
// intent (keywords or a sketch of what happens, for Claude to write out), finished
// text (Written, kept word for word), or a request to Claude (Request). The writer corrects a guess with a tap, or
// starts a line with "\\ " (intent) or "/ " (request); that choice follows the line
// and is kept in intent.levels.json with the line's place and text.

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
  /** The writer chose it (true), or the rules guessed it. */
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
// A typed tag: "/ make it colder" (or "»", as in a chat note), or Claude named first.
const ASK = /^(\/(?!\/)|»|@claude\b|claude\s*[,:])/i;
// An ask at the start of a line: "I want…", "Make…", "Can you…" (English and Italian).
const ASK_WORDS = /^(i want|i'd like|i would like|please|can you|could you|make|write|add|create|develop|build|design|describe|expand|rewrite|voglio|vorrei|per favore|puoi|potresti|fai|crea|scrivi|aggiungi|sviluppa|descrivi|riscrivi)\b/i;
const DIALOGUE = /^(["“«‘]|[—–]\s*\S|[\p{Lu}][\p{L}\p{N}'’. -]{0,30}(?:,[^:"“«]{0,40})?:\s*["“«‘])/u;
const ENDS = /[.!?…]["”»’)\]]*$/;
// A sketch of what happens: "then", arrows, a length to aim for.
const SKETCH = /(^|\s)(then|after that|meanwhile|poi|dopo|intanto|quindi)\s|->|→|=>/i;
const LENGTH = /\(\s*(about|around|circa|~)?\s*\d[\d,.]*\s*(words?|lines?|pages?|parole|righe|pagine)\s*\)/i;
// Words that glue a sentence together. Keywords have almost none.
const GLUE = new Set(
  ("a an the and or but if so of to in on at by for with from as into than that this these those it its is are was were be been am " +
    "i you he she we they me him her us them my your his our their who what which when where while not no " +
    "il lo la i gli le un uno una di del della dei delle da dal dalla in nel nella con su sul per tra fra e ed o ma se che " +
    "non mi ti si ci vi lui lei noi voi loro io tu è sono era ho ha hanno al alla ai come mentre quando dove anche")
    .split(" "),
);
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu;

/** The rules' guess for one line of story (not a heading, comment or divider). */
export function guessLevel(line: string): Level {
  const t = line.trim();
  if (ASK.test(t) || ASK_WORDS.test(t)) return "request";
  if (t.startsWith("\\")) return "intent";
  if (DIALOGUE.test(t)) return "written";
  const words = (t.match(WORD) ?? []).map((w) => w.toLowerCase());
  if (!words.length) return "written";
  const glue = words.filter((w) => GLUE.has(w) || GLUE.has(w.replace(/['’].*$/, ""))).length / words.length;
  const chunks = t.split(/[,;]+|[.!?…]+(?=\s|$)/).map((c) => (c.match(WORD) ?? []).length).filter((n) => n > 0);
  const chunkWords = words.length / Math.max(chunks.length, 1);
  const first = t.match(/\p{L}/u)?.[0] ?? "";
  const cap = first !== "" && first === first.toUpperCase() && first !== first.toLowerCase();
  const ends = ENDS.test(t);
  // A length to aim for means "write this out".
  if (LENGTH.test(t)) return "intent";
  // Keywords: short bits with little glue, like "museum, cats, peaceful sky" or "Rain. Door. Silence."
  // A line that starts and ends like a sentence needs to be really telegraphic to count.
  const keywords = cap && ends ? chunkWords <= 2 && glue < 0.25 : glue < 0.2 || (chunkWords <= 2.5 && glue < 0.25);
  if (words.length >= 2 && keywords) return "intent";
  // A sketch of what happens: "then", arrows.
  if (SKETCH.test(t)) return "intent";
  // Finished text starts with a capital and ends like a sentence.
  return cap && ends ? "written" : "intent";
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

/** `choices` with the line starting at `lineFrom` changed (`level: null` hands it back to the rules). */
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

/** The Draft's passages: each line's level (the writer's choice, else the rules' guess), neighbours at one level joined. */
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
    const level: Level = mine?.level ?? (ask ? "request" : guessLevel(line));
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

/**
 * What ✦ Unfold has to do: story passages (intent to write out; written text to keep, though keywords Claude
 * finds inside it may be written out), and requests not yet carried out. Lines the writer chose to keep as written are left out.
 */
export function toWrite(ps: Passage[]): { story: Passage[]; asks: Passage[]; open: number } {
  const story = ps.filter((p) => p.level !== "request" && !(p.level === "written" && p.chosen));
  const asks = ps.filter((p) => p.level === "request" && !p.done);
  return { story, asks, open: story.filter((p) => p.level === "intent").length + asks.length };
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
