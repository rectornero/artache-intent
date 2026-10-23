// The writer's toolbar: put a character, place, item, clue or minigame in the text
// the way this version writes it, or start an interaction group in Play.

import { interactions, sheetSnippet, SNIPPET_HINTS, type Snippet } from "../src/core/insert.ts";
import { SHEET_KINDS, type Sheet, type SheetKind } from "../src/core/sheets.ts";
import { Icon } from "./Icon.tsx";
import type { PopItem } from "./Modals.tsx";

const KINDS: SheetKind[] = ["character", "place", "item", "clue", "minigame"];

export function WriterBar({ layer, sheets, blocks, pop, onInsert, onNewSheet }: {
  layer: "draft" | "play"; sheets: Sheet[]; blocks: Record<string, { export?: boolean }>;
  pop: (e: React.MouseEvent, items: PopItem[]) => void; onInsert: (s: Snippet) => void; onNewSheet: (kind: SheetKind, name: string) => void;
}) {
  const menu = (kind: SheetKind) => (e: React.MouseEvent) => {
    const mine = sheets.filter((s) => s.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
    pop(e, [
      ...mine.map((s) => ({ label: s.name, run: () => onInsert(sheetSnippet(s, layer)) })),
      {
        label: `New ${SHEET_KINDS[kind].label.toLowerCase()}…`,
        run: () => {
          const name = prompt(`New ${SHEET_KINDS[kind].label.toLowerCase()} name`)?.trim();
          if (!name) return;
          onNewSheet(kind, name);
          onInsert(sheetSnippet({ kind, name, fields: {}, notes: [] }, layer));
        },
      },
    ]);
  };
  return (
    <div className="writer-bar" role="toolbar" aria-label="Insert" data-testid="writer-bar">
      {KINDS.map((k) => (
        <button key={k} className={`writer-btn k-${k}`} onClick={menu(k)} title={`Insert a ${SHEET_KINDS[k].label.toLowerCase()}: ${SNIPPET_HINTS[k][layer]}`} data-testid={`insert-${k}`}>
          <Icon name={k} size={15} /><span>{SHEET_KINDS[k].label}</span>
        </button>
      ))}
      {layer === "play" && (
        <button className="writer-btn" onClick={(e) => pop(e, interactions(blocks).map((i) => ({ label: i.label, run: () => onInsert({ text: i.text, block: true }) })))} title="Start a choice, condition, talk, event or one of the project's interaction blocks" data-testid="insert-interaction">
          <Icon name="design" size={15} /><span>Interaction</span>
        </button>
      )}
    </div>
  );
}
