// Maintainer tool. Requires the original tiktoken 1.0.15 dependency installed.
// The checked-in JSON remains usable after removing that dependency.
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { get_encoding } = require("tiktoken");
const { Tiktoken } = require("tiktoken/lite");
const claude = JSON.parse(readFileSync(join(__dirname, "data", "claude.json"), "utf8"));
const inputs = [
  "", "hello world!", "你好，世界！这是一个 tokenizer 测试。",
  "👩‍💻👨‍👩‍👧‍👦𐐀ée\u0301 العربية русский",
  " \t\n\r\n   trailing \n\n", "1234567890 0123456789",
  "function f(x) { return x?.value ?? 'test'; }\n// 中文注释\n",
  "™ ϰ ＡＢＣ ① ﬃ", "<|endoftext|>foo<|fim_prefix|>bar", "<EOT>foo<META>bar<SOS>",
];
const encodings = ["cl100k_base", "o200k_base", "r50k_base", "p50k_base", "p50k_edit", "gpt2", "claude_legacy"];
const references = {};
for (const name of encodings) {
  const encoding = name === "claude_legacy"
    ? new Tiktoken(claude.bpe_ranks, claude.special_tokens, claude.pat_str)
    : get_encoding(name);
  references[name] = inputs.map((text) => ({
    text,
    encode: Array.from(encoding.encode(text, [], [])),
    encodeWithSpecialTokens: Array.from(encoding.encode(text, "all")),
  }));
  encoding.free();
}
async function finish() {
  const sources = { openai: "tiktoken 1.0.15", claude: "@anthropic-ai/tokenizer 0.0.4 getTokenizer() with tiktoken 1.0.15" };
  // Optional path to the unpacked official @goliapkg/tiktoken-wasm 4.1.2 tarball.
  const goliaPath = process.argv[2];
  if (goliaPath) {
    const module = await import(pathToFileURL(join(goliaPath, "tiktoken_wasm.js")).href);
    await module.default({ module_or_path: readFileSync(join(goliaPath, "tiktoken_wasm_bg.wasm")) });
    for (const name of module.listEncodings()) {
      if (references[name]) continue;
      const encoding = module.getEncoding(name);
      references[name] = inputs.map((text) => ({
        text,
        encode: Array.from(encoding.encode(text)),
        encodeWithSpecialTokens: Array.from(encoding.encodeWithSpecialTokens(text)),
      }));
      encoding.free();
    }
    sources.otherProviders = "@goliapkg/tiktoken-wasm 4.1.2 official npm package";
  }
  writeFileSync(join(__dirname, "reference-fixtures.json"), JSON.stringify({ sources, references }, null, 2) + "\n");
  console.log(`Recorded reference token IDs for ${Object.keys(references).length} encodings and ${inputs.length} multilingual samples.`);
}
finish().catch((error) => { console.error(error); process.exitCode = 1; });
