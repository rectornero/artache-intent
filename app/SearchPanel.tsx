// Find and replace across the whole project: every script's Draft, Play and
// Code, and every sheet. Results open the file at the line.

import { useMemo, useState } from "react";
import { Icon } from "./Icon.tsx";
import { findAll, replaceAll, scopeOf, type Match, type ReplaceResult, type Scope } from "../src/core/search.ts";
import { parseSheet } from "../src/core/sheets.ts";

const SCOPE_NAMES: Record<Scope, string> = { play: "Play", draft: "Draft", renpy: "Code", sheets: "Sheets" };
const SHOW = 400;

interface Props {
  files: Record<string, string>;
  onOpen: (file: string, line: number) => void;
  onReplace: (r: ReplaceResult, label: string) => void;
}

export function fileLabel(file: string, text: string): string {
  const s = scopeOf(file);
  if (s === "sheets") return parseSheet(text)?.name ?? file;
  if (file.endsWith(".mv.json")) return `${file.replace(/\.mv\.json$/, ".intent")} · MV`;
  if (s === "draft" || s === "renpy") return `${file.replace(/\.\w+$/, ".intent")} · ${SCOPE_NAMES[s]}`;
  return file;
}

export function SearchPanel({ files, onOpen, onReplace }: Props) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  // Code is mostly written by Intent, so it's left out until asked for.
  const [scopes, setScopes] = useState<Scope[]>(["play", "draft", "sheets"]);
  const opts = { matchCase, wholeWord, scopes };
  const matches = useMemo(() => findAll(files, query, opts), [files, query, matchCase, wholeWord, scopes]); // eslint-disable-line react-hooks/exhaustive-deps
  const byFile = useMemo(() => {
    const m = new Map<string, Match[]>();
    for (const x of matches.slice(0, SHOW)) m.set(x.file, [...(m.get(x.file) ?? []), x]);
    return [...m];
  }, [matches]);
  const fileCount = new Set(matches.map((m) => m.file)).size;
  const replace = (only?: string[]) => {
    const r = replaceAll(files, query, replacement, { ...opts, only });
    if (r.count) onReplace(r, `Replaced “${query}” with “${replacement}”`);
  };

  return (
    <div className="search" data-testid="search">
      <div className="search-fields">
        <label className="search-field">
          <Icon name="search" size={15} />
          <input autoFocus type="search" placeholder="Find in project" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find" data-testid="search-input" />
        </label>
        <label className="search-field">
          <Icon name="replace" size={15} />
          <input type="text" placeholder="Replace with" value={replacement} onChange={(e) => setReplacement(e.target.value)} aria-label="Replace with" data-testid="replace-input" />
        </label>
      </div>
      <div className="search-opts">
        <button className={`chip-toggle ${matchCase ? "on" : ""}`} aria-pressed={matchCase} onClick={() => setMatchCase(!matchCase)} title="Match upper and lower case">Aa</button>
        <button className={`chip-toggle ${wholeWord ? "on" : ""}`} aria-pressed={wholeWord} onClick={() => setWholeWord(!wholeWord)} title="Whole words only">Whole word</button>
        <span className="search-sep" />
        {(Object.keys(SCOPE_NAMES) as Scope[]).map((s) => (
          <button key={s} className={`chip-toggle ${scopes.includes(s) ? "on" : ""}`} aria-pressed={scopes.includes(s)}
            onClick={() => setScopes(scopes.includes(s) ? scopes.filter((x) => x !== s) : [...scopes, s])}>{SCOPE_NAMES[s]}</button>
        ))}
      </div>
      {query && (
        <div className="search-summary">
          <span>{matches.length ? `${matches.length} match${matches.length > 1 ? "es" : ""} in ${fileCount} file${fileCount > 1 ? "s" : ""}` : "No matches"}</span>
          <span className="spacer" />
          {matches.length > 0 && <button className="primary" onClick={() => replace()} data-testid="replace-all">Replace all</button>}
        </div>
      )}
      <div className="search-results">
        {byFile.map(([file, list]) => (
          <section key={file} className="search-file">
            <header>
              <b>{fileLabel(file, files[file])}</b>
              <span className="muted">{matches.filter((m) => m.file === file).length}</span>
              <span className="spacer" />
              <button className="ghost" onClick={() => replace([file])}>Replace here</button>
            </header>
            {list.map((m, k) => (
              <button key={k} className="search-hit" onClick={() => onOpen(file, m.line)}>
                <span className="search-line">{m.line}</span>
                <span className="search-text">
                  {snippet(m).before}<mark>{m.text.slice(m.col, m.col + m.length)}</mark>{snippet(m).after}
                </span>
              </button>
            ))}
          </section>
        ))}
        {matches.length > SHOW && <p className="muted">Showing the first {SHOW}. Narrow the search to see the rest.</p>}
        {!query && <p className="muted search-hint">Search every script, all three versions, and every sheet. Renaming a character or place? Change the name on its sheet instead: every mention follows.</p>}
      </div>
    </div>
  );
}

/** Some text either side of the match, trimmed so long lines stay readable. */
function snippet(m: Match) {
  const start = Math.max(0, m.col - 40);
  const before = (start ? "…" : "") + m.text.slice(start, m.col).trimStart();
  const rest = m.text.slice(m.col + m.length);
  return { before, after: rest.length > 80 ? `${rest.slice(0, 80)}…` : rest };
}
