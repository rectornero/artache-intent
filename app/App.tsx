import { useEffect, useMemo, useState } from "react";
import type { DataBlock, Node, Scene } from "../src/core/ast.ts";
import { conditionText } from "../src/core/condition.ts";
import { slug } from "../src/core/parser.ts";
import { compileProject, type CompileResult } from "../src/project.ts";
import { Editor } from "./Editor.tsx";
import { applyConversion, draftToScript } from "../src/core/convert.ts";
import { BookView, PreviewNodes } from "./Preview.tsx";
import { SheetForm, isStub } from "./SheetForm.tsx";
import type { LinkTarget } from "./intentMode.ts";
import { detectMinigames, newSheet, sheetFileName, sheetNames, sheetUsage, SHEET_KINDS, type SheetKind } from "../src/core/sheets.ts";
import { SAMPLES, newProject } from "./samples.ts";
import { deliverExport, isTauri, launchFile, loadPrefs, loadProjects, openFiles, openFolder, savePrefs, saveFileAs, saveProjects, saveToFolder, type Project } from "./storage.ts";
import { activeTheme, applyTheme, DEFAULT_PREFS, THEMES, type Theme, type UiPrefs } from "./themes.ts";

type Tab = "sheet" | "play" | "book" | "renpy" | "mv" | "report" | "bible";
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
  const [converting, setConverting] = useState<{ line: number; prose: string; script: string; checks: string[] } | null>(null);

  const theme = activeTheme(prefs);
  useEffect(() => {
    applyTheme(theme, prefs);
    savePrefs(prefs);
  }, [theme, prefs]);

  useEffect(() => {
    const t = setTimeout(() => saveProjects(projects.filter((p) => !p.folder)), 400);
    return () => clearTimeout(t);
  }, [projects]);

  const result = useMemo(() => safeCompile(project), [project]);
  const ok = "files" in result ? result : null;
  const script = ok?.scripts.find((s) => s.file === file);
  const diagnostics = script?.diagnostics ?? [];
  const errors = ok ? ok.diagnostics.filter((d) => d.level === "error").length : 1;
  const warnings = ok ? ok.diagnostics.filter((d) => d.level === "warning").length : 0;

  const update = (text: string) =>
    setProjects((list) => list.map((p) => (p.id === project.id ? { ...p, files: { ...p.files, [file]: text } } : p)));

  const say = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
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

  // The ::: draft block under the cursor, if any (1-based line of its opening fence).
  const source = project.files[file] ?? "";
  const draftAtCursor = useMemo(() => {
    if (file.endsWith(".json")) return null;
    const lines = source.split("\n");
    let open: number | null = null;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (open === null && /^:::\s*draft\s*$/.test(t)) open = i;
      else if (open !== null && t === ":::") {
        if (cursorLine >= open + 1 && cursorLine <= i + 1) return { line: open + 1, prose: lines.slice(open + 1, i).join("\n") };
        open = null;
      } else if (open === null && /^:::/.test(t) && t !== ":::") {
        // another layer opens: skip to its close
        while (i + 1 < lines.length && lines[i + 1].trim() !== ":::") i++;
        i++;
      }
    }
    return null;
  }, [source, file, cursorLine]);

  const startConvert = () => {
    if (!draftAtCursor || !ok) return;
    const names = ok.scripts.flatMap((s) => s.blocks.filter((b) => b.kind === "npc").map((b) => b.name));
    const c = draftToScript(draftAtCursor.prose, ok.config, names, ok.sheets.map((x) => x.sheet));
    setConverting({ ...draftAtCursor, ...c });
  };

  const acceptConvert = () => {
    if (!converting) return;
    update(applyConversion(source, converting.line, converting.script));
    for (const g of detectMinigames(converting.script)) {
      const f = sheetFileName("minigame", g);
      if (project.files[f] === undefined) setFile(f, newSheet("minigame", g, `First written about in ${file}.`));
    }
    setJump({ line: converting.line, n: Date.now() });
    setConverting(null);
    say("Draft converted. The prose is kept below as was-draft.");
  };

  const insertBlock = (kind: "draft" | "renpy" | "mv") => {
    const lines = source.split("\n");
    const hint = { draft: "Write freely here, like a book.", renpy: "# Ren'Py code, passed through as is", mv: "// MV script call, passed through as is" }[kind];
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
    await deliverExport(project.name, ok.files);
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
        <button className="primary" onClick={doExport} data-testid="export">Export</button>
        <button className="icon" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings">⚙</button>
      </header>

      <aside className="sidebar">
        <div className="side-head">
          Files
          <span className="spacer" />
          <button className="ghost" onClick={addFile} title="New script">+ script</button>
        </div>
        <ul className="files">
          {Object.keys(project.files).filter((f) => !f.endsWith(".sheet")).sort((a, b) => (a === "intent.json" ? 1 : b === "intent.json" ? -1 : a.localeCompare(b))).map((f) => (
            <li key={f}>
              <button className={f === file ? "active" : ""} onClick={() => { setFileName(f); setMobile("write"); }}>
                {f === "intent.json" ? "⚙ Project settings" : f}
              </button>
            </li>
          ))}
        </ul>
        <div className="side-head">
          Sheets
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
              <div className="sheet-group-head"><i className={`kind-dot k-${k}`} />{SHEET_KINDS[k].plural}</div>
              <ul className="files">
                {stubs.map((l) => (
                  <li key={l.name}><button className="stub" onClick={() => createSheet(k, l.name)} title="Mentioned in your script. Click to make its sheet">{l.name}<span className="badge">new</span></button></li>
                ))}
                {mine.map(({ file: f, sheet }) => (
                  <li key={f}>
                    <button className={f === file || f === sheetFile ? "active" : ""} onClick={() => { setFileName(f); setRawSheet(false); setMobile("write"); }}>
                      {sheet.name}{isStub(sheet) && <span className="badge">to design</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <div className="side-actions">
          <button className="ghost" onClick={addProject}>New project</button>
          <button className="ghost" onClick={importFiles}>Open .intent file</button>
          {!file.endsWith(".json") && <button className="ghost" onClick={async () => { if (await saveFileAs(file, project.files[file] ?? "")) say(`Saved ${file.split("/").pop()}`); }}>Save as file</button>}
          {isTauri() && (
            <>
              <button className="ghost" onClick={async () => { const p = await openFolder(); if (p) { setProjects((l) => [...l.filter((x) => x.id !== p.id), p]); setProjectId(p.id); setFileName(firstScript(p)); } }}>Open folder</button>
              {project.folder && <button className="ghost" onClick={async () => { await saveToFolder(project); say("Saved"); }}>Save to folder</button>}
            </>
          )}
        </div>
        {prefs.showOutline && outline.length > 0 && (
          <>
            <div className="side-head">Outline</div>
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

      <main className="main">
        {file.endsWith(".sheet") && (
          <div className="toolbar" role="toolbar" aria-label="Sheet">
            <span className="label">Edit as:</span>
            <button className={rawSheet ? "" : "on"} onClick={() => setRawSheet(false)}>Form</button>
            <button className={rawSheet ? "on" : ""} onClick={() => setRawSheet(true)}>Text</button>
          </div>
        )}
        {file.endsWith(".intent") && (
          <div className="toolbar" role="toolbar" aria-label="Layers">
            {draftAtCursor ? (
              <button className="convert" onClick={startConvert} data-testid="convert">Convert draft to script</button>
            ) : (
              <span className="label">Add a layer:</span>
            )}
            <button onClick={() => insertBlock("draft")}><span className="layer-dot" style={{ background: "var(--speaker)" }} />Draft</button>
            <button onClick={() => insertBlock("renpy")}><span className="layer-dot" style={{ background: "var(--block)" }} />Ren'Py code</button>
            <button onClick={() => insertBlock("mv")}><span className="layer-dot" style={{ background: "var(--block)" }} />MV code</button>
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
            />
          </div>
        ) : (
        <Editor
          docKey={`${project.id}/${file}`}
          value={project.files[file] ?? ""}
          isJson={file.endsWith(".json")}
          wrap={prefs.wrap}
          diagnostics={diagnostics}
          onChange={update}
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
            {([...(sheetFile && project.files[sheetFile] !== undefined ? ["sheet"] : []), "play", "book", "renpy", "mv", "report", "bible"] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                {{ sheet: `◆ ${ok?.sheets.find((x) => x.file === sheetFile)?.sheet.name ?? "Sheet"}`, play: "Play", book: "Book", renpy: "Ren'Py", mv: "RPG Maker MV", report: "Report", bible: "Bible" }[t]}
              </button>
            ))}
          </nav>
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
              />
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

      {menu && (
        <div className="ctx-back" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}>
          <div className="ctx-menu" role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 220) }} onClick={(e) => e.stopPropagation()}>
            {menu.link && !menu.link.stub ? (
              <>
                <div className="ctx-title">“{menu.text}” · {SHEET_KINDS[menu.link.kind as SheetKind].label}</div>
                <button role="menuitem" onClick={() => { openSheet(menu.link!.file); setMenu(null); }}>
                  <i className={`kind-dot k-${menu.link.kind}`} />Open sheet
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
      {converting && (
        <div className="modal-back" onClick={() => setConverting(null)}>
          <div className="modal wide" role="dialog" aria-label="Convert draft" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Convert draft to script</h2>
              <button className="icon" onClick={() => setConverting(null)} aria-label="Close">✕</button>
            </div>
            <p className="muted">Your words stay as written. Intent only splits narration from dialogue and guesses speakers. Edit the right side before you accept; the prose is kept as a was-draft block.</p>
            <div className="convert-grid">
              <div>
                <h3>Draft</h3>
                <div className="prose">{converting.prose}</div>
              </div>
              <div>
                <h3>Script</h3>
                <textarea value={converting.script} onChange={(e) => setConverting({ ...converting, script: e.target.value })} spellCheck={false} data-testid="convert-script" />
              </div>
            </div>
            {converting.checks.length > 0 && (
              <ul className="checks">
                {converting.checks.map((c, k) => <li key={k}>{c}</li>)}
              </ul>
            )}
            <div className="modal-actions">
              <button onClick={() => setConverting(null)}>Cancel</button>
              <button className="primary" onClick={acceptConvert} data-testid="convert-accept">Accept</button>
            </div>
          </div>
        </div>
      )}
      {settingsOpen && <Settings prefs={prefs} setPrefs={setPrefs} theme={theme} onClose={() => setSettingsOpen(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
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

function Settings({ prefs, setPrefs, theme, onClose }: { prefs: UiPrefs; setPrefs: (p: UiPrefs) => void; theme: Theme; onClose: () => void }) {
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
