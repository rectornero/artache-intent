import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { forceLinting } from "@codemirror/lint";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { json } from "./jsonMode.ts";
import { useEffect, useRef } from "react";
import type { Diagnostic } from "../src/core/ast.ts";
import { claudeSpansField, gapMarks, intentLanguage, setClaudeSpans, intentLinter, layerStripes, refreshLinks, sheetLinks, type LinkTarget } from "./intentMode.ts";

export type Insertion = { text: string; block?: boolean; n: number };

interface Props {
  docKey: string;
  value: string;
  isJson: boolean;
  wrap: boolean;
  diagnostics: Diagnostic[];
  onChange: (v: string) => void;
  onCursorLine: (line: number) => void;
  jumpTo: { line: number; n: number } | null;
  /** The device's spellcheck in this language ("" for the device's own), or off. */
  spellcheck?: string | false;
  /** Text to put in at the cursor: inline, or as lines of its own (`block`). */
  insert?: Insertion | null;
  links?: LinkTarget[];
  onOpenLink?: (t: LinkTarget) => void;
  /** Right-click or long-press: the selection, or the linked name or word under the pointer. */
  onContext?: (info: { x: number; y: number; text: string; link?: LinkTarget }) => void;
  /** The stretches Claude wrote (Draft only), and where they are after the writer's edits. */
  claude?: { from: number; to: number }[];
  onClaude?: (spans: { from: number; to: number }[], doc: string) => void;
}

export function Editor({ docKey, value, isJson, wrap, diagnostics, onChange, onCursorLine, jumpTo, insert, spellcheck = false, links = [], onOpenLink, onContext, claude, onClaude }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const diags = useRef(diagnostics);
  const cb = useRef({ onChange, onCursorLine });
  const wrapComp = useRef(new Compartment());
  const spellComp = useRef(new Compartment());
  const spellAttrs = (on: string | false) =>
    EditorView.contentAttributes.of(on === false || isJson ? { spellcheck: "false" } : { spellcheck: "true", autocorrect: "on", autocapitalize: "sentences", ...(on ? { lang: on } : {}) });
  const linkRef = useRef(links);
  const openRef = useRef(onOpenLink);
  diags.current = diagnostics;
  cb.current = { onChange, onCursorLine };
  linkRef.current = links;
  openRef.current = onOpenLink;
  const ctxRef = useRef(onContext);
  ctxRef.current = onContext;
  const claudeRef = useRef(onClaude);
  claudeRef.current = onClaude;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          isJson ? json() : [intentLanguage(), layerStripes(), gapMarks(), claudeSpansField, intentLinter(() => diags.current), sheetLinks(() => linkRef.current, (t) => openRef.current?.(t))],
          wrapComp.current.of(wrap ? EditorView.lineWrapping : []),
          spellComp.current.of(spellAttrs(spellcheck)),
          EditorView.domEventHandlers({
            contextmenu(e, view) {
              if (!ctxRef.current || isJson) return false;
              const el = (e.target as HTMLElement).closest("[data-sheet]");
              const link = el ? linkRef.current.find((x) => x.name.toLowerCase() === el.getAttribute("data-sheet")) : undefined;
              // The selection when the click is on it, otherwise the word under the pointer.
              const sel = view.state.selection.main;
              const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false);
              let text = !sel.empty && pos >= sel.from && pos <= sel.to ? view.state.sliceDoc(sel.from, sel.to) : "";
              if (!text.trim() && !link) {
                const w = view.state.wordAt(pos);
                if (w) text = view.state.sliceDoc(w.from, w.to);
              }
              text = text.trim().replace(/\s+/g, " ").replace(/^[“"'‘]+|[”"'’.,;:!?]+$/g, "");
              if (!link && (!text || text.length > 40)) return false;
              e.preventDefault();
              ctxRef.current({ x: e.clientX, y: e.clientY, text: link?.name ?? text, link });
              return true;
            },
          }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString());
            const spans = isJson ? null : u.state.field(claudeSpansField, false);
            if (spans && spans !== u.startState.field(claudeSpansField, false) && !u.transactions.some((tr) => tr.annotation(Transaction.remote) || tr.effects.some((e) => e.is(setClaudeSpans)))) claudeRef.current?.(spans, u.state.doc.toString());
            if (u.selectionSet || u.docChanged) cb.current.onCursorLine(u.state.doc.lineAt(u.state.selection.main.head).number);
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // A new document gets a new editor; typing doesn't recreate it.
  }, [docKey, isJson]);

  useEffect(() => {
    view.current?.dispatch({ effects: wrapComp.current.reconfigure(wrap ? EditorView.lineWrapping : []) });
  }, [wrap]);

  useEffect(() => {
    view.current?.dispatch({ effects: spellComp.current.reconfigure(spellAttrs(spellcheck)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spellcheck]);

  // Changes made outside the editor (convert, insert block) replace the text in place.
  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() === value) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, annotations: Transaction.remote.of(true) });
  }, [value]);

  // Claude's stretches from the project: after the text, so they land on the right words.
  const claudeKey = JSON.stringify(claude ?? []);
  useEffect(() => {
    const v = view.current;
    if (!v || isJson) return;
    const now = v.state.field(claudeSpansField, false);
    if (now && JSON.stringify(now) !== claudeKey) v.dispatch({ effects: setClaudeSpans.of(JSON.parse(claudeKey)) });
  }, [claudeKey, value, docKey, isJson]);

  const linkKey = links.map((l) => `${l.name}|${l.stub ? 1 : 0}`).join(",");
  useEffect(() => {
    view.current?.dispatch({ effects: refreshLinks.of(null) });
  }, [linkKey]);

  useEffect(() => {
    if (view.current && !isJson) forceLinting(view.current);
  }, [diagnostics, isJson]);

  useEffect(() => {
    const v = view.current;
    if (!v || !jumpTo || jumpTo.line > v.state.doc.lines) return;
    const pos = v.state.doc.line(jumpTo.line).from;
    v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
    v.focus();
  }, [jumpTo]);

  // The writer's toolbar: the text goes in as the writer's own edit, so Ctrl+Z takes it back.
  const inserted = useRef(insert?.n);
  useEffect(() => {
    const v = view.current;
    // Only new requests: a remounted editor doesn't repeat the last one.
    if (!v || !insert || insert.n === inserted.current) return;
    inserted.current = insert.n;
    const sel = v.state.selection.main;
    let from = sel.from, to = sel.to, text = insert.text;
    if (insert.block) {
      // On an empty line, fill it; otherwise start a new line after the cursor's line.
      const line = v.state.doc.lineAt(sel.head);
      if (line.text.trim()) {
        from = to = line.to;
        text = `\n${text}`;
      } else {
        from = line.from;
        to = line.to;
      }
    }
    v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, scrollIntoView: true, userEvent: "input" });
    v.focus();
  }, [insert]);

  return <div className="editor" ref={host} data-testid="editor" />;
}
