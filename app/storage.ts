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

export async function openFolder(): Promise<Project | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const fs = await import("@tauri-apps/plugin-fs");
  const dir = await open({ directory: true });
  if (typeof dir !== "string") return null;
  const files: Record<string, string> = {};
  // Scripts and settings at the top, sheets one folder down (characters/, places/...).
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
  files["intent.json"] ??= JSON.stringify({ name: dir.split(/[\\/]/).pop() }, null, 2);
  return { id: `folder:${dir}`, name: dir.split(/[\\/]/).pop() ?? dir, files, folder: dir };
}

export async function saveToFolder(p: Project) {
  if (!p.folder) return;
  const fs = await import("@tauri-apps/plugin-fs");
  for (const [name, text] of Object.entries(p.files)) {
    if (name.includes("/")) await fs.mkdir(`${p.folder}/${name.slice(0, name.lastIndexOf("/"))}`, { recursive: true });
    await fs.writeTextFile(`${p.folder}/${name}`, text);
  }
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
