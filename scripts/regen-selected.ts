import "./_env";

import fs from "node:fs";
import path from "node:path";

import {
  enrichXStockPickSummaries,
  type LocalizedXStockPick,
} from "../lib/ai/enrich";
import type { ArticleInput, DailyReport } from "../lib/ai/pipeline";
import {
  groupRaw,
  renderHtml,
  renderMarkdown,
} from "../lib/output/render";
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

function reviveArticles(
  articles: Array<Omit<ArticleInput, "publishedAt"> & { publishedAt?: string | Date }>,
): ArticleInput[] {
  return articles.map((a) => ({
    ...a,
    publishedAt: a.publishedAt ? new Date(a.publishedAt) : undefined,
  }));
}

function selectedArticles(articles: ArticleInput[]): ArticleInput[] {
  const sourceIds = new Set(
    sources
      .filter(
        (s) =>
          s.enabled !== false &&
          s.category === "finance" &&
          s.subcategory === "x-posts",
      )
      .map((s) => s.id),
  );
  return articles
    .filter((a) => sourceIds.has(a.sourceId))
    .sort(
      (a, b) =>
        (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    )
    .slice(0, X_STOCK_POST_LIMIT);
}

function needsLocalization(a: ArticleInput): boolean {
  if (REPORT_LOCALE === "en") return false;
  const title = a.displayTitle ?? a.title;
  const excerpt = a.displayExcerpt ?? a.excerpt ?? "";
  return !containsCjk(title) || !containsCjk(excerpt) || !containsCjk(a.summary);
}

function toPayload(items: ArticleInput[]) {
  return items.map((a) => ({
    url: a.url,
    title: a.title,
    excerpt: a.excerpt,
    source: a.source,
  }));
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
  const selected = selectedArticles(articles);
  const toEnrich = selected.filter(needsLocalization);
  console.log(
    `[regen-selected] Selected feed ${selected.length} items, localizing ${toEnrich.length}`,
  );
  if (toEnrich.length === 0) return;

  const localized = new Map<string, LocalizedXStockPick>();
  const batches = chunksOf(toEnrich, X_STOCK_LOCALIZE_BATCH_SIZE);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(
      `[regen-selected] localization batch ${i + 1}/${batches.length} (${batch.length} items)…`,
    );
    const partial = await enrichXStockPickSummaries(toPayload(batch));
    for (const [url, item] of partial.entries()) localized.set(url, item);
    const missing = batch.filter((a) => !partial.has(a.url));
    if (missing.length > 0 && missing.length < batch.length) {
      console.log(
        `[regen-selected] retrying ${missing.length} missing items in batch ${i + 1}…`,
      );
      const retry = await enrichXStockPickSummaries(toPayload(missing));
      for (const [url, item] of retry.entries()) localized.set(url, item);
    }
  }
  const patched = applyLocalized(articles, localized);
  console.log(
    `[regen-selected] patched ${patched}/${toEnrich.length} localized Selected items`,
  );
}

async function main() {
  const date = process.argv[2] || todayKey();
  const base = path.join(OUTPUT_DIR, date, date);
  const jsonPath = `${base}.json`;
  const articlesPath = `${base}-articles.json`;
  if (!fs.existsSync(jsonPath)) throw new Error(`Report JSON not found: ${jsonPath}`);
  if (!fs.existsSync(articlesPath)) {
    throw new Error(`Articles sidecar not found: ${articlesPath}`);
  }

  const report = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as DailyReport;
  const sidecar = JSON.parse(fs.readFileSync(articlesPath, "utf8")) as {
    date: string;
    articles: Array<Omit<ArticleInput, "publishedAt"> & { publishedAt?: string }>;
  };
  const articles = reviveArticles(sidecar.articles);

  await localizeSelected(articles);

  console.log("[regen-selected] fetching Shanghai weather + AQI…");
  const weather = await fetchShanghaiWeather(date);
  if (weather) report.weather = weather;

  const raw = groupRaw(articles, sources);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(
    articlesPath,
    JSON.stringify({ date, articles }, null, 2),
    "utf8",
  );
  fs.writeFileSync(`${base}.html`, renderHtml(report, raw, date), "utf8");
  if (process.env.OUTPUT_MARKDOWN === "true") {
    fs.writeFileSync(`${base}.md`, renderMarkdown(report, date), "utf8");
    console.log(`[regen-selected] wrote ${base}.{json,html,md,articles.json}`);
  } else {
    console.log(`[regen-selected] wrote ${base}.{json,html,articles.json}`);
  }
}

main().catch((e) => {
  console.error("[regen-selected] FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
