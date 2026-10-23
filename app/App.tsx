import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { DataBlock, Node, Scene } from "../src/core/ast.ts";
import { AUTHORS_FILE } from "../src/core/authors.ts";
import { CHECKS_FILE, readChecks, writeChecks } from "../src/core/checks.ts";
import { conditionText } from "../src/core/condition.ts";
import { retireNotes } from "../src/core/fill.ts";
import { choicesIn, choose, LEVELS, LEVELS_FILE, passages, readLevels, storyOnly, taggedLevel, toWrite, writeLevels, type Choice, type Level } from "../src/core/levels.ts";
import { saveSnapshot } from "./history.ts";
import { toLayer } from "../src/core/layers.ts";
import { mvVersionText } from "../src/core/mvVersion.ts";
import { parseScript, slug } from "../src/core/parser.ts";
import { assetsFromMv, assetsFromRenpy } from "../src/core/assets.ts";
import { clueBoard } from "../src/core/mystery.ts";
import { manuscript, manuscriptWords, type ManuscriptOptions } from "../src/core/manuscript.ts";
import { sheetNames, sheetUsage, type SheetKind } from "../src/core/sheets.ts";
import { inSync, markSynced, neighbours, pairOf, pairState, SYNC_FILE, versionFile, versionOf, type Version } from "../src/core/sync.ts";
import { compileProject, exportWithVersions, type CompileResult } from "../src/project.ts";
import { Editor, type Insertion } from "./Editor.tsx";
import type { Format } from "./format.ts";
import { Icon } from "./Icon.tsx";
import { LinkMenu, type LinkMenuAt } from "./LinkMenu.tsx";
import { DiffReview, PopMenu, TogetherModal, type Pop, type PopItem, type Together } from "./Modals.tsx";
import { BookView, PreviewNodes } from "./Preview.tsx";
import { LayerBar, SheetBar, SyncBar, VERSION_NAMES } from "./ScriptBars.tsx";
import { SheetForm } from "./SheetForm.tsx";
import { SidePanel, type Tab } from "./SidePanel.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { WriterBar } from "./WriterBar.tsx";
import { GoalsModal, useTodayWords, WordBar } from "./WordBar.tsx";
import { countWords, playWords, projectWords, readGoals, writeGoals } from "../src/core/words.ts";
import { deliverExport, whenSaveFails, isPhone, isTauri, playtestRenpy, saveBinaryAs, launchFile, launchProject, loadPrefs, openFiles, savePrefs, saveFileAs, type Project } from "./storage.ts";
import { activeTheme, applyTheme, DEFAULT_PREFS, TEXT_SIZES, type UiPrefs } from "./themes.ts";
import type { LinkTarget } from "./intentMode.ts";
import { useBackups } from "./hooks/useBackups.ts";
import { useClaude } from "./hooks/useClaude.ts";
import { claudeIn, useClaudeActions } from "./hooks/useClaudeActions.ts";
import { useFileActions } from "./hooks/useFileActions.ts";
import { useFolderSync } from "./hooks/useFolderSync.ts";
import { useProjectIO } from "./hooks/useProjectIO.ts";
import { firstScript, useProjects } from "./hooks/useProjects.ts";
import { useToast } from "./hooks/useToast.ts";

// Panels and dialogs load when first opened, so the first download is just the editor.
const AssetsPanel = lazy(() => import("./AssetsPanel.tsx").then((m) => ({ default: m.AssetsPanel })));
const BackupsPanel = lazy(() => import("./BackupsPanel.tsx").then((m) => ({ default: m.BackupsPanel })));
const ChecksPanel = lazy(() => import("./ChecksPanel.tsx").then((m) => ({ default: m.ChecksPanel })));
const ConnectClaude = lazy(() => import("./ConnectClaude.tsx").then((m) => ({ default: m.ConnectClaude })));
const HandoffModal = lazy(() => import("./HandoffModal.tsx").then((m) => ({ default: m.HandoffModal })));
const HistoryPanel = lazy(() => import("./HistoryPanel.tsx").then((m) => ({ default: m.HistoryPanel })));
const ClueBoard = lazy(() => import("./ClueBoard.tsx").then((m) => ({ default: m.ClueBoard })));
const ManuscriptPanel = lazy(() => import("./ManuscriptPanel.tsx").then((m) => ({ default: m.ManuscriptPanel })));
const MvView = lazy(() => import("./MvView.tsx").then((m) => ({ default: m.MvView })));
const SearchPanel = lazy(() => import("./SearchPanel.tsx").then((m) => ({ default: m.SearchPanel })));
const Settings = lazy(() => import("./Settings.tsx").then((m) => ({ default: m.Settings })));

type MobileView = "files" | "write" | "preview";

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
  const { projects, setProjects, latest, setFiles } = useProjects();
  const [projectId, setProjectId] = useState(() => projects[0].id);
  const project = projects.find((p) => p.id === projectId) ?? projects[0];
  const [fileName, setFileName] = useState(() => firstScript(project));
  const file = project.files[fileName] !== undefined ? fileName : firstScript(project);
  const [cursorLine, setCursorLine] = useState(1);
  const [tab, setTab] = useState<Tab>("play");
  const [jump, setJump] = useState<{ line: number; n: number } | null>(null);
  const jumpTo = (line: number) => setJump({ line, n: Date.now() });
  const [insertion, setInsertion] = useState<Insertion | null>(null);
  const [formatCmd, setFormatCmd] = useState<{ kind: Format; n: number } | null>(null);
  // Focus: only the page, nothing else on screen.
  const [focusMode, setFocusMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobile, setMobile] = useState<MobileView>("write");
  const [sheetFile, setSheetFile] = useState<string | null>(null);
  const [rawSheet, setRawSheet] = useState(false);
  const [menu, setMenu] = useState<LinkMenuAt | null>(null);
  // Seamless layer tabs: the file seen as Draft, Play (the source) or Ren'Py.
  const [layer, setLayer] = useState<Version>("play");
  const [historyVersion, setHistoryVersion] = useState(0);
  const bumpHistory = () => setHistoryVersion((v) => v + 1);
  const [moreOpen, setMoreOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [popMenu, setPopMenu] = useState<Pop | null>(null);
  const [together, setTogether] = useState<Together | null>(null);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const pop = (e: React.MouseEvent, items: PopItem[]) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setPopMenu({ x: r.left, y: r.bottom + 4, items });
  };

  const { toast, action: toastAction, say, runAction } = useToast();
  const claude = useClaude();
  const { busy } = claude;
  const { backupVersion, backUp, backUpBefore } = useBackups(latest, say);
  const { reloadFolder, onDisk } = useFolderSync(projects, latest, project, setFiles, say);

  useEffect(() => {
    whenSaveFails(() => say("This device refused to save your work (storage full or private mode). Use Save as file or Export to keep it.", 60_000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const theme = activeTheme(prefs);
  useEffect(() => {
    applyTheme(theme, prefs);
    savePrefs(prefs);
  }, [theme, prefs]);

  const openProjectAt = (p: Project) => {
    setProjectId(p.id);
    setFileName(firstScript(p));
  };
  const io = useProjectIO({ project, projects, latest, setProjects, setFiles, open: openProjectAt, onDisk, backUpBefore, say });

  const result = useMemo(() => safeCompile(project), [project]);
  const ok = "files" in result ? result : null;
  const script = ok?.scripts.find((s) => s.file === file);
  const diagnostics = script?.diagnostics ?? [];
  const errors = ok ? ok.diagnostics.filter((d) => d.level === "error").length : 1;
  const warnings = ok ? ok.diagnostics.filter((d) => d.level === "warning").length : 0;

  const update = (text: string) => setFiles(project.id, (now) => ({ ...now, [file]: text }));

  // Draft, Play and Code are separate texts. Play is the script file itself;
  // a missing Draft, Code or MV is made from Play for free the first time it's opened.
  // MV appears for projects that export to RPG Maker MV.
  const isScript = file.endsWith(".intent");
  const versions: Version[] = ok?.config.targets.includes("mv") ? ["draft", "play", "renpy", "mv"] : ["draft", "play", "renpy"];
  const shownLayer: Version = versions.includes(layer) ? layer : "play";
  const vFile = (v: Version) => versionFile(file, v);
  const shown = isScript ? vFile(shownLayer) : file;
  // What Intent itself writes for Code or MV from this Play text.
  const compiledVersion = (v: "renpy" | "mv", src: string) => {
    if (!ok) return "";
    const settings = JSON.parse(project.files["intent.json"] || "{}");
    if (v === "mv") {
      // The whole project, so ids match the export.
      const all = Object.fromEntries(Object.entries(project.files).filter(([n]) => n.endsWith(".intent") || n.endsWith(".sheet")));
      const r = compileProject(settings, { ...all, [file]: src }, ["mv"]);
      return r.mv ? mvVersionText(r.mv, file) : "";
    }
    const one = compileProject(settings, { ...Object.fromEntries(Object.entries(project.files).filter(([n]) => n.endsWith(".sheet"))), [file]: src }, ["renpy"]);
    return one.files[`renpy/${slug(file.replace(/\.[^.]+$/, ""))}.rpy`] ?? "";
  };
  useEffect(() => {
    if (!isScript || layer === "play" || !ok || !versions.includes(layer) || project.files[vFile(layer)] !== undefined) return;
    const play = project.files[file] ?? "";
    const text = layer === "draft" ? toLayer("draft", play, parseScript(play, ok.config, file), ok.config).text : compiledVersion(layer, play);
    const files = { ...project.files, [vFile(layer)]: text };
    files[SYNC_FILE] = markSynced(files, file, pairOf("play", layer)!, { play, [layer]: text });
    setFiles(project.id, files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScript, layer, file, ok]);
  const states = isScript ? neighbours(shownLayer).filter((n) => versions.includes(n)).map((n) => ({ n, s: pairState(project.files, file, shownLayer, n) })) : [];
  const behind = (v: Version) => isScript && neighbours(v).some((n) => { const st = pairState(project.files, file, v, n); return !st.missing && !inSync(st); });

  const ai = useClaudeActions({ project, file, isScript, ok, latest, setFiles, say, busy, askClaude: claude.askClaude, bumpHistory, compiledVersion });
  const claudeShown = useMemo(() => (isScript && layer === "draft" ? claudeIn(project.files, vFile("draft")) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isScript, layer, file, project.files[vFile("draft")], project.files[AUTHORS_FILE]]);
  // Intent writing: the writer's choices of level for the Draft, and how much is left to unfold.
  const draftFile = vFile("draft");
  const draftText = project.files[draftFile] ?? "";
  const draftChoices = useMemo(() => choicesIn(draftText, readLevels(project.files)[draftFile]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftFile, draftText, project.files[LEVELS_FILE]]);
  const draftOpen = useMemo(() => (isScript && layer === "draft" ? toWrite(passages(draftText, draftChoices)).open : 0), [isScript, layer, draftText, draftChoices]);
  const saveChoices = (choices: Choice[], doc: string) => {
    setFiles(project.id, (now) => {
      if ((now[draftFile] ?? "") !== doc) return now;
      const files = { ...now };
      const json = writeLevels(files, draftFile, doc, choices);
      if (json) files[LEVELS_FILE] = json;
      else delete files[LEVELS_FILE];
      return files;
    });
  };
  const pickLevel = (at: { lineFrom: number; level: Level; chosen: boolean; x: number; y: number }) => {
    const line = draftText.slice(at.lineFrom, (draftText.indexOf("\n", at.lineFrom) + 1 || draftText.length + 1) - 1);
    // Written is what an untagged line already is: choosing it on such a line just clears the choice.
    const set = (level: Level) => saveChoices(choose(draftChoices, draftText, at.lineFrom, { level: level === taggedLevel(line) ? null : level }), draftText);
    const item = (l: Level, label: string) => ({ label: `${at.level === l ? "✓ " : ""}${label}`, run: () => set(l) });
    setPopMenu({ x: at.x, y: at.y, items: [
      item("written", `${LEVELS.written.label}: keep it as it is`),
      item("intent", `${LEVELS.intent.label}: Claude writes it out`),
      item("request", `${LEVELS.request.label}: an ask for Claude`),
    ] });
  };
  // {{ notes }} are retired: an old one becomes a line of its own the first time its Draft opens.
  useEffect(() => {
    if (!isScript || layer !== "draft") return;
    const before = project.files[draftFile];
    if (!before?.includes("{{")) return;
    const after = retireNotes(before);
    if (after === before) return;
    saveSnapshot(project.id, draftFile, before, "Before {{ notes }} became lines");
    bumpHistory();
    setFiles(project.id, (now) => (now[draftFile] === before ? { ...now, [draftFile]: after } : now));
    say("Your {{ notes }} are intent lines now (starting with \\): ✦ Unfold writes them out. The text before is in History.", 9000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScript, layer, draftFile, project.id]);

  // The writer (or Claude Code) already brought the versions in step by hand.
  const markInStep = () => {
    let files = { ...project.files };
    for (const { n, s } of states) {
      if (s.missing || inSync(s)) continue;
      files = { ...files, [SYNC_FILE]: markSynced(files, file, pairOf(shownLayer, n)!, { [shownLayer]: files[vFile(shownLayer)], [n]: files[vFile(n)] }) };
    }
    setFiles(project.id, files);
    say("Marked as in step.");
  };

  const openSheet = (f: string) => {
    setSheetFile(f);
    setTab("sheet");
    setMobile("preview");
  };
  const fx = useFileActions({ project, file, ok, cursorLine, sheetFile, setFiles, say, bumpHistory, setFileName, setSheetFile, openSheet });
  const { setFile } = fx;
  const dismissIssue = (issueId: string, on: boolean) => {
    const c = readChecks(project.files);
    c.dismissed = on ? [...new Set([...c.dismissed, issueId])] : c.dismissed.filter((d) => d !== issueId);
    setFile(CHECKS_FILE, writeChecks(c));
  };

  // Names the writer turned back into plain text (false positives), kept in intent.json.
  const noLink = useMemo(() => {
    try {
      return new Set<string>((JSON.parse(project.files["intent.json"] || "{}").noLink ?? []).map((n: string) => n.toLowerCase()));
    } catch {
      return new Set<string>();
    }
  }, [project.files]);

  // The names of the sheets the writer made. Nothing is guessed from the text.
  const links = useMemo<LinkTarget[]>(() => {
    if (!ok) return [];
    return ok.sheets.flatMap(({ file: f, sheet }) => sheetNames(sheet).map((name) => ({ name, kind: sheet.kind, file: f }))).filter((l) => !noLink.has(l.name.toLowerCase()));
  }, [ok, noLink]);

  const sheetUsageFor = (f: string) => {
    const entry = ok?.sheets.find((x) => x.file === f);
    return entry && ok ? sheetUsage(entry.sheet, ok.scripts) : null;
  };
  const openLink = (t: LinkTarget) => (t.stub ? fx.createSheet(t.kind as SheetKind, t.name) : openSheet(t.file));

  // Bigger steps at bigger sizes, so 72px is a few taps away.
  const textSize = (by: number) => setPrefs((p) => {
    const from = by > 0 ? p.editorSize : p.editorSize - 1;
    const step = from < 20 ? 1 : from < 36 ? 2 : 4;
    return { ...p, editorSize: Math.min(TEXT_SIZES.max, Math.max(TEXT_SIZES.min, p.editorSize + by * step)) };
  });
  const showFiles = prefs.showFiles !== false;
  const togglePanel = () => setPrefs((p) => (p.sidePanel === "hidden" ? { ...p, sidePanel: p.panelLast ?? "right" } : { ...p, panelLast: p.sidePanel, sidePanel: "hidden" }));
  // Dragging the edge of the files column or the panel: the size follows the pointer and is remembered.
  const resize = (what: "files" | "panel") => (e: React.PointerEvent) => {
    e.preventDefault();
    const app = (e.currentTarget as HTMLElement).closest(".app")!.getBoundingClientRect();
    const bottom = prefs.sidePanel === "bottom";
    const move = (m: PointerEvent) => setPrefs((p) => what === "files"
      ? { ...p, filesWidth: Math.round(Math.min(480, Math.max(160, m.clientX - app.left))) }
      : { ...p, panelSize: Math.round(bottom ? Math.min(app.height - 200, Math.max(140, app.bottom - m.clientY)) : Math.min(app.width - 420, Math.max(280, app.right - m.clientX))) });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("resizing");
    };
    document.body.classList.add("resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const layoutVars = {
    ...(!showFiles ? { "--files-w": "0px" } : prefs.filesWidth ? { "--files-w": `${prefs.filesWidth}px` } : {}),
    ...(prefs.panelSize ? { "--panel-size": `${prefs.panelSize}px` } : {}),
  } as React.CSSProperties;

  const openSearch = () => {
    setTab("search");
    setMobile("preview");
    if (prefs.sidePanel === "hidden") setPrefs({ ...prefs, sidePanel: "right" });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        openSearch();
      } else if (mod && e.key === ".") {
        e.preventDefault();
        setFocusMode((f) => !f);
      } else if (e.key === "Escape" && focusMode && !document.querySelector(".modal-back, .pop-menu")) {
        setFocusMode(false);
      } else if (mod && !e.shiftKey && (e.key === "=" || e.key === "+" || e.key === "-")) {
        // Bigger or smaller text, for tired eyes.
        e.preventDefault();
        textSize(e.key === "-" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const openAt = (f: string, line: number) => {
    const v = versionOf(f);
    setFileName(v ? versionFile(f.replace(/\.(draft|rpy|mv\.json)$/, ".intent"), "play") : f);
    if (v) setLayer(v);
    if (f.endsWith(".sheet")) setRawSheet(true);
    jumpTo(line);
    setMobile("write");
  };

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

  const totalWords = useMemo(() => (ok ? projectWords(project.files, ok.scripts) : null), [ok, project.files]);
  const hereWords = !isScript ? null : layer === "draft" ? countWords(project.files[vFile("draft")] ?? "") : layer === "play" && script ? playWords(script) : null;
  const goals = readGoals(project.files["intent.json"]);
  const today = useTodayWords(project.id);
  const edit = (name: string, text: string) => {
    if (/\.(draft|intent)$/.test(name)) today.add(countWords(text) - countWords(project.files[name] ?? ""));
    setFile(name, text);
  };

  const insertBlock = (kind: "draft" | "renpy" | "mv") => {
    const lines = (project.files[file] ?? "").split("\n");
    const hint = { draft: "Write freely here, like a book.", renpy: "# Ren'Py code, passed through as is", mv: "// MV script call, passed through as is" }[kind];
    const at = Math.min(cursorLine, lines.length);
    lines.splice(at, 0, "", `::: ${kind}`, hint, ":::", "");
    update(lines.join("\n"));
    jumpTo(at + 3);
  };

  // Double-clicking a .intent file (or a .intentproj project) on Windows opens the app with it.
  useEffect(() => {
    launchFile().then((f) => f && fx.addFiles({ [f.name]: f.text }));
    launchProject().then((data) => data && void io.openProject(data), () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // What Export writes: Code and MV versions kept in step with Play go out as they are.
  const exportFiles = useMemo(() => (ok ? exportWithVersions(ok, project.files) : null), [ok, project.files]);
  const assets = useMemo(() => {
    if (!exportFiles) return { renpy: [], mv: [] };
    const scriptOf = new Map(Object.keys(project.files).filter((n) => n.endsWith(".intent")).map((f) => [`renpy/${slug(f.replace(/\.[^.]+$/, ""))}.rpy`, f]));
    return {
      renpy: assetsFromRenpy(Object.fromEntries(Object.entries(exportFiles).filter(([n]) => scriptOf.has(n))), (n) => scriptOf.get(n) ?? n),
      mv: assetsFromMv(Object.fromEntries(Object.entries(exportFiles).filter(([n]) => n.startsWith("mv/")))),
    };
  }, [exportFiles, project.files]);

  const playtest = async () => {
    if (!ok || !exportFiles) return say("Fix intent.json first");
    if (errors) say(`${errors} error${errors > 1 ? "s" : ""} in the scripts: Ren'Py may stop on them.`, 6000);
    try {
      if ((await playtestRenpy(project.id, exportFiles)) === "started") say("Ren'Py is starting your game. The scripts are in its game/ folder.", 8000);
    } catch (e) {
      say(`Couldn't start Ren'Py: ${e instanceof Error ? e.message : String(e)}`, 10000);
    }
  };
  const canPlaytest = isTauri() && !isPhone();

  const doExport = async () => {
    if (!ok || !exportFiles) return say("Fix intent.json first");
    await deliverExport(project.name, exportFiles);
    say(isTauri() ? "Exported" : "Export downloaded");
  };

  // Export → Manuscript: each script's Draft in order, or its Play as prose when there's no Draft yet.
  const manuscriptSource = () => {
    const settings = (() => { try { return JSON.parse(project.files["intent.json"] || "{}"); } catch { return {}; } })();
    const drafts = (ok?.scripts ?? []).map((s) => s.file).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((f) => {
      const draft = project.files[versionFile(f, "draft")];
      const play = project.files[f] ?? "";
      // Requests to Claude are never part of the book.
      const story = draft === undefined ? undefined : storyOnly(draft, choicesIn(draft, readLevels(project.files)[versionFile(f, "draft")]));
      return { file: f, fromPlay: draft === undefined, text: story ?? toLayer("draft", play, parseScript(play, ok!.config, f), ok!.config).text };
    });
    return { drafts, title: settings.title || project.name, author: settings.author || "" };
  };
  const makeManuscript = async (format: "docx" | "pdf", opts: ManuscriptOptions) => {
    const { drafts } = manuscriptSource();
    const blocks = manuscript(drafts.map((d) => d.text), opts);
    const words = manuscriptWords(blocks);
    try {
      const data = format === "docx"
        ? await (await import("../src/core/docx.ts")).docx(blocks, opts, words)
        : await (await import("./manuscriptPdf.ts")).manuscriptPdf(blocks, opts, words);
      const type = format === "docx" ? { label: "Word document", ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } : { label: "PDF", ext: "pdf", mime: "application/pdf" };
      if (await saveBinaryAs(opts.title || project.name, data, type)) say(isTauri() ? "Manuscript saved." : "Manuscript downloaded.");
    } catch (e) {
      say(`Couldn't make the manuscript: ${e instanceof Error ? e.message : String(e)}`, 8000);
    }
  };
  const setAuthor = (author: string) => {
    try {
      const settings = JSON.parse(project.files["intent.json"] || "{}");
      if (author.trim()) settings.author = author.trim();
      else delete settings.author;
      setFile("intent.json", JSON.stringify(settings, null, 2));
    } catch {
      // Settings that aren't valid JSON are shown as an error already.
    }
  };

  const projectActions = (
    <>
      <button className="side-btn" onClick={io.addProject}>New project</button>
      <button className="side-btn" onClick={(e) => pop(e, [
        { label: "Script or sheet…", run: () => void openFiles().then(fx.addFiles) },
        { label: "Project file…", run: () => void io.openProject() },
        ...(isTauri() ? [{ label: "Folder…", run: () => void io.openFolderProject() }] : []),
      ])}>Open ▾</button>
      <button className="side-btn" onClick={(e) => pop(e, [
        ...(!file.endsWith(".json") ? [{ label: `This file as… (${file.split("/").pop()})`, run: () => void saveFileAs(file, project.files[file] ?? "").then((done) => done && say(`Saved ${file.split("/").pop()}`)) }] : []),
        { label: "Project file…", run: () => void io.saveAsProjectFile(project.files) },
        ...(isTauri() && !project.folder ? [{ label: "Keep in a folder…", run: () => void io.keepInFolder() }] : []),
      ])}>Save ▾</button>
      <button className="side-btn" onClick={() => { setTab("backups"); setMobile("preview"); }}>Backups</button>
      {project.folder && <button className="side-btn" onClick={() => void reloadFolder(project, false)} title="Take changes made outside Intent">Reload</button>}
      <button className="side-btn" onClick={() => setConnectOpen(true)} data-testid="connect-claude">✦ Connect Claude</button>
    </>
  );

  const sheetOpen = sheetFile && project.files[sheetFile] !== undefined ? sheetFile : null;
  const panelBody = () => {
    if ("error" in result) return <div className="error-box">Project settings can't be read: {result.error}</div>;
    if (tab === "sheet" && sheetOpen) return (
      <SheetForm
        key={sheetOpen}
        text={project.files[sheetOpen]}
        usage={sheetUsageFor(sheetOpen)}
        onChange={(t) => setFile(sheetOpen, t)}
        onJump={(f, line) => { setFileName(f); jumpTo(line); setMobile("write"); }}
        onClose={() => { setSheetFile(null); setTab("play"); }}
        onDraftPrompt={ai.draftPrompt}
        onRename={(n) => fx.renameSheetTo(sheetOpen, n)}
      />
    );
    switch (tab) {
      case "assets": return <AssetsPanel project={project.id} byEngine={assets} onOpen={(f) => { setFileName(f); setMobile("write"); }} />;
      case "backups": return (
        <BackupsPanel project={project.id} version={backupVersion} onBackUpNow={() => void backUp(project, true)} onRestore={io.restoreBackup}
          onSaveFile={(b) => void io.saveAsProjectFile(b.files, `${b.name} ${new Date(b.at).toISOString().slice(0, 16).replace("T", " ").replace(":", "")}`)}
          onSaveProjectFile={() => void io.saveAsProjectFile(project.files)} onOpenProjectFile={() => void io.openProject()} />
      );
      case "checks": return <ChecksPanel files={project.files} script={isScript ? file : null} busy={!!busy} onRun={(w) => void ai.runCheck(w)} onOpen={openAt} onDismiss={dismissIssue} />;
      case "manuscript": return <ManuscriptPanel key={project.id} source={manuscriptSource()} busy={!!busy} onMake={(f, o) => void makeManuscript(f, o)} onAuthor={setAuthor} />;
      case "clues": return (
        <ClueBoard board={clueBoard(result.sheets, result.scripts)} onOpenSheet={openSheet} onOpen={openAt}
          onNewClue={() => { const n = prompt("New clue name"); if (n?.trim()) fx.createSheet("clue", n.trim()); }} />
      );
      case "search": return <SearchPanel files={project.files} onOpen={openAt} onReplace={fx.applyReplace} />;
      case "renpy": return <pre className="code">{script ? result.files[`renpy/${slug(script.file.replace(/\.[^.]+$/, ""))}.rpy`] ?? "" : result.files["renpy/intent_defs.rpy"]}</pre>;
      case "mv": return <MvView json={result.files["mv/CommonEvents.intent.json"]} />;
      case "history": return (
        <HistoryPanel project={project.id} file={shown} text={project.files[shown] ?? ""} version={historyVersion}
          onRestore={(t) => { setFile(shown, t); say("Version restored. The text before it is saved in History."); }} />
      );
      case "report": return <pre className="code wrap">{result.files["renpy/REPORT.md"]}{"\n\n"}{result.files["mv/REPORT.md"]}</pre>;
      case "bible": return <pre className="code">{result.files["bible.json"]}</pre>;
    }
    if (!focus) return (
      <div className="empty">
        <img src={theme.brand.icon} alt="" />
        <p>Start writing. The scene under your cursor shows here.</p>
      </div>
    );
    return tab === "book" ? <BookView title={focus.title} nodes={focus.nodes} cfg={result.config} /> : (
      <div className="preview">
        <div className="preview-title">{focus.title}</div>
        <PreviewNodes nodes={focus.nodes} cfg={result.config} />
      </div>
    );
  };

  return (
    <div style={layoutVars} className={`app side-${prefs.sidePanel} ${showFiles ? "" : "no-files"} ${focusMode ? "focus" : ""} ${prefs.showOutline ? "" : "no-outline"} ${prefs.showAuthors === false ? "no-authors" : ""} ${prefs.showLevels === false ? "no-levels" : ""} m-${mobile}`}>
      <header className="topbar">
        <div className="brand" title={`${theme.brand.name} ${theme.brand.product}`}>
          <img className="brand-logo" src={theme.brand.logo} alt={theme.brand.name} />
          <img className="brand-icon" src={theme.brand.icon} alt={theme.brand.name} />
          <span className="brand-divider" aria-hidden="true" />
          <span className="brand-product">{theme.brand.product}</span>
          <span className="brand-version" title={`Version ${__APP_VERSION__}${__APP_CODENAME__ ? ` “${__APP_CODENAME__}”` : ""}`}>{__APP_VERSION__.replace(/\.0$/, "")}</span>
        </div>
        <select className="project-picker" value={project.id} onChange={(e) => openProjectAt(projects.find((p) => p.id === e.target.value)!)} aria-label="Project">
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="spacer" />
        <div className="text-size" role="group" aria-label="Text size">
          <button className="icon" onClick={() => textSize(-1)} aria-label="Smaller text" title="Smaller text (Ctrl+−)" data-testid="text-smaller">A−</button>
          <button className="icon" onClick={() => textSize(1)} aria-label="Bigger text" title="Bigger text (Ctrl+=)" data-testid="text-bigger">A+</button>
        </div>
        <div className="view-toggles wide-only" role="group" aria-label="What you see">
          <button className={`icon ${showFiles ? "on" : ""}`} onClick={() => setPrefs((p) => ({ ...p, showFiles: !showFiles }))} aria-pressed={showFiles} aria-label="Files column" title={showFiles ? "Hide the files column" : "Show the files column"}>
            <Icon name="files" size={17} />
          </button>
          <button className={`icon ${prefs.sidePanel !== "hidden" ? "on" : ""}`} onClick={togglePanel} aria-pressed={prefs.sidePanel !== "hidden"} aria-label="Panel" title={prefs.sidePanel !== "hidden" ? "Hide the panel" : "Show the panel"}>
            <Icon name="story" size={17} />
          </button>
          <button className="icon" onClick={() => setFocusMode(true)} aria-label="Focus" title="Focus: only the page (Ctrl+. · Esc to leave)" data-testid="focus">
            <Icon name="focus" size={17} />
          </button>
        </div>
        <span className={`status ${errors ? "bad" : warnings ? "warn" : "good"}`} data-testid="status">
          {"error" in result ? "Settings error" : errors ? `${errors} error${errors > 1 ? "s" : ""}` : warnings ? `${warnings} warning${warnings > 1 ? "s" : ""}` : "Ready"}
        </span>
        <button className="icon" onClick={openSearch} aria-label="Find in project" title="Find in project (Ctrl+Shift+F)" data-testid="open-search">
          <Icon name="search" size={17} />
        </button>
        {canPlaytest && <button className="wide-only playtest" onClick={() => void playtest()} title="Write the Ren'Py export into your game and run it in Ren'Py" data-testid="playtest">▶ Playtest</button>}
        <button className="primary wide-only" onClick={doExport} data-testid="export">Export</button>
        <button className="icon wide-only" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings">⚙</button>
        <div className="more phone-only">
          <button className="icon" onClick={() => setMoreOpen(!moreOpen)} aria-label="More" aria-expanded={moreOpen}>⋯</button>
          {moreOpen && (
            <div className="more-menu" role="menu" onClick={() => setMoreOpen(false)}>
              <button role="menuitem" onClick={doExport}>Export</button>
              <button role="menuitem" onClick={() => { setMobile("write"); setFocusMode(true); }}>Focus: only the page</button>
              <button role="menuitem" onClick={() => setSettingsOpen(true)}>Settings</button>
              <span className="more-version">{theme.brand.product} {__APP_VERSION__}</span>
            </div>
          )}
        </div>
      </header>

      {showFiles && <div className="resizer resizer-files wide-only" onPointerDown={resize("files")} onDoubleClick={() => setPrefs((p) => ({ ...p, filesWidth: undefined }))} title="Drag to resize · double-click to reset" />}
      <Sidebar
        project={project} file={file} sheetFile={sheetFile} sheets={ok?.sheets ?? []} links={links} outline={prefs.showOutline ? outline : null}
        onOpen={(f) => { setFileName(f); setMobile("write"); }}
        onOpenSheet={(f) => { setFileName(f); setRawSheet(false); setMobile("write"); }}
        onJump={(line) => { jumpTo(line); setMobile("write"); }}
        onNewScript={fx.addScript} onNewSheet={(k, n) => fx.createSheet(k, n)}
        rowMenu={(f) => [{ label: "Rename…", run: () => fx.renameAny(f) }, { label: "Delete…", run: () => fx.deleteAny(f), danger: true }]}
        pop={pop} projectActions={projectActions}
      />

      <main className={`main view-${isScript ? shownLayer : "play"}`}>
        {file.endsWith(".sheet") && <SheetBar raw={rawSheet} setRaw={setRawSheet} />}
        {isScript && (
          <LayerBar versions={versions} layer={shownLayer} setLayer={setLayer} behind={behind} busy={!!busy} open={draftOpen}
            onInsert={insertBlock} onTogether={(stretch) => setTogether({ stretch, direction: together?.direction ?? "" })} onUnfold={() => void ai.unfold()} />
        )}
        {isScript && (shownLayer === "draft" || shownLayer === "play") && prefs.showWriterBar !== false && ok && (
          <WriterBar layer={shownLayer} sheets={ok.sheets.map((x) => x.sheet)} blocks={ok.config.blocks} pop={pop}
            onInsert={(s) => setInsertion({ ...s, n: Date.now() })} onFormat={(kind) => setFormatCmd({ kind, n: Date.now() })} onNewSheet={(k, n) => fx.createSheet(k, n, false)} />
        )}
        {isScript && <SyncBar layer={shownLayer} states={states} busy={!!busy} onMarkInStep={markInStep} onSync={(from, to) => void ai.syncVersions(from, to)} />}
        {file.endsWith(".sheet") && !rawSheet ? (
          <div className="sheet-scroll">
            <SheetForm
              key={file}
              text={project.files[file] ?? ""}
              usage={sheetUsageFor(file)}
              onChange={update}
              onJump={(f, line) => { setFileName(f); jumpTo(line); }}
              onDraftPrompt={ai.draftPrompt}
              onRename={(n) => fx.renameSheetTo(file, n)}
            />
          </div>
        ) : (
          <Editor
            docKey={`${project.id}/${shown}`}
            value={project.files[shown] ?? ""}
            isJson={shown.endsWith(".json")}
            wrap={prefs.wrap}
            diagnostics={shown === file ? diagnostics : []}
            onChange={(t) => edit(shown, t)}
            onCursorLine={setCursorLine}
            jumpTo={jump}
            insert={insertion}
            numbers={!(isScript && shownLayer === "draft") || prefs.draftLineNumbers === true}
            typewriter={prefs.typewriter !== false && isScript && (shownLayer === "draft" || shownLayer === "play")}
            formatted={isScript && shownLayer === "draft"}
            format={formatCmd}
            links={prefs.highlightNames === false ? [] : links}
            claude={claudeShown}
            onClaude={isScript && layer === "draft" ? ai.onClaudeSpans : undefined}
            choices={isScript && layer === "draft" ? draftChoices : undefined}
            onChoices={isScript && layer === "draft" ? saveChoices : undefined}
            onLevelPick={isScript && layer === "draft" && prefs.showLevels !== false ? pickLevel : undefined}
            onOpenLink={openLink}
            onContext={setMenu}
          />
        )}
        {prefs.showWordCount !== false && (
          <WordBar projectId={project.id} here={hereWords} hereLabel={layer === "draft" ? "Draft" : "Play"} total={totalWords} written={today.written} goals={goals}
            onGoals={() => setGoalsOpen(true)} onReached={(m) => say(m, 6000)} />
        )}
        {diagnostics.filter((d) => d.level !== "info").length > 0 && (
          <div className="problems">
            {diagnostics.filter((d) => d.level !== "info").map((d, k) => (
              <button key={k} className={`problem ${d.level}`} onClick={() => jumpTo(d.line)}>
                <b>Line {d.line}</b> {d.message}
              </button>
            ))}
          </div>
        )}
      </main>

      {prefs.sidePanel !== "hidden" && <div className={`resizer resizer-panel wide-only ${prefs.sidePanel}`} onPointerDown={resize("panel")} onDoubleClick={() => setPrefs((p) => ({ ...p, panelSize: undefined }))} title="Drag to resize · double-click to reset" />}
      {prefs.sidePanel !== "hidden" && (
        <SidePanel onClose={togglePanel} tab={tab} setTab={setTab} sheetName={sheetOpen ? (ok?.sheets.find((x) => x.file === sheetOpen)?.sheet.name ?? "Sheet") : null}>
          <Suspense fallback={null}>{panelBody()}</Suspense>
        </SidePanel>
      )}

      <nav className="mobile-nav">
        {(["files", "write", "preview"] as MobileView[]).map((m) => (
          <button key={m} className={mobile === m ? "active" : ""} onClick={() => setMobile(m)}>
            {{ files: "Files", write: "Write", preview: "Read" }[m]}
          </button>
        ))}
      </nav>

      <Suspense fallback={null}>
      {popMenu && <PopMenu menu={popMenu} onClose={() => setPopMenu(null)} />}
      {menu && (
        <LinkMenu menu={menu} onClose={() => setMenu(null)} onOpenSheet={openSheet} onRename={fx.renameAny} onChangeKind={fx.changeKind} onCreate={fx.createSheet}
          onPlainText={(text, quiet) => { fx.setNoLink(text, true); if (!quiet) say(`“${text}” is plain text now. Undo in Project settings (noLink).`); }} />
      )}
      {together && (
        <TogetherModal value={together} onChange={setTogether} onClose={() => setTogether(null)}
          onGo={() => { const t = together; setTogether(null); void ai.writeTogether(t.stretch, t.direction); }} />
      )}
      {ai.writing && (
        <DiffReview label="Review Claude's writing" title={ai.writing.title} before={ai.writing.before} after={ai.writing.after} scrollToChange acceptId="fill-accept"
          note="Green lines are Claude's writing, red lines are your notes and keywords it wrote out. Nothing changes until you accept; the text before goes to History."
          footer={(!!ai.writing.answers?.length || (!!ai.writing.tip && prefs.showTips !== false)) && (
            <div className="unfold-notes">
              {!!ai.writing.answers?.length && (
                <div><h3>Your requests</h3><ul>{ai.writing.answers.map((a, k) => <li key={k}>{a}</li>)}</ul></div>
              )}
              {!!ai.writing.tip && prefs.showTips !== false && <p className="writing-tip"><b>Writing tip</b> {ai.writing.tip}</p>}
            </div>
          )}
          onClose={() => ai.setWriting(null)} onRetry={() => { const r = ai.writing!; ai.setWriting(null); r.retry(); }} onAccept={() => ai.acceptWriting(ai.writing!)} />
      )}
      {ai.reviewing && (
        <DiffReview label="Review the update" title={`✦ Update ${VERSION_NAMES[ai.reviewing.to]} from ${VERSION_NAMES[ai.reviewing.from]}`} before={ai.reviewing.before} after={ai.reviewing.after} acceptId="review-accept"
          note={`Green lines are added to ${VERSION_NAMES[ai.reviewing.to]}, red lines are removed. Nothing changes until you accept; the old text goes to History.`}
          footer={ai.reviewing.before === ai.reviewing.after && <p className="muted">No changes needed: the two are already in step.</p>}
          onClose={() => ai.setReviewing(null)} onAccept={() => ai.acceptUpdate(ai.reviewing!)} />
      )}
      {goalsOpen && (
        <GoalsModal goals={goals} onClose={() => setGoalsOpen(false)}
          onSave={(g) => { setGoalsOpen(false); try { setFile("intent.json", writeGoals(project.files["intent.json"], g)); } catch { say("Fix the project settings first: they aren't valid JSON."); } }} />
      )}
      {connectOpen && (
        <ConnectClaude folder={project.folder} hasKey={!!claude.apiKey}
          onSettings={() => { setConnectOpen(false); setSettingsOpen(true); }}
          onKeepInFolder={() => { setConnectOpen(false); void io.keepInFolder(); }}
          onSetUpClaudeCode={() => void io.setUpClaudeCode()}
          onClose={() => setConnectOpen(false)} />
      )}
      {claude.handoff && <HandoffModal job={claude.handoff.job} onAnswer={claude.answerHandoff} onCancel={claude.cancelHandoff} onUseKey={claude.handoffOnKey} />}
      {settingsOpen && (
        <Settings prefs={prefs} setPrefs={setPrefs} theme={theme} apiKey={claude.apiKey} setApiKey={claude.setApiKey} model={claude.model} setModel={claude.setModel}
          via={claude.via} setVia={claude.setVia} onClose={() => setSettingsOpen(false)} />
      )}
      </Suspense>
      {focusMode && (
        <div className="focus-tools" role="toolbar" aria-label="Focus">
          <button onClick={() => textSize(-1)} aria-label="Smaller text" title="Smaller text (Ctrl+-)">A−</button>
          <button onClick={() => textSize(1)} aria-label="Bigger text" title="Bigger text (Ctrl+=)">A+</button>
          <button onClick={() => setFocusMode(false)} title="Leave focus (Esc)" data-testid="focus-leave">Leave focus</button>
        </div>
      )}
      {busy && <div className="busy" role="status"><span className="spinner" />{busy}</div>}
      {toast && (
        <div className="toast" role="status">
          {toast}
          {toastAction && <button className="link" onClick={runAction}>{toastAction.label}</button>}
        </div>
      )}
    </div>
  );
}
