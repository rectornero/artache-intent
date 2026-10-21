// Story checks: problems Claude found in the writing (continuity, sheet facts,
// timeline, loose threads, names), kept with the project in intent.checks.json
// so they survive reloads and travel with the project. Dismissed ones stay hidden.

export const CHECKS_FILE = "intent.checks.json";

export const ISSUE_KINDS = ["continuity", "sheet", "timeline", "thread", "name", "other"] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];
export const ISSUE_NAMES: Record<IssueKind, string> = {
  continuity: "Continuity",
  sheet: "Against a sheet",
  timeline: "Timeline",
  thread: "Loose thread",
  name: "Name",
  other: "Other",
};
export type Severity = "high" | "medium" | "low";

export interface Issue {
  id: string;
  file: string;
  line: number;
  /** A short exact quote from the line, used to find it again after edits. */
  quote: string;
  kind: IssueKind;
  severity: Severity;
  problem: string;
  suggestion: string;
}

export interface Checks {
  /** When each script was last checked. */
  checked: Record<string, number>;
  issues: Issue[];
  dismissed: string[];
}

export function readChecks(files: Record<string, string>): Checks {
  try {
    const c = JSON.parse(files[CHECKS_FILE] || "{}") as Partial<Checks>;
    return { checked: c.checked ?? {}, issues: c.issues ?? [], dismissed: c.dismissed ?? [] };
  } catch {
    return { checked: {}, issues: [], dismissed: [] };
  }
}

export const writeChecks = (c: Checks) => JSON.stringify(c, null, 1);

/** Same problem, same id: a dismissed issue stays dismissed when a later check finds it again. */
export function issueId(i: Pick<Issue, "file" | "quote" | "problem">): string {
  let h = 5381;
  for (const ch of `${i.file}\n${i.quote}\n${i.problem}`) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

/** A new run's issues replace the old ones for the scripts it read; others are kept. */
export function mergeRun(old: Checks, read: string[], found: Omit<Issue, "id">[], at = Date.now()): Checks {
  const issues = [...old.issues.filter((i) => !read.includes(i.file)), ...found.map((i) => ({ ...i, id: issueId(i) }))];
  const ids = new Set(issues.map((i) => i.id));
  return {
    checked: { ...old.checked, ...Object.fromEntries(read.map((f) => [f, at])) },
    issues,
    dismissed: old.dismissed.filter((d) => ids.has(d)),
  };
}

/** Where the issue is now: the quote's line if it moved, else the line Claude gave. */
export function locate(text: string | undefined, i: Issue): number | null {
  if (text === undefined) return null;
  const lines = text.split("\n");
  const q = i.quote.trim();
  if (q && lines[i.line - 1]?.includes(q)) return i.line;
  if (q) {
    // The nearest line with the quote, in case lines were added above it.
    let best: number | null = null;
    lines.forEach((l, k) => {
      if (l.includes(q) && (best === null || Math.abs(k + 1 - i.line) < Math.abs(best - i.line))) best = k + 1;
    });
    if (best !== null) return best;
    return null;
  }
  return Math.min(Math.max(1, i.line), lines.length);
}

/** Script text with line numbers, so Claude can point at lines. */
export const numbered = (text: string) => text.split("\n").map((l, k) => `${k + 1}| ${l}`).join("\n");
