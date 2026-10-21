#!/usr/bin/env -S npx tsx
// intent <project-dir> [-o out-dir] [--target renpy|mv]
// A project dir holds intent.json (settings) and *.intent script files.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileProject } from "./project.ts";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("-") && args[args.indexOf(a) - 1] !== "-o" && args[args.indexOf(a) - 1] !== "--target");
if (!dir) {
  console.error("usage: intent <project-dir> [-o out-dir] [--target renpy|mv]");
  process.exit(2);
}
const out = args.includes("-o") ? args[args.indexOf("-o") + 1] : join(dir, "out");
const target = args.includes("--target") ? [args[args.indexOf("--target") + 1] as "renpy" | "mv"] : undefined;

const settings = JSON.parse(readFileSync(join(dir, "intent.json"), "utf8"));
const sources: Record<string, string> = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith(".intent")).sort()) sources[f] = readFileSync(join(dir, f), "utf8");

const result = compileProject(settings, sources, target);
for (const [path, text] of Object.entries(result.files)) {
  mkdirSync(dirname(join(out, path)), { recursive: true });
  writeFileSync(join(out, path), text);
}
for (const d of result.diagnostics.filter((d) => d.level !== "info")) console.log(`${d.file}:${d.line} ${d.level}: ${d.message}`);
const errors = result.diagnostics.filter((d) => d.level === "error").length;
console.log(`${Object.keys(sources).length} script(s) -> ${Object.keys(result.files).length} file(s) in ${out}${errors ? `, ${errors} error(s)` : ""}`);
process.exit(errors ? 1 : 0);
