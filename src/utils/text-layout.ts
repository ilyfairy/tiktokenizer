import {
  prepareWithSegments,
  walkLineRanges,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";
import type { LineIndex } from "~/models/text-layout";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export function upperBound(values: ArrayLike<number>, target: number): number {
  let low = 0,
    high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]! <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}
export interface PreparedParagraph {
  source: string;
  prepared: PreparedTextWithSegments;
  prefixes: Uint32Array;
  crlfEnds: Uint32Array;
  graphemeOffsets: Map<number, Uint32Array>;
}
/** Retain source coordinates; Pretext's cursors count graphemes, not UTF-16 units. */
export function prepareParagraph(
  source: string,
  font: string
): PreparedParagraph {
  const prepared = prepareWithSegments(source, font, {
    whiteSpace: "pre-wrap",
    wordBreak: "normal",
  });
  const prefixes = new Uint32Array(prepared.segments.length + 1);
  for (let index = 0; index < prepared.segments.length; index++)
    prefixes[index + 1] = prefixes[index]! + prepared.segments[index]!.length;
  const crlfEnds: number[] = [];
  let normalizedOffset = 0;
  for (let index = 0; index < source.length; index++) {
    if (
      source.charCodeAt(index) === 13 &&
      source.charCodeAt(index + 1) === 10
    ) {
      index++;
      crlfEnds.push(normalizedOffset + 1);
    }
    normalizedOffset++;
  }
  return {
    source,
    prepared,
    prefixes,
    crlfEnds: Uint32Array.from(crlfEnds),
    graphemeOffsets: new Map(),
  };
}
export function cursorSourceOffset(
  paragraph: PreparedParagraph,
  cursor: LayoutCursor
): number {
  let offset =
    paragraph.prefixes[cursor.segmentIndex] ??
    paragraph.prefixes[paragraph.prefixes.length - 1]!;
  if (cursor.graphemeIndex > 0) {
    let boundaries = paragraph.graphemeOffsets.get(cursor.segmentIndex);
    if (!boundaries) {
      const text = paragraph.prepared.segments[cursor.segmentIndex] ?? "";
      const offsets = [0];
      for (const value of graphemes.segment(text))
        offsets.push(value.index + value.segment.length);
      boundaries = Uint32Array.from(offsets);
      paragraph.graphemeOffsets.set(cursor.segmentIndex, boundaries);
    }
    offset +=
      boundaries[cursor.graphemeIndex] ?? boundaries[boundaries.length - 1]!;
  }
  return offset + upperBound(paragraph.crlfEnds, offset);
}
export function paragraphLines(
  paragraph: PreparedParagraph,
  width: number,
  base: number,
  starts: number[],
  ends: number[]
) {
  if (!paragraph.source.length) {
    starts.push(base);
    ends.push(base);
    return;
  }
  let consumed = 0;
  walkLineRanges(paragraph.prepared, width, (range) => {
    const end = cursorSourceOffset(paragraph, range.end);
    let paintEnd = end;
    while (
      paintEnd > consumed &&
      /[\r\n\f]/.test(paragraph.source[paintEnd - 1]!)
    )
      paintEnd--;
    starts.push(base + consumed);
    ends.push(base + paintEnd);
    consumed = end;
  });
}
/** Token IDs remain atomic; separators are measured as part of the preceding ID. */
export function layoutTokenIds(
  tokens: Uint32Array,
  width: number,
  digits: readonly number[],
  separator: number
): LineIndex {
  const starts: number[] = [],
    ends: number[] = [];
  if (!tokens.length)
    return { starts: new Uint32Array(), ends: new Uint32Array() };
  let start = 0,
    advance = 0;
  for (let index = 0; index < tokens.length; index++) {
    let value = tokens[index]!;
    let size = 0;
    do {
      size += digits[value % 10]!;
      value = Math.floor(value / 10);
    } while (value);
    if (index < tokens.length - 1) size += separator;
    if (index > start && advance + size > width) {
      starts.push(start);
      ends.push(index);
      start = index;
      advance = 0;
    }
    advance += size;
  }
  starts.push(start);
  ends.push(tokens.length);
  return { starts: Uint32Array.from(starts), ends: Uint32Array.from(ends) };
}
