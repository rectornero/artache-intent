import { useEffect, useMemo, useRef, useState } from "react";
import type { DataBlock, Node, Scene } from "../src/core/ast.ts";
import { conditionText } from "../src/core/condition.ts";
import { slug } from "../src/core/parser.ts";
import { compileProject, type CompileResult } from "../src/project.ts";
import { Editor } from "./Editor.tsx";
import { toLayer, type Layer } from "../src/core/layers.ts";
import { CLAUDE_MODELS, checkJob, explainFailure, loadApiKey, loadModel, loadVia, promptJob, runJob, saveApiKey, saveModel, saveVia, updateJob, type ClaudeModel, type ClaudeVia, type Job } from "./claude.ts";
import { HandoffModal } from "./HandoffModal.tsx";
import { ChecksPanel } from "./ChecksPanel.tsx";
import { CHECKS_FILE, mergeRun, readChecks, writeChecks } from "../src/core/checks.ts";
import { isVersionFile, markSynced, neighbours, pairOf, pairState, inSync, readSync, SYNC_FILE, versionFile, type PairState, type Version } from "../src/core/sync.ts";
import { lineDiff } from "../src/core/diff.ts";

/** A copy-and-paste request the writer closed: nothing to report. */
const CANCELLED = new Error("cancelled");

const VERSION_NAMES: Record<Version, string> = { draft: "Draft", play: "Play", renpy: "Code" };

const DRAFT_HINT = "Write freely here, like a book.";
import { parseScript } from "../src/core/parser.ts";
import { BookView, PreviewNodes } from "./Preview.tsx";
import { SheetForm, isStub } from "./SheetForm.tsx";
import { Icon } from "./Icon.tsx";
import { HistoryPanel } from "./HistoryPanel.tsx";
import { SearchPanel } from "./SearchPanel.tsx";
import { deleteFile, renameScript, renameSheet, type ReplaceResult } from "../src/core/search.ts";
import { saveSnapshot } from "./history.ts";
import type { LinkTarget } from "./intentMode.ts";
import { type Sheet, detectMinigames, newSheet, sheetFileName, sheetNames, sheetUsage, SHEET_KINDS, type SheetKind } from "../src/core/sheets.ts";
import { SAMPLES, newProject } from "./samples.ts";
import { deliverExport, whenSaveFails, isTauri, launchFile, loadPrefs, loadProjects, openFiles, openFolder, openProjectFile, pickFolder, readFolder, saveProjectFile, savePrefs, saveFileAs, saveProjects, writeFolder, type Project } from "./storage.ts";
import { CLAUDE_FILES } from "./claudeCode.ts";
import { ConnectClaude } from "./ConnectClaude.tsx";
import { BackupsPanel } from "./BackupsPanel.tsx";
import { EVERY_MS, saveBackup, sameFiles, type Backup } from "./backups.ts";
import { pack, unpack } from "../src/core/pack.ts";
import { diskChanges, mergeDisk } from "../src/core/folder.ts";
import { activeTheme, applyTheme, DEFAULT_PREFS, THEMES, type Theme, type UiPrefs } from "./themes.ts";

type Tab = "sheet" | "play" | "book" | "search" | "checks" | "backups" | "renpy" | "mv" | "report" | "bible" | "history";
type MobileView = "files" | "write" | "preview";
type ToastAction = { label: string; run: () => void };

// The right panel: three groups instead of a row of tabs. Ren'Py code lives in the Code version.
const PANEL_GROUPS: Array<{ id: string; label: string; icon: string; tabs: Tab[] }> = [
  { id: "read", label: "Read", icon: "story", tabs: ["play", "book"] },
  { id: "find", label: "Find", icon: "search", tabs: ["search"] },
  { id: "export", label: "Export", icon: "engine", tabs: ["report", "mv", "renpy"] },
  { id: "tools", label: "Tools", icon: "data", tabs: ["checks", "history", "backups", "bible"] },
];
const TAB_NAMES: Record<Tab, string> = { sheet: "Sheet", play: "Preview", book: "Book", search: "Find", checks: "Story check", backups: "Backups", renpy: "Ren'Py (all files)", mv: "RPG Maker MV", report: "Report", bible: "Bible", history: "History" };

function safeCompile(p: Project): CompileResult | { error: string } {
  try {
    const settings = JSON.parse(p.files["intent.json"] || "{}");
    const sources = Object.fromEntries(Object.entries(p.files).filter(([n]) => n.endsWith(".intent") || n.endsWith(".sheet")));
    return compileProject(settings, sources, ["renpy", "mv"]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function App() {
  const [prefs, setPrefs] = useState<UiPrefs>(() => loadPrefs(DEFAULT_PREFS));
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = loadProjects();
    return saved.length ? saved : SAMPLES.map((s) => structuredClone(s));
  });
  const [projectId, setProjectId] = useState(() => projects[0].id);
  const project = projects.find((p) => p.id === projectId) ?? projects[0];
  const firstScript = (p: Project) => Object.keys(p.files).find((f) => f.endsWith(".intent")) ?? "intent.json";
  const [fileName, setFileName] = useState(() => firstScript(project));
  const file = project.files[fileName] !== undefined ? fileName : firstScript(project);
  const [cursorLine, setCursorLine] = useState(1);
  const [tab, setTab] = useState<Tab>("play");
  const [jump, setJump] = useState<{ line: number; n: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobile, setMobile] = useState<MobileView>("write");
  const [toast, setToast] = useState("");
  const [sheetFile, setSheetFile] = useState<string | null>(null);
  const [rawSheet, setRawSheet] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; text: string; link?: LinkTarget } | null>(null);
  // Seamless layer tabs: the file seen as Draft, Play (the source) or Ren'Py.
  const [layer, setLayer] = useState<Layer>("play");
  const [busy, setBusy] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<ToastAction | null>(null);
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [model, setModel] = useState<ClaudeModel>(loadModel);
  const [via, setVia] = useState<ClaudeVia>(loadVia);
  const [handoff, setHandoff] = useState<{ job: Job<unknown>; resolve: (v: unknown) => void; reject: (e: Error) => void } | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [backupVersion, setBackupVersion] = useState(0);
  const [popMenu, setPopMenu] = useState<{ x: number; y: number; items: Array<{ label: string; run: () => void; danger?: boolean }> } | null>(null);
  const pop = (e: React.MouseEvent, items: NonNullable<typeof popMenu>["items"]) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setPopMenu({ x: r.left, y: r.bottom + 4, items });
  };
  const [reviewing, setReviewing] = useState<{ projectId: string; play: string; from: Version; to: Version; before: string; after: string; fromText: string } | null>(null);

  useEffect(() => {
    whenSaveFails(() => setToast("This device refused to save your work (storage full or private mode). Use Save as file or Export to keep it."));
  }, []);
  const theme = activeTheme(prefs);
  useEffect(() => {
    applyTheme(theme, prefs);
    savePrefs(prefs);
  }, [theme, prefs]);

  useEffect(() => {
    const t = setTimeout(() => saveProjects(projects.filter((p) => !p.folder)), 400);
    return () => clearTimeout(t);
  }, [projects]);

  // Folder projects save themselves to disk as you type. `disk` remembers each file as it is
  // on disk, so edits made outside Intent (Claude Code, another editor) can be told apart.
  const disk = useRef<Record<string, Record<string, string>>>({});
  const latest = useRef(projects);
  latest.current = projects;
  useEffect(() => {
    const t = setTimeout(() => {
      for (const p of projects.filter((x) => x.folder)) {
        const base = (disk.current[p.id] ??= {});
        const { changed, removed } = diskChanges(base, p.files);
        if (!Object.keys(changed).length && !removed.length) continue;
        writeFolder(p.folder!, changed, removed).then(
          () => {
            Object.assign(base, changed);
            for (const f of removed) delete base[f];
          },
          () => say("Couldn't save to the project folder. Is it still there?", 8000),
        );
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  // Coming back to Intent: take what changed on disk. A file edited both here and on disk keeps
  // Intent's text (it saves over the disk copy), and the toast says so.
  const reloadFolder = async (p: Project, quiet = true) => {
    if (!p.folder) return;
    let onDisk: Record<string, string>;
    try {
      onDisk = await readFolder(p.folder);
    } catch {
      return quiet ? undefined : say("Couldn't read the project folder.", 6000);
    }
    const cur = latest.current.find((x) => x.id === p.id);
    if (!cur) return;
    const { files, base, taken, both } = mergeDisk(disk.current[p.id] ?? {}, cur.files, onDisk);
    disk.current[p.id] = base;
    if (taken.length) setProjects((list) => list.map((x) => (x.id === p.id ? { ...x, files } : x)));
    if (both.length) say(`${both.join(", ")} changed both here and on disk. Intent kept its own text; the disk copy is in History.`, 10000);
    else if (taken.length) say(`Picked up ${taken.length} change${taken.length > 1 ? "s" : ""} from the folder.`, 5000);
    else if (!quiet) say("Already up to date with the folder.");
    for (const f of both) saveSnapshot(p.id, f, onDisk[f], "On disk, edited outside Intent");
  };
  useEffect(() => {
    if (!project.folder) return;
    const onFocus = () => void reloadFolder(project);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.folder]);

  // Backups: every project, at most every ten minutes, only when something changed.
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
  const replaceFiles = (id: string, files: Record<string, string>, done: string) => {
    const before = latest.current.find((x) => x.id === id);
    if (!before) return;
    void saveBackup(before.id, before.name, before.files).then(() => setBackupVersion((v) => v + 1), () => undefined);
    setProjects((list) => list.map((x) => (x.id === id ? { ...x, files } : x)));
    say(done, 10000, { label: "Undo", run: () => setProjects((list) => list.map((x) => (x.id === id ? { ...x, files: before.files } : x))) });
  };
  const restoreBackup = (b: Backup) => {
    if (sameFiles(b.files, project.files)) return say("The project is already exactly like this backup.");
    replaceFiles(project.id, b.files, `Restored the backup from ${new Date(b.at).toLocaleString()}. The text before it is the newest backup.`);
  };
  const saveAsProjectFile = async (files: Record<string, string>, name = project.name) => {
    const data = await pack({ id: project.id.startsWith("folder:") ? `p${Date.now()}` : project.id, name, savedAt: Date.now(), app: __APP_VERSION__ }, files);
    if (await saveProjectFile(name, data)) say(isTauri() ? "Project file saved." : "Project file downloaded.");
  };
  const openProject = async () => {
    let got: Awaited<ReturnType<typeof unpack>>;
    try {
      const data = await openProjectFile();
      if (!data) return;
      got = await unpack(data);
    } catch (e) {
      return say(e instanceof Error ? e.message : String(e), 6000);
    }
    const same = projects.find((p) => p.id === got.meta.id);
    if (same) {
      setProjectId(same.id);
      if (sameFiles(same.files, got.files)) return say(`${same.name} is already up to date.`);
      return replaceFiles(same.id, got.files, `${same.name} replaced by the project file${got.meta.savedAt ? ` saved ${new Date(got.meta.savedAt).toLocaleString()}` : ""}. The old one is in Backups.`);
    }
    const p: Project = { id: got.meta.id, name: got.meta.name, files: got.files };
    setProjects((l) => [...l, p]);
    setProjectId(p.id);
    setFileName(firstScript(p));
    say(`Opened ${p.name}.`);
  };

  const openFolderProject = async () => {
    const p = await openFolder();
    if (!p) return;
    disk.current[p.id] = { ...p.files };
    setProjects((l) => [...l.filter((x) => x.id !== p.id), p]);
    setProjectId(p.id);
    setFileName(firstScript(p));
  };

  const keepInFolder = async () => {
    const dir = await pickFolder("Keep this project in a folder");
    if (!dir) return;
    try {
      await writeFolder(dir, project.files);
    } catch {
      return say("Couldn't write to that folder.", 6000);
    }
    const moved: Project = { ...project, id: `folder:${dir}`, folder: dir };
    disk.current[moved.id] = { ...project.files };
    setProjects((l) => [...l.filter((x) => x.id !== project.id && x.id !== moved.id), moved]);
    setProjectId(moved.id);
    say(`${project.name} now lives in ${dir.split(/[\\/]/).pop()} and saves there as you type.`, 8000);
  };
  const setUpClaudeCode = async () => {
    if (!project.folder) return;
    try {
      await writeFolder(project.folder, CLAUDE_FILES);
      say("CLAUDE.md is in the project folder. Open the folder in Claude Code and ask away; Intent picks up its edits when you come back.", 12000);
    } catch {
      say("Couldn't write to the project folder.", 6000);
    }
  };

  const result = useMemo(() => safeCompile(project), [project]);
  const ok = "files" in result ? result : null;
  const script = ok?.scripts.find((s) => s.file === file);
  const diagnostics = script?.diagnostics ?? [];
  const errors = ok ? ok.diagnostics.filter((d) => d.level === "error").length : 1;
  const warnings = ok ? ok.diagnostics.filter((d) => d.level === "warning").length : 0;

  const update = (text: string) =>
    setProjects((list) => list.map((p) => (p.id === project.id ? { ...p, files: { ...p.files, [file]: text } } : p)));

  // Draft, Play and Code are separate texts. Play is the script file itself;
  // a missing Draft or Code is made from Play for free the first time it's opened.
  const isScript = file.endsWith(".intent");
  const vFile = (v: Version) => versionFile(file, v);
  const shown = isScript ? vFile(layer) : file;
  const compiledCode = (src: string) => {
    if (!ok) return "";
    const one = compileProject(JSON.parse(project.files["intent.json"] || "{}"), { ...Object.fromEntries(Object.entries(project.files).filter(([n]) => n.endsWith(".sheet"))), [file]: src }, ["renpy"]);
    return one.files[`renpy/${slug(file.replace(/\.[^.]+$/, ""))}.rpy`] ?? "";
  };
  useEffect(() => {
    if (!isScript || layer === "play" || !ok || project.files[vFile(layer)] !== undefined) return;
    const play = project.files[file] ?? "";
    const text = layer === "draft" ? toLayer("draft", play, parseScript(play, ok.config, file), ok.config).text : compiledCode(play);
    const files = { ...project.files, [vFile(layer)]: text };
    files[SYNC_FILE] = markSynced(files, file, pairOf("play", layer)!, { play, [layer]: text });
    setProjects((list) => list.map((p) => (p.id === project.id ? { ...p, files } : p)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScript, layer, file, ok]);
  const states = isScript ? neighbours(layer).map((n) => ({ n, s: pairState(project.files, file, layer, n) })) : [];
  const behind = (v: Version) => isScript && neighbours(v).some((n) => { const st = pairState(project.files, file, v, n); return !st.missing && !inSync(st); });

  // Every ✦ job goes through here: on the API key, or by copy and paste when there's no key
  // or the writer prefers it. A closed hand-off rejects with CANCELLED and changes nothing.
  const askClaude = <T,>(job: Job<T>, forcePaste = false): Promise<T> => {
    if (apiKey && via === "api" && !forcePaste) {
      setBusy(`Claude: ${job.title}…`);
      return runJob(apiKey, model, job).finally(() => setBusy(null));
    }
    return new Promise<T>((resolve, reject) => setHandoff({ job: job as Job<unknown>, resolve: resolve as (v: unknown) => void, reject }));
  };

  // ✦ Update: bring version `to` in step with `from`, then review before it changes.
  const syncVersions = async (from: Version, to: Version) => {
    if (!ok || busy) return;
    const pair = pairOf(from, to)!;
    const base = readSync(project.files)[file]?.[pair] ?? {};
    const after = project.files[vFile(from)] ?? "";
    const target = project.files[vFile(to)] ?? "";
    let proposed: string;
    if (from === "play" && to === "renpy" && (base.renpy === undefined || base.renpy === target)) {
      proposed = compiledCode(after); // Code nobody edited by hand: Intent writes it, no Claude needed.
    } else {
      try {
        proposed = await askClaude(updateJob({ from, to, before: base[from] ?? "", after, target }, ok.config, ok.sheets.map((x) => x.sheet)));
      } catch (e) {
        if (e === CANCELLED) return;
        return say(`Claude couldn't update: ${explainFailure(e)}. Nothing changed.`, 8000);
      }
    }
    setReviewing({ projectId: project.id, play: file, from, to, before: target, after: proposed, fromText: after });
  };
  const acceptUpdate = (r: NonNullable<typeof reviewing>) => {
    // The update belongs to the script it was asked for, even if another file is open now.
    const target = projects.find((p) => p.id === r.projectId);
    const f = versionFile(r.play, r.to);
    if (!target) return setReviewing(null);
    if ((target.files[f] ?? "") !== r.before || (target.files[versionFile(r.play, r.from)] ?? "") !== r.fromText) {
      setReviewing(null);
      return say("The text changed while Claude was working, so nothing was applied. Press ✦ Update again.", 8000);
    }
    saveSnapshot(r.projectId, f, r.before, `Before update from ${VERSION_NAMES[r.from]}`);
    setHistoryVersion((v) => v + 1);
    const files = { ...target.files, [f]: r.after };
    files[SYNC_FILE] = markSynced(files, r.play, pairOf(r.from, r.to)!, { [r.from]: r.fromText, [r.to]: r.after });
    for (const g of r.to === "play" ? detectMinigames(r.after) : []) {
      const sf = sheetFileName("minigame", g);
      if (files[sf] === undefined) files[sf] = newSheet("minigame", g, `First written about in ${r.play}.`);
    }
    setProjects((list) => list.map((p) => (p.id === r.projectId ? { ...p, files } : p)));
    setReviewing(null);
    say(`${VERSION_NAMES[r.to]} updated.`, 8000, { label: "Undo", run: () => setProjects((list) => list.map((p) => (p.id === r.projectId ? { ...p, files: { ...p.files, [f]: r.before } } : p))) });
  };
  const switchLayer = (l: Layer) => setLayer(l);
  // The writer (or Claude Code) already brought the versions in step by hand.
  const markInStep = () => {
    let files = { ...project.files };
    for (const { n, s } of states) {
      if (s.missing || inSync(s)) continue;
      files = { ...files, [SYNC_FILE]: markSynced(files, file, pairOf(layer, n)!, { [layer]: files[vFile(layer)], [n]: files[vFile(n)] }) };
    }
    setProjects((list) => list.map((p) => (p.id === project.id ? { ...p, files } : p)));
    say("Marked as in step.");
  };
  const draftPrompt = async (kind: "image" | "song", sheet: Sheet, earlier: string[]) => {
    try {
      return await askClaude(promptJob(kind, sheet, earlier));
    } catch (e) {
      throw new Error(e === CANCELLED ? "Not drafted." : `Claude couldn't write it: ${explainFailure(e)}.`);
    }
  };

  // ✦ Check story: the open script (or every script) against the sheets. Results live in the project.
  const runCheck = async (whole: boolean) => {
    if (!ok) return;
    const scripts = Object.fromEntries(Object.entries(project.files).filter(([n]) => n.endsWith(".intent")));
    const check = whole || !isScript ? scripts : { [file]: scripts[file] };
    const id = project.id;
    try {
      const found = await askClaude(checkJob(check, whole || !isScript, ok.config, ok.sheets.map((x) => x.sheet)));
      setProjects((list) => list.map((p) => (p.id === id ? { ...p, files: { ...p.files, [CHECKS_FILE]: writeChecks(mergeRun(readChecks(p.files), Object.keys(check), found)) } } : p)));
      say(found.length ? `${found.length} possible problem${found.length > 1 ? "s" : ""} found.` : "No problems found.", 5000);
    } catch (e) {
      if (e !== CANCELLED) say(`Claude couldn't check: ${explainFailure(e)}.`, 8000);
    }
  };
  const dismissIssue = (issueId: string, on: boolean) => {
    const c = readChecks(project.files);
    c.dismissed = on ? [...new Set([...c.dismissed, issueId])] : c.dismissed.filter((d) => d !== issueId);
    setFile(CHECKS_FILE, writeChecks(c));
  };

  const say = (msg: string, ms = 2500, action: ToastAction | null = null) => {
    setToast(msg);
    setToastAction(action);
    setTimeout(() => setToast((t) => (t === msg ? "" : t)), ms);
  };

  const setFile = (name: string, text: string) =>
    setProjects((list) => list.map((p) => (p.id === project.id ? { ...p, files: { ...p.files, [name]: text } } : p)));

  // Names the writer turned back into plain text (false positives), kept in intent.json.
  const noLink = useMemo(() => {
    try {
      return new Set<string>((JSON.parse(project.files["intent.json"] || "{}").noLink ?? []).map((n: string) => n.toLowerCase()));
    } catch {
      return new Set<string>();
    }
  }, [project.files]);

  const setNoLink = (name: string, on: boolean) => {
    const settings = JSON.parse(project.files["intent.json"] || "{}");
    const list: string[] = (settings.noLink ?? []).filter((n: string) => n.toLowerCase() !== name.toLowerCase());
    if (on) list.push(name);
    settings.noLink = list;
    setFile("intent.json", JSON.stringify(settings, null, 2));
  };

  // Change what a sheet is (a Place that was really a Character): same fields, new kind and file.
  const changeKind = (f: string, kind: SheetKind) => {
    const entry = ok?.sheets.find((x) => x.file === f);
    if (!entry) return;
    const to = sheetFileName(kind, entry.sheet.name);
    const text = project.files[f].replace(/^(\s*)@\w+/, `$1@${kind}`);
    setProjects((list) => list.map((p) => {
      if (p.id !== project.id) return p;
      const files = { ...p.files };
      delete files[f];
      files[to] = text;
      return { ...p, files };
    }));
    if (sheetFile === f) setSheetFile(to);
    if (file === f) setFileName(to);
    say(`${entry.sheet.name} is now a ${SHEET_KINDS[kind].label}`);
  };

  // Every name that has a sheet, plus minigames the scripts mention that have none yet.
  const links = useMemo<LinkTarget[]>(() => {
    if (!ok) return [];
    const out: LinkTarget[] = ok.sheets.flatMap(({ file: f, sheet }) => sheetNames(sheet).map((name) => ({ name, kind: sheet.kind, file: f })));
    const have = new Set(ok.sheets.filter((x) => x.sheet.kind === "minigame").map((x) => x.sheet.name.toLowerCase()));
    const seen = new Set<string>();
    for (const [f, text] of Object.entries(project.files)) {
      if (!f.endsWith(".intent")) continue;
      for (const g of detectMinigames(text)) {
        if (have.has(g.toLowerCase()) || seen.has(g.toLowerCase())) continue;
        seen.add(g.toLowerCase());
        out.push({ name: g, kind: "minigame", file: sheetFileName("minigame", g), stub: true });
      }
    }
    return out.filter((l) => !noLink.has(l.name.toLowerCase()));
  }, [ok, project.files, noLink]);

  const openSheet = (f: string) => {
    setSheetFile(f);
    setTab("sheet");
    setMobile("preview");
  };

  const createSheet = (kind: SheetKind, name: string, open = true) => {
    const f = sheetFileName(kind, name);
    if (project.files[f] === undefined) setFile(f, newSheet(kind, name, file.endsWith(".intent") ? `First written about in ${file}, line ${cursorLine}.` : undefined));
    if (open) openSheet(f);
    say(`${SHEET_KINDS[kind].label} sheet: ${name}`);
  };

  const sheetUsageFor = (f: string) => {
    const entry = ok?.sheets.find((x) => x.file === f);
    return entry && ok ? sheetUsage(entry.sheet, ok.scripts) : null;
  };

  const openLink = (t: LinkTarget) => (t.stub ? createSheet(t.kind as SheetKind, t.name) : openSheet(t.file));

  // Find, replace, rename and delete: whole-project changes, each saved to History first and undoable.
  const openSearch = () => {
    setTab("search");
    setMobile("preview");
    if (prefs.sidePanel === "hidden") setPrefs({ ...prefs, sidePanel: "right" });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const openAt = (f: string, line: number) => {
    const v: Version | null = f.endsWith(".draft") ? "draft" : f.endsWith(".rpy") ? "renpy" : f.endsWith(".intent") ? "play" : null;
    setFileName(v ? f.replace(/\.\w+$/, ".intent") : f);
    if (v) setLayer(v);
    if (f.endsWith(".sheet")) setRawSheet(true);
    setJump({ line, n: Date.now() });
    setMobile("write");
  };
  const changeFiles = (files: Record<string, string>, before: Record<string, string>, changed: string[], label: string, done: string) => {
    for (const f of changed) if (before[f] !== undefined) saveSnapshot(project.id, f, before[f], label);
    setHistoryVersion((v) => v + 1);
    const id = project.id;
    setProjects((list) => list.map((p) => (p.id === id ? { ...p, files } : p)));
    say(done, 8000, { label: "Undo", run: () => setProjects((list) => list.map((p) => (p.id === id ? { ...p, files: before } : p))) });
  };
  const applyReplace = (r: ReplaceResult, label: string) =>
    changeFiles(r.files, project.files, r.changed, `Before: ${label}`, `${label}: ${r.count} change${r.count > 1 ? "s" : ""} in ${r.changed.length} file${r.changed.length > 1 ? "s" : ""}.`);
  const renameSheetTo = (f: string, name: string): boolean => {
    const old = ok?.sheets.find((x) => x.file === f)?.sheet.name ?? f;
    try {
      const r = renameSheet(project.files, f, name);
      changeFiles(r.files, project.files, [f, ...r.changed], `Before renaming ${old}`, r.count ? `Renamed ${old} to ${name}. ${r.count} mention${r.count > 1 ? "s" : ""} updated.` : `Renamed ${old} to ${name}.`);
      if (sheetFile === f) setSheetFile(r.to);
      if (file === f) setFileName(r.to);
      return true;
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), 6000);
      return false;
    }
  };
  const renameAny = (f: string) => {
    if (f.endsWith(".sheet")) {
      const old = ok?.sheets.find((x) => x.file === f)?.sheet.name ?? "";
      const n = prompt("New name. Every script and sheet that mentions it follows.", old);
      if (n?.trim() && n.trim() !== old) renameSheetTo(f, n.trim());
      return;
    }
    const n = prompt("New script file name", f)?.trim();
    if (!n || n === f) return;
    const to = n.endsWith(".intent") ? n : `${n}.intent`;
    try {
      changeFiles(renameScript(project.files, f, to), project.files, [], "", `Renamed ${f} to ${to}.`);
      if (file === f) setFileName(to);
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), 6000);
    }
  };
  const deleteAny = (f: string) => {
    const name = f.endsWith(".sheet") ? (ok?.sheets.find((x) => x.file === f)?.sheet.name ?? f) : f;
    if (!confirm(f.endsWith(".intent") ? `Delete ${name} with its Draft and Code versions?` : `Delete the sheet ${name}?`)) return;
    const gone = Object.keys(project.files).filter((x) => x === f || (f.endsWith(".intent") && (x === versionFile(f, "draft") || x === versionFile(f, "renpy"))));
    changeFiles(deleteFile(project.files, f), project.files, gone, "Before delete", `Deleted ${name}.`);
    if (sheetFile === f) setSheetFile(null);
  };
  const rowMore = (f: string) => (
    <button className="row-more" aria-label="More" title="Rename or delete" onClick={(e) => pop(e, [{ label: "Rename…", run: () => renameAny(f) }, { label: "Delete…", run: () => deleteAny(f), danger: true }])}>
      <Icon name="more" size={16} />
    </button>
  );

  // What the preview shows: the scene or block under the cursor.
  const focus = useMemo(() => {
    if (!script) return null;
    const scenes: Scene[] = script.chapters.flatMap((c) => c.scenes);
    const items: Array<{ line: number; title: string; nodes: Node[] }> = [
      ...scenes.map((s) => ({ line: s.line, title: s.title || "Opening", nodes: s.body })),
      ...script.blocks
        .filter((b) => b.body || b.branches)
        .map((b: DataBlock) => ({
          line: b.line,
          title: `@${b.kind} ${b.name}${b.when ? ` · when ${conditionText(b.when)}` : ""}`,
          nodes: b.body ?? (b.branches ? [{ n: "if" as const, line: b.line, branches: b.branches }] : []),
        })),
    ].sort((a, b) => a.line - b.line);
    return [...items].reverse().find((i) => i.line <= cursorLine) ?? items[0] ?? null;
  }, [script, cursorLine]);

  const outline = useMemo(() => {
    if (!script) return [];
    return [
      ...script.chapters.flatMap((c) => [
        { line: c.scenes[0]?.line ?? 1, label: c.title, depth: 0 },
        ...c.scenes.filter((s) => s.title).map((s) => ({ line: s.line, label: s.title, depth: 1 })),
      ]),
      ...script.blocks.map((b) => ({ line: b.line, label: `@${b.kind} ${b.name}`, depth: 0 })),
    ].sort((a, b) => a.line - b.line);
  }, [script]);

  const source = project.files[file] ?? "";

  const insertBlock = (kind: "draft" | "renpy" | "mv") => {
    const lines = source.split("\n");
    const hint = { draft: DRAFT_HINT, renpy: "# Ren'Py code, passed through as is", mv: "// MV script call, passed through as is" }[kind];
    const at = Math.min(cursorLine, lines.length);
    lines.splice(at, 0, "", `::: ${kind}`, hint, ":::", "");
    update(lines.join("\n"));
    setJump({ line: at + 3, n: Date.now() });
  };

  const addFile = () => {
    const name = prompt("New script file name", "chapter.intent");
    if (!name) return;
    const n = name.endsWith(".intent") ? name : `${name}.intent`;
    setProjects((list) => list.map((p) => (p.id === project.id ? { ...p, files: { ...p.files, [n]: "# New chapter\n## First scene\n\n" } } : p)));
    setFileName(n);
  };

  // Files picked from disk join the current project; sheets go to their kind's folder.
  const addFiles = (incoming: Record<string, string>) => {
    const named = Object.entries(incoming).map(([n, text]) => {
      const kind = text.trimStart().match(/^@(character|place|item|minigame)\s+(.+)/);
      return [kind ? sheetFileName(kind[1] as SheetKind, kind[2].trim()) : n, text] as const;
    });
    if (!named.length) return;
    setProjects((list) => list.map((p) => (p.id === project.id ? { ...p, files: { ...p.files, ...Object.fromEntries(named) } } : p)));
    setFileName(named[0][0]);
    say(named.length > 1 ? `Opened ${named.length} files` : `Opened ${named[0][0].split("/").pop()}`);
  };
  const importFiles = async () => addFiles(await openFiles());

  // Double-clicking a .intent file on Windows opens the app with it.
  useEffect(() => {
    launchFile().then((f) => f && addFiles({ [f.name]: f.text }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addProject = () => {
    const name = prompt("Project name", "My game");
    if (!name) return;
    const p = newProject(name);
    setProjects((l) => [...l, p]);
    setProjectId(p.id);
    setFileName(firstScript(p));
  };

  const doExport = async () => {
    if (!ok) return say("Fix intent.json first");
    // Code you edited and kept in sync with Play goes into the export as it is.
    const files = { ...ok.files };
    for (const f of Object.keys(project.files).filter((n) => n.endsWith(".intent"))) {
      const code = project.files[versionFile(f, "renpy")];
      if (code !== undefined && inSync(pairState(project.files, f, "play", "renpy"))) files[`renpy/${slug(f.replace(/\.[^.]+$/, ""))}.rpy`] = code;
    }
    await deliverExport(project.name, files);
    say(isTauri() ? "Exported" : "Export downloaded");
  };

  const sideOpen = prefs.sidePanel !== "hidden";

  return (
    <div className={`app side-${prefs.sidePanel} ${prefs.showOutline ? "" : "no-outline"} m-${mobile}`}>
      <header className="topbar">
        <div className="brand" title={`${theme.brand.name} ${theme.brand.product}`}>
          <img className="brand-logo" src={theme.brand.logo} alt={theme.brand.name} />
          <img className="brand-icon" src={theme.brand.icon} alt={theme.brand.name} />
          <span className="brand-divider" aria-hidden="true" />
          <span className="brand-product">{theme.brand.product}</span>
          <span className="brand-version" title={`Version ${__APP_VERSION__}`}>{__APP_VERSION__.replace(/\.0$/, "")}</span>
        </div>
        <select className="project-picker" value={project.id} onChange={(e) => { setProjectId(e.target.value); setFileName(firstScript(projects.find((p) => p.id === e.target.value)!)); }} aria-label="Project">
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="spacer" />
        <span className={`status ${errors ? "bad" : warnings ? "warn" : "good"}`} data-testid="status">
          {"error" in result ? "Settings error" : errors ? `${errors} error${errors > 1 ? "s" : ""}` : warnings ? `${warnings} warning${warnings > 1 ? "s" : ""}` : "Ready"}
        </span>
        <button className="icon" onClick={openSearch} aria-label="Find in project" title="Find in project (Ctrl+Shift+F)" data-testid="open-search"><Icon name="search" size={17} /></button>
        <button className="primary wide-only" onClick={doExport} data-testid="export">Export</button>
        <button className="icon wide-only" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings">⚙</button>
        <div className="more phone-only">
          <button className="icon" onClick={() => setMoreOpen(!moreOpen)} aria-label="More" aria-expanded={moreOpen}>⋯</button>
          {moreOpen && (
            <div className="more-menu" role="menu" onClick={() => setMoreOpen(false)}>
              <button role="menuitem" onClick={doExport}>Export</button>
              <button role="menuitem" onClick={() => setSettingsOpen(true)}>Settings</button>
              <span className="more-version">{theme.brand.product} {__APP_VERSION__}</span>
            </div>
          )}
        </div>
      </header>

      <aside className="sidebar">
        <div className="side-head">
          <Icon name="files" />Scripts
          <span className="spacer" />
          <button className="ghost" onClick={addFile} title="New script">+ script</button>
        </div>
        <ul className="files">
          {Object.keys(project.files).filter((f) => !f.endsWith(".sheet") && !isVersionFile(f)).sort((a, b) => (a === "intent.json" ? 1 : b === "intent.json" ? -1 : a.localeCompare(b))).map((f) => (
            <li key={f}>
              <button className={f === file ? "active" : ""} onClick={() => { setFileName(f); setMobile("write"); }}>
                {f === "intent.json" ? "⚙ Project settings" : f}
              </button>
              {f.endsWith(".intent") && rowMore(f)}
            </li>
          ))}
        </ul>
        <div className="side-head">
          <Icon name="sheets" />Sheets
          <span className="spacer" />
          <select className="ghost add-sheet" value="" aria-label="New sheet" onChange={(e) => { const k = e.target.value as SheetKind; e.target.value = ""; const n = k && prompt(`New ${SHEET_KINDS[k].label.toLowerCase()} name`); if (k && n) createSheet(k, n.trim()); }}>
            <option value="">+ sheet</option>
            {(Object.keys(SHEET_KINDS) as SheetKind[]).map((k) => <option key={k} value={k}>{SHEET_KINDS[k].label}</option>)}
          </select>
        </div>
        {(Object.keys(SHEET_KINDS) as SheetKind[]).map((k) => {
          const mine = (ok?.sheets ?? []).filter((x) => x.sheet.kind === k).sort((a, b) => Number(isStub(b.sheet)) - Number(isStub(a.sheet)) || a.sheet.name.localeCompare(b.sheet.name));
          const stubs = links.filter((l) => l.stub && l.kind === k);
          if (!mine.length && !stubs.length) return null;
          return (
            <div key={k} className="sheet-group">
              <div className={`sheet-group-head k-${k}`}><Icon name={k} size={14} />{SHEET_KINDS[k].plural}</div>
              <ul className="files">
                {stubs.map((l) => (
                  <li key={l.name}><button className="stub" onClick={() => createSheet(k, l.name)} title="Mentioned in your script. Click to make its sheet">{l.name}<span className="badge">new</span></button></li>
                ))}
                {mine.map(({ file: f, sheet }) => (
                  <li key={f}>
                    <button className={f === file || f === sheetFile ? "active" : ""} onClick={() => { setFileName(f); setRawSheet(false); setMobile("write"); }}>
                      {sheet.name}{isStub(sheet) && <span className="badge">to design</span>}
                    </button>
                    {rowMore(f)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <div className="side-head">
          <Icon name="project" />Project
        </div>
        <div className="side-actions">
          <button className="side-btn" onClick={addProject}>New project</button>
          <button className="side-btn" onClick={(e) => pop(e, [
            { label: "Script or sheet…", run: () => void importFiles() },
            { label: "Project file…", run: () => void openProject() },
            ...(isTauri() ? [{ label: "Folder…", run: () => void openFolderProject() }] : []),
          ])}>Open ▾</button>
          <button className="side-btn" onClick={(e) => pop(e, [
            ...(!file.endsWith(".json") ? [{ label: `This file as… (${file.split("/").pop()})`, run: () => void saveFileAs(file, project.files[file] ?? "").then((ok) => ok && say(`Saved ${file.split("/").pop()}`)) }] : []),
            { label: "Project file…", run: () => void saveAsProjectFile(project.files) },
            ...(isTauri() && !project.folder ? [{ label: "Keep in a folder…", run: () => void keepInFolder() }] : []),
          ])}>Save ▾</button>
          <button className="side-btn" onClick={() => { setTab("backups"); setMobile("preview"); }}>Backups</button>
          {project.folder && <button className="side-btn" onClick={() => void reloadFolder(project, false)} title="Take changes made outside Intent">Reload</button>}
          <button className="side-btn" onClick={() => setConnectOpen(true)} data-testid="connect-claude">✦ Connect Claude</button>
        </div>
        {prefs.showOutline && outline.length > 0 && (
          <>
            <div className="side-head"><Icon name="outline" />Outline</div>
            <ul className="outline">
              {outline.map((o, k) => (
                <li key={k} style={{ paddingLeft: 8 + o.depth * 14 }}>
                  <button onClick={() => { setJump({ line: o.line, n: Date.now() }); setMobile("write"); }}>{o.label}</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>

      <main className={`main view-${isScript ? layer : "play"}`}>
        {file.endsWith(".sheet") && (
          <div className="toolbar" role="toolbar" aria-label="Sheet">
            <span className="label">Edit as:</span>
            <button className={rawSheet ? "" : "on"} onClick={() => setRawSheet(false)}>Form</button>
            <button className={rawSheet ? "on" : ""} onClick={() => setRawSheet(true)}>Text</button>
          </div>
        )}
        {file.endsWith(".intent") && (
          <div className="toolbar" role="toolbar" aria-label="Layers">
            <div className="layer-tabs" role="tablist" aria-label="Layer">
              {(["draft", "play", "renpy"] as Layer[]).map((l) => (
                <button key={l} role="tab" aria-selected={layer === l} className={layer === l ? "on" : ""} onClick={() => switchLayer(l)} data-testid={`layer-${l}`}>
                  {{ draft: "Draft", play: "Play", renpy: "Code" }[l]}
                  {behind(l) && <i className="sync-dot" title="Out of sync" />}
                </button>
              ))}
            </div>
            {layer === "play" && (
              <select className="insert-menu" value="" aria-label="Insert" onChange={(e) => { const k = e.target.value as "draft" | "renpy" | "mv"; e.target.value = ""; if (k) insertBlock(k); }}>
                <option value="">+ Insert</option>
                <option value="draft">Prose passage</option>
                <option value="renpy">Ren'Py code block</option>
                <option value="mv">MV code block</option>
              </select>
            )}
          </div>
        )}
        {isScript && states.some(({ s }) => !s.missing && !inSync(s)) && (
          <div className="sync-bar" role="status" data-testid="sync-bar">
            <i className="sync-dot" />
            <span>
              {(() => {
                const off = states.filter(({ s }) => !s.missing && !inSync(s));
                const names = (f: (s: PairState) => boolean) => off.filter(({ s }) => f(s)).map(({ n }) => VERSION_NAMES[n]);
                const both = names((s) => s.here && s.there), newer = names((s) => s.there && !s.here), behindHere = names((s) => s.here && !s.there);
                return [
                  both.length ? `${both.join(" and ")} and this ${VERSION_NAMES[layer]} were both edited.` : "",
                  newer.length ? `${newer.join(" and ")} ${newer.length > 1 ? "have" : "has"} newer changes.` : "",
                  behindHere.length ? `${behindHere.join(" and ")} ${behindHere.length > 1 ? "don't" : "doesn't"} have your changes yet.` : "",
                ].filter(Boolean).join(" ");
              })()}
            </span>
            <button className="ghost" title="Both versions already say the same thing: stop flagging them" onClick={() => markInStep()}>Mark as in step</button>
            {states.filter(({ s }) => !s.missing && !inSync(s)).map(({ n, s }) => s.there ? (
              <button key={n} className="claude-go" disabled={!!busy} data-testid={`sync-${n}`} onClick={() => void syncVersions(n, layer)}>✦ Update from {VERSION_NAMES[n]}</button>
            ) : (
              <button key={n} className="claude-go" disabled={!!busy} data-testid={`sync-${n}`} onClick={() => void syncVersions(layer, n)}>✦ Update {VERSION_NAMES[n]}</button>
            ))}
          </div>
        )}
        {file.endsWith(".sheet") && !rawSheet ? (
          <div className="sheet-scroll">
            <SheetForm
              key={file}
              text={project.files[file] ?? ""}
              usage={sheetUsageFor(file)}
              onChange={update}
              onJump={(f, line) => { setFileName(f); setJump({ line, n: Date.now() }); }}
              onDraftPrompt={draftPrompt}
              onRename={(n) => renameSheetTo(file, n)}
            />
          </div>
        ) : (
        <Editor
          docKey={`${project.id}/${shown}`}
          value={project.files[shown] ?? ""}
          isJson={file.endsWith(".json")}
          wrap={prefs.wrap}
          diagnostics={shown === file ? diagnostics : []}
          onChange={(t) => setFile(shown, t)}
          onCursorLine={setCursorLine}
          jumpTo={jump}
          links={links}
          onOpenLink={openLink}
          onContext={setMenu}
        />
        )}
        {diagnostics.filter((d) => d.level !== "info").length > 0 && (
          <div className="problems">
            {diagnostics.filter((d) => d.level !== "info").map((d, k) => (
              <button key={k} className={`problem ${d.level}`} onClick={() => setJump({ line: d.line, n: Date.now() })}>
                <b>Line {d.line}</b> {d.message}
              </button>
            ))}
          </div>
        )}
      </main>

      {sideOpen && (
        <section className="panel">
          <nav className="tabs" role="tablist">
            {sheetFile && project.files[sheetFile] !== undefined && (
              <button role="tab" aria-selected={tab === "sheet"} className={tab === "sheet" ? "active" : ""} onClick={() => setTab("sheet")}>
                ◆ {ok?.sheets.find((x) => x.file === sheetFile)?.sheet.name ?? "Sheet"}
              </button>
            )}
            {PANEL_GROUPS.map((g) => (
              <button key={g.id} role="tab" aria-selected={g.tabs.includes(tab)} className={g.tabs.includes(tab) ? "active" : ""} onClick={() => setTab(g.tabs.includes(tab) ? tab : g.tabs[0])}>
                <Icon name={g.icon} size={14} />{g.label}
              </button>
            ))}
          </nav>
          {PANEL_GROUPS.filter((g) => g.tabs.includes(tab) && g.tabs.length > 1).map((g) => (
            <div key={g.id} className="subtabs" role="tablist">
              {g.tabs.map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{TAB_NAMES[t]}</button>
              ))}
            </div>
          ))}
          <div className="panel-body" data-testid="panel">
            {"error" in result ? (
              <div className="error-box">Project settings can't be read: {result.error}</div>
            ) : tab === "sheet" && sheetFile && project.files[sheetFile] !== undefined ? (
              <SheetForm
                key={sheetFile}
                text={project.files[sheetFile]}
                usage={sheetUsageFor(sheetFile)}
                onChange={(t) => setFile(sheetFile, t)}
                onJump={(f, line) => { setFileName(f); setJump({ line, n: Date.now() }); setMobile("write"); }}
                onClose={() => { setSheetFile(null); setTab("play"); }}
                onDraftPrompt={draftPrompt}
                onRename={(n) => renameSheetTo(sheetFile, n)}
              />
            ) : tab === "backups" ? (
              <BackupsPanel project={project.id} version={backupVersion} onBackUpNow={() => void backUp(project, true)} onRestore={restoreBackup}
                onSaveFile={(b) => void saveAsProjectFile(b.files, `${b.name} ${new Date(b.at).toISOString().slice(0, 16).replace("T", " ").replace(":", "")}`)}
                onSaveProjectFile={() => void saveAsProjectFile(project.files)} onOpenProjectFile={() => void openProject()} />
            ) : tab === "checks" ? (
              <ChecksPanel files={project.files} script={isScript ? file : null} busy={!!busy} onRun={(w) => void runCheck(w)} onOpen={openAt} onDismiss={dismissIssue} />
            ) : tab === "search" ? (
              <SearchPanel files={project.files} onOpen={openAt} onReplace={applyReplace} />
            ) : tab === "play" || tab === "book" || tab === "sheet" ? (
              focus ? (
                tab === "book" ? (
                  <BookView title={focus.title} nodes={focus.nodes} cfg={result.config} />
                ) : (
                  <div className="preview">
                    <div className="preview-title">{focus.title}</div>
                    <PreviewNodes nodes={focus.nodes} cfg={result.config} />
                  </div>
                )
              ) : (
                <div className="empty">
                  <img src={theme.brand.icon} alt="" />
                  <p>Start writing. The scene under your cursor shows here.</p>
                </div>
              )
            ) : tab === "renpy" ? (
              <pre className="code">{script ? result.files[`renpy/${slug(script.file.replace(/\.[^.]+$/, ""))}.rpy`] ?? "" : result.files["renpy/intent_defs.rpy"]}</pre>
            ) : tab === "mv" ? (
              <MvView json={result.files["mv/CommonEvents.intent.json"]} />
            ) : tab === "history" ? (
              <HistoryPanel project={project.id} file={shown} text={project.files[shown] ?? ""} version={historyVersion}
                onRestore={(t) => { setFile(shown, t); say("Version restored. The text before it is saved in History."); }} />
            ) : tab === "report" ? (
              <pre className="code wrap">{result.files["renpy/REPORT.md"]}{"\n\n"}{result.files["mv/REPORT.md"]}</pre>
            ) : (
              <pre className="code">{result.files["bible.json"]}</pre>
            )}
          </div>
        </section>
      )}

      <nav className="mobile-nav">
        {(["files", "write", "preview"] as MobileView[]).map((m) => (
          <button key={m} className={mobile === m ? "active" : ""} onClick={() => setMobile(m)}>
            {{ files: "Files", write: "Write", preview: "Read" }[m]}
          </button>
        ))}
      </nav>

      {popMenu && (
        <div className="ctx-back" onClick={() => setPopMenu(null)}>
          <div className="ctx-menu" role="menu" style={{ left: Math.min(popMenu.x, window.innerWidth - 250), top: Math.min(popMenu.y, window.innerHeight - 40 * popMenu.items.length - 20) }} onClick={(e) => e.stopPropagation()}>
            {popMenu.items.map((it) => (
              <button key={it.label} role="menuitem" className={it.danger ? "danger" : ""} onClick={() => { setPopMenu(null); it.run(); }}>{it.label}</button>
            ))}
          </div>
        </div>
      )}
      {menu && (
        <div className="ctx-back" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}>
          <div className="ctx-menu" role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 220) }} onClick={(e) => e.stopPropagation()}>
            {menu.link && !menu.link.stub ? (
              <>
                <div className="ctx-title">“{menu.text}” · {SHEET_KINDS[menu.link.kind as SheetKind].label}</div>
                <button role="menuitem" onClick={() => { openSheet(menu.link!.file); setMenu(null); }}>
                  <i className={`kind-dot k-${menu.link.kind}`} />Open sheet
                </button>
                <button role="menuitem" onClick={() => { const f = menu.link!.file; setMenu(null); renameAny(f); }}>
                  <i className="kind-dot" />Rename everywhere…
                </button>
                <button role="menuitem" onClick={() => { setNoLink(menu.text, true); setMenu(null); say(`“${menu.text}” is plain text now. Undo in Project settings (noLink).`); }}>
                  <i className="kind-dot" />Plain text, not a link
                </button>
                <div className="ctx-sep">Change type to</div>
                {(Object.keys(SHEET_KINDS) as SheetKind[]).filter((k) => k !== menu.link!.kind).map((k) => (
                  <button key={k} role="menuitem" onClick={() => { changeKind(menu.link!.file, k); setMenu(null); }}>
                    <i className={`kind-dot k-${k}`} />{SHEET_KINDS[k].label}
                  </button>
                ))}
              </>
            ) : menu.link?.stub ? (
              <>
                <div className="ctx-title">“{menu.text}” · no sheet yet</div>
                {(Object.keys(SHEET_KINDS) as SheetKind[]).map((k) => (
                  <button key={k} role="menuitem" onClick={() => { createSheet(k, menu.text); setMenu(null); }}>
                    <i className={`kind-dot k-${k}`} />Create {SHEET_KINDS[k].label}…
                  </button>
                ))}
                <button role="menuitem" onClick={() => { setNoLink(menu.text, true); setMenu(null); }}>
                  <i className="kind-dot" />Plain text, not a link
                </button>
              </>
            ) : (
              <>
                <div className="ctx-title">“{menu.text}”</div>
                {(Object.keys(SHEET_KINDS) as SheetKind[]).map((k) => (
                  <button key={k} role="menuitem" onClick={() => { createSheet(k, menu.text); setMenu(null); }}>
                    <i className={`kind-dot k-${k}`} />Create {SHEET_KINDS[k].label}…
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
      {reviewing && (
        <div className="modal-back" onClick={() => setReviewing(null)}>
          <div className="modal wide" role="dialog" aria-label="Review the update" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>✦ Update {VERSION_NAMES[reviewing.to]} from {VERSION_NAMES[reviewing.from]}</h2>
              <button className="icon" onClick={() => setReviewing(null)} aria-label="Close">✕</button>
            </div>
            <p className="muted">Green lines are added to {VERSION_NAMES[reviewing.to]}, red lines are removed. Nothing changes until you accept; the old text goes to History.</p>
            <div className="diff review-diff">
              {lineDiff(reviewing.before, reviewing.after).map((l, k) => (
                <div key={k} className={`diff-${l.op}`}>{l.op === "add" ? "+ " : l.op === "del" ? "− " : "  "}{l.text || " "}</div>
              ))}
            </div>
            {reviewing.before === reviewing.after && <p className="muted">No changes needed: the two are already in step.</p>}
            <div className="modal-actions">
              <button onClick={() => setReviewing(null)}>Not now</button>
              <button className="primary" data-testid="review-accept" onClick={() => acceptUpdate(reviewing)}>Accept</button>
            </div>
          </div>
        </div>
      )}
      {connectOpen && (
        <ConnectClaude folder={project.folder} hasKey={!!apiKey}
          onSettings={() => { setConnectOpen(false); setSettingsOpen(true); }}
          onKeepInFolder={() => { setConnectOpen(false); void keepInFolder(); }}
          onSetUpClaudeCode={() => void setUpClaudeCode()}
          onClose={() => setConnectOpen(false)} />
      )}
      {handoff && (
        <HandoffModal
          job={handoff.job}
          onAnswer={(v) => { handoff.resolve(v); setHandoff(null); }}
          onCancel={() => { handoff.reject(CANCELLED); setHandoff(null); }}
          onUseKey={apiKey ? () => { const h = handoff; setHandoff(null); setBusy(`Claude: ${h.job.title}…`); runJob(apiKey, model, h.job).then(h.resolve, h.reject).finally(() => setBusy(null)); } : undefined}
        />
      )}
      {settingsOpen && <Settings prefs={prefs} setPrefs={setPrefs} theme={theme} apiKey={apiKey} setApiKey={(k) => { saveApiKey(k); setApiKey(k.trim()); }} model={model} setModel={(m) => { saveModel(m); setModel(m); }} via={via} setVia={(v) => { saveVia(v); setVia(v); }} onClose={() => setSettingsOpen(false)} />}
      {busy && <div className="busy" role="status"><span className="spinner" />{busy}</div>}
      {toast && (
        <div className="toast" role="status">
          {toast}
          {toastAction && (
            <button className="link" onClick={() => { toastAction.run(); setToastAction(null); setToast(""); }}>{toastAction.label}</button>
          )}
        </div>
      )}
    </div>
  );
}

const MV_NAMES: Record<number, string> = {
  101: "Text", 401: "", 102: "Choices", 402: "When", 404: "End", 111: "If", 411: "Else", 412: "End",
  117: "Common event", 121: "Switch", 122: "Variable", 125: "Gold", 126: "Item", 108: "Comment",
  214: "Erase event", 221: "Fade out", 222: "Fade in", 225: "Shake", 230: "Wait", 231: "Picture",
  232: "Move picture", 235: "Erase picture", 241: "BGM", 242: "Fade BGM", 250: "SE", 355: "Script", 356: "Plugin",
};

function MvView({ json }: { json: string }) {
  const events: Array<{ id: number; name: string; list: Array<{ code: number; indent: number; parameters: unknown[] }> }> = JSON.parse(json);
  return (
    <div className="mv">
      {events.map((e) => (
        <details key={e.id} open={events.length < 4}>
          <summary>#{e.id} {e.name}</summary>
          <div className="mv-list">
            {e.list.filter((c) => c.code !== 0).map((c, k) => (
              <div key={k} className="mv-cmd" style={{ paddingLeft: 8 + c.indent * 16 }}>
                {c.code === 401 ? <span className="mv-text">{String(c.parameters[0])}</span> : (
                  <>
                    <span className="mv-code">◆{MV_NAMES[c.code] ?? c.code}</span>{" "}
                    <span className="muted">{c.code === 402 ? String(c.parameters[1]) : c.code === 101 ? String(c.parameters[0] || "") : JSON.stringify(c.parameters).slice(1, -1).slice(0, 90)}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function Settings({ prefs, setPrefs, theme, apiKey, setApiKey, model, setModel, via, setVia, onClose }: { prefs: UiPrefs; setPrefs: (p: UiPrefs) => void; theme: Theme; apiKey: string; setApiKey: (k: string) => void; model: ClaudeModel; setModel: (m: ClaudeModel) => void; via: ClaudeVia; setVia: (v: ClaudeVia) => void; onClose: () => void }) {
  const [keyDraft, setKeyDraft] = useState("");
  const custom: Theme = prefs.custom ?? { ...structuredClone(theme), id: "custom", label: "Custom" };
  const setCustom = (t: Theme) => setPrefs({ ...prefs, custom: t, themeId: "custom" });
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <h3>Theme</h3>
        <div className="theme-grid">
          {[...THEMES, ...(prefs.custom ? [prefs.custom] : [])].map((t) => (
            <button key={t.id} className={`theme-card ${prefs.themeId === t.id ? "active" : ""}`} onClick={() => setPrefs({ ...prefs, themeId: t.id })}
              style={{ background: t.colors.bg, color: t.colors.text, borderColor: prefs.themeId === t.id ? t.colors.accent : t.colors.border }}>
              <img src={t.brand.logo} alt="" />
              <span className="swatches">
                {[t.colors.accent, t.colors.speaker, t.colors.stage, t.colors.block].map((c) => <i key={c} style={{ background: c }} />)}
              </span>
              {t.label}
            </button>
          ))}
        </div>
        <details className="custom-theme">
          <summary>Customise colours and brand</summary>
          <div className="form-grid">
            <label>Brand name<input value={custom.brand.name} onChange={(e) => setCustom({ ...custom, brand: { ...custom.brand, name: e.target.value } })} /></label>
            <label>Product name<input value={custom.brand.product} onChange={(e) => setCustom({ ...custom, brand: { ...custom.brand, product: e.target.value } })} /></label>
            <label>Tagline<input value={custom.brand.tagline} onChange={(e) => setCustom({ ...custom, brand: { ...custom.brand, tagline: e.target.value } })} /></label>
            <label>Logo<input type="file" accept="image/*" onChange={(e) => readImage(e.target.files?.[0], (logo) => setCustom({ ...custom, brand: { ...custom.brand, logo } }))} /></label>
            <label>Icon<input type="file" accept="image/*" onChange={(e) => readImage(e.target.files?.[0], (icon) => setCustom({ ...custom, brand: { ...custom.brand, icon } }))} /></label>
            <label>Dark<input type="checkbox" checked={custom.dark} onChange={(e) => setCustom({ ...custom, dark: e.target.checked })} /></label>
            {(Object.keys(custom.colors) as Array<keyof Theme["colors"]>).map((k) => (
              <label key={k}>{k}<input type="color" value={custom.colors[k]} onChange={(e) => setCustom({ ...custom, colors: { ...custom.colors, [k]: e.target.value } })} /></label>
            ))}
          </div>
        </details>
        <h3>Layout</h3>
        <div className="form-grid">
          <label>Output panel
            <select value={prefs.sidePanel} onChange={(e) => setPrefs({ ...prefs, sidePanel: e.target.value as UiPrefs["sidePanel"] })}>
              <option value="right">Right</option>
              <option value="bottom">Bottom</option>
              <option value="hidden">Hidden</option>
            </select>
          </label>
          <label>Editor text size
            <input type="range" min={12} max={22} value={prefs.editorSize} onChange={(e) => setPrefs({ ...prefs, editorSize: Number(e.target.value) })} />
          </label>
          <label>Show outline<input type="checkbox" checked={prefs.showOutline} onChange={(e) => setPrefs({ ...prefs, showOutline: e.target.checked })} /></label>
          <label>Wrap long lines<input type="checkbox" checked={prefs.wrap} onChange={(e) => setPrefs({ ...prefs, wrap: e.target.checked })} /></label>
        </div>
        <h3>Claude</h3>
        <div className="claude-key">
          <p className="muted">Claude keeps Draft, Play and Code in step (✦ Update), checks your story, and drafts image and song prompts. Choose how Intent asks it:</p>
          <div className="model-pick" role="radiogroup" aria-label="How Intent asks Claude">
            <button role="radio" aria-checked={via === "paste" || !apiKey} className={via === "paste" || !apiKey ? "on" : ""} onClick={() => setVia("paste")}>
              <b>Copy and paste</b>
              <span>No key needed. Intent copies each request; you paste it into the Claude app, claude.ai or Claude Code, then paste the answer back.</span>
            </button>
            <button role="radio" aria-checked={via === "api" && !!apiKey} className={via === "api" && apiKey ? "on" : ""} onClick={() => setVia("api")}>
              <b>My API key</b>
              <span>One click, done in the app. Billed to your Anthropic account.</span>
            </button>
          </div>
          <p className="muted">
            The key stays on this device: it is never saved in your project or its exports. Get one at console.anthropic.com → API keys.
          </p>
          {apiKey ? (
            <div className="row">
              <span className="chip">Key added · ends in {apiKey.slice(-4)}</span>
              <button onClick={() => setApiKey("")}>Remove key</button>
            </div>
          ) : (
            <div className="row">
              <input type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} aria-label="Anthropic API key" />
              <button className="primary" disabled={!keyDraft.trim()} onClick={() => { setApiKey(keyDraft); setKeyDraft(""); }}>Save key</button>
            </div>
          )}
          <div className="model-pick" role="radiogroup" aria-label="Claude model">
            {CLAUDE_MODELS.map((m) => (
              <button key={m.id} role="radio" aria-checked={model === m.id} className={model === m.id ? "on" : ""} onClick={() => setModel(m.id)}>
                <b>{m.label}</b>
                <span>{m.note}</span>
              </button>
            ))}
          </div>
        </div>
        <footer className="about">
          <img src={theme.brand.logo} alt={theme.brand.name} />
          <span>{theme.brand.product} {__APP_VERSION__} · {theme.brand.tagline}</span>
        </footer>
      </div>
    </div>
  );
}

function readImage(file: File | undefined, done: (dataUrl: string) => void) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => typeof r.result === "string" && done(r.result);
  r.readAsDataURL(file);
}
