// The mystery kit's clue board: every clue with where it shows up in the scripts,
// every suspect with their alibi, and what looks unfinished. Worked out from the
// sheets and scripts each time, never stored.

import type { Script } from "./ast.ts";
import { listValue, sheetNames, sheetUsage, type Sheet } from "./sheets.ts";

export interface BoardClue {
  file: string;
  name: string;
  /** "clue" for clue sheets, or the item's type (Clue, Evidence) for items. */
  kind: string;
  pointsTo: string;
  truth: string;
  herring: "No" | "Yes" | "Partly";
  foundAt: string;
  knownBy: string[];
  /** Scenes that mention it, in script order. */
  scenes: Array<{ file: string; title: string; line: number }>;
}

export interface BoardSuspect {
  file: string;
  name: string;
  role: string;
  alibi: string;
  alibiHolds: string;
  knows: string;
  /** Clues whose "points to" names this character. */
  clues: string[];
}

export interface BoardWarning {
  file: string;
  message: string;
}

export interface Board {
  clues: BoardClue[];
  suspects: BoardSuspect[];
  warnings: BoardWarning[];
}

const SUSPECT_ROLES = ["suspect", "antagonist", "witness", "victim"];
const isClueItem = (s: Sheet) => s.kind === "item" && /^(clue|evidence)$/i.test(s.fields.type?.trim() ?? "");
const mentions = (text: string, s: Sheet) => sheetNames(s).some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));

export function clueBoard(sheets: Array<{ file: string; sheet: Sheet }>, scripts: Script[]): Board {
  const characters = sheets.filter((x) => x.sheet.kind === "character");
  const clues: BoardClue[] = sheets
    .filter((x) => x.sheet.kind === "clue" || isClueItem(x.sheet))
    .map(({ file, sheet }) => ({
      file,
      name: sheet.name,
      kind: sheet.kind === "clue" ? "clue" : sheet.fields.type.trim(),
      pointsTo: sheet.fields.pointsTo?.trim() ?? "",
      truth: sheet.fields.truth?.trim() ?? "",
      herring: (["Yes", "Partly"].includes(sheet.fields.herring?.trim()) ? sheet.fields.herring.trim() : "No") as BoardClue["herring"],
      foundAt: sheet.fields.foundAt?.trim() ?? "",
      knownBy: listValue(sheet.fields.knownBy),
      scenes: sheetUsage(sheet, scripts).scenes,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const suspects: BoardSuspect[] = characters
    .filter(({ sheet }) => SUSPECT_ROLES.includes(sheet.fields.role?.trim().toLowerCase() ?? "") || sheet.fields.alibi?.trim() || clues.some((c) => mentions(c.pointsTo, sheet)))
    .map(({ file, sheet }) => ({
      file,
      name: sheet.name,
      role: sheet.fields.role?.trim() ?? "",
      alibi: sheet.fields.alibi?.trim() ?? "",
      alibiHolds: sheet.fields.alibiHolds?.trim() || "Unchecked",
      knows: sheet.fields.knows?.trim() ?? "",
      clues: clues.filter((c) => mentions(c.pointsTo, sheet)).map((c) => c.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const warnings: BoardWarning[] = [];
  const known = (n: string) => characters.some(({ sheet }) => mentions(n, sheet) && sheetNames(sheet).some((x) => x.toLowerCase() === n.toLowerCase()));
  for (const c of clues) {
    if (!c.scenes.length) warnings.push({ file: c.file, message: `${c.name} never appears in a script yet.` });
    if (!c.pointsTo) warnings.push({ file: c.file, message: `${c.name} doesn't point to anyone yet.` });
    if (c.herring !== "No" && !c.truth) warnings.push({ file: c.file, message: `${c.name} is a red herring, but its real meaning isn't written down.` });
    for (const k of c.knownBy) if (!known(k)) warnings.push({ file: c.file, message: `${c.name} is known by ${k}, who has no character sheet.` });
  }
  for (const s of suspects) {
    if (s.role.toLowerCase() === "suspect" && !s.alibi) warnings.push({ file: s.file, message: `${s.name} is a suspect with no alibi.` });
    if (s.role.toLowerCase() === "suspect" && !s.clues.length) warnings.push({ file: s.file, message: `No clue points to ${s.name} yet.` });
  }
  return { clues, suspects, warnings };
}
