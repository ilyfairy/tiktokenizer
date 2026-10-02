import { memo, type ReactNode, type Ref } from "react";
import { type TokenizerResult } from "~/models/tokenizer";
import { type TextLayout } from "~/models/text-layout";
import { cn } from "~/utils/cn";
import {
  findSegment,
  TOKEN_COLORS,
  VirtualPane,
  type PaneMetrics,
  type VisibleLines,
} from "./VirtualPane";

interface Props {
  data?: TokenizerResult;
  layout?: TextLayout;
  paneRef: Ref<HTMLPreElement>;
  overlay: ReactNode;
  onMetrics: (metrics: PaneMetrics) => void;
  onRender: () => void;
  onHover: (index: number | null) => void;
  isFetching?: boolean;
  className?: string;
}
function textRuns(data: TokenizerResult, start: number, end: number) {
  const spans: ReactNode[] = [];
  let index = findSegment(data.segmentOffsets, start);
  while (index < data.segmentOffsets.length) {
    const segmentStart = index === 0 ? 0 : data.segmentOffsets[index - 1] ?? 0;
    const segmentEnd = data.segmentOffsets[index] ?? end;
    if (segmentStart >= end) break;
    const from = Math.max(start, segmentStart);
    const to = Math.min(end, segmentEnd);
    if (to > from)
      spans.push(
        <span
          key={index}
          data-token-segment={index}
          data-source-start={from}
          data-source-end={to}
          data-soft-hyphen={
            to === end &&
            to < data.text.length &&
            data.text[to - 1] === "\u00ad" &&
            !/[\r\n\f]/.test(data.text[to] ?? "")
              ? ""
              : undefined
          }
          className={cn(
            "transition-colors",
            TOKEN_COLORS[index % TOKEN_COLORS.length]
          )}
        >
          {data.text.slice(from, to)}
        </span>
      );
    index++;
  }
  return spans;
}

export const VirtualText = memo(function VirtualText(props: Props) {
  const lines = props.layout?.textLines;
  const lineHeight = props.layout?.lineHeight ?? 24;
  const render = (visible: VisibleLines) => {
    if (!props.data) return props.overlay;
    if (!lines)
      return (
        <>
          {textRuns(props.data, 0, props.data.text.length)}
          {props.overlay}
        </>
      );
    const rows: ReactNode[] = [];
    for (let index = visible.start; index < visible.end; index++) {
      const start = lines.starts[index] ?? 0;
      const end = lines.ends[index] ?? start;
      const next = props.data.text[end];
      rows.push(
        <div
          key={index}
          data-text-line={index}
          data-source-end={end}
          data-newline={next === "\r" || next === "\n" ? "true" : undefined}
          style={{
            position: "absolute",
            top: index * lineHeight,
            left: 0,
            height: lineHeight,
            whiteSpace: "pre",
            overflowWrap: "normal",
            wordBreak: "normal",
          }}
        >
          {textRuns(props.data, start, end)}
        </div>
      );
    }
    return (
      <>
        <div
          data-virtual-content=""
          style={{
            position: "relative",
            height: lines.starts.length * lineHeight,
          }}
        >
          {rows}
        </div>
        {props.overlay}
      </>
    );
  };
  return (
    <VirtualPane
      ref={props.paneRef}
      label="Tokenized text"
      className="token-text-preview"
      virtual={!!lines}
      lineCount={lines?.starts.length ?? 0}
      lineHeight={lineHeight}
      sourceLength={props.data?.text.length}
      tokenCount={props.data?.count}
      resultModel={props.data?.name}
      layoutWidth={props.layout?.width}
      isFetching={props.isFetching}
      paneClassName={props.className}
      onMetrics={props.onMetrics}
      onRender={props.onRender}
      onMouseOver={(event) => {
        const element =
          event.target instanceof HTMLElement
            ? event.target.closest<HTMLElement>("[data-token-segment]")
            : null;
        props.onHover(element ? Number(element.dataset.tokenSegment) : null);
      }}
      onMouseLeave={() => props.onHover(null)}
    >
      {render}
    </VirtualPane>
  );
});
