#!/usr/bin/env node
/** Validate the checked-in tokenizer bundles and reference IDs. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = join(root, "public");
const manifest = JSON.parse(
  await readFile(join(publicRoot, "tokenizers", "manifest.json"), "utf8")
);
const sourceManifest = JSON.parse(
  await readFile(join(root, "src", "models", "tokenizer-assets.json"), "utf8")
);
assert.deepEqual(manifest, sourceManifest, "Browser and public manifests must agree");
const fixtures = JSON.parse(
  await readFile(join(root, "tokenizer-native", "reference-fixtures.json"), "utf8")
);
const modules = {};
let samples = 0;
let encodingCount = 0;
let fragments = 0;

for (const [family, asset] of Object.entries(manifest.families)) {
  const loaderBytes = await readFile(join(publicRoot, asset.loaderUrl));
  const wasmBytes = await readFile(join(publicRoot, asset.wasmUrl));
  assert.equal(wasmBytes.length, asset.files.wasm.raw, `${family} WASM size`);
  const module = await import(
    `data:text/javascript;base64,${loaderBytes.toString("base64")}`
  );
  await module.default({ module_or_path: wasmBytes });
  modules[family] = module;
  assert.deepEqual(module.listEncodings(), asset.encodings, `${family} encoding list`);
  for (const name of asset.encodings) {
    encodingCount++;
    const encoding = module.getEncoding(name);
    try {
      for (const fixture of fixtures.references[name] || []) {
        assert.deepEqual(
          Array.from(encoding.encode(fixture.text)),
          fixture.encode,
          `${name} ordinary reference IDs`
        );
        assert.deepEqual(
          Array.from(encoding.encodeWithSpecialTokens(fixture.text)),
          fixture.encodeWithSpecialTokens,
          `${name} special reference IDs`
        );
        samples++;
      }
      for (const text of [
        "",
        "你好👩‍💻，世界！ \nРусский café\tالعربية123456",
        " .\n/ test 1234   \n\nend ",
        "🇨🇳🫠 𐐀e\u0301",
      ]) {
        const tokens = encoding.encode(text);
        assert.equal(encoding.count(text), tokens.length, `${name} count`);
        assert.equal(
          new TextDecoder("utf-8", { fatal: true }).decode(
            encoding.decodeBytes(tokens)
          ),
          text,
          `${name} byte round trip`
        );
        const perTokenBytes = Array.from(tokens, (id) =>
          encoding.decodeBytes(Uint32Array.of(id))
        );
        assert.deepEqual(
          Buffer.concat(perTokenBytes),
          Buffer.from(text),
          `${name} fragmented bytes`
        );
        for (const fragment of perTokenBytes) {
          try {
            new TextDecoder("utf-8", { fatal: true }).decode(fragment);
          } catch {
            fragments++;
          }
        }
      }
    } finally {
      encoding.free();
    }
  }
}

assert.throws(() => modules.qwen.getEncoding("o200k_base"), /absent/);
assert.throws(
  () => modules["openai-claude"].getEncoding("qwen2"),
  /absent/
);
const openai = modules["openai-claude"].getEncoding("o200k_base");
const qwen = modules.qwen.getEncoding("qwen2");
try {
  assert.equal(openai.decode(openai.encode("Hello，世界")), "Hello，世界");
  assert.equal(qwen.decode(qwen.encode("Hello，世界")), "Hello，世界");
} finally {
  openai.free();
  qwen.free();
}
assert.ok(fragments > 0, "Fixtures must cover split UTF-8 token boundaries");
console.log(
  `Verified ${Object.keys(modules).length} tokenizer bundles, ${encodingCount} encoding entries, ${samples} reference samples, and ${fragments} split UTF-8 fragments.`
);
