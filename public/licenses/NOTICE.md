# Tokenizer notices and licenses

Built with Llama.

Llama 3.1 is licensed under the Llama 3.1 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved.

This directory accompanies the tokenizer WASM assets in this distribution. The full upstream license texts and attribution notices listed below must remain with redistributed assets.

## Algorithms and bindings

Text layout uses [Pretext 0.0.9](https://github.com/chenglou/pretext), licensed under the MIT license. Its original copyright and permission notice is preserved in [LICENSE-PRETEXT](LICENSE-PRETEXT).

Large-input editing uses CodeMirror 6 and its runtime dependencies. The original MIT license texts and copyright notices for `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@lezer/common`, `@lezer/highlight`, `@lezer/lr`, `@marijn/find-cluster-break`, `crelt`, `style-mod` and `w3c-keyname` are preserved in [LICENSE-CODEMIRROR](LICENSE-CODEMIRROR).

The Rust tokenizer algorithms derive from [GOLIA's rust-tiktoken 4.1.2](https://github.com/goliajp/rust-tiktoken), Copyright (c) 2023–2026 GOLIA 株式会社, licensed under MIT or Apache-2.0 at the recipient's option. See [LICENSE-GOLIA-MIT](LICENSE-GOLIA-MIT) and [LICENSE-GOLIA-APACHE](LICENSE-GOLIA-APACHE).

Modification notice, 2026-10-01: this distribution adds the legacy Anthropic encoding to the upstream Rust tokenizer, compiles separate WASM resource groups, and provides JavaScript loading wrappers and gzip/Brotli/Zstandard transport files. The source tokenizer ranks are stored as compact, compressed TKV data. These packaging and representation changes are documented in `tokenizer-native/`.

## Vocabulary data

| Resource group                            | Data source                                                                                                            | License and accompanying notice                                                                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai-claude` — OpenAI encodings        | [openai/tiktoken](https://github.com/openai/tiktoken), Copyright (c) 2022 OpenAI                                       | [MIT license](LICENSE-OPENAI)                                                                                                                                                                             |
| `openai-claude` — `claude-legacy`         | [@anthropic-ai/tokenizer 0.0.4](https://www.npmjs.com/package/@anthropic-ai/tokenizer), Copyright 2023 Anthropic, PBC. | [Original package LICENSE](LICENSE-ANTHROPIC), containing MIT terms                                                                                                                                       |
| `meta` — `llama3`                         | [meta-llama/Llama-3.1-8B](https://huggingface.co/meta-llama/Llama-3.1-8B)                                              | [Llama 3.1 Community License](LICENSE-LLAMA-3.1), [Acceptable Use Policy](LLAMA-3.1-USE-POLICY.md), and [attribution Notice](Notice)                                                                      |
| `deepseek` — `deepseek_v3`, `deepseek_v4` | [deepseek-ai/DeepSeek-V3](https://huggingface.co/deepseek-ai/DeepSeek-V3)                                              | [DeepSeek Model License and Attachment A](LICENSE-DEEPSEEK-MODEL); [MIT code license](LICENSE-DEEPSEEK-CODE)                                                                                              |
| `qwen` — `qwen2`                          | [Qwen/Qwen2.5-7B](https://huggingface.co/Qwen/Qwen2.5-7B)                                                              | [Apache-2.0 license](LICENSE-QWEN)                                                                                                                                                                        |
| `mistral` — `mistral_v3`                  | [mistralai/mistral-common](https://github.com/mistralai/mistral-common)                                                | [Apache-2.0 license](LICENSE-MISTRAL)                                                                                                                                                                     |
| `moonshot` — `kimi_k2`, `kimi_k3`         | [moonshotai/Kimi-K2-Instruct](https://huggingface.co/moonshotai/Kimi-K2-Instruct)                                      | [Modified MIT license](LICENSE-MOONSHOT) and [third-party notices](MOONSHOT-THIRD-PARTY-NOTICES.md)                                                                                                       |
| `zhipu` — `glm4`                          | [zai-org/GLM-4.5](https://huggingface.co/zai-org/GLM-4.5)                                                              | The source model card declares MIT for the model release: [preserved model card](GLM-4.5-MODEL-CARD.md). Its separate GitHub code repository provides an [Apache-2.0 code license](LICENSE-GLM-4.5-CODE). |
| `zhipu` — `glm5`                          | [zai-org/GLM-5.2](https://huggingface.co/zai-org/GLM-5.2)                                                              | [MIT license](LICENSE-GLM-5.2)                                                                                                                                                                            |
| `minimax` — `minimax_m2`                  | [MiniMaxAI/MiniMax-M2](https://huggingface.co/MiniMaxAI/MiniMax-M2)                                                    | [Modified MIT license](LICENSE-MINIMAX)                                                                                                                                                                   |

The Anthropic package's npm `license` metadata says `Apache-2.0`, while its actual distributed `LICENSE` contains MIT permission and copyright terms. This distribution preserves that original text verbatim. The [official repository](https://github.com/anthropics/anthropic-tokenizer-typescript) states that this legacy tokenizer is only a very rough approximation for Claude 3 and newer.

The GLM-4.5 model repository contains a MIT declaration in its model card and no separate full license file at the pinned revision. The preserved model card records that declaration; the GitHub code repository's Apache-2.0 file is labeled separately to retain the distinction between model and code sources.

The [upstream third-party summary](UPSTREAM-THIRD-PARTY-LICENSES.md) is preserved for provenance. The complete source licenses above provide the redistribution terms; its older Meta license summary is superseded here by the Llama 3.1 source license.

## Source revisions for downloaded notices

- Qwen/Qwen2.5-7B: `d149729398750b98c0af14eb82c78cfe92750796`.
- moonshotai/Kimi-K2-Instruct: `fd1984e2b7a3350dbf7305fe73a4ede25c14de50`.
- zai-org/GLM-4.5 model card: `cbb2c7cfb52fa128a9660cb1a7a78e017899e115`.
- zai-org/GLM-5.2: `cf457fa734ab149ffef225f80893eb38c6ff5cdc`.

The OpenAI, Meta, DeepSeek, Mistral, GLM-4.5 code, and MiniMax license texts were retrieved from their official GitHub repositories on 2026-10-01. The GOLIA and Anthropic texts were copied from the source packages used in this build.
