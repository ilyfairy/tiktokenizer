# Native tokenizer source

`tokenizer-native/` is the optional Rust/WASM build source for the browser
tokenizers. It is not a second application and it is not required to run the
site. The checked-in files under `public/tokenizers/` are the ready-to-use
bundles.

The native crate combines GOLIA's `rust-tiktoken` core with the provider
vocabularies. Each Cargo feature builds one independent bundle:

```text
openai-claude  deepseek  qwen  meta
mistral        moonshot  zhipu minimax
```

This separation lets the browser load only the selected provider. The source
also contains the public Claude legacy vocabulary and the reference fixtures
used by `pnpm tokenizers:verify`.

## Rebuild

Normal development does not need Rust, network downloads or Hugging Face
credentials. Rebuild only after changing the native tokenizer or vocabulary
data.

Requirements:

- Rust 1.91.0 with the `wasm32-unknown-unknown` target
- `wasm-bindgen-cli` 0.2.104
- Node.js 24+

```sh
rustup toolchain install 1.91.0 --profile minimal --target wasm32-unknown-unknown
cargo +1.91.0 install wasm-bindgen-cli --version 0.2.104 --locked
pnpm tokenizers:build
```

To package already-built bundles without compiling Rust:

```sh
pnpm tokenizers:build -- --pack-only
```

To rebuild one provider, add for example `-- --family qwen`. The build script
validates byte round trips and token counts, then writes these readable files:

```text
public/tokenizers/<family>/<family>.js
public/tokenizers/<family>/<family>_bg.wasm
```

The generated manifest is written to both
`public/tokenizers/manifest.json` and `src/models/tokenizer-assets.json`.
