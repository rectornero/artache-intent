// intent-mcp <project-dir>
// An MCP server that lets Claude Code or the Claude app work on an Intent
// project folder: read and write scripts and sheets with Intent's own checks
// after every write, search, rename, see which versions are in step, and save
// story checks. It talks over stdio; the folder is the only thing it touches.
//
// Claude Code:  claude mcp add intent -- node <path>/intent-mcp.mjs <project-dir>   (or: npx tsx src/mcp.ts <dir>)
// Claude app:   "intent": { "command": "node", "args": ["<path>/intent-mcp.mjs", "<project-dir>"] }

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { compileProject } from "./project.ts";
import { parseSheet } from "./core/sheets.ts";
import { findAll, renameSheet, replaceAll, type Scope } from "./core/search.ts";
import { inSync, markSynced, pairOf, pairState, SYNC_FILE, versionFile, type Version } from "./core/sync.ts";
import { slug } from "./core/parser.ts";
import { CHECKS_FILE, ISSUE_KINDS, mergeRun, readChecks, writeChecks } from "./core/checks.ts";

declare const __INTENT_SPEC__: string | undefined;

const root = resolve(process.argv[2] ?? ".");
if (!existsSync(join(root, "intent.json")) && !readdirSync(root).some((f) => f.endsWith(".intent"))) {
  console.error(`intent-mcp: ${root} doesn't look like an Intent project (no intent.json or .intent files).`);
  process.exit(2);
}

const SHEET_DIRS = ["characters", "places", "items", "minigames"];
/** The files Intent owns; everything else in the folder is left alone. */
const isIntentFile = (f: string) =>
  /^[^/]+\.(intent|draft|rpy)$/.test(f) || /^([^/]+\/)?[^/]+\.sheet$/.test(f) || f === "intent.json" || f === SYNC_FILE || f === CHECKS_FILE;

function load(): Record<string, string> {
  const files: Record<string, string> = {};
  const add = (rel: string) => (files[rel] = readFileSync(join(root, rel), "utf8"));
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.isFile() && isIntentFile(e.name)) add(e.name);
    if (e.isDirectory() && SHEET_DIRS.includes(e.name)) for (const f of readdirSync(join(root, e.name))) if (f.endsWith(".sheet")) add(`${e.name}/${f}`);
  }
  for (const n of Object.keys(files)) if (/\.(draft|rpy)$/.test(n) && files[n.replace(/\.(draft|rpy)$/, ".intent")] === undefined) delete files[n];
  return files;
}

function safePath(file: string): string {
  const rel = file.replace(/\\/g, "/").replace(/^\.\//, "");
  const full = resolve(root, rel);
  if (!full.startsWith(root + sep) || relative(root, full).replace(/\\/g, "/") !== rel) throw new Error(`${file} is outside the project.`);
  if (!isIntentFile(rel)) throw new Error(`${file} isn't an Intent file (.intent, .draft, .rpy, .sheet or intent.json).`);
  return full;
}

function save(changes: Record<string, string>, removed: string[] = []) {
  for (const [f, text] of Object.entries(changes)) {
    const full = safePath(f);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  for (const f of removed) rmSync(safePath(f), { force: true });
}

function compile(files: Record<string, string>) {
  const settings = JSON.parse(files["intent.json"] || "{}");
  const sources = Object.fromEntries(Object.entries(files).filter(([n]) => n.endsWith(".intent") || n.endsWith(".sheet")));
  return compileProject(settings, sources, ["renpy", "mv"]);
}

const problems = (files: Record<string, string>, only?: string) => {
  try {
    const list = compile(files).diagnostics.filter((d) => d.level !== "info" && (!only || d.file === only));
    return list.length ? list.map((d) => `${d.file}:${d.line} ${d.level}: ${d.message}`).join("\n") : "No problems.";
  } catch (e) {
    return `intent.json can't be read: ${e instanceof Error ? e.message : e}`;
  }
};

const syncLine = (files: Record<string, string>, play: string) =>
  (["draft", "renpy"] as Version[])
    .map((v) => {
      const s = pairState(files, play, "play", v);
      const name = v === "draft" ? "Draft" : "Code";
      if (s.missing) return `${name}: none yet`;
      if (inSync(s)) return `${name}: in step`;
      return `${name}: ${s.here && s.there ? "both edited" : s.here ? "behind Play" : "ahead of Play"}`;
    })
    .join(", ");

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const numbered = (t: string) => t.split("\n").map((l, k) => `${k + 1}| ${l}`).join("\n");

const server = new McpServer(
  { name: "artache-intent", version: "0.3.0" },
  {
    instructions:
      "Tools for an Artache Intent game script project. Each script has three versions: Play (.intent, Intent Script, the main one), Draft (.draft, prose) and Code (.rpy, Ren'Py). Start with intent_overview, and read intent_format once before writing Intent Script. Never reword the writer's text unless asked. After changing one version, keep its neighbours in step (Draft and Play, Play and Code), then call intent_mark_in_step; if you didn't, say so. Writing a script returns Intent's own problems for it: fix any you caused.",
  },
);

server.registerTool("intent_overview", { title: "Project overview", description: "Scripts with the state of their versions, sheets by kind, and Intent's problem count. Call this first." }, async () => {
  const files = load();
  const scripts = Object.keys(files).filter((f) => f.endsWith(".intent")).sort();
  const sheets = Object.keys(files).filter((f) => f.endsWith(".sheet")).sort();
  const name = (() => { try { return JSON.parse(files["intent.json"] || "{}").name; } catch { return undefined; } })();
  const checks = readChecks(files);
  const open = checks.issues.filter((i) => !checks.dismissed.includes(i.id)).length;
  return text([
    `Project: ${name ?? root.split(sep).pop()} (${root})`,
    `Scripts:\n${scripts.map((s) => `- ${s} (${syncLine(files, s)})`).join("\n") || "(none)"}`,
    `Sheets:\n${sheets.map((f) => `- ${f}: ${parseSheet(files[f])?.name ?? "?"}`).join("\n") || "(none)"}`,
    `Story check: ${open} open problem${open === 1 ? "" : "s"}.`,
    `Intent's own check:\n${problems(files)}`,
  ].join("\n\n"));
});

server.registerTool("intent_format", { title: "Intent Script reference", description: "The full Intent Script and sheet format. Read once before writing scripts or sheets." }, async () => {
  if (typeof __INTENT_SPEC__ === "string") return text(__INTENT_SPEC__);
  const embedded = (globalThis as { __INTENT_SPEC_TEXT__?: string }).__INTENT_SPEC_TEXT__;
  if (embedded) return text(embedded);
  return text(readFileSync(new URL("../docs/SPEC.md", import.meta.url), "utf8"));
});

server.registerTool(
  "intent_read",
  { title: "Read a file", description: "A script version or sheet, with line numbers unless plain is true. For a script's other versions use its .draft or .rpy name.", inputSchema: { file: z.string(), plain: z.boolean().optional() } },
  async ({ file, plain }) => {
    const full = safePath(file);
    if (!existsSync(full)) throw new Error(`${file} doesn't exist.`);
    const t = readFileSync(full, "utf8");
    return text(plain ? t : numbered(t));
  },
);

server.registerTool(
  "intent_write",
  { title: "Write a file", description: "Replace a script version, a sheet or intent.json with new full text, then get Intent's problems for it. Not for intent.sync.json.", inputSchema: { file: z.string(), text: z.string() } },
  async ({ file, text: t }) => {
    if (file === SYNC_FILE) throw new Error("intent.sync.json is Intent's own record; use intent_mark_in_step.");
    save({ [file]: t.endsWith("\n") ? t : `${t}\n` });
    const files = load();
    const play = file.replace(/\.(draft|rpy)$/, ".intent");
    return text([`Saved ${file}.`, file.endsWith(".sheet") || file === "intent.json" ? problems(files) : problems(files, play), files[play] !== undefined ? `Versions: ${syncLine(files, play)}` : ""].filter(Boolean).join("\n"));
  },
);

server.registerTool(
  "intent_find",
  { title: "Find in project", description: "Search scripts (all versions) and sheets.", inputSchema: { query: z.string(), match_case: z.boolean().optional(), whole_word: z.boolean().optional(), scopes: z.array(z.enum(["play", "draft", "renpy", "sheets"])).optional() } },
  async ({ query, match_case, whole_word, scopes }) => {
    const m = findAll(load(), query, { matchCase: match_case, wholeWord: whole_word, scopes: scopes as Scope[] | undefined });
    return text(m.length ? m.slice(0, 300).map((x) => `${x.file}:${x.line}: ${x.text.trim()}`).join("\n") + (m.length > 300 ? `\n… ${m.length - 300} more` : "") : "No matches.");
  },
);

server.registerTool(
  "intent_replace",
  { title: "Replace in project", description: "Replace text across scripts and sheets. Pairs replaced on both sides stay in step.", inputSchema: { query: z.string(), replacement: z.string(), match_case: z.boolean().optional(), whole_word: z.boolean().optional(), scopes: z.array(z.enum(["play", "draft", "renpy", "sheets"])).optional(), files: z.array(z.string()).optional() } },
  async ({ query, replacement, match_case, whole_word, scopes, files: only }) => {
    const before = load();
    const r = replaceAll(before, query, replacement, { matchCase: match_case, wholeWord: whole_word, scopes: scopes as Scope[] | undefined, only });
    save(Object.fromEntries(Object.entries(r.files).filter(([f, t]) => before[f] !== t)));
    return text(r.count ? `${r.count} change${r.count > 1 ? "s" : ""} in ${r.changed.join(", ")}.` : "Nothing matched.");
  },
);

server.registerTool(
  "intent_rename_sheet",
  { title: "Rename a sheet", description: "Rename a character, place, item or minigame and every whole-word mention of it, keeping case.", inputSchema: { sheet: z.string().describe("The sheet file, e.g. characters/tony.sheet"), new_name: z.string() } },
  async ({ sheet, new_name }) => {
    const before = load();
    const r = renameSheet(before, sheet, new_name);
    save(Object.fromEntries(Object.entries(r.files).filter(([f, t]) => before[f] !== t)), r.to !== sheet ? [sheet] : []);
    return text(`Renamed to ${new_name} (${r.to}). ${r.count} mention${r.count === 1 ? "" : "s"} updated in ${r.changed.join(", ") || "no other files"}.`);
  },
);

server.registerTool(
  "intent_mark_in_step",
  { title: "Mark versions in step", description: "Tell Intent that a script's versions now match, after you updated them yourself.", inputSchema: { script: z.string().describe("The .intent file"), versions: z.array(z.enum(["draft", "renpy"])).describe("Which of Play's neighbours now match Play") } },
  async ({ script, versions }) => {
    const files = load();
    if (files[script] === undefined) throw new Error(`${script} doesn't exist.`);
    let rec = files[SYNC_FILE];
    for (const v of versions as Version[]) {
      if (files[versionFile(script, v)] === undefined) throw new Error(`${script} has no ${v === "draft" ? "Draft" : "Code"} version yet.`);
      rec = markSynced({ ...files, [SYNC_FILE]: rec }, script, pairOf("play", v)!, { play: files[script], [v]: files[versionFile(script, v)] });
    }
    save({ [SYNC_FILE]: rec ?? "{}" });
    return text(`Versions: ${syncLine(load(), script)}`);
  },
);

server.registerTool(
  "intent_save_story_check",
  { title: "Save a story check", description: "Store story problems where Intent shows them (Tools → Story check). Replaces earlier problems for the scripts you list; keeps the writer's dismissals.",
    inputSchema: {
      scripts_checked: z.array(z.string()),
      issues: z.array(z.object({ file: z.string(), line: z.number().int(), quote: z.string().describe("A few exact words from that line"), kind: z.enum(ISSUE_KINDS), severity: z.enum(["high", "medium", "low"]), problem: z.string(), suggestion: z.string() })),
    } },
  async ({ scripts_checked, issues }) => {
    const files = load();
    const c = mergeRun(readChecks(files), scripts_checked, issues);
    save({ [CHECKS_FILE]: writeChecks(c) });
    return text(`Saved ${issues.length} problem${issues.length === 1 ? "" : "s"}. The writer sees them under Tools → Story check.`);
  },
);

server.registerTool(
  "intent_export",
  { title: "Export", description: "Compile the project to Ren'Py and RPG Maker MV files in out/ (or another folder inside the project) and list Intent's problems.", inputSchema: { out: z.string().optional() } },
  async ({ out }) => {
    const files = load();
    const result = compile(files);
    const dir = resolve(root, out ?? "out");
    if (!dir.startsWith(root + sep)) throw new Error("The export folder must be inside the project.");
    // Code versions kept in step with Play go out as they are.
    for (const f of Object.keys(files).filter((n) => n.endsWith(".intent"))) {
      const code = files[versionFile(f, "renpy")];
      if (code !== undefined && inSync(pairState(files, f, "play", "renpy"))) {
        result.files[`renpy/${slug(f.replace(/\.[^.]+$/, ""))}.rpy`] = code;
      }
    }
    for (const [p, t] of Object.entries(result.files)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), t);
    }
    return text(`${Object.keys(result.files).length} files in ${relative(root, dir) || "."}.\n${problems(files)}`);
  },
);

await server.connect(new StdioServerTransport());
