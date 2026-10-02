/** Only compatibility helpers materialize these objects; production uses typed offsets. */
export type Segment = { text: string; tokens: { id: number; idx: number }[] };
export interface CompactSegments {
  /** Exclusive UTF-16 end offset in the normalized text for each segment. */
  segmentOffsets: Uint32Array;
  /** Exclusive index in the token ID array for each segment. */
  segmentTokenEnds: Uint32Array;
}
export interface SegmentedText extends CompactSegments {
  text: string;
  tokens: ArrayLike<number>;
}
const graphemer = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// These characters always have grapheme breaks between them, except CR + LF.
// Complex scripts and emoji continue to use the browser's complete Unicode rules.
function simpleCodePoint(codePoint: number): boolean {
  return (
    codePoint <= 0x7f ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x20000 && codePoint <= 0x323af)
  );
}

/**
 * Intersect token byte boundaries with Unicode grapheme boundaries in one scan.
 * No token objects, token strings, byte buffers, or per-character TextEncoders.
 */
export function getSegmentOffsets(
  text: string,
  tokens: ArrayLike<number>,
  tokenByteLength: (id: number) => number
): CompactSegments {
  const segmentOffsets = new Uint32Array(tokens.length);
  const segmentTokenEnds = new Uint32Array(tokens.length);
  let segments = 0;
  let consumedBytes = 0;
  let textBytes = 0;
  let textOffset = 0;
  let previousCodePoint = 0;
  let unicodeSegments: Intl.Segments | undefined;
  let knownGraphemeEnd = 0;

  const isGraphemeBoundary = (offset: number): boolean => {
    if (offset === text.length || offset === knownGraphemeEnd) return true;
    if (offset < knownGraphemeEnd) return false;
    const nextCodePoint = text.codePointAt(offset)!;
    if (simpleCodePoint(previousCodePoint) && simpleCodePoint(nextCodePoint)) {
      return !(previousCodePoint === 0x0d && nextCodePoint === 0x0a);
    }
    // Cache the whole containing cluster. A million combining marks still need
    // only one ICU lookup rather than a million overlapping substring objects.
    unicodeSegments ??= graphemer.segment(text);
    const containing = unicodeSegments.containing(offset)!;
    knownGraphemeEnd = containing.index + containing.segment.length;
    return containing.index === offset;
  };

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    const byteLength = tokenByteLength(tokens[tokenIndex]!);
    if (byteLength <= 0) throw new Error("A token has no decoded bytes.");
    consumedBytes += byteLength;
    // A token may end in the middle of a UTF-8 character. Advance past that
    // character, then keep accumulating token bytes until both offsets agree.
    while (textBytes < consumedBytes && textOffset < text.length) {
      const codePoint = text.codePointAt(textOffset)!;
      previousCodePoint = codePoint;
      textOffset += codePoint > 0xffff ? 2 : 1;
      textBytes +=
        codePoint <= 0x7f
          ? 1
          : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
          ? 3
          : 4;
    }
    if (textBytes === consumedBytes && isGraphemeBoundary(textOffset)) {
      segmentOffsets[segments] = textOffset;
      segmentTokenEnds[segments] = tokenIndex + 1;
      segments++;
    }
  }
  if (
    textOffset !== text.length ||
    textBytes !== consumedBytes ||
    (tokens.length > 0 && segmentTokenEnds[segments - 1] !== tokens.length)
  ) {
    throw new Error("The tokenizer bytes do not match the displayed text.");
  }
  return segments === tokens.length
    ? { segmentOffsets, segmentTokenEnds }
    : {
        segmentOffsets: segmentOffsets.slice(0, segments),
        segmentTokenEnds: segmentTokenEnds.slice(0, segments),
      };
}

/** Materialize only a requested range for tests, clipboard, or a visible viewport. */
export function materializeSegments(
  result: SegmentedText,
  startSegment = 0,
  endSegment = result.segmentOffsets.length
): Segment[] {
  const segments: Segment[] = [];
  for (let segment = startSegment; segment < endSegment; segment++) {
    const textStart = segment === 0 ? 0 : result.segmentOffsets[segment - 1]!;
    const tokenStart =
      segment === 0 ? 0 : result.segmentTokenEnds[segment - 1]!;
    const tokenEnd = result.segmentTokenEnds[segment]!;
    const tokens: Segment["tokens"] = [];
    for (let token = tokenStart; token < tokenEnd; token++) {
      tokens.push({ id: result.tokens[token]!, idx: token });
    }
    segments.push({
      text: result.text.slice(textStart, result.segmentOffsets[segment]),
      tokens,
    });
  }
  return segments;
}

/** Compatibility adapter for the reference tokenizer's Unicode regression fixtures. */
export function getByteSegments(
  text: string,
  tokens: ArrayLike<number>,
  decodeToken: (id: number) => Uint8Array
): Segment[] {
  const lengths = new Map<number, number>();
  const compact = getSegmentOffsets(text, tokens, (id) => {
    let length = lengths.get(id);
    if (length === undefined) {
      length = decodeToken(id).length;
      lengths.set(id, length);
    }
    return length;
  });
  return materializeSegments({ text, tokens, ...compact });
}

export function getTiktokenSegments(
  tokenizer: {
    encode(text: string, allowed: "all"): Uint32Array;
    decode_single_token_bytes(id: number): Uint8Array;
  },
  text: string
): Segment[] {
  return getByteSegments(text, tokenizer.encode(text, "all"), (id) =>
    tokenizer.decode_single_token_bytes(id)
  );
}
