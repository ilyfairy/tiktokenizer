import { getModelOption, type AllOptions } from "./index";
import type {
  LoadProgress,
  TokenizerResult,
  WorkerRequest,
  WorkerResponse,
} from "./types";
export type { LoadProgress, TokenizerResult } from "./types";
export interface Tokenizer {
  name: string;
  tokenize(text: string): Promise<TokenizerResult>;
  free(): void;
}
interface Pending {
  resolve: (message: WorkerResponse) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: LoadProgress) => void;
}
let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, Pending>();
function getWorker(): Worker {
  if (worker) return worker;
  if (typeof window === "undefined")
    throw new Error("Tokenization runs in the browser.");
  const currentWorker = new Worker(
    new URL("../workers/tokenizer.worker.ts", import.meta.url),
    { type: "module" }
  );
  worker = currentWorker;
  const stopWorker = () => {
    if (worker !== currentWorker) return;
    for (const request of pending.values())
      request.reject(new Error("The tokenizer stopped. Please retry."));
    pending.clear();
    currentWorker.terminate();
    worker = undefined;
  };
  currentWorker.addEventListener(
    "message",
    (event: MessageEvent<WorkerResponse>) => {
      if (worker !== currentWorker) return;
      const request = pending.get(event.data.id);
      if (!request) return;
      if (event.data.kind === "progress") {
        request.onProgress?.(event.data.progress);
        return;
      }
      pending.delete(event.data.id);
      if (event.data.kind === "cancelled") {
        const error = new Error("A newer input replaced this tokenization.");
        error.name = "AbortError";
        request.reject(error);
      } else if (event.data.kind === "error") {
        request.reject(new Error(event.data.error));
        if (event.data.fatal) stopWorker();
      } else request.resolve(event.data);
    }
  );
  currentWorker.addEventListener("error", stopWorker);
  currentWorker.addEventListener("messageerror", stopWorker);
  return currentWorker;
}
type RequestWithoutId = WorkerRequest extends infer R
  ? R extends WorkerRequest
    ? Omit<R, "id">
    : never
  : never;
function request(
  message: RequestWithoutId,
  onProgress?: (progress: LoadProgress) => void
): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    try {
      const target = getWorker();
      pending.set(id, { resolve, reject, onProgress });
      target.postMessage({ ...message, id });
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}
export async function createTokenizer(
  name: AllOptions,
  onProgress?: (progress: LoadProgress) => void
): Promise<Tokenizer> {
  getModelOption(name);
  await request({ kind: "load", model: name }, onProgress);
  return {
    name,
    async tokenize(text) {
      const response = await request({ kind: "tokenize", model: name, text });
      if (response.kind !== "result")
        throw new Error("Unexpected tokenizer response.");
      return response.result;
    },
    // Encoders belong to the shared worker and remain cached when the view changes.
    free() {},
  };
}
