import { Icon } from "./Icon.tsx";

export type Tab = "sheet" | "play" | "book" | "search" | "checks" | "clues" | "backups" | "assets" | "renpy" | "mv" | "report" | "bible" | "history";

// The right panel: groups instead of a row of tabs. Ren'Py code lives in the Code version.
const PANEL_GROUPS: Array<{ id: string; label: string; icon: string; tabs: Tab[] }> = [
  { id: "read", label: "Read", icon: "story", tabs: ["play", "book"] },
  { id: "find", label: "Find", icon: "search", tabs: ["search"] },
  { id: "export", label: "Export", icon: "engine", tabs: ["assets", "report", "mv", "renpy"] },
  { id: "tools", label: "Tools", icon: "data", tabs: ["checks", "clues", "history", "backups", "bible"] },
];
const TAB_NAMES: Record<Tab, string> = { sheet: "Sheet", play: "Preview", book: "Book", search: "Find", checks: "Story check", clues: "Clues", backups: "Backups", assets: "Assets", renpy: "Ren'Py (all files)", mv: "RPG Maker MV", report: "Report", bible: "Bible", history: "History" };

/** The right (or bottom) panel: group tabs, sub-tabs, and whatever the tab shows. */
export function SidePanel({ tab, setTab, sheetName, children }: { tab: Tab; setTab: (t: Tab) => void; sheetName: string | null; children: React.ReactNode }) {
  return (
    <section className="panel">
      <nav className="tabs" role="tablist">
        {sheetName !== null && (
          <button role="tab" aria-selected={tab === "sheet"} className={tab === "sheet" ? "active" : ""} onClick={() => setTab("sheet")}>◆ {sheetName}</button>
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
      <div className="panel-body" data-testid="panel">{children}</div>
    </section>
  );
}
