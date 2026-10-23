// Export → Manuscript: the Drafts as one book, as a Word file or a PDF.

import { useState } from "react";
import { manuscript, manuscriptWords, type ManuscriptOptions } from "../src/core/manuscript.ts";

export interface ManuscriptSource {
  /** Each script's Draft, in order; scripts with no Draft yet give their Play as prose. */
  drafts: Array<{ file: string; text: string; fromPlay: boolean }>;
  title: string;
  author: string;
}

export function ManuscriptPanel({ source, busy, onMake, onAuthor }: {
  source: ManuscriptSource; busy: boolean;
  onMake: (format: "docx" | "pdf", opts: ManuscriptOptions) => void; onAuthor: (author: string) => void;
}) {
  const [title, setTitle] = useState(source.title);
  const [author, setAuthor] = useState(source.author);
  const [sceneTitles, setSceneTitles] = useState(false);
  const [paper, setPaper] = useState<"a4" | "letter">(() => (/^en-US$/.test(navigator.language) ? "letter" : "a4"));
  const blocks = manuscript(source.drafts.map((d) => d.text), { sceneTitles });
  const words = manuscriptWords(blocks);
  const fromPlay = source.drafts.filter((d) => d.fromPlay).map((d) => d.file);
  const opts = { title, author, sceneTitles, paper };
  return (
    <div className="manuscript" data-testid="manuscript">
      <p className="muted checks-note">
        Every script's Draft, in order, as one manuscript: Times 12 pt, double-spaced, chapters on new pages. Script lines, comments and {"{{ notes }}"} are left out.
      </p>
      <div className="form-grid">
        <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Author<input value={author} placeholder="Your name" onChange={(e) => setAuthor(e.target.value)} onBlur={() => author !== source.author && onAuthor(author)} /></label>
        <label>Scenes
          <select value={sceneTitles ? "titles" : "breaks"} onChange={(e) => setSceneTitles(e.target.value === "titles")}>
            <option value="breaks">Breaks (#)</option>
            <option value="titles">Titles</option>
          </select>
        </label>
        <label>Paper
          <select value={paper} onChange={(e) => setPaper(e.target.value as "a4" | "letter")}>
            <option value="a4">A4</option>
            <option value="letter">US Letter</option>
          </select>
        </label>
      </div>
      <p className="checks-note">
        <b>{words.toLocaleString()}</b> words in {source.drafts.length} script{source.drafts.length === 1 ? "" : "s"}.
        {fromPlay.length > 0 && <span className="muted"> {fromPlay.join(", ")} {fromPlay.length === 1 ? "has" : "have"} no Draft yet, so {fromPlay.length === 1 ? "its" : "their"} Play is used as prose.</span>}
      </p>
      <div className="row">
        <button className="primary" disabled={busy || !words} onClick={() => onMake("docx", opts)} data-testid="manuscript-docx">Word (.docx)</button>
        <button disabled={busy || !words} onClick={() => onMake("pdf", opts)} data-testid="manuscript-pdf">PDF</button>
      </div>
    </div>
  );
}
