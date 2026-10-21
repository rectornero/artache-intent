import type { Diagnostic, Script } from "./core/ast.ts";
import { loadConfig, type ProjectConfig } from "./core/config.ts";
import { parseScript } from "./core/parser.ts";
import { buildBible } from "./exporters/bible.ts";
import { exportMv } from "./exporters/mv.ts";
import { exportRenpy } from "./exporters/renpy.ts";
import { reportMarkdown } from "./exporters/report.ts";

export interface CompileResult {
  config: ProjectConfig;
  scripts: Script[];
  diagnostics: Array<Diagnostic & { file: string }>;
  /** Output path -> file contents. */
  files: Record<string, string>;
}

/** Turn a project (settings + script files) into engine files. Pure: no disk access. */
export function compileProject(settings: unknown, sources: Record<string, string>, targets?: Array<"renpy" | "mv">): CompileResult {
  const config = loadConfig(settings as Record<string, unknown>);
  const scripts = Object.entries(sources).map(([file, src]) => parseScript(src, config, file));
  const diagnostics = scripts.flatMap((s) => s.diagnostics.map((d) => ({ ...d, file: s.file })));
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
  return { config, scripts, diagnostics, files };
}
