#!/usr/bin/env node
/** Rebuild independently loadable tokenizer bundles. Node >= 24. */
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { constants, zstdCompressSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const native = join(root, "tokenizer-native");
const publicRoot = join(root, "public", "tokenizers");
const args = process.argv.slice(2);
const argument = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const packOnly = args.includes("--pack-only");
const familyFilter = argument("--family");
const bindgen = argument("--bindgen") || process.env.WASM_BINDGEN || "wasm-bindgen";
const families = ["openai-claude", "deepseek", "qwen", "meta", "mistral", "moonshot", "zhipu", "minimax"];
if (familyFilter && !families.includes(familyFilter)) throw new Error(`Unknown family: ${familyFilter}`);

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: native, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}

function encodeVarint(value) {
  const bytes = [];
  do {
    const next = value & 0x7f;
    value >>>= 7;
    bytes.push(next | (value ? 0x80 : 0));
  } while (value);
  return Buffer.from(bytes);
}

async function prepareClaudeVocabulary() {
  const data = JSON.parse(await readFile(join(native, "data", "claude.json"), "utf8"));
  const words = data.bpe_ranks.trim().split(/\s+/);
  const entries = [];
  let rank = 0;
  for (let index = 0; index < words.length; index++) {
    if (words[index] === "!") rank = Number(words[++index]);
    else entries.push({ bytes: Buffer.from(words[index], "base64"), rank: rank++ });
  }
  // explicit_n_vocab in the historical JSON is stale; the actual rank data wins.
  if (entries.length !== 64995 || entries[0].rank !== 5 || rank !== 65000) {
    throw new Error("Unexpected Anthropic legacy vocabulary format");
  }
  for (let index = 0; index < entries.length; index++) {
    if (entries[index].rank !== index + 5) throw new Error("Claude ranks are not consecutive");
  }
  const header = Buffer.alloc(12);
  header.write("TKV1");
  header.writeUInt32LE(entries.length, 4);
  header.writeUInt32LE(5, 8);
  const lengths = entries.map(({ bytes }) => encodeVarint(bytes.length));
  const classes = new Map();
  for (const { bytes } of entries) {
    if (!classes.has(bytes.length)) classes.set(bytes.length, []);
    classes.get(bytes.length).push(bytes);
  }
  const body = [...classes.entries()].sort(([a], [b]) => a - b).flatMap(([, bytes]) => bytes);
  const frame = Buffer.concat([header, ...lengths, ...body]);
  await writeFile(join(native, "vendor", "tiktoken", "src", "encodings", "claude_legacy.tkv.zst"),
    zstdCompressSync(frame, { params: { [constants.ZSTD_c_compressionLevel]: 19 } }));
}

async function writeAsset(directory, filename, bytes) {
  await writeFile(join(directory, filename), bytes);
  return { raw: bytes.length };
}

await mkdir(publicRoot, { recursive: true });
await prepareClaudeVocabulary();
let previous = { families: {} };
try { previous = JSON.parse(await readFile(join(publicRoot, "manifest.json"), "utf8")); } catch {}
const resultFamilies = familyFilter ? { ...previous.families } : {};

for (const family of families.filter((name) => !familyFilter || familyFilter === name)) {
  const output = join(native, "target", "bundles", family);
  if (!packOnly) {
    run("cargo", ["+1.91.0", "build", "--locked", "--release", "--target", "wasm32-unknown-unknown", "--no-default-features", "--features", family]);
    await mkdir(output, { recursive: true });
    run(bindgen, [join(native, "target", "wasm32-unknown-unknown", "release", "tiktokenizer_wasm.wasm"), "--target", "web", "--out-dir", output, "--out-name", family, "--no-typescript"]);
  }
  const loaderName = `${family}.js`;
  const wasmName = `${family}_bg.wasm`;
  const loader = await readFile(join(output, loaderName));
  const wasm = await readFile(join(output, wasmName));
  // Keep published paths readable. Cache invalidation belongs to the server or
  // release directory, not to opaque names in the source tree.
  const assetDirectory = join(publicRoot, family);
  await rm(assetDirectory, { recursive: true, force: true });
  await mkdir(assetDirectory, { recursive: true });
  const files = {
    loader: await writeAsset(assetDirectory, loaderName, loader),
    wasm: await writeAsset(assetDirectory, wasmName, wasm),
  };
  // This also checks that no accidentally bundled provider leaked into the build.
  const { default: init, listEncodings, getEncoding } = await import(`data:text/javascript;base64,${loader.toString("base64")}`);
  await init({ module_or_path: wasm });
  const encodings = listEncodings();
  for (const name of encodings) {
    const encoding = getEncoding(name);
    const sample = "Hello，世界 👩‍💻\n123456";
    const tokens = encoding.encode(sample);
    const decoded = new TextDecoder().decode(encoding.decodeBytes(tokens));
    if (decoded !== sample) throw new Error(`${name}: byte round trip failed`);
    if (encoding.count(sample) !== tokens.length) throw new Error(`${name}: count disagrees with encode`);
    encoding.free();
  }
  resultFamilies[family] = {
    encodings,
    loaderUrl: `/tokenizers/${family}/${loaderName}`,
    wasmUrl: `/tokenizers/${family}/${wasmName}`,
    files: { wasm: files.wasm },
  };
  console.log(`${family}: ${encodings.join(", ")} | WASM ${(files.wasm.raw / 1024).toFixed(1)} KiB`);
}

const manifest = {
  schemaVersion: 1,
  engine: { name: "Golia tiktoken", version: "4.1.2", wasmBindgen: "0.2.104", rust: "1.91.0" },
  families: resultFamilies,
};
const serialized = JSON.stringify(manifest, null, 2) + "\n";
await writeFile(join(publicRoot, "manifest.json"), serialized);
await writeFile(join(root, "src", "models", "tokenizer-assets.json"), serialized);
for (const entry of await readdir(publicRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && /^[0-9a-f]{20}$/.test(entry.name))
    await rm(join(publicRoot, entry.name), { recursive: true, force: true });
}
console.log("Generated public/tokenizers/manifest.json and src/models/tokenizer-assets.json");
