import { useEffect, useRef, useState } from "react";
import { SAMPLES } from "../samples.ts";
import { loadProjects, saveProjects, type Project } from "../storage.ts";

export type Files = Record<string, string>;

/** Every open project. Browser projects save themselves to this device as you type. */
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = loadProjects();
    return saved.length ? saved : SAMPLES.map((s) => structuredClone(s));
  });
  // The newest list, for callbacks that outlive a render (timers, focus, Claude jobs).
  const latest = useRef(projects);
  latest.current = projects;

  useEffect(() => {
    const t = setTimeout(() => saveProjects(projects.filter((p) => !p.folder)), 400);
    return () => clearTimeout(t);
  }, [projects]);

  /** Replace one project's files, or change them from what they are now. */
  const setFiles = (id: string, files: Files | ((now: Files) => Files)) =>
    setProjects((list) => list.map((p) => {
      if (p.id !== id) return p;
      const next = typeof files === "function" ? files(p.files) : files;
      return next === p.files ? p : { ...p, files: next };
    }));

  return { projects, setProjects, latest, setFiles };
}

export const firstScript = (p: Project) => Object.keys(p.files).find((f) => f.endsWith(".intent")) ?? "intent.json";
