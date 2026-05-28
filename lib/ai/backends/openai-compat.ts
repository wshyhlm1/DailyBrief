import OpenAI from "openai";
import { classifyError, logLlmCall } from "../log";
import type { LlmRunOptions, LlmRunResult } from "../llm";

/**
 * OpenAI-compatible backend. Reused for any provider that exposes the
 * standard `/chat/completions` endpoint: OpenAI itself, DeepSeek, MiniMax,
 * Groq, Together, OpenRouter, local LM Studio / Ollama, etc.
 */
export interface OpenAICompatConfig {
  /** Stable backend id, used in logs and error messages */
  backend: "openai" | "deepseek" | "minimax";
  defaultBaseUrl: string;
  defaultModel: string;
  apiKeyEnv: string;
  baseUrlEnv: string;
}

export const PRESETS: Record<OpenAICompatConfig["backend"], OpenAICompatConfig> = {
  openai: {
    backend: "openai",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    apiKeyEnv: "OPENAI_API_KEY",
    baseUrlEnv: "OPENAI_BASE_URL",
  },
  deepseek: {
    backend: "deepseek",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    // deepseek-chat alias retires 2026-07-24 — point new users at the
    // current production model instead.
    defaultModel: "deepseek-v4-flash",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
  },
  minimax: {
    backend: "minimax",
    defaultBaseUrl: "https://api.minimax.io/v1",
    defaultModel: "MiniMax-M2.7",
    apiKeyEnv: "MINIMAX_API_KEY",
    baseUrlEnv: "MINIMAX_BASE_URL",
  },
};

const clientCache = new Map<string, OpenAI>();
const VALID_REASONING_EFFORTS = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const);
type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

function getClient(
  cfg: OpenAICompatConfig,
): { client: OpenAI; model: string; baseURL: string } {
  // Provider-specific env wins; LLM_API_KEY / LLM_BASE_URL are generic
  // aliases so users pointing at a non-preset OpenAI-compatible service
  // (Moonshot, SiliconFlow, OpenRouter, self-hosted vLLM, ...) don't have
  // to misuse the OPENAI_* variable names just to reach a custom endpoint.
  const apiKey = process.env[cfg.apiKeyEnv] || process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error(
      `${cfg.apiKeyEnv} (or generic LLM_API_KEY) is required for LLM_BACKEND=${cfg.backend}. Set it in .env.local.`,
    );
  }
  const baseURL = process.env[cfg.baseUrlEnv]?.trim()
    || process.env.LLM_BASE_URL?.trim()
    || cfg.defaultBaseUrl;
  const model = process.env.LLM_MODEL?.trim() || cfg.defaultModel;

  const cacheKey = `${baseURL}::${apiKey.slice(-6)}`;
  let client = clientCache.get(cacheKey);
  if (!client) {
    client = new OpenAI({ apiKey, baseURL });
    clientCache.set(cacheKey, client);
  }
  return { client, model, baseURL };
}

function resolveReasoningEffort(): ReasoningEffort | null {
  const raw = process.env.LLM_REASONING_EFFORT?.trim().toLowerCase();
  if (!raw) return null;
  if (VALID_REASONING_EFFORTS.has(raw as ReasoningEffort)) {
    return raw as ReasoningEffort;
  }
  console.warn(
    `[llm] invalid LLM_REASONING_EFFORT='${raw}', expected one of: none|minimal|low|medium|high|xhigh`,
  );
  return null;
}

function isQwenEndpoint(model: string, baseURL: string): boolean {
  const m = model.toLowerCase();
  const b = baseURL.toLowerCase();
  return m.includes("qwen") || b.includes("dashscope") || b.includes("aliyuncs");
}

function qwenThinkingBudget(effort: ReasoningEffort): number | null {
  // For high/xhigh we let the provider default decide the max thinking depth.
  if (effort === "none") return 0;
  if (effort === "minimal") return 256;
  if (effort === "low") return 800;
  if (effort === "medium") return 2000;
  return null;
}

export function openaiCompatModel(cfg: OpenAICompatConfig): string {
  return process.env.LLM_MODEL?.trim() || cfg.defaultModel;
}

export async function runOpenAICompat(
  opts: LlmRunOptions,
  cfg: OpenAICompatConfig,
): Promise<LlmRunResult> {
  const { client, model, baseURL } = getClient(cfg);
  const started = Date.now();
  const inputChars = opts.systemPrompt.length + opts.userPrompt.length;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const reasoningEffort = resolveReasoningEffort();
  const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
    // Explicit max_tokens — most providers default low (DeepSeek 4096,
    // some MiniMax variants 2048). A 16-item batch enrichment routinely
    // exceeds 4K output tokens once you count Chinese chars + JSON
    // structure, and silent truncation made it through with just 1/16
    // entries parseable. 8192 covers all observed daily batches with
    // generous headroom. Match the explicit value Anthropic SDK uses.
    max_tokens: 8192,
    // Don't force JSON mode — not all OpenAI-compat providers support
    // response_format=json_object, and our prompts + jsonrepair already
    // handle the slop.
  };

  if (reasoningEffort) {
    request.reasoning_effort = reasoningEffort;
  }

  // Qwen's OpenAI-compatible APIs ignore `reasoning_effort`; use their native
  // thinking controls so `LLM_REASONING_EFFORT=high` actually increases depth.
  if (isQwenEndpoint(model, baseURL) && reasoningEffort) {
    if (reasoningEffort === "none") {
      (request as any).enable_thinking = false;
    } else {
      (request as any).enable_thinking = true;
      const budget = qwenThinkingBudget(reasoningEffort);
      if (budget && budget > 0) {
        (request as any).thinking_budget = budget;
      }
    }
  }

  try {
    const resp = await client.chat.completions.create(request, {
      timeout: timeoutMs,
    });
    const text = (resp.choices[0]?.message?.content ?? "").trim();
    const durationMs = Date.now() - started;
    logLlmCall({
      ts: new Date(started).toISOString(),
      backend: cfg.backend,
      model,
      durationMs,
      success: true,
      inputChars,
      outputChars: text.length,
      errorCategory: null,
      errorSnippet: null,
    });
    return { text, durationMs };
  } catch (err) {
    const durationMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    logLlmCall({
      ts: new Date(started).toISOString(),
      backend: cfg.backend,
      model,
      durationMs,
      success: false,
      inputChars,
      outputChars: 0,
      errorCategory: classifyError(msg),
      errorSnippet: msg.slice(0, 200),
    });
    throw err;
  }
}
