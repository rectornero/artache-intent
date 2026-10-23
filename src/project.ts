import type { Diagnostic, Script } from "./core/ast.ts";
import { loadConfig, type ProjectConfig } from "./core/config.ts";
import { parseScript } from "./core/parser.ts";
import { backgroundsFromSheets, castFromSheets, parseSheet, type Sheet } from "./core/sheets.ts";
import { buildBible } from "./exporters/bible.ts";
import { exportMv } from "./exporters/mv.ts";
import { exportRenpy } from "./exporters/renpy.ts";
import { reportMarkdown } from "./exporters/report.ts";

export interface CompileResult {
  config: ProjectConfig;
  scripts: Script[];
  /** `.sheet` files by file name. */
  sheets: Array<{ file: string; sheet: Sheet }>;
  diagnostics: Array<Diagnostic & { file: string }>;
  /** Output path -> file contents. */
  files: Record<string, string>;
}

/** Turn a project (settings + script files) into engine files. Pure: no disk access. */
export function compileProject(settings: unknown, sources: Record<string, string>, targets?: Array<"renpy" | "mv">): CompileResult {
  const sheets: CompileResult["sheets"] = [];
  const sheetErrors: CompileResult["diagnostics"] = [];
  for (const [file, src] of Object.entries(sources).filter(([f]) => f.endsWith(".sheet"))) {
    const sheet = parseSheet(src);
    if (sheet) sheets.push({ file, sheet });
    else sheetErrors.push({ level: "error", line: 1, message: "A sheet starts with @character, @place, @item, @minigame or @clue and a name", file });
  }
  // Sheets fill the cast and backgrounds; anything written in intent.json wins.
  const s0 = (settings ?? {}) as Record<string, any>;
  const fromSheets = castFromSheets(sheets.map((x) => x.sheet));
  const merged = {
    ...s0,
    cast: Object.fromEntries(
      [...new Set([...Object.keys(fromSheets), ...Object.keys(s0.cast ?? {})])].map((k) => [k, { ...fromSheets[k], ...(s0.cast?.[k] ?? {}) }]),
    ),
    assets: { ...(s0.assets ?? {}), bg: { ...backgroundsFromSheets(sheets.map((x) => x.sheet)), ...(s0.assets?.bg ?? {}) } },
  };
  const config = loadConfig(merged);
  const scripts = Object.entries(sources).filter(([f]) => !f.endsWith(".sheet")).map(([file, src]) => parseScript(src, config, file));
  const diagnostics = [...sheetErrors, ...scripts.flatMap((s) => s.diagnostics.map((d) => ({ ...d, file: s.file })))];
  const files: Record<string, string> = {};
  const want = targets ?? config.targets;
  if (want.includes("renpy")) {
    const r = exportRenpy(scripts, config);
    for (const [name, text] of Object.entries(r.files)) files[`renpy/${name}`] = text;
    files["renpy/REPORT.md"] = reportMarkdown(`${config.name}: Ren'Py export`, r.report);
  }
  if (want.includes("mv")) {
    const m = exportMv(scripts, config);
    files["mv/CommonEvents.intent.json"] = JSON.stringify(m.commonEvents, null, 1);
    files["mv/MapEvents.intent.json"] = JSON.stringify(m.mapEvents, null, 1);
    files["mv/System.intent.json"] = JSON.stringify({ switches: m.switches, variables: m.variables }, null, 2);
    files["mv/REPORT.md"] = reportMarkdown(`${config.name}: RPG Maker MV export`, m.report);
  }
  files["bible.json"] = JSON.stringify(buildBible(scripts), null, 2);
  return { config, scripts, sheets, diagnostics, files };
}
