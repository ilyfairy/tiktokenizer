# Third-party code and vocabulary sources

This file records the libraries and tokenizer data used by the application.
The exact versions are pinned in `package.json`, `pnpm-lock.yaml`,
`tokenizer-native/Cargo.toml` and `tokenizer-native/Cargo.lock`.

## Browser dependencies

| Packages                                                                        | Use                                              | Project                                                                                                                                | License              |
| ------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `react`, `react-dom`                                                            | UI                                               | [facebook/react](https://github.com/facebook/react)                                                                                    | MIT                  |
| `@chenglou/pretext`                                                             | Text measurement and line layout                 | [chenglou/pretext](https://github.com/chenglou/pretext)                                                                                | MIT                  |
| `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`                 | Large document editing and history               | [CodeMirror](https://codemirror.net/)                                                                                                  | MIT                  |
| `@radix-ui/react-checkbox`, `@radix-ui/react-popover`, `@radix-ui/react-select` | Accessible UI primitives                         | [radix-ui/primitives](https://github.com/radix-ui/primitives)                                                                          | MIT                  |
| `class-variance-authority`, `clsx`, `cmdk`                                      | Component variants, class names and model search | [CVA](https://github.com/joe-bell/cva), [clsx](https://github.com/lukeed/clsx), [cmdk](https://github.com/pacocoursey/cmdk)            | Apache-2.0, MIT, MIT |
| `lucide-react`                                                                  | Icons                                            | [lucide](https://github.com/lucide-icons/lucide)                                                                                       | ISC                  |
| `tailwind-merge`, `tailwindcss-animate`                                         | CSS class merging and animation utilities        | [tailwind-merge](https://github.com/dcastil/tailwind-merge), [tailwindcss-animate](https://github.com/jamiebuilds/tailwindcss-animate) | MIT                  |

## Build and test dependencies

The development toolchain uses Vite, TypeScript, Vitest, Playwright, ESLint,
TypeScript ESLint, Prettier, Tailwind CSS, PostCSS, Autoprefixer and the
corresponding `@types/*` packages. Their project links and licenses are listed
in the package metadata and lockfile; they are not shipped as tokenizer data.
`tiktoken@1.0.15` is used only as a Node test oracle. Browser tokenization uses
the checked-in WASM bundles.

## Native tokenizer

The optional native build in [`tokenizer-native/`](../tokenizer-native/) uses:

- [GOLIA rust-tiktoken 4.1.2](https://github.com/goliajp/rust-tiktoken), vendored under `tokenizer-native/vendor/tiktoken`, licensed MIT or Apache-2.0.
- [wasm-bindgen](https://github.com/rustwasm/wasm-bindgen), licensed MIT or Apache-2.0.
- The vendored core's `regex`, `rustc-hash` and `ruzstd` crates, with the licenses recorded by Cargo and the vendor notices.

The native build is not needed for normal development. It is only used when
changing tokenizer data or rebuilding the WASM bundles.

## Vocabulary data

The checked-in bundles contain data from the following upstream projects:

| Bundle           | Vocabulary source                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| OpenAI encodings | [openai/tiktoken](https://github.com/openai/tiktoken)                                                     |
| Claude legacy    | [anthropics/anthropic-tokenizer-typescript](https://github.com/anthropics/anthropic-tokenizer-typescript) |
| Llama            | [Meta Llama 3.1](https://huggingface.co/meta-llama/Llama-3.1-8B)                                          |
| DeepSeek         | [DeepSeek-V3](https://huggingface.co/deepseek-ai/DeepSeek-V3)                                             |
| Qwen             | [Qwen2.5](https://huggingface.co/Qwen/Qwen2.5-7B)                                                         |
| Mistral          | [mistral-common](https://github.com/mistralai/mistral-common)                                             |
| Kimi             | [Kimi-K2](https://huggingface.co/moonshotai/Kimi-K2-Instruct)                                             |
| GLM              | [GLM-4.5](https://huggingface.co/zai-org/GLM-4.5) and [GLM-5.2](https://huggingface.co/zai-org/GLM-5.2)   |
| MiniMax          | [MiniMax-M2](https://huggingface.co/MiniMaxAI/MiniMax-M2)                                                 |

The complete license texts, model notices and attribution files are kept in
[`public/licenses/`](../public/licenses/index.html).
Claude 3/4 counts are labeled estimates because the current Claude vocabulary
is not public; the bundled Claude vocabulary is the published legacy one.
