import OpenAI from "openai";
import { classifyError, logLlmCall } from "../log";
import type {
  LlmRouteOverrides,
  LlmRunOptions,
  LlmRunResult,
} from "../llm";

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

export interface TransientRetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  sleep?: (delayMs: number) => Promise<void>;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

function positiveIntEnv(name: string, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function errorDetails(error: unknown, depth = 0): string {
  if (depth > 3 || error == null) return "";
  if (typeof error === "string") return error;
  if (!(error instanceof Error) && typeof error !== "object") {
    return String(error);
  }
  const record = error as Record<string, unknown>;
  const own = [
    error instanceof Error ? error.name : "",
    error instanceof Error ? error.message : "",
    typeof record.code === "string" ? record.code : "",
  ].filter(Boolean);
  if (record.cause) own.push(errorDetails(record.cause, depth + 1));
  if (Array.isArray(record.errors)) {
    own.push(...record.errors.map((item) => errorDetails(item, depth + 1)));
  }
  return own.join(" ");
}

export function isTransientOpenAICompatError(error: unknown): boolean {
  const record = (error && typeof error === "object")
    ? error as Record<string, unknown>
    : {};
  const status = Number(record.status ?? 0);
  if ([408, 409, 425, 429].includes(status) || status >= 500) return true;
  if (status >= 400) return false;
  return /(?:connection error|fetch failed|timed?\s*out|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|socket hang up|temporarily unavailable)/i.test(
    errorDetails(error),
  );
}

export function transientRetryDelayMs(
  failedAttempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  return Math.min(
    maxDelayMs,
    Math.max(0, baseDelayMs) * 2 ** Math.max(0, failedAttempt - 1),
  );
}

export async function withTransientRetries<T>(
  operation: (attempt: number) => Promise<T>,
  options: TransientRetryOptions,
): Promise<T> {
  const sleep = options.sleep
    ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const maxAttempts = Math.max(1, options.maxAttempts);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientOpenAICompatError(error)) throw error;
      const delayMs = transientRetryDelayMs(
        attempt,
        options.baseDelayMs,
        options.maxDelayMs,
      );
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
  throw new Error("unreachable retry state");
}

function getClient(
  cfg: OpenAICompatConfig,
  overrides: LlmRouteOverrides = {},
): { client: OpenAI; model: string; baseURL: string } {
  // Provider-specific env wins; LLM_API_KEY / LLM_BASE_URL are generic
  // aliases so users pointing at a non-preset OpenAI-compatible service
  // (Moonshot, SiliconFlow, OpenRouter, self-hosted vLLM, ...) don't have
  // to misuse the OPENAI_* variable names just to reach a custom endpoint.
  const apiKey =
    overrides.apiKey?.trim() ||
    process.env[cfg.apiKeyEnv] ||
    process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error(
      `${cfg.apiKeyEnv} (or generic LLM_API_KEY) is required for LLM_BACKEND=${cfg.backend}. Set it in .env.local.`,
    );
  }
  const baseURL =
    overrides.baseUrl?.trim() ||
    process.env[cfg.baseUrlEnv]?.trim() ||
    process.env.LLM_BASE_URL?.trim() ||
    cfg.defaultBaseUrl;
  const model =
    overrides.model?.trim() || process.env.LLM_MODEL?.trim() || cfg.defaultModel;

  const cacheKey = `${baseURL}::${apiKey.slice(-6)}`;
  let client = clientCache.get(cacheKey);
  if (!client) {
    // Some compatible relays reject the SDK's default `OpenAI/JS` user agent
    // at their edge. Identify the application explicitly instead of relying
    // on the SDK default, which also makes relay-side diagnostics clearer.
    client = new OpenAI({
      apiKey,
      baseURL,
      defaultHeaders: {
        "User-Agent": baseURL.includes("new.xkool.cfd")
          ? "DailyBrief/xkool"
          : "DailyBrief/0.1",
      },
    });
    clientCache.set(cacheKey, client);
  }
  return { client, model, baseURL };
}

function resolveReasoningEffort(
  overrides: LlmRouteOverrides = {},
): ReasoningEffort | null {
  if (Object.prototype.hasOwnProperty.call(overrides, "reasoningEffort")) {
    return overrides.reasoningEffort as ReasoningEffort | null;
  }
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
  overrides: LlmRouteOverrides = {},
): Promise<LlmRunResult> {
  const { client, model, baseURL } = getClient(cfg, overrides);
  const started = Date.now();
  const inputChars = opts.systemPrompt.length + opts.userPrompt.length;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const reasoningEffort = resolveReasoningEffort(overrides);
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

  const qwen = isQwenEndpoint(model, baseURL);
  const maxAttempts = positiveIntEnv("LLM_MAX_ATTEMPTS", qwen ? 4 : 3, 8);
  const baseDelayMs = positiveIntEnv("LLM_RETRY_BASE_MS", 2_000, 60_000);
  const maxDelayMs = positiveIntEnv("LLM_RETRY_MAX_MS", 20_000, 120_000);
  const text = await withTransientRetries(
    async (attempt) => {
      const attemptStarted = Date.now();
      try {
        const resp = await client.chat.completions.create(request, {
          timeout: timeoutMs,
        });
        const value = (resp.choices[0]?.message?.content ?? "").trim();
        logLlmCall({
          ts: new Date(attemptStarted).toISOString(),
          backend: cfg.backend,
          model,
          durationMs: Date.now() - attemptStarted,
          success: true,
          inputChars,
          outputChars: value.length,
          errorCategory: null,
          errorSnippet: null,
        });
        return value;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logLlmCall({
          ts: new Date(attemptStarted).toISOString(),
          backend: cfg.backend,
          model,
          durationMs: Date.now() - attemptStarted,
          success: false,
          inputChars,
          outputChars: 0,
          errorCategory: classifyError(msg),
          errorSnippet: `attempt ${attempt}/${maxAttempts}: ${msg}`.slice(0, 200),
        });
        throw err;
      }
    },
    {
      maxAttempts,
      baseDelayMs,
      maxDelayMs,
      onRetry: (error, attempt, delayMs) => {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(
          `[llm] transient ${cfg.backend}-${model} failure on attempt ${attempt}/${maxAttempts}; retrying in ${delayMs}ms: ${msg}`,
        );
      },
    },
  );
  return { text, durationMs: Date.now() - started };
}
