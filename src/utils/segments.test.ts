import { it, expect } from "vitest";
import {
  getTiktokenSegments,
  getSegmentOffsets,
  materializeSegments,
} from "./segments";
import { get_encoding } from "tiktoken";

it("segments equality test", () => {
  const encoder = get_encoding("cl100k_base");
  const textDecoder = new TextDecoder();

  const fixtures = [
    "Hello world",
    "New lines\n\n\n\n\n       Spaces",
    "👩‍👦‍👦 👩‍👧‍👦 👩‍👧‍👧 👩‍👩‍👦 👩‍👩‍👧 🇨🇿 Emojis: 🧑🏾‍💻️🧑🏿‍🎓️🧑🏿‍🏭️🧑🏿‍💻️",
    "是美國一個人工智能研究實驗室 由非營利組織OpenAI Inc",
    "<|im_start|>test<|im_end|>",
  ];

  for (const fixture of fixtures) {
    const segments = getTiktokenSegments(encoder, fixture);
    const tokens = encoder.encode(fixture, "all");

    expect(segments.map((i) => i.text).join("")).toEqual(
      textDecoder.decode(encoder.decode(tokens))
    );

    expect(segments.map((i) => i.tokens.map((i) => i.id)).flat(1)).toEqual([
      ...tokens,
    ]);

    expect(segments.map((i) => i.tokens.map((i) => i.idx)).flat(1)).toEqual(
      Array(tokens.length)
        .fill(0)
        .map((_, i) => i)
    );
  }

  encoder.free();
});

it("segments grapheme test", () => {
  const fixtures = {
    "👩‍👦‍👦 👩‍👧‍👦 👩‍👧‍👧 👩‍👩‍👦 👩‍👩‍👧 🇨🇿": ["👩‍👦‍👦", " 👩‍👧‍👦", " 👩‍👧‍👧", " 👩‍👩‍👦", " 👩‍👩‍👧", " 🇨🇿"],
    由非營利組織: ["由", "非", "營", "利", "組", "織"],
  };

  const encoder = get_encoding("cl100k_base");

  for (const [input, output] of Object.entries(fixtures)) {
    const segments = getTiktokenSegments(encoder, input);
    expect(segments.map((i) => i.text)).toEqual(output);
  }
  encoder.free();
});

it("uses native Unicode boundaries for complex clusters while scanning plain text compactly", () => {
  const tokenizer = get_encoding("o200k_base");
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const inputs = [
    "ASCII\r\n汉字𠀀ＡＢé العربية",
    "a\u0301\u0302 👩🏿‍💻 🇨🇳🇨🇿 👍🏽",
    "각 각 क्‍ष क्षि 👨‍👩‍👧‍👦",
    "\u0600a \u0600汉 \u0915\u093f \u0D15\u0D4D\u0D15",
    "a" + "\u0301".repeat(10001),
  ];
  try {
    for (const text of inputs) {
      const tokens = tokenizer.encode(text, "all");
      const lengths = new Map<number, number>();
      const compact = getSegmentOffsets(text, tokens, (id) => {
        let length = lengths.get(id);
        if (length === undefined) {
          length = tokenizer.decode(new Uint32Array([id])).length;
          lengths.set(id, length);
        }
        return length;
      });
      const boundaries = new Set(
        Array.from(
          segmenter.segment(text),
          (item) => item.index + item.segment.length
        )
      );
      for (const offset of compact.segmentOffsets)
        expect(boundaries.has(offset)).toBe(true);
      expect(compact.segmentOffsets.at(-1)).toBe(text.length);
      expect(compact.segmentTokenEnds.at(-1)).toBe(tokens.length);
      const materialized = materializeSegments({ text, tokens, ...compact });
      expect(materialized.map((item) => item.text).join("")).toBe(text);
      expect(
        materialized.flatMap((item) => item.tokens.map((token) => token.id))
      ).toEqual(Array.from(tokens));
    }
  } finally {
    tokenizer.free();
  }
});
