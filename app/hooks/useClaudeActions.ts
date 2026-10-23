import { useState, type MutableRefObject } from "react";
import { AUTHORS_FILE, claudeSpans, readAuthors, writeAuthors, type Span } from "../../src/core/authors.ts";
import { CHECKS_FILE, mergeRun, readChecks, writeChecks } from "../../src/core/checks.ts";
import { fillGapsAt, findGaps, markGaps } from "../../src/core/fill.ts";
import { detectMinigames, newSheet, sheetFileName, type Sheet } from "../../src/core/sheets.ts";
import { markSynced, pairOf, readSync, SYNC_FILE, versionFile, type Version } from "../../src/core/sync.ts";
import type { CompileResult } from "../../src/project.ts";
import { STRETCHES, checkJob, explainFailure, fillJob, promptJob, togetherJob, updateJob, type Job, type Stretch } from "../claude.ts";
import { saveSnapshot } from "../history.ts";
import { VERSION_NAMES } from "../ScriptBars.tsx";
import type { Project } from "../storage.ts";
import { CANCELLED } from "./useClaude.ts";
import type { Files } from "./useProjects.ts";
import type { Say } from "./useToast.ts";

/** Claude's writing waiting for review: ✦ Write or Write together. `spans` are all of Claude's stretches in `after`. */
export type Writing = { projectId: string; file: string; before: string; after: string; title: string; spans: Span[]; retry: () => void };
/** A ✦ Update waiting for review. */
export type Reviewing = { projectId: string; play: string; from: Version; to: Version; before: string; after: string; fromText: string };

const withAuthors = (files: Files, f: string, text: string, spans: Span[]) => {
  const json = writeAuthors(files, f, text, spans);
  const out = { ...files, [f]: text };
  if (json) out[AUTHORS_FILE] = json;
  else delete out[AUTHORS_FILE];
  return out;
};
export const claudeIn = (files: Files, f: string) => claudeSpans(files[f] ?? "", readAuthors(files)[f]);

/** Every ✦ action on the open script: update a version, write, write together, check, draft prompts. */
export function useClaudeActions(c: {
  project: Project; file: string; isScript: boolean; ok: CompileResult | null; latest: MutableRefObject<Project[]>;
  setFiles: (id: string, files: Files | ((now: Files) => Files)) => void; say: Say; busy: string | null;
  askClaude: <T>(job: Job<T>) => Promise<T>; bumpHistory: () => void; compiledVersion: (v: "renpy" | "mv", play: string) => string;
}) {
  const { project, file, ok, say } = c;
  const [writing, setWriting] = useState<Writing | null>(null);
  const [reviewing, setReviewing] = useState<Reviewing | null>(null);
  const vFile = (v: Version) => versionFile(file, v);
  const sheets = () => ok?.sheets.map((x) => x.sheet) ?? [];

  // ✦ Update: bring version `to` in step with `from`, then review before it changes.
  const syncVersions = async (from: Version, to: Version) => {
    if (!ok || c.busy) return;
    const pair = pairOf(from, to)!;
    const base = readSync(project.files)[file]?.[pair] ?? {};
    const after = project.files[vFile(from)] ?? "";
    const target = project.files[vFile(to)] ?? "";
    let proposed: string;
    if (from === "play" && (to === "renpy" || to === "mv") && (base[to] === undefined || base[to] === target)) {
      proposed = c.compiledVersion(to, after); // Code or MV nobody edited by hand: Intent writes it, no Claude needed.
    } else {
      try {
        proposed = await c.askClaude(updateJob({ from, to, before: base[from] ?? "", after, target }, ok.config, sheets()));
      } catch (e) {
        if (e === CANCELLED) return;
        return say(`Claude couldn't update: ${explainFailure(e)}. Nothing changed.`, 8000);
      }
    }
    setReviewing({ projectId: project.id, play: file, from, to, before: target, after: proposed, fromText: after });
  };
  const acceptUpdate = (r: Reviewing) => {
    // The update belongs to the script it was asked for, even if another file is open now.
    const target = c.latest.current.find((p) => p.id === r.projectId);
    const f = versionFile(r.play, r.to);
    setReviewing(null);
    if (!target) return;
    if ((target.files[f] ?? "") !== r.before || (target.files[versionFile(r.play, r.from)] ?? "") !== r.fromText) {
      return say("The text changed while Claude was working, so nothing was applied. Press ✦ Update again.", 8000);
    }
    saveSnapshot(r.projectId, f, r.before, `Before update from ${VERSION_NAMES[r.from]}`);
    c.bumpHistory();
    const files = { ...target.files, [f]: r.after };
    files[SYNC_FILE] = markSynced(files, r.play, pairOf(r.from, r.to)!, { [r.from]: r.fromText, [r.to]: r.after });
    for (const g of r.to === "play" ? detectMinigames(r.after) : []) {
      const sf = sheetFileName("minigame", g);
      if (files[sf] === undefined) files[sf] = newSheet("minigame", g, `First written about in ${r.play}.`);
    }
    c.setFiles(r.projectId, files);
    say(`${VERSION_NAMES[r.to]} updated.`, 8000, { label: "Undo", run: () => c.setFiles(r.projectId, (now) => ({ ...now, [f]: r.before })) });
  };

  // ✦ Write: Claude writes the {{ }} parts of the Draft, then review before it changes.
  const writeGaps = async () => {
    if (!ok || c.busy) return;
    const f = vFile("draft");
    const before = project.files[f] ?? "";
    const gaps = findGaps(before);
    if (!gaps.length) return;
    let parts: string[];
    try {
      parts = await c.askClaude(fillJob(markGaps(before, gaps), gaps.length, ok.config, sheets()));
    } catch (e) {
      if (e === CANCELLED) return;
      return say(`Claude couldn't write it: ${explainFailure(e)}. Nothing changed.`, 8000);
    }
    const r = fillGapsAt(before, gaps, parts);
    const kept = claudeIn(project.files, f).map((x) => ({ from: r.map(x.from), to: r.map(x.to) }));
    const n = r.written.length;
    setWriting({ projectId: project.id, file: f, before, after: r.text, title: `✦ Write ${n} part${n === 1 ? "" : "s"} of the Draft`, spans: [...kept, ...r.written], retry: () => void writeGaps() });
  };
  // Write together: Claude continues the Draft by a page, a part or a chapter.
  const writeTogether = async (stretch: Stretch, direction: string) => {
    if (!ok || c.busy) return;
    const f = vFile("draft");
    const before = project.files[f] ?? "";
    let more: string;
    try {
      more = await c.askClaude(togetherJob(before, stretch, direction, ok.config, sheets()));
    } catch (e) {
      if (e === CANCELLED) return;
      return say(`Claude couldn't write it: ${explainFailure(e)}. Nothing changed.`, 8000);
    }
    if (!more.trim()) return say("Claude had nothing to add. Nothing changed.", 6000);
    const head = before.replace(/\s+$/, "");
    const join = head ? "\n\n" : "";
    const after = `${head}${join}${more}\n`;
    const at = head.length + join.length;
    const kept = claudeIn(project.files, f).map((x) => ({ from: Math.min(x.from, head.length), to: Math.min(x.to, head.length) }));
    setWriting({ projectId: project.id, file: f, before, after, title: `✦ Write together: the next ${STRETCHES[stretch].label.toLowerCase()}`, spans: [...kept, { from: at, to: at + more.length }], retry: () => void writeTogether(stretch, direction) });
  };
  const acceptWriting = (r: Writing) => {
    const target = c.latest.current.find((p) => p.id === r.projectId);
    setWriting(null);
    if (!target) return;
    if ((target.files[r.file] ?? "") !== r.before) return say("The Draft changed while Claude was writing, so nothing was applied. Try again.", 8000);
    saveSnapshot(r.projectId, r.file, r.before, `Before ${r.title.replace(/^✦ /, "")}`);
    c.bumpHistory();
    const oldAuthors = target.files[AUTHORS_FILE];
    c.setFiles(r.projectId, (now) => withAuthors(now, r.file, r.after, r.spans));
    say("Claude's writing is in the Draft. The text before is in History.", 8000, {
      label: "Undo",
      run: () => c.setFiles(r.projectId, (now) => {
        const files = { ...now, [r.file]: r.before };
        if (oldAuthors === undefined) delete files[AUTHORS_FILE];
        else files[AUTHORS_FILE] = oldAuthors;
        return files;
      }),
    });
  };
  // The writer's edits move Claude's stretches; what they type becomes theirs.
  const onClaudeSpans = (spans: Span[], doc: string) => {
    const f = vFile("draft");
    c.setFiles(project.id, (now) => ((now[f] ?? "") === doc ? withAuthors(now, f, doc, spans) : now));
  };

  const draftPrompt = async (kind: "image" | "song", sheet: Sheet, earlier: string[]) => {
    try {
      return await c.askClaude(promptJob(kind, sheet, earlier));
    } catch (e) {
      throw new Error(e === CANCELLED ? "Not drafted." : `Claude couldn't write it: ${explainFailure(e)}.`);
    }
  };

  // ✦ Check story: the open script (or every script) against the sheets. Results live in the project.
  const runCheck = async (whole: boolean) => {
    if (!ok) return;
    const scripts = Object.fromEntries(Object.entries(project.files).filter(([n]) => n.endsWith(".intent")));
    const check = whole || !c.isScript ? scripts : { [file]: scripts[file] };
    const id = project.id;
    try {
      const found = await c.askClaude(checkJob(check, whole || !c.isScript, ok.config, sheets()));
      c.setFiles(id, (now) => ({ ...now, [CHECKS_FILE]: writeChecks(mergeRun(readChecks(now), Object.keys(check), found)) }));
      say(found.length ? `${found.length} possible problem${found.length > 1 ? "s" : ""} found.` : "No problems found.", 5000);
    } catch (e) {
      if (e !== CANCELLED) say(`Claude couldn't check: ${explainFailure(e)}.`, 8000);
    }
  };

  return { writing, setWriting, reviewing, setReviewing, syncVersions, acceptUpdate, writeGaps, writeTogether, acceptWriting, onClaudeSpans, draftPrompt, runCheck };
}
