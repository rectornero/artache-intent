import { pack, unpack } from "../../src/core/pack.ts";
import { sameFiles, type Backup } from "../backups.ts";
import { CLAUDE_FILES } from "../claudeCode.ts";
import { newProject } from "../samples.ts";
import { isTauri, openFolder, openProjectFile, pickFolder, saveProjectFile, writeFolder, type Project } from "../storage.ts";
import type { Files } from "./useProjects.ts";
import type { Say } from "./useToast.ts";


// Projects in and out: project files, folders, backups, and new projects.
export function useProjectIO(c: {
  project: Project; projects: Project[]; latest: { current: Project[] };
  setProjects: (f: (list: Project[]) => Project[]) => void; setFiles: (id: string, files: Files) => void;
  open: (p: Project) => void; onDisk: (id: string, files: Files) => void; backUpBefore: (p: Project) => void; say: Say;
}) {
  const { project, say } = c;
  const add = (p: Project) => {
    c.setProjects((l) => [...l.filter((x) => x.id !== p.id), p]);
    c.open(p);
  };

  const replaceFiles = (id: string, files: Files, done: string) => {
    const before = c.latest.current.find((x) => x.id === id);
    if (!before) return;
    c.backUpBefore(before);
    c.setFiles(id, files);
    say(done, 10000, { label: "Undo", run: () => c.setFiles(id, before.files) });
  };
  const restoreBackup = (b: Backup) => {
    if (sameFiles(b.files, project.files)) return say("The project is already exactly like this backup.");
    replaceFiles(project.id, b.files, `Restored the backup from ${new Date(b.at).toLocaleString()}. The text before it is the newest backup.`);
  };
  const saveAsProjectFile = async (files: Files, name = project.name) => {
    const data = await pack({ id: project.id.startsWith("folder:") ? `p${Date.now()}` : project.id, name, savedAt: Date.now(), app: __APP_VERSION__ }, files);
    if (await saveProjectFile(name, data)) say(isTauri() ? "Project file saved." : "Project file downloaded.");
  };
  const openProject = async (given?: Uint8Array) => {
    let got: Awaited<ReturnType<typeof unpack>>;
    try {
      const data = given ?? (await openProjectFile());
      if (!data) return;
      got = await unpack(data);
    } catch (e) {
      return say(e instanceof Error ? e.message : String(e), 6000);
    }
    const same = c.latest.current.find((p) => p.id === got.meta.id);
    if (same) {
      c.open(same);
      if (sameFiles(same.files, got.files)) return say(`${same.name} is already up to date.`);
      return replaceFiles(same.id, got.files, `${same.name} replaced by the project file${got.meta.savedAt ? ` saved ${new Date(got.meta.savedAt).toLocaleString()}` : ""}. The old one is in Backups.`);
    }
    add({ id: got.meta.id, name: got.meta.name, files: got.files });
    say(`Opened ${got.meta.name}.`);
  };
  const openFolderProject = async () => {
    const p = await openFolder();
    if (!p) return;
    c.onDisk(p.id, p.files);
    add(p);
  };
  const keepInFolder = async () => {
    const dir = await pickFolder("Keep this project in a folder");
    if (!dir) return;
    try {
      await writeFolder(dir, project.files);
    } catch {
      return say("Couldn't write to that folder.", 6000);
    }
    const moved: Project = { ...project, id: `folder:${dir}`, folder: dir };
    c.onDisk(moved.id, project.files);
    c.setProjects((l) => [...l.filter((x) => x.id !== project.id && x.id !== moved.id), moved]);
    c.open(moved);
    say(`${project.name} now lives in ${dir.split(/[\\/]/).pop()} and saves there as you type.`, 8000);
  };
  const setUpClaudeCode = async () => {
    if (!project.folder) return;
    try {
      await writeFolder(project.folder, CLAUDE_FILES);
      say("CLAUDE.md is in the project folder. Open the folder in Claude Code and ask away; Intent picks up its edits when you come back.", 12000);
    } catch {
      say("Couldn't write to the project folder.", 6000);
    }
  };
  const addProject = () => {
    const name = prompt("Project name", "My game");
    if (name) add(newProject(name));
  };

  return { restoreBackup, saveAsProjectFile, openProject, openFolderProject, keepInFolder, setUpClaudeCode, addProject };
}

