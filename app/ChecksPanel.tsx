// Story checks: Claude reads the script (or the whole project) against the
// sheets and lists problems. Each one jumps to its line or can be dismissed.

import { useState } from "react";
import { Icon } from "./Icon.tsx";
import { ISSUE_NAMES, locate, readChecks, type Issue, type Severity } from "../src/core/checks.ts";

const ORDER: Severity[] = ["high", "medium", "low"];
const SEVERITY_NAMES: Record<Severity, string> = { high: "Breaks the story", medium: "A reader would notice", low: "Minor" };

interface Props {
  files: Record<string, string>;
  /** The open script, if a script is open. */
  script: string | null;
  busy: boolean;
  onRun: (whole: boolean) => void;
  onOpen: (file: string, line: number) => void;
  onDismiss: (id: string, dismissed: boolean) => void;
}

const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function ChecksPanel({ files, script, busy, onRun, onOpen, onDismiss }: Props) {
  const [whole, setWhole] = useState(!script);
  const [showDismissed, setShowDismissed] = useState(false);
  const checks = readChecks(files);
  const scope = whole || !script ? Object.keys(files).filter((f) => f.endsWith(".intent")) : [script];
  const all = checks.issues.filter((i) => scope.includes(i.file));
  const dismissed = new Set(checks.dismissed);
  const shown = all.filter((i) => showDismissed || !dismissed.has(i.id));
  const last = Math.min(...scope.map((f) => checks.checked[f] ?? 0));

  return (
    <div className="story-checks" data-testid="checks">
      <div className="checks-head">
        <div className="seg" role="radiogroup" aria-label="What to check">
          <button role="radio" aria-checked={!whole && !!script} className={!whole && script ? "on" : ""} disabled={!script} onClick={() => setWhole(false)}>This script</button>
          <button role="radio" aria-checked={whole || !script} className={whole || !script ? "on" : ""} onClick={() => setWhole(true)}>Whole project</button>
        </div>
        <button className="claude-go" disabled={busy} onClick={() => onRun(whole || !script)} data-testid="run-check">✦ Check story</button>
      </div>
      <p className="muted checks-note">
        {last ? `Last checked ${when(last)}.` : "Not checked yet."} Claude reads {whole || !script ? "every script" : script} against your sheets and lists continuity slips, contradictions, timeline errors, loose threads and names spelled two ways.
      </p>
      {last > 0 && !all.length && <div className="checks-clear"><Icon name="design" size={18} />No problems found.</div>}
      {ORDER.map((sev) => {
        const list = shown.filter((i) => i.severity === sev);
        if (!list.length) return null;
        return (
          <section key={sev} className={`checks-group sev-${sev}`}>
            <h4><i className="sev-dot" />{SEVERITY_NAMES[sev]}<span className="muted">{list.length}</span></h4>
            {list.map((i) => <IssueCard key={i.id} issue={i} line={locate(files[i.file], i)} dismissed={dismissed.has(i.id)} onOpen={onOpen} onDismiss={onDismiss} showFile={whole || !script} />)}
          </section>
        );
      })}
      {all.some((i) => dismissed.has(i.id)) && (
        <button className="ghost checks-toggle" onClick={() => setShowDismissed(!showDismissed)}>
          {showDismissed ? "Hide dismissed" : `Show dismissed (${all.filter((i) => dismissed.has(i.id)).length})`}
        </button>
      )}
    </div>
  );
}

function IssueCard({ issue: i, line, dismissed, onOpen, onDismiss, showFile }: { issue: Issue; line: number | null; dismissed: boolean; onOpen: Props["onOpen"]; onDismiss: Props["onDismiss"]; showFile: boolean }) {
  return (
    <article className={`issue ${dismissed ? "dismissed" : ""}`}>
      <div className="issue-meta">
        <span className={`issue-kind k-${i.kind}`}>{ISSUE_NAMES[i.kind]}</span>
        <span className="muted">{showFile ? `${i.file} · ` : ""}{line ? `line ${line}` : "text has changed since"}</span>
      </div>
      <p className="issue-problem">{i.problem}</p>
      {i.quote && <blockquote>{i.quote}</blockquote>}
      {i.suggestion && <p className="issue-fix"><b>Try:</b> {i.suggestion}</p>}
      <div className="issue-actions">
        {line && <button onClick={() => onOpen(i.file, line)}>Go to line</button>}
        <button className="ghost" onClick={() => onDismiss(i.id, !dismissed)}>{dismissed ? "Bring back" : "Dismiss"}</button>
      </div>
    </article>
  );
}
