import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  TokenizerResult,
  WorkerRequest,
  WorkerResponse,
} from "~/models/types";

const mocks = vi.hoisted(() => ({
  handler: undefined as
    | undefined
    | ((event: MessageEvent<WorkerRequest>) => void),
  posts: [] as { message: WorkerResponse; transferCount: number }[],
  inputs: [] as string[],
  afterEncode: undefined as undefined | (() => void),
}));
vi.mock("~/models/family-loader", () => ({
  FamilyLoader: class {
    async load() {
      return { getEncoding: () => ({ name: "qwen2" }) };
    }
  },
}));
vi.mock("~/models/encode", () => ({
  tokenizeWithEncoding(model: string, text: string): TokenizerResult {
    mocks.inputs.push(text);
    const result: TokenizerResult = {
      name: model,
      text,
      tokens: Uint32Array.of(42),
      segmentOffsets: Uint32Array.of(text.length),
      segmentTokenEnds: Uint32Array.of(1),
      count: 1,
      accuracy: "exact",
      normalized: false,
      timing: { encodeMs: 0, segmentMs: 0, totalMs: 0 },
    };
    mocks.afterEncode?.();
    return result;
  },
}));
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  mocks.posts.length = 0;
  mocks.inputs.length = 0;
  mocks.afterEncode = undefined;
  vi.stubGlobal(
    "addEventListener",
    (_kind: string, handler: typeof mocks.handler) => {
      mocks.handler = handler;
    }
  );
  vi.stubGlobal(
    "postMessage",
    (message: WorkerResponse, transfer: Transferable[] = []) => {
      mocks.posts.push({
        message: structuredClone(message, { transfer }),
        transferCount: transfer.length,
      });
    }
  );
  await import("./tokenizer.worker");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function request(id: number, text: string) {
  mocks.handler!({
    data: { id, model: "qwen3", kind: "tokenize", text },
  } as MessageEvent<WorkerRequest>);
}
function terminalMessages() {
  return mocks.posts.filter(({ message }) => message.kind !== "progress");
}

it("coalesces pending inputs and settles every superseded request", async () => {
  request(1, "oldest");
  request(2, "middle");
  request(3, "latest");
  await vi.runAllTimersAsync();
  expect(mocks.inputs).toEqual(["latest"]);
  expect(
    terminalMessages()
      .map(({ message }) => [message.id, message.kind])
      .sort()
  ).toEqual([
    [1, "cancelled"],
    [2, "cancelled"],
    [3, "result"],
  ]);
  const result = terminalMessages().find(
    ({ message }) => message.kind === "result"
  )!;
  expect(result.transferCount).toBe(3);
  if (result.message.kind !== "result")
    throw new Error("Missing worker result");
  expect(result.message.result.text).toBe("latest");
  expect(Array.from(result.message.result.tokens)).toEqual([42]);
});

it("discards a completed stale result before transferring it to the UI", async () => {
  mocks.afterEncode = () => {
    mocks.afterEncode = undefined;
    setTimeout(() => request(2, "new input"), 0);
  };
  request(1, "old input");
  await vi.runAllTimersAsync();
  expect(mocks.inputs).toEqual(["old input", "new input"]);
  expect(
    terminalMessages().map(({ message }) => [message.id, message.kind])
  ).toEqual([
    [1, "cancelled"],
    [2, "result"],
  ]);
});
