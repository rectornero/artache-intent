import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { EVERY_MS, saveBackup } from "../backups.ts";
import type { Project } from "../storage.ts";
import type { Say } from "./useToast.ts";

// Backups: every project, at most every ten minutes, only when something changed.
export function useBackups(latest: MutableRefObject<Project[]>, say: Say) {
  const [backupVersion, setBackupVersion] = useState(0);
  const lastBackup = useRef<Record<string, number>>({});
  const backUp = async (p: Project, force = false) => {
    if (!force && Date.now() - (lastBackup.current[p.id] ?? 0) < EVERY_MS) return;
    lastBackup.current[p.id] = Date.now();
    try {
      if (await saveBackup(p.id, p.name, p.files)) setBackupVersion((v) => v + 1);
      else if (force) say("Nothing new since the last backup.");
    } catch {
      if (force) say("This device didn't allow a backup. Save a project file instead.", 8000);
    }
  };
  useEffect(() => {
    const tick = () => latest.current.forEach((p) => void backUp(p));
    const first = setTimeout(tick, 5000);
    const t = setInterval(tick, 60_000);
    return () => (clearTimeout(first), clearInterval(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** A backup taken right before the whole project is replaced. */
  const backUpBefore = (p: Project) => void saveBackup(p.id, p.name, p.files).then(() => setBackupVersion((v) => v + 1), () => undefined);
  return { backupVersion, backUp, backUpBefore };
}
