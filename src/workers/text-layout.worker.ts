import { clearCache, setLocale } from "@chenglou/pretext";
import type {
  LayoutRequest,
  LayoutResponse,
  TextLayout,
} from "~/models/text-layout";
import {
  layoutTokenIds,
  paragraphLines,
  prepareParagraph,
  type PreparedParagraph,
} from "~/utils/text-layout";

const context = new OffscreenCanvas(1, 1).getContext("2d")!;
const paragraphCache = new Map<string, PreparedParagraph>();
let cachedCharacters = 0;
let measuredCharacters = 0;
let cachedFont = "";
let cachedLocale = "";
let currentDocument:
  | { id: number; text: string; tokens: Uint32Array }
  | undefined;
const documents = new Map<
  number,
  { id: number; text: string; tokens: Uint32Array }
>();
let latest: LayoutRequest | undefined;
let running = false;
const reply = (message: LayoutResponse, transfer: Transferable[] = []) =>
  globalThis.postMessage(message, { transfer });
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
class Superseded extends Error {}

function prepare(source: string, font: string) {
  let paragraph = paragraphCache.get(source);
  if (paragraph) return paragraph;
  // Pretext's global glyph/word measurements outlive paragraph eviction. Bound
  // them across many distinct edits; existing prepared paragraphs stay usable.
  if (measuredCharacters + source.length > 4_000_000) {
    clearCache();
    measuredCharacters = 0;
  }
  paragraph = prepareParagraph(source, font);
  measuredCharacters += source.length;
  paragraphCache.set(source, paragraph);
  cachedCharacters += source.length;
  while (
    (cachedCharacters > 2_000_000 || paragraphCache.size > 4096) &&
    paragraphCache.size > 1
  ) {
    const key = paragraphCache.keys().next().value as string;
    paragraphCache.delete(key);
    cachedCharacters -= key.length;
  }
  return paragraph;
}
async function createLayout(request: LayoutRequest): Promise<TextLayout> {
  const started = performance.now();
  const { font, lineHeight, locale = "en" } = request.options;
  const width = Math.max(1, request.options.width);
  if (font !== cachedFont || locale !== cachedLocale) {
    paragraphCache.clear();
    cachedCharacters = 0;
    measuredCharacters = 0;
    clearCache();
    setLocale(locale);
    cachedFont = font;
    cachedLocale = locale;
  }
  context.font = font;
  const text = currentDocument!.text;
  const starts: number[] = [],
    ends: number[] = [];
  let prepareMs = 0;
  let start = 0;
  let sliceStarted = performance.now();
  // Preparing hard-line paragraphs separately permits reuse after edits and yields
  // between paragraphs instead of blocking the UI on one million-character pass.
  for (let offset = 0; offset <= text.length; offset++) {
    const code = text.charCodeAt(offset);
    if (offset < text.length && code !== 10 && code !== 13 && code !== 12)
      continue;
    let end = offset;
    if (offset < text.length) {
      end++;
      if (code === 13 && text.charCodeAt(offset + 1) === 10) end++;
    }
    const source = text.slice(start, end);
    const beforePrepare = performance.now();
    const paragraph = prepare(source, font);
    prepareMs += performance.now() - beforePrepare;
    paragraphLines(paragraph, width, start, starts, ends);
    start = end;
    offset = end - (end === text.length ? 0 : 1);
    if (performance.now() - sliceStarted >= 8) {
      await pause();
      if (latest && latest.id > request.id) throw new Superseded();
      sliceStarted = performance.now();
    }
    if (start === text.length) {
      if (text.length && /[\r\n\f]/.test(text[text.length - 1]!)) {
        starts.push(start);
        ends.push(start);
      }
      break;
    }
  }
  const digits = Array.from(
    { length: 10 },
    (_, digit) => context.measureText(String(digit)).width
  );
  const idLines = layoutTokenIds(
    currentDocument!.tokens,
    width,
    digits,
    context.measureText(", ").width
  );
  const totalMs = performance.now() - started;
  return {
    textLines: {
      starts: Uint32Array.from(starts),
      ends: Uint32Array.from(ends),
    },
    idLines,
    lineHeight,
    width,
    timing: { prepareMs, layoutMs: totalMs - prepareMs, totalMs },
  };
}
async function drain() {
  if (running) return;
  running = true;
  try {
    while (latest) {
      const request = latest;
      latest = undefined;
      currentDocument = documents.get(request.documentId);
      if (!currentDocument) {
        reply({ id: request.id, error: "Text layout source is missing." });
        continue;
      }
      try {
        const layout = await createLayout(request);
        reply({ id: request.id, layout }, [
          layout.textLines.starts.buffer,
          layout.textLines.ends.buffer,
          layout.idLines.starts.buffer,
          layout.idLines.ends.buffer,
        ]);
      } catch (error) {
        reply({
          id: request.id,
          error:
            error instanceof Superseded
              ? "Layout superseded."
              : error instanceof Error
              ? error.message
              : "Text layout failed.",
        });
      }
    }
  } finally {
    running = false;
  }
}
globalThis.addEventListener("message", (event: MessageEvent<LayoutRequest>) => {
  if (event.data.text !== undefined && event.data.tokens) {
    documents.set(event.data.documentId, {
      id: event.data.documentId,
      text: event.data.text,
      tokens: event.data.tokens,
    });
    while (documents.size > 2) documents.delete(documents.keys().next().value!);
  }
  if (latest) reply({ id: latest.id, error: "Layout superseded." });
  latest = event.data;
  void drain();
});
