/**
 * LLM backend dispatcher.
 *
 * Ordinary call sites (pipeline / trading-commentary) import `runLlm` from
 * this module instead of binding to a specific backend. Enrichment uses the
 * dedicated `runTranslationLlm` wrapper below when its route is configured.
 * The ordinary backend is selected at runtime by LLM_BACKEND:
 *
 *   LLM_BACKEND=claude-cli   (default; uses local Claude Code CLI, Max billing)
 *   LLM_BACKEND=anthropic    (Anthropic Messages API)
 *   LLM_BACKEND=openai       (OpenAI Chat Completions)
 *   LLM_BACKEND=deepseek     (DeepSeek, OpenAI-compatible)
 *   LLM_BACKEND=minimax      (MiniMax, OpenAI-compatible)
 *
 * Per-backend config (API keys, models, base URLs) lives in .env.local.
 * See .env.example for the full list.
 */

import { CLAUDE_MODEL, runClaudeCli } from "./backends/claude-cli";
import { anthropicModel, runAnthropic } from "./backends/anthropic";
import {
  PRESETS,
  openaiCompatModel,
  runOpenAICompat,
} from "./backends/openai-compat";

export interface LlmRunOptions {
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
}

export interface LlmRunResult {
  text: string;
  durationMs: number;
}

export type LlmBackendId =
  | "claude-cli"
  | "anthropic"
  | "openai"
  | "deepseek"
  | "minimax";

export type LlmReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

/** Optional per-call route override used by the dedicated translation slot. */
export interface LlmRouteOverrides {
  backend?: LlmBackendId;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  reasoningEffort?: LlmReasoningEffort | null;
}

/**
 * The translation slot is intentionally independent from the report model.
 * This is the same OpenAI-compatible GLM route used by the Hermes podcast
 * setup, while keeping the main DailyBrief backend configurable as before.
 */
export const TRANSLATION_DEFAULT_BASE_URL = "https://new.xkool.cfd/v1";
export const TRANSLATION_DEFAULT_MODEL = "glm-5.2";

const VALID_BACKENDS: ReadonlySet<LlmBackendId> = new Set([
  "claude-cli",
  "anthropic",
  "openai",
  "deepseek",
  "minimax",
]);

export function getBackend(): LlmBackendId {
  const raw = (process.env.LLM_BACKEND?.trim() || "claude-cli").toLowerCase();
  if (!VALID_BACKENDS.has(raw as LlmBackendId)) {
    throw new Error(
      `Unknown LLM_BACKEND='${raw}'. Valid values: ${[...VALID_BACKENDS].join(", ")}`,
    );
  }
  return raw as LlmBackendId;
}

/**
 * Returns the active model name for the configured backend, useful for
 * stamping a MODEL_TAG into report metadata.
 */
function getActiveModel(): string {
  const backend = getBackend();
  switch (backend) {
    case "claude-cli":
      return CLAUDE_MODEL;
    case "anthropic":
      return anthropicModel();
    case "openai":
    case "deepseek":
    case "minimax":
      return openaiCompatModel(PRESETS[backend]);
  }
}

/** A short tag suitable for embedding in report JSON: "<backend>-<model>" */
export function getModelTag(): string {
  return `${getBackend()}-${getActiveModel()}`;
}

export async function runLlm(
  opts: LlmRunOptions,
  route: LlmRouteOverrides = {},
): Promise<LlmRunResult> {
  const backend = route.backend ?? getBackend();
  switch (backend) {
    case "claude-cli":
      return runClaudeCli(opts);
    case "anthropic":
      return runAnthropic(opts);
    case "openai":
    case "deepseek":
    case "minimax":
      return runOpenAICompat(opts, PRESETS[backend], route);
  }
}

/**
 * Resolve the optional dedicated translation route.
 *
 * TRANSLATION_API_KEY is the documented name. XKOOL_API_KEY is accepted as a
 * local compatibility alias because that is the name already used by the
 * Hermes profile and the DailyBrief Actions secret. We deliberately do not
 * fall back to generic LLM_API_KEY: the main report route may point at Qwen or
 * another provider, and using that credential against xkool is a subtle way
 * to turn every report into the unhelpful source-backed fallback.
 */
export function getTranslationRoute(): LlmRouteOverrides | null {
  const apiKey =
    process.env.TRANSLATION_API_KEY?.trim() ||
    process.env.XKOOL_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    backend: "openai",
    apiKey,
    baseUrl:
      process.env.TRANSLATION_BASE_URL?.trim() ||
      TRANSLATION_DEFAULT_BASE_URL,
    model:
      process.env.TRANSLATION_MODEL?.trim() || TRANSLATION_DEFAULT_MODEL,
    // GLM's xkool route otherwise spends the output budget on hidden
    // reasoning. Translation is a bounded structured task, so use the
    // provider-supported no-thinking request shape.
    reasoningEffort: "none",
  };
}

/**
 * Run enrichment/translation calls on the dedicated route when configured.
 * Existing local users without a translation credential retain the original
 * shared-backend behavior.
 */
export function runTranslationLlm(
  opts: LlmRunOptions,
): Promise<LlmRunResult> {
  return runLlm(opts, getTranslationRoute() ?? {});
}
