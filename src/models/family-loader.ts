import type { TokenizerFamily } from "./index";
import type { LoadProgress, WasmModule } from "./types";
export interface FamilyAsset {
  loaderUrl: string;
  wasmUrl: string;
  encodings: string[];
  files: { wasm: { raw: number } };
}
export interface AssetManifest {
  families: Record<TokenizerFamily, FamilyAsset>;
}
type ProgressCallback = (progress: LoadProgress) => void;
interface Dependencies {
  fetch: typeof fetch;
  importModule: (url: string) => Promise<WasmModule>;
}

/** Share downloads and instances, and evict failed attempts so Retry can recover. */
export class FamilyLoader {
  private readonly attempts = new Map<TokenizerFamily, Promise<WasmModule>>();
  private readonly listeners = new Map<
    TokenizerFamily,
    Set<ProgressCallback>
  >();
  private readonly progress = new Map<TokenizerFamily, LoadProgress>();
  private readonly failed = new Set<TokenizerFamily>();
  private readonly retries = new Map<TokenizerFamily, number>();
  constructor(
    private readonly assets: AssetManifest,
    private readonly dependencies: Dependencies
  ) {}

  async load(
    family: TokenizerFamily,
    onProgress?: ProgressCallback
  ): Promise<WasmModule> {
    const listeners = this.listeners.get(family) ?? new Set<ProgressCallback>();
    this.listeners.set(family, listeners);
    if (onProgress) {
      listeners.add(onProgress);
      const current = this.progress.get(family);
      if (current) onProgress(current);
    }
    let attempt = this.attempts.get(family);
    if (!attempt) {
      attempt = this.download(family).catch((error) => {
        this.failed.add(family);
        this.retries.set(family, (this.retries.get(family) ?? 0) + 1);
        this.attempts.delete(family);
        this.progress.delete(family);
        throw error;
      });
      this.attempts.set(family, attempt);
    }
    try {
      return await attempt;
    } finally {
      if (onProgress) listeners.delete(onProgress);
    }
  }
  private notify(progress: LoadProgress) {
    this.progress.set(progress.family, progress);
    for (const listener of this.listeners.get(progress.family) ?? [])
      listener(progress);
  }
  private async download(family: TokenizerFamily): Promise<WasmModule> {
    const asset = this.assets.families[family];
    if (!asset) throw new Error(`No vocabulary bundle exists for ${family}.`);
    this.notify({
      family,
      stage: "downloading",
      loaded: 0,
      total: asset.files.wasm.raw,
    });
    const response = await this.dependencies.fetch(asset.wasmUrl, {
      cache: this.failed.has(family) ? "reload" : "force-cache",
    });
    if (!response.ok)
      throw new Error(
        `Vocabulary download failed (${response.status}). Please retry.`
      );
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          chunks.push(chunk.value);
          loaded += chunk.value.length;
          this.notify({
            family,
            stage: "downloading",
            loaded,
            total: asset.files.wasm.raw,
          });
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      const bytes = new Uint8Array(await response.arrayBuffer());
      chunks.push(bytes);
      loaded = bytes.length;
    }
    if (loaded !== asset.files.wasm.raw)
      throw new Error("The vocabulary download is incomplete. Please retry.");
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    this.notify({ family, stage: "initializing" });
    // Browsers memoize failed module imports. A fresh URL permits a real retry.
    const retry = this.retries.get(family) ?? 0;
    const module = await this.dependencies.importModule(
      retry ? `${asset.loaderUrl}?retry=${retry}` : asset.loaderUrl
    );
    await module.default({ module_or_path: bytes });
    this.failed.delete(family);
    this.notify({ family, stage: "ready" });
    return module;
  }
}
