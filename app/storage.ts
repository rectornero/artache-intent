// Projects live in the browser (or the app's webview) by default. On desktop and
// Android the Tauri build can also open and save a real folder.

import JSZip from "jszip";

export interface Project {
  id: string;
  name: string;
  /** file name -> text; always includes intent.json */
  files: Record<string, string>;
  /** Set when the project was opened from a folder on disk (Tauri only). */
  folder?: string;
}

const KEY = "intent.projects.v1";

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Called once when the device refuses to save (storage full or blocked). */
let onSaveFailed: (() => void) | null = null;
export const whenSaveFails = (f: () => void) => (onSaveFailed = f);

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or storage full: work stays in memory for this session, and the writer is told.
    onSaveFailed?.();
    onSaveFailed = null;
  }
}

export function loadProjects(): Project[] {
  try {
    return JSON.parse(safeGet(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveProjects(list: Project[]) {
  safeSet(KEY, JSON.stringify(list));
}

export function loadPrefs<T>(fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(safeGet("intent.ui") ?? "{}") };
  } catch {
    return fallback;
  }
}

export function savePrefs<T>(p: T) {
  safeSet("intent.ui", JSON.stringify(p));
}

/** Every Intent file in a project folder: scripts and settings at the top, sheets one folder down. */
export async function readFolder(dir: string): Promise<Record<string, string>> {
  const fs = await import("@tauri-apps/plugin-fs");
  const files: Record<string, string> = {};
  const read = async (rel: string, depth: number) => {
    for (const e of await fs.readDir(rel ? `${dir}/${rel}` : dir)) {
      const name = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory && depth === 0 && !e.name.startsWith(".") && e.name !== "out") await read(name, 1);
      else if (e.isFile && (e.name.endsWith(".intent") || e.name.endsWith(".sheet") || /\.(draft|rpy)$/.test(e.name) || name === "intent.json" || name === "intent.sync.json" || name === "intent.checks.json")) files[name] = await fs.readTextFile(`${dir}/${name}`);
    }
  };
  await read("", 0);
  // Draft and Code versions only belong to a script next to them; other .rpy files aren't Intent's.
  for (const n of Object.keys(files)) if (/\.(draft|rpy)$/.test(n) && files[n.replace(/\.(draft|rpy)$/, ".intent")] === undefined) delete files[n];
  return files;
}

export async function openFolder(): Promise<Project | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const dir = await open({ directory: true });
  if (typeof dir !== "string") return null;
  const files = await readFolder(dir);
  files["intent.json"] ??= JSON.stringify({ name: dir.split(/[\\/]/).pop() }, null, 2);
  return { id: `folder:${dir}`, name: dir.split(/[\\/]/).pop() ?? dir, files, folder: dir };
}

/** Writes the given files, and removes the ones Intent deleted. */
export async function writeFolder(dir: string, files: Record<string, string>, removed: string[] = []) {
  const fs = await import("@tauri-apps/plugin-fs");
  for (const [name, text] of Object.entries(files)) {
    if (name.includes("/")) await fs.mkdir(`${dir}/${name.slice(0, name.lastIndexOf("/"))}`, { recursive: true });
    await fs.writeTextFile(`${dir}/${name}`, text);
  }
  for (const name of removed) await fs.remove(`${dir}/${name}`).catch(() => undefined);
}

export async function saveToFolder(p: Project) {
  if (p.folder) await writeFolder(p.folder, p.files);
}

/** Pick an empty or existing folder to keep a project in. */
export async function pickFolder(title: string): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const dir = await open({ directory: true, title });
  return typeof dir === "string" ? dir : null;
}

function download(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Save one script or sheet as its own file: a save dialog in the app, a download in the browser. */
export async function saveFileAs(name: string, text: string): Promise<boolean> {
  const base = name.split("/").pop()!;
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const fs = await import("@tauri-apps/plugin-fs");
    const ext = base.split(".").pop()!;
    const path = await save({ defaultPath: base, filters: [{ name: ext === "sheet" ? "Intent sheet" : "Intent script", extensions: [ext] }] });
    if (!path) return false;
    await fs.writeTextFile(path, text);
    return true;
  }
  download(base, new Blob([text], { type: "text/plain;charset=utf-8" }));
  return true;
}

/** Pick .intent / .sheet files from disk and return them by name. */
export async function openFiles(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const fs = await import("@tauri-apps/plugin-fs");
    const picked = await open({ multiple: true, filters: [{ name: "Intent files", extensions: ["intent", "sheet"] }] });
    for (const p of Array.isArray(picked) ? picked : picked ? [picked] : []) out[p.split(/[\\/]/).pop()!] = await fs.readTextFile(p);
    return out;
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".intent,.sheet";
    input.onchange = async () => {
      for (const f of Array.from(input.files ?? [])) out[f.name] = await f.text();
      resolve(out);
    };
    input.click();
  });
}

/** The file the desktop app was opened with, if any. */
export async function launchFile(): Promise<{ name: string; text: string } | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const r = await invoke<[string, string] | null>("opened_file").catch(() => null);
  return r ? { name: r[0].split(/[\\/]/).pop()!, text: r[1] } : null;
}

/** The project file the desktop app was opened with (double-click on .intentproj), if any. */
export async function launchProject(): Promise<Uint8Array | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const path = await invoke<string | null>("opened_project").catch(() => null);
  if (!path) return null;
  const fs = await import("@tauri-apps/plugin-fs");
  return fs.readFile(path);
}

/** Open a web page in the system browser (a new tab in the browser version). */
export async function openExternal(url: string) {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    return openUrl(url);
  }
  window.open(url, "_blank", "noopener");
}

/** Exports: a folder on desktop/Android, a zip download in the browser. */
export async function deliverExport(name: string, files: Record<string, string>) {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const fs = await import("@tauri-apps/plugin-fs");
    const dir = await open({ directory: true, title: "Export to folder" });
    if (typeof dir !== "string") return;
    for (const [path, text] of Object.entries(files)) {
      const full = `${dir}/${path}`;
      await fs.mkdir(full.slice(0, full.lastIndexOf("/")), { recursive: true });
      await fs.writeTextFile(full, text);
    }
    return;
  }
  const zip = new JSZip();
  for (const [path, text] of Object.entries(files)) zip.file(path, text);
  download(`${name.replace(/[^\w-]+/g, "-")}-export.zip`, await zip.generateAsync({ type: "blob" }));
}

/** Save a whole project as one .intentproj file: a save dialog in the app, a download in the browser. */
export async function saveProjectFile(name: string, data: Uint8Array): Promise<boolean> {
  const base = `${name.replace(/[^\w -]+/g, "").trim() || "project"}.intentproj`;
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const fs = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: base, filters: [{ name: "Intent project", extensions: ["intentproj"] }] });
    if (!path) return false;
    await fs.writeFile(path, data);
    return true;
  }
  download(base, new Blob([data as BlobPart], { type: "application/zip" }));
  return true;
}

/** Pick a .intentproj file; null if none was picked. */
export async function openProjectFile(): Promise<Uint8Array | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const fs = await import("@tauri-apps/plugin-fs");
    const path = await open({ filters: [{ name: "Intent project", extensions: ["intentproj", "zip"] }] });
    return typeof path === "string" ? fs.readFile(path) : null;
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".intentproj,.zip";
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? new Uint8Array(await f.arrayBuffer()) : null);
    };
    input.click();
  });
}

/** Every file under a game folder (relative paths), skipping Ren'Py's caches and saves. */
export async function listFolderFiles(dir: string): Promise<string[]> {
  const fs = await import("@tauri-apps/plugin-fs");
  const out: string[] = [];
  const skip = new Set(["cache", "saves", ".git", "node_modules", "__pycache__", "tmp"]);
  const walk = async (rel: string, depth: number) => {
    if (depth > 8 || out.length > 20000) return;
    for (const e of await fs.readDir(rel ? `${dir}/${rel}` : dir)) {
      const name = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory && !skip.has(e.name)) await walk(name, depth + 1);
      else if (e.isFile) out.push(name);
    }
  };
  await walk("", 0);
  return out;
}

/** A displayable URL for a file on disk (for previews). Revoke it when done. */
export async function fileUrl(path: string): Promise<string> {
  const fs = await import("@tauri-apps/plugin-fs");
  return URL.createObjectURL(new Blob([(await fs.readFile(path)) as BlobPart]));
}

/** In the browser: pick a folder and get its files by relative path (nothing is uploaded). */
export function pickFolderFiles(): Promise<Map<string, File> | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.setAttribute("webkitdirectory", "");
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      resolve(files.length ? new Map(files.map((f) => [f.webkitRelativePath || f.name, f])) : null);
    };
    input.click();
  });
}

const GAME_KEY = "intent.gameFolders";
/** The game folder linked to each project, on this device only (paths differ between devices). */
export function gameFolderOf(project: string): string | null {
  try {
    return JSON.parse(safeGet(GAME_KEY) ?? "{}")[project] ?? null;
  } catch {
    return null;
  }
}
export function setGameFolder(project: string, dir: string | null) {
  let all: Record<string, string> = {};
  try {
    all = JSON.parse(safeGet(GAME_KEY) ?? "{}");
  } catch {
    // Start over.
  }
  if (dir) all[project] = dir;
  else delete all[project];
  safeSet(GAME_KEY, JSON.stringify(all));
}
