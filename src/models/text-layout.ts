import type { TokenizerResult } from "./types";

export interface LayoutOptions {
  font: string;
  width: number;
  lineHeight: number;
  tabSize?: number;
  locale?: string;
}
export interface LineIndex {
  starts: Uint32Array;
  ends: Uint32Array;
}
export interface TextLayout {
  textLines: LineIndex;
  idLines: LineIndex;
  lineHeight: number;
  width: number;
  timing: { prepareMs: number; layoutMs: number; totalMs: number };
}
export interface LayoutRequest {
  id: number;
  documentId: number;
  text?: string;
  tokens?: Uint32Array;
  options: LayoutOptions;
}
export type LayoutResponse =
  | { id: number; layout: TextLayout }
  | { id: number; error: string };

let worker: Worker | undefined;
let nextId = 0;
let nextDocumentId = 0;
const documentIds = new WeakMap<TokenizerResult, number>();
const submittedDocuments = new Set<number>();
const pending = new Map<
  number,
  { resolve: (layout: TextLayout) => void; reject: (error: Error) => void }
>();
function getWorker() {
  if (worker) return worker;
  const currentWorker = new Worker(
    new URL("../workers/text-layout.worker.ts", import.meta.url),
    { type: "module" }
  );
  worker = currentWorker;
  currentWorker.addEventListener(
    "message",
    (event: MessageEvent<LayoutResponse>) => {
      if (worker !== currentWorker) return;
      const request = pending.get(event.data.id);
      if (!request) return;
      pending.delete(event.data.id);
      if ("error" in event.data) request.reject(new Error(event.data.error));
      else request.resolve(event.data.layout);
    }
  );
  const stopWorker = () => {
    if (worker !== currentWorker) return;
    for (const request of pending.values())
      request.reject(new Error("Text layout failed."));
    pending.clear();
    currentWorker.terminate();
    worker = undefined;
    submittedDocuments.clear();
  };
  currentWorker.addEventListener("error", stopWorker);
  currentWorker.addEventListener("messageerror", stopWorker);
  return worker;
}
export function prepareLayout(
  data: TokenizerResult,
  options: LayoutOptions
): Promise<TextLayout> {
  let documentId = documentIds.get(data);
  if (documentId === undefined) {
    documentId = ++nextDocumentId;
    documentIds.set(data, documentId);
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    try {
      pending.set(id, { resolve, reject });
      const target = getWorker();
      // Resize requests send only metrics. The layout worker retains compact source data.
      const first = !submittedDocuments.has(documentId);
      target.postMessage({
        id,
        documentId,
        text: first ? data.text : undefined,
        tokens: first ? data.tokens : undefined,
        options,
      } satisfies LayoutRequest);
      submittedDocuments.add(documentId);
      while (submittedDocuments.size > 2)
        submittedDocuments.delete(submittedDocuments.values().next().value!);
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}
