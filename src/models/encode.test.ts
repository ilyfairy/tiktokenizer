import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { get_encoding } from "tiktoken";
import { tokenizeWithEncoding } from "./encode";
import type { WasmEncoding, WasmModule } from "./types";
import { materializeSegments } from "~/utils/segments";
import manifest from "./tokenizer-assets.json";

it("preserves token IDs, source text and emoji graphemes in the application adapter", () => {
  const reference = get_encoding("o200k_base");
  const adapter: WasmEncoding = {
    name: "o200k_base",
    encodeWithSpecialTokens: (text) => reference.encode(text, "all"),
    decodeBytes: (ids) => reference.decode(ids),
    free: () => reference.free(),
  };
  for (const text of [
    "Hello 世界",
    "👩‍👧‍👦 🇨🇿 e\u0301",
    "<|endoftext|>",
    "\n\t　！",
  ]) {
    const result = tokenizeWithEncoding("o200k_base", text, adapter);
    const segments = materializeSegments(result);
    expect(result.tokens).toEqual(reference.encode(text, "all"));
    expect(segments.map((segment) => segment.text).join("")).toBe(text);
    expect(
      segments.flatMap((segment) => segment.tokens.map((token) => token.id))
    ).toEqual(Array.from(result.tokens));
  }
  const chat = tokenizeWithEncoding(
    "gpt-4o",
    "<|im_start|>user<|im_sep|>你好<|im_end|>",
    adapter
  );
  expect(chat.tokens[0]).toBe(200264);
  expect(chat.tokens.at(-1)).toBe(200265);
  expect(chat.tokens).toContain(200266);
  expect(
    materializeSegments(chat)
      .map((segment) => segment.text)
      .join("")
  ).toBe("<|im_start|>user<|im_sep|>你好<|im_end|>");
  reference.free();
});

it("returns all tokens and text beyond 10,000 tokens, including a single huge grapheme", () => {
  const reference = get_encoding("o200k_base");
  const adapter: WasmEncoding = {
    name: "o200k_base",
    encodeWithSpecialTokens: (text) => reference.encode(text, "all"),
    decodeBytes: (ids) => reference.decode(ids),
    free: () => reference.free(),
  };
  for (const text of ["hello ".repeat(11000), "a" + "\u0301".repeat(10001)]) {
    const result = tokenizeWithEncoding("o200k_base", text, adapter);
    const expected = reference.encode(text);
    const segments = materializeSegments(result);
    expect(result.count).toBe(expected.length);
    expect(result.tokens).toEqual(expected);
    expect(segments.flatMap((segment) => segment.tokens)).toHaveLength(
      expected.length
    );
    expect(segments.map((segment) => segment.text).join("")).toBe(text);
    expect(segments.map((segment) => segment.text).join("")).not.toContain("�");
  }
  reference.free();
});

it("keeps exact IDs and complete compact offsets for million-character inputs and one huge grapheme", async () => {
  const reference = get_encoding("o200k_base");
  const assets = manifest.families["openai-claude"];
  // Node 24 can require these generated synchronous ESM bindings. This bypasses
  // Vite's public-file transform and runs the same real WASM as the browser.
  const module = createRequire(import.meta.url)(
    join(process.cwd(), "public", assets.loaderUrl)
  ) as WasmModule;
  await module.default({
    module_or_path: new Uint8Array(
      await readFile(join(process.cwd(), "public", assets.wasmUrl))
    ),
  });
  const encoding = module.getEncoding("o200k_base");
  try {
    for (const text of [
      "hello ".repeat(166667).slice(0, 1_000_000),
      "你好世界".repeat(250000),
      "a" + "\u0301".repeat(999999),
    ]) {
      const result = tokenizeWithEncoding("o200k_base", text, encoding);
      let expected: Uint32Array;
      if (text.startsWith("hello")) expected = reference.encode(text, "all");
      else if (text.startsWith("你好")) {
        // The old reference WASM traps on a million-character unbroken CJK
        // piece. Its stable two-token seed still provides independent IDs.
        const seed = reference.encode("你好世界", "all");
        expected = new Uint32Array(seed.length * 250000);
        for (let copy = 0; copy < 250000; copy++)
          expected.set(seed, copy * seed.length);
      } else {
        const seed = reference.encode("a\u0301", "all");
        expect(seed).toHaveLength(2);
        expected = new Uint32Array(1_000_000);
        expected[0] = seed[0]!;
        expected.fill(seed[1]!, 1);
        expect(result.segmentOffsets).toHaveLength(1);
      }
      expect(result.tokens).toEqual(expected);
      expect(result.text).toBe(text);
      expect(result.count).toBe(result.tokens.length);
      expect(result.segmentOffsets).toBeInstanceOf(Uint32Array);
      expect(result.segmentTokenEnds.length).toBe(result.segmentOffsets.length);
      expect(result.segmentOffsets.at(-1)).toBe(text.length);
      expect(result.segmentTokenEnds.at(-1)).toBe(result.count);
      for (let segment = 1; segment < result.segmentOffsets.length; segment++) {
        if (
          result.segmentOffsets[segment]! <=
            result.segmentOffsets[segment - 1]! ||
          result.segmentTokenEnds[segment]! <=
            result.segmentTokenEnds[segment - 1]!
        ) {
          throw new Error("Compact boundaries must remain strictly increasing");
        }
      }
      expect(
        new TextDecoder().decode(encoding.decodeBytes(result.tokens))
      ).toBe(text);
    }
  } finally {
    encoding.free();
    reference.free();
  }
}, 30_000);

it("transfers all compact buffers without cloning token objects or losing IDs", () => {
  const reference = get_encoding("o200k_base");
  const text = "Hello 世界 👩‍👧‍👦 e\u0301\r\n";
  const adapter: WasmEncoding = {
    name: "o200k_base",
    encodeWithSpecialTokens: (value) => reference.encode(value, "all"),
    decodeBytes: (ids) => reference.decode(ids),
    free: () => reference.free(),
  };
  try {
    const result = tokenizeWithEncoding("o200k_base", text, adapter);
    const expectedTokens = reference.encode(text, "all");
    const transferred = structuredClone(result, {
      transfer: [
        result.tokens.buffer as ArrayBuffer,
        result.segmentOffsets.buffer as ArrayBuffer,
        result.segmentTokenEnds.buffer as ArrayBuffer,
      ],
    });
    expect(result.tokens.byteLength).toBe(0);
    expect(result.segmentOffsets.byteLength).toBe(0);
    expect(result.segmentTokenEnds.byteLength).toBe(0);
    expect(transferred.tokens).toEqual(expectedTokens);
    expect(
      materializeSegments(transferred)
        .map((segment) => segment.text)
        .join("")
    ).toBe(text);
  } finally {
    reference.free();
  }
});

it("keeps NFKC and malformed UTF-16 consistent with the text actually encoded", () => {
  const reference = get_encoding("o200k_base");
  const adapter: WasmEncoding = {
    name: "o200k_base",
    encodeWithSpecialTokens: (text) => reference.encode(text, "all"),
    decodeBytes: (ids) => reference.decode(ids),
    free: () => reference.free(),
  };
  try {
    const claude = tokenizeWithEncoding(
      "claude-legacy",
      "ＡＢＣ ﬁ e\u0301",
      adapter
    );
    expect(claude.text).toBe("ABC fi é");
    expect(claude.normalized).toBe(true);
    expect(
      materializeSegments(claude)
        .map((segment) => segment.text)
        .join("")
    ).toBe(claude.text);
    const invalid = tokenizeWithEncoding(
      "o200k_base",
      "\uD800x\uDC00",
      adapter
    );
    expect(invalid.text).toBe("�x�");
    expect(invalid.tokens).toEqual(reference.encode("\uD800x\uDC00", "all"));
    expect(
      materializeSegments(invalid)
        .map((segment) => segment.text)
        .join("")
    ).toBe(invalid.text);
  } finally {
    reference.free();
  }
});
