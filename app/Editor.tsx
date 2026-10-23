import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { forceLinting } from "@codemirror/lint";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers, scrollPastEnd } from "@codemirror/view";
import { applyFormat, formatting, type Format } from "./format.ts";
import { json } from "./jsonMode.ts";
import { useEffect, useRef } from "react";
import type { Diagnostic } from "../src/core/ast.ts";
import { choicesField, claudeSpansField, intentLanguage, intentLevels, setChoices, setClaudeSpans, intentLinter, layerStripes, refreshLinks, sheetLinks, type LinkTarget } from "./intentMode.ts";
import type { Choice, Level } from "../src/core/levels.ts";

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
  /** Line numbers in the margin. */
  numbers?: boolean;
  /** The line being written stays in the middle of the screen. */
  typewriter?: boolean;
  /** Draft only: **bold**, *italic*, titles, bullets and `code` shown as they read. */
  formatted?: boolean;
  /** A formatting command from the toolbar. */
  format?: { kind: Format; n: number } | null;
  /** Text to put in at the cursor: inline, or as lines of its own (`block`). */
  insert?: Insertion | null;
  links?: LinkTarget[];
  onOpenLink?: (t: LinkTarget) => void;
  /** Right-click or long-press: the selection, or the linked name or word under the pointer. */
  onContext?: (info: { x: number; y: number; text: string; link?: LinkTarget }) => void;
  /** The stretches Claude wrote (Draft only), and where they are after the writer's edits. */
  claude?: { from: number; to: number }[];
  onClaude?: (spans: { from: number; to: number }[], doc: string) => void;
  /** Intent writing (Draft only): the writer's choices of level, where they are after edits, and a tap on a line's edge. */
  choices?: Choice[];
  onChoices?: (choices: Choice[], doc: string) => void;
  onLevelPick?: (at: { lineFrom: number; level: Level; chosen: boolean; x: number; y: number }) => void;
}

export function Editor({ docKey, value, isJson, wrap, diagnostics, onChange, onCursorLine, jumpTo, insert, numbers = true, typewriter = false, formatted = false, format, links = [], onOpenLink, onContext, claude, onClaude, choices, onChoices, onLevelPick }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const diags = useRef(diagnostics);
  const cb = useRef({ onChange, onCursorLine });
  const wrapComp = useRef(new Compartment());
  const numComp = useRef(new Compartment());
  const typeComp = useRef(new Compartment());
  // Typing the writer's keys moves the page so the line stays centred; clicks and scrolling don't.
  const centre = (on: boolean) => (on ? [scrollPastEnd(), EditorState.transactionExtender.of((tr) =>
    (tr.docChanged || tr.selection) && (tr.isUserEvent("input") || tr.isUserEvent("delete") || tr.isUserEvent("move") || tr.isUserEvent("undo") || tr.isUserEvent("redo"))
      ? { effects: EditorView.scrollIntoView(tr.newSelection.main.head, { y: "center" }) }
      : null)] : []);
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
  const choicesRef = useRef(onChoices);
  choicesRef.current = onChoices;
  const pickRef = useRef(onLevelPick);
  pickRef.current = onLevelPick;
  const withLevels = !!onLevelPick;
  const withFormat = formatted && !isJson;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          numComp.current.of(numbers ? lineNumbers() : []),
          typeComp.current.of(centre(typewriter)),
          history(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          isJson ? json() : [intentLanguage(withFormat), layerStripes(), withLevels ? [choicesField, intentLevels((at) => pickRef.current?.(at))] : [], claudeSpansField, intentLinter(() => diags.current), sheetLinks(() => linkRef.current, (t) => openRef.current?.(t))],
          withFormat ? formatting() : [],
          wrapComp.current.of(wrap ? EditorView.lineWrapping : []),
          // No spellcheck or autocorrect: nothing changes or marks the writer's words on its own.
          EditorView.contentAttributes.of({ spellcheck: "false", autocorrect: "off" }),
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
            const cs = isJson ? null : u.state.field(choicesField, false);
            // A typed tag sets choices itself (an input with setChoices); a choice from the project doesn't come back.
            if (cs && cs !== u.startState.field(choicesField, false) && !u.transactions.some((tr) => tr.annotation(Transaction.remote) || (tr.effects.some((e) => e.is(setChoices)) && !tr.isUserEvent("input")))) choicesRef.current?.(cs, u.state.doc.toString());
            if (u.selectionSet || u.docChanged) cb.current.onCursorLine(u.state.doc.lineAt(u.state.selection.main.head).number);
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // A new document gets a new editor; typing doesn't recreate it.
  }, [docKey, isJson, withLevels, withFormat]);


  useEffect(() => {
    view.current?.dispatch({ effects: wrapComp.current.reconfigure(wrap ? EditorView.lineWrapping : []) });
  }, [wrap]);

  useEffect(() => {
    view.current?.dispatch({ effects: numComp.current.reconfigure(numbers ? lineNumbers() : []) });
  }, [numbers]);

  useEffect(() => {
    view.current?.dispatch({ effects: typeComp.current.reconfigure(centre(typewriter)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typewriter]);

  // The toolbar's formatting buttons: only new presses, like insert below.
  const formattedN = useRef(format?.n);
  useEffect(() => {
    const v = view.current;
    if (!v || !format || format.n === formattedN.current) return;
    formattedN.current = format.n;
    applyFormat(v, format.kind);
  }, [format]);

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

  // The writer's choices from the project: after the text, so they land on the right lines.
  const choicesKey = JSON.stringify(choices ?? []);
  useEffect(() => {
    const v = view.current;
    if (!v || !withLevels) return;
    const now = v.state.field(choicesField, false);
    if (now && JSON.stringify(now) !== choicesKey) v.dispatch({ effects: setChoices.of(JSON.parse(choicesKey)) });
  }, [choicesKey, value, docKey, withLevels]);

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
