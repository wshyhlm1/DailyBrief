import type {
  ArticleInput,
  BriefItem,
  DailyReport,
  TradingSection,
} from "../ai/pipeline";
import type { WatchlistPick } from "../ai/trading-commentary";
import { REPORT_LOCALE } from "../sources/registry";
import { getReportTz } from "../utils";
import type { Category, SourceDef } from "../sources/types";
import { V2EX_OFF_TOPIC_RE } from "../sources/v2ex";
import type { TickerAnalysis } from "../trading/signals";
import {
  getAssetGroupLabels,
  ASSET_GROUP_ORDER,
  type AssetGroup,
} from "../trading/watchlist";

// ----- i18n -----

/**
 * Localized UI strings. `t` resolves to TEXTS_ZH or TEXTS_EN at module
 * init based on REPORT_LOCALE. All hardcoded display text routes through
 * this object so adding a third locale = adding one more table.
 */
const TEXTS_ZH = {
  siteTitle: "每日简报",
  catSelected: "S’elected",
  catTech: "技术动态",
  catFinance: "财经要点",
  catPolitics: "时政观察",
  catTrading: "市场行情",
  catCommunity: "社区讨论",
  subAiNews: "AI 媒体",
  subXViral: "X 推文",
  subBlogWeekly: "博客周刊",
  subCnCommunity: "中文社区",
  subOverseasCommunity: "海外社区",
  subFinanceNews: "财经新闻",
  subFinanceCommunity: "社区讨论",
  subWorld: "国际要闻",
  subOverseasNews: "海外科技",
  subOverseas: "海外",
  emptySource: "该源今日无内容。",
  emptyCategory: "该分类今日无内容。",
  emptyGroup: "该组今日无数据。",
  footer: "内容均来自原媒体，本站仅作摘要整理与回链。",
  summaryLabelNews: "中文摘要",
  summaryLabelIntro: "中文介绍",
  tradingMarketOverview: "市场总览",
  tradingTodayFocus: "今日关注",
  tradingAllAssets: "全部资产",
  tradingRiskCaveat: "风险提示",
  widgetCryptoFearGreed: "加密恐慌贪婪",
  widgetCryptoCap: "加密总市值",
  widgetBtcDom: "BTC 主导率",
  widgetVolume24h: "24h 成交量",
  widgetActiveCoins: "活跃币",
  ticker5d: "5 日",
  tickerVs52wHigh: "距 52w 高",
  tickerTrend: "趋势",
  tickerMacd: "MACD / 信号",
  signalToday: "今天",
  signalDaysAgoSuffix: "天前",
  trendBullish: "多头",
  trendBearish: "空头",
  trendNeutral: "中性",
  mdTodayOverview: "今日总览",
  mdEditorNote: "编辑短评",
  mdTodayKeywords: "今日关键词",
  mdImportance: "重要度",
  archiveLink: "← 历史归档",
  stockSummaryTitle: "S’elected 精选总结",
  stockSymbol: "股票",
  stockSource: "来源",
  stockView: "观点",
  stockTarget: "目标价/参考价",
  stockThesis: "核心内容",
  stockNotMentioned: "未提及",
  weatherAqi: "空气",
  weatherFeelsLike: "体感",
  earningsTitle: "未来财报雷达",
  earningsWindow: "观察窗口",
  earningsEmpty: "未来窗口内暂无白名单科技公司财报。",
  earningsExpectation: "市场预期",
  earningsNoConsensus: "暂无公开一致预期",
  earningsSourceHealth: "来源状态",
  earningsConfirmed: "确认",
  earningsEstimated: "预估",
  earningsBeforeMarket: "盘前",
  earningsAfterMarket: "盘后",
  earningsDuringMarket: "盘中",
  earningsTimeTbd: "时间待定",
  earningsRegionUS: "美国",
  earningsRegionChina: "中国",
  earningsRegionTaiwan: "台湾",
  earningsRegionKorea: "韩国",
};

const TEXTS_EN: typeof TEXTS_ZH = {
  siteTitle: "Daily Brief",
  catSelected: "S’elected",
  catTech: "Tech",
  catFinance: "Finance",
  catPolitics: "World",
  catTrading: "Markets",
  catCommunity: "Community",
  subAiNews: "AI Media",
  subXViral: "X Viral",
  subBlogWeekly: "Blog Weekly",
  subCnCommunity: "Chinese Community",
  subOverseasCommunity: "Overseas Community",
  subFinanceNews: "Finance News",
  subFinanceCommunity: "Community",
  subWorld: "World News",
  subOverseasNews: "Overseas Tech",
  subOverseas: "Overseas",
  emptySource: "No content from this source today.",
  emptyCategory: "No content in this category today.",
  emptyGroup: "No data for this group today.",
  footer:
    "Content sourced from original publishers; this site provides summary and backlinks only.",
  summaryLabelNews: "Summary",
  summaryLabelIntro: "Summary",
  tradingMarketOverview: "Market Overview",
  tradingTodayFocus: "Today's Focus",
  tradingAllAssets: "All Assets",
  tradingRiskCaveat: "Risk Disclaimer",
  widgetCryptoFearGreed: "Crypto Fear/Greed",
  widgetCryptoCap: "Crypto Market Cap",
  widgetBtcDom: "BTC Dominance",
  widgetVolume24h: "24h Volume",
  widgetActiveCoins: "Active coins",
  ticker5d: "5d",
  tickerVs52wHigh: "vs 52w High",
  tickerTrend: "Trend",
  tickerMacd: "MACD / Signal",
  signalToday: "today",
  signalDaysAgoSuffix: "d ago",
  trendBullish: "Bullish",
  trendBearish: "Bearish",
  trendNeutral: "Neutral",
  mdTodayOverview: "Today's Overview",
  mdEditorNote: "Editor's Note",
  mdTodayKeywords: "Keywords",
  mdImportance: "Importance",
  archiveLink: "← Archive",
  stockSummaryTitle: "S’elected Highlights",
  stockSymbol: "Symbol",
  stockSource: "Source",
  stockView: "View",
  stockTarget: "Target / Reference",
  stockThesis: "Core Point",
  stockNotMentioned: "Not stated",
  weatherAqi: "AQI",
  weatherFeelsLike: "Feels",
  earningsTitle: "Upcoming Earnings Radar",
  earningsWindow: "Window",
  earningsEmpty: "No watched tech earnings in the upcoming window.",
  earningsExpectation: "Consensus",
  earningsNoConsensus: "No public consensus available",
  earningsSourceHealth: "Source status",
  earningsConfirmed: "Confirmed",
  earningsEstimated: "Estimated",
  earningsBeforeMarket: "BMO",
  earningsAfterMarket: "AMC",
  earningsDuringMarket: "During market",
  earningsTimeTbd: "Time TBD",
  earningsRegionUS: "US",
  earningsRegionChina: "China",
  earningsRegionTaiwan: "Taiwan",
  earningsRegionKorea: "Korea",
};

const STR = REPORT_LOCALE === "en" ? TEXTS_EN : TEXTS_ZH;
const ASSET_GROUP_LABELS_LOCALIZED = getAssetGroupLabels(REPORT_LOCALE);

// ----- types -----

export type SourceGroup = {
  sourceId: string;
  sourceName: string;
  items: ArticleInput[];
  /**
   * When true, items come from multiple merged sources and the renderer
   * should label each article with `a.source` since the source-tab row
   * is suppressed (only one synthetic group).
   */
  merged?: boolean;
};

export type SubGroup = {
  id: string;
  name: string;
  sources: SourceGroup[];
};

export type RawByCategory = Record<Category, SubGroup[]>;

// ----- labels & ordering -----

const CATEGORY_LABELS: Record<Category, string> = {
  tech: STR.catTech,
  finance: STR.catFinance,
  politics: STR.catPolitics,
};

const CATEGORY_DIGEST_LABELS: Record<Category, string> = {
  tech: STR.catTech,
  finance: STR.catFinance,
  politics: STR.catPolitics,
};

/**
 * L2 ordering per category. Categories not listed render flat (no L2 tabs).
 */
const SUBCATEGORY_ORDER: Partial<Record<Category, string[]>> = {
  // cn-community + overseas-community are listed last so the L1 "community"
  // panel (rendered separately via TECH_COMMUNITY_SUBS) can extract them.
  // Within the "tech" L1 panel itself, COMMUNITY_SUBS is filtered out.
  // Locale filtering at registry level decides which actually appears:
  // zh mode keeps cn-community (V2EX / LinuxDo); en mode keeps
  // overseas-community (Hacker News / r/stocks).
  tech: ["github-trending", "x-viral", "ai-news", "cn-community", "overseas-community"],
  finance: ["x-posts", "news"],
  politics: ["world"],
};

const SELECTED_FINANCE_SUBS = new Set(["x-posts"]);
const TECH_MAIN_SUBS = new Set(["github-trending", "x-viral", "ai-news"]);
const TECH_COMMUNITY_SUBS = new Set(["cn-community", "overseas-community"]);

const SUBCATEGORY_LABELS: Record<string, string> = {
  "github-trending": "GitHub Trending",
  "cn-community": STR.subCnCommunity,
  "overseas-community": STR.subOverseasCommunity,
  "ai-news": STR.subAiNews,
  "x-viral": STR.subXViral,
  "x-posts": "S’elected",
  "blog-weekly": STR.subBlogWeekly,
  news: STR.subFinanceNews,
  world: STR.subWorld,
};

/**
 * Per-source item caps in the raw display, keyed by "category:subcategory".
 * Each source inside the subcategory shows up to N items. Missing keys = no cap.
 *
 * Default 20 across all L3-tabbed subcategories keeps each tab a single
 * comfortable scroll instead of 25-30 items. Merged subgroups (blog-weekly,
 * finance:news, politics:world) ignore this — they use MERGED_SUBGROUP_LIMITS.
 */
const SOURCE_DISPLAY_LIMITS: Record<string, number> = {
  "tech:github-trending": 20,
  "tech:cn-community": 10,
  "tech:x-viral": 20,
  "finance:x-posts": 20,
};

/**
 * Sources whose fetcher returns items already sorted by an engagement/heat
 * algorithm we want to preserve. groupRaw skips its default date-desc sort
 * for these so the final render reflects the source's own ranking.
 */
const PRESERVE_FETCH_ORDER_SOURCES = new Set(["attentionvc-ai"]);

function displayLimitFor(
  category: Category,
  subId: string | undefined,
): number | undefined {
  if (!subId) return undefined;
  return SOURCE_DISPLAY_LIMITS[`${category}:${subId}`];
}

/**
 * Subcategories that should collapse their sources into a single flat
 * time-sorted list (no L3 source tabs), keyed by "category:subcategory".
 * Value = number of items kept after merging. Each rendered article
 * will display its `source` label inline since the per-source tab row
 * is suppressed.
 *
 * Used when:
 *  - sources are heterogeneous but each publishes few items (blog-weekly)
 *  - the user explicitly wants a curated time-sorted feed rather than
 *    per-source browsing (finance:news, only authoritative sources)
 *
 * Exported so daily.ts can read the cap to keep enrichment in sync.
 */
export const MERGED_SUBGROUP_LIMITS: Record<string, number> = {
  "tech:ai-news": 15,
  "finance:news": 12,
  "politics:world": 15,
};

/**
 * Politics sources (especially Al Jazeera / BBC / The Diplomat) regularly
 * mix in World Cup / Olympic / football coverage. Filter at the title level
 * so the merged "国际要闻" stream stays politics-only.
 *
 * Pattern is intentionally specific — avoid generic words like "team" or
 * "match" that overlap with diplomacy headlines.
 */
const POLITICS_SPORTS_RE =
  /\b(World\s*Cup|Olympics?|UEFA|FIFA|NBA|NFL|NHL|MLB|ATP|WTA|Premier\s*League|Bundesliga|La\s*Liga|Serie\s*A|Champions\s*League|Eurovision|Wimbledon|Grand\s*Slam|F1|Formula\s*1|Ronaldo|Messi|Mbappe|Beckham|Lukaku|Mitoma|sportsman|footballer|squad)\b|世界杯|奥运|残奥|冬奥|欧冠|英超|西甲|意甲|德甲|网球|足球|篮球|高尔夫|棒球|板球|橄榄球/i;

export function isSportsArticle(title: string): boolean {
  return POLITICS_SPORTS_RE.test(title);
}

function mergedLimitFor(
  category: Category,
  subId: string,
): number | undefined {
  return MERGED_SUBGROUP_LIMITS[`${category}:${subId}`];
}

// ----- grouping -----

export function groupRaw(
  articles: ArticleInput[],
  registry: SourceDef[],
): RawByCategory {
  const subcatOf = new Map<string, string | undefined>();
  for (const s of registry) subcatOf.set(s.id, s.subcategory);
  // Drop articles from sources that have since been disabled — important
  // when scripts/render.ts re-renders against a stale sidecar that still
  // contains the disabled sources' fetched data.
  const enabledIds = new Set(
    registry.filter((s) => s.enabled !== false).map((s) => s.id),
  );

  type Bucket = { sourceName: string; items: ArticleInput[] };
  const buckets: Record<Category, Map<string, Bucket>> = {
    tech: new Map(),
    finance: new Map(),
    politics: new Map(),
  };
  // Pre-seed empty buckets for every enabled source so per-source-tabbed
  // subcategories (e.g. cn-community) still render a tab for sources that
  // returned 0 items today. Without this, a transient LinuxDo Cloudflare
  // block would silently collapse the L3 tab nav, making users wonder
  // whether the other forum even exists.
  for (const s of registry) {
    if (s.enabled === false) continue;
    if (!buckets[s.category].has(s.id)) {
      buckets[s.category].set(s.id, { sourceName: s.name, items: [] });
    }
  }

  for (const a of articles) {
    if (!enabledIds.has(a.sourceId)) continue;
    if (a.category === "politics" && isSportsArticle(a.title)) continue;
    if (
      (a.sourceId === "v2ex-hot" || a.sourceId === "linuxdo") &&
      V2EX_OFF_TOPIC_RE.test(a.title)
    )
      continue;
    const map = buckets[a.category];
    let b = map.get(a.sourceId);
    if (!b) {
      b = { sourceName: a.source, items: [] };
      map.set(a.sourceId, b);
    }
    b.items.push(a);
  }

  for (const cat of Object.keys(buckets) as Category[]) {
    for (const [id, b] of buckets[cat].entries()) {
      if (PRESERVE_FETCH_ORDER_SOURCES.has(id)) continue;
      b.items.sort(
        (a, b) =>
          (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
      );
    }
  }

  function toSourceGroup(
    sourceId: string,
    b: Bucket,
    limit: number | undefined,
  ): SourceGroup {
    return {
      sourceId,
      sourceName: b.sourceName,
      items: limit ? b.items.slice(0, limit) : b.items,
    };
  }

  function sortByRegistry(list: SourceGroup[]): SourceGroup[] {
    return [...list].sort((a, b) => {
      const ia = registry.findIndex((s) => s.id === a.sourceId);
      const ib = registry.findIndex((s) => s.id === b.sourceId);
      return ia - ib;
    });
  }

  const out: RawByCategory = { tech: [], finance: [], politics: [] };

  for (const cat of Object.keys(buckets) as Category[]) {
    const order = SUBCATEGORY_ORDER[cat];
    if (!order) {
      // Flat: one synthetic subgroup with every source.
      const sources: SourceGroup[] = [];
      for (const [id, b] of buckets[cat].entries()) {
        sources.push(toSourceGroup(id, b, undefined));
      }
      out[cat] = sources.length
        ? [{ id: "all", name: CATEGORY_LABELS[cat], sources: sortByRegistry(sources) }]
        : [];
      continue;
    }
    // Subcategory split: bucket each source under its registered subcategory.
    const subs: SubGroup[] = [];
    for (const subId of order) {
      const mergeLimit = mergedLimitFor(cat, subId);
      if (mergeLimit !== undefined) {
        // Merge: flatten all sources under this subcategory into a single
        // time-sorted SourceGroup. Articles keep their `source` field so
        // the renderer can label them.
        const flat: ArticleInput[] = [];
        for (const [id, b] of buckets[cat].entries()) {
          if (subcatOf.get(id) === subId) flat.push(...b.items);
        }
        if (flat.length === 0) continue;
        flat.sort(
          (a, b) =>
            (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
        );
        subs.push({
          id: subId,
          name: SUBCATEGORY_LABELS[subId] ?? subId,
          sources: [
            {
              sourceId: "_merged",
              sourceName: SUBCATEGORY_LABELS[subId] ?? subId,
              items: flat.slice(0, mergeLimit),
              merged: true,
            },
          ],
        });
        continue;
      }

      const limit = displayLimitFor(cat, subId);
      const sources: SourceGroup[] = [];
      for (const [id, b] of buckets[cat].entries()) {
        if (subcatOf.get(id) === subId) sources.push(toSourceGroup(id, b, limit));
      }
      if (sources.length === 0) continue;
      subs.push({
        id: subId,
        name: SUBCATEGORY_LABELS[subId] ?? subId,
        sources: sortByRegistry(sources),
      });
    }
    out[cat] = subs;
  }

  return out;
}

// ----- HTML helpers -----

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(d: Date | undefined): string {
  if (!d) return "";
  try {
    // zh: "05/20 16:00"  · en: "May 20, 4:00 PM" → keep 24h en-GB style "20/05 16:00"
    const localeTag = REPORT_LOCALE === "en" ? "en-GB" : "zh-CN";
    return d.toLocaleString(localeTag, {
      timeZone: getReportTz(),
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

function aqiTone(aqi: number | undefined): "good" | "moderate" | "sensitive" | "unhealthy" | "hazardous" {
  if (aqi === undefined || !Number.isFinite(aqi)) return "moderate";
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 150) return "sensitive";
  if (aqi <= 200) return "unhealthy";
  return "hazardous";
}

function renderWeatherPill(report: DailyReport): string {
  const w = report.weather;
  if (!w) return "";
  const temp =
    w.temperature_min_c !== undefined &&
    w.temperature_max_c !== undefined &&
    w.temperature_min_c !== w.temperature_max_c
      ? `${w.temperature_min_c}-${w.temperature_max_c}°C`
      : `${w.temperature_c}°C`;
  const aqi =
    w.aqi === undefined
      ? ""
      : `<span class="weather-aqi aqi-${aqiTone(w.aqi)}">${STR.weatherAqi} ${w.aqi}${w.aqi_label ? ` · ${escapeHtml(w.aqi_label)}` : ""}</span>`;
  const feels =
    w.apparent_temperature_c === undefined
      ? ""
      : `<span class="weather-muted">${STR.weatherFeelsLike} ${w.apparent_temperature_c}°</span>`;
  const observed = w.observed_at ? ` title="${escapeHtml(`${w.source} · ${w.observed_at}`)}"` : "";
  return `<aside class="weather-pill"${observed} aria-label="${escapeHtml(`${w.city} ${w.condition} ${temp}`)}">
    <span class="weather-icon" aria-hidden="true">${escapeHtml(w.emoji)}</span>
    <span class="weather-city">${escapeHtml(w.city)}</span>
    <strong class="weather-temp">${temp}</strong>
    <span class="weather-condition">${escapeHtml(w.condition)}</span>
    ${feels}
    ${aqi}
  </aside>`;
}

function formatDateKeyShort(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const localeTag = REPORT_LOCALE === "en" ? "en-US" : "zh-CN";
  return date.toLocaleDateString(localeTag, {
    timeZone: "UTC",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
}

function earningsTimingLabel(timing: string): string {
  if (timing === "before_market") return STR.earningsBeforeMarket;
  if (timing === "after_market") return STR.earningsAfterMarket;
  if (timing === "during_market") return STR.earningsDuringMarket;
  return STR.earningsTimeTbd;
}

function earningsRegionLabel(region: string): string {
  if (region === "US") return STR.earningsRegionUS;
  if (region === "China") return STR.earningsRegionChina;
  if (region === "Taiwan") return STR.earningsRegionTaiwan;
  if (region === "Korea") return STR.earningsRegionKorea;
  return region;
}

function earningsCompanyName(event: NonNullable<DailyReport["earnings_calendar"]>["events"][number]): string {
  return REPORT_LOCALE === "zh" && event.company_zh
    ? `${event.company_zh} (${event.ticker})`
    : `${event.company} (${event.ticker})`;
}

function earningsExpectationText(event: NonNullable<DailyReport["earnings_calendar"]>["events"][number]): string {
  const parts: string[] = [];
  if (event.eps_estimate) parts.push(`EPS ${event.eps_estimate}`);
  if (event.revenue_estimate) parts.push(`Revenue ${event.revenue_estimate}`);
  return parts.length > 0 ? parts.join(" · ") : STR.earningsNoConsensus;
}

function renderEarningsCalendarHtml(report: DailyReport): string {
  const snapshot = report.earnings_calendar;
  if (!snapshot) return "";
  const okSources = snapshot.source_status.filter((source) => source.ok).length;
  const sourceHealth = `${okSources}/${snapshot.source_status.length}`;
  const events = snapshot.events ?? [];
  const body =
    events.length === 0
      ? `<p class="earnings-empty">${STR.earningsEmpty}</p>`
      : `<div class="earnings-grid">${events
          .map((event) => {
            const statusClass =
              event.confirmation_status === "confirmed" ? "confirmed" : "estimated";
            return `<article class="earnings-card">
        <div class="earnings-card-head">
          <span class="earnings-date">${escapeHtml(formatDateKeyShort(event.report_date))}</span>
          <span class="earnings-time">${escapeHtml(earningsTimingLabel(event.timing))}</span>
        </div>
        <h2>${escapeHtml(earningsCompanyName(event))}</h2>
        <p class="earnings-meta">
          <span>${escapeHtml(earningsRegionLabel(event.region))}</span>
          ${event.fiscal_period ? `<span>${escapeHtml(event.fiscal_period)}</span>` : ""}
          <span class="earnings-status ${statusClass}">${event.confirmation_status === "confirmed" ? STR.earningsConfirmed : STR.earningsEstimated}</span>
        </p>
        <p class="earnings-expectation"><span>${STR.earningsExpectation}</span>${escapeHtml(earningsExpectationText(event))}</p>
        <a class="earnings-source" href="${escapeHtml(event.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(event.source)}</a>
      </article>`;
          })
          .join("\n")}</div>`;

  return `<section class="earnings-radar" aria-label="${STR.earningsTitle}">
    <div class="earnings-radar-head">
      <div>
        <span class="eyebrow">${STR.earningsTitle}</span>
        <h2>${STR.earningsWindow}: ${escapeHtml(snapshot.window_start)} → ${escapeHtml(snapshot.window_end)}</h2>
      </div>
      <span class="earnings-health">${STR.earningsSourceHealth} ${escapeHtml(sourceHealth)}</span>
    </div>
    ${body}
  </section>`;
}

const STOCK_COMPANY_ZH: Record<string, string> = {
  "688017": "绿的谐波",
  "AAOI": "应用光电",
  "AMZN": "亚马逊",
  "ARM": "安谋",
  "AVGO": "博通",
  "BRK.A": "伯克希尔哈撒韦",
  "CIFR": "赛弗矿业",
  "COIN": "Coinbase",
  "CRCL": "Circle",
  "CRWV": "CoreWeave",
  "EWY": "韩国股票基金",
  "GFS": "格芯",
  "GOOGL": "谷歌母公司",
  "HOOD": "Robinhood",
  "IREN": "艾瑞斯算力",
  "JBL": "捷普",
  "LITE": "鲁门特姆",
  "META": "Meta",
  "MU": "美光",
  "NBIS": "尼比乌斯云计算",
  "NOK": "诺基亚",
  "NVDA": "英伟达",
  "NVTS": "纳微半导体",
  "POET": "POET Technologies",
  "RDDT": "Reddit",
  "RPI": "Raspberry Pi",
  "SIVE": "赛弗斯半导体",
  "SNDK": "闪迪",
  "TSM": "台积电",
  "XFAB": "X-FAB",
};

function containsCjk(s: string): boolean {
  return /[\u3400-\u9fff]/.test(s);
}

function localizedCompany(symbol: string, company?: string): string {
  if (REPORT_LOCALE !== "zh") return company ?? "";
  const mapped = STOCK_COMPANY_ZH[symbol.toUpperCase()];
  if (mapped) return mapped;
  if (company && containsCjk(company)) {
    const cjkPart = company
      .split(/[\/|｜]/)
      .map((part) => part.trim())
      .find((part) => containsCjk(part));
    if (cjkPart) return cjkPart;
  }
  return company ?? mapped ?? "";
}

function localizedSourceLabel(source: string): string {
  if (REPORT_LOCALE === "zh" && /X Serenity/i.test(source)) {
    return "Serenity 选股（@aleabitoreddit）";
  }
  return source;
}

function stockViewTone(view: string): "bull" | "bear" | "watch" | "neutral" {
  if (/看空|做空|下行|bear|short/i.test(view)) return "bear";
  if (/看多|做多|持仓|优选|上行|bull|long/i.test(view)) return "bull";
  if (/观察|观望|提及|复盘|对标|watch|recap/i.test(view)) return "watch";
  return "neutral";
}

function stockViewEmoji(view: string): string {
  const hasBull = /看多|做多|持仓|优选|上行|bull|long/i.test(view);
  const hasBear = /看空|做空|下行|bear|short/i.test(view);
  const hasWatch = /观察|观望|提及|复盘|对标|watch|recap/i.test(view);
  if (hasBull && hasBear) return "⚖️";
  if (hasBull && hasWatch) return "👀📈";
  if (hasBear && hasWatch) return "👀📉";
  if (hasBull) return "📈";
  if (hasBear) return "📉";
  if (hasWatch) return "👀";
  return "•";
}

function renderStockView(view: string): string {
  const tone = stockViewTone(view);
  return `<span class="stock-view-badge view-${tone}"><span aria-hidden="true">${stockViewEmoji(view)}</span>${escapeHtml(view)}</span>`;
}

// ----- raw article renderers -----

function renderArticleHtml(a: ArticleInput, showSource = false): string {
  const title = escapeHtml(a.displayTitle ?? a.title);
  const url = escapeHtml(a.url);
  const excerpt = a.displayExcerpt ?? a.excerpt;
  const excerptHtml = excerpt ? escapeHtml(excerpt) : "";
  // Backwards-compat: old sidecar JSON files may carry `cnSummary` instead.
  const summaryText = a.summary ?? (a as unknown as { cnSummary?: string }).cnSummary;
  const summary = summaryText ? escapeHtml(summaryText) : "";
  const meta = a.meta ? escapeHtml(a.meta) : "";
  const time = formatDate(a.publishedAt);
  const sourceLabel = showSource && a.source ? escapeHtml(a.source) : "";
  const metaLine = [sourceLabel, time].filter(Boolean).join(" · ");
  // News-style summary label for finance/politics, project-intro style for GH/tech.
  const newsy = a.category === "finance" || a.category === "politics";
  const summaryLabel = newsy ? STR.summaryLabelNews : STR.summaryLabelIntro;
  return `<article class="article">
  <h3 class="article-title"><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a></h3>
  ${meta ? `<p class="article-stats">${meta}</p>` : ""}
  ${metaLine ? `<p class="article-meta">${metaLine}</p>` : ""}
  ${excerptHtml ? `<p class="article-excerpt">${excerptHtml}</p>` : ""}
  ${summary ? `<p class="article-summary"><span class="summary-label">${summaryLabel}</span> ${summary}</p>` : ""}
</article>`;
}

function renderSourceContent(
  category: Category,
  subId: string,
  source: SourceGroup,
  isActive: boolean,
): string {
  const showSource = source.merged === true;
  return `<div class="source-content${isActive ? " active" : ""}" data-source-content="${escapeHtml(source.sourceId)}" data-sub="${escapeHtml(subId)}" data-cat="${category}">
    ${source.items.length === 0 ? `<p class="empty">${STR.emptySource}</p>` : source.items.map((a) => renderArticleHtml(a, showSource)).join("\n")}
  </div>`;
}

function renderSourceTabs(
  category: Category,
  subId: string,
  sources: SourceGroup[],
): string {
  // Single-source L2s (X 推文 / GitHub Trending) skip the L3 row — the L2 tab
  // label already identifies the dataset. L3 only earns its row when there
  // are ≥2 sources to switch between (e.g. 社区讨论 V2EX vs LinuxDo).
  if (sources.length < 2) return "";
  return `<nav class="source-tabs">${sources
    .map(
      (s, i) =>
        `<button class="source-tab${i === 0 ? " active" : ""}" data-source="${escapeHtml(s.sourceId)}" data-sub="${escapeHtml(subId)}" data-cat="${category}">${escapeHtml(s.sourceName)}<span class="count">${s.items.length}</span></button>`,
    )
    .join("")}</nav>`;
}

function renderSubContent(
  category: Category,
  sub: SubGroup,
  isActive: boolean,
  report?: DailyReport,
): string {
  const xStockSummary =
    category === "finance" && sub.id === "x-posts" && report
      ? renderStockSummaryTable(report)
      : "";
  const xEvidenceTitle =
    category === "finance" && sub.id === "x-posts"
      ? `<h2 class="selected-section-heading selected-evidence-heading">${REPORT_LOCALE === "en" ? "Source Feed" : "原文追踪"}</h2>`
      : "";
  return `<div class="sub-content${isActive ? " active" : ""}" data-sub-content="${escapeHtml(sub.id)}" data-cat="${category}">
    ${xStockSummary}
    ${renderSourceTabs(category, sub.id, sub.sources)}
    ${xEvidenceTitle}
    <div class="source-contents">
      ${sub.sources.map((s, i) => renderSourceContent(category, sub.id, s, i === 0)).join("\n")}
    </div>
  </div>`;
}

function renderRawCategoryPanel(
  category: Category,
  subs: SubGroup[],
  report?: DailyReport,
): string {
  if (subs.length === 0) {
    return `<p class="empty">${STR.emptyCategory}</p>`;
  }
  if (subs.length === 1) {
    return renderSubContent(category, subs[0], true, report);
  }
  const subTabs = subs
    .map((s, i) => {
      const count = s.sources.reduce((n, src) => n + src.items.length, 0);
      return `<button class="sub-tab${i === 0 ? " active" : ""}" data-sub="${escapeHtml(s.id)}" data-cat="${category}">${escapeHtml(s.name)}<span class="count">${count}</span></button>`;
    })
    .join("");
  const panels = subs
    .map((s, i) => renderSubContent(category, s, i === 0, report))
    .join("\n");
  return `<nav class="sub-tabs">${subTabs}</nav>\n<div class="sub-contents">${panels}</div>`;
}

type StockTableRow = {
  symbol: string;
  company?: string;
  source: string;
  url?: string;
  view: string;
  target: string;
  thesis: string;
};

function stockRows(report: DailyReport): StockTableRow[] {
  const rows: StockTableRow[] = [];
  for (const h of report.stock_highlights ?? []) {
    rows.push({
      symbol: h.symbol,
      company: localizedCompany(h.symbol, h.company),
      source: localizedSourceLabel(h.source),
      url: h.url,
      view: h.view,
      target: h.target_price || h.reference_price || STR.stockNotMentioned,
      thesis: h.thesis,
    });
  }

  return rows.filter((r) => r.symbol && r.thesis);
}

function uniqueStockSymbols(rows: StockTableRow[]): Set<string> {
  return new Set(rows.map((r) => r.symbol.toUpperCase()));
}

function matchingSymbols(rows: StockTableRow[], candidates: string[]): string {
  const symbols = uniqueStockSymbols(rows);
  const matches = candidates.filter((s) => symbols.has(s));
  return (matches.length > 0 ? matches : candidates.slice(0, 4)).join(", ");
}

function selectedCoreThesis(rows: StockTableRow[]): string {
  if (REPORT_LOCALE === "en") {
    return "The latest Selected view is rotating from raw AI compute into scarce chokepoints: optical interconnects, CPO lasers, physical-AI components, and upstream infrastructure where small supply constraints can reprice quickly.";
  }
  const symbols = uniqueStockSymbols(rows);
  const focus: string[] = [];
  if (["AAOI", "SIVE", "LITE", "COHR", "AVGO", "SOI", "XFAB"].some((s) => symbols.has(s))) {
    focus.push("光互连/CPO");
  }
  if (["688017", "RPI"].some((s) => symbols.has(s))) {
    focus.push("Physical AI 与机器人零部件");
  }
  if (["NBIS", "GOOGL", "META", "AMZN", "MSFT", "AVGO"].some((s) => symbols.has(s))) {
    focus.push("AI 基建资本开支");
  }
  if (["RDDT", "COIN", "HOOD", "CRCL"].some((s) => symbols.has(s))) {
    focus.push("被低估的平台/交易弹性");
  }
  const focusText = focus.length > 0 ? focus.join("、") : "AI 上游稀缺瓶颈";
  return `最新 Selected 观点继续围绕“未被充分定价的 chokepoint”展开，焦点从单纯算力扩展到 ${focusText}。阅读顺序建议先看赛道轮动，再看个股催化，最后回到原帖核对证据。`;
}

function selectedSector(row: StockTableRow): { label: string; tone: string } {
  const symbol = row.symbol.toUpperCase();
  const text = `${row.company ?? ""} ${row.thesis}`;
  if (/AAOI|SIVE|LITE|COHR|CIEN|AVGO|MRVL|POET|SOI|XFAB|GFS|JBL/.test(symbol) || /光|CPO|互连|硅光|laser|photon/i.test(text)) {
    return { label: REPORT_LOCALE === "en" ? "Optical / CPO" : "光互连/CPO", tone: "blue" };
  }
  if (/688017|RPI|TSLA|UBTECH|FIGURE/.test(symbol) || /机器人|physical AI|humanoid|robot/i.test(text)) {
    return { label: REPORT_LOCALE === "en" ? "Physical AI" : "Physical AI", tone: "purple" };
  }
  if (/NBIS|NVDA|TSM|GOOGL|META|AMZN|MSFT|MU/.test(symbol) || /算力|云|capex|AI 基建/i.test(text)) {
    return { label: REPORT_LOCALE === "en" ? "AI Infra" : "AI 基建", tone: "green" };
  }
  if (/RDDT|COIN|HOOD|CRCL/.test(symbol)) {
    return { label: REPORT_LOCALE === "en" ? "Platform / Beta" : "平台/交易弹性", tone: "orange" };
  }
  return { label: REPORT_LOCALE === "en" ? "Watchlist" : "观察名单", tone: "slate" };
}

function selectedCatalystBadge(row: StockTableRow): { label: string; tone: string } {
  const text = `${row.view} ${row.target} ${row.thesis}`;
  if (/目标|target|PT|\$|\d+%|倍|triple|double/i.test(text)) {
    return { label: REPORT_LOCALE === "en" ? "Repricing" : "重估", tone: "green" };
  }
  if (/风险|看空|short|bear|下行/i.test(text)) {
    return { label: REPORT_LOCALE === "en" ? "Risk" : "风险", tone: "orange" };
  }
  if (/政策|CHIPS|法案|capex|订单|earnings|营收|需求/i.test(text)) {
    return { label: REPORT_LOCALE === "en" ? "Catalyst" : "催化", tone: "blue" };
  }
  return { label: REPORT_LOCALE === "en" ? "Signal" : "信号", tone: stockViewTone(row.view) === "bull" ? "green" : "slate" };
}

function renderSelectedTimeline(rows: StockTableRow[]): string {
  const symbols = uniqueStockSymbols(rows);
  const stages = [
    {
      period: "2023-24",
      title: REPORT_LOCALE === "en" ? "Compute / HBM" : "算力/HBM",
      tickers: matchingSymbols(rows, ["NVDA", "TSM", "MU", "SMCI"]),
      note: REPORT_LOCALE === "en" ? "validated" : "已验证",
      state: "done",
    },
    {
      period: "2025-26",
      title: REPORT_LOCALE === "en" ? "Optical Interconnect" : "光互连",
      tickers: matchingSymbols(rows, ["AAOI", "LITE", "COHR", "CIEN", "AVGO"]),
      note: REPORT_LOCALE === "en" ? "repricing now" : "正在重估",
      state: "active",
    },
    {
      period: "2026-27",
      title: REPORT_LOCALE === "en" ? "Physical AI" : "Physical AI/机器人",
      tickers: matchingSymbols(rows, ["688017", "RPI", "TSLA", "UBTECH"]),
      note: symbols.has("688017") || symbols.has("RPI") ? (REPORT_LOCALE === "en" ? "new signal" : "最新增量") : (REPORT_LOCALE === "en" ? "watch" : "观察"),
      state: symbols.has("688017") || symbols.has("RPI") ? "active" : "watch",
    },
    {
      period: "2027+",
      title: REPORT_LOCALE === "en" ? "CPO / Materials" : "CPO/材料",
      tickers: matchingSymbols(rows, ["SIVE", "SOI", "XFAB", "POET", "GFS"]),
      note: REPORT_LOCALE === "en" ? "institutional buildout" : "机构潜伏期",
      state: "future",
    },
  ];
  return `<section class="selected-block">
    <h2 class="selected-section-heading">${REPORT_LOCALE === "en" ? "Rotation Timeline" : "赛道轮动时间轴"}</h2>
    <div class="selected-timeline">
      ${stages
        .map(
          (stage) => `<article class="selected-timeline-card ${stage.state}">
        <span class="timeline-period">${escapeHtml(stage.period)}</span>
        <h3>${escapeHtml(stage.title)}</h3>
        <p class="timeline-tickers">${escapeHtml(stage.tickers)}</p>
        <p class="timeline-note">${escapeHtml(stage.note)}</p>
      </article>`,
        )
        .join("")}
    </div>
  </section>`;
}

function renderSelectedSignalCards(rows: StockTableRow[]): string {
  const cards = rows.slice(0, 6);
  if (cards.length === 0) return "";
  return `<section class="selected-block">
    <h2 class="selected-section-heading">${REPORT_LOCALE === "en" ? "Key Signals" : "关键信号"}</h2>
    <div class="selected-signal-grid">
      ${cards
        .map((row) => {
          const sector = selectedSector(row);
          const badge = selectedCatalystBadge(row);
          const symbol = escapeHtml(row.symbol);
          const symbolHtml = row.url
            ? `<a href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer">${symbol}</a>`
            : symbol;
          const title = [symbolHtml, row.company ? escapeHtml(row.company) : ""]
            .filter(Boolean)
            .join(" · ");
          return `<article class="selected-signal-card tone-${sector.tone}">
        <div class="signal-card-head">
          <span class="signal-tag">${escapeHtml(sector.label)}</span>
          <span class="signal-badge badge-${badge.tone}">${escapeHtml(badge.label)}</span>
        </div>
        <h3>${title}</h3>
        <p>${escapeHtml(row.thesis)}</p>
        <div class="signal-meta">
          ${renderStockView(row.view)}
          <span>${escapeHtml(row.target)}</span>
        </div>
      </article>`;
        })
        .join("")}
    </div>
  </section>`;
}

function renderSelectedMatrix(rows: StockTableRow[]): string {
  if (rows.length === 0) return "";
  const body = rows
    .map((r) => {
      const symbol = escapeHtml(r.symbol);
      const symbolHtml = r.url
        ? `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">${symbol}</a>`
        : symbol;
      const company = r.company
        ? `<span class="stock-company">${escapeHtml(r.company)}</span>`
        : "";
      return `<tr>
        <td class="stock-symbol-cell" data-label="${STR.stockSymbol}"><div class="stock-cell-value">${symbolHtml}${company}</div></td>
        <td class="stock-view-cell" data-label="${STR.stockView}"><div class="stock-cell-value">${renderStockView(r.view)}</div></td>
        <td class="stock-target-cell" data-label="${STR.stockTarget}"><div class="stock-cell-value">${escapeHtml(r.target)}</div></td>
        <td class="stock-thesis-cell" data-label="${STR.stockThesis}"><div class="stock-cell-value">${escapeHtml(r.thesis)}</div></td>
      </tr>`;
    })
    .join("");

  return `<section class="selected-block selected-matrix">
    <h2 class="selected-section-heading">${REPORT_LOCALE === "en" ? "Structured View Matrix" : "结构化观点矩阵"}</h2>
    <div class="stock-table-wrap">
      <table class="stock-table">
        <thead>
          <tr>
            <th>${STR.stockSymbol}</th>
            <th>${STR.stockView}</th>
            <th>${STR.stockTarget}</th>
            <th>${STR.stockThesis}</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </section>`;
}

function renderSelectedChokepoints(rows: StockTableRow[]): string {
  const groups = [
    {
      label: REPORT_LOCALE === "en" ? "Optical / CPO" : "光互连/CPO",
      tickers: matchingSymbols(rows, ["AAOI", "SIVE", "LITE", "COHR", "AVGO", "SOI", "XFAB"]),
      note:
        REPORT_LOCALE === "en"
          ? "800G/1.6T demand and CPO laser scarcity remain the highest-signal bottleneck cluster."
          : "800G/1.6T 需求与 CPO 激光供给稀缺仍是最高密度的瓶颈组合。",
    },
    {
      label: REPORT_LOCALE === "en" ? "AI Capex" : "AI 资本开支",
      tickers: matchingSymbols(rows, ["GOOGL", "META", "AMZN", "MSFT", "AVGO", "NBIS"]),
      note:
        REPORT_LOCALE === "en"
          ? "Hyperscaler capex visibility pushes demand upstream into networking, optical modules, and neocloud capacity."
          : "超大厂 capex 可见度继续向上游传导，带动网络、光模块与新云基建容量重估。",
    },
    {
      label: REPORT_LOCALE === "en" ? "Physical AI" : "Physical AI",
      tickers: matchingSymbols(rows, ["688017", "RPI", "TSLA", "UBTECH"]),
      note:
        REPORT_LOCALE === "en"
          ? "Humanoid and robotics components are becoming the next physical-AI chokepoint map."
          : "人形机器人零部件开始进入 Selected 观察核心，重点是量产后单机 BOM 占比与供应链控制力。",
    },
    {
      label: REPORT_LOCALE === "en" ? "Platform Mispricing" : "平台错价",
      tickers: matchingSymbols(rows, ["RDDT", "COIN", "HOOD", "CRCL"]),
      note:
        REPORT_LOCALE === "en"
          ? "High-growth platforms and trading beta appear when narrative and fundamentals temporarily diverge."
          : "当叙事与基本面短期错位时，高增长平台和交易弹性标的会被重新纳入观察。",
    },
  ];
  return `<section class="selected-block">
    <h2 class="selected-section-heading">${REPORT_LOCALE === "en" ? "Chokepoint Map" : "产业链 Chokepoint 追踪"}</h2>
    <div class="selected-chokepoints">
      ${groups
        .map(
          (group) => `<article class="chokepoint-row">
        <div class="chokepoint-label">${escapeHtml(group.label)}</div>
        <div class="chokepoint-tickers">${escapeHtml(group.tickers)}</div>
        <div class="chokepoint-note">${escapeHtml(group.note)}</div>
      </article>`,
        )
        .join("")}
    </div>
  </section>`;
}

function renderStockSummaryTable(report: DailyReport): string {
  const rows = stockRows(report);
  if (rows.length === 0) return "";

  return `<section class="stock-summary selected-intel">
    <div class="selected-hero">
      <div>
        <span class="selected-kicker">${REPORT_LOCALE === "en" ? "Selected Intelligence" : "精选情报 Selected Intelligence"}</span>
        <h2>${STR.stockSummaryTitle}</h2>
        <p>${escapeHtml(selectedCoreThesis(rows))}</p>
      </div>
      <div class="selected-hero-stats">
        <span><strong>${rows.length}</strong>${REPORT_LOCALE === "en" ? "signals" : "条信号"}</span>
        <span><strong>${matchingSymbols(rows, ["AAOI", "SIVE", "LITE", "AVGO"])}</strong>${REPORT_LOCALE === "en" ? "active cluster" : "活跃主线"}</span>
      </div>
    </div>
    ${renderSelectedTimeline(rows)}
    ${renderSelectedSignalCards(rows)}
    ${renderSelectedChokepoints(rows)}
    ${renderSelectedMatrix(rows)}
  </section>`;
}

// ----- top-level renderer -----

export function renderHtml(
  report: DailyReport,
  raw: RawByCategory,
  date: string,
): string {
  const trading = report.trading;

  // Split tech raw subgroups: "tech" L1 panel (github-trending + ai-news)
  // vs. "community" L1 panel (cn-community). Keeps the registry simple
  // (V2EX/LinuxDo still live under category=tech) while exposing the
  // forums as their own top-level tab per UX preference.
  const techMainSubs = raw.tech.filter((s) => TECH_MAIN_SUBS.has(s.id));
  const techCommunitySubs = raw.tech.filter((s) => TECH_COMMUNITY_SUBS.has(s.id));
  const selectedSubs = raw.finance.filter((s) => SELECTED_FINANCE_SUBS.has(s.id));
  const financeNewsSubs = raw.finance.filter((s) => !SELECTED_FINANCE_SUBS.has(s.id));

  const sumItems = (subs: SubGroup[]) =>
    subs.reduce(
      (n, sg) => n + sg.sources.reduce((m, s) => m + s.items.length, 0),
      0,
    );
  const counts = {
    selected: sumItems(selectedSubs),
    tech: sumItems(techMainSubs),
    finance: sumItems(financeNewsSubs),
    politics: sumItems(raw.politics),
    community: sumItems(techCommunitySubs),
  };

  return `<!doctype html>
<html lang="${REPORT_LOCALE === "en" ? "en" : "zh-CN"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${STR.siteTitle} · ${date}</title>
<style>
  :root {
    --bg: #f6f7f9;
    --bg-elevated: #ffffff;
    --fg: #171717;
    --fg-soft: #3d4351;
    --muted: #737987;
    --rule: #dde2ea;
    --card: #eef1f5;
    --link: #2563eb;
    --accent: #111827;
    --accent-fg: #ffffff;
    --selected: #0f766e;
    --selected-soft: #d9f4ef;
    --shadow-soft: 0 10px 28px rgba(15, 23, 42, 0.08);
    --rank-high-bg: #fee2e2;
    --rank-high-fg: #991b1b;
    --rank-mid-bg: #fef3c7;
    --rank-mid-fg: #92400e;
    --rank-low-bg: #e0e7ff;
    --rank-low-fg: #3730a3;
    --hero-grad-from: #fafaf9;
    --hero-grad-to: #f4f4f5;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0a0a0a;
      --bg-elevated: #18181b;
      --fg: #fafafa;
      --fg-soft: #d4d4d8;
      --muted: #a1a1aa;
      --rule: #27272a;
      --card: #18181b;
      --link: #93c5fd;
      --accent: #fafafa;
      --accent-fg: #0a0a0a;
      --selected: #5eead4;
      --selected-soft: rgba(20, 184, 166, 0.16);
      --shadow-soft: 0 12px 30px rgba(0, 0, 0, 0.28);
      --rank-high-bg: rgba(239,68,68,0.18);
      --rank-high-fg: #fca5a5;
      --rank-mid-bg: rgba(245,158,11,0.18);
      --rank-mid-fg: #fcd34d;
      --rank-low-bg: rgba(99,102,241,0.18);
      --rank-low-fg: #a5b4fc;
      --hero-grad-from: #18181b;
      --hero-grad-to: #0a0a0a;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
      "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 960px; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }

  /* ===== header ===== */
  header.report-header { margin-bottom: 1.25rem; }
  .eyebrow {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: var(--muted);
    font-weight: 500;
  }
  h1.report-title {
    font-size: 2.2rem;
    font-weight: 700;
    margin: 0.4rem 0 1.2rem;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .title-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin: 0.4rem 0 1.2rem;
  }
  .title-row h1.report-title { margin: 0; }
  .weather-pill {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    min-height: 2.45rem;
    padding: 0.46rem 0.7rem;
    border: 1px solid var(--rule);
    border-radius: 0.5rem;
    background: var(--bg-elevated);
    box-shadow: 0 5px 16px rgba(15, 23, 42, 0.06);
    color: var(--fg-soft);
    font-size: 0.82rem;
    white-space: nowrap;
  }
  .weather-icon { font-size: 1.25rem; line-height: 1; }
  .weather-city,
  .weather-temp {
    color: var(--fg);
    font-weight: 700;
  }
  .weather-condition { color: var(--fg-soft); }
  .weather-muted { color: var(--muted); }
  .weather-aqi {
    padding: 0.12rem 0.38rem;
    border-radius: 0.35rem;
    font-size: 0.75rem;
    font-weight: 700;
  }
  .aqi-good { background: rgba(22, 163, 74, 0.13); color: #166534; }
  .aqi-moderate { background: rgba(217, 119, 6, 0.15); color: #92400e; }
  .aqi-sensitive { background: rgba(234, 88, 12, 0.16); color: #9a3412; }
  .aqi-unhealthy,
  .aqi-hazardous { background: rgba(220, 38, 38, 0.14); color: #991b1b; }
  .archive-link {
    display: inline-block;
    margin-bottom: 1rem;
    font-size: 0.85rem;
    color: var(--muted);
    text-decoration: none;
    border-bottom: 1px dashed var(--rule);
    padding-bottom: 1px;
  }
  .archive-link:hover { color: var(--accent); border-bottom-style: solid; }
  .hero-card {
    background: linear-gradient(135deg, var(--hero-grad-from) 0%, var(--hero-grad-to) 100%);
    border: 1px solid var(--rule);
    border-left: 4px solid var(--accent);
    padding: 1rem 1.4rem;
    border-radius: 0.6rem;
  }
  .hero-eyebrow {
    font-size: 0.7rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 500;
  }
  .hero-headline {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0.35rem 0 0;
    line-height: 1.45;
    color: var(--fg);
  }
  .overview-card {
    margin: 0.7rem 0 0;
    padding: 0.7rem 1.1rem;
    background: var(--card);
    border-radius: 0.5rem;
    border-left: 3px solid var(--muted);
  }
  .overview-card .eyebrow { display: block; margin-bottom: 0.3rem; }
  .overview-text {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.65;
    color: var(--fg-soft);
  }

  /* ===== earnings radar ===== */
  .earnings-radar {
    margin: 0 0 1rem;
    padding: 1rem 1.15rem;
    border: 1px solid var(--rule);
    border-left: 4px solid #2563eb;
    border-radius: 0.55rem;
    background: var(--bg-elevated);
    box-shadow: var(--shadow-soft);
  }
  .earnings-radar-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.9rem;
    margin-bottom: 0.85rem;
  }
  .earnings-radar-head h2 {
    margin: 0.22rem 0 0;
    font-size: 1rem;
    line-height: 1.35;
    color: var(--fg);
  }
  .earnings-health {
    flex-shrink: 0;
    padding: 0.18rem 0.5rem;
    border: 1px solid var(--rule);
    border-radius: 999px;
    color: var(--muted);
    background: var(--card);
    font-size: 0.72rem;
    font-weight: 650;
  }
  .earnings-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
  }
  .earnings-card {
    min-width: 0;
    padding: 0.78rem 0.85rem;
    border: 1px solid var(--rule);
    border-radius: 0.5rem;
    background: var(--bg);
  }
  .earnings-card-head,
  .earnings-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .earnings-card-head {
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }
  .earnings-date {
    color: var(--fg);
    font-size: 0.82rem;
    font-weight: 750;
    font-variant-numeric: tabular-nums;
  }
  .earnings-time,
  .earnings-status {
    padding: 0.12rem 0.42rem;
    border-radius: 0.35rem;
    background: var(--card);
    color: var(--muted);
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 1.35;
  }
  .earnings-status.confirmed { color: #166534; background: rgba(22, 163, 74, 0.12); }
  .earnings-status.estimated { color: #92400e; background: rgba(217, 119, 6, 0.14); }
  .earnings-card h2 {
    margin: 0;
    color: var(--fg);
    font-size: 0.96rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .earnings-meta {
    margin: 0.35rem 0 0.45rem;
    color: var(--muted);
    font-size: 0.74rem;
  }
  .earnings-expectation {
    margin: 0;
    color: var(--fg-soft);
    font-size: 0.82rem;
    line-height: 1.55;
  }
  .earnings-expectation span {
    display: inline-block;
    margin-right: 0.38rem;
    color: var(--muted);
    font-size: 0.68rem;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .earnings-source {
    display: inline-block;
    margin-top: 0.5rem;
    color: var(--link);
    font-size: 0.76rem;
    text-decoration: none;
  }
  .earnings-source:hover { text-decoration: underline; }
  .earnings-empty {
    margin: 0;
    color: var(--muted);
    font-size: 0.86rem;
  }
  @media (prefers-color-scheme: dark) {
    .earnings-status.confirmed { color: #4ade80; }
    .earnings-status.estimated { color: #fcd34d; }
  }

  /* ===== primary tabs ===== */
  .tabs {
    display: flex;
    gap: 0.35rem;
    margin: 1.25rem 0 0.75rem;
    padding: 0.35rem;
    background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
    border: 1px solid var(--rule);
    border-radius: 0.5rem;
    box-shadow: var(--shadow-soft);
    flex-wrap: wrap;
    position: sticky;
    top: 0.5rem;
    z-index: 10;
    backdrop-filter: blur(14px);
  }
  .tab {
    background: none;
    border: none;
    padding: 0.6rem 0.95rem;
    font-size: 0.92rem;
    font-weight: 650;
    color: var(--muted);
    cursor: pointer;
    border-radius: 0.4rem;
    font-family: inherit;
    transition: background 0.15s, color 0.15s, transform 0.15s;
  }
  .tab:hover { color: var(--fg); background: var(--card); }
  .tab.active {
    color: var(--accent-fg);
    background: var(--accent);
    transform: translateY(-1px);
  }
  .tab[data-tab="selected"] { color: var(--selected); }
  .tab[data-tab="selected"].active {
    color: #ffffff;
    background: var(--selected);
  }
  .tab .count {
    font-size: 0.72rem;
    margin-left: 0.4rem;
    font-weight: 400;
    opacity: 0.72;
  }
  .panel { display: none; }
  .panel.active { display: block; }

  /* ===== digest (AI 简报) — compact ===== */
  .digest-category { margin-bottom: 1.1rem; }
  .category-header {
    display: flex;
    align-items: baseline;
    gap: 0.55rem;
    margin: 0 0 0.55rem;
    padding-bottom: 0.35rem;
    border-bottom: 1px solid var(--rule);
  }
  .category-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--fg);
    margin: 0;
    letter-spacing: 0.05em;
  }
  .category-count {
    font-size: 0.7rem;
    color: var(--muted);
    background: var(--card);
    padding: 0.12rem 0.45rem;
    border-radius: 999px;
  }
  .brief-list {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }
  @media (min-width: 720px) {
    .brief-list { grid-template-columns: 1fr 1fr; }
  }
  .brief {
    background: var(--bg-elevated);
    border: 1px solid var(--rule);
    border-radius: 0.5rem;
    padding: 0.7rem 0.95rem;
    transition: border-color 0.15s, transform 0.15s;
  }
  .brief:hover {
    border-color: var(--muted);
    transform: translateY(-1px);
  }
  .brief-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    margin-bottom: 0.3rem;
  }
  .brief-source {
    font-size: 0.72rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 500;
  }
  .brief-rank {
    font-size: 0.7rem;
    padding: 0.12rem 0.5rem;
    border-radius: 999px;
    font-weight: 600;
    flex-shrink: 0;
  }
  .brief-rank.high { background: var(--rank-high-bg); color: var(--rank-high-fg); }
  .brief-rank.mid  { background: var(--rank-mid-bg);  color: var(--rank-mid-fg); }
  .brief-rank.low  { background: var(--rank-low-bg);  color: var(--rank-low-fg); }
  .brief-title {
    font-size: 0.98rem;
    font-weight: 600;
    margin: 0 0 0.3rem;
    line-height: 1.35;
  }
  .brief-title a { color: var(--fg); text-decoration: none; }
  .brief-title a:hover { color: var(--link); text-decoration: underline; }
  .brief-summary {
    margin: 0;
    color: var(--fg-soft);
    font-size: 0.86rem;
    line-height: 1.55;
  }

  .editor-card {
    background: var(--card);
    border-left: 3px solid var(--muted);
    border-radius: 0.5rem;
    padding: 1rem 1.3rem;
    margin: 1.5rem 0 1.2rem;
  }
  .editor-card .eyebrow { display: block; margin-bottom: 0.4rem; }
  .editor-text {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.7;
    color: var(--fg);
  }
  .keywords { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0 0 1.5rem; }
  .keyword {
    background: var(--card);
    color: var(--fg-soft);
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    font-size: 0.8rem;
  }

  /* ===== Selected intelligence ===== */
  .stock-summary {
    margin: 0.9rem 0 1.35rem;
  }
  .selected-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1.2rem;
    align-items: end;
    padding: 1rem 1.15rem;
    background: var(--bg-elevated);
    border: 1px solid var(--rule);
    border-left: 4px solid var(--selected);
    border-radius: 0.55rem;
    box-shadow: var(--shadow-soft);
  }
  .selected-kicker {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.35rem;
    color: var(--selected);
    font-size: 0.72rem;
    font-weight: 750;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .selected-kicker::before { content: "📌"; letter-spacing: 0; }
  .selected-hero h2 {
    margin: 0;
    font-size: 1.22rem;
    line-height: 1.25;
    letter-spacing: 0;
  }
  .selected-hero p {
    margin: 0.55rem 0 0;
    color: var(--fg-soft);
    font-size: 0.92rem;
    line-height: 1.7;
  }
  .selected-hero-stats {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.45rem;
    min-width: 9.5rem;
  }
  .selected-hero-stats span {
    display: block;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--rule);
    border-radius: 0.45rem;
    background: var(--card);
    color: var(--muted);
    font-size: 0.72rem;
    line-height: 1.35;
  }
  .selected-hero-stats strong {
    display: block;
    margin-bottom: 0.08rem;
    color: var(--fg);
    font-size: 0.96rem;
    font-weight: 750;
    overflow-wrap: anywhere;
  }
  .selected-block {
    margin-top: 1.05rem;
  }
  .selected-section-heading {
    margin: 0 0 0.7rem;
    padding-left: 0.7rem;
    border-left: 4px solid var(--selected);
    color: var(--fg);
    font-size: 0.92rem;
    font-weight: 750;
    letter-spacing: 0;
  }
  .selected-evidence-heading { margin-top: 1.25rem; }
  .selected-timeline {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.65rem;
  }
  .selected-timeline-card {
    min-width: 0;
    padding: 0.75rem 0.8rem;
    background: var(--bg-elevated);
    border: 1px solid var(--rule);
    border-top: 4px solid var(--rule);
    border-radius: 0.5rem;
  }
  .selected-timeline-card.done { border-top-color: #64748b; }
  .selected-timeline-card.active {
    border-top-color: #16a34a;
    background: color-mix(in srgb, #dcfce7 46%, var(--bg-elevated));
  }
  .selected-timeline-card.future {
    border-top-color: #7c3aed;
    background: color-mix(in srgb, #ede9fe 42%, var(--bg-elevated));
  }
  .selected-timeline-card.watch {
    border-top-color: #d97706;
    background: color-mix(in srgb, #fef3c7 36%, var(--bg-elevated));
  }
  .timeline-period {
    color: var(--muted);
    font-size: 0.68rem;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .selected-timeline-card h3 {
    margin: 0.2rem 0 0.2rem;
    font-size: 0.9rem;
    line-height: 1.25;
  }
  .timeline-tickers {
    margin: 0;
    color: var(--fg);
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: 0.76rem;
    overflow-wrap: anywhere;
  }
  .timeline-note {
    margin: 0.25rem 0 0;
    color: var(--muted);
    font-size: 0.72rem;
  }
  .selected-signal-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }
  .selected-signal-card {
    min-width: 0;
    padding: 0.95rem;
    border: 1px solid var(--rule);
    border-left: 4px solid var(--selected);
    border-radius: 0.55rem;
    background: var(--bg-elevated);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
  }
  .selected-signal-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  }
  .selected-signal-card.tone-blue { border-left-color: #2563eb; }
  .selected-signal-card.tone-green { border-left-color: #16a34a; }
  .selected-signal-card.tone-orange { border-left-color: #d97706; }
  .selected-signal-card.tone-purple { border-left-color: #7c3aed; }
  .selected-signal-card.tone-slate { border-left-color: #64748b; }
  .signal-card-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
    margin-bottom: 0.55rem;
  }
  .signal-tag,
  .signal-badge {
    display: inline-flex;
    align-items: center;
    min-height: 1.35rem;
    padding: 0.16rem 0.46rem;
    border-radius: 0.35rem;
    font-size: 0.7rem;
    font-weight: 750;
    line-height: 1.25;
  }
  .signal-tag {
    color: #1d4ed8;
    background: rgba(37, 99, 235, 0.1);
  }
  .signal-badge.badge-green { color: #166534; background: rgba(22, 163, 74, 0.12); }
  .signal-badge.badge-blue { color: #1d4ed8; background: rgba(37, 99, 235, 0.12); }
  .signal-badge.badge-orange { color: #92400e; background: rgba(217, 119, 6, 0.14); }
  .signal-badge.badge-slate { color: #334155; background: rgba(100, 116, 139, 0.13); }
  .selected-signal-card h3 {
    margin: 0;
    font-size: 1rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .selected-signal-card h3 a {
    color: var(--fg);
    text-decoration: none;
  }
  .selected-signal-card h3 a:hover { color: var(--link); text-decoration: underline; }
  .selected-signal-card p {
    margin: 0.55rem 0 0;
    color: var(--fg-soft);
    font-size: 0.86rem;
    line-height: 1.62;
  }
  .signal-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
    margin-top: 0.75rem;
    padding-top: 0.65rem;
    border-top: 1px dashed var(--rule);
    color: var(--muted);
    font-size: 0.76rem;
  }
  .selected-chokepoints {
    background: var(--bg-elevated);
    border: 1px solid var(--rule);
    border-radius: 0.55rem;
    overflow: hidden;
  }
  .chokepoint-row {
    display: grid;
    grid-template-columns: 7.2rem 12rem minmax(0, 1fr);
    gap: 0.8rem;
    align-items: center;
    padding: 0.75rem 0.9rem;
    border-bottom: 1px solid var(--rule);
  }
  .chokepoint-row:last-child { border-bottom: none; }
  .chokepoint-label {
    font-size: 0.84rem;
    font-weight: 750;
    color: var(--fg);
  }
  .chokepoint-tickers {
    color: var(--link);
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: 0.8rem;
    overflow-wrap: anywhere;
  }
  .chokepoint-note {
    color: var(--fg-soft);
    font-size: 0.82rem;
    line-height: 1.55;
  }
  .selected-matrix .stock-table-wrap {
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }
  .stock-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--rule);
    border-radius: 0.5rem;
    background: var(--bg-elevated);
  }
  .stock-table {
    width: 100%;
    min-width: 720px;
    border-collapse: collapse;
    font-size: 0.82rem;
    line-height: 1.45;
  }
  .stock-table th {
    text-align: left;
    color: var(--muted);
    background: var(--card);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid var(--rule);
    white-space: nowrap;
  }
  .stock-table td {
    vertical-align: top;
    padding: 0.58rem 0.6rem;
    border-bottom: 1px solid var(--rule);
    color: var(--fg-soft);
  }
  .stock-table tbody tr:hover td { background: color-mix(in srgb, var(--selected-soft) 48%, transparent); }
  .stock-table tr:last-child td { border-bottom: none; }
  .stock-symbol-cell {
    min-width: 7rem;
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-weight: 700;
    color: var(--fg);
  }
  .stock-symbol-cell a { color: var(--fg); text-decoration: none; }
  .stock-symbol-cell a:hover { color: var(--link); text-decoration: underline; }
  .stock-company {
    display: block;
    margin-top: 0.15rem;
    font-family: inherit;
    font-weight: 400;
    font-size: 0.74rem;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .stock-cell-value { min-width: 0; overflow-wrap: anywhere; }
  .stock-source-cell { min-width: 8.8rem; color: var(--muted); }
  .stock-view-cell { min-width: 7rem; color: var(--fg); }
  .stock-view-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    max-width: 100%;
    padding: 0.18rem 0.48rem;
    border-radius: 0.4rem;
    font-weight: 700;
    line-height: 1.35;
  }
  .stock-view-badge.view-bull { background: rgba(22, 163, 74, 0.12); color: #166534; }
  .stock-view-badge.view-bear { background: rgba(220, 38, 38, 0.12); color: #991b1b; }
  .stock-view-badge.view-watch { background: rgba(100, 116, 139, 0.14); color: #334155; }
  .stock-view-badge.view-neutral { background: var(--card); color: var(--fg-soft); }
  @media (prefers-color-scheme: dark) {
    .aqi-good,
    .stock-view-badge.view-bull { color: #4ade80; }
    .aqi-moderate,
    .aqi-sensitive { color: #fcd34d; }
    .aqi-unhealthy,
    .aqi-hazardous,
    .stock-view-badge.view-bear { color: #fca5a5; }
    .stock-view-badge.view-watch { color: #cbd5e1; }
  }
  .stock-target-cell {
    min-width: 7.5rem;
    font-variant-numeric: tabular-nums;
    color: var(--fg);
  }
  .stock-thesis-cell { min-width: 18rem; }
  @media (prefers-color-scheme: dark) {
    .selected-timeline-card.active { background: rgba(22, 163, 74, 0.12); }
    .selected-timeline-card.future { background: rgba(124, 58, 237, 0.14); }
    .selected-timeline-card.watch { background: rgba(217, 119, 6, 0.13); }
    .signal-tag,
    .signal-badge.badge-blue { color: #93c5fd; }
    .signal-badge.badge-green { color: #4ade80; }
    .signal-badge.badge-orange { color: #fcd34d; }
    .signal-badge.badge-slate { color: #cbd5e1; }
  }

  /* ===== L2 sub-tabs ===== */
  .sub-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 1rem 0;
  }
  .sub-tab {
    background: var(--card);
    border: 1px solid var(--rule);
    padding: 0.5rem 1.05rem;
    border-radius: 0.5rem;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--fg-soft);
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }
  .sub-tab:hover { border-color: var(--muted); color: var(--fg); }
  .sub-tab.active {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }
  .sub-tab .count {
    font-size: 0.7rem;
    opacity: 0.75;
    margin-left: 0.4rem;
    font-weight: 400;
  }
  .sub-content { display: none; }
  .sub-content.active { display: block; }

  /* ===== L3 source-tabs ===== */
  .source-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0.9rem 0 1.3rem;
    padding-bottom: 0.7rem;
    border-bottom: 1px solid var(--rule);
  }
  .source-tab {
    background: none;
    border: 1px solid var(--rule);
    padding: 0.35rem 0.85rem;
    border-radius: 999px;
    font-size: 0.83rem;
    color: var(--fg-soft);
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }
  .source-tab:hover { border-color: var(--muted); color: var(--fg); }
  .source-tab.active {
    background: var(--fg);
    color: var(--bg);
    border-color: var(--fg);
  }
  .source-tab .count {
    font-size: 0.7rem;
    opacity: 0.75;
    margin-left: 0.3rem;
  }
  .source-content { display: none; }
  .source-content.active { display: block; }

  /* ===== article cards in raw panels ===== */
  .article {
    padding: 1rem;
    border: 1px solid var(--rule);
    border-radius: 0.5rem;
    background: var(--bg-elevated);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    margin-bottom: 0.75rem;
    transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  }
  .article:hover {
    border-color: color-mix(in srgb, var(--selected) 42%, var(--rule));
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
    transform: translateY(-1px);
  }
  .article:last-child { margin-bottom: 0; }
  .article-title {
    font-size: 1rem;
    margin: 0 0 0.3rem;
    font-weight: 500;
    line-height: 1.45;
  }
  .article-title a { color: var(--fg); text-decoration: none; }
  .article-title a:hover { color: var(--link); text-decoration: underline; }
  .article-meta { color: var(--muted); font-size: 0.76rem; margin: 0 0 0.35rem; }
  .article-stats {
    color: var(--muted);
    font-size: 0.8rem;
    margin: 0 0 0.4rem;
    font-feature-settings: "tnum";
  }
  .article-excerpt {
    margin: 0;
    color: var(--fg-soft);
    font-size: 0.9rem;
    line-height: 1.6;
  }
  .article-summary {
    margin: 0.55rem 0 0;
    padding: 0.6rem 0.85rem;
    background: var(--card);
    border-left: 2px solid var(--link);
    border-radius: 0.3rem;
    font-size: 0.9rem;
    line-height: 1.6;
    color: var(--fg);
  }
  .summary-label {
    display: inline-block;
    font-size: 0.68rem;
    color: var(--link);
    margin-right: 0.4rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .empty {
    color: var(--muted);
    text-align: center;
    padding: 2rem 0;
    font-size: 0.9rem;
  }

  /* ===== trading panel ===== */
  .crypto-widgets {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.55rem;
    margin: 0.4rem 0 1.2rem;
  }
  @media (min-width: 720px) {
    .crypto-widgets { grid-template-columns: repeat(4, 1fr); }
  }
  .crypto-widget {
    background: var(--bg-elevated);
    border: 1px solid var(--rule);
    border-radius: 0.5rem;
    padding: 0.7rem 0.85rem;
    text-align: center;
  }
  .widget-label {
    font-size: 0.7rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 0.3rem;
  }
  .widget-value {
    font-size: 1.5rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--fg);
    line-height: 1.1;
  }
  .widget-sub {
    font-size: 0.78rem;
    color: var(--muted);
    margin-top: 0.25rem;
  }
  .widget-sub.positive { color: #16a34a; }
  .widget-sub.negative { color: #dc2626; }
  @media (prefers-color-scheme: dark) {
    .widget-sub.positive { color: #4ade80; }
    .widget-sub.negative { color: #fca5a5; }
  }
  .crypto-widget.fg-fear-extreme { border-left: 4px solid #b91c1c; }
  .crypto-widget.fg-fear-extreme .widget-value { color: #b91c1c; }
  .crypto-widget.fg-fear { border-left: 4px solid #d97706; }
  .crypto-widget.fg-fear .widget-value { color: #d97706; }
  .crypto-widget.fg-neutral { border-left: 4px solid var(--muted); }
  .crypto-widget.fg-greed { border-left: 4px solid #65a30d; }
  .crypto-widget.fg-greed .widget-value { color: #65a30d; }
  .crypto-widget.fg-greed-extreme { border-left: 4px solid #16a34a; }
  .crypto-widget.fg-greed-extreme .widget-value { color: #16a34a; }
  @media (prefers-color-scheme: dark) {
    .crypto-widget.fg-fear-extreme .widget-value,
    .crypto-widget.fg-fear .widget-value { color: #fca5a5; }
    .crypto-widget.fg-greed .widget-value,
    .crypto-widget.fg-greed-extreme .widget-value { color: #4ade80; }
  }

  .trading-overview-card {
    margin: 0 0 1.5rem;
    padding: 1rem 1.3rem;
    background: var(--card);
    border-radius: 0.5rem;
    border-left: 3px solid var(--accent);
  }
  .trading-overview-card .eyebrow { display: block; margin-bottom: 0.4rem; }
  .trading-overview-text { font-size: 0.92rem; line-height: 1.75; color: var(--fg-soft); margin: 0; }

  .trading-section-title {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 1.5rem 0 0.8rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--rule);
    color: var(--fg);
    letter-spacing: 0.05em;
  }

  /* picks (Sonnet's watchlist) */
  .trading-picks {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.6rem;
  }
  @media (min-width: 720px) {
    .trading-picks { grid-template-columns: 1fr 1fr; }
  }
  .trading-pick {
    background: var(--bg-elevated);
    border: 1px solid var(--rule);
    border-left: 4px solid var(--muted);
    border-radius: 0.5rem;
    padding: 0.8rem 1rem;
  }
  .trading-pick.stance-bull { border-left-color: #16a34a; }
  .trading-pick.stance-bear { border-left-color: #dc2626; }
  .trading-pick.stance-neutral { border-left-color: var(--muted); }
  .pick-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    margin-bottom: 0.45rem;
  }
  .pick-symbol-block {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .pick-symbol { font-weight: 700; font-size: 1rem; color: var(--fg); }
  .pick-name { color: var(--muted); font-size: 0.82rem; }
  .pick-stance {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    white-space: nowrap;
  }
  .pick-stance-bull { background: rgba(22,163,74,0.12); color: #16a34a; }
  .pick-stance-bear { background: rgba(220,38,38,0.12); color: #dc2626; }
  .pick-stance-neutral { background: var(--card); color: var(--muted); }
  .pick-rationale { margin: 0; font-size: 0.88rem; line-height: 1.65; color: var(--fg-soft); }

  /* asset-group tabs */
  .trading-group-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0.6rem 0 1.2rem;
  }
  .trading-group-tab {
    background: var(--card);
    border: 1px solid transparent;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.88rem;
    font-weight: 500;
    color: var(--fg-soft);
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }
  .trading-group-tab:hover { border-color: var(--muted); color: var(--fg); }
  .trading-group-tab.active {
    background: var(--accent);
    color: var(--accent-fg);
  }
  .trading-group-tab .count {
    font-size: 0.7rem;
    opacity: 0.75;
    margin-left: 0.4rem;
    font-weight: 400;
  }
  .trading-group-content { display: none; }
  .trading-group-content.active { display: block; }

  /* ticker cards */
  .ticker-card {
    background: var(--bg-elevated);
    border: 1px solid var(--rule);
    border-radius: 0.55rem;
    padding: 0.85rem 1.1rem;
    margin-bottom: 0.7rem;
  }
  .ticker-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.65rem;
  }
  .ticker-id { min-width: 0; }
  .ticker-symbol { margin: 0; font-size: 1rem; font-weight: 700; font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; }
  .ticker-name { margin: 0.15rem 0 0; font-size: 0.82rem; color: var(--muted); }
  .ticker-price-block { text-align: right; flex-shrink: 0; }
  .ticker-price { display: block; font-size: 1.05rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  .ticker-pct { display: inline-block; font-size: 0.82rem; font-weight: 500; margin-top: 0.15rem; font-variant-numeric: tabular-nums; }
  .ticker-pct.positive, .positive { color: #16a34a; }
  .ticker-pct.negative, .negative { color: #dc2626; }

  .ticker-indicators {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.35rem 0.9rem;
    margin: 0;
    font-size: 0.82rem;
    color: var(--fg-soft);
  }
  @media (min-width: 720px) {
    .ticker-indicators { grid-template-columns: repeat(3, 1fr); }
  }
  .ticker-indicators > div { display: flex; gap: 0.4rem; align-items: baseline; min-width: 0; }
  .ticker-indicators dt { color: var(--muted); font-size: 0.74rem; margin: 0; white-space: nowrap; }
  .ticker-indicators dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 500; color: var(--fg); }
  .trend-bullish { color: #16a34a; }
  .trend-bearish { color: #dc2626; }
  .trend-neutral { color: var(--muted); }
  .rsi-overbought { color: #d97706; }
  .rsi-oversold { color: #2563eb; }

  .ticker-signals {
    margin-top: 0.65rem;
    padding-top: 0.55rem;
    border-top: 1px dashed var(--rule);
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .signal-pill {
    font-size: 0.72rem;
    padding: 0.18rem 0.55rem;
    border-radius: 999px;
    font-weight: 500;
  }
  .signal-pill.tone-bull { background: rgba(22,163,74,0.13); color: #166534; }
  .signal-pill.tone-bear { background: rgba(220,38,38,0.13); color: #991b1b; }
  .signal-pill.tone-caution { background: rgba(217,119,6,0.15); color: #92400e; }
  @media (prefers-color-scheme: dark) {
    .signal-pill.tone-bull { color: #4ade80; }
    .signal-pill.tone-bear { color: #fca5a5; }
    .signal-pill.tone-caution { color: #fcd34d; }
    .trend-bullish, .positive, .ticker-pct.positive { color: #4ade80; }
    .trend-bearish, .negative, .ticker-pct.negative { color: #fca5a5; }
    .rsi-overbought { color: #fcd34d; }
    .rsi-oversold { color: #93c5fd; }
    .trading-pick.stance-bull { border-left-color: #4ade80; }
    .trading-pick.stance-bear { border-left-color: #fca5a5; }
    .pick-stance-bull { background: rgba(74,222,128,0.15); color: #4ade80; }
    .pick-stance-bear { background: rgba(252,165,165,0.15); color: #fca5a5; }
  }
  .signal-age { opacity: 0.7; font-weight: 400; }

  .trading-risk {
    margin: 1.5rem 0 0;
    padding: 0.9rem 1.2rem;
    background: var(--card);
    border-radius: 0.45rem;
    border-left: 3px solid #d97706;
  }
  .trading-risk .eyebrow { display: block; margin-bottom: 0.35rem; }
  .trading-risk p { margin: 0; font-size: 0.82rem; line-height: 1.65; color: var(--fg-soft); }

  @media (max-width: 680px) {
    main { padding: 2rem 1rem 3rem; }
    h1.report-title { font-size: 2.35rem; }
    .title-row {
      align-items: flex-start;
      gap: 0.7rem;
      margin-bottom: 1rem;
    }
    .weather-pill {
      width: 100%;
      justify-content: flex-start;
      flex-wrap: wrap;
      row-gap: 0.28rem;
      white-space: normal;
    }
    .earnings-radar { padding: 0.9rem; }
    .earnings-radar-head {
      display: block;
      margin-bottom: 0.75rem;
    }
    .earnings-radar-head h2 { font-size: 0.95rem; }
    .earnings-health {
      display: inline-block;
      margin-top: 0.45rem;
    }
    .earnings-grid { grid-template-columns: 1fr; }
    .tabs {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.28rem;
      top: 0.35rem;
      margin-top: 1rem;
    }
    .tab {
      width: 100%;
      padding: 0.58rem 0.35rem;
      font-size: 0.84rem;
      text-align: center;
      white-space: nowrap;
    }
    .tab .count { display: block; margin: 0.1rem 0 0; font-size: 0.68rem; }
    .selected-hero {
      grid-template-columns: 1fr;
      gap: 0.8rem;
      padding: 0.9rem;
    }
    .selected-hero h2 { font-size: 1.08rem; }
    .selected-hero p { font-size: 0.88rem; }
    .selected-hero-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      min-width: 0;
    }
    .selected-timeline {
      display: flex;
      overflow-x: auto;
      padding-bottom: 0.15rem;
      scroll-snap-type: x proximity;
    }
    .selected-timeline-card {
      min-width: 11.2rem;
      scroll-snap-align: start;
    }
    .selected-signal-grid {
      grid-template-columns: 1fr;
      gap: 0.65rem;
    }
    .selected-signal-card { padding: 0.85rem; }
    .signal-card-head { align-items: flex-start; }
    .chokepoint-row {
      grid-template-columns: 1fr;
      gap: 0.25rem;
      padding: 0.8rem;
    }
    .chokepoint-tickers { font-size: 0.78rem; }
    .stock-table-wrap {
      overflow: visible;
      border: none;
      background: transparent;
    }
    .stock-table {
      min-width: 0;
      display: block;
      font-size: 0.86rem;
    }
    .stock-table thead { display: none; }
    .stock-table tbody,
    .stock-table tr,
    .stock-table td {
      display: block;
      width: 100%;
    }
    .stock-table tr {
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--rule);
    }
    .stock-table tr:first-child { padding-top: 0; }
    .stock-table tr:last-child { border-bottom: none; padding-bottom: 0; }
    .stock-table td {
      border-bottom: none;
      padding: 0.22rem 0;
      display: grid;
      grid-template-columns: 5.5rem minmax(0, 1fr);
      gap: 0.65rem;
      align-items: start;
    }
    .stock-table td::before {
      content: attr(data-label);
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 650;
      letter-spacing: 0.04em;
    }
    .stock-symbol-cell,
    .stock-source-cell,
    .stock-view-cell,
    .stock-target-cell,
    .stock-thesis-cell {
      min-width: 0;
    }
    .article {
      padding: 0.85rem;
      margin-bottom: 0.65rem;
    }
    .article-title { font-size: 0.96rem; }
    .article-excerpt,
    .article-summary { font-size: 0.86rem; }
    .ticker-head { gap: 0.7rem; }
    .ticker-indicators { grid-template-columns: 1fr; }
  }

  footer {
    margin-top: 2.5rem;
    border-top: 1px solid var(--rule);
    padding-top: 1.1rem;
    color: var(--muted);
    font-size: 0.82rem;
  }
</style>
</head>
<body>
<main>
  <header class="report-header">
    <span class="eyebrow">${STR.siteTitle}</span>
    <div class="title-row">
      <h1 class="report-title">${date}</h1>
      ${renderWeatherPill(report)}
    </div>
    ${process.env.WEB_MODE === "true" ? `<a class="archive-link" href="../archive.html">${STR.archiveLink}</a>` : ""}
  </header>

  ${renderEarningsCalendarHtml(report)}

  <nav class="tabs" role="tablist">
    <button class="tab active" data-tab="selected">${STR.catSelected}<span class="count">${counts.selected}</span></button>
    <button class="tab" data-tab="tech">${CATEGORY_LABELS.tech}<span class="count">${counts.tech}</span></button>
    ${trading ? `<button class="tab" data-tab="trading">${STR.catTrading}<span class="count">${trading.tickers.length}</span></button>` : ""}
    <button class="tab" data-tab="politics">${CATEGORY_LABELS.politics}<span class="count">${counts.politics}</span></button>
    <button class="tab" data-tab="finance">${CATEGORY_LABELS.finance}<span class="count">${counts.finance}</span></button>
    ${techCommunitySubs.length > 0 ? `<button class="tab" data-tab="community">${STR.catCommunity}<span class="count">${counts.community}</span></button>` : ""}
  </nav>

  <section class="panel active" data-panel="selected">
    ${renderRawCategoryPanel("finance", selectedSubs, report)}
  </section>
  <section class="panel" data-panel="tech">
    ${renderRawCategoryPanel("tech", techMainSubs)}
  </section>
  ${trading ? `<section class="panel" data-panel="trading">${renderTradingPanel(trading)}</section>` : ""}
  <section class="panel" data-panel="politics">
    ${renderRawCategoryPanel("politics", raw.politics)}
  </section>
  <section class="panel" data-panel="finance">
    ${renderRawCategoryPanel("finance", financeNewsSubs)}
  </section>
  ${techCommunitySubs.length > 0 ? `<section class="panel" data-panel="community">
    ${renderRawCategoryPanel("tech", techCommunitySubs)}
  </section>` : ""}

  <footer>
    ${STR.footer}
  </footer>
</main>
<script>
  document.querySelectorAll('.tabs > .tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = btn.dataset.tab;
      document.querySelectorAll('.tabs > .tab').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      document.querySelectorAll('.panel').forEach(function (p) {
        p.classList.toggle('active', p.dataset.panel === target);
      });
    });
  });
  // Scope sub-tab / source-tab toggles to the parent .panel so two L1 panels
  // can share the same data-cat (e.g. tech main + community both data-cat=tech)
  // without stomping on each other's active state.
  document.querySelectorAll('.sub-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var panel = btn.closest('.panel');
      if (!panel) return;
      var sub = btn.dataset.sub;
      panel.querySelectorAll('.sub-tab').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      panel.querySelectorAll('.sub-content').forEach(function (p) {
        p.classList.toggle('active', p.dataset.subContent === sub);
      });
    });
  });
  document.querySelectorAll('.source-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var subContent = btn.closest('.sub-content');
      if (!subContent) return;
      var src = btn.dataset.source;
      subContent.querySelectorAll('.source-tab').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      subContent.querySelectorAll('.source-content').forEach(function (p) {
        p.classList.toggle('active', p.dataset.sourceContent === src);
      });
    });
  });
  // Trading panel: asset-group sub-tabs (US/crypto/china/commodity)
  document.querySelectorAll('.trading-group-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var grp = btn.dataset.group;
      document.querySelectorAll('.trading-group-tab').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      document.querySelectorAll('.trading-group-content').forEach(function (p) {
        p.classList.toggle('active', p.dataset.group === grp);
      });
    });
  });
</script>
</body>
</html>`;
}

// ----- trading panel -----

const SIGNAL_TONE: Record<string, "bull" | "bear" | "caution"> = {
  "golden-cross": "bull",
  "macd-bull-cross": "bull",
  "above-sma50-sma200": "bull",
  "near-52w-high": "bull",
  "death-cross": "bear",
  "macd-bear-cross": "bear",
  "below-sma50-sma200": "bear",
  "near-52w-low": "bear",
  "rsi-overbought": "caution",
  "rsi-oversold": "caution",
};

const TREND_LABEL: Record<TickerAnalysis["trend"], string> = {
  bullish: STR.trendBullish,
  bearish: STR.trendBearish,
  neutral: STR.trendNeutral,
};

function stanceClass(stance: string): "bull" | "bear" | "neutral" {
  // Supports both legacy ("看多"/"看空") and current ("偏上行"/"偏下行")
  // stance values. The current values were chosen to avoid Sonnet's
  // "no investment advice" guardrail; rendering keeps both readable.
  if (/多|涨|上行|bull/i.test(stance)) return "bull";
  if (/空|跌|下行|bear/i.test(stance)) return "bear";
  return "neutral";
}

function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  // Use thousand separators only for prices >= 1000
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toFixed(dp).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n.toFixed(dp);
}

function fmtPct(n: number, dp = 2): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(dp)}%`;
}

function renderPickCard(p: WatchlistPick): string {
  const cls = stanceClass(p.stance);
  const symbol = escapeHtml(p.symbol);
  const name = escapeHtml(p.display_name ?? p.symbol);
  const stance = escapeHtml(p.stance);
  const rationale = escapeHtml(p.rationale ?? "");
  return `<article class="trading-pick stance-${cls}">
    <header class="pick-head">
      <div class="pick-symbol-block">
        <span class="pick-symbol">${symbol}</span>
        <span class="pick-name">${name}</span>
      </div>
      <span class="pick-stance pick-stance-${cls}">${stance}</span>
    </header>
    <p class="pick-rationale">${rationale}</p>
  </article>`;
}

function renderTickerCard(t: TickerAnalysis): string {
  const trendCls = t.trend;
  const priceCls = t.pct1Day >= 0 ? "positive" : "negative";
  const pct5Cls = t.pct5Day >= 0 ? "positive" : "negative";
  const signals = t.signals
    .map((s) => {
      const tone = SIGNAL_TONE[s.type] ?? "caution";
      const ageSuffix =
        s.daysAgo !== undefined
          ? ` <span class="signal-age">(${s.daysAgo === 0 ? STR.signalToday : `${s.daysAgo} ${STR.signalDaysAgoSuffix}`})</span>`
          : "";
      return `<span class="signal-pill tone-${tone}">${escapeHtml(s.label)}${ageSuffix}</span>`;
    })
    .join("");
  const currencyPrefix = t.currency === "USD" ? "$" : t.currency === "HKD" ? "HK$" : t.currency === "CNY" ? "¥" : "";
  return `<article class="ticker-card">
    <header class="ticker-head">
      <div class="ticker-id">
        <h3 class="ticker-symbol">${escapeHtml(t.symbol)}</h3>
        <p class="ticker-name">${escapeHtml(t.displayName)}</p>
      </div>
      <div class="ticker-price-block">
        <span class="ticker-price">${currencyPrefix}${fmtNum(t.currentPrice)}</span>
        <span class="ticker-pct ${priceCls}">${fmtPct(t.pct1Day)}</span>
      </div>
    </header>
    <dl class="ticker-indicators">
      <div><dt>${STR.ticker5d}</dt><dd class="${pct5Cls}">${fmtPct(t.pct5Day)}</dd></div>
      <div><dt>${STR.tickerVs52wHigh}</dt><dd>${fmtPct(t.pct52WeekHigh, 1)}</dd></div>
      <div><dt>RSI(14)</dt><dd class="rsi-${t.rsiState}">${fmtNum(t.rsi14, 1)}</dd></div>
      <div><dt>${STR.tickerTrend}</dt><dd class="trend-${trendCls}">${TREND_LABEL[t.trend]}</dd></div>
      <div><dt>SMA 20 / 50 / 200</dt><dd>${fmtNum(t.sma20)} / ${fmtNum(t.sma50)} / ${fmtNum(t.sma200)}</dd></div>
      <div><dt>${STR.tickerMacd}</dt><dd>${fmtNum(t.macd, 3)} / ${fmtNum(t.macdSignal, 3)}</dd></div>
    </dl>
    ${signals ? `<div class="ticker-signals">${signals}</div>` : ""}
  </article>`;
}

function fearGreedTone(value: number): "fear-extreme" | "fear" | "neutral" | "greed" | "greed-extreme" {
  if (value <= 24) return "fear-extreme";
  if (value <= 44) return "fear";
  if (value <= 55) return "neutral";
  if (value <= 74) return "greed";
  return "greed-extreme";
}

function fmtBigUsd(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)} T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)} B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)} M`;
  return `$${n.toFixed(0)}`;
}

function renderCryptoWidgets(t: TradingSection): string {
  const fg = t.crypto_fear_greed;
  const cg = t.crypto_global;
  if (!fg && !cg) return "";
  const items: string[] = [];
  if (fg) {
    const tone = fearGreedTone(fg.value);
    items.push(`<div class="crypto-widget fg-${tone}">
      <div class="widget-label">${STR.widgetCryptoFearGreed}</div>
      <div class="widget-value">${fg.value}</div>
      <div class="widget-sub">${escapeHtml(fg.classificationCn)}</div>
    </div>`);
  }
  if (cg) {
    const tone = cg.marketCapChangePct24h >= 0 ? "positive" : "negative";
    items.push(`<div class="crypto-widget">
      <div class="widget-label">${STR.widgetCryptoCap}</div>
      <div class="widget-value">${fmtBigUsd(cg.totalMarketCapUsd)}</div>
      <div class="widget-sub ${tone}">${fmtPct(cg.marketCapChangePct24h)} / 24h</div>
    </div>`);
    items.push(`<div class="crypto-widget">
      <div class="widget-label">${STR.widgetBtcDom}</div>
      <div class="widget-value">${cg.btcDominance.toFixed(1)}%</div>
      <div class="widget-sub">ETH ${cg.ethDominance.toFixed(1)}%</div>
    </div>`);
    items.push(`<div class="crypto-widget">
      <div class="widget-label">${STR.widgetVolume24h}</div>
      <div class="widget-value">${fmtBigUsd(cg.total24hVolumeUsd)}</div>
      <div class="widget-sub">${STR.widgetActiveCoins} ${cg.activeCryptocurrencies.toLocaleString()}</div>
    </div>`);
  }
  return `<div class="crypto-widgets">${items.join("")}</div>`;
}

function renderTradingPanel(trading: TradingSection): string {
  const tickers = trading.tickers;
  const groupCounts: Record<AssetGroup, number> = {
    "us-equity": 0,
    crypto: 0,
    "china-equity": 0,
    "commodity-fx": 0,
    macro: 0,
  };
  for (const t of tickers) groupCounts[t.group as AssetGroup] = (groupCounts[t.group as AssetGroup] ?? 0) + 1;

  const groupTabs = ASSET_GROUP_ORDER.map(
    (g, i) =>
      `<button class="trading-group-tab${i === 0 ? " active" : ""}" data-group="${g}">${escapeHtml(ASSET_GROUP_LABELS_LOCALIZED[g])}<span class="count">${groupCounts[g] ?? 0}</span></button>`,
  ).join("");

  const groupPanels = ASSET_GROUP_ORDER.map((g, i) => {
    const groupTickers = tickers.filter((t) => t.group === g);
    // Crypto sub-tab carries an extra header widget panel (F&G + global stats)
    const cryptoWidgets =
      g === "crypto" ? renderCryptoWidgets(trading) : "";
    return `<div class="trading-group-content${i === 0 ? " active" : ""}" data-group="${g}">
      ${cryptoWidgets}
      ${groupTickers.length === 0 ? `<p class="empty">${STR.emptyGroup}</p>` : groupTickers.map(renderTickerCard).join("")}
    </div>`;
  }).join("");

  const overview = escapeHtml(trading.market_overview ?? "");
  const risk = escapeHtml(trading.risk_caveat ?? "");

  return `<section class="trading-overview-card">
    <span class="eyebrow">${STR.tradingMarketOverview}</span>
    <p class="overview-text trading-overview-text">${overview}</p>
  </section>

  ${
    trading.watchlist.length > 0
      ? `<section class="trading-watchlist">
    <h2 class="category-title trading-section-title">${STR.tradingTodayFocus}</h2>
    <div class="trading-picks">
      ${trading.watchlist.map(renderPickCard).join("\n")}
    </div>
  </section>`
      : ""
  }

  <section class="trading-tickers">
    <h2 class="category-title trading-section-title">${STR.tradingAllAssets}</h2>
    <nav class="trading-group-tabs">${groupTabs}</nav>
    <div class="trading-group-contents">${groupPanels}</div>
  </section>

  ${
    risk
      ? `<section class="trading-risk">
    <span class="eyebrow">${STR.tradingRiskCaveat}</span>
    <p>${risk}</p>
  </section>`
      : ""
  }`;
}

// ----- markdown -----

function renderBriefMarkdown(b: BriefItem): string {
  const importance = Number.isFinite(b.importance) ? b.importance : 0;
  return `### [${b.title}](${b.url})\n${b.source} · ${STR.mdImportance} ${importance}/10\n\n${b.summary}\n`;
}

function renderSectionMarkdown(title: string, briefs: BriefItem[]): string {
  if (briefs.length === 0) return "";
  return `## ${title}\n\n${briefs.map(renderBriefMarkdown).join("\n")}\n`;
}

function mdCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function renderEarningsCalendarMarkdown(report: DailyReport): string {
  const snapshot = report.earnings_calendar;
  if (!snapshot) return "";
  const title = `## ${STR.earningsTitle}\n\n${STR.earningsWindow}: ${snapshot.window_start} → ${snapshot.window_end}\n`;
  if (snapshot.events.length === 0) {
    return `${title}\n${STR.earningsEmpty}\n`;
  }
  const header = `| ${REPORT_LOCALE === "en" ? "Date" : "日期"} | ${REPORT_LOCALE === "en" ? "Company" : "公司"} | ${REPORT_LOCALE === "en" ? "Region" : "地区"} | ${REPORT_LOCALE === "en" ? "Time" : "时间"} | ${STR.earningsExpectation} | ${REPORT_LOCALE === "en" ? "Source" : "来源"} |\n|---|---|---|---|---|---|`;
  const body = snapshot.events
    .map((event) => {
      const source = `[${mdCell(event.source)}](${event.source_url})`;
      const expectation = earningsExpectationText(event);
      return `| ${mdCell(formatDateKeyShort(event.report_date))} | ${mdCell(earningsCompanyName(event))} | ${mdCell(earningsRegionLabel(event.region))} | ${mdCell(earningsTimingLabel(event.timing))} | ${mdCell(expectation)} | ${source} |`;
    })
    .join("\n");
  return `${title}\n${header}\n${body}\n`;
}

function renderXStockSummaryMarkdown(report: DailyReport): string {
  const rows = stockRows(report);
  if (rows.length === 0) return "";
  const header = `## ${STR.stockSummaryTitle}\n\n| ${STR.stockSymbol} | ${STR.stockSource} | ${STR.stockView} | ${STR.stockTarget} | ${STR.stockThesis} |\n|---|---|---|---|---|`;
  const body = rows
    .map((r) => {
      const symbol = r.url ? `[${mdCell(r.symbol)}](${r.url})` : mdCell(r.symbol);
      const company = r.company ? `<br>${mdCell(r.company)}` : "";
      return `| ${symbol}${company} | ${mdCell(r.source)} | ${stockViewEmoji(r.view)} ${mdCell(r.view)} | ${mdCell(r.target)} | ${mdCell(r.thesis)} |`;
    })
    .join("\n");
  return `${header}\n${body}\n`;
}

export function renderMarkdown(report: DailyReport, date: string): string {
  const blocks: string[] = [];
  blocks.push(`# ${STR.siteTitle} · ${date}\n`);
  if (report.weather) {
    const w = report.weather;
    const temp =
      w.temperature_min_c !== undefined &&
      w.temperature_max_c !== undefined &&
      w.temperature_min_c !== w.temperature_max_c
        ? `${w.temperature_min_c}-${w.temperature_max_c}°C`
        : `${w.temperature_c}°C`;
    blocks.push(
      `> ${w.city} ${w.emoji} ${w.condition} · ${temp}` +
        (w.apparent_temperature_c === undefined ? "" : ` · ${STR.weatherFeelsLike} ${w.apparent_temperature_c}°`) +
        (w.aqi === undefined ? "" : ` · ${STR.weatherAqi} ${w.aqi}${w.aqi_label ? ` ${w.aqi_label}` : ""}`) +
        `\n`,
    );
  }
  blocks.push(renderEarningsCalendarMarkdown(report));
  if (report.hero_headline) blocks.push(`> ${report.hero_headline}\n`);
  if (report.daily_overview) {
    blocks.push(`## ${STR.mdTodayOverview}\n\n${report.daily_overview}\n`);
  }
  blocks.push(renderXStockSummaryMarkdown(report));
  blocks.push(
    renderSectionMarkdown(CATEGORY_DIGEST_LABELS.tech, report.tech_briefs),
  );
  blocks.push(
    renderSectionMarkdown(
      CATEGORY_DIGEST_LABELS.finance,
      report.finance_briefs,
    ),
  );
  blocks.push(
    renderSectionMarkdown(
      CATEGORY_DIGEST_LABELS.politics,
      report.politics_briefs,
    ),
  );
  if (report.editor_note) {
    blocks.push(`## ${STR.mdEditorNote}\n\n${report.editor_note}\n`);
  }
  if (report.keywords.length > 0) {
    blocks.push(
      `## ${STR.mdTodayKeywords}\n\n${report.keywords.map((k) => `\`#${k}\``).join(" ")}\n`,
    );
  }
  return blocks.filter(Boolean).join("\n");
}
