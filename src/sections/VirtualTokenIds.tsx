import { Fragment, memo, type ReactNode, type Ref } from "react";
import { type TokenizerResult } from "~/models/tokenizer";
import { type TextLayout } from "~/models/text-layout";
import { cn } from "~/utils/cn";
import {
  findSegment,
  TOKEN_COLORS,
  VirtualPane,
  type VisibleLines,
} from "./VirtualPane";

interface Props {
  data?: TokenizerResult;
  layout?: TextLayout;
  paneRef: Ref<HTMLPreElement>;
  onRender: () => void;
  onHover: (index: number | null) => void;
  isFetching?: boolean;
  className?: string;
}
function tokenRuns(data: TokenizerResult, start: number, end: number) {
  const spans: ReactNode[] = [];
  let index = findSegment(data.segmentTokenEnds, start);
  while (index < data.segmentTokenEnds.length) {
    const segmentStart =
      index === 0 ? 0 : data.segmentTokenEnds[index - 1] ?? 0;
    const segmentEnd = data.segmentTokenEnds[index] ?? end;
    if (segmentStart >= end) break;
    const from = Math.max(start, segmentStart);
    const to = Math.min(end, segmentEnd);
    if (to > from)
      spans.push(
        <Fragment key={index}>
          <span
            data-token-segment={index}
            className={cn(
              "transition-colors",
              TOKEN_COLORS[index % TOKEN_COLORS.length]
            )}
          >
            {data.tokens.subarray(from, to).join(", ")}
          </span>
          {to < data.tokens.length && ", "}
        </Fragment>
      );
    index++;
  }
  return spans;
}
export const VirtualTokenIds = memo(function VirtualTokenIds(props: Props) {
  const lines = props.layout?.idLines;
  const lineHeight = props.layout?.lineHeight ?? 24;
  const render = (visible: VisibleLines) => {
    if (!props.data) return null;
    if (!lines) return tokenRuns(props.data, 0, props.data.tokens.length);
    const rows: ReactNode[] = [];
    for (let index = visible.start; index < visible.end; index++) {
      const start = lines.starts[index] ?? 0;
      const end = lines.ends[index] ?? start;
      rows.push(
        <div
          key={index}
          data-id-line={index}
          data-token-start={start}
          data-token-end={end}
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
          {tokenRuns(props.data, start, end)}
        </div>
      );
    }
    return (
      <div
        data-virtual-content=""
        style={{
          position: "relative",
          height: lines.starts.length * lineHeight,
        }}
      >
        {rows}
      </div>
    );
  };
  return (
    <VirtualPane
      ref={props.paneRef}
      label="Token IDs"
      className="token-id-preview"
      virtual={!!lines}
      lineCount={lines?.starts.length ?? 0}
      lineHeight={lineHeight}
      sourceLength={props.data?.text.length}
      tokenCount={props.data?.count}
      resultModel={props.data?.name}
      layoutWidth={props.layout?.width}
      isFetching={props.isFetching}
      paneClassName={props.className}
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
