import { useEffect, useRef, type MutableRefObject } from "react";
import { diskChanges, mergeDisk } from "../../src/core/folder.ts";
import { saveSnapshot } from "../history.ts";
import { readFolder, writeFolder, type Project } from "../storage.ts";
import type { Files } from "./useProjects.ts";
import type { Say } from "./useToast.ts";

// Folder projects save themselves to disk as you type. `disk` remembers each file as it is
// on disk, so edits made outside Intent (Claude Code, another editor) can be told apart.
export function useFolderSync(projects: Project[], latest: MutableRefObject<Project[]>, project: Project, setFiles: (id: string, files: Files) => void, say: Say) {
  const disk = useRef<Record<string, Files>>({});
  useEffect(() => {
    const t = setTimeout(() => {
      for (const p of projects.filter((x) => x.folder)) {
        const base = (disk.current[p.id] ??= {});
        const { changed, removed } = diskChanges(base, p.files);
        if (!Object.keys(changed).length && !removed.length) continue;
        writeFolder(p.folder!, changed, removed).then(
          () => {
            Object.assign(base, changed);
            for (const f of removed) delete base[f];
          },
          () => say("Couldn't save to the project folder. Is it still there?", 8000),
        );
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  // Coming back to Intent: take what changed on disk. A file edited both here and on disk keeps
  // Intent's text (it saves over the disk copy), and the toast says so.
  const reloadFolder = async (p: Project, quiet = true) => {
    if (!p.folder) return;
    let onDisk: Files;
    try {
      onDisk = await readFolder(p.folder);
    } catch {
      return quiet ? undefined : say("Couldn't read the project folder.", 6000);
    }
    const cur = latest.current.find((x) => x.id === p.id);
    if (!cur) return;
    const { files, base, taken, both } = mergeDisk(disk.current[p.id] ?? {}, cur.files, onDisk);
    disk.current[p.id] = base;
    if (taken.length) setFiles(p.id, files);
    if (both.length) say(`${both.join(", ")} changed both here and on disk. Intent kept its own text; the disk copy is in History.`, 10000);
    else if (taken.length) say(`Picked up ${taken.length} change${taken.length > 1 ? "s" : ""} from the folder.`, 5000);
    else if (!quiet) say("Already up to date with the folder.");
    for (const f of both) saveSnapshot(p.id, f, onDisk[f], "On disk, edited outside Intent");
  };
  useEffect(() => {
    if (!project.folder) return;
    const onFocus = () => void reloadFolder(project);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.folder]);

  /** A project that now lives in a folder: what's on disk is exactly `files`. */
  const onDisk = (id: string, files: Files) => (disk.current[id] = { ...files });
  return { reloadFolder, onDisk };
}
