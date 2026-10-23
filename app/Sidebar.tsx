import type { CompileResult } from "../src/project.ts";
import { isVersionFile } from "../src/core/sync.ts";
import { SHEET_KINDS, type SheetKind } from "../src/core/sheets.ts";
import { Icon } from "./Icon.tsx";
import type { LinkTarget } from "./intentMode.ts";
import type { PopItem } from "./Modals.tsx";
import { isStub } from "./SheetForm.tsx";
import type { Project } from "./storage.ts";

export type OutlineItem = { line: number; label: string; depth: number };

const KINDS = Object.keys(SHEET_KINDS) as SheetKind[];

/** The left column: scripts, sheets by kind, project actions and the outline. */
export function Sidebar(p: {
  project: Project; file: string; sheetFile: string | null; sheets: CompileResult["sheets"]; links: LinkTarget[]; outline: OutlineItem[] | null;
  onOpen: (file: string) => void; onOpenSheet: (file: string) => void; onJump: (line: number) => void;
  onNewScript: () => void; onNewSheet: (kind: SheetKind, name: string) => void; rowMenu: (file: string) => PopItem[];
  pop: (e: React.MouseEvent, items: PopItem[]) => void; projectActions: React.ReactNode;
}) {
  const rowMore = (f: string) => (
    <button className="row-more" aria-label="More" title="Rename or delete" onClick={(e) => p.pop(e, p.rowMenu(f))}>
      <Icon name="more" size={16} />
    </button>
  );
  const scripts = Object.keys(p.project.files).filter((f) => !f.endsWith(".sheet") && !isVersionFile(f)).sort((a, b) => (a === "intent.json" ? 1 : b === "intent.json" ? -1 : a.localeCompare(b)));
  return (
    <aside className="sidebar">
      <div className="side-head">
        <Icon name="files" />Scripts
        <span className="spacer" />
        <button className="ghost" onClick={p.onNewScript} title="New script">+ script</button>
      </div>
      <ul className="files">
        {scripts.map((f) => (
          <li key={f}>
            <button className={f === p.file ? "active" : ""} onClick={() => p.onOpen(f)}>
              {f === "intent.json" ? "⚙ Project settings" : f}
            </button>
            {f.endsWith(".intent") && rowMore(f)}
          </li>
        ))}
      </ul>
      <div className="side-head">
        <Icon name="sheets" />Sheets
        <span className="spacer" />
        <select className="ghost add-sheet" value="" aria-label="New sheet" onChange={(e) => { const k = e.target.value as SheetKind; e.target.value = ""; const n = k && prompt(`New ${SHEET_KINDS[k].label.toLowerCase()} name`); if (k && n) p.onNewSheet(k, n.trim()); }}>
          <option value="">+ sheet</option>
          {KINDS.map((k) => <option key={k} value={k}>{SHEET_KINDS[k].label}</option>)}
        </select>
      </div>
      {KINDS.map((k) => {
        const mine = p.sheets.filter((x) => x.sheet.kind === k).sort((a, b) => Number(isStub(b.sheet)) - Number(isStub(a.sheet)) || a.sheet.name.localeCompare(b.sheet.name));
        if (!mine.length) return null;
        return (
          <div key={k} className="sheet-group">
            <div className={`sheet-group-head k-${k}`}><Icon name={k} size={14} />{SHEET_KINDS[k].plural}</div>
            <ul className="files">
              {mine.map(({ file: f, sheet }) => (
                <li key={f}>
                  <button className={f === p.file || f === p.sheetFile ? "active" : ""} onClick={() => p.onOpenSheet(f)}>
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
      <div className="side-actions">{p.projectActions}</div>
      {p.outline && p.outline.length > 0 && (
        <>
          <div className="side-head"><Icon name="outline" />Outline</div>
          <ul className="outline">
            {p.outline.map((o, k) => (
              <li key={k} style={{ paddingLeft: 8 + o.depth * 14 }}>
                <button onClick={() => p.onJump(o.line)}>{o.label}</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
