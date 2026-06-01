import "./_env";

import fs from "node:fs";
import path from "node:path";

import { sources, REPORT_LOCALE } from "../lib/sources/registry";
import { fetchSource } from "../lib/sources/dispatch";
import type { SourceDef } from "../lib/sources/types";
import {
  generateDailyReport,
  type ArticleInput,
} from "../lib/ai/pipeline";
import { getModelTag } from "../lib/ai/llm";
import {
  enrichFinanceNewsSummaries,
  enrichGithubTrendingSummaries,
  enrichXStockPickSummaries,
  enrichXViralSummaries,
} from "../lib/ai/enrich";
import { generateStockHighlights } from "../lib/ai/stock-highlights";
import {
  groupRaw,
  isSportsArticle,
  MERGED_SUBGROUP_LIMITS,
  renderHtml,
  renderMarkdown,
} from "../lib/output/render";
import { analyzeWatchlist } from "../lib/trading/runner";
import { fetchCryptoFearGreed } from "../lib/trading/fear-greed";
import { fetchCryptoGlobal } from "../lib/trading/coingecko";
import { generateTradingCommentary } from "../lib/ai/trading-commentary";
import type { TradingSection } from "../lib/ai/pipeline";
import { todayKey } from "../lib/utils";

const OUTPUT_DIR = "daily_reports";
const SOURCE_HEALTH_PATH = path.join("logs", "source-health.json");
const SOURCE_FAILURE_LOG_PATH = path.join("logs", "source-failures.jsonl");
const X_STOCK_POST_LIMIT = 20;

const SOURCE_FETCH_RETRIES = parsePositiveIntEnv("SOURCE_FETCH_RETRIES", 3);
const SOURCE_SKIP_AFTER_FAILURES = parsePositiveIntEnv(
  "SOURCE_SKIP_AFTER_FAILURES",
  3,
);
const SOURCE_SKIP_HOURS = parsePositiveIntEnv("SOURCE_SKIP_HOURS", 24);

type SourceHealthRecord = {
  consecutiveFailures: number;
  lastFailureAt?: string;
  lastError?: string;
  skipUntil?: string;
};

type SourceHealthMap = Record<string, SourceHealthRecord>;

type SourceFailureEvent = {
  at: string;
  sourceId: string;
  sourceName: string;
  url: string;
  event: "retry" | "failed" | "skipped";
  error: string;
  attempt?: number;
  maxAttempts?: number;
  consecutiveFailures?: number;
  skipUntil?: string;
};

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function safeIso(ts: number): string {
  return new Date(ts).toISOString();
}

function loadSourceHealth(): SourceHealthMap {
  if (!fs.existsSync(SOURCE_HEALTH_PATH)) return {};
  try {
    const raw = fs.readFileSync(SOURCE_HEALTH_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as SourceHealthMap;
    }
  } catch (e) {
    console.warn(
      `[daily] source health cache unreadable, resetting: ${errorMessage(e)}`,
    );
  }
  return {};
}

function saveSourceHealth(health: SourceHealthMap): void {
  fs.mkdirSync(path.dirname(SOURCE_HEALTH_PATH), { recursive: true });
  fs.writeFileSync(SOURCE_HEALTH_PATH, JSON.stringify(health, null, 2), "utf8");
}

function appendSourceFailureEvent(event: SourceFailureEvent): void {
  fs.mkdirSync(path.dirname(SOURCE_FAILURE_LOG_PATH), { recursive: true });
  fs.appendFileSync(SOURCE_FAILURE_LOG_PATH, `${JSON.stringify(event)}\n`, "utf8");
}

function shouldSkipSource(
  source: SourceDef,
  health: SourceHealthMap,
  nowMs: number,
): { skip: boolean; until?: string } {
  const rec = health[source.id];
  if (!rec?.skipUntil) return { skip: false };
  const untilMs = Date.parse(rec.skipUntil);
  if (!Number.isFinite(untilMs)) return { skip: false };
  if (untilMs <= nowMs) return { skip: false };
  return { skip: true, until: rec.skipUntil };
}

async function fetchSourceWithRetries(
  source: SourceDef,
): Promise<{ source: SourceDef; items: ArticleInput[] }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= SOURCE_FETCH_RETRIES; attempt++) {
    try {
      const items = await fetchSource(source);
      return { source, items: items.map((it) => ({ ...it, source: source.name })) };
    } catch (e) {
      lastErr = e;
      const msg = errorMessage(e);
      if (attempt < SOURCE_FETCH_RETRIES) {
        console.warn(
          `  ${source.id.padEnd(20)} retry ${attempt}/${SOURCE_FETCH_RETRIES} — ${msg}`,
        );
        appendSourceFailureEvent({
          at: safeIso(Date.now()),
          sourceId: source.id,
          sourceName: source.name,
          url: source.url,
          event: "retry",
          error: msg,
          attempt,
          maxAttempts: SOURCE_FETCH_RETRIES,
        });
      }
    }
  }
  throw new Error(errorMessage(lastErr));
}

async function fetchAll(): Promise<ArticleInput[]> {
  const articles: ArticleInput[] = [];
  const enabled = sources.filter((s) => s.enabled !== false);
  const health = loadSourceHealth();
  const nowMs = Date.now();
  const candidates: SourceDef[] = [];

  for (const source of enabled) {
    const skip = shouldSkipSource(source, health, nowMs);
    if (skip.skip) {
      const until = skip.until ?? "unknown";
      console.warn(
        `  ${source.id.padEnd(20)} SKIPPED — muted after repeated failures (until ${until})`,
      );
      appendSourceFailureEvent({
        at: safeIso(nowMs),
        sourceId: source.id,
        sourceName: source.name,
        url: source.url,
        event: "skipped",
        error: `muted-until:${until}`,
        consecutiveFailures: health[source.id]?.consecutiveFailures ?? 0,
        skipUntil: until,
      });
      continue;
    }
    candidates.push(source);
  }

  // Fetch all sources in parallel (with concurrency limit to avoid
  // overwhelming RSSHub / rate-limited APIs).
  const CONCURRENCY = 8;
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (source) => {
        return fetchSourceWithRetries(source);
      }),
    );
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      if (r.status === "fulfilled") {
        const { source, items } = r.value;
        health[source.id] = { consecutiveFailures: 0 };
        console.log(`  ${source.id.padEnd(20)} ${items.length}`);
        articles.push(...items);
      } else {
        const source = batch[idx];
        const msg = errorMessage(r.reason);
        if (!source) {
          console.error(`  ${"unknown".padEnd(20)} FAILED — ${msg}`);
          continue;
        }
        const prev = health[source.id] ?? { consecutiveFailures: 0 };
        const nextFailures = prev.consecutiveFailures + 1;
        const rec: SourceHealthRecord = {
          consecutiveFailures: nextFailures,
          lastFailureAt: safeIso(Date.now()),
          lastError: msg,
        };
        if (nextFailures >= SOURCE_SKIP_AFTER_FAILURES) {
          rec.skipUntil = safeIso(Date.now() + SOURCE_SKIP_HOURS * 3_600_000);
        }
        health[source.id] = rec;
        console.error(`  ${source.id.padEnd(20)} FAILED — ${msg}`);
        if (rec.skipUntil) {
          console.error(
            `  ${source.id.padEnd(20)} muted for ${SOURCE_SKIP_HOURS}h after ${nextFailures} consecutive failures`,
          );
        }
        appendSourceFailureEvent({
          at: safeIso(Date.now()),
          sourceId: source.id,
          sourceName: source.name,
          url: source.url,
          event: "failed",
          error: msg,
          maxAttempts: SOURCE_FETCH_RETRIES,
          consecutiveFailures: nextFailures,
          skipUntil: rec.skipUntil,
        });
      }
    }
  }
  saveSourceHealth(health);
  return articles;
}

async function enrichGhTrending(articles: ArticleInput[]): Promise<void> {
  const gh = articles.filter((a) => a.sourceId === "github-trending");
  if (gh.length === 0) return;
  console.log(
    `[daily] enriching ${gh.length} GitHub Trending repos with ${REPORT_LOCALE} summaries…`,
  );
  const t0 = Date.now();
  const summaries = await enrichGithubTrendingSummaries(gh);
  for (const a of gh) {
    const s = summaries.get(a.url);
    if (s) a.summary = s;
  }
  console.log(
    `[daily] enrichment done in ${((Date.now() - t0) / 1000).toFixed(1)}s, matched ${summaries.size}/${gh.length}`,
  );
}

/**
 * finance:news is rendered as a merged time-sorted list (see
 * MERGED_SUBGROUP_LIMITS in render.ts). Enrich exactly the items that
 * will be displayed: take all enabled finance:news articles, sort by
 * publishedAt desc, slice to the merge limit, ask Sonnet for Chinese
 * factual summaries.
 */
async function enrichFinanceNews(articles: ArticleInput[]): Promise<void> {
  await enrichMergedSubgroup(articles, "finance", "news");
}

async function enrichPolitics(articles: ArticleInput[]): Promise<void> {
  await enrichMergedSubgroup(articles, "politics", "world");
}

async function enrichAiNews(articles: ArticleInput[]): Promise<void> {
  await enrichMergedSubgroup(articles, "tech", "ai-news");
}

/**
 * X 热帖 enrichment is different from merged subgroups — we preserve the
 * AttentionVC API's heat-rank order (do NOT sort by date) and cap to the
 * displayed limit (matches SOURCE_DISPLAY_LIMITS["tech:x-viral"]).
 *
 * The Sonnet prompt also differs (XVIRAL_SYSTEM_PROMPT in enrich.ts) — X
 * tweet titles are clickbait, the previewText holds the actual claim.
 */
async function enrichXViral(articles: ArticleInput[]): Promise<void> {
  const xPosts = articles
    .filter((a) => a.sourceId === "attentionvc-ai")
    .slice(0, 20);
  if (xPosts.length === 0) return;
  console.log(`[daily] enriching ${xPosts.length} X posts with ${REPORT_LOCALE} summaries…`);
  const t0 = Date.now();
  // Author handle is encoded in the URL (https://x.com/{handle}/status/{id})
  // — extract it to help the model identify whose claim it is.
  const summaries = await enrichXViralSummaries(
    xPosts.map((a) => ({
      url: a.url,
      title: a.title,
      excerpt: a.excerpt,
      author: a.url.match(/x\.com\/([^/]+)\//)?.[1] ?? "",
    })),
  );
  for (const a of xPosts) {
    const s = summaries.get(a.url);
    if (s) a.summary = s;
  }
  console.log(
    `[daily] enrichment done in ${((Date.now() - t0) / 1000).toFixed(1)}s, matched ${summaries.size}/${xPosts.length}`,
  );
}

function xStockPickArticles(
  articles: ArticleInput[],
  reportDayKey: string = todayKey(),
): ArticleInput[] {
  const xStockSourceIds = new Set(
    sources
      .filter(
        (s) =>
          s.enabled !== false &&
          s.category === "finance" &&
          s.subcategory === "x-posts",
      )
      .map((s) => s.id),
  );
  // Accept articles from the last 2 days — Serenity tweets are fetched via
  // RSSHub which may have timezone/date mismatches with the report day key.
  const reportDate = new Date(reportDayKey.replace(/-/g, "/"));
  const twoDaysAgo = new Date(reportDate.getTime() - 2 * 86400000);
  return articles
    .filter((a) => xStockSourceIds.has(a.sourceId))
    .filter((a) => !a.publishedAt || a.publishedAt >= twoDaysAgo)
    .sort(
      (a, b) =>
        (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    )
    .slice(0, X_STOCK_POST_LIMIT);
}

async function enrichXStockPicks(
  articles: ArticleInput[],
  reportDayKey: string,
): Promise<void> {
  const xPosts = xStockPickArticles(articles, reportDayKey);
  if (xPosts.length === 0) return;
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const toEnrich = xPosts.filter((a) => {
    const sourceLang = sourceById.get(a.sourceId)?.lang ?? "en";
    return sourceLang !== REPORT_LOCALE;
  });
  if (toEnrich.length === 0) return;
  console.log(
    `[daily] localizing ${toEnrich.length}/${xPosts.length} X stock-pick posts with ${REPORT_LOCALE} text…`,
  );
  const t0 = Date.now();
  const localized = await enrichXStockPickSummaries(
    toEnrich.map((a) => ({
      url: a.url,
      title: a.title,
      excerpt: a.excerpt,
      source: a.source,
    })),
  );
  for (const a of toEnrich) {
    const item = localized.get(a.url);
    if (!item) continue;
    if (item.title) a.displayTitle = item.title;
    if (item.excerpt) a.displayExcerpt = item.excerpt;
    if (item.summary) a.summary = item.summary;
  }
  console.log(
    `[daily] X stock-pick localization done in ${((Date.now() - t0) / 1000).toFixed(1)}s, matched ${localized.size}/${toEnrich.length}`,
  );
}

/**
 * Shared implementation for "merged subgroup" enrichment: collect all
 * enabled articles in (category, subcategory), sort by date desc, take
 * the display cap (from MERGED_SUBGROUP_LIMITS), and ask the LLM to
 * summarize them into REPORT_LOCALE in a single batch. Symmetric to the
 * merge logic in render.ts groupRaw, so display and enrichment stay aligned.
 *
 * Sources whose `lang` already matches REPORT_LOCALE are skipped — no
 * point translating English to English (en mode) or Chinese to Chinese
 * (zh mode).
 */
async function enrichMergedSubgroup(
  articles: ArticleInput[],
  category: "tech" | "finance" | "politics",
  subcategory: string,
): Promise<void> {
  const subSources = sources.filter(
    (s) =>
      s.category === category &&
      s.subcategory === subcategory &&
      s.enabled !== false,
  );
  const enabledIds = new Set(subSources.map((s) => s.id));
  const sameLocaleIds = new Set(
    subSources.filter((s) => (s.lang ?? "en") === REPORT_LOCALE).map((s) => s.id),
  );
  const limit = MERGED_SUBGROUP_LIMITS[`${category}:${subcategory}`] ?? 12;
  // Top-N respects all enabled sources (so we don't reshape the merged
  // timeline). Enrichment only targets items NOT already in the target
  // language within that slice.
  const top = articles
    .filter((a) => enabledIds.has(a.sourceId))
    .filter((a) => category !== "politics" || !isSportsArticle(a.title))
    .sort(
      (a, b) =>
        (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    )
    .slice(0, limit);
  const toEnrich = top.filter((a) => !sameLocaleIds.has(a.sourceId));
  if (toEnrich.length === 0) return;
  console.log(
    `[daily] enriching ${toEnrich.length}/${top.length} ${category}:${subcategory} items with ${REPORT_LOCALE} summaries…`,
  );
  const t0 = Date.now();
  const summaries = await enrichFinanceNewsSummaries(toEnrich);
  for (const a of toEnrich) {
    const s = summaries.get(a.url);
    if (s) a.summary = s;
  }
  console.log(
    `[daily] enrichment done in ${((Date.now() - t0) / 1000).toFixed(1)}s, matched ${summaries.size}/${toEnrich.length}`,
  );
}

/**
 * Pull daily OHLCV from Yahoo for every ticker in the watchlist, compute
 * indicators + signals, then ask Sonnet for a market overview + a
 * picks-to-watch list. Returns null if no ticker came back.
 */
async function runTrading(): Promise<TradingSection | null> {
  console.log(`[daily] analyzing watchlist + crypto context (Yahoo / alt.me / CoinGecko)…`);
  const t0 = Date.now();
  const [tickers, cryptoFearGreed, cryptoGlobal] = await Promise.all([
    analyzeWatchlist(),
    fetchCryptoFearGreed(),
    fetchCryptoGlobal(),
  ]);
  console.log(
    `[daily] indicators ready in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${tickers.length} tickers` +
      (cryptoFearGreed ? `, F&G ${cryptoFearGreed.value}` : ", F&G ✗") +
      (cryptoGlobal
        ? `, BTC dom ${cryptoGlobal.btcDominance.toFixed(1)}%`
        : ", CG ✗"),
  );
  if (tickers.length === 0) return null;
  console.log(`[daily] generating trading commentary with ${getModelTag()}…`);
  const t1 = Date.now();
  const commentary = await generateTradingCommentary({
    tickers,
    cryptoFearGreed: cryptoFearGreed ?? undefined,
    cryptoGlobal: cryptoGlobal ?? undefined,
  });
  console.log(
    `[daily] trading commentary ready in ${((Date.now() - t1) / 1000).toFixed(1)}s`,
  );
  return {
    ...commentary,
    tickers,
    crypto_fear_greed: cryptoFearGreed ?? undefined,
    crypto_global: cryptoGlobal ?? undefined,
    generated_at: new Date().toISOString(),
  };
}

async function main() {
  const date = todayKey();
  console.log(`[daily] ${date} — fetching sources…\n`);
  const articles = await fetchAll();
  console.log(`\n[daily] total articles: ${articles.length}`);
  if (articles.length === 0) {
    throw new Error("no articles fetched — aborting");
  }

  // Enrich GH Trending, finance news, and politics with Chinese summaries.
  await enrichGhTrending(articles);
  await enrichFinanceNews(articles);
  await enrichPolitics(articles);
  await enrichAiNews(articles);
  await enrichXViral(articles);
  await enrichXStockPicks(articles, date);

  // Trading signals: Yahoo fetch + indicators + commentary. Non-fatal —
  // if it errors, we still ship the news digest.
  let trading: TradingSection | null = null;
  try {
    trading = await runTrading();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[daily] trading section failed: ${msg}`);
  }

  console.log(`[daily] generating digest with ${getModelTag()}…`);
  const t0 = Date.now();
  const { report } = await generateDailyReport(articles, date);
  console.log(`[daily] digest ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const stockHighlightInputs = xStockPickArticles(articles, date).map((a) => ({
    url: a.url,
    title: a.displayTitle ?? a.title,
    excerpt: a.displayExcerpt ?? a.excerpt,
    source: a.source,
  }));
  if (stockHighlightInputs.length > 0) {
    console.log(
      `[daily] extracting X stock highlight table with ${getModelTag()}…`,
    );
    const tStock = Date.now();
    const stockHighlights = await generateStockHighlights(stockHighlightInputs);
    if (stockHighlights.length > 0) report.stock_highlights = stockHighlights;
    console.log(
      `[daily] stock highlights ready in ${((Date.now() - tStock) / 1000).toFixed(1)}s — ${stockHighlights.length} rows`,
    );
  }

  if (trading) report.trading = trading;

  const dateDir = path.join(OUTPUT_DIR, date);
  fs.mkdirSync(dateDir, { recursive: true });
  const base = path.join(dateDir, date);
  const raw = groupRaw(articles, sources);
  fs.writeFileSync(`${base}.json`, JSON.stringify(report, null, 2), "utf8");
  // Sidecar with all fetched articles + LLM-attached summary, so
  // scripts/render.ts can rebuild HTML/MD for UI iteration without
  // re-fetching or re-calling the LLM.
  fs.writeFileSync(
    `${base}-articles.json`,
    JSON.stringify({ date, articles }, null, 2),
    "utf8",
  );
  fs.writeFileSync(`${base}.html`, renderHtml(report, raw, date), "utf8");
  if (process.env.OUTPUT_MARKDOWN === "true") {
    fs.writeFileSync(`${base}.md`, renderMarkdown(report, date), "utf8");
    console.log(`[daily] wrote ${base}.{json,html,md,articles.json}`);
  } else {
    console.log(`[daily] wrote ${base}.{json,html,articles.json}`);
  }

  console.log(`[daily] done.`);
}

main().catch((e) => {
  console.error(`[daily] FAILED:`, e);
  process.exit(1);
});
