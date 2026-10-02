import { useLayoutEffect, useRef } from "react";
import { EditorSelection, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  isolateHistory,
  redo,
} from "@codemirror/commands";
import { cn } from "~/utils/cn";

export interface EditorSeed {
  before: string;
  beforeAnchor: number;
  beforeHead: number;
  afterAnchor: number;
  afterHead: number;
  focus: boolean;
}
export interface LargeTextEditorProps {
  value: string;
  onChange(value: string): void;
  label: string;
  placeholder?: string;
  className?: string;
  seed?: EditorSeed;
}

/** A complete document with CodeMirror's vertical and long-line virtualization. */
export default function LargeTextEditor(props: LargeTextEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView>();
  const latest = useRef(props);
  latest.current = props;
  const published = useRef(props.value);
  useLayoutEffect(() => {
    if (!container.current) return;
    const initial = latest.current;
    const seed = initial.seed;
    let initializing = true;
    let editorReady = false;
    const view = new EditorView({
      parent: container.current,
      state: EditorState.create({
        doc: seed?.before ?? initial.value,
        selection: EditorSelection.single(
          Math.min(
            seed?.beforeAnchor ?? 0,
            (seed?.before ?? initial.value).length
          ),
          Math.min(
            seed?.beforeHead ?? 0,
            (seed?.before ?? initial.value).length
          )
        ),
        extensions: [
          history(),
          keymap.of([
            { key: "Mod-Shift-z", run: redo, preventDefault: true },
            { key: "Mod-y", run: redo, preventDefault: true },
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          EditorView.lineWrapping,
          placeholder(initial.placeholder ?? ""),
          EditorView.contentAttributes.of((view) => ({
            "aria-label": initial.label,
            "aria-multiline": "true",
            role: "textbox",
            spellcheck: "false",
            autocorrect: "off",
            autocapitalize: "off",
            "data-editor-kind": "codemirror",
            "data-editor-ready": String(editorReady),
            "data-source-length": String(view.state.doc.length),
          })),
          // Large CDP/IME commits must not temporarily build a million-character
          // native contenteditable DOM. Real clipboard paste already uses CM's
          // own optimized document transaction and native clipboard semantics.
          EditorView.domEventHandlers({
            beforeinput(event, view) {
              const input = event as InputEvent;
              if (
                !input.cancelable ||
                input.isComposing ||
                input.inputType !== "insertText" ||
                !input.data ||
                input.data.length < 16_384
              )
                return false;
              const domSelection = view.contentDOM.ownerDocument.getSelection();
              if (domSelection?.anchorNode && domSelection.focusNode) {
                try {
                  view.dispatch({
                    selection: EditorSelection.single(
                      view.posAtDOM(
                        domSelection.anchorNode,
                        domSelection.anchorOffset
                      ),
                      view.posAtDOM(
                        domSelection.focusNode,
                        domSelection.focusOffset
                      )
                    ),
                  });
                } catch {
                  /* CodeMirror's existing selection remains authoritative. */
                }
              }
              input.preventDefault();
              view.dispatch({
                ...view.state.replaceSelection(input.data),
                annotations: [
                  Transaction.userEvent.of("input.paste"),
                  isolateHistory.of("full"),
                ],
              });
              return true;
            },
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || initializing) return;
            const value = update.state.doc.toString();
            published.current = value;
            latest.current.onChange(value);
          }),
          EditorView.theme({
            "&": {
              height: "100%",
              minHeight: "0",
              fontSize: "14px",
              color: "inherit",
              backgroundColor: "transparent",
            },
            "&.cm-focused": { outline: "none" },
            ".cm-scroller": {
              fontFamily: "inherit",
              lineHeight: "20px",
              overflow: "auto",
            },
            ".cm-content": {
              padding: "16px",
              minHeight: "100%",
              caretColor: "currentColor",
            },
            ".cm-line": { padding: "0" },
            ".cm-placeholder": { color: "#94a3b8" },
          }),
        ],
      }),
    });
    editor.current = view;
    if (seed) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: initial.value },
        selection: EditorSelection.single(
          Math.min(seed.afterAnchor, initial.value.length),
          Math.min(seed.afterHead, initial.value.length)
        ),
        annotations: [
          Transaction.userEvent.of("input.paste"),
          isolateHistory.of("full"),
        ],
        scrollIntoView: seed.focus,
      });
    }
    initializing = false;
    published.current = initial.value;
    if (seed?.focus) view.focus();
    view.requestMeasure({
      read: () => view.contentHeight,
      write: () => {
        editorReady = true;
        view.contentDOM.dataset.editorReady = "true";
      },
    });
    return () => {
      editor.current = undefined;
      view.destroy();
    };
  }, []);

  useLayoutEffect(() => {
    const view = editor.current;
    if (!view || props.value === published.current) return;
    published.current = props.value;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: props.value },
      annotations: [
        Transaction.userEvent.of("input"),
        isolateHistory.of("full"),
      ],
    });
  }, [props.value]);
  return (
    <div
      ref={container}
      className={cn(
        "h-full min-h-0 overflow-hidden rounded-md border border-slate-300 font-mono shadow-sm focus-within:border-slate-400 focus-within:ring-0 focus-within:ring-offset-0",
        props.className,
        "h-full min-h-0 p-0"
      )}
    />
  );
}
