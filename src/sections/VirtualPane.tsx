import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { cn } from "~/utils/cn";

export const TOKEN_COLORS = [
  "bg-sky-200",
  "bg-amber-200",
  "bg-blue-200",
  "bg-green-200",
  "bg-orange-200",
  "bg-cyan-200",
  "bg-gray-200",
  "bg-purple-200",
  "bg-indigo-200",
  "bg-lime-200",
  "bg-rose-200",
  "bg-violet-200",
  "bg-yellow-200",
  "bg-emerald-200",
  "bg-zinc-200",
  "bg-red-200",
  "bg-fuchsia-200",
  "bg-pink-200",
  "bg-teal-200",
];

/** Exclusive ends: the containing segment is the first end greater than offset. */
export function findSegment(ends: Uint32Array, offset: number): number {
  let low = 0;
  let high = ends.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((ends[middle] ?? 0) <= offset) low = middle + 1;
    else high = middle;
  }
  return low;
}

export interface PaneMetrics {
  font: string;
  width: number;
  lineHeight: number;
  tabSize: number;
}
export interface VisibleLines {
  start: number;
  end: number;
}
interface PaneProps {
  label: string;
  className: string;
  virtual: boolean;
  lineCount: number;
  lineHeight: number;
  sourceLength?: number;
  tokenCount?: number;
  resultModel?: string;
  layoutWidth?: number;
  paneClassName?: string;
  isFetching?: boolean;
  onMetrics?: (metrics: PaneMetrics) => void;
  onRender?: () => void;
  onMouseOver?: MouseEventHandler<HTMLPreElement>;
  onMouseLeave?: MouseEventHandler<HTMLPreElement>;
  children: ReactNode | ((lines: VisibleLines) => ReactNode);
}

export const VirtualPane = forwardRef<HTMLPreElement, PaneProps>(
  function VirtualPane(props, forwardedRef) {
    const ref = useRef<HTMLPreElement>(null);
    const frame = useRef<number>();
    const [viewport, setViewport] = useState({
      top: 0,
      height: 320,
      padding: 16,
    });
    useImperativeHandle(forwardedRef, () => ref.current!, []);

    useLayoutEffect(() => {
      const element = ref.current;
      if (!element) return;
      const measure = () => {
        const style = getComputedStyle(element);
        const padding = Number.parseFloat(style.paddingTop) || 0;
        const next = {
          top: element.scrollTop,
          height: element.clientHeight,
          padding,
        };
        setViewport((previous) =>
          previous.top === next.top &&
          previous.height === next.height &&
          previous.padding === next.padding
            ? previous
            : next
        );
        props.onMetrics?.({
          font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
          width: Math.max(
            1,
            element.clientWidth -
              Number.parseFloat(style.paddingLeft) -
              Number.parseFloat(style.paddingRight)
          ),
          lineHeight:
            Number.parseFloat(style.lineHeight) ||
            Number.parseFloat(style.fontSize) * 1.5,
          tabSize: Number.parseFloat(style.tabSize) || 8,
        });
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => {
        observer.disconnect();
        if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      };
    }, [props.onMetrics]);

    const first = props.virtual
      ? Math.min(
          Math.max(0, props.lineCount - 1),
          Math.max(
            0,
            Math.floor((viewport.top - viewport.padding) / props.lineHeight) - 4
          )
        )
      : 0;
    const end = props.virtual
      ? Math.min(
          props.lineCount,
          Math.ceil(
            (viewport.top + viewport.height - viewport.padding) /
              props.lineHeight
          ) + 4
        )
      : props.lineCount;
    useLayoutEffect(() => {
      const element = ref.current;
      if (!element) return;
      setViewport((previous) =>
        previous.top === element.scrollTop &&
        previous.height === element.clientHeight
          ? previous
          : {
              ...previous,
              top: element.scrollTop,
              height: element.clientHeight,
            }
      );
    }, [props.virtual, props.lineCount, props.lineHeight]);
    useLayoutEffect(() => {
      props.onRender?.();
    }, [first, end, props.onRender, props.children]);

    const onKeyDown = (event: KeyboardEvent<HTMLPreElement>) => {
      const element = event.currentTarget;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(element);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        return;
      }
      if (!props.virtual || event.altKey || event.metaKey) return;
      let position: number | undefined;
      if (event.key === "Home") position = 0;
      else if (event.key === "End") position = element.scrollHeight;
      else if (event.key === "PageDown")
        position = element.scrollTop + element.clientHeight - props.lineHeight;
      else if (event.key === "PageUp")
        position = element.scrollTop - element.clientHeight + props.lineHeight;
      else if (event.key === "ArrowDown")
        position = element.scrollTop + props.lineHeight;
      else if (event.key === "ArrowUp")
        position = element.scrollTop - props.lineHeight;
      if (position !== undefined) {
        event.preventDefault();
        element.scrollTop = position;
      }
    };

    return (
      <pre
        ref={ref}
        aria-label={props.label}
        aria-busy={props.isFetching ?? false}
        tabIndex={0}
        data-virtualized={props.virtual ? "true" : "false"}
        data-line-count={props.virtual ? props.lineCount : undefined}
        data-source-length={props.sourceLength}
        data-token-count={props.tokenCount}
        data-result-model={props.resultModel}
        data-layout-width={props.layoutWidth}
        onMouseOver={props.onMouseOver}
        onMouseLeave={props.onMouseLeave}
        onKeyDown={onKeyDown}
        onScroll={() => {
          if (frame.current !== undefined) return;
          frame.current = requestAnimationFrame(() => {
            frame.current = undefined;
            const element = ref.current;
            if (element) {
              setViewport((previous) => {
                const top = element.scrollTop;
                const start = (position: number) =>
                  Math.floor((position - previous.padding) / props.lineHeight);
                const end = (position: number) =>
                  Math.ceil(
                    (position + previous.height - previous.padding) /
                      props.lineHeight
                  );
                return start(previous.top) === start(top) &&
                  end(previous.top) === end(top)
                  ? previous
                  : { ...previous, top };
              });
            }
          });
        }}
        className={cn(
          "relative min-h-0 min-w-0 max-w-full flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-slate-50 p-4 shadow-sm",
          props.className,
          props.paneClassName
        )}
        style={{
          scrollbarGutter: "stable",
          wordBreak: "normal",
          tabSize: 8,
        }}
      >
        {typeof props.children === "function"
          ? props.children({ start: first, end: Math.max(first, end) })
          : props.children}
      </pre>
    );
  }
);
