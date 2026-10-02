import manifest from "~/models/tokenizer-assets.json";
import { FamilyLoader, type AssetManifest } from "~/models/family-loader";
import { getModelOption } from "~/models";
import { tokenizeWithEncoding } from "~/models/encode";
import type {
  WasmEncoding,
  WasmModule,
  WorkerRequest,
  WorkerResponse,
} from "~/models/types";

const loader = new FamilyLoader(manifest as AssetManifest, {
  fetch: (...args) => fetch(...args),
  // Absolute URLs keep Vite's dev importer away from generated public assets.
  importModule: (url) =>
    import(
      /* @vite-ignore */ new URL(url, globalThis.location.origin).href
    ) as Promise<WasmModule>,
});
const encodings = new Map<string, WasmEncoding>();
const workerScope = globalThis as unknown as {
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
};
const reply = (message: WorkerResponse, transfer?: Transferable[]) =>
  workerScope.postMessage(message, transfer);
const fail = (request: WorkerRequest, error: unknown) =>
  reply({
    id: request.id,
    kind: "error",
    error: error instanceof Error ? error.message : "Tokenization failed.",
    fatal: error instanceof WebAssembly.RuntimeError,
  });
async function loadEncoding(request: WorkerRequest) {
  const option = getModelOption(request.model);
  const module = await loader.load(option.family, (progress) =>
    reply({ id: request.id, kind: "progress", progress })
  );
  // Include family in the identity even if two future bundles expose the same name.
  const key = `${option.family}:${option.encoding}`;
  let encoding = encodings.get(key);
  if (!encoding) {
    encoding = module.getEncoding(option.encoding);
    encodings.set(key, encoding);
  }
  return { option, encoding };
}

type TokenizeRequest = Extract<WorkerRequest, { kind: "tokenize" }>;
let queued: TokenizeRequest | undefined;
let processing = false;
const yieldMessages = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));
/** The editor needs the latest input; every superseded request still settles. */
async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    while (queued) {
      const request = queued;
      queued = undefined;
      try {
        const { option, encoding } = await loadEncoding(request);
        // Let pending messages replace a stale request before entering sync WASM.
        await yieldMessages();
        if (queued) {
          reply({ id: request.id, kind: "cancelled" });
          continue;
        }
        reply({
          id: request.id,
          kind: "progress",
          progress: { stage: "tokenizing", family: option.family },
        });
        const result = tokenizeWithEncoding(
          request.model,
          request.text,
          encoding
        );
        // Sync WASM cannot be interrupted. Drain messages before transferring
        // its result so an already outdated million-character layout is skipped.
        await yieldMessages();
        if (queued) {
          reply({ id: request.id, kind: "cancelled" });
          continue;
        }
        reply({ id: request.id, kind: "result", result }, [
          result.tokens.buffer as ArrayBuffer,
          result.segmentOffsets.buffer as ArrayBuffer,
          result.segmentTokenEnds.buffer as ArrayBuffer,
        ]);
      } catch (error) {
        fail(request, error);
        if (error instanceof WebAssembly.RuntimeError) {
          // Main-thread fatal handling rejects all remaining pending promises
          // and replaces this worker, including its damaged WASM instances.
          queued = undefined;
          break;
        }
      }
    }
  } finally {
    processing = false;
  }
}

globalThis.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.kind === "load") {
    void loadEncoding(request)
      .then(() => reply({ id: request.id, kind: "loaded" }))
      .catch((error) => fail(request, error));
    return;
  }
  if (queued) reply({ id: queued.id, kind: "cancelled" });
  queued = request;
  void processQueue();
});
