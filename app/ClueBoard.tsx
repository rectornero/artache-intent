// The mystery kit: every clue and where it shows up, every suspect and their alibi,
// and what still looks unfinished. Built from the sheets and scripts; nothing is stored.

import { useState } from "react";
import type { Board, BoardClue } from "../src/core/mystery.ts";
import { Icon } from "./Icon.tsx";

const HOLDS_CLASS: Record<string, string> = { Holds: "good", Shaky: "warn", False: "bad", Unchecked: "" };

export function ClueBoard({ board, onOpenSheet, onOpen, onNewClue }: {
  board: Board; onOpenSheet: (file: string) => void; onOpen: (file: string, line: number) => void; onNewClue: () => void;
}) {
  const [by, setBy] = useState<"clue" | "suspect">("clue");
  const { clues, suspects, warnings } = board;
  return (
    <div className="clue-board" data-testid="clue-board">
      <div className="checks-head">
        <div className="seg" role="radiogroup" aria-label="Show">
          <button role="radio" aria-checked={by === "clue"} className={by === "clue" ? "on" : ""} onClick={() => setBy("clue")}>Clues <span className="muted">{clues.length}</span></button>
          <button role="radio" aria-checked={by === "suspect"} className={by === "suspect" ? "on" : ""} onClick={() => setBy("suspect")}>Suspects <span className="muted">{suspects.length}</span></button>
        </div>
        <button className="ghost" onClick={onNewClue}>+ clue</button>
      </div>
      {!clues.length && !suspects.length && (
        <p className="muted checks-note">
          No clues yet. Add a Clue sheet (or an Item whose type is Clue or Evidence), say who it points to, and it shows here with every scene that mentions it.
          Characters with the role Suspect, or an alibi, show under Suspects.
        </p>
      )}
      {warnings.length > 0 && (
        <section className="checks-group sev-medium">
          <h4><i className="sev-dot" />Still open<span className="muted">{warnings.length}</span></h4>
          <ul className="clue-warnings">
            {warnings.map((w, k) => <li key={k}><button className="link" onClick={() => onOpenSheet(w.file)}>{w.message}</button></li>)}
          </ul>
        </section>
      )}
      {by === "clue" ? clues.map((c) => <ClueCard key={c.file} clue={c} onOpenSheet={onOpenSheet} onOpen={onOpen} />) : suspects.map((s) => (
        <article key={s.file} className="issue clue-card k-character">
          <div className="issue-meta">
            <button className="clue-name" onClick={() => onOpenSheet(s.file)}><Icon name="character" size={14} />{s.name}</button>
            {s.role && <span className="issue-kind">{s.role}</span>}
            <span className={`chip holds ${HOLDS_CLASS[s.alibiHolds] ?? ""}`}>Alibi: {s.alibiHolds.toLowerCase()}</span>
          </div>
          <dl>
            <dt>Alibi</dt><dd>{s.alibi || <span className="muted">Not written yet</span>}</dd>
            {s.knows && <><dt>Knows</dt><dd>{s.knows}</dd></>}
            <dt>Clues against</dt><dd>{s.clues.length ? s.clues.join(", ") : <span className="muted">None</span>}</dd>
          </dl>
        </article>
      ))}
    </div>
  );
}

function ClueCard({ clue: c, onOpenSheet, onOpen }: { clue: BoardClue; onOpenSheet: (file: string) => void; onOpen: (file: string, line: number) => void }) {
  return (
    <article className={`issue clue-card k-clue ${c.herring !== "No" ? "herring" : ""}`}>
      <div className="issue-meta">
        <button className="clue-name" onClick={() => onOpenSheet(c.file)}><Icon name="clue" size={14} />{c.name}</button>
        {c.kind !== "clue" && <span className="issue-kind">{c.kind}</span>}
        {c.herring !== "No" && <span className="chip warn">{c.herring === "Yes" ? "Red herring" : "Partly a red herring"}</span>}
      </div>
      <dl>
        <dt>Points to</dt><dd>{c.pointsTo || <span className="muted">Nobody yet</span>}</dd>
        {c.truth && <><dt>Really means</dt><dd>{c.truth}</dd></>}
        {c.foundAt && <><dt>Found at</dt><dd>{c.foundAt}</dd></>}
        {c.knownBy.length > 0 && <><dt>Known by</dt><dd>{c.knownBy.join(", ")}</dd></>}
        <dt>In the story</dt>
        <dd>
          {c.scenes.length ? (
            <span className="clue-scenes">
              {c.scenes.map((s, k) => <button key={k} className="chip" title={s.file} onClick={() => onOpen(s.file, s.line)}>{k === 0 ? "First: " : ""}{s.title}</button>)}
            </span>
          ) : <span className="muted">Not mentioned in any script yet</span>}
        </dd>
      </dl>
    </article>
  );
}
