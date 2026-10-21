// Claude without an API key: the job is copied as one message for the Claude
// app or Claude Code, and the answer is pasted back here.

import { useState } from "react";
import { handoffText, type Job } from "./claude.ts";

interface Props {
  job: Job<unknown>;
  onAnswer: (value: unknown) => void;
  onCancel: () => void;
  /** Offered when the writer has a key but chose copy and paste for this one. */
  onUseKey?: () => void;
}

export function HandoffModal({ job, onAnswer, onCancel, onUseKey }: Props) {
  const [copied, setCopied] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const text = handoffText(job);
  const kb = Math.max(1, Math.round(new Blob([text]).size / 1024));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError("This device didn't allow copying. Use Save as file instead.");
    }
  };
  const save = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    a.download = `${job.title.replace(/[^\w-]+/g, "-").toLowerCase()}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const use = () => {
    try {
      onAnswer(job.readPasted(answer));
    } catch {
      setError("That answer couldn't be read. Paste Claude's whole reply, including the ``` block.");
    }
  };

  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal handoff" role="dialog" aria-label="Ask Claude by copy and paste" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>✦ {job.title}</h2>
          <button className="icon" onClick={onCancel} aria-label="Close">✕</button>
        </div>
        <ol className="handoff-steps">
          <li>
            <b>Copy the request</b>
            <span className="muted">About {kb} KB: the task, your sheets and the text.</span>
            <div className="row">
              <button className="primary" onClick={() => void copy()} data-testid="handoff-copy">{copied ? "Copied ✓" : "Copy request"}</button>
              <button onClick={save}>Save as file</button>
            </div>
          </li>
          <li>
            <b>Paste it into Claude</b>
            <span className="muted">The Claude app, claude.ai, or Claude Code all work. Send it and wait for the answer.</span>
            <div className="row"><a className="btn" href="https://claude.ai/new" target="_blank" rel="noreferrer">Open claude.ai</a></div>
          </li>
          <li>
            <b>Paste Claude's answer here</b>
            <textarea value={answer} onChange={(e) => { setAnswer(e.target.value); setError(""); }} placeholder="Paste Claude's whole reply" rows={6} data-testid="handoff-answer" />
          </li>
        </ol>
        {error && <p className="handoff-error">{error}</p>}
        <div className="modal-actions">
          {onUseKey && <button className="ghost" onClick={onUseKey}>Use my API key instead</button>}
          <span className="spacer" />
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={!answer.trim()} onClick={use} data-testid="handoff-use">Use answer</button>
        </div>
      </div>
    </div>
  );
}
