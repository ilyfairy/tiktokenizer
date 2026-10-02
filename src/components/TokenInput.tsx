import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { TextArea } from "./Input";
import type { EditorSeed, LargeTextEditorProps } from "./LargeTextEditor";

export const LARGE_INPUT_THRESHOLD = 32_768;
let editorImport:
  | Promise<{ default: ComponentType<LargeTextEditorProps> }>
  | undefined;
const importEditor = () =>
  (editorImport ??= import("./LargeTextEditor").catch((error) => {
    editorImport = undefined;
    throw error;
  }));

interface Props {
  value: string;
  onChange(value: string): void;
  label: string;
  placeholder?: string;
  className?: string;
}
/** Native editing for small inputs; a lazy virtual editor keeps large inputs editable. */
export function TokenInput(props: Props) {
  const [large, setLarge] = useState(
    props.value.length >= LARGE_INPUT_THRESHOLD
  );
  const [Editor, setEditor] = useState<ComponentType<LargeTextEditorProps>>();
  const [loadError, setLoadError] = useState(false);
  const native = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const seed = useRef<EditorSeed>();
  const beforeSelection = useRef({ anchor: 0, head: 0 });
  const composing = useRef<{ before: string; anchor: number; head: number }>();
  const previousNativeValue = useRef(props.value);
  if (!large && props.value.length < LARGE_INPUT_THRESHOLD)
    previousNativeValue.current = props.value;
  const activate = useCallback(
    (
      value: string,
      element: HTMLTextAreaElement,
      anchor: number,
      head: number
    ) => {
      seed.current ??= {
        before: element.value,
        beforeAnchor: element.selectionStart,
        beforeHead: element.selectionEnd,
        afterAnchor: anchor,
        afterHead: head,
        focus: document.activeElement === element,
      };
      setLarge(true);
      void importEditor().catch(() => {});
      latest.current.onChange(value);
    },
    []
  );

  useEffect(() => {
    if (!large) return;
    let active = true;
    void importEditor()
      .then((module) => {
        if (active) setEditor(() => module.default);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [large]);
  useEffect(() => {
    if (
      props.value.length < LARGE_INPUT_THRESHOLD ||
      large ||
      composing.current
    )
      return;
    const element = native.current;
    seed.current ??= {
      before: previousNativeValue.current,
      beforeAnchor: beforeSelection.current.anchor,
      beforeHead: beforeSelection.current.head,
      afterAnchor: element?.selectionStart ?? props.value.length,
      afterHead: element?.selectionEnd ?? props.value.length,
      focus: document.activeElement === element,
    };
    setLarge(true);
  }, [props.value, large]);
  useEffect(() => {
    const element = native.current;
    if (!element || Editor) return;
    const onBeforeInput = (event: InputEvent) => {
      if (
        !event.cancelable ||
        event.isComposing ||
        composing.current ||
        event.inputType !== "insertText" ||
        !event.data
      )
        return;
      const value =
        element.value.slice(0, element.selectionStart) +
        event.data.replace(/\r\n?/g, "\n") +
        element.value.slice(element.selectionEnd);
      if (value.length < LARGE_INPUT_THRESHOLD) return;
      event.preventDefault();
      const caret =
        element.selectionStart + event.data.replace(/\r\n?/g, "\n").length;
      activate(value, element, caret, caret);
    };
    element.addEventListener("beforeinput", onBeforeInput);
    return () => element.removeEventListener("beforeinput", onBeforeInput);
  }, [Editor, activate]);

  if (Editor) return <Editor {...props} seed={seed.current} />;
  return (
    <>
      <TextArea
        ref={native}
        aria-label={props.label}
        placeholder={props.placeholder}
        value={large && !loadError ? seed.current?.before ?? "" : props.value}
        data-editor-kind="native"
        data-editor-ready={String(!large || loadError)}
        readOnly={large && !loadError}
        className={props.className}
        onCompositionStart={(event) => {
          composing.current = {
            before: event.currentTarget.value,
            anchor: event.currentTarget.selectionStart,
            head: event.currentTarget.selectionEnd,
          };
        }}
        onCompositionEnd={(event) => {
          const previous = composing.current;
          composing.current = undefined;
          const element = event.currentTarget;
          if (previous && element.value.length >= LARGE_INPUT_THRESHOLD) {
            seed.current ??= {
              before: previous.before,
              beforeAnchor: previous.anchor,
              beforeHead: previous.head,
              afterAnchor: element.selectionStart,
              afterHead: element.selectionEnd,
              focus: document.activeElement === element,
            };
            activate(
              element.value,
              element,
              element.selectionStart,
              element.selectionEnd
            );
          }
        }}
        onSelect={(event) => {
          beforeSelection.current = {
            anchor: event.currentTarget.selectionStart,
            head: event.currentTarget.selectionEnd,
          };
        }}
        onPaste={(event) => {
          const element = event.currentTarget;
          const paste = event.clipboardData
            .getData("text/plain")
            .replace(/\r\n?/g, "\n");
          const value =
            element.value.slice(0, element.selectionStart) +
            paste +
            element.value.slice(element.selectionEnd);
          if (!paste || value.length < LARGE_INPUT_THRESHOLD) return;
          event.preventDefault();
          const caret = element.selectionStart + paste.length;
          activate(value, element, caret, caret);
        }}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (value.length >= LARGE_INPUT_THRESHOLD && !composing.current) {
            seed.current ??= {
              before: latest.current.value,
              beforeAnchor: beforeSelection.current.anchor,
              beforeHead: beforeSelection.current.head,
              afterAnchor: event.currentTarget.selectionStart,
              afterHead: event.currentTarget.selectionEnd,
              focus: document.activeElement === event.currentTarget,
            };
            setLarge(true);
          }
          props.onChange(value);
        }}
      />
      {loadError && (
        <p role="alert" className="text-xs text-slate-500">
          The browser editor is available while the large editor cannot be
          loaded.
        </p>
      )}
    </>
  );
}
