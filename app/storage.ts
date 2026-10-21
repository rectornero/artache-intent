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

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: work stays in memory for this session */
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
  for (const e of await fs.readDir(dir)) {
    if (e.isFile && (e.name.endsWith(".intent") || e.name === "intent.json")) files[e.name] = await fs.readTextFile(`${dir}/${e.name}`);
  }
  files["intent.json"] ??= JSON.stringify({ name: dir.split(/[\\/]/).pop() }, null, 2);
  return { id: `folder:${dir}`, name: dir.split(/[\\/]/).pop() ?? dir, files, folder: dir };
}

export async function saveToFolder(p: Project) {
  if (!p.folder) return;
  const fs = await import("@tauri-apps/plugin-fs");
  for (const [name, text] of Object.entries(p.files)) await fs.writeTextFile(`${p.folder}/${name}`, text);
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
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[^\w-]+/g, "-")}-export.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
