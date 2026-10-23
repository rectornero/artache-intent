// Word count and goals under the text: this version, the whole project, and today.

import { useEffect, useRef, useState } from "react";
import type { Goals } from "../src/core/words.ts";

const fmt = (n: number) => n.toLocaleString();
const today = () => new Date().toLocaleDateString("en-CA");

/**
 * Words the writer typed today on this device, per project. Only their own edits
 * count: a Draft made from Play, or Claude's writing, is not "written today".
 */
export function useTodayWords(projectId: string) {
  const key = `artache-intent.words-today.${projectId}`;
  const read = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      return saved?.date === today() ? Number(saved.written) || 0 : 0;
    } catch {
      return 0;
    }
  };
  const [written, setWritten] = useState(read);
  useEffect(() => setWritten(read()), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = (delta: number) => {
    if (!delta) return;
    const next = read() + delta;
    try {
      localStorage.setItem(key, JSON.stringify({ date: today(), written: next }));
    } catch {
      // A device that won't store this still counts for this session.
    }
    setWritten(next);
  };
  return { written, add };
}

export function WordBar({ projectId, here, hereLabel, total, written, goals, onGoals, onReached }: {
  projectId: string; here: number | null; hereLabel: string; total: number | null; written: number; goals: Goals;
  onGoals: () => void; onReached: (msg: string) => void;
}) {
  const cheered = useRef("");
  useEffect(() => {
    const mark = `${projectId}|${today()}`;
    if (goals.daily && written >= goals.daily && cheered.current !== mark) {
      cheered.current = mark;
      onReached(`Today's goal of ${fmt(goals.daily)} words reached. Nice work.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [written >= (goals.daily ?? Infinity)]);
  if (total === null) return null;
  const pct = (n: number, of?: number) => (of ? Math.min(100, Math.round((n / of) * 100)) : 0);
  return (
    <div className="word-bar" data-testid="word-bar">
      {here !== null && <span title={`Words in this ${hereLabel}`}><b>{fmt(here)}</b> words in this {hereLabel}</span>}
      <span className="wb-project" title="Each script's Draft, or its Play where there is no Draft">
        Project <b>{fmt(total)}</b>{goals.words ? <> of {fmt(goals.words)}<Meter value={pct(total, goals.words)} /></> : ""}
      </span>
      <span className="wb-today" title="Words you typed today in this project, on this device">
        Today <b>{written >= 0 ? "+" : "−"}{fmt(Math.abs(written))}</b>{goals.daily ? <> of {fmt(goals.daily)}<Meter value={pct(Math.max(0, written), goals.daily)} /></> : ""}
      </span>
      <button className="ghost" onClick={onGoals} data-testid="goals">{goals.words || goals.daily ? "Goals" : "Set goals"}</button>
    </div>
  );
}

function Meter({ value }: { value: number }) {
  return <i className={`meter ${value >= 100 ? "full" : ""}`} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${value}%` }} /></i>;
}

/** Set the project's word goals; empty means no goal. */
export function GoalsModal({ goals, onSave, onClose }: { goals: Goals; onSave: (g: Goals) => void; onClose: () => void }) {
  const [words, setWords] = useState(goals.words ? String(goals.words) : "");
  const [daily, setDaily] = useState(goals.daily ? String(goals.daily) : "");
  const num = (s: string) => Math.max(0, Math.round(Number(s.replace(/[^\d]/g, "")))) || undefined;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal goals" role="dialog" aria-label="Word goals" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Word goals</h2>
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="muted">Goals are saved with the project. Leave a box empty for no goal.</p>
        <div className="form-grid">
          <label>Whole project<input inputMode="numeric" placeholder="80,000" value={words} onChange={(e) => setWords(e.target.value)} data-testid="goal-words" /></label>
          <label>Every day<input inputMode="numeric" placeholder="500" value={daily} onChange={(e) => setDaily(e.target.value)} data-testid="goal-daily" /></label>
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => onSave({ words: num(words), daily: num(daily) })} data-testid="goals-save">Save</button>
        </div>
      </div>
    </div>
  );
}
