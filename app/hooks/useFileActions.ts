import { deleteFile, renameScript, renameSheet, type ReplaceResult } from "../../src/core/search.ts";
import { newSheet, sheetFileName, SHEET_HEAD, SHEET_KINDS, type SheetKind } from "../../src/core/sheets.ts";
import { versionFile, versionOf, VERSION_FILE, VERSIONS, type Version } from "../../src/core/sync.ts";
import type { CompileResult } from "../../src/project.ts";
import { saveSnapshot } from "../history.ts";
import type { Project } from "../storage.ts";
import type { Files } from "./useProjects.ts";
import type { Say } from "./useToast.ts";

// Find, replace, rename and delete: whole-project changes, each saved to History first and undoable.
export function useFileActions(c: {
  project: Project; file: string; ok: CompileResult | null; cursorLine: number; sheetFile: string | null;
  setFiles: (id: string, files: Files | ((now: Files) => Files)) => void; say: Say; bumpHistory: () => void;
  setFileName: (f: string) => void; setSheetFile: (f: string | null) => void; openSheet: (f: string) => void;
  setLayer: (v: Version) => void;
}) {
  const { project, file, ok, say } = c;
  const setFile = (name: string, text: string) => c.setFiles(project.id, (now) => ({ ...now, [name]: text }));
  const sheetName = (f: string) => ok?.sheets.find((x) => x.file === f)?.sheet.name;
  // A file that moved: whatever showed it follows.
  const moved = (from: string, to: string | null) => {
    if (c.sheetFile === from) c.setSheetFile(to);
    if (file === from && to) c.setFileName(to);
  };

  const changeFiles = (files: Files, before: Files, changed: string[], label: string, done: string) => {
    for (const f of changed) if (before[f] !== undefined) saveSnapshot(project.id, f, before[f], label);
    c.bumpHistory();
    const id = project.id;
    c.setFiles(id, files);
    say(done, 8000, { label: "Undo", run: () => c.setFiles(id, before) });
  };
  const applyReplace = (r: ReplaceResult, label: string) =>
    changeFiles(r.files, project.files, r.changed, `Before: ${label}`, `${label}: ${r.count} change${r.count > 1 ? "s" : ""} in ${r.changed.length} file${r.changed.length > 1 ? "s" : ""}.`);
  const renameSheetTo = (f: string, name: string): boolean => {
    const old = sheetName(f) ?? f;
    try {
      const r = renameSheet(project.files, f, name);
      changeFiles(r.files, project.files, [f, ...r.changed], `Before renaming ${old}`, r.count ? `Renamed ${old} to ${name}. ${r.count} mention${r.count > 1 ? "s" : ""} updated.` : `Renamed ${old} to ${name}.`);
      moved(f, r.to);
      return true;
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), 6000);
      return false;
    }
  };
  const renameAny = (f: string) => {
    if (f.endsWith(".sheet")) {
      const old = sheetName(f) ?? "";
      const n = prompt("New name. Every script and sheet that mentions it follows.", old);
      if (n?.trim() && n.trim() !== old) renameSheetTo(f, n.trim());
      return;
    }
    const n = prompt("New script file name", f)?.trim();
    if (!n || n === f) return;
    const to = n.endsWith(".intent") ? n : `${n}.intent`;
    try {
      changeFiles(renameScript(project.files, f, to), project.files, [], "", `Renamed ${f} to ${to}.`);
      if (file === f) c.setFileName(to);
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), 6000);
    }
  };
  const deleteAny = (f: string) => {
    const name = f.endsWith(".sheet") ? (sheetName(f) ?? f) : f;
    if (!confirm(f.endsWith(".intent") ? `Delete ${name} with its other versions?` : `Delete the sheet ${name}?`)) return;
    const gone = Object.keys(project.files).filter((x) => x === f || (f.endsWith(".intent") && VERSIONS.some((v) => x === versionFile(f, v))));
    changeFiles(deleteFile(project.files, f), project.files, gone, "Before delete", `Deleted ${name}.`);
    if (c.sheetFile === f) c.setSheetFile(null);
  };

  // Change what a sheet is (a Place that was really a Character): same fields, new kind and file.
  const changeKind = (f: string, kind: SheetKind) => {
    const name = sheetName(f);
    if (!name) return;
    const to = sheetFileName(kind, name);
    const text = project.files[f].replace(/^(\s*)@\w+/, `$1@${kind}`);
    c.setFiles(project.id, (now) => {
      const files = { ...now };
      delete files[f];
      files[to] = text;
      return files;
    });
    moved(f, to);
    say(`${name} is now a ${SHEET_KINDS[kind].label}`);
  };
  const createSheet = (kind: SheetKind, name: string, open = true) => {
    const f = sheetFileName(kind, name);
    if (project.files[f] === undefined) setFile(f, newSheet(kind, name, file.endsWith(".intent") ? `First written about in ${file}, line ${c.cursorLine}.` : undefined));
    if (open) c.openSheet(f);
    say(`${SHEET_KINDS[kind].label} sheet: ${name}`);
  };

  // Names the writer turned back into plain text (false positives), kept in intent.json.
  const setNoLink = (name: string, on: boolean) => {
    const settings = JSON.parse(project.files["intent.json"] || "{}");
    const list: string[] = (settings.noLink ?? []).filter((n: string) => n.toLowerCase() !== name.toLowerCase());
    if (on) list.push(name);
    settings.noLink = list;
    setFile("intent.json", JSON.stringify(settings, null, 2));
  };

  const addScript = () => {
    const name = prompt("New script file name", "chapter.intent");
    if (!name) return;
    const n = name.endsWith(".intent") ? name : `${name}.intent`;
    setFile(n, "# New chapter\n## First scene\n\n");
    c.setFileName(n);
  };
  // Files picked from disk join the current project; sheets go to their kind's folder.
  const addFiles = (incoming: Files) => {
    const named = Object.entries(incoming).map(([n, text]) => {
      const kind = text.trimStart().split("\n")[0].trim().match(SHEET_HEAD);
      return [kind ? sheetFileName(kind[1] as SheetKind, kind[2].trim()) : n, text] as const;
    });
    if (!named.length) return;
    // A saved Draft (or other version) opens as that version of its script, which it gets if it has none.
    const play = (n: string) => (VERSION_FILE.test(n) ? n.replace(VERSION_FILE, ".intent") : n);
    c.setFiles(project.id, (now) => {
      const next = { ...now, ...Object.fromEntries(named) };
      for (const [n] of named) if (next[play(n)] === undefined) next[play(n)] = "";
      return next;
    });
    c.setFileName(play(named[0][0]));
    const v = versionOf(named[0][0]);
    if (v && v !== "play") c.setLayer(v);
    say(named.length > 1 ? `Opened ${named.length} files` : `Opened ${named[0][0].split("/").pop()}`);
  };

  return { setFile, changeFiles, applyReplace, renameSheetTo, renameAny, deleteAny, changeKind, createSheet, setNoLink, addScript, addFiles };
}
