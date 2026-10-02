export type TokenizerFamily =
  | "openai-claude"
  | "deepseek"
  | "qwen"
  | "meta"
  | "mistral"
  | "moonshot"
  | "zhipu"
  | "minimax";
export type Accuracy = "exact" | "legacy" | "estimate";
export type AllOptions = string;
export const DEFAULT_MODEL: AllOptions = "gpt-5.6-sol";
export type AllModels = AllOptions;
export interface ModelOption {
  id: string;
  label: string;
  group: string;
  family: TokenizerFamily;
  encoding: string;
  accuracy: Accuracy;
  chat: boolean;
}
function option(
  id: string,
  encoding: string,
  family: TokenizerFamily,
  group: string,
  label = id,
  accuracy: Accuracy = "exact",
  chat = false
): ModelOption {
  return { id, encoding, family, group, label, accuracy, chat };
}
const openai = (id: string, encoding: string, chat = false) =>
  option(id, encoding, "openai-claude", "OpenAI Models", id, "exact", chat);
export const MODEL_OPTIONS: ModelOption[] = [
  openai("gpt-4o", "o200k_base", true),
  openai("gpt-4o-mini", "o200k_base"),
  openai("gpt-4.1", "o200k_base"),
  openai("gpt-4.1-mini", "o200k_base"),
  openai("gpt-4.1-nano", "o200k_base"),
  openai("gpt-5", "o200k_base"),
  openai("gpt-5-mini", "o200k_base"),
  openai("gpt-5-nano", "o200k_base"),
  ...[
    "gpt-5.1",
    "gpt-5.2",
    "gpt-5.4",
    "gpt-5.5",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
  ].map((id) => openai(id, "o200k_base")),
  openai("o1", "o200k_base"),
  openai("o3", "o200k_base"),
  openai("o4-mini", "o200k_base"),
  openai("gpt-3.5-turbo", "cl100k_base", true),
  openai("gpt-4", "cl100k_base", true),
  openai("gpt-4-32k", "cl100k_base", true),
  openai("gpt-4-1106-preview", "cl100k_base", true),
  openai("gpt-4-turbo", "cl100k_base"),
  openai("gpt-oss", "o200k_harmony"),
  ...[
    "text-embedding-ada-002",
    "text-embedding-3-small",
    "text-embedding-3-large",
  ].map((id) => openai(id, "cl100k_base")),
  ...[
    "text-davinci-002",
    "text-davinci-003",
    "code-davinci-002",
    "code-davinci-001",
    "code-cushman-002",
    "code-cushman-001",
    "davinci-codex",
    "cushman-codex",
  ].map((id) => openai(id, "p50k_base")),
  ...[
    "davinci",
    "curie",
    "babbage",
    "ada",
    "text-davinci-001",
    "text-curie-001",
    "text-babbage-001",
    "text-ada-001",
    "text-similarity-davinci-001",
    "text-similarity-curie-001",
    "text-similarity-babbage-001",
    "text-similarity-ada-001",
    "text-search-davinci-doc-001",
    "text-search-curie-doc-001",
    "text-search-babbage-doc-001",
    "text-search-ada-doc-001",
    "code-search-babbage-code-001",
    "code-search-ada-code-001",
  ].map((id) => openai(id, "r50k_base")),
  ...["text-davinci-edit-001", "code-davinci-edit-001"].map((id) =>
    openai(id, "p50k_edit")
  ),
  ...[
    "o200k_base",
    "o200k_harmony",
    "cl100k_base",
    "p50k_base",
    "p50k_edit",
    "r50k_base",
    "gpt2",
  ].map((id) => option(id, id, "openai-claude", "OpenAI Encodings")),
  option(
    "claude",
    "claude_legacy",
    "openai-claude",
    "Claude",
    "Claude 3 / 4 (offline estimate)",
    "estimate"
  ),
  option(
    "claude-legacy",
    "claude_legacy",
    "openai-claude",
    "Claude",
    "Claude legacy vocabulary",
    "legacy"
  ),
  option("deepseek-v3", "deepseek_v3", "deepseek", "DeepSeek"),
  option("deepseek-r1", "deepseek_v3", "deepseek", "DeepSeek"),
  option("deepseek-v4", "deepseek_v4", "deepseek", "DeepSeek"),
  option("deepseek-ai/DeepSeek-R1", "deepseek_v3", "deepseek", "DeepSeek"),
  option("qwen2.5", "qwen2", "qwen", "Qwen"),
  option("qwen3", "qwen2", "qwen", "Qwen"),
  option("Qwen/Qwen2.5-72B", "qwen2", "qwen", "Qwen"),
  option("llama-3", "llama3", "meta", "Meta Llama"),
  option("llama-3.1", "llama3", "meta", "Meta Llama"),
  option("llama-4", "llama3", "meta", "Meta Llama"),
  option("meta-llama/Meta-Llama-3-8B", "llama3", "meta", "Meta Llama"),
  option("meta-llama/Meta-Llama-3-70B", "llama3", "meta", "Meta Llama"),
  option("mistral", "mistral_v3", "mistral", "Mistral"),
  option("kimi-k2", "kimi_k2", "moonshot", "Kimi"),
  option("kimi-k3", "kimi_k3", "moonshot", "Kimi"),
  option("glm-4", "glm4", "zhipu", "GLM"),
  option("glm-5", "glm5", "zhipu", "GLM"),
  option("minimax-m2", "minimax_m2", "minimax", "MiniMax"),
];
const byId = new Map(MODEL_OPTIONS.map((item) => [item.id, item]));
// Keep this list focused on current flagship families. Older models such as
// GPT-4o remain available in their provider group but should not lead the menu.
export const POPULAR: AllOptions[] = [
  DEFAULT_MODEL,
  "gpt-5.5",
  "gpt-5",
  "claude",
  "deepseek-v4",
  "qwen3",
  "llama-4",
  "mistral",
  "kimi-k3",
  "glm-5",
  "minimax-m2",
];
export function getModelOption(id: string): ModelOption {
  const item = byId.get(id);
  if (!item) throw new Error(`Unknown model or encoding: ${id}`);
  return item;
}
export function isValidOption(id: unknown): id is AllOptions {
  return typeof id === "string" && byId.has(id);
}
export function isChatModel(id: AllOptions): boolean {
  return byId.get(id)?.chat ?? false;
}
