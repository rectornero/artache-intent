import type { Diagnostic, Script } from "./core/ast.ts";
import { loadConfig, type ProjectConfig } from "./core/config.ts";
import { parseScript, slug } from "./core/parser.ts";
import { backgroundsFromSheets, castFromSheets, parseSheet, type Sheet } from "./core/sheets.ts";
import { buildBible } from "./exporters/bible.ts";
import { exportMv, type MvOutput } from "./exporters/mv.ts";
import { withMvVersions } from "./core/mvVersion.ts";
import { inSync, pairState, versionFile } from "./core/sync.ts";
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
  /** The MV export as data, for MV versions of scripts. */
  mv?: MvOutput;
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
  let mv: MvOutput | undefined;
  if (want.includes("mv")) {
    const m = (mv = exportMv(scripts, config));
    files["mv/CommonEvents.intent.json"] = JSON.stringify(m.commonEvents, null, 1);
    files["mv/MapEvents.intent.json"] = JSON.stringify(m.mapEvents, null, 1);
    files["mv/System.intent.json"] = JSON.stringify({ switches: m.switches, variables: m.variables }, null, 2);
    files["mv/REPORT.md"] = reportMarkdown(`${config.name}: RPG Maker MV export`, m.report);
  }
  files["bible.json"] = JSON.stringify(buildBible(scripts), null, 2);
  return { config, scripts, sheets, diagnostics, files, mv };
}

/**
 * What Export writes: the compiled files, with each script's Code and MV versions in
 * their place where they are in step with Play (hand-tuned or not, they go out as they are).
 */
export function exportWithVersions(result: CompileResult, files: Record<string, string>): Record<string, string> {
  const out = { ...result.files };
  const mvTuned: Record<string, string> = {};
  for (const f of Object.keys(files).filter((n) => n.endsWith(".intent"))) {
    const code = files[versionFile(f, "renpy")];
    if (code !== undefined && inSync(pairState(files, f, "play", "renpy"))) out[`renpy/${slug(f.replace(/\.[^.]+$/, ""))}.rpy`] = code;
    const mv = files[versionFile(f, "mv")];
    if (mv !== undefined && inSync(pairState(files, f, "play", "mv"))) mvTuned[f] = mv;
  }
  if (result.mv && Object.keys(mvTuned).length && out["mv/CommonEvents.intent.json"] !== undefined) {
    const m = withMvVersions(result.mv, mvTuned);
    out["mv/CommonEvents.intent.json"] = JSON.stringify(m.commonEvents, null, 1);
    out["mv/System.intent.json"] = JSON.stringify({ switches: m.switches, variables: m.variables }, null, 2);
    if (m.problems.length) out["mv/REPORT.md"] = `${out["mv/REPORT.md"] ?? ""}\n## MV versions\n\n${m.problems.map((p) => `- ${p}`).join("\n")}\n`;
  }
  return out;
}
