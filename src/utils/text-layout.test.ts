import { describe, expect, it } from "vitest";
import type { PreparedTextWithSegments } from "@chenglou/pretext";
import {
  cursorSourceOffset,
  layoutTokenIds,
  upperBound,
  type PreparedParagraph,
} from "./text-layout";

function paragraph(
  segments: string[],
  crlfEnds: number[] = []
): PreparedParagraph {
  const prefixes = [0];
  for (const text of segments)
    prefixes.push(prefixes[prefixes.length - 1]! + text.length);
  return {
    source: segments.join(""),
    prepared: { segments } as PreparedTextWithSegments,
    prefixes: Uint32Array.from(prefixes),
    crlfEnds: Uint32Array.from(crlfEnds),
    graphemeOffsets: new Map(),
  };
}

describe("layout source coordinates", () => {
  it("maps grapheme cursors across combining marks, ZWJ emoji and flags", () => {
    const value = paragraph(["A ", "e\u0301👨‍👩‍👧‍👦🇨🇳Z", " end"]);
    expect(
      cursorSourceOffset(value, { segmentIndex: 1, graphemeIndex: 1 })
    ).toBe(4);
    expect(
      cursorSourceOffset(value, { segmentIndex: 1, graphemeIndex: 2 })
    ).toBe(15);
    expect(
      cursorSourceOffset(value, { segmentIndex: 1, graphemeIndex: 3 })
    ).toBe(19);
    expect(
      cursorSourceOffset(value, { segmentIndex: 1, graphemeIndex: 4 })
    ).toBe(20);
    expect(
      cursorSourceOffset(value, { segmentIndex: 3, graphemeIndex: 0 })
    ).toBe(24);
    expect(value.graphemeOffsets.size).toBe(1);
  });

  it("restores CRLF source positions including the consumed newline", () => {
    const value = paragraph(["a", "\n", "b", "\n", "c"], [2, 4]);
    expect(
      [0, 1, 2, 3, 4, 5].map((segmentIndex) =>
        cursorSourceOffset(value, { segmentIndex, graphemeIndex: 0 })
      )
    ).toEqual([0, 1, 3, 4, 6, 7]);
    expect(upperBound(Uint32Array.from([2, 4]), 1)).toBe(0);
    expect(upperBound(Uint32Array.from([2, 4]), 4)).toBe(2);
  });
});

describe("complete token ID lines", () => {
  it("packs full IDs with separators without splitting or dropping a token", () => {
    const values = Uint32Array.from([0, 9, 10, 999, 4294967295, 2]);
    const lines = layoutTokenIds(values, 10, Array(10).fill(1) as number[], 2);
    expect([...lines.starts]).toEqual([0, 3, 4, 5]);
    expect([...lines.ends]).toEqual([3, 4, 5, 6]);
    const restored = Array.from(lines.starts, (start, row) => [
      ...values.subarray(start, lines.ends[row]),
    ]).flat();
    expect(restored).toEqual([...values]);
  });

  it("handles an empty document and a width smaller than one ID", () => {
    expect(
      layoutTokenIds(new Uint32Array(), 10, Array(10).fill(1) as number[], 2)
        .starts.length
    ).toBe(0);
    const lines = layoutTokenIds(
      Uint32Array.from([123, 456]),
      1,
      Array(10).fill(1) as number[],
      2
    );
    expect([...lines.starts]).toEqual([0, 1]);
    expect([...lines.ends]).toEqual([1, 2]);
  });
});
