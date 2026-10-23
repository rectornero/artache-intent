// Word counts: what the reader will read. In the Draft that's the prose (not
// headings, comments or {{ notes for Claude }}); in Play it's what is said and
// narrated, not stage directions or code.

import type { Node, Script } from "./ast.ts";
import { plainText } from "./inline.ts";
import { versionFile } from "./sync.ts";

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export function countWords(prose: string): number {
  const text = prose
    .replace(/\{\{[\s\S]*?\}\}/g, " ")
    .split("\n")
    // Headings, comments, fences, and script lines a Draft made from Play still carries.
    .filter((l) => !/^\s*(#|\/\/|~\s|:::|>>|@|\+\s|!\s|TODO:)/.test(l) && !/^\s*\[[^\]]*\]\s*$/.test(l))
    .join("\n");
  return text.match(WORD)?.length ?? 0;
}

function nodeWords(nodes: Node[]): number {
  let n = 0;
  for (const node of nodes) {
    if (node.n === "say") n += countWords(plainText(node.text));
    else if (node.n === "draft") n += countWords(node.text);
    else if (node.n === "menu") {
      if (node.prompt) n += countWords(plainText(node.prompt));
      for (const o of node.options) n += countWords(o.text) + nodeWords(o.body);
    } else if (node.n === "if") for (const b of node.branches) n += nodeWords(b.body);
    else if (node.n === "custom") for (const it of node.items) n += nodeWords(it.body);
  }
  return n;
}

/** Words said or narrated in a Play script. */
export function playWords(script: Script): number {
  return script.chapters.reduce((n, c) => n + c.scenes.reduce((m, s) => m + nodeWords(s.body), 0), 0) + script.blocks.reduce((n, b) => n + nodeWords(b.body ?? []), 0);
}

/** The whole project: each script's Draft when it has one, otherwise its Play. */
export function projectWords(files: Record<string, string>, scripts: Script[]): number {
  return scripts.reduce((n, s) => {
    const draft = files[versionFile(s.file, "draft")];
    return n + (draft !== undefined ? countWords(draft) : playWords(s));
  }, 0);
}

export interface Goals {
  /** Words for the whole project. */
  words?: number;
  /** Words a day. */
  daily?: number;
}

/** Goals live in intent.json under `goals`, so they travel with the project. */
export function readGoals(settingsJson: string | undefined): Goals {
  try {
    const g = JSON.parse(settingsJson || "{}").goals ?? {};
    const num = (v: unknown) => (typeof v === "number" && v > 0 ? Math.round(v) : undefined);
    return { words: num(g.words), daily: num(g.daily) };
  } catch {
    return {};
  }
}

export function writeGoals(settingsJson: string | undefined, goals: Goals): string {
  const settings = JSON.parse(settingsJson || "{}");
  const clean = Object.fromEntries(Object.entries(goals).filter(([, v]) => v));
  if (Object.keys(clean).length) settings.goals = clean;
  else delete settings.goals;
  return JSON.stringify(settings, null, 2);
}
