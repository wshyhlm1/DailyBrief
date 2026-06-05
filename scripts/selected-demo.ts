import "./_env";

import fs from "node:fs";
import path from "node:path";

import {
  enrichXStockPickSummaries,
  type LocalizedXStockPick,
} from "../lib/ai/enrich";
import type { ArticleInput, DailyReport } from "../lib/ai/pipeline";
import { generateStockHighlights } from "../lib/ai/stock-highlights";
import { getModelTag } from "../lib/ai/llm";
import { groupRaw, renderHtml } from "../lib/output/render";
import { fetchSource } from "../lib/sources/dispatch";
import { sources, REPORT_LOCALE } from "../lib/sources/registry";
import { todayKey } from "../lib/utils";
import { fetchShanghaiWeather } from "../lib/weather/shanghai";

const OUTPUT_DIR = "daily_reports";
const X_STOCK_POST_LIMIT = 20;
const X_STOCK_LOCALIZE_BATCH_SIZE = 6;

function containsCjk(s: string | undefined): boolean {
  return !!s && /[\u3400-\u9fff]/.test(s);
}

function chunksOf<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function selectedSource() {
  const source = sources.find((s) => s.id === "x-serenity");
  if (!source) throw new Error("x-serenity source not found");
  return source;
}

function toPayload(items: ArticleInput[]) {
  return items.map((a) => ({
    url: a.url,
    title: a.title,
    excerpt: a.excerpt,
    source: a.source,
  }));
}

function needsLocalization(a: ArticleInput): boolean {
  if (REPORT_LOCALE === "en") return false;
  const title = a.displayTitle ?? a.title;
  const excerpt = a.displayExcerpt ?? a.excerpt ?? "";
  return !containsCjk(title) || !containsCjk(excerpt) || !containsCjk(a.summary);
}

function applyLocalized(
  articles: ArticleInput[],
  localized: Map<string, LocalizedXStockPick>,
): number {
  let patched = 0;
  for (const a of articles) {
    const item = localized.get(a.url);
    if (!item) continue;
    if (item.title) a.displayTitle = item.title;
    if (item.excerpt) a.displayExcerpt = item.excerpt;
    if (item.summary) a.summary = item.summary;
    patched++;
  }
  return patched;
}

async function localizeSelected(articles: ArticleInput[]): Promise<void> {
  const toEnrich = articles.filter(needsLocalization);
  console.log(
    `[selected-demo] Selected feed ${articles.length} items, localizing ${toEnrich.length}`,
  );
  if (toEnrich.length === 0) return;

  const localized = new Map<string, LocalizedXStockPick>();
  const batches = chunksOf(toEnrich, X_STOCK_LOCALIZE_BATCH_SIZE);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(
      `[selected-demo] localization batch ${i + 1}/${batches.length} (${batch.length} items)...`,
    );
    const partial = await enrichXStockPickSummaries(toPayload(batch));
    for (const [url, item] of partial.entries()) localized.set(url, item);
    const missing = batch.filter((a) => !partial.has(a.url));
    if (missing.length > 0 && missing.length < batch.length) {
      console.log(
        `[selected-demo] retrying ${missing.length} missing items in batch ${i + 1}...`,
      );
      const retry = await enrichXStockPickSummaries(toPayload(missing));
      for (const [url, item] of retry.entries()) localized.set(url, item);
    }
  }
  const patched = applyLocalized(articles, localized);
  console.log(`[selected-demo] patched ${patched}/${toEnrich.length} localized items`);
}

async function fetchSelectedArticles(): Promise<ArticleInput[]> {
  const source = selectedSource();
  const items = await fetchSource(source);
  return items
    .map((item) => ({ ...item, source: source.name }))
    .sort(
      (a, b) =>
        (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    )
    .slice(0, X_STOCK_POST_LIMIT);
}

async function main() {
  const date = process.argv[2] || todayKey();
  console.log(`[selected-demo] ${date} — fetching latest Serenity feed`);

  const articles = await fetchSelectedArticles();
  if (articles.length === 0) throw new Error("no Selected articles fetched");

  await localizeSelected(articles);

  console.log(`[selected-demo] extracting stock highlights with ${getModelTag()}...`);
  const stockHighlights = await generateStockHighlights(
    articles.map((a) => ({
      url: a.url,
      title: a.displayTitle ?? a.title,
      excerpt: a.displayExcerpt ?? a.excerpt,
      source: a.source,
    })),
  );

  const report: DailyReport = {
    hero_headline:
      REPORT_LOCALE === "en"
        ? "Selected demo generated from the latest Serenity feed."
        : "Selected demo 已根据 Serenity 最新观点生成。",
    daily_overview:
      REPORT_LOCALE === "en"
        ? "This demo focuses on the Selected tab only."
        : "本 demo 仅用于预览 Selected 标签的新结构与视觉，不替代完整日报。",
    tech_briefs: [],
    finance_briefs: [],
    politics_briefs: [],
    editor_note:
      REPORT_LOCALE === "en"
        ? "Review layout, hierarchy, and signal grouping before promoting it into the scheduled daily report."
        : "请重点看信息层级、卡片密度、时间轴和产业链分组是否符合你的阅读习惯。",
    keywords: ["Selected", "Serenity", "Chokepoint"],
    stock_highlights: stockHighlights,
  };

  const weather = await fetchShanghaiWeather(date);
  if (weather) report.weather = weather;

  const raw = groupRaw(articles, sources);
  const dateDir = path.join(OUTPUT_DIR, date);
  fs.mkdirSync(dateDir, { recursive: true });
  const outPath = path.join(dateDir, `${date}-selected-demo.html`);
  fs.writeFileSync(outPath, renderHtml(report, raw, date), "utf8");
  console.log(`[selected-demo] wrote ${outPath}`);
}

main().catch((e) => {
  console.error("[selected-demo] FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
