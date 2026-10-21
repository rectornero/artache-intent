import { useEffect, useMemo, useState } from "react";
import type { DataBlock, Node, Scene } from "../src/core/ast.ts";
import { conditionText } from "../src/core/condition.ts";
import { slug } from "../src/core/parser.ts";
import { compileProject, type CompileResult } from "../src/project.ts";
import { Editor } from "./Editor.tsx";
import { applyConversion, draftToScript } from "../src/core/convert.ts";
import { BookView, PreviewNodes } from "./Preview.tsx";
import { SAMPLES, newProject } from "./samples.ts";
import { deliverExport, isTauri, loadPrefs, loadProjects, openFolder, savePrefs, saveProjects, saveToFolder, type Project } from "./storage.ts";
import { activeTheme, applyTheme, DEFAULT_PREFS, THEMES, type Theme, type UiPrefs } from "./themes.ts";

type Tab = "play" | "book" | "renpy" | "mv" | "report" | "bible";
type MobileView = "files" | "write" | "preview";

function safeCompile(p: Project): CompileResult | { error: string } {
  try {
    const settings = JSON.parse(p.files["intent.json"] || "{}");
    const sources = Object.fromEntries(Object.entries(p.files).filter(([n]) => n.endsWith(".intent")));
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
    const c = draftToScript(draftAtCursor.prose, ok.config, names);
    setConverting({ ...draftAtCursor, ...c });
  };

  const acceptConvert = () => {
    if (!converting) return;
    update(applyConversion(source, converting.line, converting.script));
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
          {Object.keys(project.files).sort((a, b) => (a === "intent.json" ? 1 : b === "intent.json" ? -1 : a.localeCompare(b))).map((f) => (
            <li key={f}>
              <button className={f === file ? "active" : ""} onClick={() => { setFileName(f); setMobile("write"); }}>
                {f === "intent.json" ? "⚙ Project settings" : f}
              </button>
            </li>
          ))}
        </ul>
        <div className="side-actions">
          <button className="ghost" onClick={addProject}>New project</button>
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
        {!file.endsWith(".json") && (
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
        <Editor
          docKey={`${project.id}/${file}`}
          value={project.files[file] ?? ""}
          isJson={file.endsWith(".json")}
          wrap={prefs.wrap}
          diagnostics={diagnostics}
          onChange={update}
          onCursorLine={setCursorLine}
          jumpTo={jump}
        />
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
            {(["play", "book", "renpy", "mv", "report", "bible"] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                {{ play: "Play", book: "Book", renpy: "Ren'Py", mv: "RPG Maker MV", report: "Report", bible: "Bible" }[t]}
              </button>
            ))}
          </nav>
          <div className="panel-body" data-testid="panel">
            {"error" in result ? (
              <div className="error-box">Project settings can't be read: {result.error}</div>
            ) : tab === "play" || tab === "book" ? (
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
          <span>{theme.brand.product} 0.1 · {theme.brand.tagline}</span>
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
