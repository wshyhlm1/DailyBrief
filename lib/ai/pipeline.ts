import { jsonrepair } from "jsonrepair";
import { runLlm } from "./llm";
import { extractJson } from "./json-util";
import { SYSTEM_PROMPT_DIGEST_EN, SYSTEM_PROMPT_DIGEST_ZH } from "./prompts";
import type { StockHighlight } from "./stock-highlights";
import { REPORT_LOCALE } from "../sources/registry";
import type { Category, RawArticle } from "../sources/types";
import { todayKey } from "../utils";
import type { WeatherSnapshot } from "../weather/shanghai";
import type { EarningsCalendarSnapshot } from "../earnings/types";

const SYSTEM_PROMPT_DIGEST =
  REPORT_LOCALE === "en" ? SYSTEM_PROMPT_DIGEST_EN : SYSTEM_PROMPT_DIGEST_ZH;

export interface BriefItem {
  title: string;
  url: string;
  source: string;
  summary: string;
  importance: number;
}

export interface DailyReport {
  hero_headline: string;
  daily_overview: string;
  tech_briefs: BriefItem[];
  finance_briefs: BriefItem[];
  politics_briefs: BriefItem[];
  editor_note: string;
  keywords: string[];
  /** Optional top-of-report table extracted from X stock-pick sources. */
  stock_highlights?: StockHighlight[];
  /** Optional trading-signals section, present when scripts/daily.ts ran successfully. */
  trading?: TradingSection;
  /** Optional city weather snapshot rendered next to the report date. */
  weather?: WeatherSnapshot;
  /** Optional top-of-report upcoming earnings calendar for watched tech names. */
  earnings_calendar?: EarningsCalendarSnapshot;
}

import type { TickerAnalysis } from "../trading/signals";
import type { CryptoGlobalStats } from "../trading/coingecko";
import type { FearGreedSnapshot } from "../trading/fear-greed";
import type { TradingCommentary } from "./trading-commentary";

export interface TradingSection extends TradingCommentary {
  generated_at: string;
  tickers: TickerAnalysis[];
  crypto_fear_greed?: FearGreedSnapshot;
  crypto_global?: CryptoGlobalStats;
}

export interface ArticleInput extends RawArticle {
  source: string;
}

const PER_CATEGORY_LIMIT: Record<Category, number> = {
  tech: 25,
  finance: 20,
  politics: 15,
};

const MAX_AGE_DAYS = 14;
const FINANCE_BRIEFS_MAX = 5;
const SERENITY_SOURCE_ID = "x-serenity";
const SERENITY_SYMBOL_RE = /\$[A-Za-z]{1,5}(?:\.[A-Za-z]{1,2})?/g;

type SerenityMergedBrief = {
  symbols: string[];
  latestUrl: string;
  sourceName: string;
  postCount: number;
};

function normalizeTicker(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[),.;!?]+$/g, "");
  if (!/^\$[A-Z]{1,5}(?:\.[A-Z]{1,2})?$/.test(cleaned)) return null;
  return cleaned;
}

function collectSerenityMergedBrief(
  articles: ArticleInput[],
  reportDayKey: string,
): SerenityMergedBrief | null {
  const serenityDaily = articles
    .filter((a) => a.sourceId === SERENITY_SOURCE_ID)
    .filter((a) => !a.publishedAt || todayKey(a.publishedAt) === reportDayKey);
  if (serenityDaily.length === 0) return null;

  const seen = new Set<string>();
  const symbols: string[] = [];
  for (const a of serenityDaily) {
    const text = `${a.title}\n${a.excerpt ?? ""}`;
    for (const m of text.match(SERENITY_SYMBOL_RE) ?? []) {
      const sym = normalizeTicker(m);
      if (!sym || seen.has(sym)) continue;
      seen.add(sym);
      symbols.push(sym);
    }
  }
  if (symbols.length === 0) return null;

  const latest = [...serenityDaily].sort(
    (a, b) =>
      (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
  )[0];
  return {
    symbols,
    latestUrl: latest?.url ?? serenityDaily[0].url,
    sourceName: latest?.source ?? "X Serenity (@aleabitoreddit)",
    postCount: serenityDaily.length,
  };
}

function injectSerenityStockBrief(
  report: DailyReport,
  articles: ArticleInput[],
  reportDayKey: string,
): void {
  const merged = collectSerenityMergedBrief(articles, reportDayKey);
  if (!merged) return;

  const brief: BriefItem = {
    title:
      REPORT_LOCALE === "en"
        ? "Serenity Daily Stock Picks (Merged)"
        : "Serenity 当日荐股标的汇总",
    url: merged.latestUrl,
    source: merged.sourceName,
    summary:
      REPORT_LOCALE === "en"
        ? `Merged from ${merged.postCount} Serenity post(s) today. Mentioned stock tickers: ${merged.symbols.join(", ")}. All picks are deduplicated for quick pre-market tracking.`
        : `已合并 Serenity 当日 ${merged.postCount} 条推文中的荐股信息，去重后标的为：${merged.symbols.join("、")}。供盘前快速跟踪。`,
    importance: 10,
  };

  const kept = report.finance_briefs.filter(
    (b) =>
      !/serenity/i.test(b.source) &&
      !/aleabitoreddit/i.test(b.url) &&
      !/Serenity/.test(b.title),
  );
  report.finance_briefs = [brief, ...kept].slice(0, FINANCE_BRIEFS_MAX);
}

/**
 * Pick `limit` items from `items` so every source gets a fair shot.
 *
 * Why this exists: the previous `slice(0, limit)` honored insertion order,
 * which is the source-iteration order in daily.ts. That gave whichever
 * source came first 100% of the quota — e.g. all 25 tech slots filled by
 * Hacker News before GitHub Trending / Solidot / V2EX / 阮一峰 got a turn.
 *
 * Strategy: drop items older than MAX_AGE_DAYS, group by sourceId,
 * sort each bucket newest-first, then round-robin one item per source
 * until we hit the limit. Sources with fewer items naturally drop out
 * and others absorb the slack.
 */
function selectRoundRobin(
  items: ArticleInput[],
  limit: number,
): ArticleInput[] {
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const fresh = items.filter(
    (it) => !it.publishedAt || it.publishedAt.getTime() >= cutoff,
  );

  const bySource = new Map<string, ArticleInput[]>();
  for (const it of fresh) {
    const arr = bySource.get(it.sourceId) ?? [];
    arr.push(it);
    bySource.set(it.sourceId, arr);
  }
  for (const arr of bySource.values()) {
    arr.sort(
      (a, b) =>
        (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    );
  }

  const buckets = Array.from(bySource.values());
  const out: ArticleInput[] = [];
  let madeProgress = true;
  while (out.length < limit && madeProgress) {
    madeProgress = false;
    for (const b of buckets) {
      if (b.length === 0) continue;
      out.push(b.shift()!);
      madeProgress = true;
      if (out.length >= limit) break;
    }
  }
  return out;
}

function sourceBackedBrief(item: ArticleInput, index: number): BriefItem {
  // Enrichment runs before the report generator. When the primary digest
  // model is unavailable, preserve the independently generated translation
  // instead of dropping back to the original English excerpt.
  const enrichedSummary =
    item.summary ?? (item as ArticleInput & { cnSummary?: string }).cnSummary;
  const excerpt = (enrichedSummary ?? item.displayExcerpt ?? item.excerpt ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
  return {
    title: item.displayTitle ?? item.title,
    url: item.url,
    source: item.source,
    summary: excerpt || (
      REPORT_LOCALE === "en"
        ? `Source: ${item.source}. Open the original link for the full report.`
        : `原始来源：${item.source}。请通过原文链接查看完整内容。`
    ),
    importance: Math.max(6, 10 - index),
  };
}

function sourceBackedText(item: ArticleInput): string {
  return (
    item.summary ??
    (item as ArticleInput & { cnSummary?: string }).cnSummary ??
    item.displayExcerpt ??
    item.excerpt ??
    ""
  )
    .replace(/\s+/g, " ")
    .trim();
}

function hasLocalizedSourceBackedText(item: ArticleInput): boolean {
  const text = sourceBackedText(item);
  if (REPORT_LOCALE === "en") {
    return /[A-Za-z]/.test(text) && !/[\u3400-\u9fff]/.test(text);
  }
  return /[\u3400-\u9fff]/.test(text);
}

/**
 * Degraded reports should keep their source-balanced selection, but prefer
 * articles whose source-backed text is already in the report language. This
 * matters when the normal digest is unavailable: the enrichment batches are
 * deliberately smaller than the 60-item digest candidate pool.
 */
function selectLocalizedRoundRobin(
  items: ArticleInput[],
  limit: number,
): ArticleInput[] {
  const localized = selectRoundRobin(
    items.filter(hasLocalizedSourceBackedText),
    limit,
  );
  if (localized.length >= limit) return localized;

  const localizedUrls = new Set(localized.map((item) => item.url));
  const remaining = selectRoundRobin(
    items.filter((item) => !localizedUrls.has(item.url)),
    limit - localized.length,
  );
  return [...localized, ...remaining];
}

/**
 * Publish an honest source-backed report when the primary Qwen service is
 * unavailable. Titles, URLs and text remain bound to fetched articles or to
 * the independently validated enrichment pass; no synthetic conclusions are
 * introduced.
 */
export function buildSourceBackedFallbackReport(
  articles: ArticleInput[],
): DailyReport {
  const grouped: Record<Category, ArticleInput[]> = {
    tech: [],
    finance: [],
    politics: [],
  };
  for (const article of articles) grouped[article.category].push(article);
  const tech = selectLocalizedRoundRobin(grouped.tech, 5).slice(0, 5);
  const finance = selectLocalizedRoundRobin(grouped.finance, 5).slice(0, 5);
  const politics = selectLocalizedRoundRobin(grouped.politics, 3).slice(0, 3);
  const leadTitles = [tech[0], finance[0], politics[0]]
    .filter((item): item is ArticleInput => Boolean(item))
    .map((item) => item.displayTitle ?? item.title);
  const sources = [...new Set([...tech, ...finance, ...politics].map((item) => item.source))];
  const hero = leadTitles.join("；").slice(0, REPORT_LOCALE === "en" ? 140 : 80);

  return {
    hero_headline: hero || (
      REPORT_LOCALE === "en" ? "Today's verified source digest" : "今日已核验来源速览"
    ),
    daily_overview: REPORT_LOCALE === "en"
      ? `The primary Qwen service was temporarily unavailable. This continuity edition was assembled deterministically from ${articles.length} fetched source items, including ${tech.length} technology, ${finance.length} finance, and ${politics.length} world-affairs selections. Every headline, excerpt, source and URL below comes directly from the fetched source record.`
      : `主 Qwen 服务暂时不可用。本期连续性交付版由系统直接从已抓取的 ${articles.length} 条来源记录中确定性生成，包含 ${tech.length} 条科技、${finance.length} 条财经和 ${politics.length} 条时政精选。下方标题、摘录、来源与链接均来自原始抓取记录，不生成未经来源支持的结论。`,
    tech_briefs: tech.map(sourceBackedBrief),
    finance_briefs: finance.map(sourceBackedBrief),
    politics_briefs: politics.map(sourceBackedBrief),
    editor_note: REPORT_LOCALE === "en"
      ? "Continuity mode: Qwen remains the primary model and will be retried on the next run; this edition intentionally contains only source-bound material."
      : "连续性模式：Qwen 仍是主模型，下次运行会继续重试；本期刻意只保留可追溯到原始来源的内容。",
    keywords: sources.slice(0, 8),
  };
}

async function callOnce(userPayloadJson: string): Promise<DailyReport> {
  // Claude Code CLI's built-in system prompt biases the model toward
  // conversational markdown output. Anchor the format expectation in the
  // user message (instruction recency wins) *and* explicitly demand every
  // schema field be populated — without this Sonnet has been observed to
  // emit a JSON shell with empty arrays to "satisfy" a JSON-only ask.
  const userPrompt =
    REPORT_LOCALE === "en"
      ? [
          "**Output language: ENGLISH ONLY.** Every string value in the JSON — hero_headline, daily_overview, every brief's title/summary, editor_note, keywords — must be written entirely in English. No Chinese characters anywhere.",
          "",
          "Your task: generate today's daily brief from the candidate news below. **The response MUST be a single valid JSON object** — starts with `{`, ends with `}`, no markdown, no code fences, no explanations.",
          "",
          "The JSON must contain every field non-empty (briefs arrays per the system-prompt counts):",
          "  - hero_headline: 10-25 word headline of the day",
          "  - daily_overview: **150-250 word** paragraph covering tech / finance / politics signals so a reader sees the whole picture at a glance",
          "  - tech_briefs: **3-5** tech BriefItems",
          "  - finance_briefs: **3-5** finance BriefItems",
          "  - politics_briefs: **2-3** politics BriefItems",
          "  - editor_note: 30-60 word editor's note",
          "  - keywords: 5-8 keywords",
          "",
          "BriefItem fields: title, url (copied verbatim from candidate), source, summary, importance (1-10).",
          "**Quote rule (important!)**: For any quotation INSIDE a JSON string, use single quotes ' or curly quotes '\" — **never** raw double quotes \", which break JSON parsing.",
          "No trailing commas.",
          "",
          `Candidate news (JSON array, ${userPayloadJson.length} chars):`,
          userPayloadJson,
        ].join("\n")
      : [
          "你的任务：根据下方候选新闻，生成一份当日简报，**响应必须是一个合法 JSON 对象**——以 `{` 开头，以 `}` 结尾，不要 markdown / 不要代码围栏 / 不要任何解释。",
          "",
          "JSON 必须包含全部字段且不能为空（briefs 数组按 system prompt 规定的条数填充）：",
          "  - hero_headline: 10-25 字的当日一句话头条",
          "  - daily_overview: **150-220 字** 的当日总览段落，一段话覆盖技术 / 财经 / 时政 的核心信号，让读者一眼抓住全貌",
          "  - tech_briefs: **3-5 条** 科技 BriefItem",
          "  - finance_briefs: **3-5 条** 财经 BriefItem",
          "  - politics_briefs: **2-3 条** 时政 BriefItem",
          "  - editor_note: 30-60 字的编辑短评",
          "  - keywords: 5-8 个关键词",
          "",
          "BriefItem 字段：title、url（必须从候选条目原样选取）、source、summary、importance(1-10)。",
          "**引号规则（重要！）**：JSON 字符串内的中文引用请使用**中文全角引号**「」或者 “”，**绝对不要**用英文双引号 \" —— 那会导致 JSON 解析失败。例：写 商务部回应「内卷」 而不是 商务部回应\"内卷\"。",
          "不要使用单引号、不要末尾多余逗号。",
          "",
          "候选新闻（JSON 数组，共 " + userPayloadJson.length + " 字符）：",
          userPayloadJson,
        ].join("\n");
  const { text } = await runLlm({
    systemPrompt: SYSTEM_PROMPT_DIGEST,
    userPrompt,
  });
  const cleaned = extractJson(text);
  let parsed: Partial<DailyReport>;
  try {
    parsed = JSON.parse(cleaned) as Partial<DailyReport>;
  } catch (strictErr) {
    // LLMs routinely emit JSON with unescaped quotes inside Chinese
    // strings (e.g. 商务部回应"内卷"). jsonrepair fixes most of these
    // mechanically before we ever surface a failure.
    try {
      const repaired = jsonrepair(cleaned);
      parsed = JSON.parse(repaired) as Partial<DailyReport>;
      console.warn("[pipeline] JSON.parse failed but jsonrepair recovered");
    } catch {
      try {
        const fs = await import("node:fs");
        fs.mkdirSync("logs", { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        fs.writeFileSync(`logs/claude-raw-${ts}.txt`, text, "utf8");
        fs.writeFileSync(`logs/claude-cleaned-${ts}.txt`, cleaned, "utf8");
        console.warn(
          `[pipeline] both JSON.parse and jsonrepair failed; raw at logs/claude-raw-${ts}.txt`,
        );
      } catch {
        // best-effort logging
      }
      throw strictErr;
    }
  }
  return {
    hero_headline: parsed.hero_headline ?? "",
    daily_overview: parsed.daily_overview ?? "",
    tech_briefs: parsed.tech_briefs ?? [],
    finance_briefs: parsed.finance_briefs ?? [],
    politics_briefs: parsed.politics_briefs ?? [],
    editor_note: parsed.editor_note ?? "",
    keywords: parsed.keywords ?? [],
  };
}

export async function generateReportWithFallback(
  userPayloadJson: string,
  sourceArticles: ArticleInput[],
  generate: (payload: string) => Promise<DailyReport> = callOnce,
): Promise<DailyReport> {
  try {
    return await generate(userPayloadJson);
  } catch (firstErr) {
    console.warn(
      `[pipeline] first Qwen digest call failed, retrying: ${
        firstErr instanceof Error ? firstErr.message : String(firstErr)
      }`,
    );
    try {
      return await generate(userPayloadJson);
    } catch (secondErr) {
      console.error(
        `[pipeline] Qwen remained unavailable after bounded retries; publishing source-backed continuity report: ${
          secondErr instanceof Error ? secondErr.message : String(secondErr)
        }`,
      );
      return buildSourceBackedFallbackReport(sourceArticles);
    }
  }
}

export async function generateDailyReport(
  articles: ArticleInput[],
  reportDayKey: string = todayKey(),
): Promise<{ report: DailyReport; tokensUsed: number }> {
  const grouped: Record<Category, ArticleInput[]> = {
    tech: [],
    finance: [],
    politics: [],
  };
  for (const a of articles) grouped[a.category].push(a);

  const compact = (Object.keys(grouped) as Category[]).flatMap((c) =>
    selectRoundRobin(grouped[c], PER_CATEGORY_LIMIT[c]),
  );

  const userPayload = compact.map((a, i) => ({
    n: i + 1,
    title: a.displayTitle ?? a.title,
    url: a.url,
    source: a.source,
    category: a.category,
    excerpt: (a.displayExcerpt ?? a.excerpt ?? "").slice(0, 200),
    published: a.publishedAt?.toISOString() ?? "",
  }));
  const userPayloadJson = JSON.stringify(userPayload);

  const report = await generateReportWithFallback(userPayloadJson, compact);

  // Hard requirement: if Serenity posted stock picks today, always surface
  // a merged, deduped ticker brief in finance summaries.
  injectSerenityStockBrief(report, articles, reportDayKey);

  // Max subscription has no per-call token meter — we expose 0 for schema
  // compatibility; consumers should treat 0 as "metric not available".
  return { report, tokensUsed: 0 };
}
