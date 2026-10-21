// Saved versions of the open file: save one, compare one with the current text, restore it.

import { useMemo, useState } from "react";
import { diffStats, lineDiff } from "../src/core/diff.ts";
import { KEEP, saveSnapshot, snapshots, type Snapshot } from "./history.ts";
import { Icon } from "./Icon.tsx";

interface Props {
  project: string;
  file: string;
  text: string;
  /** Bumped by the app whenever it saves a snapshot itself. */
  version: number;
  onRestore: (text: string) => void;
}

const when = (t: number) => new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function HistoryPanel({ project, file, text, version, onRestore }: Props) {
  const [bump, setBump] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list = useMemo(() => snapshots(project, file), [project, file, version, bump]);
  const [open, setOpen] = useState<number | null>(null);
  const shown: Snapshot | undefined = open === null ? undefined : list.find((s) => s.at === open);
  const diff = useMemo(() => (shown ? lineDiff(shown.text, text) : []), [shown, text]);

  return (
    <div className="history" data-testid="history">
      <div className="history-head">
        <span className="sec-icon"><Icon name="history" /></span>
        <div>
          <h3>History of {file.split("/").pop()}</h3>
          <p className="muted">Kept on this device: the last {KEEP} versions. One is saved before every Claude conversion.</p>
        </div>
        <button className="primary" onClick={() => { saveSnapshot(project, file, text, "Saved by you"); setBump((b) => b + 1); }}>Save version</button>
      </div>
      {!list.length && <p className="muted empty">No versions yet.</p>}
      <ul className="history-list">
        {list.map((s) => {
          const st = diffStats(lineDiff(s.text, text));
          const same = !st.added && !st.removed;
          return (
            <li key={s.at} className={open === s.at ? "open" : ""}>
              <button className="history-row" onClick={() => setOpen(open === s.at ? null : s.at)} aria-expanded={open === s.at}>
                <span className="history-label">{s.label}</span>
                <span className="muted">{when(s.at)}</span>
                <span className="history-stats">{same ? "same as now" : <><b className="add">+{st.added}</b> <b className="del">−{st.removed}</b></>}</span>
              </button>
              {open === s.at && (
                <div className="history-body">
                  <div className="diff">
                    {diff.map((l, k) => l.op === "same" ? null : (
                      <div key={k} className={`diff-${l.op}`}>{l.op === "add" ? "+ " : "− "}{l.text || " "}</div>
                    ))}
                    {same && <div className="muted">This version matches the current text.</div>}
                  </div>
                  <p className="muted small">Green lines are in the current text only; red lines are in this version only.</p>
                  {!same && (
                    <button onClick={() => { saveSnapshot(project, file, text, "Before restore"); onRestore(s.text); setOpen(null); setBump((b) => b + 1); }}>
                      Restore this version
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
