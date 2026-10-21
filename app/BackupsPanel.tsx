// Whole-project backups kept on this device, plus the one-file project for
// moving work to another device.

import { useEffect, useState } from "react";
import { backupSize, listBackups, type Backup } from "./backups.ts";

interface Props {
  project: string;
  /** Changes whenever a backup is taken, so the list refreshes. */
  version: number;
  onBackUpNow: () => void;
  onRestore: (b: Backup) => void;
  onSaveFile: (b: Backup) => void;
  onSaveProjectFile: () => void;
  onOpenProjectFile: () => void;
}

const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const count = (b: Backup, ext: string, word: string) => {
  const n = Object.keys(b.files).filter((f) => f.endsWith(ext)).length;
  return `${n} ${word}${n === 1 ? "" : "s"}`;
};
const kb = (n: number) => (n < 1024 ? `${n} B` : `${Math.round(n / 1024)} KB`);

export function BackupsPanel({ project, version, onBackUpNow, onRestore, onSaveFile, onSaveProjectFile, onOpenProjectFile }: Props) {
  const [list, setList] = useState<Backup[] | null>(null);
  useEffect(() => {
    listBackups(project).then(setList, () => setList([]));
  }, [project, version]);

  return (
    <div className="backups" data-testid="backups">
      <section className="backup-card">
        <h4>Move to another device</h4>
        <p className="muted">Save the whole project as one <code>.intentproj</code> file, then open it in Intent on your phone or PC. Send it however you like: e-mail, Drive, OneDrive, a cable. Opening a newer copy of the same project replaces it, and the old one stays in Backups.</p>
        <div className="row">
          <button className="primary" onClick={onSaveProjectFile} data-testid="save-project-file">Save project file</button>
          <button onClick={onOpenProjectFile}>Open project file…</button>
        </div>
      </section>
      <div className="backups-head">
        <h4>Backups on this device</h4>
        <button onClick={onBackUpNow}>Back up now</button>
      </div>
      <p className="muted backups-note">Intent backs up the project every ten minutes while you work and keeps the newest 15.</p>
      {list === null ? null : list.length ? (
        <ul className="backup-list">
          {list.map((b) => (
            <li key={b.id}>
              <div>
                <b>{when(b.at)}</b>
                <span className="muted">{count(b, ".intent", "script")} · {count(b, ".sheet", "sheet")} · {kb(backupSize(b))}</span>
              </div>
              <button className="ghost" onClick={() => onSaveFile(b)}>Save file</button>
              <button onClick={() => onRestore(b)}>Restore</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No backups yet. The first one is taken a moment after you start.</p>
      )}
    </div>
  );
}
