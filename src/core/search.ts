// Find, replace and rename across a whole project: every script's three
// versions and every sheet. Replacing in both halves of a synced pair also
// updates the sync record, so versions that were in step stay in step.

import { parseSheet, sheetFileName } from "./sheets.ts";
import { readSync, SYNC_FILE, versionFile, VERSIONS, type Pair, type Version } from "./sync.ts";

export type Scope = "play" | "draft" | "renpy" | "sheets";
export const SCOPES: Scope[] = ["play", "draft", "renpy", "sheets"];

export interface SearchOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
  scopes?: Scope[];
}

export interface Match {
  file: string;
  line: number;
  col: number;
  length: number;
  text: string;
}

export function scopeOf(file: string): Scope | null {
  if (file.endsWith(".intent")) return "play";
  if (file.endsWith(".draft")) return "draft";
  if (file.endsWith(".rpy") || file.endsWith(".mv.json")) return "renpy";
  if (file.endsWith(".sheet")) return "sheets";
  return null;
}

/** Whole words follow letters, not ASCII: "Limo's" and "Élise" both count. */
export function searchPattern(query: string, opts: SearchOptions = {}): RegExp | null {
  if (!query) return null;
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(opts.wholeWord ? `(?<![\\p{L}\\p{N}_])${esc}(?![\\p{L}\\p{N}_])` : esc, opts.matchCase ? "gu" : "giu");
}

const inScope = (file: string, opts: SearchOptions) => {
  const s = scopeOf(file);
  return s !== null && (opts.scopes ?? SCOPES).includes(s);
};

export function findAll(files: Record<string, string>, query: string, opts: SearchOptions = {}): Match[] {
  const re = searchPattern(query, opts);
  if (!re) return [];
  const out: Match[] = [];
  for (const file of Object.keys(files).filter((f) => inScope(f, opts)).sort()) {
    files[file].split("\n").forEach((text, i) => {
      for (const m of text.matchAll(re)) out.push({ file, line: i + 1, col: m.index!, length: m[0].length, text });
    });
  }
  return out;
}

/** Keeps the match's shape: LIMO becomes LUNA, limo becomes luna. */
export function keepCase(found: string, replacement: string): string {
  if (found.length > 1 && found === found.toUpperCase() && found !== found.toLowerCase()) return replacement.toUpperCase();
  if (found === found.toLowerCase() && found !== found.toUpperCase()) return replacement.toLowerCase();
  return replacement;
}

export interface ReplaceResult {
  files: Record<string, string>;
  changed: string[];
  count: number;
}

export function replaceAll(files: Record<string, string>, query: string, replacement: string, opts: SearchOptions & { only?: string[]; preserveCase?: boolean } = {}): ReplaceResult {
  const re = searchPattern(query, opts);
  if (!re) return { files, changed: [], count: 0 };
  const swap = (text: string) => text.replace(re, (m) => (opts.preserveCase ? keepCase(m, replacement) : replacement));
  const touched = new Set(Object.keys(files).filter((f) => inScope(f, opts) && (!opts.only || opts.only.includes(f))));
  const out = { ...files };
  const changed: string[] = [];
  let count = 0;
  for (const f of touched) {
    const n = files[f].match(re)?.length ?? 0;
    if (!n) continue;
    out[f] = swap(files[f]);
    changed.push(f);
    count += n;
  }
  if (!changed.length) return { files, changed, count };

  // A pair replaced on both sides keeps its sync state: the remembered texts get the same change.
  const rec = readSync(files);
  let recChanged = false;
  for (const [play, pairs] of Object.entries(rec)) {
    for (const [pair, base] of Object.entries(pairs ?? {}) as Array<[Pair, Partial<Record<Version, string>>]>) {
      const sides = pair.split("|") as Version[];
      if (!base || !sides.every((v) => touched.has(versionFile(play, v)))) continue;
      for (const v of sides) {
        if (base[v] === undefined) continue;
        const next = swap(base[v]!);
        if (next !== base[v]) (base[v] = next), (recChanged = true);
      }
    }
  }
  if (recChanged) out[SYNC_FILE] = JSON.stringify(rec, null, 1);
  return { files: out, changed, count };
}

/** Rename a sheet and every mention of its name in scripts and other sheets. */
export function renameSheet(files: Record<string, string>, sheetFile: string, newName: string): ReplaceResult & { to: string } {
  const sheet = parseSheet(files[sheetFile] ?? "");
  const name = newName.trim();
  if (!sheet) throw new Error("This sheet can't be read.");
  if (!name) throw new Error("The new name is empty.");
  const to = sheetFileName(sheet.kind, name);
  if (to !== sheetFile && files[to] !== undefined) throw new Error(`There is already a sheet called ${name}.`);
  // The sheet itself follows too ("Shown as" and notes), then moves to its new file name.
  const r = name === sheet.name ? { files, changed: [], count: 0 } : replaceAll(files, sheet.name, name, { wholeWord: true, preserveCase: true });
  const out = { ...r.files };
  const own = out[sheetFile].replace(/^(\s*@\w+\s+).*$/m, `$1${name}`);
  delete out[sheetFile];
  out[to] = own;
  const others = r.changed.filter((f) => f !== sheetFile);
  const count = r.count - (files[sheetFile].match(searchPattern(sheet.name, { wholeWord: true })!)?.length ?? 0);
  return { files: out, changed: others, count, to };
}

/** Rename a script and its Draft and Code versions, keeping their sync record. */
export function renameScript(files: Record<string, string>, from: string, to: string): Record<string, string> {
  if (from === to) return files;
  if (files[to] !== undefined) throw new Error(`There is already a script called ${to}.`);
  const out = { ...files };
  for (const v of VERSIONS) {
    const a = versionFile(from, v);
    if (out[a] === undefined) continue;
    out[versionFile(to, v)] = out[a];
    delete out[a];
  }
  const rec = readSync(files);
  if (rec[from]) {
    rec[to] = rec[from];
    delete rec[from];
    out[SYNC_FILE] = JSON.stringify(rec, null, 1);
  }
  return out;
}

/** Remove a script with its versions, or a sheet. */
export function deleteFile(files: Record<string, string>, file: string): Record<string, string> {
  const out = { ...files };
  if (file.endsWith(".intent")) {
    for (const v of VERSIONS.filter((x) => x !== "play")) delete out[versionFile(file, v)];
    const rec = readSync(files);
    if (rec[file]) {
      delete rec[file];
      out[SYNC_FILE] = JSON.stringify(rec, null, 1);
    }
  }
  delete out[file];
  return out;
}
