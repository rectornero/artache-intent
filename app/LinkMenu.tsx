import { SHEET_KINDS, type SheetKind } from "../src/core/sheets.ts";
import type { LinkTarget } from "./intentMode.ts";

export type LinkMenuAt = { x: number; y: number; text: string; link?: LinkTarget };

const KINDS = Object.keys(SHEET_KINDS) as SheetKind[];

/** Right-click on a word in the editor: open, rename or retype its sheet, or make one. */
export function LinkMenu({ menu, onClose, onOpenSheet, onRename, onPlainText, onChangeKind, onCreate }: {
  menu: LinkMenuAt; onClose: () => void;
  onOpenSheet: (file: string) => void; onRename: (file: string) => void; onPlainText: (text: string, quiet: boolean) => void;
  onChangeKind: (file: string, kind: SheetKind) => void; onCreate: (kind: SheetKind, name: string) => void;
}) {
  const act = (f: () => void) => () => { onClose(); f(); };
  const link = menu.link;
  const create = KINDS.map((k) => (
    <button key={k} role="menuitem" onClick={act(() => onCreate(k, menu.text))}>
      <i className={`kind-dot k-${k}`} />Create {SHEET_KINDS[k].label}…
    </button>
  ));
  return (
    <div className="ctx-back" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div className="ctx-menu" role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 220) }} onClick={(e) => e.stopPropagation()}>
        {link && !link.stub ? (
          <>
            <div className="ctx-title">“{menu.text}” · {SHEET_KINDS[link.kind as SheetKind].label}</div>
            <button role="menuitem" onClick={act(() => onOpenSheet(link.file))}><i className={`kind-dot k-${link.kind}`} />Open sheet</button>
            <button role="menuitem" onClick={act(() => onRename(link.file))}><i className="kind-dot" />Rename everywhere…</button>
            <button role="menuitem" onClick={act(() => onPlainText(menu.text, false))}><i className="kind-dot" />Plain text, not a link</button>
            <div className="ctx-sep">Change type to</div>
            {KINDS.filter((k) => k !== link.kind).map((k) => (
              <button key={k} role="menuitem" onClick={act(() => onChangeKind(link.file, k))}><i className={`kind-dot k-${k}`} />{SHEET_KINDS[k].label}</button>
            ))}
          </>
        ) : link?.stub ? (
          <>
            <div className="ctx-title">“{menu.text}” · no sheet yet</div>
            {create}
            <button role="menuitem" onClick={act(() => onPlainText(menu.text, true))}><i className="kind-dot" />Plain text, not a link</button>
          </>
        ) : (
          <>
            <div className="ctx-title">“{menu.text}”</div>
            {create}
          </>
        )}
      </div>
    </div>
  );
}
