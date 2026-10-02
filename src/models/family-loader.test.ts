import { describe, expect, it, vi } from "vitest";
import { FamilyLoader, type AssetManifest } from "./family-loader";
import type { WasmModule } from "./types";

function fixture() {
  const asset = (family: string) => ({
    loaderUrl: `/${family}.js`,
    wasmUrl: `/${family}.wasm`,
    encodings: [],
    files: { wasm: { raw: 4 } },
  });
  const manifest: AssetManifest = {
    families: {
      "openai-claude": asset("openai-claude"),
      deepseek: asset("deepseek"),
      qwen: asset("qwen"),
      meta: asset("meta"),
      mistral: asset("mistral"),
      moonshot: asset("moonshot"),
      zhipu: asset("zhipu"),
      minimax: asset("minimax"),
    },
  };
  const module: WasmModule = {
    default: vi.fn(async () => {}),
    getEncoding() {
      throw new Error("Not used by the loader.");
    },
  };
  const fetcher = vi.fn(
    async () => new Response(new Uint8Array([0, 97, 115, 109]))
  );
  const importer = vi.fn(async () => module);
  return { manifest, module, fetcher, importer };
}
describe("lazy family loading", () => {
  it("shares an in-flight download, then reuses the initialized module", async () => {
    const f = fixture();
    const loader = new FamilyLoader(f.manifest, {
      fetch: f.fetcher,
      importModule: f.importer,
    });
    const updates: string[] = [];
    const [a, b] = await Promise.all([
      loader.load("qwen", (progress) => updates.push(progress.stage)),
      loader.load("qwen"),
    ]);
    expect(a).toBe(b);
    expect(await loader.load("qwen")).toBe(a);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(f.fetcher).toHaveBeenCalledWith("/qwen.wasm", {
      cache: "force-cache",
    });
    expect(f.importer).toHaveBeenCalledTimes(1);
    expect(f.module.default).toHaveBeenCalledTimes(1);
    expect(updates).toContain("downloading");
    expect(updates.at(-1)).toBe("ready");
    await loader.load("deepseek");
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it("allows failed downloads to retry while bypassing a broken cached response", async () => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(
      new Response("unavailable", { status: 503 })
    );
    const loader = new FamilyLoader(f.manifest, {
      fetch: f.fetcher,
      importModule: f.importer,
    });
    await expect(loader.load("qwen")).rejects.toThrow("503");
    await expect(loader.load("qwen")).resolves.toBe(f.module);
    expect(f.fetcher).toHaveBeenLastCalledWith("/qwen.wasm", {
      cache: "reload",
    });
  });
  it("rejects incomplete assets before initialization", async () => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(new Response(new Uint8Array([0, 97])));
    const loader = new FamilyLoader(f.manifest, {
      fetch: f.fetcher,
      importModule: f.importer,
    });
    await expect(loader.load("deepseek")).rejects.toThrow("incomplete");
    expect(f.module.default).not.toHaveBeenCalled();
  });
  it("changes the module URL when retrying a failed dynamic import", async () => {
    const f = fixture();
    f.importer.mockRejectedValueOnce(new Error("Module download failed"));
    const loader = new FamilyLoader(f.manifest, {
      fetch: f.fetcher,
      importModule: f.importer,
    });
    await expect(loader.load("qwen")).rejects.toThrow("Module download failed");
    await expect(loader.load("qwen")).resolves.toBe(f.module);
    expect(f.importer).toHaveBeenLastCalledWith("/qwen.js?retry=1");
  });
});
