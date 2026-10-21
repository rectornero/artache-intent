// Everything an exporter could not do on its own goes here, so nothing fails
// silently: missing art and music, free descriptions, drafts, TODOs.

export interface Report {
  missing: Array<{ kind: string; name: string; line?: number }>;
  staged: Array<{ text: string; line: number }>;
  todos: Array<{ text: string; line: number }>;
  notes: string[];
}

export function newReport(): Report {
  return { missing: [], staged: [], todos: [], notes: [] };
}

export function addMissing(r: Report, kind: string, name: string, line?: number) {
  if (!r.missing.some((m) => m.kind === kind && m.name === name)) r.missing.push({ kind, name, line });
}

export function reportMarkdown(title: string, r: Report): string {
  const out = [`# ${title}`, ""];
  const sec = (h: string, rows: string[]) => {
    if (!rows.length) return;
    out.push(`## ${h}`, "", ...rows.map((x) => `- ${x}`), "");
  };
  sec("Missing assets (placeholders used)", r.missing.map((m) => `${m.kind}: \`${m.name}\`${m.line ? ` (line ${m.line})` : ""}`));
  sec("Free descriptions to stage by hand", r.staged.map((s) => `line ${s.line}: ${s.text}`));
  sec("TODO holes", r.todos.map((s) => `line ${s.line}: ${s.text}`));
  sec("Notes", r.notes);
  if (out.length === 2) out.push("Nothing missing.", "");
  return out.join("\n");
}
