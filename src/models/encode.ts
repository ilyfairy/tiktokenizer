import { getModelOption } from "./index";
import type { TokenizerResult, WasmEncoding } from "./types";
import { getSegmentOffsets } from "~/utils/segments";

const chatMarkers = ["<|im_start|>", "<|im_end|>", "<|im_sep|>"];
const byteLengthCaches = new WeakMap<WasmEncoding, Map<number, number>>();

/** Legacy ChatML uses explicit user-visible marker IDs rather than API packaging. */
function encodeChat(
  text: string,
  encoding: WasmEncoding,
  markerBase: number
): Uint32Array {
  const markerPattern = /<\|im_start\|>|<\|im_end\|>|<\|im_sep\|>/g;
  if (!markerPattern.test(text)) return encoding.encodeWithSpecialTokens(text);
  markerPattern.lastIndex = 0;
  let tokens = new Uint32Array(Math.max(16, Math.ceil(text.length / 3)));
  let length = 0;
  const reserve = (additional: number) => {
    if (length + additional <= tokens.length) return;
    const expanded = new Uint32Array(
      Math.max(tokens.length * 2, length + additional)
    );
    expanded.set(tokens);
    tokens = expanded;
  };
  const append = (ids: Uint32Array) => {
    reserve(ids.length);
    tokens.set(ids, length);
    length += ids.length;
  };
  let offset = 0;
  for (const match of text.matchAll(markerPattern)) {
    append(encoding.encodeWithSpecialTokens(text.slice(offset, match.index)));
    reserve(1);
    tokens[length++] = markerBase + chatMarkers.indexOf(match[0]);
    offset = match.index! + match[0].length;
  }
  append(encoding.encodeWithSpecialTokens(text.slice(offset)));
  return tokens.slice(0, length);
}

/** Complete, transferable token IDs and highlighting offsets for the whole input. */
export function tokenizeWithEncoding(
  model: string,
  input: string,
  encoding: WasmEncoding
): TokenizerResult {
  const started = performance.now();
  const option = getModelOption(model);
  // The WASM bridge encodes lone UTF-16 surrogates as U+FFFD, like TextEncoder.
  // Preserve that actual displayed text so byte offsets and highlights agree.
  const wellFormed = input.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "\uFFFD"
  );
  const text =
    option.encoding === "claude_legacy"
      ? wellFormed.normalize("NFKC")
      : wellFormed;
  const markerBase = option.encoding === "o200k_base" ? 200264 : 100264;
  const encodeStart = performance.now();
  const tokens = option.chat
    ? encodeChat(text, encoding, markerBase)
    : encoding.encodeWithSpecialTokens(text);
  const segmentStart = performance.now();
  let lengths = byteLengthCaches.get(encoding);
  if (!lengths) {
    lengths = new Map();
    byteLengthCaches.set(encoding, lengths);
  }
  const singleToken = new Uint32Array(1);
  const compact = getSegmentOffsets(text, tokens, (id) => {
    if (
      option.chat &&
      id >= markerBase &&
      id < markerBase + chatMarkers.length
    ) {
      return chatMarkers[id - markerBase]!.length;
    }
    let length = lengths!.get(id);
    if (length === undefined) {
      singleToken[0] = id;
      length = encoding.decodeBytes(singleToken).length;
      lengths!.set(id, length);
    }
    return length;
  });
  const completed = performance.now();
  return {
    name: option.id,
    text,
    count: tokens.length,
    tokens,
    ...compact,
    accuracy: option.accuracy,
    normalized: text !== input,
    timing: {
      encodeMs: segmentStart - encodeStart,
      segmentMs: completed - segmentStart,
      totalMs: completed - started,
    },
  };
}
