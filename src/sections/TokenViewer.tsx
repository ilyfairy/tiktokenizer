import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Checkbox } from "~/components/Checkbox";
import { prepareLayout, type TextLayout } from "~/models/text-layout";
import { type TokenizerResult } from "~/models/tokenizer";
import { VirtualText } from "./VirtualText";
import { VirtualTokenIds } from "./VirtualTokenIds";
import { findSegment, type PaneMetrics } from "./VirtualPane";

// Keep ordinary results cheap to paint. The previous 16k/4096 boundary still
// allowed a 10k-character input to create thousands of token spans at once.
const SMALL_TEXT_LENGTH = 8_192;
const SMALL_TOKEN_COUNT = 2_048;
interface Presentation {
  data: TokenizerResult;
  layout?: TextLayout;
}

export function TokenViewer(props: {
  isFetching: boolean;
  model: string | undefined;
  data: TokenizerResult | undefined;
  accuracy?: "exact" | "legacy" | "estimate";
}) {
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [presentation, setPresentation] = useState<Presentation>();
  const [metrics, setMetrics] = useState<PaneMetrics>();
  const [layoutError, setLayoutError] = useState<string>();
  const [layoutPending, setLayoutPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const textRef = useRef<HTMLPreElement>(null);
  const idsRef = useRef<HTMLPreElement>(null);
  const overlayRef = useRef<HTMLSpanElement>(null);
  const activeIndex = useRef<number | null>(null);
  const markerCache = useRef<string>();
  const markerData = useRef<Presentation>();
  const data = presentation?.data;
  const accuracy = data?.accuracy ?? props.accuracy ?? "exact";

  const onMetrics = useCallback((next: PaneMetrics) => {
    setMetrics((previous) =>
      previous &&
      previous.font === next.font &&
      previous.width === next.width &&
      previous.lineHeight === next.lineHeight &&
      previous.tabSize === next.tabSize
        ? previous
        : next
    );
  }, []);

  useEffect(() => {
    const next = props.data;
    if (!next) {
      setLayoutPending(false);
      return;
    }
    let active = true;
    setLayoutError(undefined);
    if (
      next.text.length <= SMALL_TEXT_LENGTH &&
      next.tokens.length <= SMALL_TOKEN_COUNT
    ) {
      setPresentation({ data: next });
      setLayoutPending(false);
    } else if (metrics) {
      setLayoutPending(true);
      void prepareLayout(next, metrics)
        .then((layout) => {
          if (active) {
            setPresentation({ data: next, layout });
            setLayoutPending(false);
          }
        })
        .catch((error: unknown) => {
          if (active) {
            setLayoutError(
              error instanceof Error ? error.message : String(error)
            );
            setLayoutPending(false);
          }
        });
    } else {
      setLayoutPending(true);
    }
    return () => {
      active = false;
    };
  }, [props.data, metrics, attempt]);

  const refresh = useCallback(() => {
    const pre = textRef.current;
    const ids = idsRef.current;
    const overlay = overlayRef.current;
    if (!pre || !overlay) return;
    const index = activeIndex.current;
    pre.toggleAttribute("data-hovering", index !== null);
    for (const element of pre.querySelectorAll("[data-active]"))
      element.removeAttribute("data-active");
    for (const element of ids?.querySelectorAll("[data-active]") ?? [])
      element.removeAttribute("data-active");
    if (index !== null) {
      for (const element of pre.querySelectorAll(
        `[data-token-segment="${index}"]`
      ))
        element.setAttribute("data-active", "");
      for (const element of ids?.querySelectorAll(
        `[data-token-segment="${index}"]`
      ) ?? [])
        element.setAttribute("data-active", "");
    }
    const visibleRows = pre.querySelectorAll<HTMLElement>("[data-text-line]");
    const key = `${showWhitespace}:${index}:${pre.clientWidth}:${
      visibleRows[0]?.dataset.textLine
    }:${visibleRows[visibleRows.length - 1]?.dataset.textLine}`;
    if (markerData.current === presentation && markerCache.current === key)
      return;
    markerData.current = presentation;
    markerCache.current = key;
    if (!showWhitespace && index === null) {
      overlay.replaceChildren();
      return;
    }

    const fragment = document.createDocumentFragment();
    const bounds = pre.getBoundingClientRect();
    const range = document.createRange();
    const append = (
      character: string,
      rectangle: Pick<DOMRect, "left" | "top" | "width" | "height">
    ) => {
      const marker = document.createElement("span");
      marker.dataset.whitespaceKind =
        character === " "
          ? "space"
          : character === "\t"
          ? "tab"
          : character === "\r" || character === "\n"
          ? "newline"
          : "control";
      marker.dataset.marker =
        character === " " ? "·" : character === "\t" ? "→" : "↵";
      marker.style.left = `${
        rectangle.left - bounds.left - pre.clientLeft + pre.scrollLeft
      }px`;
      marker.style.top = `${
        rectangle.top - bounds.top - pre.clientTop + pre.scrollTop
      }px`;
      marker.style.width = `${rectangle.width}px`;
      marker.style.height = `${rectangle.height}px`;
      marker.style.lineHeight = `${rectangle.height}px`;
      fragment.append(marker);
    };
    const selector = showWhitespace
      ? "[data-token-segment]"
      : `[data-token-segment="${index}"]`;
    for (const element of pre.querySelectorAll<HTMLElement>(selector)) {
      const node = element.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) continue;
      for (const match of (node.textContent ?? "").matchAll(
        /[ \t\r\n\f\b\v]/g
      )) {
        range.setStart(node, match.index);
        range.setEnd(node, match.index + 1);
        append(match[0], range.getBoundingClientRect());
      }
    }
    for (const row of visibleRows) {
      if (row.dataset.newline !== "true" || !data) continue;
      const sourceEnd = Number(row.dataset.sourceEnd);
      if (
        !showWhitespace &&
        findSegment(data.segmentOffsets, sourceEnd) !== index
      )
        continue;
      const node = row.lastElementChild?.firstChild;
      if (node?.nodeType === Node.TEXT_NODE) {
        range.setStart(node, node.textContent?.length ?? 0);
        range.collapse(true);
        append("\n", range.getBoundingClientRect());
      } else {
        const rectangle = row.getBoundingClientRect();
        append("\n", {
          left: rectangle.left,
          top: rectangle.top,
          width: 0,
          height: presentation?.layout?.lineHeight ?? 24,
        });
      }
    }
    overlay.replaceChildren(fragment);
  }, [data, presentation, showWhitespace]);

  const onHover = useCallback(
    (index: number | null) => {
      if (activeIndex.current === index) return;
      activeIndex.current = index;
      refresh();
    },
    [refresh]
  );
  useLayoutEffect(() => {
    activeIndex.current = null;
    markerCache.current = undefined;
    refresh();
  }, [refresh]);
  const overlay = useMemo(
    () => (
      <span
        ref={overlayRef}
        aria-hidden="true"
        data-whitespace-overlay=""
        className="pointer-events-none absolute inset-0 select-none"
      />
    ),
    []
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="rounded-md border bg-slate-50 p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-4">
          <div className="min-w-0">
            <p className="min-w-0 truncate text-sm">
              {accuracy === "estimate"
                ? "Estimated token count"
                : "Token count"}
              {accuracy === "legacy" && " (legacy tokenizer)"}
            </p>
            <p className="text-lg">{data?.count ?? "—"}</p>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm">Character count</p>
            <p className="text-lg">{data?.text.length ?? "—"}</p>
          </div>
        </div>
      </div>
      {layoutError && (
        <p role="alert" className="text-sm text-red-700">
          {layoutError}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </button>
        </p>
      )}
      <VirtualText
        data={data}
        layout={presentation?.layout}
        paneRef={textRef}
        overlay={overlay}
        onMetrics={onMetrics}
        onRender={refresh}
        onHover={onHover}
        isFetching={props.isFetching || layoutPending}
        className="min-h-0 flex-1"
      />
      <VirtualTokenIds
        data={data}
        layout={presentation?.layout}
        paneRef={idsRef}
        onRender={refresh}
        onHover={onHover}
        isFetching={props.isFetching || layoutPending}
        className="min-h-0 flex-1"
      />
      <style>{`
      .token-text-preview[data-hovering] [data-token-segment]:not([data-active]),
      .token-id-preview [data-token-segment]:not([data-active]) { background-color: transparent; }
      .token-text-preview [data-soft-hyphen]::after { content: "-"; }
      [data-whitespace-overlay] [data-whitespace-kind] { position: absolute; color: #64748b; }
      [data-whitespace-overlay] [data-whitespace-kind]::before { content: attr(data-marker); position: absolute; left: 50%; transform: translateX(-50%); }
    `}</style>
      <div className="flex items-center space-x-2">
        <Checkbox
          id="show-whitespace"
          checked={showWhitespace}
          onClick={() => setShowWhitespace((value) => !value)}
        />
        <label
          htmlFor="show-whitespace"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Show whitespace
        </label>
      </div>
    </div>
  );
}
