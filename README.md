![Tiktokenizer](https://user-images.githubusercontent.com/1443449/222597674-287aefdc-f0e1-491b-9bf9-16431b1b8054.svg)

---

# Tiktokenizer

Browser-based tokenizer playground for inspecting token counts, colored token
boundaries and token IDs. This fork runs entirely in the browser and builds to
a static site.

## Run

Requires Node.js 24 or newer and pnpm.

Rust is not required for normal development or production builds. It is only
needed when rebuilding the optional native tokenizer source.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000>. Create a production build with:

```sh
pnpm build
pnpm preview
```

Deploy the generated `out/` directory with the static web server of your choice.

## Features

- OpenAI encodings, the published Claude legacy vocabulary, DeepSeek, Qwen, Llama, Mistral, Kimi, GLM and MiniMax vocabularies.
- Provider vocabularies are split into eight named WASM families and loaded on demand.
- Tokenization runs in a Web Worker; loaded families and browser-cached assets are reused.
- Large inputs use CodeMirror 6 for editing and Pretext for Worker-based token preview layout.
- Full text and token IDs remain available through scrolling. Results are never preview-truncated.
Claude's current tokenizer is not public. The Claude entries here are either the
published legacy vocabulary or an explicitly labeled offline estimate; they are
not billing-accurate current Claude counts.

## Validate

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm tokenizers:verify
pnpm build
pnpm test:e2e
```

## Credits and licenses

This project is a fork of [dqbd/tiktokenizer](https://github.com/dqbd/tiktokenizer).
It uses GOLIA rust-tiktoken, Pretext, CodeMirror, React, Radix UI, Tailwind CSS,
OpenAI encodings, Anthropic's legacy vocabulary and other provider vocabularies.
Complete license texts and notices for the assets actually bundled here are in
[`public/licenses/`](public/licenses/), with the full source list in
[`docs/THIRD-PARTY.md`](docs/THIRD-PARTY.md).
