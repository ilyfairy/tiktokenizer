import type { Accuracy, TokenizerFamily } from "./index";
export interface TokenizerResult {
  name: string;
  /** Complete normalized text; offsets index UTF-16 code units in this string. */
  text: string;
  /** Complete token ID sequence for the input. */
  tokens: Uint32Array;
  /** Exclusive UTF-16 end offset for every highlighted segment. */
  segmentOffsets: Uint32Array;
  /** Exclusive index in tokens for every highlighted segment. */
  segmentTokenEnds: Uint32Array;
  count: number;
  accuracy: Accuracy;
  normalized: boolean;
  timing: { encodeMs: number; segmentMs: number; totalMs: number };
}
export interface LoadProgress {
  stage: "downloading" | "initializing" | "ready" | "tokenizing";
  family: TokenizerFamily;
  loaded?: number;
  total?: number;
}
export type WorkerRequest =
  | { id: number; kind: "load"; model: string }
  | { id: number; kind: "tokenize"; model: string; text: string };
export type WorkerResponse =
  | { id: number; kind: "progress"; progress: LoadProgress }
  | { id: number; kind: "loaded" }
  | { id: number; kind: "cancelled" }
  | { id: number; kind: "result"; result: TokenizerResult }
  | { id: number; kind: "error"; error: string; fatal?: boolean };
export interface WasmEncoding {
  name: string;
  encodeWithSpecialTokens(text: string): Uint32Array;
  decodeBytes(tokens: Uint32Array): Uint8Array;
  free(): void;
}
export interface WasmModule {
  default: (options: { module_or_path: Uint8Array }) => Promise<unknown>;
  getEncoding(name: string): WasmEncoding;
}
