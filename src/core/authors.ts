// Who wrote what in a Draft: the stretches Claude wrote (✦ Write, Write together),
// kept in intent.authors.json. Each stretch keeps its text, so it is found again
// after edits made outside Intent; a stretch the writer changed becomes theirs.

export const AUTHORS_FILE = "intent.authors.json";

export interface Span {
  from: number;
  to: number;
}
interface Stored extends Span {
  text: string;
}
export type Authors = Record<string, Stored[]>;

export function readAuthors(files: Record<string, string>): Authors {
  try {
    return JSON.parse(files[AUTHORS_FILE] ?? "{}") as Authors;
  } catch {
    return {};
  }
}

/** Claude's stretches in `text`: where they were if unchanged, else wherever their text now is. */
export function claudeSpans(text: string, stored: Stored[] = []): Span[] {
  const out: Span[] = [];
  for (const s of stored) {
    if (!s.text) continue;
    if (text.slice(s.from, s.to) === s.text) out.push({ from: s.from, to: s.to });
    else {
      const at = text.indexOf(s.text);
      if (at >= 0) out.push({ from: at, to: at + s.text.length });
    }
  }
  return normalise(out);
}

/** Sorted, merged, without empty stretches. */
export function normalise(spans: Span[]): Span[] {
  const sorted = spans.filter((s) => s.to > s.from).sort((a, b) => a.from - b.from);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.from <= last.to) last.to = Math.max(last.to, s.to);
    else out.push({ ...s });
  }
  return out;
}

/** The stretches minus [from, to): what the writer typed there is theirs. */
export function subtract(spans: Span[], from: number, to: number): Span[] {
  if (to <= from) return spans;
  return normalise(spans.flatMap((s) => (s.to <= from || s.from >= to ? [s] : [{ from: s.from, to: from }, { from: to, to: s.to }])));
}

/** intent.authors.json with `file`'s stretches set (none: the file is dropped). */
export function writeAuthors(files: Record<string, string>, file: string, text: string, spans: Span[]): string | undefined {
  const all = readAuthors(files);
  const list = normalise(spans).map((s) => ({ ...s, text: text.slice(s.from, s.to) }));
  if (list.length) all[file] = list;
  else delete all[file];
  return Object.keys(all).length ? JSON.stringify(all, null, 1) + "\n" : undefined;
}

/** Spans after a whole-text edit from `before` to `after` that only inserted Claude's text at `at` (length n). */
export function shiftForInsert(spans: Span[], at: number, n: number): Span[] {
  return spans.map((s) => (s.from >= at ? { from: s.from + n, to: s.to + n } : s.to > at ? { from: s.from, to: s.to + n } : s));
}
