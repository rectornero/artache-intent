// The writer's toolbar: put a character, place, item, clue or minigame in the text
// the way this version writes it, or start an interaction group in Play.

import { interactions, sheetSnippet, SNIPPET_HINTS, type Snippet } from "../src/core/insert.ts";
import { SHEET_KINDS, type Sheet, type SheetKind } from "../src/core/sheets.ts";
import { FORMATS, type Format } from "./format.ts";
import { Icon } from "./Icon.tsx";
import type { PopItem } from "./Modals.tsx";

const KINDS: SheetKind[] = ["character", "place", "item", "clue", "minigame"];

const FORMAT_BUTTONS: Array<{ f: Format; glyph: React.ReactNode }> = [
  { f: "bold", glyph: <b>B</b> },
  { f: "italic", glyph: <i>I</i> },
  { f: "title", glyph: <span className="fmt-h">H1</span> },
  { f: "subtitle", glyph: <span className="fmt-h">H2</span> },
  { f: "bullet", glyph: "•" },
  { f: "code", glyph: <code>{"</>"}</code> },
];

export function WriterBar({ layer, sheets, blocks, pop, onInsert, onFormat, onNewSheet }: {
  layer: "draft" | "play"; sheets: Sheet[]; blocks: Record<string, { export?: boolean }>;
  pop: (e: React.MouseEvent, items: PopItem[]) => void; onInsert: (s: Snippet) => void; onFormat: (f: Format) => void; onNewSheet: (kind: SheetKind, name: string) => void;
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
  // Mouse down would take the focus (and the selection) away from the text.
  const keep = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div className="writer-bar" role="toolbar" aria-label="Insert" data-testid="writer-bar">
      {layer === "draft" && (
        <div className="format-group" role="group" aria-label="Formatting">
          {FORMAT_BUTTONS.map(({ f, glyph }) => (
            <button key={f} className="fmt-btn" onMouseDown={keep} onClick={() => onFormat(f)} title={`${FORMATS[f].label} (${FORMATS[f].keys})`} aria-label={FORMATS[f].label} data-testid={`format-${f}`}>{glyph}</button>
          ))}
        </div>
      )}
      {layer === "draft" && (
        <div className="format-group" role="group" aria-label="Mark lines">
          <button className="writer-btn k-intent" onMouseDown={keep} onClick={() => onInsert({ text: "\\ ", block: true })} title="Intent: keywords or a sketch after it, and ✦ Unfold writes it out. You can also tap a line's edge." data-testid="insert-intent">
            <span className="tag-glyph">{"\\"}</span><span>Intent</span>
          </button>
          <button className="writer-btn k-request" onMouseDown={keep} onClick={() => onInsert({ text: "/ ", block: true })} title="A request for Claude: ✦ Unfold carries it out, and it never goes in the story" data-testid="insert-request">
            <span className="tag-glyph">/</span><span>Request</span>
          </button>
        </div>
      )}
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
