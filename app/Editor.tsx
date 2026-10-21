import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { forceLinting } from "@codemirror/lint";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { json } from "./jsonMode.ts";
import { useEffect, useRef } from "react";
import type { Diagnostic } from "../src/core/ast.ts";
import { intentLanguage, intentLinter, layerStripes } from "./intentMode.ts";

interface Props {
  docKey: string;
  value: string;
  isJson: boolean;
  wrap: boolean;
  diagnostics: Diagnostic[];
  onChange: (v: string) => void;
  onCursorLine: (line: number) => void;
  jumpTo: { line: number; n: number } | null;
}

export function Editor({ docKey, value, isJson, wrap, diagnostics, onChange, onCursorLine, jumpTo }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const diags = useRef(diagnostics);
  const cb = useRef({ onChange, onCursorLine });
  const wrapComp = useRef(new Compartment());
  diags.current = diagnostics;
  cb.current = { onChange, onCursorLine };

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
          isJson ? json() : [intentLanguage(), layerStripes(), intentLinter(() => diags.current)],
          wrapComp.current.of(wrap ? EditorView.lineWrapping : []),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString());
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

  // Changes made outside the editor (convert, insert block) replace the text in place.
  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() === value) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

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

  return <div className="editor" ref={host} data-testid="editor" />;
}
